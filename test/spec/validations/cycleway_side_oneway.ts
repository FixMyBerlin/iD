import { describe, expect, it } from 'vitest';

import { cyclewayOnewayFindings } from '../../../modules/validations/cycleway_side_oneway';

function kinds(tags: Record<string, string>) {
    return cyclewayOnewayFindings({ highway: 'secondary', ...tags }).map(f => `${f.key}=${f.value}: ${f.kind} (${f.reason})`);
}

describe('cyclewayOnewayFindings (WORKDOC feature 32)', () => {
    it('two-way road: yes on the left side (also via both / no side) is likely wrong', () => {
        expect(kinds({ 'cycleway:left:oneway': 'yes' })).toEqual(['cycleway:left:oneway=yes: wrong (two_way_road)']);
        expect(kinds({ 'cycleway:both:oneway': 'yes' })).toEqual(['cycleway:both:oneway=yes: wrong (two_way_road)']);
        expect(kinds({ 'cycleway:oneway': 'yes' })).toEqual(['cycleway:oneway=yes: wrong (two_way_road)']);
    });

    it('yes on the right side is the default', () => {
        expect(kinds({ 'cycleway:right:oneway': 'yes' })).toEqual(['cycleway:right:oneway=yes: redundant (default)']);
        expect(kinds({ oneway: 'yes', 'cycleway:right:oneway': 'yes' })).toEqual(['cycleway:right:oneway=yes: redundant (default)']);
    });

    it('one-way road: both sides run with the road, so yes is not needed', () => {
        expect(kinds({ oneway: 'yes', 'cycleway:left:oneway': 'yes' })).toEqual(['cycleway:left:oneway=yes: redundant (default)']);
        expect(kinds({ oneway: 'yes', 'cycleway:both:oneway': 'yes' })).toEqual(['cycleway:both:oneway=yes: redundant (default)']);
    });

    it('one-way road that bicycles may ride against: yes on the left (contraflow) side is likely wrong', () => {
        expect(kinds({ oneway: 'yes', 'oneway:bicycle': 'no', 'cycleway:left:oneway': 'yes' }))
            .toEqual(['cycleway:left:oneway=yes: wrong (contraflow)']);
    });

    it('-1 on the left side is reported where it only repeats the default', () => {
        expect(kinds({ 'cycleway:left:oneway': '-1' })).toEqual(['cycleway:left:oneway=-1: redundant (default)']);
        expect(kinds({ oneway: 'yes', 'oneway:bicycle': 'no', 'cycleway:left:oneway': '-1' }))
            .toEqual(['cycleway:left:oneway=-1: redundant (default)']);
    });

    it('not reported: no (two-way track), and -1 that is not the default', () => {
        expect(kinds({ 'cycleway:left:oneway': 'no', 'cycleway:right:oneway': 'no' })).toEqual([]);
        expect(kinds({ 'cycleway:right:oneway': '-1' })).toEqual([]);
        expect(kinds({ oneway: 'yes', 'cycleway:left:oneway': '-1' })).toEqual([]);
        expect(kinds({ 'cycleway:both:oneway': '-1' })).toEqual([]);
    });

    it('not for ways without highway, or roads drawn against their one-way', () => {
        expect(cyclewayOnewayFindings({ 'cycleway:left:oneway': 'yes' })).toEqual([]);
        expect(kinds({ oneway: '-1', 'cycleway:left:oneway': 'yes' })).toEqual([]);
    });
});
