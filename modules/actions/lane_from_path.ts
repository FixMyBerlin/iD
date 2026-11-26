import { osmNode } from '../osm/node';
import { osmWay } from '../osm/way';
import { lineLengthMeters, offsetLine, projectOnLine } from '../sidepath/offset_line';
import {
    canPlanLaneFromSegregatedPath, planLaneFromSegregatedPath,
    type LaneFromPathTarget, type MessageRef
} from '@tilda-geo/bicycle-infrastructure-tagging';
import { definedTags } from '../tilda/tags';
import type { RoadForSidepath } from '../sidepath/find_road';
import type { Action } from '../core/history';
import type { coreGraph } from '../core';
import type { WayId } from '../osm';

type Loc = [number, number];

export type LaneKind = 'exclusive' | 'advisory';

export interface ActionLaneFromPath extends Action {
    /** id of the new lane way (`line`, known after the action ran once) */
    getLaneId(): WayId | undefined;
    /** what the mapper should look at (the package's messages) */
    review(): MessageRef[];
}

/** A lane line shorter than this is not drawn */
const MIN_LENGTH_METERS = 2;
/** The lane lies between the road line and the sidewalk: this far nearer the road than the path line */
const LANE_INSET_METERS = 1.5;
const MIN_OFFSET_METERS = 1;


/** The part of a line between two distances along it (meters from its start) */
export function subLine(locs: Loc[], from: number, to: number): Loc[] {
    const result: Loc[] = [];
    let walked = 0;
    for (let i = 1; i < locs.length; i++) {
        const [a, b] = [locs[i - 1], locs[i]];
        const length = lineLengthMeters([a, b]);
        const start = walked;
        const at = (meters: number): Loc => {
            const share = length ? (meters - start) / length : 0;
            return [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
        };
        if (start + length >= from && start <= to) {
            if (!result.length) result.push(at(Math.max(from, start)));
            if (start + length <= to) result.push(b);
            else result.push(at(to));
        }
        walked += length;
    }
    return result.filter((loc, i) => i === 0 || loc[0] !== result[i - 1][0] || loc[1] !== result[i - 1][1]);
}


/**
 * The line of the new lane: the stretch of the road line beside the path, moved to the path's side
 * a little nearer the road than the path (the path line stands for sidewalk and lane together). It
 * runs in the direction of the road line, as the package's `oneway` expects.
 */
export function laneLine(pathLocs: Loc[], roadLocs: Loc[], side: 'left' | 'right'): Loc[] {
    const along = pathLocs.map(loc => projectOnLine(loc, roadLocs));
    const from = Math.min(...along.map(point => point.along));
    const to = Math.max(...along.map(point => point.along));
    const distances = along.map(point => point.distance).sort((a, b) => a - b);
    const distance = distances[Math.floor(distances.length / 2)];
    const stretch = subLine(roadLocs, from, to);
    if (stretch.length < 2) return [];
    return offsetLine(stretch, Math.max(MIN_OFFSET_METERS, distance - LANE_INSET_METERS), side);
}


/**
 * "Extract the bike lane from a segregated foot and cycle path" (WORKDOC feature 40): the path
 * stays and becomes the sidewalk; the lane becomes a way of its own on the carriageway (`line`) or
 * is tagged on the road (`centerline`). The tags are the package's (`planLaneFromSegregatedPath`);
 * the road and where the path lies are found by the operation (`roadNextTo`).
 */
export function actionLaneFromPath(
    pathID: WayId, road: RoadForSidepath, target: LaneFromPathTarget, lane: LaneKind
): ActionLaneFromPath {
    let _laneId: WayId | undefined;
    let _review: MessageRef[] = [];

    const action: ActionLaneFromPath = function(graph: coreGraph) {
        const path = graph.entity(pathID);
        const roadWay = graph.entity(road.roadID);
        const plan = planLaneFromSegregatedPath(path.tags, roadWay.tags, {
            roadSide: road.side, pathAlongRoad: road.along, target, lane
        });
        _review = plan.review;

        graph = graph.replace(path.update({ tags: definedTags(plan.footwayTags) }));
        graph = graph.replace(roadWay.update({ tags: definedTags(plan.roadTags) }));

        if (plan.laneTags) {
            const locs = laneLine(
                graph.childNodes(path).map(node => node.loc as Loc),
                graph.childNodes(roadWay).map(node => node.loc as Loc),
                road.side
            );
            const nodes = locs.map(loc => new osmNode({ loc }));
            const way = new osmWay({ tags: definedTags(plan.laneTags), nodes: nodes.map(node => node.id) });
            _laneId = way.id as WayId;
            for (const node of nodes) graph = graph.replace(node);
            graph = graph.replace(way);
        }
        return graph;
    };

    action.disabled = function(graph: coreGraph) {
        const path = graph.hasEntity(pathID);
        const roadWay = graph.hasEntity(road.roadID);
        if (!path || path.type !== 'way' || !roadWay || roadWay.type !== 'way') return 'not_eligible';
        if (!canPlanLaneFromSegregatedPath(path.tags)) return 'not_eligible';
        if (![...path.nodes, ...roadWay.nodes].every(id => graph.hasEntity(id))) return 'incomplete';
        if (target === 'line') {
            const locs = laneLine(
                graph.childNodes(path).map(node => node.loc as Loc),
                graph.childNodes(roadWay).map(node => node.loc as Loc),
                road.side
            );
            if (locs.length < 2 || lineLengthMeters(locs) < MIN_LENGTH_METERS) return 'too_short';
        }
        return false;
    };

    action.getLaneId = () => _laneId;
    action.review = () => _review;

    return action;
}
