import { actionAddMidpoint } from './add_midpoint';
import { actionDeleteWay } from './delete_way';
import { actionSplit } from './split';
import { distanceToLineMeters, lineLengthMeters, projectOnLine } from '../sidepath/offset_line';
import {
    combinedPathTags, commonTags, mergeSelection, reverseTags,
    type JoinSigns, type MergeSelection, type MergeWay, type PartKind, type SignRecommend
} from '../sidepath/merge_tags';
import type { Action } from '../core/history';
import type { coreGraph } from '../core';
import { osmNode } from '../osm/node';
import type { NodeId, osmWay, WayId } from '../osm';

export interface ActionMergeSidepaths extends Action {
    /** the ways that stay, as paths (known after the action ran once) */
    survivorIds(): WayId[];
    /** `key=value` tags of the deleted ways that lost against the surviving way's value */
    dropped(): string[];
}

type Loc = [number, number];

/** Ways that run side by side: every node is at most this far from a way of the other kind */
const MAX_APART_METERS = 25;

/** The longer way is only cut where it runs on for more than this past the end of the shorter one */
const MIN_OVERHANG_METERS = 5;
/** A node of the longer way this close to the cut is used for it, instead of a new node */
const SNAP_TO_NODE_METERS = 3;

/** Where the longer way is cut: at an existing node, or at a new node on the segment after `index` */
type CutPoint = { along: number; loc: Loc; nodeID?: NodeId; index: number };

export type SidepathCut = {
    /** the longer way, which is cut to the length of the other one */
    wayID: WayId;
    /** one or two points, ordered along the way */
    points: CutPoint[];
    /** the part between them is merged: meters from the start of the way */
    from: number;
    to: number;
};

export type MergeSidepathsSelection =
    | (MergeSelection & { cutPlan?: SidepathCut })
    | { disabled: 'apart' };


function wayLocs(graph: coreGraph, way: osmWay) {
    return graph.childNodes(way).map(node => node.loc as Loc);
}

/** From the first to the last node */
function direction(locs: Loc[]): Loc {
    return [locs[locs.length - 1][0] - locs[0][0], locs[locs.length - 1][1] - locs[0][1]];
}

function dot(a: Loc, b: Loc) {
    return a[0] * b[0] + a[1] * b[1];
}


/** A surviving way's tags with the other kind's tags, which are turned into its direction first */
function mergedTags(
    graph: coreGraph, survivor: osmWay, deleted: osmWay[], surviving: PartKind,
    recommend: SignRecommend | undefined, joinSigns: JoinSigns | undefined
) {
    const along = direction(wayLocs(graph, survivor));
    const other = commonTags(deleted.map(way => dot(along, direction(wayLocs(graph, way))) < 0 ? reverseTags(way.tags) : way.tags));
    const [bike, foot] = surviving === 'bike' ? [survivor.tags, other] : [other, survivor.tags];
    return combinedPathTags(bike, foot, { recommend, joinSigns, primary: surviving });
}


/** A deleted way's place in its relations goes to the surviving ways, ordered along the deleted way */
function moveMemberships(graph: coreGraph, way: osmWay, survivorIds: WayId[], replaced: Set<string>) {
    const locs = wayLocs(graph, way);
    const along = direction(locs);
    const position = new Map(survivorIds.map(id => {
        const other = wayLocs(graph, graph.entity(id));
        const middle = other[Math.floor(other.length / 2)];
        return [id, dot(along, [middle[0] - locs[0][0], middle[1] - locs[0][1]])];
    }));
    const ordered = [...survivorIds].sort((a, b) => position.get(a)! - position.get(b)!);

    for (const parent of graph.parentRelations(way)) {
        const relation = graph.entity(parent.id);
        const members = [];
        for (const member of relation.members) {
            if (member.id !== way.id) {
                members.push(member);
                continue;
            }
            for (const id of ordered) {
                const key = `${relation.id}/${id}/${member.role}`;
                if (replaced.has(key) || relation.memberByIdAndRole(id, member.role)) continue;
                replaced.add(key);
                members.push({ id, type: 'way' as const, role: member.role });
            }
        }
        graph = graph.replace(relation.update({ members }));
    }
    return graph;
}


/** Meters from the start of the line to each of its nodes */
function alongNodes(locs: Loc[]) {
    const result = [0];
    for (let i = 1; i < locs.length; i++) result.push(result[i - 1] + lineLengthMeters([locs[i - 1], locs[i]]));
    return result;
}

/**
 * Where to cut the longer way so that it ends where the shorter one ends: at the points nearest to
 * the shorter way's ends, unless the longer way ends there anyway.
 */
function planCut(graph: coreGraph, longWay: osmWay, shortWay: osmWay): SidepathCut {
    const locs = wayLocs(graph, longWay);
    const along = alongNodes(locs);
    const total = along[along.length - 1];
    const ends = wayLocs(graph, shortWay);

    const points: CutPoint[] = [];
    // where the shorter way's ends are, along the longer way
    const reached: number[] = [];
    for (const end of [ends[0], ends[ends.length - 1]]) {
        const projection = projectOnLine(end, locs);
        reached.push(projection.along);
        if (projection.along < MIN_OVERHANG_METERS || total - projection.along < MIN_OVERHANG_METERS) continue;
        // an inner node nearby: cut there, the way keeps its shape
        const near = along
            .map((meters, index) => ({ index, apart: Math.abs(meters - projection.along) }))
            .filter(node => node.index > 0 && node.index < locs.length - 1 && node.apart <= SNAP_TO_NODE_METERS)
            .sort((a, b) => a.apart - b.apart)[0];
        points.push(near
            ? { along: along[near.index], loc: locs[near.index], nodeID: longWay.nodes[near.index], index: near.index }
            : { along: projection.along, loc: projection.loc, index: projection.index });
    }
    points.sort((a, b) => a.along - b.along);
    // both ends of the shorter way lead to the same place: one cut
    const distinct = points.filter((point, i) => i === 0 || point.along - points[i - 1].along > SNAP_TO_NODE_METERS);

    const [from, to] = distinct.length === 2 ? [distinct[0].along, distinct[1].along]
        : distinct.length === 0 ? [0, total]
        // one cut: the part that the shorter way's middle runs along
        : (reached[0] + reached[1]) / 2 < distinct[0].along ? [0, distinct[0].along] : [distinct[0].along, total];
    return { wayID: longWay.id, points: distinct, from, to };
}

/** Cuts the way; returns the graph and the piece between the cut points */
function cutWay(graph: coreGraph, plan: SidepathCut): { graph: coreGraph; pieceID: WayId } {
    if (!plan.points.length) return { graph, pieceID: plan.wayID };
    const before = graph.entity(plan.wayID);
    const along = new Map<string, number>(alongNodes(wayLocs(graph, before)).map((meters, i) => [before.nodes[i], meters]));

    const nodeIDs: NodeId[] = [];
    // from the end of the way, so the segment indexes of the earlier points stay valid
    for (const point of [...plan.points].reverse()) {
        if (point.nodeID) {
            nodeIDs.push(point.nodeID);
            continue;
        }
        const way = graph.entity(plan.wayID);
        const node = new osmNode({ loc: point.loc });
        graph = actionAddMidpoint({ loc: point.loc, edge: [way.nodes[point.index], way.nodes[point.index + 1]] }, node)(graph);
        along.set(node.id, point.along);
        nodeIDs.push(node.id);
    }

    const split = actionSplit(nodeIDs).limitWays([plan.wayID]);
    graph = split(graph);

    // the piece whose nodes all lie between the cut points
    const inside = (id: WayId) => graph.entity(id).nodes.every(nodeID => {
        const meters = along.get(nodeID);
        return meters !== undefined && meters >= plan.from - 0.01 && meters <= plan.to + 0.01;
    });
    const pieceID = [plan.wayID, ...(split.getCreatedWayIDs?.() ?? [])].find(inside) ?? plan.wayID;
    return { graph, pieceID };
}


/**
 * How the selected ways merge (see `mergeSelection`), or `undefined` when they are not cycleways
 * plus footways. Also checks that they run side by side, and plans the cut of a way that is too long.
 */
export function mergeSidepathsSelection(graph: coreGraph, wayIDs: WayId[]): MergeSidepathsSelection | undefined {
    const ways: MergeWay[] = [];
    for (const id of wayIDs) {
        const way = graph.hasEntity(id);
        if (!way || way.isClosed()) return undefined;
        if (!way.nodes.every(nodeID => graph.hasEntity(nodeID))) return undefined;
        ways.push({
            id,
            tags: way.tags,
            changeset: way.isNew() ? undefined : Number(way.changeset) || 0,
            lengthMeters: lineLengthMeters(wayLocs(graph, way))
        });
    }
    const selection = mergeSelection(ways);
    if (!selection || selection.disabled) return selection;

    if (selection.cut) {
        // two ways: the longer one is cut to the length of the other
        const longIsSurvivor = selection.cut === selection.surviving;
        const longWay = graph.entity((longIsSurvivor ? selection.survivors : selection.deleted)[0].id as WayId);
        const shortWay = graph.entity((longIsSurvivor ? selection.deleted : selection.survivors)[0].id as WayId);
        const cutPlan = planCut(graph, longWay, shortWay);

        // the shorter way and the part it is merged with run side by side
        const longLocs = wayLocs(graph, longWay);
        const shortLocs = wayLocs(graph, shortWay);
        const along = alongNodes(longLocs);
        const part = [
            ...(cutPlan.points.length ? cutPlan.points.map(point => point.loc) : []),
            ...longLocs.filter((_loc, i) => along[i] >= cutPlan.from && along[i] <= cutPlan.to)
        ];
        const tooFar = (from: Loc[], to: Loc[]) => from.some(loc => distanceToLineMeters(loc, to) > MAX_APART_METERS);
        if (tooFar(shortLocs, longLocs) || tooFar(part, shortLocs)) return { disabled: 'apart' };
        return { ...selection, cutPlan };
    }

    // a footway that turns the corner is not the cycleway's other half
    const lines = (list: MergeWay[]) => list.map(way => wayLocs(graph, graph.entity(way.id as WayId)));
    const [survivors, deleted] = [lines(selection.survivors), lines(selection.deleted)];
    const apart = (from: Loc[][], to: Loc[][]) => from.some(line => line.some(
        loc => Math.min(...to.map(other => distanceToLineMeters(loc, other))) > MAX_APART_METERS
    ));
    if (apart(survivors, deleted) || apart(deleted, survivors)) return { disabled: 'apart' };
    return selection;
}


/**
 * Merge a cycleway and a footway that run side by side into one foot and cycle path (WORKDOC
 * feature 28). The older kind keeps its geometry and gets the tags of both; the other ways are
 * deleted, and their relation memberships move to the surviving ways.
 */
export function actionMergeSidepaths(
    wayIDs: WayId[],
    recommend: SignRecommend | undefined,
    joinSigns: JoinSigns | undefined
): ActionMergeSidepaths {
    let _survivorIds: WayId[] = [];
    let _dropped: string[] = [];

    const action: ActionMergeSidepaths = function(graph: coreGraph) {
        const selection = mergeSidepathsSelection(graph, wayIDs);
        if (!selection || selection.disabled) return graph;
        const { surviving } = selection;
        let survivorIDs = selection.survivors.map(way => way.id as WayId);
        let deletedIDs = selection.deleted.map(way => way.id as WayId);

        // the longer way is cut to the length of the other; what runs on stays as it is
        if (selection.cutPlan) {
            const cut = cutWay(graph, selection.cutPlan);
            graph = cut.graph;
            const replace = (ids: WayId[]) => ids.map(id => id === selection.cutPlan!.wayID ? cut.pieceID : id);
            survivorIDs = replace(survivorIDs);
            deletedIDs = replace(deletedIDs);
        }
        const survivors = survivorIDs.map(id => graph.entity(id));
        const deleted = deletedIDs.map(id => graph.entity(id));
        _survivorIds = survivors.map(way => way.id);
        const dropped = new Set<string>();

        for (const survivor of survivors) {
            const result = mergedTags(graph, survivor, deleted, surviving, recommend, joinSigns);
            for (const tag of result.dropped) dropped.add(tag);
            graph = graph.replace(survivor.update({ tags: result.tags }));
        }
        _dropped = [...dropped];

        const replaced = new Set<string>();
        for (const way of deleted) {
            graph = moveMemberships(graph, way, _survivorIds, replaced);
            graph = actionDeleteWay(way.id)(graph);
        }
        return graph;
    };

    action.disabled = function(graph: coreGraph) {
        const selection = mergeSidepathsSelection(graph, wayIDs);
        if (!selection) return 'not_eligible';
        return selection.disabled;
    };

    action.survivorIds = () => _survivorIds;
    action.dropped = () => _dropped;

    return action;
}
