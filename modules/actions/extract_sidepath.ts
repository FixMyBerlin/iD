import { osmNode } from '../osm/node';
import { osmWay } from '../osm/way';
import { lineLengthMeters, offsetLine } from '../sidepath/offset_line';
import { planExtraction, type ExtractVariant, type Side, type SignRecommend } from '../sidepath/extract_tags';
import type { JoinSigns } from '../sidepath/merge_tags';
import type { Action } from '../core/history';
import type { coreGraph } from '../core';
import type { WayId } from '../osm';

export interface ActionExtractSidepath extends Action {
    /** id of the new way (known after the action ran once) */
    getWayId(): WayId;
    /** `bicycle` value on the road that was kept instead of `use_sidepath` */
    keptBicycle(): string | undefined;
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
        const plan = planExtraction(road.tags, variant, side, recommend, joinSigns);
        _keptBicycle = plan.keptBicycle;

        const locs = graph.childNodes(road).map(node => node.loc as [number, number]);
        // in the road's direction; the bike direction is in the tags (`oneway=-1` on the left)
        const offset = offsetLine(locs, plan.offsetMeters, side);

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
