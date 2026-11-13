import { describe, expect, it } from 'vitest';

import { stoneSourceMismatches } from '../../../modules/validations/width_stone_source';
import { parseCount } from '../../../modules/measure/stone_calculator';

describe('stoneSourceMismatches', () => {
    it('finds a width that the counted stones do not give (7,5 × 20 cm = 1.5, not 1.4)', () => {
        expect(stoneSourceMismatches({ width: '1.4', 'source:width': '7,5 Steine à 20 cm' }))
            .toEqual([{ key: 'width', source: '7,5 Steine à 20 cm', width: 1.4, stones: '1.5' }]);
        expect(stoneSourceMismatches({ 'cycleway:right:width': '2', 'source:cycleway:right:width': '6 Steine à 20 cm' }))
            .toEqual([{ key: 'cycleway:right:width', source: '6 Steine à 20 cm', width: 2, stones: '1.2' }]);
    });

    it('accepts matching widths, other sources and keys that are no width', () => {
        expect(stoneSourceMismatches({ width: '1.5', 'source:width': '7,5 Steine à 20 cm' })).toEqual([]);
        expect(stoneSourceMismatches({ width: '1.52', 'source:width': '7,5 Steine à 20 cm' })).toEqual([]);
        expect(stoneSourceMismatches({ width: '1.4', 'source:width': 'Luftbild 2026' })).toEqual([]);
        expect(stoneSourceMismatches({ 'source:width': '7,5 Steine à 20 cm' })).toEqual([]);
        expect(stoneSourceMismatches({ 'buffer:left': '1', 'source:buffer:left': '5 Steine à 20 cm' })).toEqual([]);
    });
});

describe('parseCount', () => {
    it('reads a comma or a point', () => {
        expect(parseCount('7,5')).toBe(7.5);
        expect(parseCount('7.5')).toBe(7.5);
        expect(parseCount(' 6 ')).toBe(6);
    });

    it('gives 0 for unfinished or other input', () => {
        expect(parseCount('7,')).toBe(0);
        expect(parseCount('')).toBe(0);
        expect(parseCount('abc')).toBe(0);
    });
});
