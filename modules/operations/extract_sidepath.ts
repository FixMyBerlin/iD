import { actionExtractSidepath } from '../actions/extract_sidepath';
import { behaviorOperation } from '../behavior/operation';
import { t } from '../core/localizer';
import { modeSelect } from '../modes/select';
import { extractOptions, planExtraction, type ExtractOption } from '../sidepath/extract_tags';
import { svgPath } from '../svg/helpers';
import { uiCmd } from '../ui/cmd';
import { loadSignRecommender, loadedSignJoiner, loadedSignRecommender } from '../traffic_sign/recommender';
import type { Operation } from '../core/history';
import type { WayId } from '../osm';

function titleID(option: ExtractOption) {
    const variant = option.protectedLane ? 'protected' : option.variant;
    return `operations.extract_sidepath.title.${variant}.${option.side}`;
}


/** What changes on the road: tags set (`key=value`) and how many tags are removed (they move to the new way) */
function roadChanges(before: Tags, after: Tags) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [...keys].filter(key => before[key] !== after[key]);
    return {
        changes: changed.filter(key => after[key] !== undefined).sort().map(key => `${key}=${after[key]}`).join(', '),
        moved: changed.filter(key => after[key] === undefined).length
    };
}


function extractSidepathOperation(context: iD.Context, wayID: WayId, option: ExtractOption): Operation {
    const { variant, side } = option;

    function recommend() {
        return loadedSignRecommender() ?? undefined;
    }

    function action() {
        return actionExtractSidepath(wayID, variant, side, recommend(), loadedSignJoiner());
    }

    function plan() {
        return planExtraction(context.entity(wayID).tags, variant, side, recommend(), loadedSignJoiner());
    }

    const operation: Operation = function() {
        const act = action();
        const before = context.entity(wayID).tags;
        context.perform(act, operation.annotation());
        context.validator().validate();

        const { changes } = roadChanges(before, context.entity(wayID).tags);
        const kept = act.keptBicycle();
        (context.ui().flash as any)
            .duration(4000)
            .iconName('#iD-operation-extract')
            .iconClass('operation')
            .label(kept
                ? t('operations.extract_sidepath.flash_kept', { changes, bicycle: kept })
                : t('operations.extract_sidepath.flash', { changes }))();

        context.enter(modeSelect(context, [act.getWayId()]));
    };

    operation.available = function() {
        return true;
    };

    operation.disabled = function() {
        const graph = context.graph();
        // no "not enough of it is visible": it slowed the work down too much (testers, 2026-10-14)
        // the traffic sign decides highway and access of the new way: wait for its rules
        if (loadedSignRecommender() === undefined) {
            loadSignRecommender(context).catch(() => { /* extract without sign rules */ });
            return 'loading';
        }
        return action().disabled!(graph) || false;
    };

    operation.tooltip = function() {
        const disabled = operation.disabled();
        if (disabled) return t.append(`operations.extract_sidepath.${disabled}`);
        const extraction = plan();
        // protected lanes are usually kept on the road: the tooltip says so
        return t.append(`operations.extract_sidepath.description${option.protectedLane ? '_protected' : ''}`, {
            meters: Math.round(extraction.offsetMeters),
            side: t(`operations.extract_sidepath.side.${side}`),
            highway: extraction.wayTags.highway,
            ...roadChanges(context.entity(wayID).tags, extraction.roadTags)
        });
    };

    operation.annotation = function() {
        return t(`operations.extract_sidepath.annotation.${option.protectedLane ? 'protected' : variant}`, {
            side: t(`operations.extract_sidepath.side.${side}`)
        });
    };

    // hovering the menu entry shows where the new way goes
    operation.getAuxiliaryGeometry = function() {
        if (operation.disabled()) return [];
        const act = action();
        const preview = act(context.graph());
        const way = preview.entity(act.getWayId());
        const path = svgPath(context.projection, preview, false)(way);
        return path ? [{ id: `extract-sidepath-${variant}-${side}`, path, klass: 'preview extract-sidepath-preview' }] : [];
    };

    operation.icon = () => '#iD-operation-extract';
    operation.id = 'extract_sidepath';
    operation.keys = [];
    operation.title = t.append(titleID(option));

    return operation;
}


/**
 * ⌘E for the extract entries of the edit menu: one enabled entry runs, several open a menu with
 * all of them next to the pointer. The entries have no key of their own: the key does not pick one.
 */
function extractSidepathKeyOperation(context: iD.Context, wayID: WayId, operations: Operation[]): Operation {
    const enabled = () => operations.filter(operation => !operation.disabled());

    function showChoices() {
        // next to the pointer; the way's center if the pointer was last seen outside of the map
        const { width, height } = context.surfaceRect();
        const mouse = context.map().mouse();
        const inside = mouse && mouse[0] >= 0 && mouse[0] <= width && mouse[1] >= 0 && mouse[1] <= height;
        const anchor = inside ? mouse : context.projection(context.entity(wayID).extent(context.graph()).center());
        context.ui().showEditMenu(anchor, 'keyboard', operations);
    }

    const operation: Operation = function(event) {
        enabled()[0]?.(event);
    };

    operation.available = () => true;

    // several choices: the interrupt opens the menu, so no "Extract" flash comes before it
    operation.disabled = function() {
        const choices = enabled();
        if (choices.length > 1) return 'choose';
        return choices.length ? false : operations[0].disabled();
    };

    operation.interrupts = { choose: () => Promise.resolve(showChoices()) };

    const current = () => enabled()[0] ?? operations[0];
    operation.tooltip = () => current().tooltip();
    operation.annotation = () => current().annotation();

    operation.id = 'extract_sidepath';
    operation.keys = [uiCmd('⌘E')];
    operation.title = operations[0].title;

    return operation;
}


/**
 * "Extract right cycle track", "… sidewalk", "… cycle track and sidewalk as one path" for the
 * sides of a single selected road (WORKDOC feature 17). Added to the edit menu after "Extract".
 * ⌘E extracts (one choice) or opens a menu with the choices (several).
 */
export function operationsExtractSidepath(context: iD.Context, selectedIDs: string[]): Operation[] {
    if (selectedIDs.length !== 1 || !selectedIDs[0].startsWith('w')) return [];
    const wayID = selectedIDs[0] as WayId;
    const way = context.hasEntity(wayID);
    if (!way || way.isClosed()) return [];

    // start loading the traffic sign rules early
    if (loadedSignRecommender() === undefined) loadSignRecommender(context).catch(() => { /* see disabled() */ });

    const operations = extractOptions(way.tags).map(option => extractSidepathOperation(context, wayID, option));
    // the behavior is installed and removed with the operation list: hang it on the first entry
    if (operations.length) {
        operations[0].behavior = behaviorOperation(context).which(extractSidepathKeyOperation(context, wayID, operations));
    }
    return operations;
}
