import { osmNode } from '../osm/node';
import { osmWay } from '../osm/way';
import { lineLengthMeters, offsetLine } from '../sidepath/offset_line';
import {
    planExtraction,
    reverseTags,
    type ExtractVariant, type JoinSigns, type Side, type SignRecommend
} from '@tilda-geo/bicycle-infrastructure-tagging';
import { definedTags } from '../tilda/tags';
import type { Action } from '../core/history';
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
 * turned, because TILDA ignores `oneway=-1` (fork rule, not in the package yet).
 */
export function planSidepathExtraction(
    road: Tags, variant: ExtractVariant, side: Side, recommend: SignRecommend | undefined, joinSigns?: JoinSigns
): SidepathExtraction {
    const plan = planExtraction(road, variant, side, { recommend, joinSigns });
    const wayTags = definedTags(plan.wayTags);
    const reversed = wayTags.oneway === '-1' || wayTags['oneway:bicycle'] === '-1';
    return { ...plan, wayTags: reversed ? definedTags(reverseTags(wayTags)) : wayTags, roadTags: definedTags(plan.roadTags), reversed };
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
    joinSigns?: JoinSigns
): ActionExtractSidepath {
    let _wayId: WayId;
    let _keptBicycle: string | undefined;

    const action: ActionExtractSidepath = function(graph: coreGraph) {
        const road = graph.entity(wayID);
        const plan = planSidepathExtraction(road.tags, variant, side, recommend, joinSigns);
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
