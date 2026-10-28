import { describe, expect, it } from 'vitest';

import { effectiveList, listOverride, mapillaryConfig, parseList } from '../../../modules/mapillary/config';

describe('mapillary/config', () => {
    it('parses lists', () => {
        expect(parseList('radinfra, foo;bar,,radinfra')).toEqual(['radinfra', 'foo', 'bar']);
        expect(parseList('')).toEqual([]);
        expect(parseList(undefined)).toEqual([]);
    });

    it('lets the URL win over the config', () => {
        expect(effectiveList('a,b', ['c'])).toEqual(['a', 'b']);
        expect(effectiveList(undefined, ['c'])).toEqual(['c']);
        expect(effectiveList(null, ['c'])).toEqual(['c']);
        // cleared by the user
        expect(effectiveList('', ['c'])).toEqual([]);
    });

    it('keeps only lists that differ from the config', () => {
        expect(listOverride('radinfra', ['radinfra'])).toBeNull();
        expect(listOverride(' radinfra ,', ['radinfra'])).toBeNull();
        expect(listOverride('radinfra,foo', ['radinfra'])).toBe('radinfra,foo');
        expect(listOverride('', ['radinfra'])).toBe('');
        expect(listOverride('', [])).toBeNull();
    });

    it('has defaults and merges changes', () => {
        expect(mapillaryConfig().defaultFromDate).toBe('2024-01-01');
        mapillaryConfig({ highlightOrgs: ['x'] });
        expect(mapillaryConfig().highlightOrgs).toEqual(['x']);
        expect(mapillaryConfig().defaultFromDate).toBe('2024-01-01');
        mapillaryConfig({ highlightOrgs: [] });
    });
});
