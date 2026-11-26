import { actionLaneFromPath, type LaneKind } from '../actions/lane_from_path';
import { behaviorOperation } from '../behavior/operation';
import { t } from '../core/localizer';
import { modeSelect } from '../modes/select';
import { roadNextTo } from '../sidepath/find_road';
import { canPlanLaneFromSegregatedPath, renderMessage, type LaneFromPathTarget } from '@tilda-geo/bicycle-infrastructure-tagging';
import { packageLanguage } from '../tilda/package_texts';
import { svgPath } from '../svg/helpers';
import { uiCmd } from '../ui/cmd';
import { sidepathKeyOperation } from './extract_sidepath';
import type { Operation } from '../core/history';
import type { osmWay, WayId } from '../osm';

const TARGETS: LaneFromPathTarget[] = ['line', 'centerline'];
const LANES: LaneKind[] = ['exclusive', 'advisory'];


function laneOperation(context: iD.Context, pathID: WayId, target: LaneFromPathTarget, lane: LaneKind): Operation {
    // the road is looked up once per graph: the tooltip, the menu and the key ask often
    let _found: { graph: iD.Graph; road: ReturnType<typeof roadNextTo> } | undefined;
    function road() {
        const graph = context.graph();
        if (_found?.graph !== graph) _found = { graph, road: roadNextTo(context, context.entity(pathID) as osmWay, graph) };
        return _found.road;
    }
    const action = () => actionLaneFromPath(pathID, road()!, target, lane);

    const operation: Operation = function() {
        const act = action();
        context.perform(act, operation.annotation());
        context.validator().validate();

        const review = act.review().map(ref => renderMessage(ref, packageLanguage()));
        const done = t(`operations.lane_from_path.flash.${target}`);
        (context.ui().flash as any)
            .duration(review.length ? 8000 : 4000)
            .iconName('#iD-operation-extract')
            .iconClass('operation')
            .label([done, ...review].join(' '))();

        const laneID = act.getLaneId();
        context.enter(modeSelect(context, laneID ? [pathID, laneID] : [pathID]));
    };

    operation.available = () => true;

    operation.disabled = function() {
        if (!road()) return 'no_road';
        return action().disabled?.(context.graph()) || false;
    };

    operation.tooltip = function() {
        const disabled = operation.disabled();
        return disabled
            ? t.append(`operations.lane_from_path.${disabled}`)
            : t.append(`operations.lane_from_path.description.${target}`);
    };

    operation.annotation = () => t(`operations.lane_from_path.annotation.${target}`);

    // hovering the entry shows the new lane line
    operation.getAuxiliaryGeometry = function() {
        if (target !== 'line' || operation.disabled()) return [];
        const act = action();
        const graph = act(context.graph());
        const laneID = act.getLaneId();
        if (!laneID) return [];
        return [{
            id: `lane-from-path-${laneID}`,
            path: svgPath(context.projection, graph, false)(graph.entity(laneID)) ?? '',
            klass: 'preview'
        }];
    };

    operation.icon = () => '#iD-operation-extract';
    operation.id = `lane_from_path_${target}_${lane}`;
    operation.keys = [];
    operation.title = t.append(`operations.lane_from_path.lane.${lane}`);

    return operation;
}


/**
 * "Extract bike lane …" (WORKDOC feature 40) for a single way mapped as a segregated foot and cycle
 * path that is really a sidewalk next to a bike lane on the carriageway: one entry with a flyout,
 * "as a line of its own" and "tagged on the road", each as Radfahrstreifen or Schutzstreifen (TILDA
 * needs one of them). ⌘E opens the choices. Mapper request (Ines, 2026-11-26).
 */
export function operationsLaneFromPath(context: iD.Context, selectedIDs: string[]): Operation[] {
    if (selectedIDs.length !== 1 || !selectedIDs[0].startsWith('w')) return [];
    const pathID = selectedIDs[0] as WayId;
    const path = context.hasEntity(pathID);
    if (!path || path.type !== 'way' || path.isClosed() || !canPlanLaneFromSegregatedPath(path.tags)) return [];

    const groups = TARGETS.map(target => ({
        id: target,
        title: t.append(`operations.lane_from_path.group.${target}`),
        operations: LANES.map(lane => laneOperation(context, pathID, target, lane))
    }));
    const entries = groups.flatMap(group => group.operations);
    const enabled = () => entries.filter(entry => !entry.disabled());

    const operation: Operation = function() { /* the edit menu opens the flyout */ };
    operation.available = () => true;
    operation.disabled = () => enabled().length ? false : entries[0].disabled();
    operation.tooltip = () => {
        const disabled = operation.disabled();
        return disabled ? entries[0].tooltip() : t.append('operations.lane_from_path.description.menu');
    };
    operation.annotation = () => '';
    operation.icon = () => '#iD-operation-extract';
    operation.id = 'lane_from_path';
    operation.keys = [uiCmd('⌘E')];
    operation.title = t.append('operations.lane_from_path.title');
    operation.flyout = groups;
    operation.behavior = behaviorOperation(context)
        .which(sidepathKeyOperation(context, pathID, entries, 'lane_from_path', uiCmd('⌘E')));

    return [operation];
}
