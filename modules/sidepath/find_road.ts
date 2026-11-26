import { geoMetersToLat, geoMetersToLon } from '../geo';
import { lineLengthMeters, projectOnLine } from './offset_line';
import { isRoad } from '@tilda-geo/bicycle-infrastructure-tagging';
import type { coreGraph } from '../core';
import type { osmWay, WayId } from '../osm';

type Loc = [number, number];
type Side = 'left' | 'right';

/** A road counts when the sidepath runs this close to it, but not on it */
const MIN_METERS = 0.5;
const MAX_METERS = 25;
/** … and at most this angle to it (degrees, either direction) */
const MAX_ANGLE = 30;
/** … over at least this share of the sidepath */
const MIN_SHARE = 0.5;
/** Spacing of the points that are checked along the sidepath */
const SAMPLE_METERS = 2;
/** Two roads of the same rank closer than this to each other: no road is sure */
const TIE_METERS = 1;

/**
 * Why the road was picked: its side is tagged as mapped separately (`cycleway:<side>=separate`,
 * then `sidewalk(:bicycle):<side>=separate`), or it is only the nearest one. A side road or a
 * parallel one-way road often lies nearer than the road the sidepath belongs to.
 */
export type RoadReason = 'cycleway_separate' | 'sidewalk_separate' | 'nearest';

export type RoadForSidepath = {
    roadID: WayId;
    /** the side of the road (in the road's drawing direction) the sidepath lies on */
    side: Side;
    /** meters between them (median) */
    distance: number;
    reason: RoadReason;
};

type Sample = { loc: Loc; direction: [number, number] };


/** Points along the line at most `step` meters apart, each with the direction (meters, unit) of its segment */
function samples(locs: Loc[], step: number): Sample[] {
    const result: Sample[] = [];
    for (let i = 1; i < locs.length; i++) {
        const [a, b] = [locs[i - 1], locs[i]];
        const dx = (b[0] - a[0]) / geoMetersToLon(1, a[1]);
        const dy = (b[1] - a[1]) / geoMetersToLat(1);
        const length = Math.hypot(dx, dy);
        if (!length) continue;
        const pieces = Math.max(1, Math.ceil(length / step));
        for (let piece = 0; piece < pieces; piece++) {
            const share = (piece + 0.5) / pieces;
            result.push({
                loc: [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share],
                direction: [dx / length, dy / length]
            });
        }
    }
    return result;
}


/** How the sidepath lies along one road, or nothing when it does not run along it */
function alongRoad(points: Sample[], roadLocs: Loc[]) {
    const minCos = Math.cos(MAX_ANGLE * Math.PI / 180);
    const roadLength = lineLengthMeters(roadLocs);
    const distances: number[] = [];
    let vote = 0;
    for (const point of points) {
        const near = projectOnLine(point.loc, roadLocs);
        if (near.distance < MIN_METERS || near.distance > MAX_METERS) continue;
        // beyond the road's end: not beside it
        if (near.along <= 0.01 || near.along >= roadLength - 0.01) continue;
        const [a, b] = [roadLocs[near.index], roadLocs[near.index + 1] ?? roadLocs[near.index]];
        const rx = (b[0] - a[0]) / geoMetersToLon(1, a[1]);
        const ry = (b[1] - a[1]) / geoMetersToLat(1);
        const length = Math.hypot(rx, ry);
        if (!length) continue;
        // parallel in either direction: the sidepath may be drawn against the road
        const cos = Math.abs((rx * point.direction[0] + ry * point.direction[1]) / length);
        if (cos < minCos) continue;
        distances.push(near.distance);
        const px = (point.loc[0] - a[0]) / geoMetersToLon(1, a[1]);
        const py = (point.loc[1] - a[1]) / geoMetersToLat(1);
        vote += Math.sign(rx * py - ry * px);
    }
    if (distances.length / points.length < MIN_SHARE || !vote) return undefined;
    distances.sort((x, y) => x - y);
    return { side: (vote > 0 ? 'left' : 'right') as Side, distance: distances[Math.floor(distances.length / 2)] };
}


function isSeparate(tags: Tags, keys: string[], side: Side) {
    return keys.some(key => tags[`${key}:${side}`] === 'separate' || tags[`${key}:both`] === 'separate' || tags[key] === 'separate');
}

function reason(tags: Tags, side: Side): RoadReason {
    if (isSeparate(tags, ['cycleway'], side)) return 'cycleway_separate';
    if (isSeparate(tags, ['sidewalk', 'sidewalk:bicycle'], side)) return 'sidewalk_separate';
    return 'nearest';
}

const RANK: Record<RoadReason, number> = { cycleway_separate: 0, sidewalk_separate: 1, nearest: 2 };


/**
 * The road a separately mapped cycleway or path belongs to, among `ways`: roads it runs along
 * (0.5–25 m away, under 30°, over at least half of it). A road whose side towards it is tagged
 * `separate` wins over a nearer one. Nothing when no road is sure (two of the same rank about
 * equally near).
 */
export function roadForSidepath(graph: coreGraph, sidepathID: WayId, ways: osmWay[]): RoadForSidepath | undefined {
    const sidepath = graph.hasEntity(sidepathID);
    if (!sidepath || sidepath.type !== 'way') return undefined;
    const points = samples(graph.childNodes(sidepath).map(node => node.loc as Loc), SAMPLE_METERS);
    if (!points.length) return undefined;

    const found: RoadForSidepath[] = [];
    for (const way of ways) {
        if (way.id === sidepathID || way.type !== 'way') continue;
        // the way may be deleted or changed since it was found
        const road = graph.hasEntity(way.id);
        if (!road || road.type !== 'way' || road.isClosed() || !isRoad(road.tags)) continue;
        if (!road.nodes.every(id => graph.hasEntity(id))) continue;
        const along = alongRoad(points, graph.childNodes(road).map(node => node.loc as Loc));
        if (along) found.push({ roadID: road.id as WayId, ...along, reason: reason(road.tags, along.side) });
    }
    if (!found.length) return undefined;

    found.sort((a, b) => RANK[a.reason] - RANK[b.reason] || a.distance - b.distance);
    const [best, next] = found;
    if (next && next.reason === best.reason && next.distance - best.distance < TIE_METERS) return undefined;
    return best;
}


/** `roadForSidepath` with the roads of the loaded data around the way */
export function roadNextTo(context: iD.Context, way: osmWay, graph: coreGraph = context.graph()) {
    if (!way.nodes.every(id => graph.hasEntity(id))) return undefined;
    const extent = way.extent(graph).padByMeters(MAX_METERS + 1);
    const nearby = context.history().tree().intersects(extent, graph)
        .filter(other => other.type === 'way') as osmWay[];
    return roadForSidepath(graph, way.id as WayId, nearby);
}
