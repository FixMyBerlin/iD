import { describe, expect, it } from 'vitest';

import {
    isSidePrerequisite,
    matchesPrerequisite,
    removeUnmetSideValues,
    sideOfKey,
    sidePrerequisiteAllowed,
    sideValue
} from '../../../../modules/ui/fields/side_prerequisite';

describe('ui/fields/side_prerequisite', () => {
    const lane = { key: 'cycleway:{side}', value: 'lane' };
    const keys = ['cycleway:left:lane', 'cycleway:right:lane'];

    it('recognizes a prerequisite with a side in its key', () => {
        expect(isSidePrerequisite(lane)).toBe(true);
        expect(isSidePrerequisite({ key: 'surface', value: 'sett' })).toBe(false);
        expect(isSidePrerequisite(undefined)).toBe(false);
    });

    it('finds the side of a key', () => {
        expect(sideOfKey('cycleway:right:lane')).toBe('right');
        expect(sideOfKey('cycleway:left')).toBe('left');
        expect(sideOfKey('bicycle:forward')).toBe('forward');
        expect(sideOfKey('cycleway:lane')).toBeUndefined();
    });

    it('reads the side value from the side key, then :both, then the key without side', () => {
        expect(sideValue({ 'cycleway:right': 'track', 'cycleway:both': 'lane' }, 'cycleway:{side}', 'right')).toBe('track');
        expect(sideValue({ 'cycleway:both': 'lane' }, 'cycleway:{side}', 'right')).toBe('lane');
        expect(sideValue({ cycleway: 'no' }, 'cycleway:{side}', 'left')).toBe('no');
        expect(sideValue({}, 'cycleway:{side}', 'left')).toBeUndefined();
    });

    it('matches values like upstream prerequisiteTag', () => {
        expect(matchesPrerequisite(lane, 'lane')).toBe(true);
        expect(matchesPrerequisite(lane, 'no')).toBe(false);
        expect(matchesPrerequisite({ key: 'x', valuesNot: ['no', 'separate'] }, 'track')).toBe(true);
        expect(matchesPrerequisite({ key: 'x', valuesNot: ['no', 'separate'] }, 'no')).toBe(false);
        expect(matchesPrerequisite({ key: 'x' }, undefined)).toBe(false);
    });

    describe('removeUnmetSideValues', () => {
        const fields = [{ keys, prerequisiteTag: lane }];

        it('removes the side value when the change breaks the prerequisite', () => {
            const before = { 'cycleway:left': 'no', 'cycleway:right': 'lane', 'cycleway:right:lane': 'advisory' };
            const after = { ...before, 'cycleway:right': 'no' };
            expect(removeUnmetSideValues(fields, before, after)).toEqual({ 'cycleway:left': 'no', 'cycleway:right': 'no' });
        });

        it('keeps a common value on the other side', () => {
            const before = { 'cycleway:both': 'lane', 'cycleway:both:lane': 'exclusive' };
            const after = { 'cycleway:left': 'no', 'cycleway:right': 'lane', 'cycleway:both:lane': 'exclusive' };
            expect(removeUnmetSideValues(fields, before, after))
                .toEqual({ 'cycleway:left': 'no', 'cycleway:right': 'lane', 'cycleway:right:lane': 'exclusive' });
        });

        it('keeps data that did not match before, and unrelated changes', () => {
            const conflicting = { 'cycleway:right': 'track', 'cycleway:right:lane': 'advisory' };
            expect(removeUnmetSideValues(fields, conflicting, { ...conflicting, surface: 'asphalt' }))
                .toEqual({ ...conflicting, surface: 'asphalt' });
            const ok = { 'cycleway:right': 'lane', 'cycleway:right:lane': 'advisory' };
            expect(removeUnmetSideValues(fields, ok, ok)).toBe(ok);
        });
    });

    it('allows the field when one side meets the prerequisite, on every entity', () => {
        expect(sidePrerequisiteAllowed(lane, keys, [{ 'cycleway:left': 'no', 'cycleway:right': 'lane' }])).toBe(true);
        expect(sidePrerequisiteAllowed(lane, keys, [{ 'cycleway:both': 'no' }])).toBe(false);
        expect(sidePrerequisiteAllowed(lane, keys, [{ 'cycleway:right': 'lane' }, { cycleway: 'track' }])).toBe(false);
        expect(sidePrerequisiteAllowed(lane, keys, [{}])).toBe(false);
    });
});
