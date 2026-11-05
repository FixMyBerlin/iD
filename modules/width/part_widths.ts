import { parseOsmWidth } from './width_tags';

/**
 * A shared foot and cycle path with a width per part: `cycleway:width` and `footway:width` next to
 * `width` (the whole way). Which part widths a mapper must tag is decided by the TILDA checklist;
 * this only says when the part fields make sense and whether the numbers add up.
 */

export const PART_WIDTH_KEYS = ['cycleway:width', 'footway:width'] as const;
export type PartWidthKey = (typeof PART_WIDTH_KEYS)[number];

const PATH_HIGHWAYS = new Set(['path', 'cycleway', 'footway', 'bridleway']);
const ALLOWED = new Set(['designated', 'yes', 'permissive']);
/** meters: `width` may differ from the sum by rounding */
const TOLERANCE = 0.05;

type TagsLike = Record<string, string | string[] | undefined>;

const value = (tags: TagsLike, key: string) => {
    const v = tags[key];
    return typeof v === 'string' ? v : undefined;
};

/**
 * - `always`: the part widths are shown (a segregated path, or a part width is tagged)
 * - `optional`: a path for walking and cycling without `segregated`; the parts can be shown with a button
 * - `undefined`: no parts
 */
export function partWidthMode(tags: TagsLike): 'always' | 'optional' | undefined {
    if (PART_WIDTH_KEYS.some(key => value(tags, key) !== undefined)) return 'always';
    if (!PATH_HIGHWAYS.has(value(tags, 'highway') ?? '')) return undefined;

    // one way for walking and cycling; a cycleway with the footway apart has no parts
    const highway = value(tags, 'highway');
    const bicycle = highway === 'cycleway' || ALLOWED.has(value(tags, 'bicycle') ?? '');
    const foot = highway === 'footway' || ALLOWED.has(value(tags, 'foot') ?? '');
    if (!bicycle || !foot) return undefined;

    // segregated: parts; shared: one width for walking and cycling, no parts
    if (value(tags, 'segregated') === 'yes') return 'always';
    if (value(tags, 'segregated') === 'no') return undefined;
    return 'optional';
}

export type PartWidthMismatch = {
    width: number;
    parts: { key: PartWidthKey; meters: number }[];
    sum: number;
};

/** `width` and both part widths are tagged and `width` is not their sum; else undefined */
export function partWidthMismatch(tags: TagsLike): PartWidthMismatch | undefined {
    const width = parseOsmWidth(value(tags, 'width'));
    if (width === undefined) return undefined;
    const parts = PART_WIDTH_KEYS.map(key => ({ key, meters: parseOsmWidth(value(tags, key)) }));
    // one part alone says nothing about the whole
    if (parts.some(part => part.meters === undefined)) return undefined;
    const sum = parts.reduce((total, part) => total + part.meters!, 0);
    if (Math.abs(sum - width) <= TOLERANCE) return undefined;
    return { width, parts: parts as PartWidthMismatch['parts'], sum: Math.round(sum * 100) / 100 };
}

/** Meters as an OSM value: `4.5`, not `4.50` */
export function formatMeters(meters: number): string {
    return String(Math.round(meters * 100) / 100);
}


export type PartWidthWholeWay = { key: PartWidthKey; meters: number; width: number };

/**
 * A part (`cycleway:width` or `footway:width`) of a foot and cycle path is as wide as the whole
 * way (or wider): nothing would be left for the other part. Usually the width of the whole way
 * was copied into the part, or the way is no shared path. Undefined otherwise.
 */
export function partWidthWholeWay(tags: TagsLike): PartWidthWholeWay | undefined {
    if (!PATH_HIGHWAYS.has(value(tags, 'highway') ?? '')) return undefined;
    const width = parseOsmWidth(value(tags, 'width'));
    if (width === undefined) return undefined;
    for (const key of PART_WIDTH_KEYS) {
        const meters = parseOsmWidth(value(tags, key));
        if (meters !== undefined && meters >= width - TOLERANCE) return { key, meters, width };
    }
    return undefined;
}

/**
 * The general source wins: `source:cycleway:width` (and `source:footway:width`) is not stored when
 * it says the same as `source:width`. Returns the tags without those keys (a new object when
 * something was dropped).
 */
export function withoutRedundantPartSources<T extends TagsLike>(tags: T): T {
    const general = value(tags, 'source:width');
    if (!general) return tags;
    const redundant = PART_WIDTH_KEYS.map(key => `source:${key}`).filter(key => value(tags, key) === general);
    if (!redundant.length) return tags;
    const result = { ...tags };
    for (const key of redundant) delete result[key];
    return result;
}

/** The part source keys that `withoutRedundantPartSources` drops, as an update (`undefined` values) */
export function redundantPartSourceUpdate(tags: TagsLike): Record<string, undefined> {
    const kept = withoutRedundantPartSources(tags);
    const update: Record<string, undefined> = {};
    for (const key of Object.keys(tags)) {
        if (!(key in kept)) update[key] = undefined;
    }
    return update;
}

/** The general source a part source inherits: `source:width` for `source:cycleway:width` */
export function inheritedPartSource(key: string, tags: TagsLike): string | undefined {
    if (!PART_WIDTH_KEYS.some(part => key === `source:${part}`)) return undefined;
    return value(tags, key) ? undefined : value(tags, 'source:width');
}
