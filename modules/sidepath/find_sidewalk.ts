import { distanceToLineMeters, lineLengthMeters, projectOnLine } from './offset_line';
import { partKind } from '@tilda-geo/bicycle-infrastructure-tagging';
import type { coreGraph } from '../core';
import type { osmWay, WayId } from '../osm';

type Loc = [number, number];

/** Points of a footway this close to the cycleway run along it */
const NEAR_METERS = 7;
/** A footway is the cycle track's other half when this share of it runs along it, or it runs along this share of the cycle track */
const NEAR_SHARE = 0.5;
const COVER_SHARE = 0.3;
/** The part that runs along must stretch this far (or half the cycle track, if that is shorter): a crossing footway does not */
const MIN_SPREAD_METERS = 5;
/** Spacing of the points that are checked along a footway */
const SAMPLE_METERS = 2;


function wayLocs(graph: coreGraph, way: osmWay) {
    return graph.childNodes(way).map(node => node.loc as Loc);
}

/** The nodes of the line plus points at most `step` meters apart in between */
function samplePoints(locs: Loc[], step: number): Loc[] {
    const points: Loc[] = [locs[0]];
    for (let i = 1; i < locs.length; i++) {
        const pieces = Math.max(1, Math.ceil(lineLengthMeters([locs[i - 1], locs[i]]) / step));
        for (let piece = 1; piece <= pieces; piece++) {
            const share = piece / pieces;
            points.push([
                locs[i - 1][0] + (locs[i][0] - locs[i - 1][0]) * share,
                locs[i - 1][1] + (locs[i][1] - locs[i - 1][1]) * share
            ]);
        }
    }
    return points;
}


/**
 * A footway that can be the other half of a cycle track: `partKind` says `foot`. Until tagging 0.2.0
 * (tilda-schemas 883ccb4) the package gives no part for a sidewalk where bicycles are only allowed
 * (`highway=footway` + `bicycle=yes|permissive`, `highway=path` + `foot=designated` + `bicycle=yes`,
 * TILDA's `footwayBicycleYes`); those count here too. Remove the second part with 0.2.0.
 */
export function isFootPart(tags: Tags) {
    if (partKind(tags) === 'foot') return true;
    if (tags.highway === 'footway') return tags.bicycle === 'yes' || tags.bicycle === 'permissive';
    return tags.highway === 'path' && tags.foot === 'designated' && tags.bicycle === 'yes';
}


/**
 * The footways among `ways` that run along the cycleway (WORKDOC feature 30): footways (or paths
 * for pedestrians, see `partKind`) of which at least half runs within a few meters of it, or that
 * run along a third of it (a long sidewalk beside a short road piece). A footway that crosses the
 * cycleway does not stretch along it.
 */
export function sidewalkCandidates(graph: coreGraph, bikeWayID: WayId, ways: osmWay[], nearMeters = NEAR_METERS): WayId[] {
    const bike = graph.hasEntity(bikeWayID);
    if (!bike || bike.type !== 'way') return [];
    const bikeLocs = wayLocs(graph, bike);
    if (bikeLocs.length < 2) return [];

    const bikePoints = samplePoints(bikeLocs, SAMPLE_METERS);
    const minSpread = Math.min(MIN_SPREAD_METERS, lineLengthMeters(bikeLocs) / 2);

    const result: WayId[] = [];
    for (const way of ways) {
        if (way.id === bikeWayID || way.type !== 'way' || way.isClosed()) continue;
        // the way may be deleted or changed since it was found
        const current = graph.hasEntity(way.id);
        if (!current || current.type !== 'way' || !isFootPart(current.tags as Tags)) continue;
        if (!current.nodes.every(id => graph.hasEntity(id))) continue;

        const locs = wayLocs(graph, current as osmWay);
        if (locs.length < 2) continue;
        const points = samplePoints(locs, SAMPLE_METERS);
        const near = points.filter(point => distanceToLineMeters(point, bikeLocs) <= nearMeters);
        if (!near.length) continue;
        const covered = bikePoints.filter(point => distanceToLineMeters(point, locs) <= nearMeters).length;
        if (near.length / points.length < NEAR_SHARE && covered / bikePoints.length < COVER_SHARE) continue;

        const along = near.map(point => projectOnLine(point, bikeLocs).along);
        if (Math.max(...along) - Math.min(...along) >= minSpread) result.push(current.id as WayId);
    }
    return result;
}
