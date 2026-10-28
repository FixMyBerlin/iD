import { describe, expect, it } from 'vitest';

import { measuredSource } from '../../../modules/measure/measure_tape';

function contextWith(source: { id?: string; name?: () => string } | undefined) {
    return { background: () => ({ baseLayerSource: () => source }) } as unknown as iD.Context;
}

describe('measuredSource', () => {
    it('names the aerial imagery year like the Radinfra mappers do', () => {
        expect(measuredSource(contextWith({ id: 'Berlin-2026', name: () => 'Berlin 2026' }))).toBe('Luftbild 2026');
        expect(measuredSource(contextWith({ id: 'custom', name: () => 'Geoportal Berlin: Orthophotos 2025' }))).toBe('Luftbild 2025');
    });

    it('without a year: just Luftbild', () => {
        expect(measuredSource(contextWith({ id: 'Bing', name: () => 'Bing aerial imagery' }))).toBe('Luftbild');
        expect(measuredSource(contextWith(undefined))).toBe('Luftbild');
    });
});
