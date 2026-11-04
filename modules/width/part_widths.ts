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
 * - `optional`: a path for walking and cycling; the parts can be shown with a button
 * - `undefined`: no parts
 */
export function partWidthMode(tags: TagsLike): 'always' | 'optional' | undefined {
    if (PART_WIDTH_KEYS.some(key => value(tags, key) !== undefined)) return 'always';
    if (!PATH_HIGHWAYS.has(value(tags, 'highway') ?? '')) return undefined;
    if (value(tags, 'segregated') === 'yes') return 'always';

    const highway = value(tags, 'highway');
    const bicycle = highway === 'cycleway' || ALLOWED.has(value(tags, 'bicycle') ?? '');
    const foot = highway === 'footway' || ALLOWED.has(value(tags, 'foot') ?? '');
    return bicycle && foot ? 'optional' : undefined;
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
