import { describe, expect, it } from 'vitest';
import { allSignRowKeys, mergeWaySigns, parseSignKey, sidesWith, signRows, waySignChanges } from '../../../modules/traffic_sign/sign_field_rows';

describe('parseSignKey', () => {
    it('reads group, side and direction', () => {
        expect(parseSignKey('traffic_sign')).toEqual({ key: 'traffic_sign', group: 'way', side: undefined, direction: undefined });
        expect(parseSignKey('cycleway:right:traffic_sign:forward')).toMatchObject({ group: 'cycleway', side: 'right', direction: 'forward' });
        expect(parseSignKey('cycleway:traffic_sign')).toMatchObject({ group: 'cycleway', side: undefined });
        expect(parseSignKey('source:traffic_sign:mapillary')).toBeUndefined();
        expect(parseSignKey('traffic_sign:left')).toBeUndefined();
    });
});

describe('sidesWith', () => {
    it('finds the sides with a bike lane', () => {
        expect(sidesWith({ 'cycleway:both': 'lane' }, 'cycleway')).toEqual(['both']);
        expect(sidesWith({ cycleway: 'lane' }, 'cycleway')).toEqual(['both']);
        expect(sidesWith({ 'cycleway:right': 'track', 'cycleway:left': 'no' }, 'cycleway')).toEqual(['right']);
        expect(sidesWith({ 'cycleway:both': 'no', 'cycleway:right': 'lane' }, 'cycleway')).toEqual(['right']);
        expect(sidesWith({ 'cycleway:left': 'lane', 'cycleway:right': 'lane' }, 'cycleway')).toEqual(['left', 'right']);
        expect(sidesWith({ 'cycleway:both': 'separate' }, 'cycleway')).toEqual([]);
        expect(sidesWith({}, 'cycleway')).toEqual([]);
    });

    it('finds the sides with a sidewalk', () => {
        expect(sidesWith({ sidewalk: 'both' }, 'sidewalk')).toEqual(['both']);
        expect(sidesWith({ sidewalk: 'left' }, 'sidewalk')).toEqual(['left']);
        expect(sidesWith({ sidewalk: 'separate' }, 'sidewalk')).toEqual([]);
        expect(sidesWith({ 'sidewalk:both': 'yes' }, 'sidewalk')).toEqual(['both']);
        expect(sidesWith({ 'sidewalk:left': 'yes', 'sidewalk:right': 'separate' }, 'sidewalk')).toEqual(['left']);
    });
});

describe('signRows', () => {
    it('shows the way\'s directions when tagged or added', () => {
        expect(signRows({}, 'way').map(row => row.key)).toEqual(['traffic_sign']);
        expect(signRows({ 'traffic_sign:backward': 'DE:274-30' }, 'way').map(row => row.key)).toEqual(['traffic_sign', 'traffic_sign:backward']);
        expect(signRows({}, 'way', new Set(['traffic_sign:forward'])).map(row => row.key)).toEqual(['traffic_sign', 'traffic_sign:forward']);
    });

    it('shows a row per side and every tagged key of the group, sorted', () => {
        const tags = {
            'cycleway:both': 'lane',
            'cycleway:right:traffic_sign:forward': 'DE:237',
            'sidewalk': 'separate',
            'sidewalk:left:traffic_sign': 'DE:239'
        };
        expect(signRows(tags, 'cycleway').map(row => row.key)).toEqual(['cycleway:left:traffic_sign', 'cycleway:right:traffic_sign', 'cycleway:right:traffic_sign:forward']);
        expect(signRows(tags, 'sidewalk').map(row => row.key)).toEqual(['sidewalk:left:traffic_sign']);
        expect(allSignRowKeys(tags)).toEqual(['traffic_sign', 'cycleway:left:traffic_sign', 'cycleway:right:traffic_sign', 'cycleway:right:traffic_sign:forward', 'sidewalk:left:traffic_sign']);
        expect(signRows({ 'cycleway:both': 'lane' }, 'cycleway').map(row => row.key)).toEqual(['cycleway:both:traffic_sign']);
    });
});


describe('mergeWaySigns', () => {
    it('merges equal directions into the whole way', () => {
        expect(mergeWaySigns({ forward: 'DE:237', backward: 'DE:237' })).toEqual({ whole: 'DE:237' });
        expect(mergeWaySigns({ whole: 'DE:237', forward: 'DE:237', backward: 'DE:237' })).toEqual({ whole: 'DE:237' });
    });

    it('drops a direction that repeats the whole way when the other has no sign', () => {
        expect(mergeWaySigns({ whole: 'DE:237', backward: 'DE:237' })).toEqual({ whole: 'DE:237' });
        expect(mergeWaySigns({ whole: 'DE:237', forward: 'DE:237' })).toEqual({ whole: 'DE:237' });
    });

    it('keeps signs that differ', () => {
        const differs = { forward: 'DE:237', backward: 'DE:240' };
        expect(mergeWaySigns(differs)).toEqual(differs);
        const general = { whole: 'DE:274-30', forward: 'DE:274-30', backward: 'DE:274-50' };
        expect(mergeWaySigns(general)).toEqual(general);
        const other = { whole: 'DE:274-30', forward: 'DE:237', backward: 'DE:237' };
        expect(mergeWaySigns(other)).toEqual(other);
    });
});

describe('waySignChanges', () => {
    it('lists only the tags that change', () => {
        expect(waySignChanges({ traffic_sign: 'DE:237', 'traffic_sign:backward': 'DE:237' }, { whole: 'DE:240' }))
            .toEqual({ traffic_sign: 'DE:240', 'traffic_sign:backward': undefined });
        expect(waySignChanges({ traffic_sign: 'DE:237' }, { whole: 'DE:237' })).toEqual({});
    });
});
