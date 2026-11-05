/**
 * Pure helpers for the measuring tape (feature 21): where the tape starts,
 * how a length is rounded and formatted, and which width keys can be measured.
 * All positions are [lon, lat].
 */
import {
    geoLatToMeters, geoLonToMeters, geoMetersToLat, geoMetersToLon, geoSphericalDistance
} from '../geo/geo';
import type { Vec2 } from '../geo/vector';
import { parseOsmWidth, roadWidthFromTags } from '../width/width_tags';

/** [[west, south], [east, north]] */
export type LonLatExtent = [Vec2, Vec2];

export type TapeEnds = [Vec2, Vec2];

/** Length used when there is neither a value nor a road width */
export const DEFAULT_TAPE_METERS = 2;

/** Measured values are rounded to 5 cm */
export const TAPE_STEP_METERS = 0.05;

const WIDTH_KEY = /(^|:)(est_)?width(:effective)?$/;
const BUFFER_KEY = /^buffer:/;


/** Width keys (including side keys and `buffer:*`) that get a "measure" button */
export function isMeasurableKey(key: string): boolean {
    // `source:width`, `note:width`: about the width, not a width
    if (!key || key.endsWith(':source') || /^(source|note|description|check_date|fixme):/.test(key)) return false;
    if (key === 'maxwidth' || key.startsWith('maxwidth:')) return false;
    return WIDTH_KEY.test(key) || BUFFER_KEY.test(key);
}


/** Rounds a length in meters to 5 cm */
export function roundTapeMeters(meters: number): number {
    return Number((Math.round(meters / TAPE_STEP_METERS) * TAPE_STEP_METERS).toFixed(2));
}


/** Tag value for a length: rounded to 5 cm, no trailing zeros (`2.35`, `2.4`, `3`) */
export function formatTapeValue(meters: number): string {
    return String(roundTapeMeters(meters));
}


/** Label on the map (`3.45 m`) */
export function formatTapeLabel(meters: number): string {
    return `${formatTapeValue(meters)} m`;
}


/** Length in meters between the two ends */
export function tapeLength(ends: TapeEnds): number {
    return geoSphericalDistance(ends[0], ends[1]);
}


/** Length the tape starts with: the field's value, else the road width for `width`, else 2 m */
export function initialTapeMeters(key: string, value: string | undefined, tags: Tags): number {
    const current = parseOsmWidth(value);
    if (current !== undefined && current > 0) return current;
    if (key === 'width') return roadWidthFromTags(tags).meters;
    return DEFAULT_TAPE_METERS;
}


/** Part of the segment a→b inside the extent (Liang-Barsky), or `null` */
export function clipSegmentToExtent(a: Vec2, b: Vec2, extent: LonLatExtent): [Vec2, Vec2] | null {
    const [[west, south], [east, north]] = extent;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const p = [-dx, dx, -dy, dy];
    const q = [a[0] - west, east - a[0], a[1] - south, north - a[1]];
    let t0 = 0;
    let t1 = 1;

    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return null;
        } else {
            const r = q[i] / p[i];
            if (p[i] < 0) {
                if (r > t1) return null;
                if (r > t0) t0 = r;
            } else {
                if (r < t0) return null;
                if (r < t1) t1 = r;
            }
        }
    }
    return [
        [a[0] + t0 * dx, a[1] + t0 * dy],
        [a[0] + t1 * dx, a[1] + t1 * dy]
    ];
}


/**
 * The point in the middle (by length) of the part of the line inside `extent`,
 * and the direction of the segment there. Falls back to the middle of the whole
 * line when nothing is visible.
 */
export function visibleMiddle(
    line: Vec2[], extent: LonLatExtent | null
): { point: Vec2; from: Vec2; to: Vec2 } | null {
    if (line.length < 2) return null;

    const pieces = (extent
        ? line.slice(1).map((loc, i) => clipSegmentToExtent(line[i], loc, extent))
        : line.slice(1).map((loc, i) => [line[i], loc] as [Vec2, Vec2])
    ).filter((piece): piece is [Vec2, Vec2] => !!piece);

    const usable = pieces.length ? pieces : line.slice(1).map((loc, i) => [line[i], loc] as [Vec2, Vec2]);
    const lengths = usable.map(([a, b]) => geoSphericalDistance(a, b));
    const total = lengths.reduce((sum, length) => sum + length, 0);

    let remaining = total / 2;
    for (let i = 0; i < usable.length; i++) {
        if (remaining <= lengths[i] || i === usable.length - 1) {
            const [a, b] = usable[i];
            const t = lengths[i] > 0 ? Math.min(remaining / lengths[i], 1) : 0;
            return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], from: a, to: b };
        }
        remaining -= lengths[i];
    }
    return null;
}


/** Two ends `meters` apart, centered on `point`, at a right angle to the direction from→to */
export function perpendicularEnds(point: Vec2, from: Vec2, to: Vec2, meters: number): TapeEnds {
    const lat = point[1];
    const east = geoLonToMeters(to[0] - from[0], lat);
    const north = geoLatToMeters(to[1] - from[1]);
    const length = Math.hypot(east, north);
    // a degenerate segment: measure west-east
    const [px, py] = length > 0 ? [-north / length, east / length] : [1, 0];

    const half = meters / 2;
    const end = (sign: number): Vec2 => [
        point[0] + geoMetersToLon(sign * px * half, lat),
        point[1] + geoMetersToLat(sign * py * half)
    ];
    return [end(-1), end(1)];
}


/** Starting position of the tape for a way: through the visible middle, perpendicular, centered */
export function initialTapeEnds(line: Vec2[], extent: LonLatExtent | null, meters: number): TapeEnds | null {
    const middle = visibleMiddle(line, extent);
    return middle && perpendicularEnds(middle.point, middle.from, middle.to, meters);
}
