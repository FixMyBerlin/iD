import { KvError, type KvClient, type KvEntry } from '@osm-editor-kit/key-value-db-client';
import { describe, expect, it } from 'vitest';

import { createProgressTracker, progressFeatureID, progressTileTags } from '../../../modules/progress/tracker';

type Data = { done: true };

/** An in-memory stand-in for the key-value DB */
function fakeClient() {
    const user = { osm_uid: 7, display_name: 'alice' };
    const entries = new Map<string, KvEntry<Data>>();
    const calls: string[][] = [];
    const client = {
        list(params: { tags?: string[] } = {}) {
            calls.push(params.tags ?? []);
            const items = [...entries.values()].filter(entry => (params.tags ?? []).some(tag => entry.tags.includes(tag)));
            return Promise.resolve({ items, next_cursor: null });
        },
        put(id: string, data: Data, tags: string[] = []) {
            const entry: KvEntry<Data> = {
                id, data, tags, version: 1,
                created_at: '2026-10-12T10:00:00.000Z', updated_at: '2026-10-12T10:00:00.000Z',
                created_by: user, updated_by: user
            };
            entries.set(id, entry);
            return Promise.resolve(entry);
        },
        get(id: string) {
            const entry = entries.get(id);
            return entry ? Promise.resolve(entry) : Promise.reject(new KvError(404, 'not_found', 'not found'));
        },
        batch(ops: { delete?: string[] }) {
            for (const id of ops.delete ?? []) entries.delete(id);
            return Promise.resolve({ put: [], deleted: ops.delete?.length ?? 0 });
        }
    } as unknown as KvClient<Data>;
    return { client, entries, calls };
}

function fakeContext(authenticated = true) {
    return {
        connection: () => ({ authenticated: () => authenticated, getAccessToken: () => 'token' })
    } as unknown as iD.Context;
}

const flush = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });
/** a line in Berlin-Neukölln, inside one z14 tile */
const BBOX: [number, number, number, number] = [13.4180, 52.4790, 13.4190, 52.4795];


describe('progressFeatureID', () => {
    it('uses id, then lfd_nr, and only values that can be an entry id', () => {
        expect(progressFeatureID({ id: 'way/1079383678/cycleway/right' })).toBe('way/1079383678/cycleway/right');
        expect(progressFeatureID({ lfd_nr: 10021, element_nr: 'x' })).toBe('10021');
        expect(progressFeatureID({ id: 'a b' })).toBeUndefined();
        expect(progressFeatureID({ name: 'x' })).toBeUndefined();
        expect(progressFeatureID(null)).toBeUndefined();
    });
});


describe('progressTileTags', () => {
    it('lists the z14 tiles of a bounding box, with a ring around it on request', () => {
        expect(progressTileTags(BBOX)).toEqual(['z14/8802/5376']);
        expect(progressTileTags(BBOX, 1)).toHaveLength(9);
        // across a tile border
        expect(progressTileTags([13.4180, 52.4790, 13.4300, 52.4795])).toEqual(['z14/8802/5376', 'z14/8803/5376']);
    });
});


describe('progressTracker', () => {
    it('marks a line as done with its tiles as tags, and takes the mark away again', async () => {
        const { client, entries } = fakeClient();
        const tracker = createProgressTracker(fakeContext(), 'mapping', { client });
        let changes = 0;
        tracker.on('change.test', () => changes++);

        await tracker.setDone('10021', BBOX);
        expect(entries.get('10021')?.tags).toEqual(['z14/8802/5376']);
        expect(tracker.get('10021')).toEqual({ id: '10021', user: 'alice', at: '2026-10-12T10:00:00.000Z' });

        await tracker.setNotDone('10021');
        expect(entries.has('10021')).toBe(false);
        expect(tracker.get('10021')).toBeUndefined();
        expect(changes).toBe(2);
    });

    it('loads the marks of the view once, and again when the tiles are stale', async () => {
        const { client, calls } = fakeClient();
        await client.put('10021', { done: true }, ['z14/8802/5376']);
        let time = 1000;
        const tracker = createProgressTracker(fakeContext(), 'mapping', { client, now: () => time });

        tracker.loadView(BBOX);
        tracker.loadView(BBOX);   // still loading
        await flush();
        expect(calls).toHaveLength(1);
        expect(calls[0]).toHaveLength(9);
        expect(tracker.get('10021')?.user).toBe('alice');

        tracker.loadView(BBOX);   // fresh
        expect(calls).toHaveLength(1);

        time += 3 * 60 * 1000;
        tracker.loadView(BBOX);
        await flush();
        expect(calls).toHaveLength(2);
    });

    it('drops a mark that someone else removed', async () => {
        const { client, entries } = fakeClient();
        await client.put('10021', { done: true }, ['z14/8802/5376']);
        let time = 1000;
        const tracker = createProgressTracker(fakeContext(), 'mapping', { client, now: () => time });
        tracker.loadView(BBOX);
        await flush();
        expect(tracker.get('10021')).toBeDefined();

        entries.delete('10021');
        time += 3 * 60 * 1000;
        tracker.loadView(BBOX);
        await flush();
        expect(tracker.get('10021')).toBeUndefined();
    });

    it('does not load when zoomed out too far, and says so', () => {
        const { client, calls } = fakeClient();
        const tracker = createProgressTracker(fakeContext(), 'mapping', { client });
        expect(tracker.loadView([13.1, 52.3, 13.8, 52.7])).toBe(false);
        expect(calls).toHaveLength(0);
        expect(tracker.loadView(BBOX)).toBe(true);
    });

    it('keeps a mark that was set while a load of the view ran', async () => {
        const { client, calls } = fakeClient();
        const tracker = createProgressTracker(fakeContext(), 'mapping', { client });
        tracker.loadView(BBOX);   // answers without the mark
        await tracker.setDone('10021', BBOX);
        await flush();
        expect(tracker.get('10021')).toBeDefined();

        tracker.loadView(BBOX);
        await flush();
        expect(calls.length).toBeGreaterThanOrEqual(1);
        expect(tracker.get('10021')).toBeDefined();
    });

    it('needs a login to change marks', () => {
        const { client } = fakeClient();
        expect(createProgressTracker(fakeContext(false), 'track', { client }).disabledReason()).toBe('logged_out');
        expect(createProgressTracker(fakeContext(true), 'track', { client }).disabledReason()).toBeUndefined();
    });

    it('does not overwrite a change someone else made since the view was loaded', async () => {
        const { client, entries } = fakeClient();
        const tracker = createProgressTracker(fakeContext(), 'mapping', { client });
        // the view shows the line as open, but bob marked it meanwhile
        const bob = { osm_uid: 9, display_name: 'bob' };
        entries.set('10021', {
            id: '10021', data: { done: true }, tags: ['z14/8802/5376'], version: 1,
            created_at: '2026-10-14T08:00:00.000Z', updated_at: '2026-10-14T08:00:00.000Z', created_by: bob, updated_by: bob
        });
        const change = await tracker.setDone('10021', BBOX);
        expect(change).toEqual({ result: 'already', mark: { id: '10021', user: 'bob', at: '2026-10-14T08:00:00.000Z' } });
        expect(entries.get('10021')?.updated_by.display_name).toBe('bob');
        expect(tracker.get('10021')?.user).toBe('bob');

        // the view shows it as done, but it was taken away meanwhile
        entries.delete('10021');
        expect(await tracker.setNotDone('10021')).toEqual({ result: 'already', mark: undefined });
        expect(tracker.get('10021')).toBeUndefined();
    });

    it('reads the mark of one line again', async () => {
        const { client } = fakeClient();
        const tracker = createProgressTracker(fakeContext(), 'mapping', { client });
        expect(await tracker.refresh('10021')).toBeUndefined();
        await client.put('10021', { done: true }, ['z14/8802/5376']);
        expect((await tracker.refresh('10021'))?.user).toBe('alice');
    });
});
