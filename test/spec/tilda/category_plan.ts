import { processBikelanes } from '@tilda-geo/bicycle-infrastructure';

import { applyPlan, planCategory } from '../../../modules/tilda/category_plan';
import { requiredAttributes } from '../../../modules/tilda/required_attributes';


function categoryAfter(tags: Tags, target: string, side: 'self' | 'left' | 'right') {
    const plan = planCategory(tags, target, side);
    const next = applyPlan(tags, plan);
    return { plan, next, category: processBikelanes(next).find(r => r._side === side)?.category };
}


describe('tilda/category_plan', () => {
    it('splits cycleway:both and adds a lane on one side', () => {
        const { plan, next, category } = categoryAfter(
            { highway: 'residential', 'cycleway:both': 'no' }, 'cyclewayOnHighway_advisory', 'right'
        );
        expect(plan.aligned).toBe(true);
        expect(plan.remove).toEqual(['cycleway:both']);
        expect(next).toMatchObject({ 'cycleway:left': 'no', 'cycleway:right': 'lane', 'cycleway:right:lane': 'advisory' });
        expect(next['cycleway:both']).toBeUndefined();
        expect(category).toBe('cyclewayOnHighway_advisory');
    });

    it('adds the side key when the side is not tagged yet', () => {
        const { plan, next, category } = categoryAfter(
            { highway: 'residential', 'cycleway:left': 'no' }, 'cyclewayOnHighway_exclusive', 'right'
        );
        expect(plan.aligned).toBe(true);
        expect(next).toMatchObject({ 'cycleway:right': 'lane', 'cycleway:right:lane': 'exclusive' });
        expect(next.lane).toBeUndefined();
        expect(category).toBe('cyclewayOnHighway_exclusive');
    });

    it('writes cycleway:<side> instead of cycleway:<side>:cycleway', () => {
        const { next, category } = categoryAfter(
            { highway: 'residential', 'cycleway:left': 'no', 'cycleway:right': 'lane' }, 'cycleway_adjoining', 'right'
        );
        expect(next['cycleway:right:cycleway']).toBeUndefined();
        expect(next['cycleway:right']).toBe('track');
        expect(category).toBe('cycleway_adjoining');
    });

    it('explains targets that do not fit the way', () => {
        const plan = planCategory({ highway: 'footway', footway: 'sidewalk' }, 'cyclewayOnHighway_advisory', 'self');
        expect(plan.aligned).toBe(false);
        expect(plan.conflicts[0].reason).toMatch(/centerline/);
    });

    it('reports plans that are not enough', () => {
        const plan = planCategory({ highway: 'residential', 'cycleway:right': 'lane' }, 'cyclewayOnHighwayProtected', 'right');
        expect(plan.aligned).toBe(false);
        expect(plan.conflicts).toHaveLength(1);
    });
});


describe('tilda/required_attributes', () => {
    it('lists the attributes per side with side keys', () => {
        const tags = { highway: 'residential', 'cycleway:right': 'lane', 'cycleway:right:lane': 'exclusive', surface: 'asphalt' };
        const right = processBikelanes(tags).find(r => r._side === 'right')!;
        const attributes = requiredAttributes(right, tags);
        expect(attributes.map(a => a.key)).toContain('cycleway:right:width');
        expect(attributes.map(a => a.key)).toContain('cycleway:right:traffic_mode:right');
        expect(attributes.find(a => a.id === 'surface')?.tilda).toBe('asphalt');   // from the road
        expect(attributes.find(a => a.id === 'width')?.value).toBeUndefined();
    });

    it('asks separate ways for an explicit oneway', () => {
        const tags = { highway: 'cycleway', is_sidepath: 'yes' };
        const self = processBikelanes(tags).find(r => r._side === 'self')!;
        expect(requiredAttributes(self, tags).map(a => a.key)).toContain('oneway');
    });
});
