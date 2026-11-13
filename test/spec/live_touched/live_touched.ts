import { createLiveTouchedSession, type LiveTouchedOptions } from '@osm-editor-kit/live-touched';
import { select as d3_select } from 'd3-selection';

import { setupLiveTouched } from '../../../modules/live_touched/live_touched';
import { prefs } from '../../../modules/core/preferences';

const VIEW: [number, number, number, number] = [13.37, 52.51, 13.39, 52.52];

// key-value-db-client is not a direct dependency of iD, so take its types from the live-touched options
type KvClient = NonNullable<LiveTouchedOptions['client']>;
type KvEntry = Awaited<ReturnType<KvClient['batch']>>['put'][number];
type BatchOps = Parameters<KvClient['batch']>[0];
type ListParams = Parameters<KvClient['list']>[0];


/** In-memory stand-in for the key-value-db API, shared by several fake users */
function fakeServer() {
    const entries = new Map<string, KvEntry>();
    const names: Record<number, string> = { 1: 'alice', 2: 'bob' };

    function clientFor(uid: number): KvClient {
        const user = { osm_uid: uid, display_name: names[uid] };
        return {
            me: () => Promise.resolve({ user, can_write: true }),
            batch(ops: BatchOps) {
                const at = new Date().toISOString();
                const put = (ops.put ?? []).map((p: NonNullable<BatchOps['put']>[number]) => {
                    const prev = entries.get(p.id);
                    const entry: KvEntry = {
                        id: p.id, data: p.data, tags: p.tags ?? [],
                        version: (prev?.version ?? 0) + 1,
                        created_at: prev?.created_at ?? at, updated_at: at,
                        created_by: prev?.created_by ?? user, updated_by: user,
                        expires_at: null
                    };
                    entries.set(p.id, entry);
                    return entry;
                });
                let deleted = 0;
                for (const id of ops.delete ?? []) if (entries.delete(id)) deleted++;
                return Promise.resolve({ put, deleted });
            },
            list(params: ListParams) {
                const tags = new Set(params?.tags ?? []);
                return Promise.resolve({ items: [...entries.values()].filter(e => e.tags.some((tag: string) => tags.has(tag))), next_cursor: null });
            },
            removeMine() {
                let deleted = 0;
                for (const [id, e] of entries) if (e.created_by.osm_uid === uid && entries.delete(id)) deleted++;
                return Promise.resolve({ deleted });
            },
            forget: async () => {},
            get: () => Promise.reject(new Error('unused')),
            put: () => Promise.reject(new Error('unused')),
            remove: async () => {},
            tags: () => Promise.resolve({ tags: [] })
        } as KvClient;
    }

    return { entries, clientFor };
}


/** A real iD context with loaded OSM data; the map is a stub that reports a fixed view */
function contextWithData() {
    const context = iD.coreContext().assetPath('../dist/').init();
    const map = {
        on() { return map; },
        extent: () => [[VIEW[0], VIEW[1]], [VIEW[2], VIEW[3]]]
    };
    (context as any).map = () => map;
    (context as any).surface = () => d3_select(null);

    const n1 = new iD.osmNode({ id: 'n1', version: 2, loc: [13.3777, 52.5163] });
    const n2 = new iD.osmNode({ id: 'n2', version: 2, loc: [13.378, 52.5165] });
    const way = new iD.osmWay({ id: 'w789', version: 3, nodes: ['n1', 'n2'], tags: { highway: 'residential' } });
    context.history().merge([n1, n2, way]);
    return context;
}

async function settle(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
}


describe('live_touched (iD wiring)', () => {
    beforeEach(() => {
        prefs('live-touched-enabled', null);
        prefs('live-touched-consent', null);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        vi.setSystemTime(new Date('2026-09-27T10:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shares local edits, shows others, marks parallel edits and removes undone edits', async () => {
        const server = fakeServer();
        const context = contextWithData();
        const alice = setupLiveTouched(context, { client: server.clientFor(1), visibility: null });

        expect(alice.hasConsent()).toBe(false);
        await alice.enable();
        expect(alice.hasConsent()).toBe(true);

        // alice edits the way in iD
        const way = context.entity('w789');
        context.perform(iD.actionChangeTags(way.id, { ...way.tags, name: 'Test' }), 'test');
        await settle(3000);

        const aliceEntries = [...server.entries.values()].filter(e => e.created_by.osm_uid === 1);
        expect(aliceEntries.map(e => [e.data.osm_type, e.data.osm_id, e.data.base_version, e.data.status]))
            .toEqual([['way', 789, 3, 'touched']]);

        // bob sees alice's edit
        const bob = createLiveTouchedSession({
            baseUrl: 'http://unused', project: 'live-touched', apiKey: 'kv_test',
            getOsmToken: () => 'token', editor: 'test', client: server.clientFor(2), visibility: null
        });
        await bob.enable();
        bob.setViewport(VIEW);
        await settle(10000);
        expect(bob.getState().items.map(i => [i.type, i.id, i.user.display_name, i.status]))
            .toEqual([['way', 789, 'alice', 'touched']]);

        // bob edits the same way: alice gets a "parallel" hint
        bob.setModified([{ type: 'way', id: 789, baseVersion: 3, bbox: [13.3777, 52.5163, 13.378, 52.5165] }]);
        await settle(15000);
        const item = alice.state().items.find(i => i.user.display_name === 'bob');
        expect(item?.hint).toBe('parallel');
        expect(alice.state().othersNearby).toBe(true);

        // alice undoes: her entry is deleted
        context.undo();
        await settle(3000);
        expect([...server.entries.values()].filter(e => e.created_by.osm_uid === 1)).toHaveLength(0);

        // delete my data
        const result = await bob.nukeMyData();
        expect(result.deleted).toBe(1);

        bob.destroy();
        alice.session.destroy();
    });
});
