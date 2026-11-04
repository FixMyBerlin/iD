import { describe, expect, it } from 'vitest';

import { formatMeters, partWidthMismatch, partWidthMode } from '../../../modules/width/part_widths';

describe('partWidthMode', () => {
    it('always shows the parts on a segregated path or when a part is tagged', () => {
        expect(partWidthMode({ highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes' })).toBe('always');
        expect(partWidthMode({ highway: 'footway', 'cycleway:width': '1.5' })).toBe('always');
    });

    it('offers the parts on other paths for walking and cycling', () => {
        expect(partWidthMode({ highway: 'path', bicycle: 'designated', foot: 'designated' })).toBe('optional');
        expect(partWidthMode({ highway: 'cycleway', foot: 'yes' })).toBe('optional');
        expect(partWidthMode({ highway: 'footway', bicycle: 'yes' })).toBe('optional');
    });

    it('has no parts on roads and single-use ways', () => {
        expect(partWidthMode({ highway: 'residential', bicycle: 'yes', foot: 'yes' })).toBeUndefined();
        expect(partWidthMode({ highway: 'cycleway' })).toBeUndefined();
        expect(partWidthMode({ highway: 'footway' })).toBeUndefined();
    });
});

describe('partWidthMismatch', () => {
    it('reports a width that is not the sum of both parts', () => {
        expect(partWidthMismatch({ width: '3', 'cycleway:width': '1.5', 'footway:width': '3' }))
            .toEqual({ width: 3, sum: 4.5, parts: [{ key: 'cycleway:width', meters: 1.5 }, { key: 'footway:width', meters: 3 }] });
    });

    it('accepts the sum, rounding and units', () => {
        expect(partWidthMismatch({ width: '4.5', 'cycleway:width': '1.5', 'footway:width': '3' })).toBeUndefined();
        expect(partWidthMismatch({ width: '4.53', 'cycleway:width': '1.5', 'footway:width': '3' })).toBeUndefined();
        expect(partWidthMismatch({ width: '450 cm', 'cycleway:width': '1.5', 'footway:width': '3 m' })).toBeUndefined();
    });

    it('says nothing when a width is missing: that is for the TILDA checklist', () => {
        expect(partWidthMismatch({ width: '3', 'cycleway:width': '1.5' })).toBeUndefined();
        expect(partWidthMismatch({ 'cycleway:width': '1.5', 'footway:width': '3' })).toBeUndefined();
        expect(partWidthMismatch({ width: 'wide', 'cycleway:width': '1.5', 'footway:width': '3' })).toBeUndefined();
    });

    it('writes meters without trailing zeros', () => {
        expect(formatMeters(4.5)).toBe('4.5');
        expect(formatMeters(4.499999)).toBe('4.5');
    });
});
