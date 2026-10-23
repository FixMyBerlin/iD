import { describe, expect, it } from 'vitest';

import {
    addableRelatedKeys,
    assignRelatedTags,
    newRelatedKey,
    relatedButtonKeys,
    relatedCategoryOf,
    relatedSide,
    templateFieldIDs
} from '../../../modules/presets/related_tags';

describe('relatedCategoryOf', () => {
    it('finds source, note and check date tags in both key orders', () => {
        expect(relatedCategoryOf('source:width', 'width')).toBe('source');
        expect(relatedCategoryOf('width:source', 'width')).toBe('source');
        expect(relatedCategoryOf('note:width', 'width')).toBe('note');
        expect(relatedCategoryOf('description:surface', 'surface')).toBe('note');
        expect(relatedCategoryOf('check_date:surface', 'surface')).toBe('check_date');
        expect(relatedCategoryOf('source:cycleway:left:width', 'cycleway:left:width')).toBe('source');
    });

    it('finds Mapillary images of the key and of its sub keys', () => {
        expect(relatedCategoryOf('source:traffic_sign:mapillary', 'traffic_sign')).toBe('mapillary');
        expect(relatedCategoryOf('traffic_sign:forward:mapillary', 'traffic_sign:forward')).toBe('mapillary');
        expect(relatedCategoryOf('cycleway:right:mapillary', 'cycleway:right')).toBe('mapillary');
        expect(relatedCategoryOf('source:cycleway:right:traffic_sign:mapillary', 'cycleway:right')).toBe('mapillary');
    });

    it('ignores the feature\'s own images, numbered keys and unrelated keys', () => {
        expect(relatedCategoryOf('mapillary', 'mapillary')).toBeUndefined();
        expect(relatedCategoryOf('mapillary:forward', 'traffic_sign')).toBeUndefined();
        expect(relatedCategoryOf('source:width:1', 'width')).toBeUndefined();
        expect(relatedCategoryOf('source:widths', 'width')).toBeUndefined();
        expect(relatedCategoryOf('cycleway:rightish:mapillary', 'cycleway:right')).toBeUndefined();
    });
});

describe('assignRelatedTags', () => {
    it('gives each tag to the most specific field', () => {
        const fields = [
            { id: 'cycleway', keys: ['cycleway:left', 'cycleway:right'] },
            { id: 'cycleway/right/traffic_sign', keys: ['cycleway:right:traffic_sign'] },
            { id: 'width', keys: ['width'] }
        ];
        const tags = {
            width: '7',
            'source:width': 'Luftbild 2026',
            'note:width': 'at the bus stop',
            'cycleway:right:mapillary': '1',
            'source:cycleway:right:traffic_sign:mapillary': '2',
            mapillary: '3'
        };
        const result = assignRelatedTags(fields, tags);
        expect(result.get('width')?.map(tag => tag.key)).toEqual(['source:width', 'note:width']);
        expect(result.get('cycleway')?.map(tag => tag.key)).toEqual(['cycleway:right:mapillary']);
        expect(result.get('cycleway/right/traffic_sign')?.map(tag => tag.key)).toEqual(['source:cycleway:right:traffic_sign:mapillary']);
    });

    it('never takes a key that a field edits itself', () => {
        const fields = [{ id: 'width', keys: ['width'] }, { id: 'source/width', keys: ['source:width'] }];
        expect(assignRelatedTags(fields, { width: '7', 'source:width': 'survey' }).size).toBe(0);
    });
});

describe('new keys and templates', () => {
    it('spells new keys', () => {
        expect(newRelatedKey('source', 'cycleway:left:width')).toBe('source:cycleway:left:width');
        expect(newRelatedKey('mapillary', 'traffic_sign')).toBe('source:traffic_sign:mapillary');
        expect(newRelatedKey('mapillary', 'cycleway:right')).toBe('cycleway:right:mapillary');
        expect(addableRelatedKeys(['width'])).toEqual(['source:width', 'note:width']);
    });

    it('reuses the field of the key without its road side', () => {
        expect(templateFieldIDs({ key: 'source:cycleway:left:width', category: 'source' })).toEqual(['source/cycleway/left/width', 'source/width', 'source']);
        expect(templateFieldIDs({ key: 'note:width', category: 'note' })).toEqual(['note/width', 'note']);
    });

    it('reads the side', () => {
        expect(relatedSide('cycleway:left:width')).toBe('left');
        expect(relatedSide('traffic_sign:forward')).toBe('forward');
        expect(relatedSide('width')).toBeUndefined();
    });
});

describe('relatedButtonKeys', () => {
    const buttons = {
        cycleway: { check_date: 'check_date:cycleway' },
        'cycleway:right:width': { source: 'source:cycleway:right:width' },
        surface: { source: 'source:surface', check_date: 'check_date:surface' },
        smoothness: { check_date: 'check_date:smoothness' }
    };

    it('offers buttons for keys with a value', () => {
        const keys = relatedButtonKeys(buttons, ['surface', 'smoothness'], 'surface', { surface: 'asphalt' });
        expect(keys.map(key => key.key)).toEqual(['source:surface', 'check_date:surface']);
    });

    it('offers the main key\'s buttons when another key of the field has a value', () => {
        const keys = relatedButtonKeys(buttons, ['cycleway', 'cycleway:left', 'cycleway:right'], 'cycleway', { 'cycleway:right': 'track' });
        expect(keys).toEqual([{ key: 'check_date:cycleway', category: 'check_date', baseKey: 'cycleway' }]);
    });

    it('offers nothing for empty fields or keys without an entry', () => {
        expect(relatedButtonKeys(buttons, ['cycleway:right:width'], 'cycleway:right:width', {})).toEqual([]);
        expect(relatedButtonKeys(buttons, ['name'], 'name', { name: 'Skalitzer Straße' })).toEqual([]);
    });
});
