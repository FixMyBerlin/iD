import { actionExtractMergeSidepaths } from '../actions/extract_merge_sidepaths';
import { behaviorOperation } from '../behavior/operation';
import { t } from '../core/localizer';
import { modeSelect } from '../modes/select';
import { roadChanges, sidepathKeyOperation } from './extract_sidepath';
import { extractOptions, type Side } from '../sidepath/extract_tags';
import { svgPath } from '../svg/helpers';
import { uiCmd } from '../ui/cmd';
import { loadSignRecommender, loadedSignJoiner, loadedSignRecommender } from '../traffic_sign/recommender';
import type { Operation } from '../core/history';
import type { geoExtent } from '../geo';
import type { osmWay, WayId } from '../osm';

type Choice = 'right' | 'left' | 'both';

const SIDES: Record<Choice, Side[]> = { right: ['right'], left: ['left'], both: ['right', 'left'] };


function extractMergeOperation(context: iD.Context, wayID: WayId, choice: Choice): Operation {
    const sides = SIDES[choice];

    function nearby(graph: iD.Graph, extent: geoExtent) {
        return context.history().tree().intersects(extent, graph).filter(entity => entity.type === 'way') as osmWay[];
    }

    function action() {
        return actionExtractMergeSidepaths(wayID, sides, loadedSignRecommender() ?? undefined, loadedSignJoiner(), nearby);
    }

    // the tooltip, the menu and the key ask often for the same graph: look once
    let _checked: { graph: iD.Graph; problem: ReturnType<ReturnType<typeof action>['problem']> } | undefined;
    function problem() {
        const graph = context.graph();
        if (_checked?.graph !== graph) _checked = { graph, problem: action().problem(graph) };
        return _checked.problem;
    }

    function showError(label: string) {
        (context.ui().flash as any)
            .duration(4000)
            .iconName('#iD-operation-extract')
            .iconClass('operation disabled')
            .label(label)();
    }

    const operation: Operation = function() {
        const act = action();
        const before = context.entity(wayID).tags;
        try {
            context.perform(act, operation.annotation());
        } catch (error) {
            // the history was not touched: a throwing action puts nothing on its stack
            showError(t('operations.extract_merge_sidepaths.error', { message: String((error as Error)?.message ?? error) }));
            return;
        }
        context.validator().validate();

        const { changes } = roadChanges(before, context.entity(wayID).tags);
        const dropped = act.dropped();
        const stopped = act.partialProblem();
        if (stopped) {
            // the extraction stays; the message says what did not work
            const reason = t(`operations.extract_merge_sidepaths.${stopped.reason}`, { key: stopped.key ?? '' });
            showError(t(`operations.extract_merge_sidepaths.partial.${stopped.step}`, {
                side: t(`operations.extract_sidepath.side.${stopped.side}`),
                changes,
                reason
            }));
            context.enter(modeSelect(context, [...act.survivorIds(), ...act.extractedIds()]));
            return;
        }
        (context.ui().flash as any)
            .duration(4000)
            .iconName('#iD-operation-extract')
            .iconClass('operation')
            .label(dropped.length
                ? t('operations.extract_merge_sidepaths.flash_dropped', { changes, dropped: dropped.join(', ') })
                : t('operations.extract_merge_sidepaths.flash', { changes }))();

        context.enter(modeSelect(context, act.survivorIds()));
    };

    operation.available = function() {
        return true;
    };

    operation.disabled = function() {
        // the traffic signs decide highway and access of the path: wait for their rules
        if (loadedSignRecommender() === undefined) {
            loadSignRecommender(context).catch(() => { /* extract without sign rules */ });
            return 'loading';
        }
        return problem()?.reason ?? false;
    };

    operation.tooltip = function() {
        const disabled = operation.disabled();
        if (disabled) {
            const found = problem();
            const reason = t(`operations.extract_merge_sidepaths.${disabled}`, { key: found?.key ?? '' });
            // which of the two steps stopped, and on which side: the message of the step alone does not say
            if (!found) return t.append(`operations.extract_merge_sidepaths.${disabled}`);
            return t.append(`operations.extract_merge_sidepaths.failed.${found.step}`, {
                side: t(`operations.extract_sidepath.side.${found.side}`),
                reason
            });
        }
        return t.append(`operations.extract_merge_sidepaths.description.${choice}`);
    };

    operation.annotation = function() {
        return t(`operations.extract_merge_sidepaths.annotation.${choice}`);
    };

    // hovering the menu entry shows the footways that become the path
    operation.getAuxiliaryGeometry = function() {
        if (operation.disabled()) return [];
        const act = action();
        const graph = context.graph();
        const merged = act(graph);
        const path = svgPath(context.projection, merged, false);
        return act.survivorIds().map(id => ({
            id: `extract-merge-sidepaths-${id}`,
            path: path(merged.entity(id)) ?? '',
            klass: 'preview merge-sidepaths-stays'
        }));
    };

    operation.icon = () => '#iD-operation-extract';
    operation.id = 'extract_merge_sidepaths';
    operation.keys = [];
    operation.title = t.append(`operations.extract_merge_sidepaths.title.${choice}`);

    return operation;
}


/**
 * "Extract right cycle track and merge with the sidewalk" (left, or both sides) for a single
 * selected road with a cycle track on that side (WORKDOC feature 30): feature 17 and feature 28
 * in one click, for roads whose sidewalk is a separate way already. ⌘G runs the entry (one
 * choice) or opens a menu with the choices (several).
 */
export function operationsExtractMergeSidepaths(context: iD.Context, selectedIDs: string[]): Operation[] {
    if (selectedIDs.length !== 1 || !selectedIDs[0].startsWith('w')) return [];
    const wayID = selectedIDs[0] as WayId;
    const way = context.hasEntity(wayID);
    if (!way || way.isClosed()) return [];

    // protected lanes are usually kept on the road: they are not offered here
    const sides = extractOptions(way.tags)
        .filter(option => option.variant === 'cycleway' && !option.protectedLane)
        .map(option => option.side);
    if (!sides.length) return [];

    // start loading the traffic sign rules early
    if (loadedSignRecommender() === undefined) loadSignRecommender(context).catch(() => { /* see disabled() */ });

    const choices: Choice[] = [...(['right', 'left'] as const).filter(side => sides.includes(side)), ...(sides.length > 1 ? ['both' as const] : [])];
    const operations = choices.map(choice => extractMergeOperation(context, wayID, choice));
    // the behavior is installed and removed with the operation list: hang it on the first entry
    operations[0].behavior = behaviorOperation(context)
        .which(sidepathKeyOperation(context, wayID, operations, 'extract_merge_sidepaths', uiCmd('⌘G')));
    return operations;
}
