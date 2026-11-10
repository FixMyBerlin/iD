import { describe, expect, it } from 'vitest';

import { bothSidesKey } from '../../../../modules/ui/sections/tilda_bike_infra';

describe('ui/sections/tilda_bike_infra bothSidesKey', () => {
    it('joins keys that differ only in left / right', () => {
        expect(bothSidesKey('cycleway:left:surface', 'cycleway:right:surface')).toBe('cycleway:both:surface');
        expect(bothSidesKey('cycleway:left:traffic_mode:right', 'cycleway:right:traffic_mode:right')).toBe('cycleway:both:traffic_mode:right');
    });

    it('not for other keys', () => {
        expect(bothSidesKey('cycleway:left:surface', 'cycleway:left:surface')).toBeUndefined();
        expect(bothSidesKey('cycleway:left:traffic_mode:left', 'cycleway:right:traffic_mode:right')).toBeUndefined();
        expect(bothSidesKey('cycleway:right:surface', 'cycleway:left:surface')).toBeUndefined();
    });
});
