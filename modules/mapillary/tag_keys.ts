/**
 * Mapillary image keys in OSM tags (WORKDOC feature 19): which keys hold image ids, what they
 * are about (a road side, a traffic sign, a direction) and which image to show first.
 * Shared by the Mapillary images field, the map layer and the "set photo from viewer" button.
 *
 * Key grammar: `[source:][cycleway|sidewalk[:left|:right|:both]:][traffic_sign[:forward|:backward]:]mapillary[:forward|:backward|:<n>]`
 * (as in the Berlin data and TILDA's `extract_bikelanes.lua`).
 */

export type MapillaryKey = {
    key: string;
    /** `source:` prefix: the image is the source of the tag, not a picture of the feature */
    source: boolean;
    prefix?: 'cycleway' | 'sidewalk';
    side?: 'left' | 'right' | 'both';
    /** image of the traffic sign */
    trafficSign: boolean;
    direction?: 'forward' | 'backward';
    /** `mapillary:2` */
    number?: number;
};

const KEY_PATTERN = /^(source:)?(?:(cycleway|sidewalk)(?::(left|right|both))?:)?(traffic_sign(?::(forward|backward))?:)?mapillary(?::(forward|backward|\d{1,3}))?$/;
/**
 * `source:mapillary:forward` (source before a direction suffix) is covered by the pattern; these keys are not image ids.
 * Year suffixes (`mapillary:2019`, 20 in Germany) are not supported: numbered keys have at most 3 digits.
 */
const NOT_IMAGE_KEYS = new Set(['mapillary:map_feature']);


/** Parse an image key, or `undefined` for other keys (`mapillary:map_feature`, `was:mapillary`) */
export function parseMapillaryKey(key: string): MapillaryKey | undefined {
    if (NOT_IMAGE_KEYS.has(key)) return undefined;
    const match = key.match(KEY_PATTERN);
    if (!match) return undefined;
    const [, source, prefix, side, trafficSign, signDirection, suffix] = match;
    // a direction on the sign (`traffic_sign:forward:mapillary`) or on the image key (`mapillary:forward`)
    const direction = (signDirection ?? (suffix === 'forward' || suffix === 'backward' ? suffix : undefined)) as MapillaryKey['direction'];
    const number = suffix && /^\d+$/.test(suffix) ? Number(suffix) : undefined;
    return {
        key,
        source: !!source,
        prefix: prefix as MapillaryKey['prefix'],
        side: side as MapillaryKey['side'],
        trafficSign: !!trafficSign,
        direction,
        number
    };
}


export function isMapillaryKey(key: string) {
    return parseMapillaryKey(key) !== undefined;
}


/** Image ids of a value: `;`-separated, trimmed, without empty parts */
export function splitImageIds(value: string | undefined): string[] {
    if (!value) return [];
    return value.split(';').map(part => part.trim()).filter(Boolean);
}


export function joinImageIds(ids: string[]): string | undefined {
    const unique = [...new Set(ids.map(id => id.trim()).filter(Boolean))];
    return unique.length ? unique.join(';') : undefined;
}


/** Sort order: the feature's own images first (forward, plain, backward, numbered), then road sides, signs, sources */
function rank(parsed: MapillaryKey) {
    let rank = 0;
    if (parsed.source) rank += 1000;
    if (parsed.trafficSign) rank += 100;
    if (parsed.prefix) rank += parsed.prefix === 'cycleway' ? 10 : 20;
    if (parsed.side) rank += { right: 1, left: 2, both: 3 }[parsed.side];
    const direction = parsed.direction === 'forward' ? 0 : parsed.direction === 'backward' ? 2 : 1;
    return rank * 10 + direction + (parsed.number ?? 0) * 0.01;
}

export function compareMapillaryKeys(a: string, b: string) {
    const pa = parseMapillaryKey(a);
    const pb = parseMapillaryKey(b);
    if (!pa || !pb) return a.localeCompare(b);
    return rank(pa) - rank(pb) || a.localeCompare(b);
}


/** The image keys of `tags` that have a value, in display order */
export function mapillaryKeysOf(tags: Record<string, string | string[] | undefined>): string[] {
    return Object.keys(tags)
        .filter(key => isMapillaryKey(key) && typeof tags[key] === 'string' && tags[key] !== '')
        .sort(compareMapillaryKeys);
}


/** All image ids of `tags` (any image key), in display order, without duplicates */
export function mapillaryImageIds(tags: Record<string, string | string[] | undefined>): string[] {
    const ids = mapillaryKeysOf(tags).flatMap(key => splitImageIds(tags[key] as string));
    return [...new Set(ids)];
}


/** The image to show first when the feature is selected: `mapillary:forward`, then `mapillary`, then the rest in display order */
export function preferredImageId(tags: Record<string, string | string[] | undefined>): string | undefined {
    const keys = mapillaryKeysOf(tags);
    const forward = keys.find(key => key === 'mapillary:forward');
    const plain = keys.find(key => key === 'mapillary');
    const key = forward ?? plain ?? keys[0];
    return key ? splitImageIds(tags[key] as string)[0] : undefined;
}


const SIDE_LABEL = { left: 'left', right: 'right', both: 'both sides' } as const;

/** Short English label for a key: "Right bike lane · traffic sign · forward (source)" */
export function mapillaryKeyLabel(key: string): string {
    const parsed = parseMapillaryKey(key);
    if (!parsed) return key;
    const parts: string[] = [];
    if (parsed.prefix) {
        const thing = parsed.prefix === 'cycleway' ? 'bike lane' : 'sidewalk';
        parts.push(parsed.side ? `${SIDE_LABEL[parsed.side]} ${thing}` : thing);
    }
    if (parsed.trafficSign) parts.push('traffic sign');
    if (parsed.direction) parts.push(parsed.direction);
    if (parsed.number !== undefined) parts.push(`#${parsed.number}`);
    let label = parts.length ? parts.join(' · ') : 'image';
    label = label.charAt(0).toUpperCase() + label.slice(1);
    return parsed.source ? `${label} (source)` : label;
}


/**
 * Keys that make sense to add to a feature: the plain and directional keys, the sign keys when
 * it has a traffic sign, and the road side keys for sides that have a cycleway or sidewalk.
 */
export function suggestedMapillaryKeys(tags: Record<string, string | string[] | undefined>): string[] {
    const keys = ['mapillary', 'mapillary:forward', 'mapillary:backward'];
    // `separate`: the bike lane / sidewalk is its own way, with its own images
    const has = (key: string) => typeof tags[key] === 'string' && !['', 'no', 'none', 'separate'].includes(tags[key] as string);

    if (Object.keys(tags).some(key => /^traffic_sign(:|$)/.test(key))) keys.push('source:traffic_sign:mapillary');
    for (const prefix of ['cycleway', 'sidewalk'] as const) {
        for (const side of ['right', 'left'] as const) {
            const present = has(`${prefix}:${side}`) || has(`${prefix}:both`) || (prefix === 'cycleway' && has('cycleway')) ||
                (prefix === 'sidewalk' && (tags.sidewalk === side || tags.sidewalk === 'both' || tags.sidewalk === 'yes'));
            if (!present) continue;
            keys.push(`${prefix}:${side}:mapillary`);
            if (Object.keys(tags).some(key => key.startsWith(`${prefix}:${side}:traffic_sign`))) {
                keys.push(`source:${prefix}:${side}:traffic_sign:mapillary`);
            }
        }
    }
    return [...new Set([...mapillaryKeysOf(tags), ...keys])].sort(compareMapillaryKeys);
}
