import { describe, expect, it } from 'vitest';

import {
    extractOptions,
    planExtraction,
    setDirectionalValue,
    sidepathOffsetMeters,
    sideTags,
    splitSides,
    type SignRecommend
} from '../../../modules/sidepath/extract_tags';

// signsToTags results of the traffic sign converter (see test/spec/traffic_sign)
const recommend: SignRecommend = value => ({
    'DE:237': { bicycle: 'designated', highway: ['cycleway'], traffic_sign: 'DE:237' },
    'DE:240': { bicycle: 'designated', foot: 'designated', highway: ['path'], segregated: 'no', traffic_sign: 'DE:240' },
    'DE:241': { bicycle: 'designated', foot: 'designated', highway: ['path'], segregated: 'yes', traffic_sign: 'DE:241-30' },
    'DE:239,1022-10': { bicycle: 'yes', foot: 'designated', highway: ['footway'], traffic_sign: 'DE:239,1022-10' }
} as Record<string, Record<string, string | string[]>>)[value] ?? {};

const option = (o: { variant: string; side: string; protectedLane: boolean }) => `${o.side} ${o.variant}${o.protectedLane ? ' (protected)' : ''}`;

describe('extractOptions', () => {
    it('offers tracks, sidewalks and the combined path, right first', () => {
        const tags = { highway: 'secondary', 'cycleway:both': 'track', sidewalk: 'both' };
        expect(extractOptions(tags).map(option)).toEqual([
            'right cycleway', 'right sidewalk', 'right path', 'left cycleway', 'left sidewalk', 'left path'
        ]);
    });

    it('offers protected lanes last, and no painted lanes', () => {
        expect(extractOptions({ highway: 'primary', 'cycleway:right': 'lane', 'cycleway:left': 'lane', 'cycleway:right:separation:left': 'bollard' }).map(option))
            .toEqual(['right cycleway (protected)']);
    });

    it('reads the old sidewalk schema and skips separate sides and paths', () => {
        expect(extractOptions({ highway: 'residential', sidewalk: 'right', 'cycleway:right': 'separate' }).map(option)).toEqual(['right sidewalk']);
        expect(extractOptions({ highway: 'cycleway', 'cycleway:right': 'track' })).toEqual([]);
    });
});

describe('sideTags', () => {
    it('unnests like TILDA: side over both over plain, meta keys', () => {
        const tags = {
            highway: 'secondary', 'cycleway:both': 'track', 'cycleway:surface': 'asphalt',
            'cycleway:right:surface': 'paving_stones', 'cycleway:both:width': '2', 'source:cycleway:right:width': 'survey'
        };
        expect(sideTags(tags, 'cycleway', 'right')).toEqual({ surface: 'paving_stones', width: '2', 'source:width': 'survey' });
        expect(sideTags(tags, 'cycleway', 'left')).toEqual({ surface: 'asphalt', width: '2' });
    });
});

describe('splitSides', () => {
    it('moves both and plain keys to the sides', () => {
        expect(splitSides({ highway: 'secondary', cycleway: 'track', 'cycleway:both:surface': 'asphalt', 'cycleway:lanes': 'no|lane' }, 'cycleway')).toEqual({
            highway: 'secondary', 'cycleway:left': 'track', 'cycleway:right': 'track',
            'cycleway:left:surface': 'asphalt', 'cycleway:right:surface': 'asphalt', 'cycleway:lanes': 'no|lane'
        });
    });

    it('converts the old sidewalk and opposite schemas', () => {
        expect(splitSides({ sidewalk: 'right' }, 'sidewalk')).toEqual({ 'sidewalk:left': 'no', 'sidewalk:right': 'yes' });
        expect(splitSides({ oneway: 'yes', cycleway: 'opposite_track' }, 'cycleway')).toEqual({ oneway: 'yes', 'oneway:bicycle': 'no', 'cycleway:left': 'track' });
    });
});

describe('setDirectionalValue', () => {
    it('merges equal directions, splits different ones', () => {
        expect(setDirectionalValue({}, 'bicycle', 'forward', 'use_sidepath')).toEqual({ 'bicycle:forward': 'use_sidepath' });
        expect(setDirectionalValue({ 'bicycle:forward': 'use_sidepath' }, 'bicycle', 'backward', 'use_sidepath')).toEqual({ bicycle: 'use_sidepath' });
        expect(setDirectionalValue({ bicycle: 'yes' }, 'bicycle', 'forward', 'use_sidepath')).toEqual({ 'bicycle:forward': 'use_sidepath', 'bicycle:backward': 'yes' });
    });
});

describe('planExtraction', () => {
    it('A: cycle track with DE:237 → cycleway, road separate + bicycle:forward=use_sidepath', () => {
        const road = {
            highway: 'secondary', lit: 'yes', 'cycleway:right': 'track', 'cycleway:right:surface': 'asphalt',
            'cycleway:right:width': '2', 'cycleway:right:traffic_sign': 'DE:237', 'cycleway:left': 'lane'
        };
        const plan = planExtraction(road, 'cycleway', 'right', recommend);
        expect(plan.wayTags).toEqual({
            highway: 'cycleway', is_sidepath: 'yes', bicycle: 'designated', traffic_sign: 'DE:237',
            surface: 'asphalt', width: '2', oneway: 'yes', lit: 'yes'
        });
        expect(plan.roadTags).toEqual({
            highway: 'secondary', lit: 'yes', 'cycleway:right': 'separate', 'cycleway:left': 'lane', 'bicycle:forward': 'use_sidepath'
        });
    });

    it('A: second side merges to cycleway:both=separate and bicycle=use_sidepath', () => {
        const road = { highway: 'secondary', 'cycleway:left': 'track', 'cycleway:left:traffic_sign': 'DE:237', 'cycleway:right': 'separate', 'bicycle:forward': 'use_sidepath' };
        const plan = planExtraction(road, 'cycleway', 'left', recommend);
        expect(plan.roadTags).toEqual({ highway: 'secondary', 'cycleway:both': 'separate', bicycle: 'use_sidepath' });
        // drawn in the road's direction; the left track's bikes ride against it
        expect(plan.wayTags.oneway).toBe('-1');
    });

    it('A: DE:240 / DE:241 → highway=path with designations', () => {
        const road = { highway: 'tertiary', 'cycleway:right': 'track', 'cycleway:right:traffic_sign': 'DE:241' };
        expect(planExtraction(road, 'cycleway', 'right', recommend).wayTags).toEqual({
            highway: 'path', is_sidepath: 'yes', bicycle: 'designated', foot: 'designated', segregated: 'yes', traffic_sign: 'DE:241-30', oneway: 'yes'
        });
    });

    it('A: no sign → cycleway, no use_sidepath; no oneway guess for contraflow', () => {
        const road = { highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no', 'cycleway:left': 'track' };
        const plan = planExtraction(road, 'cycleway', 'left', recommend);
        expect(plan.wayTags).toEqual({ highway: 'cycleway', is_sidepath: 'yes' });
        expect(plan.roadTags).toEqual({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no', 'cycleway:left': 'separate' });
    });

    it('A: keeps a bicycle value it must not replace', () => {
        const road = { highway: 'residential', bicycle: 'no', 'cycleway:right': 'track', 'cycleway:right:traffic_sign': 'DE:237' };
        const plan = planExtraction(road, 'cycleway', 'right', recommend);
        expect(plan.roadTags.bicycle).toBe('no');
        expect(plan.keptBicycle).toBe('no');
    });

    it('B: sidewalk with bicycle=yes → footway sidewalk, other side kept', () => {
        const road = { highway: 'residential', sidewalk: 'both', 'sidewalk:right:bicycle': 'yes', 'sidewalk:right:traffic_sign': 'DE:239,1022-10', 'sidewalk:both:surface': 'paving_stones' };
        const plan = planExtraction(road, 'sidewalk', 'right', recommend);
        expect(plan.wayTags).toEqual({
            highway: 'footway', footway: 'sidewalk', traffic_sign: 'DE:239,1022-10', bicycle: 'yes', surface: 'paving_stones'
        });
        expect(plan.roadTags).toEqual({
            highway: 'residential', 'sidewalk:left': 'yes', 'sidewalk:right': 'separate', 'sidewalk:left:surface': 'paving_stones'
        });
    });

    it('B: designated sidewalk → shared path, bicycle use_sidepath', () => {
        const road = { highway: 'residential', 'sidewalk:right': 'yes', 'sidewalk:right:bicycle': 'designated', 'sidewalk:right:traffic_sign': 'DE:240' };
        const plan = planExtraction(road, 'sidewalk', 'right', recommend);
        expect(plan.wayTags).toEqual({
            highway: 'path', bicycle: 'designated', foot: 'designated', is_sidepath: 'yes', segregated: 'no', traffic_sign: 'DE:240'
        });
        expect(plan.roadTags['bicycle:forward']).toBe('use_sidepath');
    });

    it('C: track and sidewalk → one path with split keys', () => {
        const road = {
            highway: 'secondary', 'cycleway:right': 'track', 'sidewalk:right': 'yes',
            'cycleway:right:surface': 'asphalt', 'sidewalk:right:surface': 'paving_stones',
            'cycleway:right:smoothness': 'good', 'sidewalk:right:smoothness': 'good',
            'cycleway:right:width': '1.6', 'sidewalk:right:width': '2.5'
        };
        const plan = planExtraction(road, 'path', 'right', recommend);
        expect(plan.wayTags).toEqual({
            highway: 'path', bicycle: 'designated', foot: 'designated', is_sidepath: 'yes', segregated: 'yes',
            'cycleway:surface': 'asphalt', 'footway:surface': 'paving_stones', smoothness: 'good',
            'cycleway:width': '1.6', 'footway:width': '2.5', width: '4.1', oneway: 'no', 'oneway:bicycle': 'yes'
        });
        // no sign: designated as a foot and cycle path, but no obligation to use it
        expect(plan.roadTags).toEqual({ highway: 'secondary', 'cycleway:right': 'separate', 'sidewalk:right': 'separate' });
    });

    it('C: joins the signs of both sides and keeps the sidewalk\'s other keys', () => {
        const road = {
            highway: 'secondary', 'cycleway:right': 'track', 'sidewalk:right': 'yes',
            'cycleway:right:traffic_sign': 'DE:237', 'sidewalk:right:traffic_sign': 'DE:239', 'sidewalk:right:kerb': 'raised',
            'cycleway:right:traffic_mode:right': 'foot'
        };
        const plan = planExtraction(road, 'path', 'right', recommend);
        expect(plan.wayTags).toMatchObject({ highway: 'path', traffic_sign: 'DE:237;239', segregated: 'yes', kerb: 'raised' });
        expect(plan.wayTags['traffic_mode:right']).toBeUndefined();
        expect(plan.roadTags['bicycle:forward']).toBe('use_sidepath');
    });
});

describe('sidepathOffsetMeters', () => {
    it('stacks road, parking, track and sidewalk', () => {
        const road = { highway: 'residential', 'cycleway:right': 'track', 'sidewalk:right': 'yes' };
        expect(sidepathOffsetMeters(road, 'right', 'cycleway')).toBe(6);        // 4 + 1 + 1
        expect(sidepathOffsetMeters(road, 'right', 'sidewalk')).toBe(8.25);     // 4 + 1 + 2 + 1.25
        expect(sidepathOffsetMeters({ ...road, 'parking:right': 'lane' }, 'right', 'cycleway')).toBe(8);
    });
});
