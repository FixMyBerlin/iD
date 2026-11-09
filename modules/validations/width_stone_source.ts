import { actionChangeTags } from '../actions/change_tags';
import { t } from '../core/localizer';
import { validationIssue, validationIssueFix } from '../core/validation';
import type { CreateValidator } from '../core/validation/models';
import { parseStoneSource, stoneWidth } from '../measure/stones';
import { utilDisplayLabel } from '../util/utilDisplayLabel';
import { formatMeters } from '../width/part_widths';
import { parseOsmWidth } from '../width/width_tags';

/**
 * A width whose source counts paving stones (`source:width=7,5 Steine à 20 cm`), but the width
 * says something else (`width=1.4`, the stones give 1.5). Usually the source was picked from a
 * list or the width was measured again; the stones are the better value only when they were
 * counted, so the fix sets the width from them and the mapper decides.
 */
const TYPE = 'width_stone_source';
/** meters: rounding of the tagged width */
const TOLERANCE = 0.05;
/** width keys a stone count makes sense for, like the stone calculator */
const WIDTH_KEY = /(^|:)width(:effective)?$/;

export type StoneSourceMismatch = { key: string; source: string; width: number; stones: string };

/** Each width key whose stone source gives another width than the tagged one */
export function stoneSourceMismatches(tags: Record<string, string | undefined>): StoneSourceMismatch[] {
    const result: StoneSourceMismatch[] = [];
    for (const [sourceKey, source] of Object.entries(tags)) {
        if (!sourceKey.startsWith('source:') || !source) continue;
        const key = sourceKey.slice('source:'.length);
        if (!WIDTH_KEY.test(key)) continue;
        const stones = parseStoneSource(source);
        const width = parseOsmWidth(tags[key]);
        if (!stones || width === undefined) continue;
        const counted = stoneWidth(stones);
        if (Math.abs(Number(counted) - width) > TOLERANCE) result.push({ key, source, width, stones: counted });
    }
    return result;
}

export const validationWidthStoneSource: CreateValidator = () => {
    const validation = function checkWidthStoneSource(entity: iD.OsmEntity) {
        if (entity.type !== 'way') return [];
        return stoneSourceMismatches(entity.tags).map(mismatch => new validationIssue({
            type: TYPE,
            severity: 'warning',
            hash: `${mismatch.key}|${entity.tags[mismatch.key]}|${mismatch.source}`,
            message: function(context) {
                const current = context.hasEntity(this.entityIds[0]);
                return current ? t.append(`issues.${TYPE}.message`, {
                    feature: utilDisplayLabel(current, context.graph()),
                    key: mismatch.key,
                    width: formatMeters(mismatch.width),
                    stones: mismatch.stones
                }) : '';
            },
            reference: selection => {
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .call(t.append(`issues.${TYPE}.reference`, {
                        key: mismatch.key,
                        source: mismatch.source,
                        width: formatMeters(mismatch.width),
                        stones: mismatch.stones
                    }));
            },
            entityIds: [entity.id],
            dynamicFixes: () => [
                new validationIssueFix({
                    icon: 'iD-icon-apply',
                    title: t.append(`issues.fix.${TYPE}.title`, { key: mismatch.key, stones: mismatch.stones }),
                    onClick: function(context) {
                        const id = this.issue!.entityIds[0] as Parameters<typeof actionChangeTags>[0];
                        const tags = { ...context.entity(id).tags, [mismatch.key]: mismatch.stones };
                        context.perform(actionChangeTags(id, tags), t(`issues.fix.${TYPE}.annotation`, { key: mismatch.key }));
                    }
                })
            ]
        }));
    };

    validation.type = TYPE;
    return validation;
};
