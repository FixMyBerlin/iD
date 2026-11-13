import { createKvClient, KvError, type KvClient, type KvEntry } from '@osm-editor-kit/key-value-db-client';
import { dispatch as d3_dispatch } from 'd3-dispatch';

/**
 * "Done" marks for the lines of a custom data layer, stored in our key-value DB, not in OSM
 * (WORKDOC feature 35). A layer chooses one of the trackers; each tracker is its own project in
 * the DB, so the same line can be done for one task and open for another.
 *
 * One entry per done line: the entry id is the id of the line in its dataset (`id` or `lfd_nr`).
 * "Not done" deletes the entry. Who and when come from the server.
 *
 * The map shows the marks from the DB only, never from the dataset (its file is older). They are
 * at most `TILE_FRESH_MS` old. Before a change the line's mark is read again: when someone else
 * changed it in the meantime, nothing is written and the caller gets the current mark.
 *
 * The API has no area query. As its docs suggest, an entry carries the map tiles it touches as
 * tags (`z14/8800/5373`), and the view asks for the entries of its tiles.
 */

/** The public project keys select the project; they are not secrets */
const BASE_URL = 'https://key-value-store.fixmycity.workers.dev';
export const PROGRESS_TRACKERS = {
    mapping: { project: 'infravelo-tracker', apiKey: 'kv_b11a83b26cb009abb622f111fdfb2ebef171c7d9' },
    track: { project: 'infravelo-track-tracker', apiKey: 'kv_d7c690c2b2a55df1721bbc3022d255073c2380c8' }
};

export type ProgressTrackerID = keyof typeof PROGRESS_TRACKERS;

export function isProgressTrackerID(value: unknown): value is ProgressTrackerID {
    return typeof value === 'string' && Object.hasOwn(PROGRESS_TRACKERS, value);
}

const TILE_ZOOM = 14;
/** an entry can have 32 tags */
const MAX_TILE_TAGS = 30;
/** tiles asked for in one request */
const TILES_PER_REQUEST = 20;
/** more tiles than this in view: zoomed out too far, nothing is loaded */
const MAX_VIEW_TILES = 60;
const TILE_FRESH_MS = 2 * 60 * 1000;
/** How often a map that stands still asks for new marks (the tiles are stale by then) */
export const PROGRESS_REFRESH_MS = TILE_FRESH_MS + 5 * 1000;
const PAGE_SIZE = 500;
const ID_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/;

type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

type ProgressData = {
    done: true;
};

export type ProgressMark = {
    id: string;
    user: string;
    /** ISO time */
    at: string;
};


/** The id of a line in its dataset: `id`, or `lfd_nr` (REN network); undefined when it cannot be an entry id */
export function progressFeatureID(properties: Record<string, unknown> | null | undefined): string | undefined {
    const value = properties?.id ?? properties?.lfd_nr;
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const id = String(value);
    return ID_PATTERN.test(id) ? id : undefined;
}


function tileX(lon: number) {
    return Math.floor((lon + 180) / 360 * 2 ** TILE_ZOOM);
}

function tileY(lat: number) {
    const rad = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** TILE_ZOOM);
}

/** The tiles a bounding box touches, as tags; `ring` adds tiles around it */
export function progressTileTags(bbox: BBox, ring = 0): string[] {
    const [x0, x1] = [tileX(bbox[0]) - ring, tileX(bbox[2]) + ring];
    const [y0, y1] = [tileY(bbox[3]) - ring, tileY(bbox[1]) + ring];
    const tags: string[] = [];
    for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
            tags.push(`z${TILE_ZOOM}/${x}/${y}`);
        }
    }
    return tags;
}


/**
 * What a change did: `saved`, or `already` when the server had that state already (someone else
 * changed the line since the view was loaded); `mark` is the line's mark on the server now.
 */
export type ProgressChange = { result: 'saved' | 'already'; mark: ProgressMark | undefined };

export type ProgressTracker = {
    /** The mark of a done line */
    get(id: string): ProgressMark | undefined;
    /** Reads the mark of one line from the server again, e.g. when it is selected */
    refresh(id: string): Promise<ProgressMark | undefined>;
    /** Why the user cannot change a mark now (`unavailable`: the last request failed, worth another try), or undefined */
    disabledReason(): 'unavailable' | 'logged_out' | undefined;
    /** `bbox` of the whole line, so the mark is found from every tile the line touches */
    setDone(id: string, bbox: BBox): Promise<ProgressChange>;
    setNotDone(id: string): Promise<ProgressChange>;
    /**
     * Loads the marks of the view; cheap when its tiles are fresh, so it can run on every draw.
     * `false` when the view is too large to load: what is done there is not known.
     */
    loadView(bbox: BBox): boolean;
    on(type: string, listener: (() => void) | null): ProgressTracker;
};

type OsmService = {
    getAccessToken?: () => string | null;
    authenticated?: () => boolean;
};

export type ProgressTrackerOptions = {
    client?: KvClient<ProgressData>;
    now?: () => number;
};


export function createProgressTracker(context: iD.Context, trackerID: ProgressTrackerID, options: ProgressTrackerOptions = {}): ProgressTracker {
    const dispatch = d3_dispatch('change');
    const osm = () => context.connection() as OsmService | undefined;
    const client = options.client ?? createKvClient<ProgressData>({
        baseUrl: BASE_URL,
        ...PROGRESS_TRACKERS[trackerID],
        getOsmToken: () => osm()?.getAccessToken?.() ?? null
    });
    const now = options.now ?? (() => Date.now());

    const _marks = new Map<string, ProgressMark>();
    /** entry id → its tile tags, to notice entries that are gone */
    const _markTiles = new Map<string, string[]>();
    /** tile tag → time of the last load */
    const _loaded = new Map<string, number>();
    const _loading = new Set<string>();
    /** Counts our own changes: a load that started before one must not undo it */
    let _changes = 0;
    /** the API cannot be reached from here (other origin, offline) */
    let _unavailable = false;


    function store(entry: KvEntry<ProgressData>) {
        _marks.set(entry.id, { id: entry.id, user: entry.updated_by.display_name, at: entry.updated_at });
        _markTiles.set(entry.id, entry.tags);
    }

    async function loadTiles(tags: string[]) {
        const found = new Map<string, KvEntry<ProgressData>>();
        let cursor: string | undefined;
        do {
            const page = await client.list({ tags, match: 'any', limit: PAGE_SIZE, cursor });
            for (const entry of page.items) found.set(entry.id, entry);
            cursor = page.next_cursor ?? undefined;
        } while (cursor);
        return found;
    }


    function loadTileGroup(tags: string[]) {
        for (const tag of tags) _loading.add(tag);
        const changesAtStart = _changes;
        let skipped = false;

        loadTiles(tags)
            .then(found => {
                _unavailable = false;
                // we marked or unmarked a line while this ran: its answer may be older than that
                if (changesAtStart !== _changes) {
                    skipped = true;
                    return;
                }
                let changed = false;
                // marks someone else removed: known for one of these tiles, not found anymore
                for (const id of [..._marks.keys()]) {
                    if (found.has(id) || !_markTiles.get(id)?.some(tag => tags.includes(tag))) continue;
                    _marks.delete(id);
                    _markTiles.delete(id);
                    changed = true;
                }
                for (const entry of found.values()) {
                    if (_marks.get(entry.id)?.at !== entry.updated_at) changed = true;
                    store(entry);
                }
                if (changed) dispatch.call('change');
            })
            .catch(() => {
                // other origin or offline: the next try is after the tiles went stale again
                _unavailable = true;
            })
            .then(() => {
                for (const tag of tags) {
                    _loading.delete(tag);
                    // a skipped answer leaves the tiles stale, so the next draw asks again
                    if (!skipped) _loaded.set(tag, now());
                }
            });
    }


    /** The line's mark on the server now; updates the local one */
    async function refresh(id: string) {
        let entry: KvEntry<ProgressData> | undefined;
        try {
            entry = await client.get(id);
        } catch (err) {
            if (!(err instanceof KvError && err.status === 404)) throw err;
        }
        _unavailable = false;
        const before = _marks.get(id);
        if (entry) {
            store(entry);
        } else {
            _marks.delete(id);
            _markTiles.delete(id);
        }
        const mark = _marks.get(id);
        if (before?.at !== mark?.at) {
            // a load of the view that started earlier must not bring the old state back
            _changes++;
            dispatch.call('change');
        }
        return mark;
    }


    const tracker: ProgressTracker = {
        get: id => _marks.get(id),

        refresh,

        disabledReason() {
            if (_unavailable) return 'unavailable';
            if (!osm()?.authenticated?.()) return 'logged_out';
            return undefined;
        },

        async setDone(id, bbox) {
            // done already (by someone else since the view was loaded): keep their mark
            const current = await refresh(id);
            if (current) return { result: 'already', mark: current };

            const tags = progressTileTags(bbox).slice(0, MAX_TILE_TAGS);
            const entry = await client.put(id, { done: true }, tags);
            _unavailable = false;
            _changes++;
            store(entry);
            dispatch.call('change');
            return { result: 'saved', mark: _marks.get(id) };
        },

        async setNotDone(id) {
            // not done anymore (someone else took the mark away): nothing to do
            const current = await refresh(id);
            if (!current) return { result: 'already', mark: undefined };

            // batch: deleting an entry that someone else removed already is not an error
            await client.batch({ delete: [id] });
            _unavailable = false;
            _changes++;
            _marks.delete(id);
            _markTiles.delete(id);
            dispatch.call('change');
            return { result: 'saved', mark: undefined };
        },

        loadView(bbox) {
            const viewTiles = progressTileTags(bbox, 1);
            if (viewTiles.length > MAX_VIEW_TILES) return false;
            const time = now();
            const stale = viewTiles.filter(tag => !_loading.has(tag) && time - (_loaded.get(tag) ?? -Infinity) > TILE_FRESH_MS);

            for (let i = 0; i < stale.length; i += TILES_PER_REQUEST) {
                loadTileGroup(stale.slice(i, i + TILES_PER_REQUEST));
            }
            return true;
        },

        on(type, listener) {
            dispatch.on(type, listener as Parameters<typeof dispatch.on>[1]);
            return tracker;
        }
    };

    return tracker;
}


const _instances = new WeakMap<iD.Context, Map<ProgressTrackerID, ProgressTracker>>();

export function progressTracker(context: iD.Context, trackerID: ProgressTrackerID): ProgressTracker {
    let trackers = _instances.get(context);
    if (!trackers) {
        trackers = new Map();
        _instances.set(context, trackers);
    }
    let tracker = trackers.get(trackerID);
    if (!tracker) {
        tracker = createProgressTracker(context, trackerID);
        trackers.set(trackerID, tracker);
    }
    return tracker;
}
