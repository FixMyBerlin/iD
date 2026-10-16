import { accessToken } from '../services/mapillary';

/**
 * Details of a Mapillary image for the Mapillary images field (WORKDOC feature 19):
 * capture time, username and panorama flag from the Graph API, cached per id for the session.
 */

export type MapillaryImageInfo = {
    /** capture time as ISO string */
    capturedAt?: string;
    username?: string;
    isPano: boolean;
};


/** The Graph API sends `captured_at` as epoch milliseconds (or, for old data, an ISO string) */
export function parseImageInfo(json: unknown): MapillaryImageInfo | undefined {
    if (!json || typeof json !== 'object') return undefined;
    const data = json as { captured_at?: number | string; creator?: { username?: string }; is_pano?: boolean; error?: unknown };
    if (data.error) return undefined;

    let capturedAt: string | undefined;
    if (data.captured_at !== undefined && data.captured_at !== null) {
        const date = new Date(data.captured_at);
        if (!isNaN(date.getTime())) capturedAt = date.toISOString();
    }
    const username = data.creator?.username || undefined;
    if (!capturedAt && !username && data.is_pano === undefined) return undefined;
    return { capturedAt, username, isPano: !!data.is_pano };
}


const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60]
];

/** "3 months ago", in the given locale; `undefined` for an invalid date */
export function formatRelativeAge(isoDate: string, now: Date, locale?: string): string | undefined {
    const then = new Date(isoDate).getTime();
    if (isNaN(then)) return undefined;
    const seconds = (then - now.getTime()) / 1000;   // negative: in the past
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    for (const [unit, size] of UNITS) {
        if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
    }
    return formatter.format(0, 'second');
}


const _cache = new Map<string, Promise<MapillaryImageInfo | undefined>>();

/** Loads the details of an image once per session; resolves `undefined` on any error */
export function loadImageInfo(id: string): Promise<MapillaryImageInfo | undefined> {
    let promise = _cache.get(id);
    if (!promise) {
        promise = fetch(`https://graph.mapillary.com/${encodeURIComponent(id)}?fields=captured_at,creator,is_pano`, {
            headers: { Authorization: `OAuth ${accessToken}` }
        })
            .then(response => response.ok ? response.json() : undefined)
            .then(parseImageInfo)
            .catch(() => undefined);
        _cache.set(id, promise);
    }
    return promise;
}
