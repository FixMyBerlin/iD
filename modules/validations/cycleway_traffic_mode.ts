import { t } from '../core/localizer';
import { validationIssue } from '../core/validation';
import type { Validator, CreateValidator } from '../core/validation/models';
import { sidewalkCandidates } from '../sidepath/find_sidewalk';
import { partKind } from '@tilda-geo/bicycle-infrastructure-tagging';
import { utilDisplayLabel } from '../util/utilDisplayLabel';
import type { coreGraph } from '../core';
import type { osmWay, WayId } from '../osm';

/**
 * A separate cycleway with a footway right next to it: `traffic_mode:<side>=foot` likely says
 * something (the bike part of a foot and cycle path that is mapped as two ways). Only a hint:
 * the mapper sets the side, the footway's position is not reliable enough to set it.
 */

const TYPE = 'cycleway_traffic_mode_foot';

/** A footway this close to the cycleway runs right next to it */
export const NEXT_TO_METERS = 5;

const SIDE_KEYS = ['traffic_mode:left', 'traffic_mode:right', 'traffic_mode:both'];


/** `traffic_mode` already says a footway is next to it, or is set on both sides */
function trafficModeKnown(tags: Tags) {
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


export const validationCyclewayTrafficModeFoot: CreateValidator = context => {
    const validation: Validator = function checkCyclewayTrafficModeFoot(entity, graph) {
        if (entity.type !== 'way' || partKind(entity.tags) !== 'bike') return [];
        if (trafficModeKnown(entity.tags)) return [];
        const way = entity as osmWay;
        if (!way.nodes.every(id => graph.hasEntity(id))) return [];

        const extent = way.extent(graph).padByMeters(NEXT_TO_METERS + 1);
        const nearby = context.history().tree().intersects(extent, graph)
            .filter(other => other.type === 'way') as osmWay[];
        const footIDs = footwaysNextTo(graph, way, nearby);
        if (!footIDs.length) return [];

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
            entityIds: [entity.id]
        })];
    };

    validation.type = TYPE;

    return validation;
};
