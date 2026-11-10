import { describe, expect, it } from 'vitest';

import { planSidepathExtraction } from '../../../modules/actions/extract_sidepath';
import { reverseWayTags } from '../../../modules/sidepath/reverse_tags';


describe('sidepath/reverse_tags', () => {
    it('turns oneway:bicycle too, besides what the package turns', () => {
        expect(reverseWayTags({ oneway: 'no', 'oneway:bicycle': '-1', 'separation:left': 'kerb' }))
            .toEqual({ oneway: 'no', 'oneway:bicycle': 'yes', 'separation:right': 'kerb' });
        expect(reverseWayTags({ 'oneway:bicycle': 'yes' })).toEqual({ 'oneway:bicycle': '-1' });
        expect(reverseWayTags({ 'oneway:bicycle': 'no' })).toEqual({ 'oneway:bicycle': 'no' });
    });
});


describe('actions/extract_sidepath planSidepathExtraction', () => {
    it('draws a way whose bikes ride only against the road the other way round, with oneway=yes', () => {
        const road = {
            highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no',
            'cycleway:left': 'track', 'cycleway:left:separation:left': 'kerb'
        };
        const plan = planSidepathExtraction(road, 'cycleway', 'left', undefined);
        expect(plan.reversed).toBe(true);
        expect(plan.wayTags.oneway).toBe('yes');
        expect(plan.wayTags['separation:right']).toBe('kerb');
        expect(plan.wayTags['separation:left']).toBeUndefined();
    });

    it('keeps a way in the road direction when its bikes ride with the road', () => {
        const plan = planSidepathExtraction({ highway: 'residential', 'cycleway:right': 'track' }, 'cycleway', 'right', undefined);
        expect(plan.reversed).toBe(false);
        expect(plan.wayTags.oneway).not.toBe('-1');
    });
});
