import { dispatch as d3_dispatch } from 'd3-dispatch';

import { patchHash } from '../behavior/hash';
import { prefs } from '../core/preferences';
import { utilStringQs } from '../util';
import { utilRebind } from '../util/rebind';

/**
 * Read-only feature categories: like the Map Features filters (`rendererFeatures`),
 * but instead of hiding a category it stays visible, muted, and cannot be
 * hovered, selected, lassoed or snapped to.
 * Uses the same category keys as the filters (`buildings`, `water`, `landuse`, …).
 *
 * State: URL hash `readonly_features=buildings,water` and pref `readonly-features`,
 * like `disable_features` / `disabled-features`.
 *
 * Events:
 *   'change' - the read-only categories changed
 */

const HASH_KEY = 'readonly_features';
const PREF_KEY = 'readonly-features';

type Entity = iD.OsmEntity;
type Graph = iD.Graph;
type Features = {
    getMatches(entity: Entity, graph: Graph, geometry: string): Record<string, unknown>;
};


function parseKeys(value: string | null | undefined) {
    return new Set((value ?? '').replace(/;/g, ',').split(',').map(key => key.trim()).filter(Boolean));
}


function createReadOnlyFeatures() {
    const dispatch = d3_dispatch('change');

    // the URL wins over the stored preference, like for `disable_features`
    const hashValue = utilStringQs(window.location.hash)[HASH_KEY];
    let _keys = parseKeys(typeof hashValue === 'string' ? hashValue : prefs(PREF_KEY));
    /** entity → read-only, cleared when the data or the categories change */
    let _cache = new WeakMap<Entity, boolean>();

    function update() {
        const value = [..._keys].join(',');
        patchHash({ [HASH_KEY]: value || null });
        prefs(PREF_KEY, value || null);
        _cache = new WeakMap();
        dispatch.call('change');
    }

    const readOnlyFeatures = {
        keys: () => [..._keys],

        /** Categories that come from the stored preference are written to the URL too, so a copied link carries them */
        writeHash() {
            patchHash({ [HASH_KEY]: [..._keys].join(',') || null });
        },

        isReadOnlyKey: (key: string) => _keys.has(key),

        toggle(key: string) {
            if (_keys.has(key)) {
                _keys.delete(key);
            } else {
                _keys.add(key);
            }
            update();
            return readOnlyFeatures;
        },

        /** Forget cached results, e.g. after the data changed */
        clearCache() {
            _cache = new WeakMap();
        },

        /**
         * Whether `entity` belongs to a read-only category.
         * Vertices are read-only only if all their parent ways are, so a node shared
         * by a read-only building and an editable road stays editable.
         */
        isReadOnly(entity: Entity, graph: Graph, features: Features): boolean {
            if (!_keys.size) return false;

            const cached = _cache.get(entity);
            if (cached !== undefined) return cached;

            let result: boolean;
            const geometry = entity.geometry(graph);
            if (geometry === 'vertex') {
                const parents = graph.parentWays(entity);
                result = parents.length > 0 && parents.every(parent => readOnlyFeatures.isReadOnly(parent, graph, features));
            } else {
                const matches = features.getMatches(entity, graph, geometry);
                result = Object.keys(matches).some(key => _keys.has(key));
            }

            _cache.set(entity, result);
            return result;
        }
    };

    return utilRebind(readOnlyFeatures, dispatch, 'on');
}

export const readOnlyFeatures = createReadOnlyFeatures();


/** The OSM entity an SVG element of the map stands for (targets carry it in `properties`) */
function entityForDatum(datum: unknown): Entity | undefined {
    const d = datum as { properties?: { entity?: unknown }; type?: string } | undefined;
    if (!d) return undefined;
    // touch targets carry the entity in `properties`; midpoint targets carry a midpoint there,
    // which is no OSM entity (no `geometry()`): those are skipped
    const candidate = (d.properties?.entity ?? d) as { type?: string; geometry?: unknown };
    const isEntity = (candidate.type === 'node' || candidate.type === 'way' || candidate.type === 'relation') &&
        typeof candidate.geometry === 'function';
    return isEntity ? candidate as unknown as Entity : undefined;
}


/**
 * Marks the map elements of read-only entities with `.readonly-feature` after every redraw.
 * CSS mutes them and turns off pointer events, which also covers iD's hover and click targets.
 */
export function setupReadOnlyFeatures(context: iD.Context) {
    const features = context.features() as unknown as Features;
    readOnlyFeatures.writeHash();

    /** Some map elements have the class; without read-only categories there is nothing to do else */
    let _marked = false;
    /** element → the datum it was checked with and the result */
    let _checked = new WeakMap<Element, { datum: unknown; readOnly: boolean }>();
    // the categories or the data changed: check every element again
    const recheck = () => { _checked = new WeakMap(); };

    function applyClasses() {
        const surface = context.surface();
        if (!surface || surface.empty()) return;

        // runs after every draw, also the small ones on hover: do as little as possible
        if (!readOnlyFeatures.keys().length) {
            if (!_marked) return;
            surface.selectAll('.readonly-feature').classed('readonly-feature', false);
            surface.selectAll<HTMLElement, unknown>('.layer-touch .target').style('pointer-events', null);
            _marked = false;
            return;
        }

        const graph = context.graph();
        /** Whether the element's datum is read-only; most elements keep their datum between draws */
        const isReadOnlyElement = (element: Element, datum: unknown) => {
            const checked = _checked.get(element);
            if (checked && checked.datum === datum) return checked.readOnly;
            const entity = entityForDatum(datum);
            const readOnly = !!entity && readOnlyFeatures.isReadOnly(entity, graph, features);
            _checked.set(element, { datum, readOnly });
            return readOnly;
        };

        // the drawn features: a class, which the draws keep (they rewrite only the `tag-*` classes)
        surface.selectAll<Element, unknown>('.layer-osm path, .layer-osm g.point, .layer-osm g.vertex')
            .each(function(datum) {
                const readOnly = isReadOnlyElement(this, datum);
                // d3's `classed` is much slower here (thousands of elements)
                if (readOnly !== this.classList.contains('readonly-feature')) {
                    this.classList.toggle('readonly-feature', readOnly);
                }
            });
        // the click targets: an inline style. Each draw rewrites their whole class attribute, so a
        // class had to be added again every time (thousands of style changes per redraw).
        surface.selectAll<SVGElement, unknown>('.layer-touch .target')
            .each(function(datum) {
                const value = isReadOnlyElement(this, datum) ? 'none' : '';
                if (this.style.pointerEvents !== value) this.style.pointerEvents = value;
            });
        _marked = true;
    }

    readOnlyFeatures.on('change.setupReadOnlyFeatures', () => {
        recheck();
        context.map().pan([0, 0]);   // forces a full redraw, which re-applies the classes
    });
    context.history()
        .on('change.readOnlyFeatures', () => { readOnlyFeatures.clearCache(); recheck(); })
        .on('merge.readOnlyFeatures', () => { readOnlyFeatures.clearCache(); recheck(); });   // new parent ways for vertices
    context.map().on('drawn.readOnlyFeatures', applyClasses);
}


/** For the lasso and other code that picks entities without the pointer */
export function isReadOnlyEntity(context: iD.Context, entity: Entity, graph: Graph) {
    return readOnlyFeatures.isReadOnly(entity, graph, context.features() as unknown as Features);
}
