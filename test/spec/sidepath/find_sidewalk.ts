import { describe, expect, it } from 'vitest';

import { isFootPart } from '../../../modules/sidepath/find_sidewalk';

describe('sidepath/find_sidewalk', () => {
    it('counts a sidewalk as the foot part, also where bicycles are allowed', () => {
        expect(isFootPart({ highway: 'footway', footway: 'sidewalk' })).toBe(true);
        expect(isFootPart({ highway: 'footway', bicycle: 'yes' })).toBe(true);
        expect(isFootPart({ highway: 'footway', bicycle: 'permissive' })).toBe(true);
        expect(isFootPart({ highway: 'path', foot: 'designated', bicycle: 'yes' })).toBe(true);
    });

    it('does not count ways for bicycles', () => {
        expect(isFootPart({ highway: 'cycleway' })).toBe(false);
        expect(isFootPart({ highway: 'path', foot: 'designated', bicycle: 'designated' })).toBe(false);
    });
});
