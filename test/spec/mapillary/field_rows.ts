import { describe, expect, it } from 'vitest';
import { buildImageRows, normalizeImageId, removeImageChange, setImageChange } from '../../../modules/mapillary/field_rows';

describe('buildImageRows', () => {
    const tags = { mapillary: '1;2', 'cycleway:right:mapillary': '3', name: 'x', 'mapillary:map_feature': '9' };

    it('makes one row per image key, in display order', () => {
        expect(buildImageRows(tags)).toEqual([
            { key: 'mapillary', label: 'Image', ids: ['1', '2'] },
            { key: 'cycleway:right:mapillary', label: 'Right bike lane', ids: ['3'] }
        ]);
    });

    it('adds an empty input to pending keys', () => {
        expect(buildImageRows(tags, new Set(['mapillary']))[0].ids).toEqual(['1', '2', '']);
    });

    it('is empty without image keys', () => {
        expect(buildImageRows({ highway: 'residential' })).toEqual([]);
    });
});


describe('normalizeImageId', () => {
    it('extracts the id from a Mapillary URL', () => {
        expect(normalizeImageId(' https://www.mapillary.com/app/?pKey=123abc&focus=photo ')).toBe('123abc');
    });
    it('keeps plain ids', () => {
        expect(normalizeImageId(' 456 ')).toBe('456');
    });
});


describe('image changes', () => {
    const tags = { mapillary: '1;2' };

    it('replaces an id', () => {
        expect(setImageChange(tags, 'mapillary', 1, '5')).toEqual({ mapillary: '1;5' });
    });
    it('appends past the end and to a missing key', () => {
        expect(setImageChange(tags, 'mapillary', 2, '3')).toEqual({ mapillary: '1;2;3' });
        expect(setImageChange(tags, 'mapillary:forward', 0, '7')).toEqual({ 'mapillary:forward': '7' });
    });
    it('does not duplicate ids', () => {
        expect(setImageChange(tags, 'mapillary', 2, '1')).toEqual({ mapillary: '1;2' });
    });
    it('removes the tag when the last id goes', () => {
        expect(removeImageChange(tags, 'mapillary', 0)).toEqual({ mapillary: '2' });
        expect(removeImageChange({ mapillary: '1' }, 'mapillary', 0)).toEqual({ mapillary: undefined });
        expect(setImageChange(tags, 'mapillary', 0, '')).toEqual({ mapillary: '2' });
    });
});
