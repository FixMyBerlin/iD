import { osmNode } from '../osm/node';
import { osmWay } from '../osm/way';
import { lineLengthMeters, offsetLine } from '../sidepath/offset_line';
import {
    cyclewayKind,
    isRoad,
    planExtraction,
    reverseTags,
    type ExtractVariant, type JoinSigns, type Side, type SignRecommend
} from '@tilda-geo/bicycle-infrastructure-tagging';
import { definedTags } from '../tilda/tags';
import type { Action } from '../core/history';

/**
 * A cycle track with `segregated=yes`: by default one segregated foot and cycle path (`path`); with
 * `twoLines` the cycleway line of two lines (`traffic_mode:<side>=foot`), when the sidewalk way next
 * to it stays apart (its construction state differs from the road's)
 */
export type SegregatedTrack = 'path' | 'twoLines';
import type { coreGraph } from '../core';
import type { WayId } from '../osm';

export interface ActionExtractSidepath extends Action {
    /** id of the new way (known after the action ran once) */
    getWayId(): WayId;
    /** `bicycle` value on the road that was kept instead of `use_sidepath` */
    keptBicycle(): string | undefined;
}

export type SidepathExtraction = {
    wayTags: Tags;
    roadTags: Tags;
    /** meters from the road's centerline */
    offsetMeters: number;
    /** `bicycle` on the road was not changed because it has another value */
    keptBicycle: string | undefined;
    /** the new way runs against the road (its bikes ride against the road): draw it reversed */
    reversed: boolean;
};

/**
 * `planExtraction` of the package, plus: a new way whose bikes ride only against the road
 * (`oneway=-1`, `oneway:bicycle=-1`) is drawn the other way round with its side and direction tags
 * turned, so it points in the riding direction like TILDA publishes such lines (tilda-geo `f752a49a6`).
 * The package already reads a misread `cycleway:both:oneway=yes` as the direction of each side.
 */
export function planSidepathExtraction(
    road: Tags, variant: ExtractVariant, side: Side, recommend: SignRecommend | undefined, joinSigns?: JoinSigns,
    segregatedTrack?: SegregatedTrack, asCrossing?: boolean
): SidepathExtraction {
    const plan = planExtraction(road, variant, side, { recommend, joinSigns, segregatedTrack });
    const wayTags = variant === 'sidewalk' ? definedTags(plan.wayTags) : withCrossing(definedTags(plan.wayTags), road, side, asCrossing);
    const reversed = wayTags.oneway === '-1' || wayTags['oneway:bicycle'] === '-1';
    return { ...plan, wayTags: reversed ? definedTags(reverseTags(wayTags)) : wayTags, roadTags: definedTags(plan.roadTags), reversed };
}

/** The keys of a side that mark a crossing (`cycleway:right:track=crossing`), most specific first */
const CROSSING_KEYS = ['track', 'lane'];

/**
 * A cycle track or lane marked as a crossing (`cycleway:<side>:track=crossing`, `…:lane=crossing`,
 * also `:both:` or without a side) is a crossing way: `cycleway=crossing` on a cycleway,
 * `path=crossing` on a path, as TILDA reads it, never `track=crossing` or `lane=crossing`. The package
 * copies `track` as it is and drops `lane` as a key of the road. `asCrossing`: a crossing without a mark
 * (the extract menu's "bike lane as a crossing").
 */
function withCrossing(wayTags: Tags, road: Tags, side: Side, asCrossing = false): Tags {
    if (!asCrossing && !isCrossingSide(road, side)) return wayTags;
    const result = { ...wayTags };
    for (const key of CROSSING_KEYS) if (result[key] === 'crossing') delete result[key];
    const highway = result.highway === 'construction' ? result.construction : result.highway;
    if (highway) result[highway] = 'crossing';
    // a crossing runs across the road, not along it: no `is_sidepath` (Tobias, 2026-11-25)
    delete result.is_sidepath;
    return result;
}

/** The cycle track or lane of this side is marked as a crossing: it is extracted only, never merged */
export function isCrossingSide(road: Tags, side: Side) {
    return CROSSING_KEYS.some(key =>
        [`cycleway:${side}:${key}`, `cycleway:both:${key}`, `cycleway:${key}`].some(sideKey => road[sideKey] === 'crossing'));
}

/**
 * A bike lane on this side (`cycleway:<side>=lane`, `opposite_lane` on the left) that is not a protected
 * lane: the package does not offer to extract it, the fork does (as a line or as a crossing), never merged
 */
export function isPlainLaneSide(road: Tags, side: Side) {
    if (!isRoad(road) || road.area === 'yes') return false;
    const value = road[`cycleway:${side}`] ?? road['cycleway:both'] ?? road.cycleway;
    const lane = value === 'lane' || (value === 'opposite_lane' && side === 'left');
    return lane && cyclewayKind(road, side) === undefined;
}

/** Ways shorter than this are not extracted */
const MIN_LENGTH_METERS = 2;


/**
 * Extract one side of a road (cycle track, sidewalk, or both as one path) into a new way
 * parallel to the road, and set that side of the road to `separate` (WORKDOC feature 17).
 * The new way has its own new nodes; connecting it to the network is left to the mapper.
 */
export function actionExtractSidepath(
    wayID: WayId,
    variant: ExtractVariant,
    side: Side,
    recommend: SignRecommend | undefined,
    joinSigns?: JoinSigns,
    segregatedTrack?: SegregatedTrack,
    asCrossing?: boolean
): ActionExtractSidepath {
    let _wayId: WayId;
    let _keptBicycle: string | undefined;

    const action: ActionExtractSidepath = function(graph: coreGraph) {
        const road = graph.entity(wayID);
        const plan = planSidepathExtraction(road.tags, variant, side, recommend, joinSigns, segregatedTrack, asCrossing);
        _keptBicycle = plan.keptBicycle;

        const locs = graph.childNodes(road).map(node => node.loc as [number, number]);
        // in the road's direction, or against it where its bikes ride against the road (`oneway=yes` then)
        const offset = offsetLine(locs, plan.offsetMeters, side);
        if (plan.reversed) offset.reverse();

        const nodes = offset.map(loc => new osmNode({ loc }));
        const way = new osmWay({ tags: plan.wayTags, nodes: nodes.map(node => node.id) });
        _wayId = way.id;

        for (const node of nodes) graph = graph.replace(node);
        graph = graph.replace(way);
        return graph.replace(road.update({ tags: plan.roadTags }));
    };

    action.disabled = function(graph: coreGraph) {
        const road = graph.hasEntity(wayID);
        if (!road || road.type !== 'way') return 'not_eligible';
        if (road.isClosed()) return 'closed';
        if (!road.nodes.every(id => graph.hasEntity(id))) return 'incomplete';
        const locs = graph.childNodes(road).map(node => node.loc as [number, number]);
        if (lineLengthMeters(locs) < MIN_LENGTH_METERS) return 'too_short';
        return false;
    };

    action.getWayId = () => _wayId;
    action.keptBicycle = () => _keptBicycle;

    return action;
}
