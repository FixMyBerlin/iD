import { describe, expect, it, vi } from 'vitest';

import { createHighlightResolver } from '../../../modules/mapillary/highlight';
import { selectedFeatureImages } from '../../../modules/mapillary/selected_images';

const flush = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

describe('mapillary/highlight', () => {
    function setup() {
        const fetchJson = vi.fn((url: string) => Promise.resolve(((): unknown => {
            if (url.includes('creator_username=radinfra')) return { data: [{ creator: { id: '750463990876291', username: 'radinfra' } }] };
            if (url.includes('/231009332916068?')) return { id: '231009332916068', slug: 'fixmycity' };
            if (url.includes('/1?')) return { slug: 'other' };
            return { data: [] };
        })()));
        const onResolved = vi.fn();
        return { fetchJson, onResolved, resolver: createHighlightResolver(fetchJson, onResolved) };
    }

    it('resolves users to creator ids and caches', async () => {
        const { resolver, fetchJson, onResolved } = setup();
        const image = { creator_id: '750463990876291' };
        expect(resolver.isHighlighted(image, ['RadInfra'], [])).toBe(false);
        await flush();
        expect(onResolved).toHaveBeenCalled();
        expect(resolver.isHighlighted(image, ['RadInfra'], [])).toBe(true);
        expect(resolver.isHighlighted({ creator_id: 5 }, ['radinfra'], [])).toBe(false);
        expect(fetchJson).toHaveBeenCalledTimes(1);
    });

    it('resolves organization ids to slugs', async () => {
        const { resolver, fetchJson } = setup();
        const image = { organization_id: 231009332916068 };
        expect(resolver.isHighlighted(image, [], ['fixmycity'])).toBe(false);
        await flush();
        expect(resolver.isHighlighted(image, [], ['FixMyCity'])).toBe(true);
        expect(resolver.isHighlighted({ organization_id: '1' }, [], ['fixmycity'])).toBe(false);
        await flush();
        expect(resolver.isHighlighted({ organization_id: '1' }, [], ['fixmycity'])).toBe(false);
        expect(fetchJson).toHaveBeenCalledTimes(2);
    });

    it('does not look up organizations when none is listed', () => {
        const { resolver, fetchJson } = setup();
        resolver.isHighlighted({ organization_id: 1 }, [], []);
        expect(fetchJson).not.toHaveBeenCalled();
    });

    it('survives failing requests', async () => {
        const failing = createHighlightResolver(() => Promise.reject(new Error('x')), () => {});
        expect(failing.isHighlighted({ creator_id: 1 }, ['a'], [])).toBe(false);
        await flush();
        expect(failing.isHighlighted({ creator_id: 1 }, ['a'], [])).toBe(false);
    });
});

describe('mapillary/selected_images', () => {
    it('finds cached images for all image keys, once', () => {
        const cache: Record<string, { id: string }> = { '1': { id: '1' }, '2': { id: '2' }, '3': { id: '3' } };
        const found = selectedFeatureImages(
            [{ mapillary: '1;9', 'cycleway:right:mapillary': '2' }, { 'source:mapillary': '1' }, { highway: 'x' }],
            id => cache[id]
        );
        expect(found.map(d => d.id).sort()).toEqual(['1', '2']);
    });
});
