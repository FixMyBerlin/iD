import { actionChangeTags } from '../actions/change_tags';
import { t } from '../core/localizer';
import { validationIssue, validationIssueFix } from '../core/validation';
import type { Validator, CreateValidator } from '../core/validation/models';
import { sidewalkCandidates } from '../sidepath/find_sidewalk';
import { projectOnLine } from '../sidepath/offset_line';
import { tildaChecks } from '../tilda/checks';
import { partKind } from '@tilda-geo/bicycle-infrastructure-tagging';
import { utilDisplayLabel } from '../util/utilDisplayLabel';
import type { coreGraph } from '../core';
import type { osmWay, WayId } from '../osm';

/**
 * A separate cycleway with a footway right next to it: `traffic_mode:<side>=foot` likely says
 * something (the bike part of a foot and cycle path that is mapped as two ways). The mapper picks
 * the side (fixes for both, the side the footway lies on first) or says "no" in the TILDA box
 * (check `traffic_mode_foot`, key-value DB). TILDA (LUA and package) reads only
 * `traffic_mode:right=foot` for `footAndCyclewaySegregated` so far (asked to accept left too).
 * Reversing the way is no way out: iD keeps `oneway=yes`, so a one-way cycleway would point the wrong way.
 */

const TYPE = 'cycleway_traffic_mode_foot';

/** The check of the TILDA box: "the footway next to it does not belong to this cycleway" */
export const TRAFFIC_MODE_FOOT_CHECK = 'traffic_mode_foot';

/** A footway this close to the cycleway runs right next to it */
export const NEXT_TO_METERS = 5;

const SIDE_KEYS = ['traffic_mode:left', 'traffic_mode:right', 'traffic_mode:both'];


/** A crossing is its own TILDA category: we never tag `traffic_mode` there (Tobias) */
function isCrossing(tags: Tags) {
    return tags.cycleway === 'crossing' || tags.path === 'crossing' || tags.footway === 'crossing';
}


/** `traffic_mode` already says a footway is next to it, or is set on both sides; or it is not needed (a crossing) */
function trafficModeKnown(tags: Tags) {
    if (isCrossing(tags)) return true;
    if (SIDE_KEYS.some(key => tags[key] === 'foot')) return true;
    if (tags['traffic_mode:both'] !== undefined) return true;
    return tags['traffic_mode:left'] !== undefined && tags['traffic_mode:right'] !== undefined;
}


/** The footways right next to a cycleway whose `traffic_mode` does not say so yet */
export function footwaysNextTo(graph: coreGraph, way: osmWay, nearby: osmWay[]): WayId[] {
    if (way.type !== 'way' || partKind(way.tags) !== 'bike' || way.isClosed()) return [];
    if (trafficModeKnown(way.tags)) return [];
    return sidewalkCandidates(graph, way.id as WayId, nearby, NEXT_TO_METERS);
}


/** On which side of the way (in its drawing direction) the other ways lie, by majority of their points nearby */
export function sideOfWay(graph: coreGraph, way: osmWay, otherIDs: WayId[]): 'left' | 'right' | undefined {
    const line = graph.childNodes(way).map(node => node.loc as [number, number]);
    let vote = 0;
    for (const id of otherIDs) {
        const other = graph.hasEntity(id);
        if (!other || other.type !== 'way') continue;
        for (const node of graph.childNodes(other as osmWay)) {
            const point = node.loc as [number, number];
            const near = projectOnLine(point, line);
            if (near.distance > NEXT_TO_METERS + 1) continue;
            const [a, b] = [line[near.index], line[near.index + 1] ?? line[near.index]];
            const scale = Math.cos(point[1] * Math.PI / 180);
            const cross = (b[0] - a[0]) * scale * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) * scale;
            vote += Math.sign(cross);
        }
    }
    return vote > 0 ? 'left' : vote < 0 ? 'right' : undefined;
}


/** The footways right next to a cycleway in the loaded data, and the side they lie on; nothing when answered */
export function footwayNextTo(context: iD.Context, way: osmWay, graph: coreGraph = context.graph(), ignoreAnswer = false) {
    if (!way.nodes.every(id => graph.hasEntity(id))) return undefined;
    if (!ignoreAnswer && tildaChecks(context).get(way.id, TRAFFIC_MODE_FOOT_CHECK)) return undefined;
    const extent = way.extent(graph).padByMeters(NEXT_TO_METERS + 1);
    const nearby = context.history().tree().intersects(extent, graph)
        .filter(other => other.type === 'way') as osmWay[];
    const footIDs = footwaysNextTo(graph, way, nearby);
    return footIDs.length ? { footIDs, side: sideOfWay(graph, way, footIDs) } : undefined;
}


export const validationCyclewayTrafficModeFoot: CreateValidator = context => {
    // "no" in the TILDA box (also by others): check the ways again
    tildaChecks(context).on(`change.validation-${TYPE}`, () => {
        context.validator().revalidateRule(TYPE, (entity: iD.OsmEntity) => entity.type === 'way' && !!entity.tags.highway);
    });

    const validation: Validator = function checkCyclewayTrafficModeFoot(entity, graph) {
        if (entity.type !== 'way' || partKind(entity.tags) !== 'bike') return [];
        if (trafficModeKnown(entity.tags)) return [];
        const found = footwayNextTo(context, entity as osmWay, graph);
        if (!found) return [];
        const { footIDs, side } = found;
        // the side the footway lies on first; right when unclear (TILDA reads only right)
        const sides: ('left' | 'right')[] = side === 'left' ? ['left', 'right'] : ['right', 'left'];

        return [new validationIssue({
            type: TYPE,
            severity: 'suggestion',
            // a new footway next to it is a new finding
            hash: footIDs.slice().sort().join(),
            message: function(context) {
                const current = context.hasEntity(this.entityIds[0]);
                return current ? t.append(`issues.${TYPE}.message`, {
                    feature: utilDisplayLabel(current, context.graph())
                }) : '';
            },
            reference: selection => {
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .call(t.append(`issues.${TYPE}.reference`, { meters: NEXT_TO_METERS }));
            },
            entityIds: [entity.id],
            dynamicFixes: () => sides.map(fixSide => new validationIssueFix({
                icon: 'iD-icon-apply',
                title: t.append(`issues.fix.${TYPE}.${fixSide}`),
                onClick: function(context) {
                    const id = this.issue!.entityIds[0] as Parameters<typeof actionChangeTags>[0];
                    const tags = { ...context.entity(id).tags, [`traffic_mode:${fixSide}`]: 'foot' };
                    context.perform(actionChangeTags(id, tags), t(`issues.fix.${TYPE}.annotation`));
                }
            }))
        })];
    };

    validation.type = TYPE;

    return validation;
};
