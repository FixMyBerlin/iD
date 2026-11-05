import { describe, expect, it } from 'vitest';

import { ageBand, ageBandClass, ageBandStarts } from '../../../modules/mapillary/age_bands';

describe('mapillary/age_bands', () => {
    const cutoff = '2024-01-01';
    const now = Date.UTC(2026, 8, 30);
    const ms = (s: string) => Date.parse(s);

    it('marks images older than the cutoff as outdated', () => {
        expect(ageBand(ms('2023-12-31'), cutoff, now)).toBe('outdated');
        expect(ageBand(undefined, cutoff, now)).toBe('outdated');
    });

    it('splits cutoff to now into thirds', () => {
        expect(ageBand(ms('2024-01-01'), cutoff, now)).toBe('old');
        expect(ageBand(ms('2024-11-20'), cutoff, now)).toBe('old');
        expect(ageBand(ms('2025-01-15'), cutoff, now)).toBe('mid');
        expect(ageBand(ms('2025-09-01'), cutoff, now)).toBe('mid');
        expect(ageBand(ms('2025-11-01'), cutoff, now)).toBe('new');
        expect(ageBand(now, cutoff, now)).toBe('new');
    });

    it('accepts ms strings and numbers', () => {
        expect(ageBand(String(ms('2026-09-01')), cutoff, now)).toBe('new');
        expect(ageBand(ms('2026-09-01'), ms(cutoff), now)).toBe('new');
    });

    it('handles a cutoff in the future', () => {
        expect(ageBand(now, '2027-01-01', now)).toBe('outdated');
        expect(ageBand(now, now, now)).toBe('new');
    });

    it('gives class names and band starts', () => {
        expect(ageBandClass('mid')).toBe('mly-age-mid');
        const starts = ageBandStarts(cutoff, now);
        expect(starts.old).toBe(ms(cutoff));
        expect(new Date(starts.new).toISOString().slice(0, 7)).toBe('2025-10');
        expect(new Date(starts.mid).toISOString().slice(0, 10) >= '2024-11-29').toBe(true);
    });
});
