import { actionMergeSidepaths, mergeSidepathsSelection } from '../actions/merge_sidepaths';
import { behaviorOperation } from '../behavior/operation';
import { t } from '../core/localizer';
import { modeSelect } from '../modes/select';
import { svgPath } from '../svg/helpers';
import { uiCmd } from '../ui/cmd';
import { loadSignRecommender, loadedSignJoiner, loadedSignRecommender } from '../traffic_sign/recommender';
import type { Operation } from '../core/history';
import type { WayId } from '../osm';

/**
 * "Merge into a foot and cycle path" for a selected cycleway and footway(s) (or footway and
 * cycleways) that run side by side (WORKDOC feature 28). Added to the edit menu after the
 * "Extract …" entries of feature 17, as the second step after extracting a cycle track.
 */
export function operationsMergeSidepaths(context: iD.Context, selectedIDs: string[]): Operation[] {
    if (selectedIDs.length < 2 || !selectedIDs.every(id => id.startsWith('w'))) return [];
    const wayIDs = selectedIDs as WayId[];
    if (!mergeSidepathsSelection(context.graph(), wayIDs)) return [];

    // start loading the traffic sign rules early
    if (loadedSignRecommender() === undefined) loadSignRecommender(context).catch(() => { /* see disabled() */ });

    function selection() {
        return mergeSidepathsSelection(context.graph(), wayIDs);
    }

    function action() {
        return actionMergeSidepaths(wayIDs, loadedSignRecommender() ?? undefined, loadedSignJoiner());
    }

    const operation: Operation = function() {
        const act = action();
        context.perform(act, operation.annotation());
        context.validator().validate();

        const dropped = act.dropped();
        (context.ui().flash as any)
            .duration(4000)
            .iconName('#iD-operation-merge')
            .iconClass('operation')
            .label(dropped.length
                ? t('operations.merge_sidepaths.flash_dropped', { dropped: dropped.join(', ') })
                : t('operations.merge_sidepaths.flash'))();

        context.enter(modeSelect(context, act.survivorIds()));
    };

    operation.available = function() {
        return true;
    };

    operation.disabled = function() {
        const current = selection();
        if (!current) return 'not_eligible';
        if (current.disabled) return current.disabled;
        // no "not enough of them is visible": it slowed the work down too much (testers, 2026-10-14)
        // the signs decide `segregated` and are joined by the tool's rules: wait for them
        if (loadedSignRecommender() === undefined) {
            loadSignRecommender(context).catch(() => { /* merge without sign rules */ });
            return 'loading';
        }
        return false;
    };

    operation.tooltip = function() {
        const current = selection();
        const disabled = operation.disabled();
        if (disabled) {
            const key = current && current.disabled === 'different_values' ? current.key : '';
            return t.append(`operations.merge_sidepaths.${disabled}`, { key });
        }
        if (!current || current.disabled) return t.append('operations.merge_sidepaths.not_eligible');
        // the longer way is cut first; what runs on past the other way stays as it is
        if ('cutPlan' in current && current.cutPlan?.points.length) {
            return t.append(`operations.merge_sidepaths.description_cut.${current.cut}`);
        }
        return t.append(`operations.merge_sidepaths.description.${current.surviving}`, {
            count: current.deleted.length
        });
    };

    operation.annotation = function() {
        return t('operations.merge_sidepaths.annotation');
    };

    // hovering the menu entry shows which ways stay (solid) and which go (dashed)
    operation.getAuxiliaryGeometry = function() {
        const current = selection();
        if (!current || current.disabled) return [];
        const graph = context.graph();
        const path = svgPath(context.projection, graph, false);
        return [
            ...current.survivors.map(way => ({ way, klass: 'preview merge-sidepaths-stays' })),
            ...current.deleted.map(way => ({ way, klass: 'preview merge-sidepaths-goes' }))
        ].map(({ way, klass }) => ({ id: `merge-sidepaths-${way.id}`, path: path(graph.entity(way.id as WayId)) ?? '', klass }));
    };

    operation.icon = () => '#iD-operation-merge';
    operation.id = 'merge_sidepaths';
    operation.keys = [uiCmd('⌘M')];
    operation.title = t.append('operations.merge_sidepaths.title');
    operation.behavior = behaviorOperation(context).which(operation);

    return [operation];
}
