import {
    planTagsForCategory,
    processBikelanes,
    type BikelaneResult,
    type CategoryTagPlan,
    type TagPlanEntry
} from '@tilda-geo/bicycle-infrastructure';

/**
 * Tag plans to reach a TILDA bike infrastructure category, on top of
 * `planTagsForCategory` from `@tilda-geo/bicycle-infrastructure`.
 *
 * Ported from street-space-editor
 * (~/Development/OSM/street-space-editor, `app/src/modes/bicycle/domain/bicycle-category-plan.ts`):
 * adds tags for categories that the library planner skips (its "macro" predicates),
 * and explains targets that do not fit the way's geometry.
 */

export type Side = BikelaneResult['_side'];

/** A tag plan that can also remove keys (e.g. `cycleway:both` when splitting it into sides) */
export type TildaTagPlan = CategoryTagPlan & { remove: string[] };

/** Value of `cycleway:<side>` that on-road categories need on that side */
const SIDE_PRESENCE: Record<string, string> = {
    cyclewayOnHighway_advisory: 'lane',
    cyclewayOnHighway_exclusive: 'lane',
    cyclewayOnHighway_advisoryOrExclusive: 'lane',
    cyclewayOnHighwayBetweenLanes: 'lane',
    cyclewayOnHighwayProtected: 'track',
    cycleway_adjoining: 'track',
    cycleway_isolated: 'track',
    cycleway_adjoiningOrIsolated: 'track',
    sharedMotorVehicleLane: 'shared_lane',
    sharedBusLaneBusWithBike: 'share_busway'
};

/** Tags for categories matched only by library macros; without them the plan is empty */
const MACRO_CATEGORY_SUGGESTIONS: Record<string, TagPlanEntry[]> = {
    bicycleRoad: [
        { key: 'bicycle_road', value: 'yes', reason: 'Fahrradstraße / bicycle road' }
    ],
    bicycleRoad_vehicleDestination: [
        { key: 'bicycle_road', value: 'yes', reason: 'Fahrradstraße / bicycle road' },
        { key: 'vehicle', value: 'destination', reason: 'Motor vehicles only for destination traffic (Anlieger frei)' }
    ],
    sharedBusLaneBikeWithBus: [
        { key: 'highway', value: 'cycleway', reason: 'Shared bus/bike lane geometry' },
        { key: 'lane', value: 'share_busway', reason: 'Bike shares the bus lane' }
    ],
    sharedBusLaneBusWithBike: [
        { key: 'highway', value: 'cycleway', reason: 'Shared bus/bike lane geometry' },
        { key: 'cycleway', value: 'share_busway', reason: 'Bus lane shared with bikes' }
    ],
    crossing: [
        { key: 'highway', value: 'cycleway', reason: 'Crossing as cycleway' },
        { key: 'cycleway', value: 'crossing', reason: 'Crossing infrastructure' }
    ]
};

const NOT_CARRIAGEWAY = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'platform', 'corridor']);


function isSidewalkFootway(tags: Tags) {
    return tags.highway === 'footway' && (tags.footway === 'sidewalk' || tags['is_sidepath:of'] !== undefined);
}

function isCarriageway(tags: Tags) {
    return !!tags.highway && !NOT_CARRIAGEWAY.has(tags.highway);
}


/** Why `target` cannot be reached on this kind of way, or `undefined` if it can */
function geometryMismatch(tags: Tags, target: string): string | undefined {
    if (target.startsWith('bicycleRoad') && isSidewalkFootway(tags)) {
        return 'Bicycle roads are tagged on the carriageway (bicycle_road=yes), not on a sidewalk. Use "footway, bicycles allowed" here instead.';
    }
    if (target.startsWith('cyclewayOnHighway') && !isCarriageway(tags)) {
        return `Lanes on the road are tagged on the road centerline (cycleway:left/right=lane), not on a separate ${tags.highway ?? 'path'} way.`;
    }
    if (target.startsWith('sharedBusLane') && tags.highway !== 'cycleway' && !isCarriageway(tags)) {
        return 'Shared bus lanes need cycleway share_busway tagging on a road or bus lane geometry, not on a sidewalk.';
    }
    if (target === 'crossing' && tags.footway === 'sidewalk') {
        return 'Crossings need footway/path/cycleway=crossing. This way is tagged footway=sidewalk.';
    }
    if (target === 'pedestrianAreaBicycleYes' && tags.highway !== 'pedestrian') {
        return 'This category needs highway=pedestrian with bicycle=yes or designated.';
    }
    return undefined;
}


function withSuggestions(plan: CategoryTagPlan, suggestions: TagPlanEntry[], tags: Tags): CategoryTagPlan {
    const planned = new Set([...plan.add.map(entry => entry.key), ...plan.change.map(entry => entry.key)]);
    const add = [...plan.add];
    const change = [...plan.change];

    for (const suggestion of suggestions) {
        if (planned.has(suggestion.key)) continue;
        const current = tags[suggestion.key];
        if (current === undefined) {
            add.push(suggestion);
        } else if (current !== suggestion.value) {
            change.push({ key: suggestion.key, from: current, to: suggestion.value, reason: suggestion.reason });
        }
        planned.add(suggestion.key);
    }
    return { ...plan, add, change };
}


/** The tags after applying `plan` */
export function applyPlan(tags: Tags, plan: CategoryTagPlan & { remove?: string[] }): Tags {
    const next = { ...tags };
    for (const key of plan.remove ?? []) delete next[key];
    for (const entry of plan.change) next[entry.key] = entry.to;
    for (const entry of plan.add) next[entry.key] ??= entry.value;
    return next;
}


/**
 * Splits `cycleway:both` / `cycleway` into `cycleway:left` and `cycleway:right`,
 * so one side can change without the other. Returns the removed keys and added tags.
 */
function splitBothSides(tags: Tags) {
    const bothKey = tags['cycleway:both'] !== undefined ? 'cycleway:both'
        : tags.cycleway !== undefined ? 'cycleway' : undefined;
    if (!bothKey) return { tags, remove: [] as string[], add: [] as TagPlanEntry[] };

    const value = tags[bothKey];
    const next = { ...tags };
    delete next[bothKey];
    const add: TagPlanEntry[] = [];
    for (const side of ['left', 'right']) {
        const key = `cycleway:${side}`;
        if (next[key] === undefined) {
            next[key] = value;
            add.push({ key, value, reason: `Split ${bothKey}=${value} into sides` });
        }
    }
    return { tags: next, remove: [bothKey], add };
}


/**
 * Workaround for `planTagsForCategory` (0.1.2) on left/right sides:
 * it writes the presence key as `cycleway:<side>:cycleway`, and without a
 * `cycleway:<side>` tag it plans bare keys (`lane`) instead of `cycleway:<side>:lane`.
 */
function sideKey(key: string, side: Side) {
    if (side === 'self') return key;
    const prefix = `cycleway:${side}`;
    if (key === `${prefix}:cycleway`) return prefix;
    if (key.startsWith('cycleway:') || key === 'highway' || key.startsWith('sidewalk')) return key;
    return `${prefix}:${key}`;
}


export function categoryForSide(tags: Tags, side: Side) {
    return processBikelanes(tags).find(result => result._side === side)?.category;
}


/**
 * Tags to add, change or remove so that `side` of the way gets `target`.
 * Conflicts explain why a target cannot be reached; `aligned` is checked with `processBikelanes`.
 */
export function planCategory(tags: Tags, target: string, side: Side): TildaTagPlan {
    const mismatch = geometryMismatch(tags, target);
    if (mismatch) {
        return {
            targetCategoryId: target,
            currentCategoryId: categoryForSide(tags, side) ?? null,
            add: [],
            change: [],
            remove: [],
            aligned: false,
            conflicts: [{ key: tags.highway ? 'highway' : 'category', value: tags.highway ?? 'none', reason: mismatch }]
        };
    }

    // one side: split `:both` first and make sure the side has the right `cycleway:<side>` value
    const split = side === 'self' ? { tags, remove: [] as string[], add: [] as TagPlanEntry[] } : splitBothSides(tags);
    let working = split.tags;
    const add: TagPlanEntry[] = [...split.add];
    const change: CategoryTagPlan['change'] = [];

    const presence = side === 'self' ? undefined : SIDE_PRESENCE[target];
    if (presence) {
        const key = `cycleway:${side}`;
        const current = working[key];
        if (current !== presence) {
            const reason = `${key}=${presence} for this category`;
            const splitEntry = add.find(entry => entry.key === key);
            if (splitEntry) {
                splitEntry.value = presence;
                splitEntry.reason = reason;
            } else if (current === undefined) {
                add.push({ key, value: presence, reason });
            } else {
                change.push({ key, from: current, to: presence, reason });
            }
            working = { ...working, [key]: presence };
        }
    }

    const base = planTagsForCategory(working, target, side === 'self' ? undefined : { side });
    // suggestions that retag `highway` are for separate ways; on a road side they would retag the whole road
    const suggestions = MACRO_CATEGORY_SUGGESTIONS[target]
        ?.filter(entry => side === 'self' || entry.key !== 'highway');
    const library = suggestions ? withSuggestions(base, suggestions, working) : base;

    for (const entry of library.add) {
        const key = sideKey(entry.key, side);
        if (working[key] === undefined && !add.some(existing => existing.key === key)) add.push({ ...entry, key });
    }
    for (const entry of library.change) {
        const key = sideKey(entry.key, side);
        if (working[key] !== entry.to) change.push({ ...entry, key, from: working[key] ?? entry.from });
    }

    const plan: TildaTagPlan = { ...library, add, change, remove: split.remove, conflicts: [] };
    const result = categoryForSide(applyPlan(tags, plan), side);
    if (result === target) return { ...plan, aligned: true };

    const hasEdits = add.length > 0 || change.length > 0 || plan.remove.length > 0;
    return {
        ...plan,
        aligned: false,
        conflicts: [{
            key: 'category',
            value: result ?? 'none',
            reason: hasEdits
                ? `These tags are not enough: the result would be ${result ?? 'none'}. More tags are needed.`
                : 'Automatic suggestions cannot derive the tags for this category yet.'
        }]
    };
}
