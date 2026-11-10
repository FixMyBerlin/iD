import {
    RADNETZ_RULES,
    TILDA_GEO_RULES,
    applyTagFix,
    renderMessage,
    ruleDescription,
    validateTags,
    type Finding,
    type TagFix
} from '@tilda-geo/bicycle-infrastructure-tagging/validation';
import { actionChangeTags } from '../actions/change_tags';
import { kvErrorMessage } from '../core/kv_error_message';
import { t } from '../core/localizer';
import { validationIssue, validationIssueFix } from '../core/validation';
import type { CreateValidator, Validator } from '../core/validation/models';
import { tildaChecks } from '../tilda/checks';
import { packageLanguage } from '../tilda/package_texts';
import { definedTags } from '../tilda/tags';
import { utilDisplayLabel } from '../util/utilDisplayLabel';

/**
 * iD validators for the Radnetz rules of `@tilda-geo/bicycle-infrastructure-tagging/validation`
 * (part widths, `cycleway:*:oneway`). One validator per rule, so each can be switched off on its
 * own. The rules and their texts come from the package; this only turns findings into iD issues.
 * The titles and tips of the rule list stay in `data/core.yaml` (`issues.<rule id>`).
 */

const SEVERITY = { error: 'error', warning: 'warning', info: 'suggestion' } as const;

/** Rules a mapper can confirm with "this is correct here" (stored in the key-value DB, not in OSM) */
const CONFIRMABLE = new Set(['cycleway_oneway_wrong']);

type EntityID = Parameters<typeof actionChangeTags>[0];

const confirmedAnswer = (finding: Finding, tags: Tags) => finding.keys.map(key => `${key}=${tags[key]}`).join('|');


function createValidator(context: iD.Context, ruleId: string): Validator {
    const checks = tildaChecks(context);
    const confirmable = CONFIRMABLE.has(ruleId);

    const validation: Validator = function checkTildaRule(entity) {
        if (entity.type !== 'way' || !entity.tags.highway) return [];
        const tags = entity.tags as Tags;

        return validateTags(tags, { profile: 'radnetz-berlin', only: [ruleId] })
            // a mapper said: this is correct here
            .filter(finding => !confirmable || checks.get(entity.id, finding.keys[0])?.answer !== confirmedAnswer(finding, tags))
            .map(finding => new validationIssue({
                type: ruleId,
                subtype: finding.message.code,
                severity: SEVERITY[finding.severity],
                hash: confirmedAnswer(finding, tags),
                message: function(context) {
                    const current = context.hasEntity(this.entityIds[0]);
                    return current ? t.append('issues.tilda_rule.message', {
                        feature: utilDisplayLabel(current, context.graph()),
                        text: renderMessage(finding.message, packageLanguage())
                    }) : '';
                },
                reference: selection => {
                    selection.selectAll('.issue-reference')
                        .data([0])
                        .enter()
                        .append('div')
                        .attr('class', 'issue-reference')
                        .text(ruleDescription(ruleId, packageLanguage()) ?? '');
                },
                entityIds: [entity.id],
                dynamicFixes: () => [
                    ...finding.fixes.map(fix => tagFix(fix)),
                    ...(confirmable ? [confirmFix(finding, entity.id, tags)] : [])
                ]
            }));
    };

    function tagFix(fix: TagFix) {
        const title = renderMessage(fix.message, packageLanguage());
        return new validationIssueFix({
            icon: fix.remove?.length && !fix.add && !fix.change ? 'iD-operation-delete' : 'iD-icon-apply',
            title: t.append('issues.fix.tilda_rule.title', { text: title }),
            onClick: function(context) {
                const id = this.issue!.entityIds[0] as EntityID;
                context.perform(actionChangeTags(id, definedTags(applyTagFix(context.entity(id).tags, fix))), title);
            }
        });
    }

    function confirmFix(finding: Finding, entityID: string, tags: Tags) {
        const disabled = checks.disabledReason(entityID);
        return new validationIssueFix({
            icon: 'iD-icon-apply',
            title: t.append('issues.fix.tilda_rule_correct.title'),
            disabledReason: disabled && t(`inspector.tilda.checks.disabled.${disabled}`),
            onClick: disabled ? undefined : function(context) {
                const version = context.hasEntity(entityID as EntityID)?.version;
                checks.set(entityID, finding.keys[0], confirmedAnswer(finding, tags), version === undefined ? undefined : String(version))
                    .catch((err: unknown) => {
                        (context.ui().flash as any)
                            .duration(6000)
                            .iconName('#iD-icon-alert')
                            .label(t.append('inspector.tilda.checks.save_failed', { reason: kvErrorMessage(err) }))();
                    });
            }
        });
    }

    validation.type = ruleId;
    return validation;
}


/** An iD validator for one rule of the package */
function tildaRuleValidator(ruleId: string): CreateValidator {
    if (![...RADNETZ_RULES, ...TILDA_GEO_RULES].some(rule => rule.id === ruleId)) throw new Error(`Unknown TILDA rule ${ruleId}`);
    return context => {
        const validation = createValidator(context, ruleId);
        if (CONFIRMABLE.has(ruleId)) {
            // "this is correct here" was stored or removed (also by others): check the ways again
            tildaChecks(context).on(`change.validation-${ruleId}`, () => {
                context.validator().revalidateRule(ruleId, (entity: iD.OsmEntity) => entity.type === 'way' && !!entity.tags.highway);
            });
        }
        return validation;
    };
}

// The Radnetz rules of the package (`RADNETZ_RULES`). A new rule there needs a line here and a title
// and tip in `data/core.yaml` (`issues.<rule id>`).
export const validationWidthPartSum = tildaRuleValidator('width_part_sum');
export const validationWidthPartWhole = tildaRuleValidator('width_part_whole');
export const validationWidthPartUnsegregated = tildaRuleValidator('width_part_unsegregated');
export const validationCyclewayOnewayWrong = tildaRuleValidator('cycleway_oneway_wrong');
export const validationCyclewayOnewayRedundant = tildaRuleValidator('cycleway_oneway_redundant');
// From the tilda-geo rules: on a road in both directions, `cycleway_oneway_wrong` reports only the
// contraflow case; a side `oneway` against the traffic of its side is this rule.
export const validationUnexpectedOnewayDirection = tildaRuleValidator('unexpected_oneway_direction');
