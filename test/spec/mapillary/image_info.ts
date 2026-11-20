import { describe, expect, it } from 'vitest';
import { formatRelativeAge, parseImageInfo } from '../../../modules/mapillary/image_info';

describe('parseImageInfo', () => {
    it('reads epoch milliseconds, username and panorama flag', () => {
        expect(parseImageInfo({ captured_at: 1751550913000, creator: { username: 'radinfra', id: '1' }, is_pano: true }))
            .toEqual({ capturedAt: '2025-07-03T13:55:13.000Z', username: 'radinfra', isPano: true });
    });

    it('accepts an ISO date and a missing creator', () => {
        expect(parseImageInfo({ captured_at: '2024-01-02T00:00:00Z' }))
            .toEqual({ capturedAt: '2024-01-02T00:00:00.000Z', username: undefined, isPano: false });
    });

    it('returns undefined for errors and empty answers', () => {
        expect(parseImageInfo({ error: { message: 'x' } })).toBeUndefined();
        expect(parseImageInfo({})).toBeUndefined();
        expect(parseImageInfo(null)).toBeUndefined();
    });
});


describe('formatRelativeAge', () => {
    const now = new Date('2026-09-30T12:00:00Z');

    it('picks the largest fitting unit', () => {
        expect(formatRelativeAge('2026-06-30T12:00:00Z', now, 'en')).toBe('3 months ago');
        expect(formatRelativeAge('2024-09-30T12:00:00Z', now, 'en')).toBe('2 years ago');
        expect(formatRelativeAge('2026-09-27T12:00:00Z', now, 'en')).toBe('3 days ago');
        expect(formatRelativeAge('2026-09-30T09:00:00Z', now, 'en')).toBe('3 hours ago');
    });

    it('uses the locale', () => {
        expect(formatRelativeAge('2026-06-30T12:00:00Z', now, 'de')).toBe('vor 3 Monaten');
    });

    it('returns undefined for invalid dates', () => {
        expect(formatRelativeAge('nope', now, 'en')).toBeUndefined();
    });
});
