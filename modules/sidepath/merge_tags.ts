/**
 * Tag logic for one foot and cycle path made of a bike part and a foot part (WORKDOC features
 * 17 C and 28): either two separate ways that are merged, or the two sides of a road that are
 * extracted together. Pure functions.
 */

/** Tags a traffic sign implies (from the traffic sign converter), see `modules/traffic_sign/sign_tag_plan.ts` */
export type SignRecommend = (trafficSignValue: string) => Record<string, string | string[]>;
/** Signs of both parts in one `traffic_sign` value, by the traffic sign tool's rules */
export type JoinSigns = (bike: string, foot: string) => string;

export type PartKind = 'bike' | 'foot';

/** Keys that describe one part: equal values merge, others get the `cycleway:` / `footway:` prefix */
const PART_KEYS = ['surface', 'smoothness', 'surface:colour', 'sett:length'];
const META_PREFIXES = ['', 'source:', 'note:', 'check_date:'];
const SIGN_KEYS = ['traffic_sign', 'traffic_sign:forward', 'traffic_sign:backward'];
/** Keys set by the path itself, never copied from a part */
const PATH_KEYS = new Set(['highway', 'bicycle', 'foot', 'segregated', 'oneway', 'is_sidepath']);
const MAPILLARY_KEY = /(^|:)mapillary(:|$)/;
const TRAFFIC_MODE_SIDE = /^traffic_mode:(left|right|both)$/;


/** Which part of a foot and cycle path a way is: a cycleway, a footway, or neither */
export function partKind(tags: Tags): PartKind | undefined {
    if (tags.area === 'yes') return undefined;
    const bike = tags.bicycle === 'designated';
    const foot = tags.foot === 'designated';
    if (tags.highway === 'cycleway') return foot ? undefined : 'bike';
    if (tags.highway === 'footway') return bike ? undefined : 'foot';
    if (tags.highway === 'path' && bike !== foot) return bike ? 'bike' : 'foot';
    return undefined;
}


/** Tags of a way that runs the other way: directions and sides swap */
export function reverseTags(tags: Tags): Tags {
    const swap: Record<string, string> = { forward: 'backward', backward: 'forward', left: 'right', right: 'left' };
    const result: Tags = {};
    for (const [key, value] of Object.entries(tags)) {
        result[key.split(':').map(part => swap[part] ?? part).join(':')] = value;
    }
    if (result.oneway === 'yes') result.oneway = '-1';
    else if (result.oneway === '-1') result.oneway = 'yes';
    return result;
}


/** Without the tool's rules: the country prefix once, `;` between the signs of the two parts */
export function joinSignsPlain(bike: string, foot: string) {
    const prefix = /^([A-Z]{2}):/.exec(bike)?.[1];
    return `${bike};${prefix && foot.startsWith(`${prefix}:`) ? foot.slice(prefix.length + 1) : foot}`;
}


function parseMeters(value: string | undefined) {
    if (!value) return undefined;
    const number = parseFloat(value.replace(',', '.'));
    return Number.isFinite(number) ? number : undefined;
}


function safeRecommend(recommend: SignRecommend | undefined, sign: string | undefined) {
    if (!sign || !recommend || sign === 'none') return {};
    try {
        return recommend(sign);
    } catch {
        return {};
    }
}


export type PathTagOptions = {
    recommend?: SignRecommend;
    joinSigns?: JoinSigns;
    /** Whose value stays when both parts have different values of a key that is not split */
    primary?: PartKind;
};

export type PathTags = {
    tags: Tags;
    /** `key=value` of the other part that lost against the primary part's value */
    dropped: string[];
};


/**
 * The tags of one `highway=path` for a bike part and a foot part. Both are given as the tags of
 * a way of their own (`surface`, `width`, `traffic_sign`, `oneway` of the bike part, …), in the
 * direction of the path.
 */
export function combinedPathTags(bike: Tags, foot: Tags, options: PathTagOptions = {}): PathTags {
    const { recommend, primary = 'bike' } = options;
    const joinSigns = options.joinSigns ?? joinSignsPlain;
    const handled = new Set<string>(PATH_KEYS);
    const dropped: string[] = [];

    // signs: both parts in one value
    const signs: Tags = {};
    for (const key of SIGN_KEYS) {
        handled.add(key);
        const b = bike[key];
        const f = foot[key];
        const values = [b, f].filter((value): value is string => !!value && value !== 'none');
        if (values.length === 2) signs[key] = b === f ? values[0] : joinSigns(values[0], values[1]);
        else if (values.length === 1) signs[key] = values[0];
        else if (b === 'none' || f === 'none') signs[key] = 'none';
    }
    const bikeSign = safeRecommend(recommend, bike.traffic_sign);
    const footSign = safeRecommend(recommend, foot.traffic_sign);
    // the tool's normalized value (`DE:241` → `DE:241-30`) when it is one sign value
    const normalized = bikeSign.traffic_sign ?? footSign.traffic_sign;
    if (typeof normalized === 'string' && (!bike.traffic_sign || !foot.traffic_sign || bike.traffic_sign === foot.traffic_sign)) {
        signs.traffic_sign = normalized;
    }
    const segregated = [bikeSign.segregated, footSign.segregated].find(value => typeof value === 'string') as string | undefined;

    const tags: Tags = {
        highway: 'path', bicycle: 'designated', foot: 'designated',
        // two parts are segregated unless the sign says shared (240)
        segregated: segregated ?? 'yes'
    };
    const isSidepath = bike.is_sidepath ?? foot.is_sidepath;
    if (bike.is_sidepath === 'yes' || foot.is_sidepath === 'yes' || foot.footway === 'sidewalk') tags.is_sidepath = 'yes';
    else if (isSidepath) tags.is_sidepath = isSidepath;
    if (foot.footway === 'sidewalk') handled.add('footway');
    Object.assign(tags, signs);

    // part keys: one key when equal, prefixed keys otherwise
    for (const key of PART_KEYS) {
        for (const meta of META_PREFIXES) {
            handled.add(meta + key);
            const b = bike[meta + key];
            const f = foot[meta + key];
            if (b !== undefined && b === f) {
                tags[meta + key] = b;
            } else {
                if (b !== undefined) tags[`${meta}cycleway:${key}`] = b;
                if (f !== undefined) tags[`${meta}footway:${key}`] = f;
            }
        }
    }
    // widths never merge: the path's width is the sum
    for (const meta of META_PREFIXES) {
        handled.add(`${meta}width`);
        if (bike[`${meta}width`]) tags[`${meta}cycleway:width`] = bike[`${meta}width`];
        if (foot[`${meta}width`]) tags[`${meta}footway:width`] = foot[`${meta}width`];
    }
    const bikeWidth = parseMeters(bike.width);
    const footWidth = parseMeters(foot.width);
    if (bikeWidth !== undefined && footWidth !== undefined) tags.width = String(Math.round((bikeWidth + footWidth) * 10) / 10);

    // everything else: both parts' keys; the primary part wins a conflict
    const [first, second] = primary === 'bike' ? [bike, foot] : [foot, bike];
    const otherPart = { bike: 'foot', foot: 'bicycle' };
    for (const [part, kind] of [[first, primary], [second, primary === 'bike' ? 'foot' : 'bike']] as [Tags, PartKind][]) {
        for (const [key, value] of Object.entries(part)) {
            if (handled.has(key)) continue;
            // "the neighbour is the footway / the cycleway" only said that the two are one space
            if (TRAFFIC_MODE_SIDE.test(key) && value === otherPart[kind]) continue;
            if (tags[key] === undefined) {
                tags[key] = value;
            } else if (MAPILLARY_KEY.test(key)) {
                const ids = new Set([...tags[key].split(';'), ...value.split(';')].map(id => id.trim()).filter(Boolean));
                tags[key] = [...ids].join(';');
            } else if (tags[key] !== value) {
                dropped.push(`${key}=${value}`);
            }
        }
    }

    tags.oneway = 'no';
    // only where it says something: on a way that is not one-way, `oneway:bicycle=no` is the default
    if (bike.oneway === 'yes' || bike.oneway === '-1') tags['oneway:bicycle'] = bike.oneway;

    return { tags, dropped };
}


/** A selected way, as far as the merge needs it */
export type MergeWay = {
    id: string;
    tags: Tags;
    /** changeset of the loaded version; `undefined` for a way created in this session */
    changeset: number | undefined;
    lengthMeters: number;
};

export type MergeSelection =
    | { disabled: 'mixed' | 'lengths' }
    | { disabled: 'different_values'; key: string }
    | {
        disabled: false; surviving: PartKind; survivors: MergeWay[]; deleted: MergeWay[];
        /** the lengths differ too much: the way of this kind (the longer one) is cut to the other's length first */
        cut?: PartKind;
    };

/** Lengths may differ by this much, or by this share of the longer one */
const LENGTH_TOLERANCE_METERS = 15;
const LENGTH_TOLERANCE_SHARE = 0.2;


/**
 * What a selection of ways merges into: `undefined` when it is not cycleways plus footways.
 * - One way of one kind and one or more of the other; several of both is too complex.
 * - The older kind keeps its geometry: a saved way beats a new one, then the older changeset.
 * - Lengths that differ too much: with two ways the longer one is cut to the other's length (`cut`);
 *   with more ways there is no clear place to cut, so the mapper splits first.
 */
export function mergeSelection(ways: MergeWay[]): MergeSelection | undefined {
    if (ways.length < 2) return undefined;
    const kinds = ways.map(way => partKind(way.tags));
    if (kinds.some(kind => kind === undefined)) return undefined;
    const bikes = ways.filter((_way, index) => kinds[index] === 'bike');
    const foots = ways.filter((_way, index) => kinds[index] === 'foot');
    if (!bikes.length || !foots.length) return undefined;
    if (bikes.length > 1 && foots.length > 1) return { disabled: 'mixed' };

    const length = (list: MergeWay[]) => list.reduce((sum, way) => sum + way.lengthMeters, 0);
    const difference = Math.abs(length(bikes) - length(foots));
    const longer = Math.max(length(bikes), length(foots));
    const lengthsDiffer = difference > Math.max(LENGTH_TOLERANCE_METERS, longer * LENGTH_TOLERANCE_SHARE);
    if (lengthsDiffer && ways.length > 2) return { disabled: 'lengths' };
    const cut: PartKind | undefined = !lengthsDiffer ? undefined : length(bikes) > length(foots) ? 'bike' : 'foot';

    const age = (list: MergeWay[]) => Math.min(...list.map(way => way.changeset ?? Infinity));
    // equally old (e.g. both new): the footway, it usually has the junctions
    const surviving: PartKind = age(bikes) < age(foots) ? 'bike' : 'foot';
    const [survivors, deleted] = surviving === 'bike' ? [bikes, foots] : [foots, bikes];

    // one surviving way can carry one value per part
    if (survivors.length === 1 && deleted.length > 1) {
        for (const key of [...PART_KEYS, 'width']) {
            if (new Set(deleted.map(way => way.tags[key])).size > 1) return { disabled: 'different_values', key };
        }
    }
    return cut ? { disabled: false, surviving, survivors, deleted, cut } : { disabled: false, surviving, survivors, deleted };
}


/** The tags several pieces of one kind share; of differing values the first piece's stays */
export function commonTags(pieces: Tags[]): Tags {
    const result: Tags = {};
    for (const tags of pieces) {
        for (const [key, value] of Object.entries(tags)) {
            if (result[key] === undefined) result[key] = value;
        }
    }
    return result;
}
