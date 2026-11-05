import { newRelatedKey } from '../presets/related_tags';
import { appendImageId } from './set_photo';
import { addSignToValue } from './sign_groups';
import { sidesWith } from '../traffic_sign/sign_field_rows';

/**
 * Writing a Mapillary traffic sign to the selected way (WORKDOC feature 26): the keys it can go to
 * and the tag changes. Pure.
 */

type TagsLike = Record<string, string | string[] | undefined>;

export type SignDirection = 'forward' | 'backward';


/**
 * The three keys a sign can be written to, as buttons (WORKDOC feature 26): plain, `:forward` and
 * `:backward` of one base key. For bike signs the base is the sign key of the road side the sign
 * stands on, if that side has a bike lane (else a sidewalk); otherwise the way's own `traffic_sign`.
 * `suggested` is the key that fits the sign's direction: on the way's own key the direction (plain
 * when the way is one-way that way); on the sides plain, as directions are rare there.
 */
export function signButtonKeys(tags: TagsLike, options: { side?: 'left' | 'right'; bikeSign?: boolean; direction?: SignDirection } = {}): { keys: string[]; suggested: string } {
    let base = 'traffic_sign';
    if (options.bikeSign && options.side) {
        const onSide = (group: 'cycleway' | 'sidewalk') => sidesWith(tags, group).some(side => side === options.side || side === 'both');
        if (onSide('cycleway')) base = `cycleway:${options.side}:traffic_sign`;
        else if (onSide('sidewalk')) base = `sidewalk:${options.side}:traffic_sign`;
    }
    const keys = [base, `${base}:forward`, `${base}:backward`];
    const suggested = base === 'traffic_sign' && options.direction && !isOneWayIn(tags, options.direction)
        ? `${base}:${options.direction}` : base;
    return { keys, suggested };
}


/** Whether the way is one-way in exactly this direction (then the plain key says it all) */
function isOneWayIn(tags: TagsLike, direction: SignDirection): boolean {
    const oneway = tags.oneway;
    return (oneway === 'yes' || oneway === '1') ? direction === 'forward'
        : oneway === '-1' ? direction === 'backward'
        : false;
}


/** Bearing in degrees of the way at its segment nearest to the point */
export function bearingAlongLine(coords: readonly [number, number][], point: [number, number]): number | undefined {
    const segment = nearestSegment(coords, point);
    if (!segment) return undefined;
    const [a, b] = segment;
    const scale = Math.cos(point[1] * Math.PI / 180);
    return (Math.atan2((b[0] - a[0]) * scale, b[1] - a[1]) * 180 / Math.PI + 360) % 360;
}


/**
 * The direction along the way a sign applies to. Mapillary's `aligned_direction` is where the
 * sign's face points; the traffic reading it travels the opposite way. Signs across the way
 * (60°–120° off) have no direction.
 */
export function signDirectionOnWay(coords: readonly [number, number][], signLoc: [number, number], alignedDirection: number | undefined): SignDirection | undefined {
    if (alignedDirection === undefined || !isFinite(alignedDirection)) return undefined;
    const wayBearing = bearingAlongLine(coords, signLoc);
    if (wayBearing === undefined) return undefined;
    const travel = (alignedDirection + 180) % 360;
    const diff = Math.abs(((travel - wayBearing + 540) % 360) - 180);
    if (diff <= 60) return 'forward';
    if (diff >= 120) return 'backward';
    return undefined;
}


/** Directional variant of speed tags: `maxspeed` → `maxspeed:forward`, `source:maxspeed` → `source:maxspeed:forward` */
export function directionalTags(changes: Record<string, string>, direction: SignDirection): Record<string, string> {
    return Object.fromEntries(Object.entries(changes).map(([key, value]) => [`${key}:${direction}`, value]));
}


function nearestSegment(coords: readonly [number, number][], point: [number, number]): [[number, number], [number, number], number] | undefined {
    const scale = Math.cos(point[1] * Math.PI / 180);
    let best: [[number, number], [number, number], number] | undefined;
    for (let i = 0; i < coords.length - 1; i++) {
        const [a, b] = [coords[i], coords[i + 1]];
        const [ax, ay, bx, by] = [a[0] * scale, a[1], b[0] * scale, b[1]];
        const [px, py] = [point[0] * scale, point[1]];
        const [dx, dy] = [bx - ax, by - ay];
        const lengthSq = dx * dx + dy * dy;
        if (!lengthSq) continue;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
        const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (!best || dist < best[2]) best = [a, b, dist];
    }
    return best;
}


/** Which side of the line (way direction) the point is on, by its nearest segment */
export function sideOfLine(coords: readonly [number, number][], point: [number, number]): 'left' | 'right' | undefined {
    const segment = nearestSegment(coords, point);
    if (!segment) return undefined;
    const [a, b] = segment;
    const scale = Math.cos(point[1] * Math.PI / 180);
    const cross = (b[0] - a[0]) * scale * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) * scale;
    if (cross === 0) return undefined;
    return cross > 0 ? 'left' : 'right';
}


/** Tags after writing `sign` to `key` (supplementary signs are appended) */
export function signTagChanges(tags: TagsLike, key: string, sign: string): Record<string, string> {
    const current = typeof tags[key] === 'string' ? tags[key] as string : undefined;
    return { [key]: addSignToValue(current, sign) };
}


/** Tags after adding the image as source of the sign key: `source:traffic_sign:mapillary` */
export function signSourceChanges(tags: TagsLike, key: string, imageId: string): Record<string, string> {
    const sourceKey = newRelatedKey('mapillary', key);
    return { [sourceKey]: appendImageId(tags, sourceKey, imageId) };
}


/** Whether the change would leave every tag as it is */
export function changesNothing(tags: TagsLike, changes: Record<string, string>): boolean {
    return Object.entries(changes).every(([key, value]) => tags[key] === value);
}


export type ChangeLabel = {
    label: string;
    /** every tag of the change is already there */
    present: boolean;
    /** the main tag's value now, when the change would replace it */
    replaces?: string;
};

/** Image ids are long: `1586805862897512` → `1586…`; lists show their last id */
function shortValue(value: string): string {
    const last = value.split(';').pop() ?? value;
    return /^\d{8,}$/.test(last) ? `${last.slice(0, 4)}…` : value;
}


/**
 * Button label of a change, by its main (first) tag: `maxspeed=30`, `✓ maxspeed=30` when it is
 * tagged already, `maxspeed=50→30` when another value is tagged, `key=+1586…` when an image id is
 * added to a list. Without the key (`withKey: false`) only the values.
 */
export function changeLabel(tags: TagsLike, changes: Record<string, string>, withKey = true): ChangeLabel {
    const [key, value] = Object.entries(changes)[0] ?? ['', ''];
    const current = typeof tags[key] === 'string' && tags[key] !== '' ? tags[key] as string : undefined;
    const prefix = withKey ? `${key}=` : '';
    if (changesNothing(tags, changes)) return { label: `✓ ${prefix}${shortValue(value)}`, present: true };
    if (current && value.startsWith(`${current};`)) return { label: `${prefix}+${shortValue(value)}`, present: false };
    if (current && current !== value) return { label: `${prefix}${shortValue(current)}→${shortValue(value)}`, present: false, replaces: current };
    return { label: `${prefix}${shortValue(value)}`, present: false };
}
