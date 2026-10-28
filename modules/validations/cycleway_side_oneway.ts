import { actionChangeTags } from '../actions/change_tags';
import { kvErrorMessage } from '../core/kv_error_message';
import { t } from '../core/localizer';
import { validationIssue, validationIssueFix } from '../core/validation';
import type { CreateValidator, Validator } from '../core/validation/models';
import { tildaChecks } from '../tilda/checks';
import { sideOnewayDefault } from '../tilda/required_attributes';
import { utilDisplayLabel } from '../util/utilDisplayLabel';

/**
 * `cycleway:<side>:oneway` on a road (WORKDOC feature 32). `oneway` refers to the direction of the
 * way, so the usual direction on the left side is `-1`, not `yes`; and the defaults are enough:
 * bicycles ride with the traffic on their side. Two rules, so each can be switched off on its own:
 * - `cycleway_oneway_wrong`: the tag most likely says the wrong direction
 * - `cycleway_oneway_redundant`: the tag repeats the default
 */

const WRONG = 'cycleway_oneway_wrong';
const REDUNDANT = 'cycleway_oneway_redundant';

const ONEWAY_KEYS: Record<string, ('left' | 'right')[]> = {
    'cycleway:left:oneway': ['left'],
    'cycleway:right:oneway': ['right'],
    'cycleway:both:oneway': ['left', 'right'],
    'cycleway:oneway': ['left', 'right']
};

export type CyclewayOnewayFinding = {
    key: string;
    value: string;
    kind: 'wrong' | 'redundant';
    /** id of the texts: `issues.<type>.<reason>.message|reference` */
    reason: 'two_way_road' | 'contraflow' | 'default';
};

/** The `cycleway:*:oneway` tags of a road that are likely wrong or not needed */
export function cyclewayOnewayFindings(tags: Tags): CyclewayOnewayFinding[] {
    // a road drawn against its one-way direction: too rare to guess
    if (!tags.highway || tags.oneway === '-1') return [];

    const oneWayRoad = tags.oneway === 'yes';
    const findings: CyclewayOnewayFinding[] = [];

    for (const [key, sides] of Object.entries(ONEWAY_KEYS)) {
        const value = tags[key];
        if (value !== 'yes' && value !== '-1') continue;

        // sides where the tag says another direction than the default
        const differs = sides.filter(side => sideOnewayDefault(tags, side) !== value);

        if (value === 'yes') {
            if (differs.length) {
                findings.push({ key, value, kind: 'wrong', reason: oneWayRoad ? 'contraflow' : 'two_way_road' });
            } else {
                findings.push({ key, value, kind: 'redundant', reason: 'default' });
            }
        } else if (!differs.length) {
            // `-1` that only repeats the default; a `-1` that differs is rare and real information
            findings.push({ key, value, kind: 'redundant', reason: 'default' });
        }
    }
    return findings;
}


function createValidator(context: iD.Context, type: string, kind: CyclewayOnewayFinding['kind']): Validator {
    const checks = tildaChecks(context);

    const validation: Validator = function checkCyclewaySideOneway(entity) {
        if (entity.type !== 'way' || !entity.tags.highway) return [];

        return cyclewayOnewayFindings(entity.tags)
            .filter(finding => finding.kind === kind)
            // a mapper said: this is correct here
            .filter(finding => kind !== 'wrong' ||
                checks.get(entity.id, finding.key)?.answer !== `${finding.key}=${finding.value}`)
            .map(finding => {
                const tag = `${finding.key}=${finding.value}`;

                return new validationIssue({
                    type,
                    subtype: finding.reason,
                    severity: kind === 'wrong' ? 'warning' : 'suggestion',
                    hash: tag,
                    message: function(context) {
                        const entity = context.hasEntity(this.entityIds[0]);
                        return entity ? t.append(`issues.${type}.message`, {
                            feature: utilDisplayLabel(entity, context.graph()),
                            tag
                        }) : '';
                    },
                    reference: selection => {
                        selection.selectAll('.issue-reference')
                            .data([0])
                            .enter()
                            .append('div')
                            .attr('class', 'issue-reference')
                            .call(t.append(`issues.${type}.${finding.reason}.reference`, { tag, key: finding.key }));
                    },
                    entityIds: [entity.id],
                    dynamicFixes: () => fixes(finding, entity.id)
                });
            });
    };

    function changeTag(context: iD.Context, entityID: string, key: string, value: string | undefined, annotation: string) {
        const tags = { ...context.entity(entityID as Parameters<iD.Context['entity']>[0]).tags };
        if (value === undefined) {
            delete tags[key];
        } else {
            tags[key] = value;
        }
        context.perform(actionChangeTags(entityID as Parameters<typeof actionChangeTags>[0], tags), annotation);
    }

    function fixes(finding: CyclewayOnewayFinding, entityID: string) {
        const result = [
            new validationIssueFix({
                icon: 'iD-operation-delete',
                title: t.append('issues.fix.remove_named_tag.title', { tag: finding.key }),
                onClick: function(context) {
                    changeTag(context, this.issue!.entityIds[0], finding.key, undefined,
                        t('issues.fix.remove_named_tag.annotation', { tag: finding.key }));
                }
            })
        ];
        if (kind !== 'wrong') return result;

        result.push(new validationIssueFix({
            title: t.append('issues.fix.cycleway_oneway_both_ways.title'),
            onClick: function(context) {
                changeTag(context, this.issue!.entityIds[0], finding.key, 'no',
                    t('issues.fix.cycleway_oneway_both_ways.annotation'));
            }
        }));

        // stored in the key-value DB, not in OSM: the issue is gone for everyone
        const disabled = checks.disabledReason(entityID);
        result.push(new validationIssueFix({
            icon: 'iD-icon-apply',
            title: t.append('issues.fix.cycleway_oneway_correct.title'),
            disabledReason: disabled && t(`inspector.tilda.checks.disabled.${disabled}`),
            onClick: disabled ? undefined : function(context) {
                const version = context.hasEntity(entityID as Parameters<iD.Context['hasEntity']>[0])?.version;
                checks.set(entityID, finding.key, `${finding.key}=${finding.value}`, version === undefined ? undefined : String(version))
                    .catch((err: unknown) => {
                        (context.ui().flash as any)
                            .duration(6000)
                            .iconName('#iD-icon-alert')
                            .label(t.append('inspector.tilda.checks.save_failed', { reason: kvErrorMessage(err) }))();
                    });
            }
        }));

        return result;
    }

    validation.type = type;

    return validation;
}


export const validationCyclewayOnewayWrong: CreateValidator = context => {
    const validation = createValidator(context, WRONG, 'wrong');

    // "this is correct here" was stored or removed (also by others): check the ways again
    tildaChecks(context).on('change.validation', () => {
        context.validator().revalidateRule(WRONG, (entity: iD.OsmEntity) =>
            entity.type === 'way' && !!entity.tags.highway && Object.keys(ONEWAY_KEYS).some(key => entity.tags[key] !== undefined));
    });

    return validation;
};

export const validationCyclewayOnewayRedundant: CreateValidator = context => createValidator(context, REDUNDANT, 'redundant');
