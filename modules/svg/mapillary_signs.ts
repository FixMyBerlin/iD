import { throttle } from 'es-toolkit';
import type { Dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { svgPointTransform } from './helpers';
import { services } from '../services';
import type { Projection } from '../geo/raw_mercator';
import type { MlyImage } from '../services/mapillary';
import type { coreContext } from '../core';
import { isSignValue, signMatchesGroups } from '../mapillary/sign_groups';
import { clearSelectedSign, selectedSign, selectMapillarySign, signSelectEvents } from '../mapillary/sign_select';


export function svgMapillarySigns(projection: Projection, context: coreContext, dispatch: Dispatch<object>) {
    const throttledRedraw = throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    let layer: d3.Selection<SVGGElement> = d3_select(null!);
    let _mapillary: typeof services.mapillary | null;


    function init() {
        if (svgMapillarySigns.initialized) return;  // run once
        svgMapillarySigns.enabled = false;
        svgMapillarySigns.initialized = true;
    }


    function getService() {
        if (services.mapillary && !_mapillary) {
            _mapillary = services.mapillary;
            _mapillary.event.on('loadedSigns', throttledRedraw);
        } else if (!services.mapillary && _mapillary) {
            _mapillary = null;
        }
        return _mapillary;
    }


    function showLayer() {
        const service = getService();
        if (!service) return;

        service.loadSignResources(context);
        editOn();
    }


    function hideLayer() {
        throttledRedraw.cancel();
        editOff();
    }


    function editOn() {
        layer.style('display', 'block');
    }


    function editOff() {
        layer.selectAll('.icon-sign').remove();
        layer.style('display', 'none');
    }


    // WORKDOC feature 26: load all images of the sign and show the best one, turned to the sign;
    // a click on the selected sign deselects it and keeps the image
    function click(d3_event: MouseEvent, d: MlyImage) {
        if (!getService()) return;
        // ids from the vector tiles are numbers
        if (selectedSign()?.id === String(d.id)) {
            clearSelectedSign();
            return;
        }
        selectMapillarySign(context, { id: String(d.id), value: d.value!, loc: d.loc });
    }


    /** Outlines in the viewer: signs of the chosen groups and the selected sign; other objects only with their layer */
    function outlineFilter(value: string, detectionID: string) {
        if (!isSignValue(value)) return context.layers().layer('mapillary-map-features')?.enabled() ?? false;
        const sign = selectedSign();
        if (sign?.imageId && sign.detections.get(sign.imageId) === detectionID) return true;
        return signMatchesGroups(value, context.photos().signGroups());
    }


    function filterData(detectedFeatures: MlyImage[]) {
        var fromDate = context.photos().fromDate();
        var toDate = context.photos().toDate();

        if (fromDate) {
            var fromTimestamp = new Date(fromDate).getTime();
            detectedFeatures = detectedFeatures.filter(function(feature) {
                return new Date(feature.last_seen_at!).getTime() >= fromTimestamp;
            });
        }
        if (toDate) {
            var toTimestamp = new Date(toDate).getTime();
            detectedFeatures = detectedFeatures.filter(function(feature) {
                return new Date(feature.first_seen_at!).getTime() <= toTimestamp;
            });
        }

        const groups = context.photos().signGroups();
        return detectedFeatures.filter(feature => signMatchesGroups(feature.value!, groups));
    }


    function update() {
        const service = getService();
        let data = (service ? service.signs(projection) : []);
        data = filterData(data);

        const transform = svgPointTransform(projection);

        const signs = layer.selectAll<SVGGElement, MlyImage>('.icon-sign')
            .data(data, function(d) { return d.id; });

        // exit
        signs.exit()
            .remove();

        // enter
        const enter = signs.enter()
            .append('g')
            .attr('class', 'icon-sign icon-detected')
            .on('click', click);

        enter
            .append('use')
            .attr('width', '24px')
            .attr('height', '24px')
            .attr('x', '-12px')
            .attr('y', '-12px')
            .attr('xlink:href', function(d) { return '#' + d.value; });

        enter
            .append('rect')
            .attr('width', '24px')
            .attr('height', '24px')
            .attr('x', '-12px')
            .attr('y', '-12px');

        // update
        const sign = selectedSign();
        const selectedID = sign?.id;

        // a dotted line from the shown image's marker (its GPS position) via Mapillary's computed
        // position (a small dot) to the selected sign (WORKDOC feature 26)
        const shownImage = sign?.imageId ? sign.days.flatMap(day => day.images).find(image => image.id === sign.imageId) : undefined;
        const points = sign && shownImage ? [shownImage.originalLoc ?? shownImage.loc, shownImage.loc, sign.loc].map(loc => projection(loc)) : [];

        const link = layer.selectAll<SVGPathElement, number>('.mapillary-sign-link')
            .data(points.length ? [0] : []);
        link.exit().remove();
        link.enter()
            .insert('path', ':first-child')
            .attr('class', 'mapillary-sign-link')
            .merge(link)
            .attr('d', `M${points.map(point => point.join(',')).join('L')}`);

        const computed = layer.selectAll<SVGCircleElement, number>('.mapillary-sign-computed')
            .data(points.length ? [0] : []);
        computed.exit().remove();
        computed.enter()
            .insert('circle', '.icon-sign')
            .attr('class', 'mapillary-sign-computed')
            .attr('r', 4)
            .merge(computed)
            .attr('cx', points[1]?.[0] ?? 0)
            .attr('cy', points[1]?.[1] ?? 0);

        signs
            .merge(enter)
            .classed('mly-sign-selected', d => String(d.id) === selectedID)
            .attr('transform', transform);
    }


    function drawSigns(selection: d3.Selection<SVGGElement>) {
        const enabled = svgMapillarySigns.enabled;
        const service = getService();

        layer = selection.selectAll<SVGGElement, 0>('.layer-mapillary-signs')
            .data(service ? [0] : []);

        layer.exit()
            .remove();

        layer = layer.enter()
            .append('g')
            .attr('class', 'layer-mapillary-signs layer-mapillary-detections')
            .style('display', enabled ? 'block' : 'none')
            .merge(layer);

        // redraw the selected sign's frame and line when the selection changes (also when the
        // layer was turned on from the URL, which does not go through `drawSigns.enabled`)
        signSelectEvents.on('change.mapillary_signs', enabled ? update : null);

        if (enabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                update();
                service.loadSigns(projection);
                service.showSignDetections(true);
                service.setOutlineFilter(outlineFilter);
            } else {
                editOff();
            }
        } else if (service) {
            service.showSignDetections(false);
            service.setOutlineFilter(null);
        }
    }


    drawSigns.enabled = function(_: boolean) {
        if (!arguments.length) return svgMapillarySigns.enabled;
        svgMapillarySigns.enabled = _;
        if (svgMapillarySigns.enabled) {
            showLayer();
            context.photos().on('change.mapillary_signs', update);
        } else {
            hideLayer();
            context.photos().on('change.mapillary_signs', null);
        }
        dispatch.call('change');
        return this;
    };


    drawSigns.supported = function() {
        return !!getService();
    };

    drawSigns.rendered = function(zoom: number) {
      return zoom >= minZoom;
    };


    init();
    return drawSigns;
}
svgMapillarySigns.initialized = false;
svgMapillarySigns.enabled = false;
