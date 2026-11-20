import type { KvClient, KvEntry } from '@osm-editor-kit/key-value-db-client';
import { describe, expect, it } from 'vitest';

import { setupTildaChecks, VERIFIED } from '../../../modules/tilda/checks';

type Data = { answer: string; wayVersion?: string };

/** An in-memory stand-in for the key-value DB */
function fakeClient(user = { osm_uid: 7, display_name: 'alice' }) {
    const entries = new Map<string, KvEntry<Data>>();
    const calls: string[] = [];
    const client = {
        list(params: { tags?: string[] } = {}) {
            calls.push(`list ${params.tags?.join() ?? ''}`.trim());
            const items = [...entries.values()].filter(entry => (params.tags ?? []).every(tag => entry.tags.includes(tag)));
            return Promise.resolve({ items, next_cursor: null });
        },
        put(id: string, data: Data, tags: string[] = []) {
            const entry: KvEntry<Data> = {
                id, data, tags, version: 1,
                created_at: '2026-10-06T10:00:00.000Z', updated_at: '2026-10-06T10:00:00.000Z',
                created_by: user, updated_by: user
            };
            entries.set(id, entry);
            return Promise.resolve(entry);
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
        connection: () => ({
            authenticated: () => authenticated,
            getAccessToken: () => 'token',
            // eslint-disable-next-line no-unused-vars
            userDetails: (callback: (...args: unknown[]) => void) => callback(undefined, { id: '7' })
        })
    } as unknown as iD.Context;
}

describe('tildaChecks', () => {
    it('stores a check per way and check, with who and when from the server', async () => {
        const { client, entries } = fakeClient();
        const checks = setupTildaChecks(fakeContext(), { client, reloadMs: 0 });
        await checks.load();

        await checks.set('w123', 'cycleway:left:surface:colour', 'cycleway:left:surface:colour=no', '5');

        const entry = entries.get('way/123/cycleway:left:surface:colour')!;
        expect(entry.data).toEqual({ answer: 'cycleway:left:surface:colour=no', wayVersion: '5' });
        expect(entry.tags).toEqual(['way/123', 'check:cycleway:left:surface:colour']);

        const check = checks.get('w123', 'cycleway:left:surface:colour')!;
        expect(check.user).toBe('alice');
        expect(check.at).toBe('2026-10-06T10:00:00.000Z');
        expect(check.wayVersion).toBe('5');
        expect(checks.isMine(check)).toBe(true);
    });

    it('restores the checks on load, and removes one again', async () => {
        const { client, entries } = fakeClient();
        const first = setupTildaChecks(fakeContext(), { client, reloadMs: 0 });
        await first.load();
        await first.set('w123', VERIFIED, '', '5');
        expect(entries.get('way/123/verified')!.tags).toEqual(['way/123', 'verified']);

        // another session
        const second = setupTildaChecks(fakeContext(), { client, reloadMs: 0 });
        expect(second.get('w123', VERIFIED)).toBeUndefined();   // starts the load
        await second.load();
        expect(second.get('w123', VERIFIED)?.user).toBe('alice');

        await second.remove('w123', VERIFIED);
        expect(second.get('w123', VERIFIED)).toBeUndefined();
        expect(entries.size).toBe(0);
    });

    it('loadWay picks up what others changed', async () => {
        const { client } = fakeClient();
        const mine = setupTildaChecks(fakeContext(), { client, reloadMs: 0 });
        const theirs = setupTildaChecks(fakeContext(), { client, reloadMs: 0 });
        await Promise.all([mine.load(), theirs.load()]);

        let changes = 0;
        mine.on('change.test', () => changes++);

        await theirs.set('w123', 'oneway:bicycle', 'oneway:bicycle=yes');
        await mine.loadWay('w123');
        expect(mine.get('w123', 'oneway:bicycle')?.answer).toBe('oneway:bicycle=yes');
        expect(changes).toBe(1);

        await mine.loadWay('w123');   // nothing new: no event
        expect(changes).toBe(1);

        await theirs.remove('w123', 'oneway:bicycle');
        await mine.loadWay('w123');
        expect(mine.get('w123', 'oneway:bicycle')).toBeUndefined();
    });

    it('says why a check cannot be stored', async () => {
        const { client } = fakeClient();
        const checks = setupTildaChecks(fakeContext(false), { client, reloadMs: 0 });
        expect(checks.disabledReason('w-1')).toBe('new_way');
        expect(checks.disabledReason('w123')).toBe('loading');
        await checks.load();
        expect(checks.disabledReason('w123')).toBe('logged_out');

        const offline = { list: () => Promise.reject(new Error('origin_not_allowed')) } as unknown as KvClient<Data>;
        const unavailable = setupTildaChecks(fakeContext(), { client: offline, reloadMs: 0 });
        await unavailable.load();
        expect(unavailable.disabledReason('w123')).toBe('unavailable');
    });
});
