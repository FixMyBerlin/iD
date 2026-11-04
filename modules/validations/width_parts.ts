import { actionChangeTags } from '../actions/change_tags';
import { t } from '../core/localizer';
import { validationIssue, validationIssueFix } from '../core/validation';
import type { CreateValidator } from '../core/validation/models';
import { utilDisplayLabel } from '../util/utilDisplayLabel';
import { formatMeters, partWidthMismatch } from '../width/part_widths';

/**
 * `width` of a shared foot and cycle path is not the sum of `cycleway:width` and `footway:width`.
 * Only when all three are tagged: which of them must be there is the TILDA checklist's decision.
 */
const TYPE = 'width_parts_sum';

export const validationWidthPartsSum: CreateValidator = () => {
    const validation = function checkWidthPartsSum(entity: iD.OsmEntity) {
        if (entity.type !== 'way') return [];
        const mismatch = partWidthMismatch(entity.tags);
        if (!mismatch) return [];

        const sum = formatMeters(mismatch.sum);
        const [cycleway, footway] = mismatch.parts;
        return [new validationIssue({
            type: TYPE,
            severity: 'warning',
            hash: `${entity.tags.width}|${entity.tags['cycleway:width']}|${entity.tags['footway:width']}`,
            message: function(context) {
                const current = context.hasEntity(this.entityIds[0]);
                return current ? t.append(`issues.${TYPE}.message`, {
                    feature: utilDisplayLabel(current, context.graph()),
                    width: formatMeters(mismatch.width),
                    sum
                }) : '';
            },
            reference: selection => {
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .call(t.append(`issues.${TYPE}.reference`, {
                        width: formatMeters(mismatch.width),
                        cycleway: formatMeters(cycleway.meters),
                        footway: formatMeters(footway.meters),
                        sum
                    }));
            },
            entityIds: [entity.id],
            dynamicFixes: () => [
                new validationIssueFix({
                    icon: 'iD-icon-apply',
                    title: t.append('issues.fix.width_parts_sum.title', { sum }),
                    onClick: function(context) {
                        const id = this.issue!.entityIds[0] as Parameters<typeof actionChangeTags>[0];
                        const tags = { ...context.entity(id).tags, width: sum };
                        context.perform(actionChangeTags(id, tags), t('issues.fix.width_parts_sum.annotation'));
                    }
                })
            ]
        })];
    };

    validation.type = TYPE;
    return validation;
};
