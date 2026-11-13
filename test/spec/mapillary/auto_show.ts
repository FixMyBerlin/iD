import { describe, expect, it } from 'vitest';
import { isAutoShowValue } from '../../../modules/mapillary/auto_show';

describe('isAutoShowValue', () => {
    it('is on by default and only off when set to false', () => {
        expect(isAutoShowValue(null)).toBe(true);
        expect(isAutoShowValue(undefined)).toBe(true);
        expect(isAutoShowValue('true')).toBe(true);
        expect(isAutoShowValue('false')).toBe(false);
    });
});
