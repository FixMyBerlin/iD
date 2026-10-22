import { actionExtractSidepath } from './extract_sidepath';
import { actionMergeSidepaths, mergeSidepathsSelection } from './merge_sidepaths';
import { sidewalkCandidates } from '../sidepath/find_sidewalk';
import type { Side, SignRecommend } from '../sidepath/extract_tags';
import type { JoinSigns } from '../sidepath/merge_tags';
import type { Action } from '../core/history';
import type { coreGraph } from '../core';
import type { geoExtent } from '../geo';
import type { osmWay, WayId } from '../osm';

/** The ways of the map near an extent, e.g. from the history's tree */
export type NearbyWays = (graph: coreGraph, extent: geoExtent) => osmWay[];

/** Why the action can't run, for which side and in which step; `key` names the tag of `different_values` */
export type ExtractMergeProblem = { reason: string; key?: string; side: Side; step: 'extract' | 'merge' };

export interface ActionExtractMergeSidepaths extends Action {
    /** the ways that carry the foot and cycle path now (known after the action ran once) */
    survivorIds(): WayId[];
    /** `key=value` tags that were not taken over from the deleted cycleways */
    dropped(): string[];
    /** the problem the action would run into on this graph, if any */
    problem(graph: coreGraph): ExtractMergeProblem | undefined;
}

/** Footways are looked for this far around the road: its stacked lanes and the sidewalk fit in */
const SEARCH_METERS = 40;


/**
 * Extract the cycle track of one or both sides of a road (WORKDOC feature 17, variant A) and merge
 * it right away with the footway that already runs along it (feature 28): one step instead of two.
 * The footway is found by its position; if there is none, the action does not run.
 */
export function actionExtractMergeSidepaths(
    wayID: WayId,
    sides: Side[],
    recommend: SignRecommend | undefined,
    joinSigns: JoinSigns | undefined,
    nearby: NearbyWays
): ActionExtractMergeSidepaths {
    let _survivorIds: WayId[] = [];
    let _dropped: string[] = [];

    /** All sides in turn; stops at the first side that can't be extracted and merged */
    function run(graph: coreGraph) {
        const road = graph.entity(wayID);
        // found once, before anything changes: the first merge deletes a way the second side doesn't need
        const found = nearby(graph, road.extent(graph).padByMeters(SEARCH_METERS));
        const survivors: WayId[] = [];
        const dropped = new Set<string>();
        let problem: ExtractMergeProblem | undefined;

        for (const side of sides) {
            const extract = actionExtractSidepath(wayID, 'cycleway', side, recommend, joinSigns);
            const extractProblem = extract.disabled!(graph);
            if (extractProblem) {
                problem = { reason: extractProblem, side, step: 'extract' };
                break;
            }
            graph = extract(graph);
            const bikeID = extract.getWayId();

            const footIDs = sidewalkCandidates(graph, bikeID, found);
            if (!footIDs.length) {
                problem = { reason: 'no_sidewalk', side, step: 'merge' };
                break;
            }
            const wayIDs = [bikeID, ...footIDs];
            const selection = mergeSidepathsSelection(graph, wayIDs);
            if (!selection || selection.disabled) {
                problem = {
                    reason: selection ? selection.disabled as string : 'no_sidewalk',
                    key: selection && 'key' in selection ? selection.key as string : undefined,
                    side,
                    step: 'merge'
                };
                break;
            }
            const merge = actionMergeSidepaths(wayIDs, recommend, joinSigns);
            graph = merge(graph);
            survivors.push(...merge.survivorIds());
            for (const tag of merge.dropped()) dropped.add(tag);
        }
        return { graph, survivors, dropped: [...dropped], problem };
    }

    const action: ActionExtractMergeSidepaths = function(graph: coreGraph) {
        const result = run(graph);
        // never half done: a side that can't be merged leaves the road as it was
        if (result.problem) return graph;
        _survivorIds = result.survivors;
        _dropped = result.dropped;
        return result.graph;
    };

    action.problem = graph => run(graph).problem;

    action.disabled = function(graph: coreGraph) {
        const road = graph.hasEntity(wayID);
        if (!road || road.type !== 'way') return 'not_eligible';
        return action.problem(graph)?.reason ?? false;
    };

    action.survivorIds = () => _survivorIds;
    action.dropped = () => _dropped;

    return action;
}
