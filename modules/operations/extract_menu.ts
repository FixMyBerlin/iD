import { behaviorOperation } from '../behavior/operation';
import { t } from '../core/localizer';
import { operationsExtractBothSides, operationsExtractSidepath, sidepathKeyOperation } from './extract_sidepath';
import { operationsExtractMergeSidepaths } from './extract_merge_sidepaths';
import { uiCmd } from '../ui/cmd';
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

    const entries = [...both, ...single, ...merge];
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

    const bothExtract = both.length ? both : single;
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
