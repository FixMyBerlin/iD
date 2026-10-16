import {
    CATEGORY_DEFINITIONS,
    MAJOR_ROAD_CLASSES,
    MINOR_ROAD_CLASSES,
    TRUNK_MOTORWAY_CLASSES,
    writeKeyForSide,
    type BikelaneResult
} from '@tilda-geo/bicycle-infrastructure';

/**
 * Tags the Radnetz Berlin dataset (infraVelo) needs for each TILDA category.
 * Derived from `infravelo-radnetz/scripts/translate_attributes_tilda_to_rvn.py` and the
 * TILDA sanitizers; see WORKDOC feature 16 ("Data index") for the full table.
 * Keys are written for the own way (`width`) and turned into side keys
 * (`cycleway:right:width`) with `writeKeyForSide`.
 */

/** infraVelo attribute a tag feeds */
export type InfraveloAttribute = 'verkehrsri' | 'fuehr' | 'pflicht' | 'breite' | 'ofm' | 'farbe' | 'protek' | 'trennstreifen' | 'nutz_beschr';

/**
 * - `ok`: tagged, TILDA reads it
 * - `inherited`: not tagged here, but TILDA gets a value elsewhere (road surface, `parking:*`, category)
 * - `guess`: not tagged, TILDA guesses (oneway)
 * - `assumed`: not tagged, and the default is reliable (a road is two-way); the mapper confirms it
 *   with a check that is stored outside of OSM (`modules/tilda/checks.ts`), not with a tag
 * - `ignored`: tagged, but TILDA drops the value
 * - `missing`: not tagged
 */
export type AttributeState = 'ok' | 'inherited' | 'guess' | 'assumed' | 'ignored' | 'missing';

export type RequiredAttribute = {
    /** id for the label: `inspector.tilda.attribute.<id>` */
    id: string;
    /** the OSM key to write, for this side of the way (e.g. `cycleway:right:width`) */
    key: string;
    /** the tagged value (also found via `:both` or the plain key, like TILDA reads it) */
    value: string | undefined;
    /** the tags that were found, with the key they are tagged on (`cycleway:both:width=2`) */
    tagged: { key: string; value: string }[];
    /** all keys TILDA reads for this attribute, most specific first; to find the inspector field */
    lookup: string[];
    /** the value TILDA reads, after sanitizing (may come from the parent road) */
    tilda: string | undefined;
    /** the tag TILDA derives an untagged value from (`parking:right=lane`) */
    source?: string;
    state: AttributeState;
    /** values TILDA accepts, offered as buttons; for `assumed` only the values that differ from the default */
    options: string[];
    /** `assumed`: the default as a tag (`surface:colour=no`); what the mapper confirms with a check */
    default?: string;
    /** `assumed`: id of the text that says what the missing tag means: `inspector.tilda.default.<note>` */
    note?: string;
    /** conditional attributes: a missing value is not an error */
    optional: boolean;
    feeds: InfraveloAttribute[];
};

type Side = BikelaneResult['_side'];

type RuleContext = {
    tags: Tags;
    result: BikelaneResult | undefined;
    side: Side;
    prefix: string | null;
    /** the target category, or the current one */
    category: string;
    /** `category` is a target the mapper chose, not what TILDA reads now */
    isTarget: boolean;
    /** keys changed in this editing session (tagged now, compared to the downloaded data) */
    edited: ReadonlySet<string>;
    /** tagged value for an own-way key on this side */
    value: (key: string) => string | undefined;
};

type Rule = {
    id: string;
    key: string;
    feeds: InfraveloAttribute[];
    options?: readonly string[] | ((ctx: RuleContext) => readonly string[]);
    /** only values in `options` are valid (else any value, e.g. numbers); for rules without `tilda` */
    strict?: boolean;
    /** other keys that also count as tagged; the value shows all of them (`left=no, right=lane`) */
    alsoKeys?: string[];
    /** what TILDA reads for this attribute */
    tilda?: (ctx: RuleContext) => string | number | null | undefined;
    /** TILDA values that are only a guess, not tagged information */
    guesses?: readonly string[];
    /** the value assumed when the tag is missing, if that default is reliable (state `assumed`) */
    assumed?: (ctx: RuleContext) => string | undefined;
    /** values offered for an `assumed` attribute (default: `options` without the default value) */
    assumedOptions?: readonly string[];
    /** text for an `assumed` attribute: `inspector.tilda.default.<note>` (default: a generic text) */
    note?: string | ((ctx: RuleContext) => string | undefined);
    /**
     * The rule is the source of another key: `source:<key for this side>`, e.g. `source:cycleway:right:width`
     * (Radinfra FAQ decision: `source:` in front, not `cycleway:right:source:width`)
     */
    sourceFor?: string;
    /** the tag TILDA derives the value from when the key is missing (state `inherited`, with that tag) */
    derivedFrom?: (ctx: RuleContext) => { tag: string; tilda: string } | undefined;
    /** The tag TILDA reads instead of this key when both are there (`oneway:bicycle` wins over `oneway`) */
    overriddenBy?: (ctx: RuleContext) => string | undefined;
    when?: (ctx: RuleContext) => boolean;
    optional?: boolean | ((ctx: RuleContext) => boolean);
};


// Values TILDA accepts (`sanitize-road-tags.ts`, `sanitize-surface.ts` in @tilda-geo/bicycle-infrastructure)
const SURFACE_OPTIONS = [
    'asphalt', 'paving_stones', 'sett', 'concrete', 'concrete:plates', 'concrete:lanes', 'bricks', 'stone',
    'compacted', 'fine_gravel', 'gravel', 'pebblestone', 'ground', 'grass', 'sand', 'unpaved', 'paved',
    'wood', 'metal', 'grass_paver'
];
/** mosaic, small, large (Kopfsteinpflaster) as in the Radinfra FAQ */
const SETT_LENGTH_OPTIONS = ['0.05', '0.1', '0.15'];
const SURFACE_COLOUR_OPTIONS = ['no', 'red', 'green', 'red;green'];
const SEPARATION_OPTIONS = [
    'no', 'bollard', 'flex_post', 'vertical_panel', 'studs', 'bump', 'kerb', 'planter', 'fence',
    'jersey_barrier', 'guard_rail', 'structure', 'greenery', 'hedge', 'tree_row', 'ditch', 'cone'
];
const MARKING_OPTIONS = ['no', 'solid_line', 'dashed_line', 'double_solid_line', 'barred_area', 'pictogram', 'surface'];
const TRAFFIC_MODE_OPTIONS = ['no', 'motor_vehicle', 'parking', 'psv', 'bicycle', 'foot'];
const BUFFER_OPTIONS = ['no', '0.25', '0.5', '0.75', '1'];

/** Signs about damaged paths; mapped as `traffic_sign` too (Radinfra FAQ), wherever they are on the way */
const DAMAGE_SIGNS = ['Radwegschäden', 'Gehwegschäden', 'Geh- und Radwegschäden'];

/** Traffic signs that set the infraVelo type (`fuehr`) or mandatory use (`pflicht`), then the damage signs */
function trafficSignOptions(ctx: RuleContext): string[] {
    return [...categoryTrafficSigns(ctx), ...DAMAGE_SIGNS];
}

function categoryTrafficSigns(ctx: RuleContext): string[] {
    const category = ctx.category;
    if (category.startsWith('bicycleRoad')) return ['DE:244.1', 'DE:244.1,1020-30'];
    if (category.startsWith('footAndCyclewayShared')) return ['DE:240', 'none'];
    if (category.startsWith('footAndCyclewaySegregated')) return ['DE:241', 'none'];
    if (category.startsWith('footwayBicycleYes')) return ['DE:239,1022-10', 'none'];
    if (category === 'pedestrianAreaBicycleYes') return ['DE:242.1,1022-10'];
    if (category === 'sharedBusLaneBusWithBike') return ['DE:245,1022-10'];
    if (category === 'sharedBusLaneBikeWithBus') return ['DE:237,1024-14'];
    return ['DE:237', 'none'];
}


function isSeparateWayCategory(category: string) {
    return /^(cycleway_|footAndCycleway|footwayBicycleYes)/.test(category) || category === 'needsClarification';
}

function isOnRoadLaneCategory(category: string) {
    return category.startsWith('cyclewayOnHighway_') ||
        category === 'cyclewayOnHighwayBetweenLanes' ||
        category.startsWith('sharedBusLane');
}

function sidepathFromCategory(category: string) {
    if (category.endsWith('_adjoining')) return 'yes';
    if (category.endsWith('_isolated')) return 'no';
    return undefined;
}


function field(name: keyof BikelaneResult) {
    return (ctx: RuleContext) => ctx.result?.[name] as string | number | null | undefined;
}

/** Values of `parking:*` TILDA reads (`derive-traffic-mode.ts`) */
const PARKING_VALUES = ['no', 'yes', 'lane', 'street_side', 'on_kerb', 'half_on_kerb', 'shoulder', 'separate'];
/** Categories where TILDA infers `traffic_mode` from `parking:*` (besides bicycle roads) */
const PARKING_INFERENCE_CATEGORIES = new Set([
    'cyclewayOnHighway_advisory', 'cyclewayOnHighway_advisoryOrExclusive', 'cyclewayOnHighway_exclusive',
    'cyclewayOnHighwayBetweenLanes', 'cyclewayOnHighwayProtected'
]);

/**
 * `traffic_mode:*` from the road's `parking:<side>` (or `parking:both`), like TILDA infers it for bicycle
 * roads and lanes on the road: any parking → `parking`, `no` → nothing next to it
 */
function trafficModeFromParking(parkingSide: (ctx: RuleContext) => string) {
    return (ctx: RuleContext) => {
        if (!PARKING_INFERENCE_CATEGORIES.has(ctx.category) && !ctx.category.startsWith('bicycleRoad')) return undefined;
        const key = [`parking:${parkingSide(ctx)}`, 'parking:both'].find(k => ctx.tags[k] !== undefined);
        const value = key && ctx.tags[key];
        if (!key || !value || !PARKING_VALUES.includes(value)) return undefined;
        return { tag: `${key}=${value}`, tilda: value === 'no' ? 'no' : 'parking' };
    };
}

/** `traffic_mode` on this side is parking (tagged, or inferred from `parking:*` by TILDA) */
function parkingOn(side: 'left' | 'right') {
    return (ctx: RuleContext) => (ctx.value(`traffic_mode:${side}`) ?? ctx.result?.[`traffic_mode_${side}`]) === 'parking';
}


/** Categories whose oneway default TILDA rates as reliable (lanes run with the traffic, bicycle roads are two-way) */
const RELIABLE_ONEWAY_DEFAULT = new Set(CATEGORY_DEFINITIONS
    .filter(category => category.implicitOneWayConfidence === 'high' || category.implicitOneWayConfidence === 'medium')
    .map(category => category.id));

/**
 * The direction bicycles ride on one side of a road, as `oneway` of that side, when it is not tagged:
 * with the traffic on that side. `oneway` refers to the direction of the way, so on the left side
 * of a two-way road that is `-1`; on a one-way road both sides run with the road, except the
 * contraflow side (left) when bicycles may ride against the one-way.
 */
export function sideOnewayDefault(tags: Tags, side: 'left' | 'right'): 'yes' | '-1' {
    if (side === 'right') return 'yes';
    const oneWayForBikes = tags.oneway === 'yes' && tags['oneway:bicycle'] !== 'no';
    return oneWayForBikes ? 'yes' : '-1';
}

/**
 * The oneway default, as a tag value, where it is reliable: on a road side always (never ask for
 * `cycleway:<side>:oneway`, WORKDOC feature 32), else TILDA's default for the category.
 */
/** TILDA takes the direction from `oneway:bicycle` when it is tagged (`derive_oneway.lua`) */
function onewayBicycleTag(ctx: RuleContext) {
    const value = ctx.side === 'self' ? ctx.tags['oneway:bicycle'] : undefined;
    return value === undefined ? undefined : `oneway:bicycle=${value}`;
}

function assumedOneway(ctx: RuleContext) {
    if (ctx.side !== 'self') return sideOnewayDefault(ctx.tags, ctx.side);
    if (!RELIABLE_ONEWAY_DEFAULT.has(ctx.category)) return undefined;
    const category = CATEGORY_DEFINITIONS.find(c => c.id === ctx.category);
    return category?.implicitOneWay ? 'yes' : 'no';
}


/** The width was tagged in this session: then say where the value comes from (not for existing widths) */
function widthEdited(ctx: RuleContext) {
    return lookupKeys('width', ctx.side, ctx.prefix).some(key => ctx.tags[key] !== undefined && ctx.edited.has(key));
}

const SOURCE_WIDTH: Rule = {
    id: 'source_width', key: 'source:width', sourceFor: 'width', feeds: ['breite'],
    options: ['Luftbild 2026', 'Luftbild 2025', 'Messung aus Punktwolke (Infra3DViewer)', 'survey'], when: widthEdited
};

const COMMON: Rule[] = [
    { id: 'traffic_sign', key: 'traffic_sign', feeds: ['pflicht', 'fuehr', 'nutz_beschr'], options: trafficSignOptions, tilda: field('traffic_sign') },
    { id: 'width', key: 'width', feeds: ['breite'], options: [], tilda: field('width'),
        // shared bus lanes: the lane width is only a side benefit (Radinfra FAQ)
        optional: ctx => ctx.category.startsWith('sharedBusLane') },
    SOURCE_WIDTH,
    { id: 'surface', key: 'surface', feeds: ['ofm'], options: SURFACE_OPTIONS, tilda: field('surface') },
    { id: 'sett_length', key: 'sett:length', feeds: ['ofm'], options: SETT_LENGTH_OPTIONS,
        when: ctx => ctx.value('surface') === 'sett' },
    { id: 'surface_colour', key: 'surface:colour', feeds: ['farbe'], options: SURFACE_COLOUR_OPTIONS, strict: true, tilda: field('surface_color'), optional: true,
        assumed: () => 'no', note: 'surface_colour' },
    { id: 'oneway', key: 'oneway', feeds: ['verkehrsri'], options: ['yes', 'no', '-1'], tilda: field('oneway'), guesses: ['assumed_no', 'implicit_yes'],
        // lanes on the road run with the traffic, bicycle roads are two-way: TILDA's default is reliable there
        assumed: assumedOneway, overriddenBy: onewayBicycleTag,
        // a road side: only "both ways" is information, the direction follows from the side
        assumedOptions: ['no'], note: ctx => ctx.side !== 'self' ? 'oneway_side' : undefined }
];

const SEPARATE_WAY: Rule[] = [
    { id: 'is_sidepath', key: 'is_sidepath', feeds: ['fuehr'], options: ['yes', 'no'], strict: true,
        // TILDA derives it from `footway=sidewalk` and similar; a chosen target category is no source
        tilda: ctx => ctx.isTarget ? undefined : sidepathFromCategory(ctx.category),
        when: ctx => ctx.side === 'self' && isSeparateWayCategory(ctx.category) },
    { id: 'segregated', key: 'segregated', feeds: ['fuehr'], options: ['yes', 'no'], strict: true,
        when: ctx => ctx.category.startsWith('footAndCycleway') }
];

const LANE: Rule[] = [
    // TILDA has `_advisory` / `_exclusive` only from this tag, so the category is no source for it
    { id: 'lane', key: 'lane', feeds: ['fuehr'], options: ['advisory', 'exclusive'], strict: true,
        when: ctx => ctx.category.startsWith('cyclewayOnHighway_') }
];

/**
 * Parking next to the lane: the buffer to it (`trennstreifen`); TILDA infers parking from `parking:<side>`.
 * The lines are set by law, so no marking; no buffer is left untagged (Radinfra FAQ), so a missing one is `no`.
 */
const NEXT_TO_PARKING: Rule[] = [
    // without parking TILDA has "entfällt"; so only needed where parking is not tagged on the road
    { id: 'traffic_mode_right', key: 'traffic_mode:right', feeds: ['trennstreifen'], options: TRAFFIC_MODE_OPTIONS, strict: true, tilda: field('traffic_mode_right'), optional: true,
        // TILDA reads the road's parking on the lane's side
        derivedFrom: trafficModeFromParking(ctx => ctx.side), assumed: () => 'no' },
    { id: 'buffer_right', key: 'buffer:right', feeds: ['trennstreifen'], options: BUFFER_OPTIONS, tilda: field('buffer_right'), when: parkingOn('right'),
        assumed: () => 'no' }
];

const PROTECTION: Rule[] = (['left', 'right'] as const).flatMap(side => [
    { id: `separation_${side}`, key: `separation:${side}`, feeds: ['protek'], options: SEPARATION_OPTIONS, strict: true, tilda: field(`separation_${side}`) },
    { id: `marking_${side}`, key: `marking:${side}`, feeds: ['protek', 'trennstreifen'], options: MARKING_OPTIONS, strict: true, tilda: field(`marking_${side}`) },
    { id: `buffer_${side}`, key: `buffer:${side}`, feeds: ['protek', 'trennstreifen'], options: BUFFER_OPTIONS, tilda: field(`buffer_${side}`) },
    // only parking or foot next to it matter (Radinfra FAQ); TILDA reads parking on the outer side from `parking:*`
    { id: `traffic_mode_${side}`, key: `traffic_mode:${side}`, feeds: ['protek', 'trennstreifen'], options: TRAFFIC_MODE_OPTIONS, strict: true, tilda: field(`traffic_mode_${side}`),
        derivedFrom: side === 'right' ? trafficModeFromParking(ctx => ctx.side) : undefined, assumed: () => 'no' }
] as Rule[]);

/** One-way roads: only `oneway:bicycle=no` says something; without the tag bicycles follow the one-way */
const ONEWAY_BICYCLE: Rule = {
    id: 'oneway_bicycle', key: 'oneway:bicycle', feeds: ['verkehrsri'], options: ['no', 'yes'], strict: true,
    assumed: () => 'yes', note: 'oneway_bicycle',
    when: ctx => ctx.value('oneway') === 'yes'
};

/** Bicycle roads: the white marking on both sides; with a line, the buffer to it (Radinfra FAQ) */
function lineMarking(side: 'left' | 'right') {
    return (ctx: RuleContext) => ['solid_line', 'dashed_line', 'double_solid_line'].includes(ctx.value(`marking:${side}`) ?? '');
}

const BICYCLE_ROAD: Rule[] = [
    ONEWAY_BICYCLE,
    ...(['left', 'right'] as const).flatMap(side => [
        { id: `traffic_mode_${side}`, key: `traffic_mode:${side}`, feeds: ['trennstreifen'], options: TRAFFIC_MODE_OPTIONS, strict: true, tilda: field(`traffic_mode_${side}`), optional: true,
            derivedFrom: trafficModeFromParking(() => side), assumed: () => 'no' },
        { id: `marking_${side}`, key: `marking:${side}`, feeds: ['trennstreifen'], options: MARKING_OPTIONS, strict: true, tilda: field(`marking_${side}`) },
        { id: `buffer_${side}`, key: `buffer:${side}`, feeds: ['trennstreifen'], options: BUFFER_OPTIONS, tilda: field(`buffer_${side}`), when: lineMarking(side) }
    ] as Rule[])
];


function rulesForCategory(category: string): Rule[] {
    if (category === 'cyclewayOnHighwayProtected') return [...COMMON, ...PROTECTION];
    if (isOnRoadLaneCategory(category)) return [...COMMON, ...LANE, ...NEXT_TO_PARKING];
    if (category.startsWith('bicycleRoad')) return [...COMMON, ...BICYCLE_ROAD];
    return [...COMMON, ...SEPARATE_WAY];
}


/**
 * Keys that TILDA reads for an own-way key on one side, most specific first:
 * `separation:left` → `separation:both` → `separation` (left only), and on a road side
 * `cycleway:right:<key>` → `cycleway:both:<key>` → `cycleway:<key>`.
 */
export function lookupKeys(key: string, side: Side, prefix: string | null) {
    const sided = key.match(/^(.*):(left|right)$/);
    const ownKeys = sided
        ? [key, `${sided[1]}:both`, ...(sided[2] === 'left' ? [sided[1]] : [])]
        : [key];
    if (side === 'self' || !prefix) return ownKeys;
    return ownKeys.flatMap(ownKey => [`${prefix}:${side}:${ownKey}`, `${prefix}:both:${ownKey}`, `${prefix}:${ownKey}`]);
}


function displayValue(value: unknown) {
    return value === null || value === undefined ? undefined : String(value);
}


/** `key=value` of all tagged keys, without their common prefix */
function summary(ctx: RuleContext, keys: string[]) {
    const tagged = keys.filter(key => ctx.value(key) !== undefined);
    if (!tagged.length) return undefined;
    if (tagged.length === 1) return ctx.value(tagged[0]);
    return tagged.map(key => `${key.split(':').pop()}=${ctx.value(key)}`).join(', ');
}


function evaluate(rules: Rule[], ctx: RuleContext): RequiredAttribute[] {
    return rules
        .filter(rule => !rule.when || rule.when(ctx))
        .map(rule => {
            const ownKeys = [rule.key, ...(rule.alsoKeys ?? [])];
            const keysFor = (key: string) => rule.sourceFor
                ? lookupKeys(rule.sourceFor, ctx.side, ctx.prefix).map(k => `source:${k}`)
                : lookupKeys(key, ctx.side, ctx.prefix);
            const value = rule.alsoKeys ? summary(ctx, [rule.key, ...rule.alsoKeys])
                : keysFor(rule.key).map(k => ctx.tags[k]).find(v => v !== undefined);
            const lookup = [...new Set(ownKeys.flatMap(keysFor))];
            const tagged = ownKeys
                .map(key => keysFor(key).find(k => ctx.tags[k] !== undefined))
                .filter((key, i, keys): key is string => !!key && keys.indexOf(key) === i)
                .map(key => ({ key, value: ctx.tags[key] }));
            const derived = value === undefined ? rule.derivedFrom?.(ctx) : undefined;
            const assumed = value === undefined && !derived ? rule.assumed?.(ctx) : undefined;
            const tilda = derived?.tilda ?? assumed ?? displayValue(rule.tilda?.(ctx));
            const allOptions = [...(typeof rule.options === 'function' ? rule.options(ctx) : rule.options ?? [])];
            // a default: offer only the values that say something else
            const options = assumed === undefined ? allOptions
                : [...(rule.assumedOptions ?? allOptions.filter(option => option !== assumed))];
            const optional = typeof rule.optional === 'function' ? rule.optional(ctx) : !!rule.optional;

            let state: AttributeState;
            if (value !== undefined) {
                const dropped = rule.tilda !== undefined && tilda === undefined;
                const invalid = rule.tilda === undefined && rule.strict && !allOptions.includes(value);
                state = dropped || invalid ? 'ignored' : 'ok';
            } else if (derived) {
                state = 'inherited';
            } else if (assumed !== undefined) {
                state = 'assumed';
            } else if (tilda !== undefined) {
                state = rule.guesses?.includes(tilda) ? 'guess' : 'inherited';
            } else {
                state = 'missing';
            }

            const key = rule.sourceFor ? `source:${writeKeyForSide(rule.sourceFor, ctx.side, ctx.prefix)}` : writeKeyForSide(rule.key, ctx.side, ctx.prefix);

            return {
                id: rule.id,
                key,
                value,
                tagged,
                lookup,
                tilda,
                source: derived?.tag ?? (value !== undefined && tilda !== undefined && tilda !== value ? rule.overriddenBy?.(ctx) : undefined),
                state,
                options,
                default: state === 'assumed' ? `${key}=${assumed}` : undefined,
                note: state === 'assumed' ? (typeof rule.note === 'function' ? rule.note(ctx) : rule.note) : undefined,
                optional,
                feeds: rule.feeds
            };
        });
}


function contextFor(tags: Tags, result: BikelaneResult | undefined, side: Side, prefix: string | null, category: string,
    isTarget: boolean, edited: ReadonlySet<string>): RuleContext {
    return {
        tags, result, side, prefix, category, isTarget, edited,
        value: key => lookupKeys(key, side, prefix).map(k => tags[k]).find(v => v !== undefined)
    };
}


/**
 * Required attributes for one TILDA result (one side of the way).
 * With a `targetCategory`, the list is for that category (the mapper is changing the way to it).
 */
export function requiredAttributes(result: BikelaneResult, tags: Tags, targetCategory?: string,
    edited: ReadonlySet<string> = new Set()): RequiredAttribute[] {
    const category = targetCategory ?? result.category;
    if (!targetCategory && !result._infrastructureExists) return [];
    if (category === 'cyclewayLink' || category === 'data_no' || category === 'separate_geometry' || category === 'not_expected') return [];

    const ctx = contextFor(tags, result, result._side, result._prefix, category, category !== result.category, edited);
    return evaluate(rulesForCategory(category), ctx);
}


const ROAD_CLASSES = new Set<string>([...TRUNK_MOTORWAY_CLASSES, ...MAJOR_ROAD_CLASSES, ...MINOR_ROAD_CLASSES]);
ROAD_CLASSES.delete('pedestrian');

export function isRoad(tags: Tags) {
    return !!tags.highway && ROAD_CLASSES.has(tags.highway);
}

const ROAD: Rule[] = [
    // a road without `oneway` is two-way (infraVelo drops `oneway=no` anyway)
    { id: 'oneway', key: 'oneway', feeds: ['verkehrsri'], options: ['yes', 'no', '-1'], assumed: () => 'no', note: 'oneway_road', overriddenBy: onewayBicycleTag },
    ONEWAY_BICYCLE,
    { id: 'dual_carriageway', key: 'dual_carriageway', feeds: ['verkehrsri'], options: ['yes', 'no'], strict: true, optional: true,
        assumed: () => 'no', note: 'dual_carriageway',
        when: ctx => ctx.value('oneway') === 'yes' },
    { id: 'width', key: 'width', feeds: ['breite'], options: [] },
    SOURCE_WIDTH,
    { id: 'surface', key: 'surface', feeds: ['ofm'], options: SURFACE_OPTIONS },
    { id: 'sett_length', key: 'sett:length', feeds: ['ofm'], options: SETT_LENGTH_OPTIONS,
        when: ctx => ctx.value('surface') === 'sett' },
    { id: 'cycleway', key: 'cycleway:both', feeds: ['fuehr'], options: ['no', 'separate', 'lane', 'track'],
        // any of `cycleway`, `cycleway:both`, `cycleway:left`, `cycleway:right` says what is on the sides
        alsoKeys: ['cycleway', 'cycleway:left', 'cycleway:right'] }
];

/**
 * Attributes for the road itself (TILDA `roads` export → infraVelo "Mischverkehr").
 * Only for roads; bicycle roads get their checklist from their bike infrastructure card.
 */
export function roadAttributes(tags: Tags, edited: ReadonlySet<string> = new Set()): RequiredAttribute[] {
    if (!isRoad(tags)) return [];
    return evaluate(ROAD, contextFor(tags, undefined, 'self', null, 'road', false, edited));
}
