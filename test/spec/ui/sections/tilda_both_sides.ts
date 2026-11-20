import { describe, expect, it } from 'vitest';

import { bothSidesKey, bothSidesUpdate } from '../../../../modules/ui/sections/tilda_bike_infra';

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

describe('ui/sections/tilda_bike_infra bothSidesUpdate', () => {
    it('writes one :both tag and removes the side keys', () => {
        expect(bothSidesUpdate({ 'cycleway:left:surface': 'asphalt' }, { 'cycleway:right:surface': 'asphalt' }))
            .toEqual({ 'cycleway:left:surface': undefined, 'cycleway:right:surface': undefined, 'cycleway:both:surface': 'asphalt' });
    });

    it('keeps the side keys when the values differ or the keys are not a pair', () => {
        expect(bothSidesUpdate({ 'cycleway:left:oneway': '-1' }, { 'cycleway:right:oneway': 'yes' }))
            .toEqual({ 'cycleway:left:oneway': '-1', 'cycleway:right:oneway': 'yes' });
        expect(bothSidesUpdate({ 'cycleway:left:surface': 'asphalt', oneway: undefined }, { 'cycleway:right:surface': 'asphalt' }))
            .toEqual({ 'cycleway:left:surface': undefined, 'cycleway:right:surface': undefined, 'cycleway:both:surface': 'asphalt', oneway: undefined });
    });
});
