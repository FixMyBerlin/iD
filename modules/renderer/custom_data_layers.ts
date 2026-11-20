import { dispatch as d3_dispatch } from 'd3-dispatch';

import { patchHash } from '../behavior/hash';
import { prefs } from '../core/preferences';
import { isProgressTrackerID, type ProgressTrackerID } from '../progress/tracker';
import { utilStringQs } from '../util';
import { utilRebind } from '../util/rebind';

/**
 * A custom map data layer loaded from an external URL.
 * Supported: GeoJSON files, `.pmtiles` archives and `{z}/{x}/{y}` vector tile templates.
 */
export interface CustomDataLayer {
    /** stable id like `data-3`, never reused */
    id: string;
    name: string;
    url: string;
    color: string;
    enabled: boolean;
    /** features can be hovered and clicked; `false` makes the layer a visual overlay only (default `true`) */
    selectable?: boolean;
    /** only features with this property are shown (empty: all features) */
    filterKey?: string;
    /** …with this value; empty: any value */
    filterValue?: string;
    /** the lines can be marked as done for this task (`progress/tracker.ts`) */
    tracker?: ProgressTrackerID;
}

export type CustomDataFormat = 'geojson' | 'vectortile';

const STORAGE_KEY = 'custom-data-layers';
/** Monotonic counter so ids are never reused, even after a deletion */
const NEXT_ID_KEY = 'custom-data-layers-next-id';

/** Colors that stay readable on aerial imagery; new layers cycle through them */
export const CUSTOM_DATA_COLORS = ['#ff26d4', '#00c8ff', '#ffc400', '#6cff3d', '#ff6a00', '#b18cff'];


export function customDataFormat(url: string): CustomDataFormat {
    const path = url.split(/[?#]/)[0].toLowerCase();
    return /\.(geo)?json$/.test(path) ? 'geojson' : 'vectortile';
}


/**
 * A display label from the URL when the user gave no name:
 * the file name, or host and path for tile templates.
 */
export function customDataLabel(url: string) {
    const path = url.trim().split(/[?#]/)[0]
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '');
    if (/\{[a-z]+\}/i.test(path)) {
        return path.replace(/\/?\{[\s\S]*$/, '');
    }
    return path.split('/').pop() || path;
}


export function isSelectable(layer: CustomDataLayer) {
    return layer.selectable !== false;
}


/** The layer's filter as `key=value` (`key=*` without a value), `''` without a filter */
export function customDataFilterLabel(layer: Pick<CustomDataLayer, 'filterKey' | 'filterValue'>) {
    const key = layer.filterKey?.trim();
    if (!key) return '';
    return `${key}=${layer.filterValue?.trim() || '*'}`;
}


/**
 * Whether a feature with these `properties` passes the layer's filter:
 * no filter key: every feature; no value: the property is set; else the property equals the value.
 */
export function matchesCustomDataFilter(
    layer: Pick<CustomDataLayer, 'filterKey' | 'filterValue'>,
    properties: Record<string, unknown> | null | undefined
) {
    const key = layer.filterKey?.trim();
    if (!key) return true;
    const actual = properties?.[key];
    if (actual === undefined || actual === null || actual === '') return false;
    const value = layer.filterValue?.trim();
    return !value || String(actual) === value;
}


/** Trimmed filter fields; `undefined` when empty, so they are left out of the stored JSON */
function cleanFilter(filter: Pick<CustomDataLayer, 'filterKey' | 'filterValue'>) {
    const filterKey = filter.filterKey?.trim() || undefined;
    return { filterKey, filterValue: (filterKey && filter.filterValue?.trim()) || undefined };
}


/** URL hash parameter with the enabled layers, so a link shows the same data */
const HASH_KEY = 'data_layers';

/** What the URL says about a layer: enough to show it again, not its id */
export type CustomDataLayerLink = Pick<CustomDataLayer, 'url' | 'name' | 'filterKey' | 'filterValue' | 'tracker'> & {
    color?: string;
    selectable: boolean;
};

// `;` between layers and `|` between fields: only these (and `%`) are escaped inside a field,
// so the layer URLs stay readable in the hash
const escapeField = (value: string) => value.replace(/[%|;]/g, char => encodeURIComponent(char));
const unescapeField = (value: string) => value.replace(/%(25|7C|3B)/gi, decodeURIComponent);

/**
 * The enabled layers as the value of the `data_layers` hash parameter:
 * `url|name|color|filter|o|tracker` per layer, joined with `;`. `color` without `#`, `filter` as
 * `key=value`, `o` marks a layer that is only an overlay (not selectable), `tracker` is the
 * progress tracker (`mapping`, `track`); empty fields at the end are left out.
 */
export function encodeCustomDataLayers(layers: CustomDataLayer[]) {
    return layers.filter(layer => layer.enabled).map(layer => {
        const fields = [
            layer.url,
            layer.name,
            layer.color.replace(/^#/, ''),
            layer.filterKey ? `${layer.filterKey}=${layer.filterValue ?? ''}` : '',
            isSelectable(layer) ? '' : 'o',
            layer.tracker ?? ''
        ];
        while (fields.length > 1 && !fields[fields.length - 1]) fields.pop();
        return fields.map(escapeField).join('|');
    }).join(';');
}

export function decodeCustomDataLayers(value: string): CustomDataLayerLink[] {
    return value.split(';').map(part => part.split('|').map(unescapeField)).flatMap(fields => {
        const [url = '', name = '', color = '', filter = '', flags = '', tracker = ''] = fields;
        if (!url.trim()) return [];
        const separator = filter.indexOf('=');
        const filterKey = (separator < 0 ? filter : filter.slice(0, separator)).trim();
        return [{
            url: url.trim(),
            name: name.trim(),
            color: /^[0-9a-f]{3,8}$/i.test(color) ? `#${color}` : undefined,
            selectable: !flags.includes('o'),
            ...(isProgressTrackerID(tracker) ? { tracker } : {}),
            ...cleanFilter({ filterKey, filterValue: separator < 0 ? '' : filter.slice(separator + 1) })
        }];
    });
}


function isCustomDataLayer(item: unknown): item is CustomDataLayer {
    const layer = item as CustomDataLayer;
    return typeof layer?.id === 'string' && typeof layer?.url === 'string';
}


/**
 * Stores the custom data layers in local preferences. The enabled ones are also in the URL hash
 * (`data_layers`); a link with that parameter enables exactly its layers (adding unknown ones)
 * and turns the others off, like `disable_features` does for the map features.
 *
 * Events:
 *   'change' - layers were added, removed, edited or toggled
 */
function createCustomDataLayers() {
    const dispatch = d3_dispatch('change');

    let _layers: CustomDataLayer[] | undefined;

    function load(): CustomDataLayer[] {
        if (_layers) return _layers;

        let layers: CustomDataLayer[];
        try {
            const parsed: unknown = JSON.parse(prefs(STORAGE_KEY) ?? '[]');
            layers = Array.isArray(parsed) ? parsed.filter(isCustomDataLayer) : [];
        } catch {
            layers = [];
        }

        // the URL wins over the stored state
        const hashValue = utilStringQs(window.location.hash)[HASH_KEY];
        if (typeof hashValue === 'string') {
            layers = withLinkedLayers(layers, decodeCustomDataLayers(hashValue));
            prefs(STORAGE_KEY, JSON.stringify(layers));
        }
        _layers = layers;
        writeHash();
        return _layers;
    }

    /** Exactly the linked layers are enabled; the ones that are not stored yet are added */
    function withLinkedLayers(stored: CustomDataLayer[], linked: CustomDataLayerLink[]) {
        const layers = stored.map(layer => ({ ...layer, enabled: false }));
        for (const link of linked) {
            const existing = layers.find(layer => layer.url === link.url && customDataFilterLabel(layer) === customDataFilterLabel(link));
            if (existing) {
                existing.enabled = true;
                if (link.tracker) existing.tracker = link.tracker;
                continue;
            }
            layers.push({
                id: nextId(layers),
                name: link.name,
                url: link.url,
                color: link.color ?? CUSTOM_DATA_COLORS[layers.length % CUSTOM_DATA_COLORS.length],
                enabled: true,
                ...(link.selectable ? {} : { selectable: false }),
                ...(link.tracker ? { tracker: link.tracker } : {}),
                ...cleanFilter(link)
            });
        }
        return layers;
    }

    function writeHash() {
        patchHash({ [HASH_KEY]: encodeCustomDataLayers(_layers ?? []) || null });
    }

    function save(layers: CustomDataLayer[]) {
        _layers = layers;
        prefs(STORAGE_KEY, JSON.stringify(layers));
        writeHash();
        dispatch.call('change');
    }

    function nextId(layers = load()) {
        const stored = Number(prefs(NEXT_ID_KEY));
        const highest = Math.max(0, ...layers.map(layer => Number(layer.id.replace(/^data-/, '')) || 0));
        const next = Math.max(Number.isFinite(stored) ? stored : 0, highest) + 1;
        prefs(NEXT_ID_KEY, String(next));
        return `data-${next}`;
    }

    const customDataLayers = {
        all(): CustomDataLayer[] {
            return [...load()];
        },

        enabled(): CustomDataLayer[] {
            return load().filter(layer => layer.enabled);
        },

        get(id: string) {
            return load().find(layer => layer.id === id);
        },

        /**
         * Adds an enabled layer, or enables the existing layer with the same URL and filter.
         * The same URL can be added several times with different filters.
         */
        add(url: string, name = '', filter: Pick<CustomDataLayer, 'filterKey' | 'filterValue'> = {}): CustomDataLayer {
            const cleanUrl = url.trim();
            const filterLabel = customDataFilterLabel(filter);
            const existing = load().find(layer => layer.url === cleanUrl && customDataFilterLabel(layer) === filterLabel);
            if (existing) {
                customDataLayers.update(existing.id, { enabled: true });
                return customDataLayers.get(existing.id)!;
            }

            const layer: CustomDataLayer = {
                id: nextId(),
                name: name.trim(),
                url: cleanUrl,
                color: CUSTOM_DATA_COLORS[load().length % CUSTOM_DATA_COLORS.length],
                enabled: true,
                ...cleanFilter(filter)
            };
            save([...load(), layer]);
            return layer;
        },

        update(id: string, changes: Partial<Omit<CustomDataLayer, 'id'>>) {
            save(load().map(layer => layer.id === id
                ? {
                    ...layer,
                    ...changes,
                    url: (changes.url ?? layer.url).trim(),
                    name: (changes.name ?? layer.name).trim(),
                    ...cleanFilter({ ...layer, ...changes })
                }
                : layer
            ));
            return customDataLayers;
        },

        remove(id: string) {
            save(load().filter(layer => layer.id !== id));
            return customDataLayers;
        },

        toggle(id: string) {
            const layer = customDataLayers.get(id);
            if (layer) customDataLayers.update(id, { enabled: !layer.enabled });
            return customDataLayers;
        },

        /** Forget the cached state, e.g. after the preferences changed in tests */
        reset() {
            _layers = undefined;
        }
    };

    return utilRebind(customDataLayers, dispatch, 'on');
}

export const customDataLayers = createCustomDataLayers();
