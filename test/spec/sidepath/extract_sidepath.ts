import { describe, expect, it } from 'vitest';

import { planSidepathExtraction } from '../../../modules/actions/extract_sidepath';


describe('actions/extract_sidepath planSidepathExtraction', () => {
    it('draws a way whose bikes ride only against the road the other way round, with oneway=yes', () => {
        const road = {
            highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no',
            'cycleway:left': 'track', 'cycleway:left:oneway': '-1', 'cycleway:left:separation:left': 'kerb'
        };
        const plan = planSidepathExtraction(road, 'cycleway', 'left', undefined);
        expect(plan.reversed).toBe(true);
        expect(plan.wayTags.oneway).toBe('yes');
        expect(plan.wayTags['separation:right']).toBe('kerb');
        expect(plan.wayTags['separation:left']).toBeUndefined();
    });

    it('lets an untagged left side of a one-way road with contraflow cycling follow the road (tilda-geo develop)', () => {
        const road = { highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no', 'cycleway:left': 'track' };
        const plan = planSidepathExtraction(road, 'cycleway', 'left', undefined);
        expect(plan.reversed).toBe(false);
        expect(plan.wayTags.oneway).toBe('yes');
    });

    it('keeps a way in the road direction when its bikes ride with the road', () => {
        const plan = planSidepathExtraction({ highway: 'residential', 'cycleway:right': 'track' }, 'cycleway', 'right', undefined);
        expect(plan.reversed).toBe(false);
        expect(plan.wayTags.oneway).not.toBe('-1');
    });
});
