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
    /** the problem that stops the action on this graph before it can change anything, if any */
    problem(graph: coreGraph): ExtractMergeProblem | undefined;
    /** the problem that stopped the action half way: what was done stays (known after the action ran once) */
    partialProblem(): ExtractMergeProblem | undefined;
    /** the extracted cycleways that were not merged (known after the action ran once) */
    extractedIds(): WayId[];
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
    let _partial: ExtractMergeProblem | undefined;
    let _extractedIds: WayId[] = [];

    /** All sides in turn; stops at the first step that fails, what was done before it stays */
    function run(graph: coreGraph) {
        const road = graph.entity(wayID);
        // found once, before anything changes: the first merge deletes a way the second side doesn't need
        const found = nearby(graph, road.extent(graph).padByMeters(SEARCH_METERS));
        const survivors: WayId[] = [];
        const extracted: WayId[] = [];
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
            extracted.push(bikeID);

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
            extracted.pop();
            survivors.push(...merge.survivorIds());
            for (const tag of merge.dropped()) dropped.add(tag);
        }
        return { graph, survivors, extracted, dropped: [...dropped], problem };
    }

    const action: ActionExtractMergeSidepaths = function(graph: coreGraph) {
        const result = run(graph);
        // nothing could be done: the road stays as it was
        if (result.graph === graph) return graph;
        // a cycle track that was extracted stays extracted, also if its merge failed
        _survivorIds = result.survivors;
        _extractedIds = result.extracted;
        _dropped = result.dropped;
        _partial = result.problem;
        return result.graph;
    };

    action.problem = graph => {
        const result = run(graph);
        return result.graph === graph ? result.problem : undefined;
    };
    action.partialProblem = () => _partial;
    action.extractedIds = () => _extractedIds;

    action.disabled = function(graph: coreGraph) {
        const road = graph.hasEntity(wayID);
        if (!road || road.type !== 'way') return 'not_eligible';
        return action.problem(graph)?.reason ?? false;
    };

    action.survivorIds = () => _survivorIds;
    action.dropped = () => _dropped;

    return action;
}
