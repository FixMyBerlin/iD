/**
 * Mapillary traffic signs (WORKDOC feature 26): the groups of the "Traffic signs" filter and what a
 * detected sign means in German traffic sign values (`DE:237`) and tags.
 *
 * Mapillary values look like `regulatory--maximum-speed-limit-30--g1`: category, name, design variant.
 * The groups match the name, so new design variants are covered. Counts in comments are Berlin
 * detections (vizsim/mapillary_trafficsigns, 2026-09-30). The table could later move into the
 * traffic sign tool's country data.
 */

export type SignGroup = 'bike' | 'speed' | 'access' | 'other';

export const SIGN_GROUPS: readonly SignGroup[] = ['bike', 'speed', 'access', 'other'];

const GROUP_PATTERNS: Record<Exclude<SignGroup, 'other'>, RegExp> = {
    // bicycles-only 10k, except-bicycles 1.7k, bicycles-crossing 1.7k, shared-path 1.7k, dual-path 1k,
    // dead-end-except-bicycles-and-pedestrians 1.1k; pedestrians-only 3.9k (with "bicycles allowed" a footway for bikes)
    bike: /bicycl|bike|cyclist|cycling|pedestrians-only/,
    // maximum-speed-limit-* 35k, speed-limit-zone 7.4k, end-of-speed-limit-zone 1.9k, living-street 1.5k
    speed: /speed|living-street|built-up-area/,
    // no-entry 10k, road-closed-to-vehicles 4.8k, buses-only 3.4k, one-way-* 4.5k
    access: /one-way|no-entry|road-closed|no-motor-vehicles|no-heavy-goods|no-motorcycles|no-buses|(buses|trams|taxi|trucks|vehicles)-only|except-(vehicles|buses|trams)/
};


/** Whether a Mapillary value is a traffic sign (and not an object like `object--bench`) */
export function isSignValue(value: string): boolean {
    return /^(regulatory|warning|information|complementary)--/.test(value);
}


/** `regulatory--maximum-speed-limit-30--g1` → `maximum-speed-limit-30` */
export function signName(value: string): string {
    const parts = value.split('--');
    return parts.length >= 2 ? parts[1] : value;
}


/** The groups of a sign; `other` when it is in none of the named ones */
export function signGroupsOf(value: string): SignGroup[] {
    const name = signName(value);
    const groups = (Object.keys(GROUP_PATTERNS) as Exclude<SignGroup, 'other'>[])
        .filter(group => GROUP_PATTERNS[group].test(name));
    return groups.length ? groups : ['other'];
}


/** Whether the filter shows this sign: no groups or all groups chosen show everything */
export function signMatchesGroups(value: string, groups: readonly SignGroup[]): boolean {
    if (!groups.length || SIGN_GROUPS.every(group => groups.includes(group))) return true;
    return signGroupsOf(value).some(group => groups.includes(group));
}


/** Parses a list of group ids, dropping unknown ones */
export function parseSignGroups(list: readonly string[]): SignGroup[] {
    return SIGN_GROUPS.filter(group => list.includes(group));
}


export type SignMeaning = {
    /** Possible German sign values, the likely one first (`['DE:241-30', 'DE:241-31']`) */
    signs: string[];
    /** Tags to set instead of a traffic sign value (speed signs: `maxspeed` with its source) */
    tags?: Record<string, string>[];
};

/** Fixed meanings, by name; `name--gN` wins over `name` */
const MEANINGS: Record<string, string[]> = {
    'bicycles-only': ['DE:237'],
    'shared-path-pedestrians-and-bicycles': ['DE:240'],
    'shared-path-bicycles-and-pedestrians': ['DE:240'],
    // the order of the symbols: bicycles left is 241-30
    'dual-path-bicycles-and-pedestrians': ['DE:241-30', 'DE:241-31'],
    'dual-path-pedestrians-and-bicycles': ['DE:241-31', 'DE:241-30'],
    'end-of-bicycles-only--g2': ['DE:244.2'],
    'pedestrians-only': ['DE:239'],
    'no-bicycles': ['DE:254'],
    'except-bicycles': ['DE:1022-10'],
    'bicycles': ['DE:1010-52'],
    // vizsim maps it to "bicycles in both directions"
    'bike-route--g1': ['DE:1000-33'],
    'bicycles-and-buses-only': ['DE:245,1022-10'],
    'dead-end-except-bicycles-and-pedestrians': ['DE:357-50'],
    'dead-end-except-bicycles': ['DE:357-50'],
    'bicycles-crossing': ['DE:138'],
    'speed-limit-zone': ['DE:274.1', 'DE:274.1-20'],
    'end-of-speed-limit-zone': ['DE:274.2', 'DE:274.2-20'],
    'living-street': ['DE:325.1'],
    'end-of-living-street': ['DE:325.2'],
    'built-up-area': ['DE:310'],
    'end-of-built-up-area': ['DE:311'],
    'no-entry': ['DE:267'],
    'one-way-left': ['DE:220-10'],
    'one-way-right': ['DE:220-20'],
    'road-closed-to-vehicles': ['DE:250'],
    'no-motor-vehicles': ['DE:260'],
    'no-motor-vehicles-except-motorcycles': ['DE:251'],
    'no-heavy-goods-vehicles': ['DE:253'],
    'no-motorcycles': ['DE:255'],
    'no-pedestrians': ['DE:259'],
    'buses-only': ['DE:245']
};

const ZONE_TAGS: Record<string, Record<string, string>> = {
    'DE:274.1': { maxspeed: '30', 'source:maxspeed': 'DE:zone30' },
    'DE:274.1-20': { maxspeed: '20', 'source:maxspeed': 'DE:zone20' }
};


/** What the sign means in Germany, or `undefined` when we don't know it */
export function signMeaning(value: string): SignMeaning | undefined {
    const parts = value.split('--');
    const name = signName(value);
    const variant = parts[2];
    const category = parts[0];

    const limit = name.match(/^maximum-speed-limit-(?:led-)?(\d+)$/);
    if (limit && category === 'regulatory') {
        return { signs: [`DE:274-${limit[1]}`], tags: [{ maxspeed: limit[1], 'source:maxspeed': 'sign' }] };
    }
    const end = name.match(/^end-of-maximum-speed-limit-(\d+)$/);
    if (end) return { signs: [`DE:278-${end[1]}`] };

    const signs = MEANINGS[`${name}--${variant}`] ?? MEANINGS[name];
    if (!signs) return undefined;
    const tags = signs.map(sign => ZONE_TAGS[sign]).filter(Boolean);
    return tags.length ? { signs, tags } : { signs };
}


/** Supplementary signs (`DE:1022-10`) are added to the main sign of the value */
export function isSupplementarySign(sign: string): boolean {
    return /^DE:10\d\d-/.test(sign);
}


/**
 * The traffic sign value after adding `sign` to `current`: a supplementary sign is appended
 * (`DE:239` + `DE:1022-10` → `DE:239,1022-10`), anything else replaces the value
 */
export function addSignToValue(current: string | undefined, sign: string): string {
    if (!current || current === 'none' || !isSupplementarySign(sign)) return sign;
    const code = sign.replace(/^DE:/, '');
    const parts = current.split(/[,;]/).map(part => part.trim().replace(/^DE:/, ''));
    if (parts.includes(code)) return current;
    return `${current},${code}`;
}


/**
 * The traffic sign value after taking `sign` out again: a supplementary sign leaves the rest of
 * the value (`DE:239,1022-10` → `DE:239`), anything else removes the tag (undefined)
 */
export function removeSignFromValue(current: string | undefined, sign: string): string | undefined {
    if (!current || !isSupplementarySign(sign)) return undefined;
    const code = sign.replace(/^DE:/, '');
    const parts = current.split(/[,;]/).map(part => part.trim()).filter(part => part.replace(/^DE:/, '') !== code);
    // keep the separator of the value (`,` joins signs on one post, `;` separate ones)
    return parts.length ? parts.join(current.includes(';') && !current.includes(',') ? ';' : ',') : undefined;
}
