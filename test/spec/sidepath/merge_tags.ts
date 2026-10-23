import { describe, expect, it } from 'vitest';

import {
    combinedPathTags, commonTags, joinSignsPlain, mergeSelection, partKind, reverseTags,
    type MergeWay, type SignRecommend
} from '../../../modules/sidepath/merge_tags';

const recommend: SignRecommend = value => ({
    'DE:237': { bicycle: 'designated', highway: ['cycleway'], traffic_sign: 'DE:237' },
    'DE:239': { foot: 'designated', highway: ['footway'], traffic_sign: 'DE:239' },
    'DE:240': { bicycle: 'designated', foot: 'designated', highway: ['path'], segregated: 'no', traffic_sign: 'DE:240' },
    'DE:241': { bicycle: 'designated', foot: 'designated', highway: ['path'], segregated: 'yes', traffic_sign: 'DE:241-30' }
} as Record<string, Record<string, string | string[]>>)[value] ?? {};

const way = (id: string, tags: Tags, changeset: number | undefined, lengthMeters = 100): MergeWay => ({ id, tags, changeset, lengthMeters });
const cycleway = { highway: 'cycleway' };
const footway = { highway: 'footway', footway: 'sidewalk' };

describe('partKind', () => {
    it('tells cycleways and footways apart, also as paths', () => {
        expect(partKind({ highway: 'cycleway' })).toBe('bike');
        expect(partKind({ highway: 'footway', footway: 'sidewalk' })).toBe('foot');
        expect(partKind({ highway: 'path', bicycle: 'designated' })).toBe('bike');
        expect(partKind({ highway: 'path', foot: 'designated', bicycle: 'yes' })).toBe('foot');
    });

    it('skips ways that are both already, roads and areas', () => {
        expect(partKind({ highway: 'path', bicycle: 'designated', foot: 'designated' })).toBeUndefined();
        expect(partKind({ highway: 'cycleway', foot: 'designated' })).toBeUndefined();
        expect(partKind({ highway: 'path' })).toBeUndefined();
        expect(partKind({ highway: 'residential' })).toBeUndefined();
        expect(partKind({ highway: 'footway', area: 'yes' })).toBeUndefined();
    });
});

describe('combinedPathTags', () => {
    it('a two-way cycleway gets no oneway:bicycle: on a way that is not one-way it says nothing', () => {
        const { tags } = combinedPathTags(
            { highway: 'cycleway', oneway: 'no' },
            { highway: 'footway', footway: 'sidewalk' }
        );
        expect(tags.oneway).toBe('no');
        expect(tags['oneway:bicycle']).toBeUndefined();
    });

    it('makes a segregated path; equal part values merge, different ones get prefixes', () => {
        const { tags, dropped } = combinedPathTags(
            { highway: 'cycleway', is_sidepath: 'yes', surface: 'asphalt', smoothness: 'good', oneway: 'yes' },
            { highway: 'footway', footway: 'sidewalk', surface: 'sett', smoothness: 'good' }
        );
        expect(tags).toEqual({
            highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes', is_sidepath: 'yes',
            'cycleway:surface': 'asphalt', 'footway:surface': 'sett', smoothness: 'good',
            oneway: 'no', 'oneway:bicycle': 'yes'
        });
        expect(dropped).toEqual([]);
    });

    it('prefixes a value that only one part has, with its meta keys', () => {
        const { tags } = combinedPathTags(
            { highway: 'cycleway', surface: 'asphalt', 'check_date:surface': '2026-05-01', 'surface:colour': 'red' },
            { highway: 'footway' }
        );
        expect(tags['cycleway:surface']).toBe('asphalt');
        expect(tags['check_date:cycleway:surface']).toBe('2026-05-01');
        expect(tags['cycleway:surface:colour']).toBe('red');
        expect(tags.surface).toBeUndefined();
        expect(tags.is_sidepath).toBeUndefined();
    });

    it('keeps both widths and adds them up', () => {
        const { tags } = combinedPathTags(
            { highway: 'cycleway', width: '1.6', 'source:width': 'measured' },
            { highway: 'footway', width: '2.5' }
        );
        expect(tags).toMatchObject({ 'cycleway:width': '1.6', 'footway:width': '2.5', width: '4.1', 'source:cycleway:width': 'measured' });
        expect(tags['source:width']).toBeUndefined();
        expect(combinedPathTags({ width: '2' }, {}).tags.width).toBeUndefined();
    });

    it('joins the signs of both parts into one value', () => {
        const merged = (bike: string | undefined, foot: string | undefined) => combinedPathTags(
            bike ? { traffic_sign: bike } : {}, foot ? { traffic_sign: foot } : {}, { recommend }
        ).tags;
        expect(merged('DE:237', 'DE:239')).toMatchObject({ traffic_sign: 'DE:237;239', segregated: 'yes' });
        expect(merged('DE:237', 'DE:239,1022-10').traffic_sign).toBe('DE:237;239,1022-10');
        expect(merged('DE:240', 'DE:240')).toMatchObject({ traffic_sign: 'DE:240', segregated: 'no' });
        expect(merged('DE:241', undefined)).toMatchObject({ traffic_sign: 'DE:241-30', segregated: 'yes' });
        expect(merged('none', 'DE:239').traffic_sign).toBe('DE:239');
        expect(merged('none', 'none').traffic_sign).toBe('none');
        expect(merged(undefined, undefined).traffic_sign).toBeUndefined();
    });

    it('uses the given sign joiner', () => {
        const { tags } = combinedPathTags({ traffic_sign: 'DE:237' }, { traffic_sign: 'DE:239' }, { joinSigns: (a, b) => `${a}+${b}` });
        expect(tags.traffic_sign).toBe('DE:237+DE:239');
        expect(joinSignsPlain('DE:237', 'FR:B22a')).toBe('DE:237;FR:B22a');
    });

    it('removes the traffic mode that names the other part', () => {
        const { tags } = combinedPathTags(
            { highway: 'cycleway', 'traffic_mode:right': 'foot', 'traffic_mode:left': 'motor_vehicle' },
            { highway: 'footway', 'traffic_mode:left': 'bicycle', 'traffic_mode:right': 'none' }
        );
        expect(tags['traffic_mode:left']).toBe('motor_vehicle');
        expect(tags['traffic_mode:right']).toBe('none');
    });

    it('keeps the other keys of both parts; the primary part wins a conflict', () => {
        const bike = { highway: 'cycleway', lit: 'yes', name: 'Radweg', mapillary: '1;2', bicycle: 'designated' };
        const foot = { highway: 'footway', lit: 'no', kerb: 'lowered', mapillary: '2;3', bicycle: 'yes' };
        const byBike = combinedPathTags(bike, foot);
        expect(byBike.tags).toMatchObject({ lit: 'yes', name: 'Radweg', kerb: 'lowered', mapillary: '1;2;3', bicycle: 'designated' });
        expect(byBike.dropped).toEqual(['lit=no']);
        const byFoot = combinedPathTags(bike, foot, { primary: 'foot' });
        expect(byFoot.tags).toMatchObject({ lit: 'no', mapillary: '2;3;1' });
        expect(byFoot.dropped).toEqual(['lit=yes']);
    });
});

describe('reverseTags', () => {
    it('swaps directions, sides and oneway', () => {
        expect(reverseTags({ oneway: 'yes', 'traffic_sign:forward': 'DE:237', 'separation:left': 'kerb', surface: 'asphalt' }))
            .toEqual({ oneway: '-1', 'traffic_sign:backward': 'DE:237', 'separation:right': 'kerb', surface: 'asphalt' });
    });
});

describe('commonTags', () => {
    it('takes every key once, the first piece first', () => {
        expect(commonTags([{ surface: 'sett', lit: 'yes' }, { surface: 'sett', lit: 'no', kerb: 'raised' }]))
            .toEqual({ surface: 'sett', lit: 'yes', kerb: 'raised' });
    });
});

describe('mergeSelection', () => {
    it('needs cycleways and footways only', () => {
        expect(mergeSelection([way('w1', cycleway, 1)])).toBeUndefined();
        expect(mergeSelection([way('w1', cycleway, 1), way('w2', cycleway, 2)])).toBeUndefined();
        expect(mergeSelection([way('w1', cycleway, 1), way('w2', { highway: 'residential' }, 2)])).toBeUndefined();
    });

    it('keeps the older kind: saved beats new, then the older changeset', () => {
        expect(mergeSelection([way('w-1', cycleway, undefined), way('w2', footway, 500)])).toMatchObject({ disabled: false, surviving: 'foot' });
        expect(mergeSelection([way('w1', cycleway, 100), way('w2', footway, 500)])).toMatchObject({ disabled: false, surviving: 'bike' });
        expect(mergeSelection([way('w1', cycleway, 900), way('w2', footway, 500)])).toMatchObject({ disabled: false, surviving: 'foot' });
        expect(mergeSelection([way('w-1', cycleway, undefined), way('w-2', footway, undefined)])).toMatchObject({ surviving: 'foot' });
    });

    it('takes one way plus several of the other kind, never several of both', () => {
        const result = mergeSelection([way('w-1', cycleway, undefined, 100), way('w2', footway, 5, 60), way('w3', footway, 9, 45)]);
        expect(result).toMatchObject({ disabled: false, surviving: 'foot' });
        expect(result && !result.disabled && result.survivors.map(w => w.id)).toEqual(['w2', 'w3']);
        expect(mergeSelection([way('w1', cycleway, 1, 50), way('w2', cycleway, 1, 50), way('w3', footway, 5, 50), way('w4', footway, 5, 50)]))
            .toEqual({ disabled: 'mixed' });
    });

    it('allows lengths that differ by 15 m or 20 %', () => {
        expect(mergeSelection([way('w1', cycleway, 1, 30), way('w2', footway, 2, 44)])).toMatchObject({ disabled: false });
        expect(mergeSelection([way('w1', cycleway, 1, 30), way('w2', footway, 2, 44)])).not.toHaveProperty('cut');
        expect(mergeSelection([way('w1', cycleway, 1, 400), way('w2', footway, 2, 330)])).toMatchObject({ disabled: false });
    });

    it('two ways whose lengths differ more: the longer one is to be cut', () => {
        expect(mergeSelection([way('w1', cycleway, 1, 30), way('w2', footway, 2, 50)])).toMatchObject({ disabled: false, cut: 'foot' });
        expect(mergeSelection([way('w1', cycleway, 1, 400), way('w2', footway, 2, 300)])).toMatchObject({ disabled: false, cut: 'bike' });
    });

    it('more than two ways whose lengths differ too much: split first', () => {
        expect(mergeSelection([way('w1', cycleway, 1, 30), way('w2', footway, 2, 40), way('w3', footway, 3, 40)])).toEqual({ disabled: 'lengths' });
    });

    it('refuses several deleted pieces with different part values', () => {
        const pieces = [way('w2', { ...footway, surface: 'sett' }, 5, 50), way('w3', { ...footway, surface: 'asphalt' }, 6, 50)];
        expect(mergeSelection([way('w1', cycleway, 1), ...pieces])).toEqual({ disabled: 'different_values', key: 'surface' });
        // the pieces survive: each keeps its own value
        expect(mergeSelection([way('w1', cycleway, 9), ...pieces])).toMatchObject({ disabled: false, surviving: 'foot' });
    });
});
