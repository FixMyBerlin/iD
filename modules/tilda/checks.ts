import { createKvClient, type KvClient, type KvEntry } from '@osm-editor-kit/key-value-db-client';
import { dispatch as d3_dispatch } from 'd3-dispatch';

/**
 * "I checked this" and "Verified" for ways, stored in our key-value DB, not in OSM (WORKDOC feature 33).
 * Used wherever we do not force a tag: the mapper confirms the default (`surface:colour` is not
 * tagged = not coloured), and a second mapper can mark the way as verified.
 *
 * One entry per check: id `way/<id>/<check>`, e.g. `way/123/surface:colour` or `way/123/verified`.
 * Unchecking deletes the entry. Who and when come from the server (`updated_by`, `updated_at`).
 * Reading is public; writing needs the OSM login. The API only answers the origins of the
 * project (`http://127.0.0.1:*`, the Netlify preview), elsewhere the checks are unavailable.
 */

/** The public project key selects the project; it is not a secret */
export const TILDA_CHECKS_BACKEND = {
    baseUrl: 'https://key-value-store.fixmycity.workers.dev',
    project: 'infravelo-radnetz',
    apiKey: 'kv_0cbb12c2db6d86642977b41fd922185682711d15'
};

/** The check id of the verification of the whole way */
export const VERIFIED = 'verified';

const RELOAD_MS = 5 * 60 * 1000;
const PAGE_SIZE = 500;

type CheckData = {
    /** what was confirmed, as a tag (`surface:colour=no`); empty for `verified` */
    answer: string;
    /** OSM version of the way when it was checked */
    wayVersion?: string;
};

export type TildaCheck = {
    wayID: string;
    check: string;
    answer: string;
    wayVersion: string | undefined;
    user: string;
    uid: number;
    /** ISO time */
    at: string;
};

/**
 * - `idle`: nothing loaded yet
 * - `loading`: the first load runs
 * - `ready`: loaded
 * - `unavailable`: the API cannot be reached from here (other origin, offline)
 */
export type TildaChecksStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export type TildaChecks = {
    status(): TildaChecksStatus;
    /** The stored check; starts the first load when nothing is loaded yet */
    get(wayID: string, check: string): TildaCheck | undefined;
    /** Why the user cannot store a check for this way now, or undefined */
    disabledReason(wayID: string): 'new_way' | 'unavailable' | 'loading' | 'logged_out' | undefined;
    /** The check was stored by the logged-in user */
    isMine(check: TildaCheck): boolean;
    set(wayID: string, check: string, answer: string, wayVersion?: string): Promise<void>;
    remove(wayID: string, check: string): Promise<void>;
    /** Loads all checks of the project */
    load(): Promise<void>;
    /** Loads the checks of one way again (others may have changed them) */
    loadWay(wayID: string): Promise<void>;
    on(type: string, listener: (() => void) | null): TildaChecks;
};

type OsmService = {
    getAccessToken?: () => string | null;
    authenticated?: () => boolean;
    userDetails?: (callback: (error: unknown, user?: { id?: string }) => void) => void;
};

export type TildaChecksOptions = {
    client?: KvClient<CheckData>;
    /** 0 = no periodic reload (tests) */
    reloadMs?: number;
};


/** `w123` → `123`; undefined for ways that are not in OSM yet */
function osmWayID(wayID: string) {
    const match = /^w(\d+)$/.exec(wayID);
    return match ? match[1] : undefined;
}

function entryID(wayID: string, check: string) {
    return `way/${osmWayID(wayID)}/${check}`;
}

function wayTag(wayID: string) {
    return `way/${osmWayID(wayID)}`;
}

function fromEntry(entry: KvEntry<CheckData>): TildaCheck | undefined {
    const match = /^way\/(\d+)\/(.+)$/.exec(entry.id);
    if (!match) return undefined;
    return {
        wayID: `w${match[1]}`,
        check: match[2],
        answer: entry.data?.answer ?? '',
        wayVersion: entry.data?.wayVersion,
        user: entry.updated_by.display_name,
        uid: entry.updated_by.osm_uid,
        at: entry.updated_at
    };
}


function createTildaChecks(context: iD.Context, options: TildaChecksOptions = {}): TildaChecks {
    const dispatch = d3_dispatch('change');
    const osm = () => context.connection() as OsmService | undefined;
    const client = options.client ?? createKvClient<CheckData>({
        ...TILDA_CHECKS_BACKEND,
        getOsmToken: () => osm()?.getAccessToken?.() ?? null
    });
    const reloadMs = options.reloadMs ?? RELOAD_MS;

    /** by entry id */
    let _checks = new Map<string, TildaCheck>();
    let _status: TildaChecksStatus = 'idle';
    let _loading: Promise<void> | undefined;
    let _myUid: number | undefined;


    function changed() {
        dispatch.call('change');
    }

    function store(entry: KvEntry<CheckData>) {
        const check = fromEntry(entry);
        if (check) _checks.set(entry.id, check);
    }

    function loadMyUid() {
        if (_myUid !== undefined || !osm()?.authenticated?.()) return;
        osm()?.userDetails?.((error, user) => {
            if (error || !user?.id) return;
            _myUid = Number(user.id);
            changed();
        });
    }


    async function loadAll() {
        const checks = new Map<string, TildaCheck>();
        let cursor: string | undefined;
        do {
            const page = await client.list({ limit: PAGE_SIZE, cursor });
            for (const entry of page.items) {
                const check = fromEntry(entry);
                if (check) checks.set(entry.id, check);
            }
            cursor = page.next_cursor ?? undefined;
        } while (cursor);
        _checks = checks;
    }

    function load() {
        if (_loading) return _loading;
        if (_status === 'idle') _status = 'loading';

        _loading = loadAll()
            .then(() => {
                _status = 'ready';
            })
            .catch(() => {
                // other origin or offline; the next try is the next reload
                if (_status !== 'ready') _status = 'unavailable';
            })
            .then(() => {
                _loading = undefined;
                if (reloadMs) window.setTimeout(load, reloadMs);
                changed();
            });
        return _loading;
    }


    const checks: TildaChecks = {
        status: () => _status,

        get(wayID, check) {
            if (_status === 'idle') load();
            if (!osmWayID(wayID)) return undefined;
            return _checks.get(entryID(wayID, check));
        },

        disabledReason(wayID) {
            if (!osmWayID(wayID)) return 'new_way';
            if (_status === 'unavailable') return 'unavailable';
            if (_status !== 'ready') return 'loading';
            if (!osm()?.authenticated?.()) return 'logged_out';
            return undefined;
        },

        isMine(check) {
            loadMyUid();
            return _myUid !== undefined && check.uid === _myUid;
        },

        async set(wayID, check, answer, wayVersion) {
            if (!osmWayID(wayID)) return;
            const data: CheckData = wayVersion === undefined ? { answer } : { answer, wayVersion };
            const tags = [wayTag(wayID), check === VERIFIED ? VERIFIED : `check:${check}`];
            store(await client.put(entryID(wayID, check), data, tags));
            changed();
        },

        async remove(wayID, check) {
            if (!osmWayID(wayID)) return;
            // batch: deleting an entry that someone else removed already is not an error
            await client.batch({ delete: [entryID(wayID, check)] });
            _checks.delete(entryID(wayID, check));
            changed();
        },

        load,

        async loadWay(wayID) {
            if (!osmWayID(wayID) || _status !== 'ready') return;
            const prefix = `${wayTag(wayID)}/`;
            let page;
            try {
                page = await client.list({ tags: [wayTag(wayID)], limit: PAGE_SIZE });
            } catch {
                return;
            }
            const before = [..._checks.keys()].filter(id => id.startsWith(prefix));
            const sameAsBefore = before.length === page.items.length &&
                page.items.every(entry => _checks.get(entry.id)?.at === entry.updated_at);
            if (sameAsBefore) return;

            for (const id of before) _checks.delete(id);
            for (const entry of page.items) store(entry);
            changed();
        },

        on(type, listener) {
            dispatch.on(type, listener as Parameters<typeof dispatch.on>[1]);
            return checks;
        }
    };

    return checks;
}


const _instances = new WeakMap<iD.Context, TildaChecks>();

/** The checks of this editor; `options` replace the client in tests */
export function setupTildaChecks(context: iD.Context, options: TildaChecksOptions = {}): TildaChecks {
    const checks = createTildaChecks(context, options);
    _instances.set(context, checks);
    return checks;
}

export function tildaChecks(context: iD.Context): TildaChecks {
    return _instances.get(context) ?? setupTildaChecks(context);
}
