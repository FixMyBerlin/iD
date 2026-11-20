import { describe, expect, it } from 'vitest';

import { formatStoneSource, parseStoneSource, stoneWidth } from '../../../modules/measure/stones';

describe('stones', () => {
    it('reads the ways Berlin mappers write stone counts', () => {
        expect(parseStoneSource('6 Steine à 20 cm')).toEqual({ count: 6, cm: 20 });
        expect(parseStoneSource('7,5 Verbundsteine à 20cm')).toEqual({ count: 7.5, cm: 20 });
        expect(parseStoneSource('7,5 Betonpflastersteine a 20cm')).toEqual({ count: 7.5, cm: 20 });
        expect(parseStoneSource('~16 Steine a ~16cm')).toEqual({ count: 16, cm: 16 });
        expect(parseStoneSource('Pflastersteine 6,5*20cm')).toEqual({ count: 6.5, cm: 20 });
        expect(parseStoneSource('Pflastersteine 7x20cm')).toEqual({ count: 7, cm: 20 });
        expect(parseStoneSource('3x 50cm Steine;Mapillary')).toEqual({ count: 3, cm: 50 });
        expect(parseStoneSource('ARCore;15x Pfastersteine 10cm')).toEqual({ count: 15, cm: 10 });
        expect(parseStoneSource('5,5 Steine à 20 cm;Luftbild 2025')).toEqual({ count: 5.5, cm: 20 });
    });

    it('is no stone count for other sources', () => {
        expect(parseStoneSource('Luftbild 2025')).toBeUndefined();
        expect(parseStoneSource('Messung aus Punktwolke (Infra3DViewer)')).toBeUndefined();
        expect(parseStoneSource('Mapillary (Zählen von genormten Pflastersteinen)')).toBeUndefined();
        expect(parseStoneSource(undefined)).toBeUndefined();
    });

    it('writes the source and the width', () => {
        expect(formatStoneSource({ count: 7.5, cm: 20 })).toBe('7,5 Steine à 20 cm');
        expect(stoneWidth({ count: 7.5, cm: 20 })).toBe('1.5');
        expect(stoneWidth({ count: 6, cm: 16 })).toBe('0.96');
    });
});
