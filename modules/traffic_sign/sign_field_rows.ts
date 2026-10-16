/**
 * Which traffic sign keys the three traffic sign fields show as rows (WORKDOC feature 27):
 * the way's own sign, the bike lanes' signs and the sidewalks' signs. Pure.
 *
 * Germany (taginfo 2026-10-01): `traffic_sign` 675k, `:forward` 28k, `:backward` 23k;
 * `cycleway:right:traffic_sign` 13.9k, `:left:` 4.6k, `:both:` 4.5k, `cycleway:traffic_sign` 1.3k;
 * `sidewalk:right:traffic_sign` 3k, `:left:` 2.1k, `:both:` 1k. Directions on the sides are rare
 * (< 300 each), so the sides show them only when tagged.
 */

type TagsLike = Record<string, string | string[] | undefined>;

export type SignGroup = 'way' | 'cycleway' | 'sidewalk';
export type Side = 'left' | 'right' | 'both';
export type Direction = 'forward' | 'backward';

export type SignRow = { key: string; side?: Side; direction?: Direction };

const SIDES: readonly Side[] = ['left', 'right', 'both'];
const DIRECTIONS: readonly Direction[] = ['forward', 'backward'];

/** Values of `cycleway:<side>` / `sidewalk:<side>` that mean "nothing on this side of the way" */
const NOTHING = new Set(['no', 'none', 'separate']);


function value(tags: TagsLike, key: string): string | undefined {
    const v = tags[key];
    return typeof v === 'string' && v !== '' ? v : undefined;
}


/** `cycleway:right:traffic_sign:forward` → its parts; `undefined` for other keys */
export function parseSignKey(key: string): (SignRow & { group: SignGroup }) | undefined {
    const match = key.match(/^(?:(cycleway|sidewalk)(?::(left|right|both))?:)?traffic_sign(?::(forward|backward))?$/);
    if (!match) return undefined;
    return {
        key,
        group: (match[1] as SignGroup | undefined) ?? 'way',
        side: match[2] as Side | undefined,
        direction: match[3] as Direction | undefined
    };
}


/**
 * The sides of the way with a bike lane / sidewalk: a side's own key wins over `:both`, which
 * wins over the plain key (`cycleway=lane` means both sides, `sidewalk=left` only the left one).
 * Both sides without a key of their own are one row, `both`.
 */
export function sidesWith(tags: TagsLike, group: 'cycleway' | 'sidewalk'): Side[] {
    const has = (side: 'left' | 'right') => {
        const own = value(tags, `${group}:${side}`) ?? value(tags, `${group}:both`);
        if (own) return !NOTHING.has(own);
        const plain = value(tags, group);
        if (!plain) return false;
        return group === 'sidewalk' ? plain === 'both' || plain === side : !NOTHING.has(plain);
    };
    const [left, right] = [has('left'), has('right')];
    const ownKeys = value(tags, `${group}:left`) !== undefined || value(tags, `${group}:right`) !== undefined;
    if (left && right && !ownKeys) return ['both'];
    return (['left', 'right'] as const).filter(side => side === 'left' ? left : right);
}


/**
 * Rows of a traffic sign field:
 * - `way`: `traffic_sign`, plus `:forward` / `:backward` when tagged or `added`
 * - `cycleway` / `sidewalk`: one row per side with a lane / sidewalk (`sidesWith`), plus every
 *   tagged sign key of the group (also directions and `cycleway:traffic_sign`)
 */
export function signRows(tags: TagsLike, group: SignGroup, added: ReadonlySet<string> = new Set()): SignRow[] {
    const rows = new Map<string, SignRow>();
    const add = (key: string) => {
        const parsed = parseSignKey(key);
        if (parsed && !rows.has(key)) rows.set(key, { key, side: parsed.side, direction: parsed.direction });
    };

    if (group === 'way') {
        add('traffic_sign');
        for (const direction of DIRECTIONS) {
            const key = `traffic_sign:${direction}`;
            if (value(tags, key) || added.has(key)) add(key);
        }
        return [...rows.values()];
    }

    const tagged = Object.keys(tags).filter(key => value(tags, key) && parseSignKey(key)?.group === group);
    // signs tagged per side split a `both` side into its two sides
    const perSide = tagged.some(key => ['left', 'right'].includes(parseSignKey(key)?.side ?? ''));
    for (const side of sidesWith(tags, group)) {
        for (const rowSide of side === 'both' && perSide ? ['left', 'right'] : [side]) add(`${group}:${rowSide}:traffic_sign`);
    }
    for (const key of tagged) add(key);
    return [...rows.values()].sort(compareRows);
}


function compareRows(a: SignRow, b: SignRow): number {
    const sideRank = (row: SignRow) => row.side ? SIDES.indexOf(row.side) : -1;
    const directionRank = (row: SignRow) => row.direction ? DIRECTIONS.indexOf(row.direction) + 1 : 0;
    return sideRank(a) - sideRank(b) || directionRank(a) - directionRank(b);
}


/** All keys the three fields show for these tags, in field order */
export function allSignRowKeys(tags: TagsLike, added?: ReadonlySet<string>): string[] {
    return (['way', 'cycleway', 'sidewalk'] as const).flatMap(group => signRows(tags, group, added).map(row => row.key));
}


/** The way's signs as the field shows them: for the whole way and per direction */
export type WaySigns = { whole?: string; forward?: string; backward?: string };

const WAY_SIGN_KEY: Record<keyof WaySigns, string> = {
    whole: 'traffic_sign',
    forward: 'traffic_sign:forward',
    backward: 'traffic_sign:backward'
};


/**
 * Merges the way's direction signs into the sign for the whole way (the key without a suffix)
 * when they say the same, like `:left` + `:right` become `:both`:
 * - forward and backward are equal, and the whole way has no sign or the same one
 * - one direction repeats the sign of the whole way and the other direction has none
 */
export function mergeWaySigns(signs: WaySigns): WaySigns {
    const { whole, forward, backward } = signs;
    if (forward && forward === backward && (!whole || whole === forward)) return { whole: forward };
    if (whole && forward === whole && !backward) return { whole };
    if (whole && backward === whole && !forward) return { whole };
    return { ...signs };
}


export function waySigns(tags: TagsLike): WaySigns {
    return {
        whole: value(tags, WAY_SIGN_KEY.whole),
        forward: value(tags, WAY_SIGN_KEY.forward),
        backward: value(tags, WAY_SIGN_KEY.backward)
    };
}


/** The tag changes that make `tags` say `signs` (`undefined` removes a tag) */
export function waySignChanges(tags: TagsLike, signs: WaySigns): Record<string, string | undefined> {
    const changes: Record<string, string | undefined> = {};
    for (const part of Object.keys(WAY_SIGN_KEY) as (keyof WaySigns)[]) {
        const key = WAY_SIGN_KEY[part];
        if (value(tags, key) !== signs[part]) changes[key] = signs[part];
    }
    return changes;
}
