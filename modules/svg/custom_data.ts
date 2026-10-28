import { throttle } from 'es-toolkit';
import type { Dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { geoBounds as d3_geoBounds, geoPath as d3_geoPath } from 'd3-geo';
import { select as d3_select } from 'd3-selection';
import stringify from 'fast-json-stable-stringify';
import type { Feature, FeatureCollection } from 'geojson';

import {
    customDataFormat,
    customDataLayers,
    isSelectable,
    matchesCustomDataFilter,
    type CustomDataLayer
} from '../renderer/custom_data_layers';
import { PROGRESS_REFRESH_MS, progressFeatureID, progressTracker, type ProgressTrackerID } from '../progress/tracker';
import { services } from '../services';
import { utilHashcode } from '../util';
import { svgPath } from './helpers';
import type { Projection } from '../geo/raw_mercator';

/** A GeoJSON feature with the ids that iD's data hover and select code expects */
type DataFeature = Feature & {
    __featurehash__: number;
    __layerID__?: string;
};

type GeoJSONCacheEntry = {
    url: string;
    /** `undefined` while loading */
    features?: DataFeature[];
};

type DataGroup = 'fill' | 'shadow' | 'casing' | 'stroke';

// `casing`: the done / not done colour around the lines of a layer with a progress tracker
const DATA_GROUPS: DataGroup[] = ['fill', 'shadow', 'casing', 'stroke'];

/** The features the main map drew last, per layer: the sidebar needs the layer and all pieces of a line */
const _drawn = new Map<string, DataFeature[]>();
const _layerOfFeature = new WeakMap<object, string>();

/** Bounds of a feature, kept: a GeoJSON layer has all its features in memory, most of them out of view */
const _bounds = new WeakMap<object, [[number, number], [number, number]]>();
function featureBounds(feature: DataFeature) {
    let bounds = _bounds.get(feature);
    if (!bounds) {
        bounds = d3_geoBounds(feature);
        _bounds.set(feature, bounds);
    }
    return bounds;
}

/** The custom data layer a feature of the map belongs to */
export function customDataLayerOfFeature(feature: object): CustomDataLayer | undefined {
    const layerID = _layerOfFeature.get(feature);
    return layerID ? customDataLayers.get(layerID) : undefined;
}

/**
 * The bounding box of all drawn pieces of the line with this id (vector tiles cut a line at
 * their borders), or undefined
 */
export function customDataLineBBox(layerID: string, featureID: string): [number, number, number, number] | undefined {
    const pieces = (_drawn.get(layerID) ?? []).filter(feature => progressFeatureID(feature.properties) === featureID);
    if (!pieces.length) return undefined;
    const bounds = pieces.map(featureBounds);
    return [
        Math.min(...bounds.map(b => b[0][0])), Math.min(...bounds.map(b => b[0][1])),
        Math.max(...bounds.map(b => b[1][0])), Math.max(...bounds.map(b => b[1][1]))
    ];
}


function isPolygon(d: DataFeature) {
    return d.geometry?.type === 'Polygon' || d.geometry?.type === 'MultiPolygon';
}

function featureKey(d: DataFeature) {
    return String(d.__featurehash__);
}

function clipPathID(d: DataFeature) {
    return `ideditor-custom-data-${d.__featurehash__}-clippath`;
}

function featureClasses(d: DataFeature) {
    return [
        'data' + d.__featurehash__,
        d.geometry?.type,
        isPolygon(d) ? 'area' : '',
        d.__layerID__ ?? ''
    ].filter(Boolean).join(' ');
}

function featureLabel(d: DataFeature): string | undefined {
    return d.properties?.desc ?? d.properties?.name;
}

function toDataFeatures(gj: FeatureCollection | Feature | undefined): DataFeature[] {
    if (!gj) return [];
    const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
    return features.map(feature => Object.assign(feature, {
        __featurehash__: utilHashcode(stringify(feature))
    }));
}


/**
 * Draws all enabled layers of `customDataLayers`, each in its own group and color.
 * Uses the same classes as the single custom data layer (`svgData`),
 * so hovering, selecting and the data inspector work the same way.
 *
 * `minimap`: a second instance for the minimap (`ui/map_in_map.js`), with its own projection.
 * It draws plain outlines and fills only: no labels, no shadows, and no clip paths
 * (those live in the main map's `defs` and belong to the main instance).
 */
export function svgCustomData(
    projection: Projection,
    context: iD.Context,
    dispatch: Dispatch<object>,
    options?: { minimap?: boolean }
) {
    const minimap = !!options?.minimap;
    const namespace = minimap ? 'svgCustomDataMinimap' : 'svgCustomData';
    // New data or marks change nothing in the OSM data: the main map draws its layers only, not
    // the OSM data (a full redraw takes far longer). The minimap's dispatch redraws just the minimap.
    const redrawData = () => minimap ? dispatch.call('change') : context.map().redrawLayers();
    const throttledRedraw = throttle(redrawData, 1000);
    const _geojson = new Map<string, GeoJSONCacheEntry>();
    let _vtService: typeof services.vectorTile | undefined;

    customDataLayers.on(`change.${namespace}`, () => dispatch.call('change'));

    const _trackersListenedTo = new Set<ProgressTrackerID>();
    /** The layer's tracker, redrawing when its marks change */
    function trackerOf(layer: CustomDataLayer) {
        if (!layer.tracker) return undefined;
        const tracker = progressTracker(context, layer.tracker);
        if (!_trackersListenedTo.has(layer.tracker)) {
            _trackersListenedTo.add(layer.tracker);
            tracker.on(`change.${namespace}`, redrawData);
            // the marks are loaded on draw; a map that stands still is drawn again from time to
            // time, so marks of other mappers show up without panning
            if (!minimap) {
                window.setInterval(() => {
                    if (customDataLayers.enabled().some(enabled => enabled.tracker) && !document.hidden) redrawData();
                }, PROGRESS_REFRESH_MS);
            }
        }
        return tracker;
    }


    function vectorTileService() {
        if (!_vtService && services.vectorTile) {
            _vtService = services.vectorTile;
            // `event` is added by `init()` and not part of the service type
            (_vtService as unknown as { event: Dispatch<object> }).event.on(`loadedData.${namespace}`, throttledRedraw);
        }
        return _vtService;
    }


    function geojsonFeatures(layer: CustomDataLayer) {
        const cached = _geojson.get(layer.id);
        if (cached?.url === layer.url) return cached.features ?? [];

        const entry: GeoJSONCacheEntry = { url: layer.url };
        _geojson.set(layer.id, entry);

        d3_json<FeatureCollection | Feature>(layer.url)
            .then(gj => {
                entry.features = toDataFeatures(gj);
            })
            .catch((err: unknown) => {
                entry.features = [];
                console.error(`custom data layer ${layer.url}:`, err);  // eslint-disable-line no-console
            })
            .finally(redrawData);

        return [];
    }


    function vectorTileFeatures(layer: CustomDataLayer): DataFeature[] {
        const service = vectorTileService();
        if (!service) return [];

        // the url is part of the id, so an edited url loads a new source
        const sourceID = `custom-data:${layer.id}:${layer.url}`;
        // The minimap shows the tiles the main map loaded. Loading tiles for its own, wider view
        // would abort the main map's requests (one source, one set of wanted tiles).
        if (minimap) return service.data(sourceID, context.projection);
        service.loadTiles(sourceID, layer.url, projection);
        return service.data(sourceID, projection);
    }


    /** The layer's features that pass its key/value filter */
    function layerFeatures(layer: CustomDataLayer) {
        const features = customDataFormat(layer.url) === 'geojson'
            ? geojsonFeatures(layer)
            : vectorTileFeatures(layer);
        return features.filter(feature => matchesCustomDataFilter(layer, feature.properties));
    }


    function drawCustomData(selection: d3.Selection<SVGGElement>) {
        const surface = context.surface();
        if (!surface || surface.empty()) return;  // not ready to draw yet, starting up

        let groups = selection.selectAll<SVGGElement, CustomDataLayer>('.layer-custom-data')
            .data(customDataLayers.enabled(), d => d.id);

        groups.exit()
            .remove();

        groups = groups.enter()
            .append('g')
            .attr('class', d => `layer-mapdata layer-custom-data layer-custom-data-${d.id}`)
            .merge(groups)
            .classed('not-selectable', d => !isSelectable(d))
            .style('--custom-data-color', d => d.color);

        // every feature is drawn as several paths (shadow, casing, stroke): project it once per draw
        const memo = (path: (d: DataFeature) => string | null) => {
            const paths = new Map<DataFeature, string | null>();
            return (d: DataFeature) => {
                let result = paths.get(d);
                if (result === undefined) {
                    result = path(d);
                    paths.set(d, result);
                }
                return result;
            };
        };
        const getPath = memo(svgPath(projection).geojson);
        const getAreaPath = memo(svgPath(projection, undefined, true).geojson);
        const allPolygons: DataFeature[] = [];

        // only what is in view (with the projection's own extent, the minimap's is wider)
        const [[west, south], [east, north]] = [projection.invert([0, 0]), projection.invert(projection.clipExtent()[1])]
            .reduce<[[number, number], [number, number]]>((box, loc) => [
                [Math.min(box[0][0], loc[0]), Math.min(box[0][1], loc[1])],
                [Math.max(box[1][0], loc[0]), Math.max(box[1][1], loc[1])]
            ], [[Infinity, Infinity], [-Infinity, -Infinity]]);
        const [clipWidth, clipHeight] = projection.clipExtent()[1];
        const inView = (feature: DataFeature) => {
            if (!clipWidth || !clipHeight) return true;   // no extent yet
            // d3 reads a polygon's winding on the sphere: the bounds of a mask (the world with a hole)
            // or of a ring in the other order are not what is on screen. Polygons are few, draw them all.
            if (isPolygon(feature)) return true;
            const [[minLon, minLat], [maxLon, maxLat]] = featureBounds(feature);
            // bounds that cross the antimeridian (`minLon > maxLon`) are always drawn
            return minLon > maxLon || (minLon <= east && maxLon >= west && minLat <= north && maxLat >= south);
        };

        groups.each(function(layer) {
            const features = layerFeatures(layer).filter(inView).filter(getPath);
            const polygons = features.filter(isPolygon);
            allPolygons.push(...polygons);

            const group = d3_select<SVGGElement, CustomDataLayer>(this);
            if (minimap) {
                drawPaths(group, { fill: polygons, shadow: [], casing: [], stroke: features }, getPath, getPath);
                return;
            }

            // progress tracking: a green (done) or red casing around every line with an id
            const tracker = trackerOf(layer);
            let tracked: DataFeature[] = [];
            if (tracker) {
                const [[minLon, minLat], [maxLon, maxLat]] = context.map().extent();
                // zoomed out too far to load the marks: no casings, else every line would look not done
                if (tracker.loadView([minLon, minLat, maxLon, maxLat])) {
                    tracked = features.filter(feature => !isPolygon(feature) && progressFeatureID(feature.properties));
                }
            }
            _drawn.set(layer.id, features);
            for (const feature of features) _layerOfFeature.set(feature, layer.id);

            drawPaths(group, { fill: polygons, shadow: features, casing: tracked, stroke: features }, getPath, getAreaPath);
            group.selectAll<SVGPathElement, DataFeature>('.datagroup-casing path')
                .classed('progress-done', d => !!tracker?.get(progressFeatureID(d.properties) ?? ''));
            drawLabels(group, 'label-halo', features);
            drawLabels(group, 'label', features);
        });

        if (!minimap) drawClipPaths(surface, allPolygons, getAreaPath);
    }


    function drawClipPaths(
        surface: d3.Selection,
        polygons: DataFeature[],
        getAreaPath: (d: DataFeature) => string | null
    ) {
        const clipPaths = surface.selectAll('defs')
            .selectAll<SVGClipPathElement, DataFeature>('.clipPath-custom-data')
            .data(polygons, featureKey);

        clipPaths.exit()
            .remove();

        clipPaths.enter()
            .append('clipPath')
            .attr('class', 'clipPath-custom-data')
            .attr('id', clipPathID)
            .call(enter => enter.append('path'))
            .merge(clipPaths)
            .select('path')
            .attr('d', getAreaPath);
    }


    function drawPaths(
        group: d3.Selection<SVGGElement>,
        pathData: Record<DataGroup, DataFeature[]>,
        getPath: (d: DataFeature) => string | null,
        getAreaPath: (d: DataFeature) => string | null
    ) {
        let datagroups = group.selectAll<SVGGElement, DataGroup>('g.datagroup')
            .data(DATA_GROUPS);

        datagroups = datagroups.enter()
            .append('g')
            .attr('class', d => `datagroup datagroup-${d}`)
            .merge(datagroups);

        datagroups.each(function(datagroup) {
            const paths = d3_select(this)
                .selectAll<SVGPathElement, DataFeature>('path')
                .data(pathData[datagroup], featureKey);

            paths.exit()
                .remove();

            paths.enter()
                .append('path')
                .attr('class', d => `pathdata ${datagroup} ${featureClasses(d)}`)
                .attr('clip-path', d => datagroup === 'fill' && !minimap ? `url(#${clipPathID(d)})` : null)
                .merge(paths)
                .attr('d', d => datagroup === 'fill' ? getAreaPath(d) : getPath(d));
        });
    }


    function drawLabels(group: d3.Selection<SVGGElement>, textClass: string, features: DataFeature[]) {
        const labelPath = d3_geoPath(projection);

        const labels = group.selectAll<SVGTextElement, DataFeature>(`text.${textClass}`)
            .data(features.filter(featureLabel), featureKey);

        labels.exit()
            .remove();

        labels.enter()
            .append('text')
            .attr('class', d => `${textClass} ${featureClasses(d)}`)
            .merge(labels)
            .text(d => featureLabel(d) ?? '')
            .attr('x', d => labelPath.centroid(d)[0] + 11)
            .attr('y', d => labelPath.centroid(d)[1]);
    }


    return drawCustomData;
}
