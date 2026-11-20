/**
 * Age colors of Mapillary imagery (WORKDOC feature 18).
 * Older than the cutoff = `outdated` (red). The time from the cutoff to now is split into three
 * equal parts: `old` (orange), `mid` (yellow), `new` (green).
 */

export type AgeBand = 'outdated' | 'old' | 'mid' | 'new';

export const AGE_BANDS: AgeBand[] = ['outdated', 'old', 'mid', 'new'];

function toMs(value: number | string | undefined): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const ms = typeof value === 'number' ? value : (/^\d+$/.test(value) ? Number(value) : new Date(value).getTime());
    return isNaN(ms) ? undefined : ms;
}


/** Band of an image; images without a valid date count as outdated */
export function ageBand(capturedAt: number | string | undefined, cutoff: number | string, now: number): AgeBand {
    const t = toMs(capturedAt);
    const c = toMs(cutoff);
    if (t === undefined || c === undefined) return 'outdated';
    if (t < c) return 'outdated';
    const span = now - c;
    if (span <= 0) return 'new';
    const fraction = (t - c) / span;
    if (fraction < 1 / 3) return 'old';
    if (fraction < 2 / 3) return 'mid';
    return 'new';
}


/** CSS class of a band */
export function ageBandClass(band: AgeBand) {
    return 'mly-age-' + band;
}


/** Start (ms) of each non-outdated band, for the legend */
export function ageBandStarts(cutoff: number | string, now: number): Record<Exclude<AgeBand, 'outdated'>, number> {
    const c = toMs(cutoff) ?? now;
    const third = (now - c) / 3;
    return { old: c, mid: c + third, new: c + 2 * third };
}
