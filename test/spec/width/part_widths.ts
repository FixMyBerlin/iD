import { describe, expect, it } from 'vitest';

import { formatMeters, inheritedPartSource, partWidthMismatch, partWidthMode, partWidthWholeWay, redundantPartSourceUpdate, withoutRedundantPartSources } from '../../../modules/width/part_widths';

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

    it('has no parts on a shared path, or on a cycleway whose footway is apart (way 1304329604)', () => {
        expect(partWidthMode({ highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'no' })).toBeUndefined();
        expect(partWidthMode({ highway: 'cycleway', segregated: 'yes', traffic_sign: 'DE:241-30' })).toBeUndefined();
        expect(partWidthMode({ highway: 'cycleway', foot: 'designated', segregated: 'yes' })).toBe('always');
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


describe('partWidthWholeWay', () => {
    const path = { highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes' };

    it('finds a part as wide as the whole path (way 1304329604: 1.7 and 1.7)', () => {
        expect(partWidthWholeWay({ ...path, width: '1.7', 'cycleway:width': '1.7' }))
            .toEqual({ key: 'cycleway:width', meters: 1.7, width: 1.7 });
        expect(partWidthWholeWay({ ...path, width: '2', 'footway:width': '2.5' })?.key).toBe('footway:width');
    });

    it('accepts a part narrower than the whole, and roads', () => {
        expect(partWidthWholeWay({ ...path, width: '3', 'cycleway:width': '1.7' })).toBeUndefined();
        expect(partWidthWholeWay({ ...path, 'cycleway:width': '1.7' })).toBeUndefined();
        expect(partWidthWholeWay({ highway: 'residential', width: '6', 'cycleway:width': '6' })).toBeUndefined();
    });
});

describe('redundant part sources', () => {
    const infra3d = 'Messung aus Punktwolke (Infra3DViewer)';

    it('drops source:cycleway:width when it says the same as source:width', () => {
        const tags = { width: '1.7', 'source:width': infra3d, 'cycleway:width': '1.7', 'source:cycleway:width': infra3d };
        expect(withoutRedundantPartSources(tags)).toEqual({ width: '1.7', 'source:width': infra3d, 'cycleway:width': '1.7' });
        expect(redundantPartSourceUpdate(tags)).toEqual({ 'source:cycleway:width': undefined });
    });

    it('keeps a different part source, and a part source without a general one', () => {
        const tags = { 'source:width': 'Luftbild 2026', 'source:cycleway:width': infra3d };
        expect(withoutRedundantPartSources(tags)).toBe(tags);
        const only = { 'source:cycleway:width': infra3d };
        expect(withoutRedundantPartSources(only)).toBe(only);
    });

    it('shows the general source on a part without its own', () => {
        expect(inheritedPartSource('source:cycleway:width', { 'source:width': infra3d })).toBe(infra3d);
        expect(inheritedPartSource('source:cycleway:width', { 'source:width': infra3d, 'source:cycleway:width': 'x' })).toBeUndefined();
        expect(inheritedPartSource('source:width', { 'source:width': infra3d })).toBeUndefined();
    });
});
