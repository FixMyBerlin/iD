import { isRoad, pickSidepathRoad, wayPlacement } from '@tilda-geo/bicycle-infrastructure-tagging';
import type { coreGraph } from '../core';
import type { osmWay, WayId } from '../osm';

type Loc = [number, number];

/** Roads farther away than this are no candidates (the package's vote ends at 25 m) */
const NEAR_METERS = 26;

export type RoadForSidepath = {
    roadID: WayId;
    /** the side of the road (in the road's drawing direction) the way lies on */
    side: 'left' | 'right';
    /** the way is drawn in the direction of the road line */
    along: boolean;
};


function locsOf(graph: coreGraph, way: osmWay): Loc[] {
    return graph.childNodes(way).map(node => node.loc as Loc);
}


/**
 * The road a way of its own (a sidepath) belongs to, among `ways`. The fork only finds the
 * candidates in the graph; which road it is (a road that maps this side as `separate` before a
 * nearer one) and where the way lies are the package's (`pickSidepathRoad`, `wayPlacement`), so iD
 * and Maid decide alike. Nothing when no road runs along it or the votes do not agree.
 */
export function roadForSidepath(graph: coreGraph, sidepathID: WayId, ways: osmWay[]): RoadForSidepath | undefined {
    const sidepath = graph.hasEntity(sidepathID);
    if (!sidepath || sidepath.type !== 'way') return undefined;
    if (!sidepath.nodes.every(id => graph.hasEntity(id))) return undefined;
    const coords = locsOf(graph, sidepath as osmWay);

    const roads = [];
    for (const way of ways) {
        if (way.id === sidepathID || way.type !== 'way') continue;
        // the way may be deleted or changed since it was found
        const road = graph.hasEntity(way.id);
        if (!road || road.type !== 'way' || road.isClosed() || !isRoad(road.tags)) continue;
        if (!road.nodes.every(id => graph.hasEntity(id))) continue;
        roads.push({ id: road.id as WayId, tags: road.tags, coords: locsOf(graph, road as osmWay) });
    }

    const road = pickSidepathRoad(coords, roads);
    if (!road) return undefined;
    const placement = wayPlacement(coords, road.coords);
    return placement && { roadID: road.id, ...placement };
}


/** `roadForSidepath` with the roads of the loaded data around the way */
export function roadNextTo(context: iD.Context, way: osmWay, graph: coreGraph = context.graph()) {
    if (!way.nodes.every(id => graph.hasEntity(id))) return undefined;
    const extent = way.extent(graph).padByMeters(NEAR_METERS);
    const nearby = context.history().tree().intersects(extent, graph)
        .filter(other => other.type === 'way') as osmWay[];
    return roadForSidepath(graph, way.id as WayId, nearby);
}
