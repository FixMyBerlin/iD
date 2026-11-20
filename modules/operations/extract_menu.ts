import { behaviorOperation } from '../behavior/operation';
import { t } from '../core/localizer';
import { operationsExtractBothSides, operationsExtractSidepath, sidepathKeyOperation } from './extract_sidepath';
import { operationsExtractMergeSidepaths } from './extract_merge_sidepaths';
import { uiCmd } from '../ui/cmd';
import { sideTags } from '@tilda-geo/bicycle-infrastructure-tagging';
import type { Operation } from '../core/history';
import type { WayId } from '../osm';


/**
 * One "Extract …" entry in the edit menu (WORKDOC feature 17/30): it opens a flyout with text
 * entries in three groups, both sides, left only, right only. Each group holds the extract
 * entries and the extract-and-merge entries of that side.
 * ⌘E runs the "both sides" entry (or opens a menu when there are several); without a both-sides
 * entry it works on the single-side entries as before. ⌘G runs "extract and merge" on both sides
 * (or the only side), no choice.
 */
export function operationsExtractMenu(context: iD.Context, selectedIDs: string[]): Operation[] {
    const single = operationsExtractSidepath(context, selectedIDs, { keys: false });
    if (!single.length) return [];
    const wayID = selectedIDs[0] as WayId;
    const both = operationsExtractBothSides(context, wayID);
    const merge = operationsExtractMergeSidepaths(context, selectedIDs, { keys: false });

    // a cycle track segregated from the sidewalk (`cycleway:<side>:segregated=yes`) is one segregated
    // foot and cycle path with it: "extract cycle track" merges it with the sidewalk when there is one
    const tags = context.entity(wayID).tags;
    const mergeFor = (operation: Operation) => merge.find(entry => entry.side === operation.side);
    const withMerge = (operation: Operation) => operation.variant === 'cycleway' && segregated(tags, operation.side)
        ? preferMerge(operation, mergeFor(operation)) : operation;

    const entries = [...both.map(withMerge), ...single.map(withMerge), ...merge];
    const groups = (['both', 'left', 'right'] as const)
        .map(side => ({
            id: side,
            title: t.append(`operations.extract_menu.group.${side}`),
            operations: entries.filter(operation => operation.side === side)
        }))
        .filter(group => group.operations.length);

    const enabled = () => entries.filter(operation => !operation.disabled());

    const operation: Operation = function() { /* the edit menu opens the flyout */ };
    operation.available = () => true;
    operation.disabled = () => enabled().length ? false : entries[0].disabled();
    operation.tooltip = () => t.append('operations.extract_menu.description');
    operation.annotation = () => '';
    operation.icon = () => '#iD-operation-extract';
    operation.id = 'extract_menu';
    operation.keys = [uiCmd('⌘E')];
    operation.title = t.append('operations.extract_menu.title');
    operation.flyout = groups;

    const bothExtract = (both.length ? both : single).map(withMerge);
    operation.behavior = behaviorOperation(context)
        .which(sidepathKeyOperation(context, wayID, bothExtract, 'extract_sidepath', uiCmd('⌘E')));

    // ⌘G: extract and merge, always the last entry ("both", or the only side), no choice
    if (merge.length) {
        const mergeBehavior = behaviorOperation(context)
            .which(sidepathKeyOperation(context, wayID, merge.slice(-1), 'extract_merge_sidepaths', uiCmd('⌘G')));
        const extractBehavior = operation.behavior as any;
        const combined: any = function(selection: any) {
            extractBehavior(selection);
            mergeBehavior(selection);
        };
        combined.off = function(selection: any) {
            extractBehavior.off(selection);
            mergeBehavior.off(selection);
        };
        combined.on = function() {
            extractBehavior.on();
            mergeBehavior.on();
        };
        operation.behavior = combined;
    }

    return [operation];
}


/** `cycleway:<side>:segregated=yes` (or `:both:`, plain); both sides for "both" */
function segregated(tags: Tags, side: Operation['side']) {
    const sides = side === 'both' ? ['right', 'left'] as const : side ? [side] : [];
    return sides.length > 0 && sides.every(one => sideTags(tags, 'cycleway', one).segregated === 'yes');
}

/**
 * The extract entry, but it runs "extract and merge with the sidewalk": for a segregated cycle track
 * that action decides (merged with the sidewalk; the cycleway line of two lines when only one of them
 * is under construction; a segregated foot and cycle path of its own without a sidewalk way).
 */
function preferMerge(plain: Operation, merge: Operation | undefined): Operation {
    if (!merge) return plain;
    const current = () => merge.disabled() ? plain : merge;

    const operation: Operation = Object.assign(function(event?: KeyboardEvent) {
        current()(event);
    }, plain);
    operation.disabled = () => current().disabled();
    operation.tooltip = () => current().tooltip();
    operation.annotation = () => current().annotation();
    operation.getAuxiliaryGeometry = () => current().getAuxiliaryGeometry?.() ?? [];
    return operation;
}
