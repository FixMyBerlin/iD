import { describe, expect, it } from 'vitest';
import { appendImageId, hasImageId, removeImageId, imageButtonKeys, resolveTargetKey, targetKeys } from '../../../modules/mapillary/set_photo';
import { activeTargetEvents, clearActiveTarget, getActiveTarget, setActiveTarget } from '../../../modules/mapillary/active_target';

describe('resolveTargetKey', () => {
    it('defaults to mapillary', () => {
        expect(resolveTargetKey(undefined)).toBe('mapillary');
        expect(resolveTargetKey('cycleway:right:mapillary')).toBe('cycleway:right:mapillary');
    });
});

describe('appendImageId', () => {
    it('sets a key without images', () => {
        expect(appendImageId({}, 'mapillary', '5')).toBe('5');
    });
    it('appends to the list', () => {
        expect(appendImageId({ mapillary: '1;2' }, 'mapillary', '5')).toBe('1;2;5');
    });
    it('adds no duplicates', () => {
        expect(appendImageId({ mapillary: '1;5' }, 'mapillary', '5')).toBe('1;5');
    });
    it('only touches the target key', () => {
        expect(appendImageId({ mapillary: '1' }, 'cycleway:right:mapillary', '5')).toBe('5');
    });
});

describe('hasImageId', () => {
    it('checks the list of the key', () => {
        expect(hasImageId({ mapillary: '1; 2' }, 'mapillary', '2')).toBe(true);
        expect(hasImageId({ mapillary: '1' }, 'cycleway:right:mapillary', '1')).toBe(false);
    });
});

describe('targetKeys', () => {
    it('lists existing and likely keys', () => {
        const keys = targetKeys({ highway: 'cycleway', 'cycleway:right': 'lane', 'source:mapillary': '3' });
        expect(keys).toContain('mapillary');
        expect(keys).toContain('source:mapillary');
        expect(keys).toContain('cycleway:right:mapillary');
        expect(keys).not.toContain('sidewalk:left:mapillary');
    });
});

describe('imageButtonKeys', () => {
    it('offers the image keys without the sign source, suggesting the active row', () => {
        const tags = { traffic_sign: 'DE:237', 'cycleway:right': 'lane' };
        const { keys, suggested } = imageButtonKeys(tags, undefined, 'source:traffic_sign:mapillary');
        expect(keys).toContain('mapillary');
        expect(keys).toContain('cycleway:right:mapillary');
        expect(keys).not.toContain('source:traffic_sign:mapillary');
        expect(suggested).toBe('mapillary');
        expect(imageButtonKeys(tags, 'cycleway:right:mapillary').suggested).toBe('cycleway:right:mapillary');
    });
});

describe('active target store', () => {
    it('is kept per selection and notifies', () => {
        let calls = 0;
        activeTargetEvents.on('change.test', () => calls++);
        setActiveTarget('w1', 'mapillary:forward');
        expect(getActiveTarget('w1')).toBe('mapillary:forward');
        expect(getActiveTarget('w2')).toBeUndefined();
        setActiveTarget('w2', 'mapillary');
        expect(getActiveTarget('w1')).toBeUndefined();
        clearActiveTarget();
        expect(getActiveTarget('w2')).toBeUndefined();
        expect(calls).toBe(3);
        activeTargetEvents.on('change.test', undefined);
    });
});

describe('removeImageId', () => {
    it('takes one id out of the list', () => {
        expect(removeImageId({ mapillary: '5;7' }, 'mapillary', '7')).toBe('5');
        expect(removeImageId({ mapillary: '5' }, 'mapillary', '5')).toBeUndefined();
        expect(removeImageId({}, 'mapillary', '5')).toBeUndefined();
    });
});
