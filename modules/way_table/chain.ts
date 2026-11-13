/**
 * Finds the chain of connected ways before and after a way,
 * so their tags can be compared side by side.
 *
 * Ported from `packages/core/src/traversal` in osm-way-as-table-ui
 * (~/Development/OSM/osm-way-as-table-ui), made synchronous on the iD graph.
 */

import type { NodeId, WayId } from '../osm';

export type NeighborDirection = 'backward' | 'forward';

export type ChainSegment = {
    wayID: WayId;
    /** node ids in chain direction (reversed if `reversed`) */
    nodeIDs: NodeId[];
    /** tags in chain direction: `:left`/`:right` keys are swapped if `reversed` */
    tags: Tags;
    /** the way points against the chain direction */
    reversed: boolean;
};

/** A junction where the next way is ambiguous */
export type JunctionChoice = {
    nodeID: NodeId;
    direction: NeighborDirection;
    candidates: ChainSegment[];
};

export type WayChain = {
    /** predecessors, the center way, successors */
    segments: ChainSegment[];
    centerIndex: number;
    junctions: JunctionChoice[];
};

type Graph = iD.Graph;
type Way = iD.OsmWay;

/** ways shown before and after the selected way */
export const DEFAULT_MAX_PER_SIDE = 2;

/** Keys that define what "the same kind of way" means */
const KIND_KEYS = ['highway', 'cycleway', 'footway', 'path', 'railway', 'waterway'];
const LEFT_RIGHT_RE = /:(left|right)(:|$)/;


function segmentForWay(way: Way): ChainSegment {
    return { wayID: way.id as WayId, nodeIDs: [...way.nodes] as NodeId[], tags: { ...way.tags }, reversed: false };
}

function kindOf(tags: Tags) {
    const key = KIND_KEYS.find(key => tags[key]);
    return key ? `${key}=${tags[key]}` : undefined;
}

function sameKind(a: ChainSegment, b: ChainSegment) {
    const kind = kindOf(a.tags);
    return !!kind && kind === kindOf(b.tags);
}

function endpoint(segment: ChainSegment, direction: NeighborDirection) {
    return direction === 'forward' ? segment.nodeIDs[segment.nodeIDs.length - 1] : segment.nodeIDs[0];
}

function touches(segment: ChainSegment, nodeID: NodeId) {
    return segment.nodeIDs[0] === nodeID || segment.nodeIDs[segment.nodeIDs.length - 1] === nodeID;
}


export function swapLeftRightKey(key: string) {
    return key.replace(LEFT_RIGHT_RE, (_match, side: string, suffix: string) =>
        `:${side === 'left' ? 'right' : 'left'}${suffix}`
    );
}

/** Tags of a reversed way, seen in chain direction */
export function normalizeTagsForDirection(tags: Tags, reversed: boolean): Tags {
    if (!reversed) return tags;
    return Object.fromEntries(Object.entries(tags)
        .map(([key, value]) => [LEFT_RIGHT_RE.test(key) ? swapLeftRightKey(key) : key, value])
    );
}

/** Flips `neighbor` if it points against `from` at the shared node */
function orientNeighbor(neighbor: ChainSegment, sharedNodeID: NodeId, from: ChainSegment): ChainSegment {
    const fromEndsHere = from.nodeIDs[from.nodeIDs.length - 1] === sharedNodeID;
    const neighborEndsHere = neighbor.nodeIDs[neighbor.nodeIDs.length - 1] === sharedNodeID;
    const reversed = fromEndsHere === neighborEndsHere;
    if (!reversed) return neighbor;

    return {
        ...neighbor,
        nodeIDs: [...neighbor.nodeIDs].reverse(),
        tags: normalizeTagsForDirection(neighbor.tags, true),
        reversed: true
    };
}


/** Ways at the endpoint that could continue the chain, same kind preferred */
function neighborCandidates(graph: Graph, from: ChainSegment, direction: NeighborDirection, seen: Set<WayId>) {
    const nodeID = endpoint(from, direction);
    const node = graph.hasEntity(nodeID);
    if (!node) return [];

    const touching = (graph.parentWays(node) as Way[])
        .filter(way => !seen.has(way.id as WayId))
        .map(segmentForWay)
        .filter(segment => touches(segment, nodeID));

    const same = touching.filter(segment => sameKind(from, segment));
    return same.length ? same : touching;
}

function score(from: ChainSegment, candidate: ChainSegment) {
    let result = 0;
    if (sameKind(from, candidate)) result += 100;
    if (candidate.tags.name && candidate.tags.name === from.tags.name) result += 50;
    if (candidate.tags.ref && candidate.tags.ref === from.tags.ref) result += 30;
    return result;
}

/** The best continuation, or `undefined` if the junction is ambiguous */
function pickBestNeighbor(from: ChainSegment, candidates: ChainSegment[]) {
    if (candidates.length <= 1) return candidates[0];

    const [top, second] = candidates
        .map(segment => ({ segment, score: score(from, segment) }))
        .sort((a, b) => b.score - a.score);

    // a tie is ambiguous, also between ways of the same kind (e.g. a fork of two residential roads)
    if (top.score === second.score) return undefined;
    return top.segment;
}


function extend(graph: Graph, start: ChainSegment, direction: NeighborDirection, maxCount: number, seen: Set<WayId>) {
    const extension: ChainSegment[] = [];
    let junction: JunctionChoice | undefined;
    let current = start;

    for (let i = 0; i < maxCount; i++) {
        const nodeID = endpoint(current, direction);
        const candidates = neighborCandidates(graph, current, direction, seen);
        const best = pickBestNeighbor(current, candidates);

        if (!best) {
            if (candidates.length > 1) {
                const from = current;
                junction = { nodeID, direction, candidates: candidates.map(c => orientNeighbor(c, nodeID, from)) };
            }
            break;
        }

        const oriented = orientNeighbor(best, nodeID, current);
        seen.add(oriented.wayID);
        extension.push(oriented);
        current = oriented;
    }

    return { extension, junction };
}


/**
 * Builds the chain around `wayID`.
 * `choices` pins the way to take at ambiguous junctions (`nodeID` → `wayID`).
 */
export function buildWayChain(
    graph: Graph,
    wayID: WayId,
    maxPerSide = DEFAULT_MAX_PER_SIDE,
    choices: Map<NodeId, WayId> = new Map()
): WayChain | undefined {
    const way = graph.hasEntity(wayID);
    if (!way) return undefined;

    const center = segmentForWay(way);
    const seen = new Set([center.wayID]);
    const junctions: JunctionChoice[] = [];

    const side = (direction: NeighborDirection) => {
        const segments: ChainSegment[] = [];
        let start = center;
        let remaining = maxPerSide;

        while (remaining > 0) {
            const { extension, junction } = extend(graph, start, direction, remaining, seen);
            segments.push(...extension);
            remaining -= extension.length;
            if (!junction) break;

            const chosenID = choices.get(junction.nodeID);
            const chosen = junction.candidates.find(c => c.wayID === chosenID);
            if (!chosen || remaining <= 0) {
                junctions.push(junction);
                break;
            }
            seen.add(chosen.wayID);
            segments.push(chosen);
            remaining -= 1;
            start = chosen;
        }
        return segments;
    };

    const backward = side('backward');
    const forward = side('forward');

    return {
        segments: [...backward.reverse(), center, ...forward],
        centerIndex: backward.length,
        junctions
    };
}
