import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import {
    analyzeCategoryGaps,
    isIncompleteCategoryId,
    processBikelanes,
    type BikelaneResult,
    type CategoryGap
} from '@tilda-geo/bicycle-infrastructure';
import {
    ATTRIBUTE_STATE_TEXTS,
    MAPPING_OPTION_LABELS,
    MAPPING_TARGET_GROUP_LABELS,
    TILDA_LABELS,
    applyCategoryPlan,
    attributeFeedsText,
    attributeLabel,
    attributeNote,
    gapTags,
    gapWriteKey,
    groupMappingKinds,
    lifecycleForSide,
    mappingChoiceForCategory,
    mappingChoiceLabel,
    mappingKindLabel,
    mappingOptionRows,
    normalizeMappingChoice,
    planForMappingChoice,
    reminderText,
    reminders,
    renderPlanConflict,
    renderPlanReason,
    requiredAttributes,
    resolveMappingChoice,
    roadAttributes,
    type CategoryChangePlan,
    type MappingChoice,
    type MappingOptionRow,
    type RequiredAttribute,
    type ResultSide
} from '@tilda-geo/bicycle-infrastructure-tagging';
import { radnetzBerlin } from '@tilda-geo/bicycle-infrastructure-tagging/profiles/radnetz-berlin';

import { kvErrorMessage } from '../../core/kv_error_message';
import { localizer, t } from '../../core/localizer';
import { svgIcon } from '../../svg/icon';
import { utilRebind } from '../../util/rebind';
import { categoryName, packageLanguage } from '../../tilda/package_texts';
import { definedTags } from '../../tilda/tags';
import { tildaChecks, VERIFIED, type TildaCheck } from '../../tilda/checks';
import { trafficSignTagKeysFromTags } from '../../presets/traffic_sign_fields';
import { presetFieldsOf } from '../fields/side_prerequisite';
import { uiPaneTooltip } from '../pane_tooltip';
import { uiSection } from '../section';
import { drawTagPlan, tagPlanChanges, type TagPlanRow } from '../tag_plan';
import { sideWidthKeys } from './side_width_fields';
import { isWidthValueKey, normalizeDecimalComma } from '../../tilda/value_input';
import { addableRelatedKeys } from '../../presets/related_tags';

type Side = ResultSide;

/** A button of an option row in "Change to" */
type OptionButton = { row: MappingOptionRow; value: string | undefined; label: string };

/** One card per TILDA result (self / left / right side of the way) */
type SideCard = {
    side: Side;
    result: BikelaneResult;
    gaps: CategoryGap[];
    /** what the mapper picked in "Change to": a kind of infrastructure plus options */
    choice: MappingChoice | undefined;
    /** the TILDA category of `choice` */
    target: string | undefined;
    plan: CategoryChangePlan | undefined;
    attributes: RequiredAttribute[];
    /** mixed traffic checklist, for a way that is not bike infrastructure itself */
    roadAttributes: RequiredAttribute[];
    /** things to look for that have no tag to check */
    reminders: string[];
    /** can be collapsed: the way itself when its bike infrastructure is mapped on the sides */
    collapsible: boolean;
    collapsed: boolean;
};

const SIDE_ORDER: Side[] = ['self', 'left', 'right'];

const MAX_BUTTONS = 6;
/** mixed traffic checklist: a missing tag that gets a one-click answer (no cycleway on either side) */
const MIXED_TRAFFIC_QUICK_VALUES: Record<string, string> = { 'cycleway:both': 'no' };

const STATE_ICON: Record<RequiredAttribute['state'], string> = {
    ok: '✓',
    inherited: '✓',
    guess: '?',
    assumed: 'i',
    ignored: '✗',
    missing: '!'
};


/** A text of the package about the state of an attribute (`missing`, `add_below`, …) */
function stateText(id: string) {
    return ATTRIBUTE_STATE_TEXTS[packageLanguage()][id] ?? id;
}


/** Category labels for the texts of a plan: German as TILDA shows them, English as ids */
function planTextOptions() {
    return packageLanguage() === 'de' ? { categoryLabels: TILDA_LABELS.de } : {};
}


/** Tagging `plan` changes nothing (also when its adds repeat tags that are there) */
function planReached(tags: Tags, plan: CategoryChangePlan) {
    if (plan.conflicts.length || !plan.aligned) return false;
    const after = applyCategoryPlan(tags, plan);
    const keys = new Set([...Object.keys(tags), ...Object.keys(after)]);
    return [...keys].every(key => tags[key] === after[key]);
}


/**
 * How the missing tag is shown, here and on the field title below:
 * `required` (orange) must be tagged, `optional` (yellow) only if it applies or TILDA only guesses
 */
function attributeSeverity(attribute: RequiredAttribute): 'required' | 'optional' | undefined {
    if (attribute.state === 'ignored') return 'required';
    if (attribute.state === 'guess') return 'optional';
    if (attribute.state === 'missing') return attribute.optional ? 'optional' : 'required';
    return undefined;
}


/** Order of the open rows of a checklist: what blocks TILDA first, defaults to confirm last */
function attributeRank(attribute: RequiredAttribute) {
    if (attribute.state === 'ignored') return 0;
    if (attribute.state === 'missing') return attribute.optional ? 3 : 1;
    if (attribute.state === 'guess') return 2;
    return 4;
}


/**
 * The oneway row of a footway or path writes `oneway:bicycle`, but only `oneway` is tagged: its value,
 * offered to tag as `oneway:bicycle` instead (TILDA reads both; `oneway:bicycle` is the better tag)
 */
function onewayToMove(attribute: RequiredAttribute) {
    const [tag, ...more] = attribute.tagged;
    return attribute.key === 'oneway:bicycle' && tag?.key === 'oneway' && !more.length ? tag.value : undefined;
}


/** A value as TILDA names it (`oneway=implicit_yes` → "Eine Richtung (abgeleitet)"); German only */
function tildaValueLabel(attribute: RequiredAttribute, value: string | undefined) {
    if (value === undefined || packageLanguage() !== 'de') return value;
    const labels: Record<string, string> = TILDA_LABELS.de;
    const label = labels[`${attribute.id}=${value}`];
    return label ? `„${label}“` : value;
}


/**
 * Inspector section "TILDA bike infrastructure": how TILDA classifies each side of
 * the selected way, what is missing for an exact category, how to reach a chosen
 * category, and which attributes the Radnetz dataset needs.
 * Uses `@tilda-geo/bicycle-infrastructure`, the TypeScript port of TILDA's processing.
 * Defaults that need no tag are confirmed with "Checked", the whole way with "Verified"; both are
 * stored in our key-value DB, not in OSM (`modules/tilda/checks.ts`, WORKDOC feature 33).
 *
 * Events:
 *   'change' - (entityIDs, changed tags), handled by the entity editor like other sections
 *   'reveal' - (keys), show the inspector field for one of these keys
 */
export function uiSectionTildaBikeInfra(context: iD.Context) {
    const dispatch = d3_dispatch('change', 'reveal');

    let _entityIDs: string[] = [];
    let _tags: Tags = {};
    /** "Change to" per side: kind and options, chosen by the user */
    let _choices = new Map<Side, MappingChoice>();
    /** the user opened or closed the card of the way itself; undefined = automatic */
    let _selfExpanded: boolean | undefined;
    let _showIntro = false;
    /** sides whose "Change to" select is open */
    let _editing = new Set<Side>();
    /** checklists (side and list) that show their rows that are in order */
    let _showDone = new Set<string>();
    /** keys TILDA reads whose tag is missing, for the field titles */
    let _fieldStatus = new Map<string, 'required' | 'optional'>();

    const checks = tildaChecks(context);

    const section = (uiSection('tilda-bike-infra', context) as any)
        .label(() => t.append('inspector.tilda.title'))
        .disclosureHeaderOptions(renderHeaderOptions)
        .shouldDisplay(() => _entityIDs.length === 1 && _entityIDs[0].startsWith('w') && !!_tags.highway)
        .disclosureContent(renderDisclosureContent);


    /** Info button like the one on fields: shows what the section is about */
    function renderHeaderOptions(selection: d3.Selection) {
        selection.selectAll('button.tilda-info')
            .data([0])
            .enter()
            .append('button')
            .attr('class', 'disclosure-header-option tilda-info')
            .attr('aria-label', t('inspector.tilda.info'))
            .call(uiPaneTooltip()
                .title(() => t.append('inspector.tilda.info'))
            )
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent) {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                this.blur();
                _showIntro = !_showIntro;
                d3_select(this).classed('active', _showIntro);
                section.reRender();
            })
            .call(svgIcon('#iD-icon-inspect', ''));
    }


    // checks were loaded or changed (also by other mappers)
    checks.on('change.tildaSection', () => {
        if (section.shouldDisplay()()) section.reRender();
    });


    /** The stored check of the selected way */
    function checkOf(check: string): TildaCheck | undefined {
        return _entityIDs.length === 1 ? checks.get(_entityIDs[0], check) : undefined;
    }

    /** The mapper confirmed this default (the same one: on another default the check does not count) */
    function confirmed(attribute: RequiredAttribute) {
        const check = attribute.state === 'assumed' ? checkOf(attribute.key) : undefined;
        return check?.answer === attribute.default ? check : undefined;
    }

    function byline(stringID: string, check: TildaCheck) {
        return t(`inspector.tilda.checks.${stringID}`, {
            user: checks.isMine(check) ? t('inspector.tilda.checks.you') : check.user,
            date: new Date(check.at).toLocaleDateString(localizer.localeCode())
        });
    }

    /** Stores the check, or removes it when it is stored already. Not an edit: saved at once, no undo step. */
    function toggleCheck(check: string, answer: string, stored: TildaCheck | undefined) {
        const wayID = _entityIDs[0];
        const version = context.hasEntity(wayID as Parameters<iD.Context['hasEntity']>[0])?.version;
        const request = stored ? checks.remove(wayID, check)
            : checks.set(wayID, check, answer, version === undefined ? undefined : String(version));
        request.catch((err: unknown) => {
            (context.ui().flash as any)
                .duration(6000)
                .iconName('#iD-icon-alert')
                .label(t.append('inspector.tilda.checks.save_failed', { reason: kvErrorMessage(err) }))();
        });
    }

    function disabledTitle() {
        const reason = _entityIDs.length === 1 ? checks.disabledReason(_entityIDs[0]) : undefined;
        return reason ? t(`inspector.tilda.checks.disabled.${reason}`) : undefined;
    }


    /**
     * Tags `value` for an attribute. The oneway row of a footway or path writes `oneway:bicycle`
     * (tagging package 0.2.0); an old `oneway` with the same value goes in the same step (Tobias),
     * one with another value stays and shows as "not read".
     */
    function attributeUpdate(attribute: RequiredAttribute, value: string): TagsUpdate {
        const update: TagsUpdate = { [attribute.key]: value };
        if (attribute.key === 'oneway:bicycle' && _tags.oneway === value) update.oneway = undefined;
        return update;
    }


    function changeTags(changed: TagsUpdate) {
        dispatch.call('change', section, _entityIDs, changed);
    }


    function showSide(side: Side | undefined) {
        const indicatorSide = side === 'left' || side === 'right' ? side : undefined;
        context.setDirectionalComboIndicator(indicatorSide ? { side: indicatorSide, entityIDs: _entityIDs } : null);
    }


    /** Keys whose value differs from the downloaded data: a width tagged now needs its source */
    function editedKeys() {
        if (_entityIDs.length !== 1) return new Set<string>();
        const base = context.history().base().hasEntity(_entityIDs[0] as Parameters<iD.Graph['hasEntity']>[0]);
        const baseTags: Tags = base?.tags ?? {};
        return new Set(Object.keys(_tags).filter(key => _tags[key] !== baseTags[key]));
    }


    function cards(): SideCard[] {
        const edited = editedKeys();
        const results = processBikelanes(_tags);
        // no result for the way itself (e.g. a sidewalk without bike access): still offer
        // a card with the target select, to see what would make it bike infrastructure
        if (!results.some(result => result._side === 'self')) {
            results.push({ _side: 'self', _prefix: null, _infrastructureExists: false, category: '' });
        }
        results.sort((a, b) => SIDE_ORDER.indexOf(a._side) - SIDE_ORDER.indexOf(b._side));
        const gaps = analyzeCategoryGaps(_tags, results);
        const selfIsInfrastructure = results.some(result => result._side === 'self' && result._infrastructureExists);
        const sidesHaveInfrastructure = results.some(result => result._side !== 'self' && result._infrastructureExists);

        return results.map(result => {
            const side = result._side;
            const sideGaps = gaps.find(gap => gap._side === side)?.missing ?? [];
            // the open question of the category asks for these keys; the checklist does not repeat them
            const gapKeys = new Set(sideGaps.map(gap => gapWriteKey(gap, result)));
            const notAGap = (attribute: RequiredAttribute) => attribute.state !== 'missing' || !gapKeys.has(attribute.key);
            const choice = _choices.get(side);
            const target = choice && resolveMappingChoice(choice, side)?.categoryId;
            const plan = choice ? planForMappingChoice(_tags, choice, side) : undefined;
            const targetCategory = target !== result.category ? target : undefined;
            // bike infrastructure on the sides: the way itself (mixed traffic) matters less
            const collapsible = side === 'self' && !selfIsInfrastructure && sidesHaveInfrastructure;
            return {
                side,
                result,
                gaps: sideGaps,
                choice,
                target,
                plan,
                attributes: requiredAttributes(result, _tags, { profile: radnetzBerlin, targetCategory, edited }).filter(notAGap),
                roadAttributes: side === 'self' && !selfIsInfrastructure
                    ? roadAttributes(_tags, { profile: radnetzBerlin, edited }).filter(notAGap) : [],
                reminders: reminders(result, _tags, radnetzBerlin, targetCategory),
                collapsible,
                collapsed: collapsible && !(_selfExpanded ?? !!choice)
            };
        });
    }


    /** The category, and its state when it is not built (`im Bau`, `temporär`) */
    function categoryWithLifecycle(card: SideCard) {
        const lifecycle = lifecycleForSide(_tags, card.side, card.result.category);
        const labels: Record<string, string> = MAPPING_OPTION_LABELS[packageLanguage()];
        const state = lifecycle && labels[lifecycle];
        return state ? `${categoryName(card.result.category)}, ${state}` : categoryName(card.result.category);
    }


    function renderDisclosureContent(selection: d3.Selection) {
        const data = cards();

        const intro = selection.selectAll('.tilda-intro')
            .data(_showIntro ? [0] : []);
        intro.exit().remove();
        intro.enter()
            .insert('div', ':first-child')
            .attr('class', 'tilda-callout tilda-intro')
            .call(t.append('inspector.tilda.intro'));

        let cardSelection = selection.selectAll<HTMLDivElement, SideCard>('.tilda-card')
            .data(data, d => d.side);
        cardSelection.exit().remove();

        const cardEnter = cardSelection.enter()
            .append('div')
            .attr('class', d => `tilda-card tilda-card-${d.side}`)
            .on('mouseenter', (_d3_event: MouseEvent, d: SideCard) => showSide(d.side))
            .on('mouseleave', () => showSide(undefined));

        // header bar like a field label, body like a field input
        const headerEnter = cardEnter.append('div')
            .attr('class', 'tilda-card-header')
            .on('click', function(this: HTMLDivElement) {
                // the card's datum: the header keeps the one from when the card was created
                const d = d3_select(this.closest('.tilda-card')!).datum() as SideCard;
                if (!d.collapsible) return;
                _selfExpanded = d.collapsed;
                section.reRender();
            });
        headerEnter.append('span').attr('class', 'tilda-side');
        headerEnter.append('span').attr('class', 'tilda-card-hint');
        // what TILDA makes of it, and the button to change it
        const headlineEnter = headerEnter.append('div').attr('class', 'tilda-headline');
        headlineEnter.append('span').attr('class', 'tilda-category');
        headlineEnter.append('span').attr('class', 'tilda-target-name');
        headlineEnter.append('button')
            .attr('class', 'tilda-edit')
            .call(uiPaneTooltip()
                .title(() => t.append('inspector.tilda.edit'))
            )
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent) {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                this.blur();
                const d = d3_select(this.closest('.tilda-card')!).datum() as SideCard;
                if (_editing.has(d.side) || d.choice) {
                    _editing.delete(d.side);
                    _choices.delete(d.side);
                } else {
                    _editing.add(d.side);
                    if (d.collapsible) _selfExpanded = true;
                }
                section.reRender();
            })
            .call(svgIcon('#iD-icon-edit', ''));
        const bodyEnter = cardEnter.append('div').attr('class', 'tilda-card-body');
        bodyEnter.append('div').attr('class', 'tilda-gaps');
        bodyEnter.append('div').attr('class', 'tilda-target');
        bodyEnter.append('div').attr('class', 'tilda-attributes');
        bodyEnter.append('div').attr('class', 'tilda-road-attributes');
        bodyEnter.append('div').attr('class', 'tilda-reminders');

        cardSelection = cardSelection.merge(cardEnter)
            .classed('collapsible', d => d.collapsible)
            .classed('collapsed', d => d.collapsed);

        const choiceLabel = (d: SideCard) => d.choice ? mappingChoiceLabel(d.choice, packageLanguage()) : '';
        cardSelection.select('.tilda-target-name')
            .text(d => d.choice ? `→ ${choiceLabel(d)}` : '')
            .attr('title', d => d.choice ? choiceLabel(d) : null);
        cardSelection.select('.tilda-edit')
            .classed('active', d => _editing.has(d.side) || !!d.choice)
            .attr('aria-label', t('inspector.tilda.edit'));

        cardSelection.select('.tilda-card-hint')
            .text(d => d.collapsed ? t('inspector.tilda.collapsed_hint') : '');

        cardSelection.select('.tilda-side')
            .text(d => t(`inspector.tilda.side.${d.side}`));
        cardSelection.select('.tilda-category')
            .attr('class', d => [
                'tilda-category',
                d.result.category === 'needsClarification' ? 'needs-clarification' : '',
                isIncompleteCategoryId(d.result.category) ? 'incomplete' : '',
                d.result._infrastructureExists ? 'exists' : 'absent'
            ].filter(Boolean).join(' '))
            .text(d => d.result.category ? categoryWithLifecycle(d) : t('inspector.tilda.mixed_traffic'))
            // the full name (the label may be cut), and the TILDA category id: the value in the TILDA dataset
            .attr('title', d => d.result.category
                ? `${categoryName(d.result.category)}\n${t('inspector.tilda.category_id', { id: d.result.category })}`
                : null);

        cardSelection.select<HTMLDivElement>('.tilda-gaps').each(function(d) { drawGaps(d3_select(this), d); });
        cardSelection.select<HTMLDivElement>('.tilda-target').each(function(d) { drawTarget(d3_select(this), d); });
        cardSelection.select<HTMLDivElement>('.tilda-attributes').each(function(d) {
            const header = d.target && d.target !== d.result.category
                ? t('inspector.tilda.required_for', { category: categoryName(d.target) })
                : t('inspector.tilda.required');
            drawAttributes(d3_select(this), d.attributes, `${d.side}-attributes`, header);
        });
        cardSelection.select<HTMLDivElement>('.tilda-road-attributes').each(function(d) {
            // no header: "mixed traffic" is the category above, why the data is needed is in the info text
            drawAttributes(d3_select(this), d.roadAttributes, `${d.side}-road`, undefined, MIXED_TRAFFIC_QUICK_VALUES);
        });

        cardSelection.select<HTMLDivElement>('.tilda-reminders').each(function(d) { drawReminders(d3_select(this), d.reminders); });

        drawVerified(selection);
    }


    /**
     * Hints without an indicator in the tags: look for it, so it is not forgotten. "Checked" says
     * someone looked (stored like the other checks, as `reminder:<id>`); a checked hint folds into
     * one line.
     */
    function drawReminders(selection: d3.Selection<HTMLDivElement>, ids: string[]) {
        const reminderCheck = (id: string) => `reminder:${id}`;
        const stored = (id: string) => checkOf(reminderCheck(id));

        let rows = selection.selectAll<HTMLDivElement, string>('.tilda-reminder')
            .data(ids, d => d);
        rows.exit().remove();
        const rowsEnter = rows.enter()
            .append('div')
            .attr('class', d => `tilda-reminder tilda-reminder-${d}`);
        const textEnter = rowsEnter.append('div').attr('class', 'tilda-reminder-body');
        textEnter.append('span').attr('class', 'tilda-reminder-title');
        textEnter.append('span').attr('class', 'tilda-reminder-text');
        rowsEnter.append('button')
            .attr('class', 'tilda-check')
            .call(svgIcon('#iD-icon-apply', ''))
            .append('span')
            .call(t.append('inspector.tilda.checks.check'));

        rows = rows.merge(rowsEnter)
            .classed('checked', d => !!stored(d));
        rows.select('.tilda-reminder-title').text(d => reminderText(d, packageLanguage())?.title ?? d);
        rows.select('.tilda-reminder-text').text(d => {
            const check = stored(d);
            return check ? byline('checked_by', check) : reminderText(d, packageLanguage())?.text ?? '';
        });

        const disabled = disabledTitle();
        rows.select<HTMLButtonElement>('.tilda-check')
            .classed('active', d => !!stored(d))
            .attr('disabled', disabled ? 'true' : null)
            .attr('aria-pressed', d => stored(d) ? 'true' : 'false')
            .attr('title', d => disabled ?? t(`inspector.tilda.checks.${stored(d) ? 'uncheck' : 'reminder'}_tooltip`))
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent, d: string) {
                d3_event.preventDefault();
                this.blur();
                toggleCheck(reminderCheck(d), '', stored(d));
            });
        selection.style('display', ids.length ? '' : 'none');
    }


    /** "Verified": a second mapper looked at the way; below the cards, after everything to look at */
    function drawVerified(selection: d3.Selection) {
        const verified = checkOf(VERIFIED);
        const disabled = disabledTitle();
        const version = context.hasEntity(_entityIDs[0] as Parameters<iD.Context['hasEntity']>[0])?.version;

        let row = selection.selectAll<HTMLDivElement, number>('.tilda-verified')
            .data([0]);
        const rowEnter = row.enter()
            .append('div')
            .attr('class', 'tilda-verified');
        rowEnter.append('button')
            .attr('class', 'tilda-check tilda-verify')
            .call(svgIcon('#iD-icon-apply', ''))
            .append('span')
            .call(t.append('inspector.tilda.checks.verify'));
        rowEnter.append('span').attr('class', 'tilda-verified-status');

        row = row.merge(rowEnter).order();
        row.select<HTMLButtonElement>('.tilda-verify')
            .classed('active', !!verified)
            .attr('disabled', disabled ? 'true' : null)
            .attr('aria-pressed', verified ? 'true' : 'false')
            .attr('title', disabled ?? t(`inspector.tilda.checks.${verified ? 'unverify' : 'verify'}_tooltip`))
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent) {
                d3_event.preventDefault();
                this.blur();
                toggleCheck(VERIFIED, '', verified);
            });

        const changedSince = verified?.wayVersion !== undefined && version !== undefined && verified.wayVersion !== String(version);
        row.select('.tilda-verified-status')
            .text(!verified ? t('inspector.tilda.checks.not_verified')
                : byline('verified_by', verified) + (changedSince ? ` (${t('inspector.tilda.checks.changed_since')})` : ''));
    }


    /** The category a side gets when the open question is answered with `value` */
    function gapAnswerLabel(gap: CategoryGap, card: SideCard, value: string) {
        const tags = definedTags({ ..._tags, ...gapTags(gap, card.result, value) });
        const category = processBikelanes(tags).find(result => result._side === card.side)?.category;
        return category && category !== card.result.category ? categoryName(category) : value;
    }

    /** The answers of a gap; a start all of them share (`Getrennter Rad- und Gehweg, `) is left out */
    function gapAnswerLabels(gap: CategoryGap, card: SideCard) {
        const labels = gap.values.map(value => gapAnswerLabel(gap, card, value));
        const first = labels[0] ?? '';
        const cut = first.lastIndexOf(', ') + 2;
        const shared = cut > 1 && labels.length > 1 && labels.every(label => label.startsWith(first.slice(0, cut)));
        return new Map(gap.values.map((value, i) => [value, shared ? labels[i].slice(cut) : labels[i]]));
    }


    /**
     * The open question that makes an incomplete category exact: first in the card, one button per
     * answer, named by the category it leads to (the tag in the tooltip)
     */
    function drawGaps(selection: d3.Selection<HTMLDivElement>, card: SideCard) {
        let rows = selection.selectAll<HTMLDivElement, CategoryGap>('.tilda-gap')
            .data(card.gaps, d => d.key);
        rows.exit().remove();

        const rowsEnter = rows.enter()
            .append('div')
            .attr('class', 'tilda-gap');
        rowsEnter.append('div').attr('class', 'tilda-gap-title');
        rowsEnter.append('div').attr('class', 'tilda-buttons');
        rowsEnter.append('div').attr('class', 'tilda-gap-key');

        rows = rows.merge(rowsEnter)
            // the library adds a note about its internal key names; not useful here
            .attr('title', d => d.reason.replace(/\s*\(transformed from [^)]*\)/, ''));
        rows.select('.tilda-gap-title').text(t('inspector.tilda.gap_title'));
        rows.select('.tilda-gap-key')
            .text(d => t('inspector.tilda.gap_key', { key: gapWriteKey(d, card.result) }));

        const buttons = rows.select('.tilda-buttons')
            .selectAll<HTMLButtonElement, string>('button')
            .data(d => d.values, d => d);
        buttons.exit().remove();
        buttons.enter()
            .append('button')
            .attr('class', 'button tilda-value tilda-gap-answer')
            .merge(buttons)
            .each(function(value) {
                const gap = d3_select(this.parentElement!.parentElement!).datum() as CategoryGap;
                d3_select(this)
                    .text(gapAnswerLabels(gap, card).get(value) ?? value)
                    .attr('title', `${gapWriteKey(gap, card.result)}=${value}`);
            })
            .on('click', function(_d3_event: MouseEvent, value: string) {
                const gap = d3_select(this.parentElement!.parentElement!).datum() as CategoryGap;
                changeTags(definedTags(gapTags(gap, card.result, value)));
            });
    }


    /**
     * "Change to": a select for the kind of infrastructure, below it the options of that kind
     * (position, signs, lines, state) as buttons, and the tags to add or change to reach it.
     * Kinds, options and texts come from the tagging package (`mappingOptionRows`).
     */
    function drawTarget(selection: d3.Selection<HTMLDivElement>, card: SideCard) {
        const lang = packageLanguage();
        const choice = card.choice && normalizeMappingChoice(card.choice, card.side);
        const currentKind = mappingChoiceForCategory(card.result.category)?.kind;
        const open = _editing.has(card.side) || !!card.choice;

        const setChoice = (next: MappingChoice | undefined) => {
            if (next) {
                _choices.set(card.side, normalizeMappingChoice(next, card.side));
            } else {
                _choices.delete(card.side);
            }
            section.reRender();
        };

        let label = selection.selectAll<HTMLLabelElement, number>('label')
            .data(open ? [0] : []);
        label.exit().remove();
        const labelEnter = label.enter().append('label').attr('class', 'tilda-target-label');
        labelEnter.append('div').attr('class', 'tilda-subheading').call(t.append('inspector.tilda.target'));
        labelEnter.append('select');
        label = label.merge(labelEnter);

        const select = label.select<HTMLSelectElement>('select')
            // set on every render: the card is reused when another way is selected
            .on('change', function(this: HTMLSelectElement) {
                const kind = this.value;
                // the options that are still possible stay
                setChoice(kind ? { kind, sign: choice?.sign, lifecycle: choice?.lifecycle } : undefined);
            });
        type KindGroup = { id: string; label: string; kinds: string[] };
        const groups: KindGroup[] = [
            { id: 'none', label: '', kinds: [''] },
            ...groupMappingKinds().map(group => ({
                id: group.id,
                label: MAPPING_TARGET_GROUP_LABELS[lang][group.id],
                kinds: group.kinds.map(kind => kind.id)
            }))
        ];
        select.selectAll<HTMLOptGroupElement, KindGroup>('optgroup')
            .data(groups, d => d.id)
            .join('optgroup')
            .order()   // the card is reused when another way is selected
            .attr('label', d => d.label)
            .selectAll<HTMLOptionElement, string>('option')
            .data(d => d.kinds, d => d)
            .join('option')
            .order()
            .attr('value', d => d)
            .text(d => !d ? t('inspector.tilda.choose_kind')
                : d === currentKind ? `${mappingKindLabel(d, lang)} (${t('inspector.tilda.current')})` : mappingKindLabel(d, lang));
        select.property('value', choice?.kind ?? '');

        // one row of buttons per option of the kind
        const optionRows: MappingOptionRow[] = choice && open ? mappingOptionRows(choice, card.side, lang) : [];
        const rows = label.selectAll<HTMLDivElement, MappingOptionRow>('.tilda-option-row')
            .data(optionRows, d => d.axis)
            .join(enter => {
                const row = enter.append('div').attr('class', 'tilda-option-row').attr('role', 'group');
                row.append('span').attr('class', 'tilda-option-label');
                row.append('span').attr('class', 'tilda-buttons');
                return row;
            })
            .attr('aria-label', d => d.label);
        rows.select('.tilda-option-label').text(d => d.label);
        rows.select('.tilda-buttons')
            .selectAll<HTMLButtonElement, OptionButton>('button')
            .data(row => row.values.map(value => ({ row, ...value })), d => d.value ?? '')
            .join('button')
            .attr('class', d => `button tilda-value${d.value === d.row.current ? ' active' : ''}`)
            .attr('aria-pressed', d => d.value === d.row.current ? 'true' : 'false')
            .text(d => d.label)
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent, d) {
                d3_event.preventDefault();
                this.blur();
                if (choice) setChoice({ ...choice, [d.row.axis]: d.value });
            });

        const plan = card.plan;
        const textOptions = planTextOptions();
        const tagRows: TagPlanRow[] = plan ? [
            ...plan.remove.map(key => ({ kind: 'remove' as const, key, value: _tags[key] ?? '', reason: t('inspector.tilda.remove_reason') })),
            // add only what is still missing (the plan may repeat existing tags)
            ...plan.add.filter(entry => _tags[entry.key] !== entry.value)
                .map(entry => ({ kind: 'add' as const, key: entry.key, value: entry.value, reason: renderPlanReason(entry, lang, textOptions) })),
            ...plan.change.map(entry => ({
                kind: 'change' as const, key: entry.key, value: entry.to, from: entry.from, reason: renderPlanReason(entry, lang, textOptions)
            })),
            ...plan.conflicts.map(entry => ({
                kind: 'conflict' as const, key: entry.key, value: entry.value, reason: renderPlanConflict(entry, lang, textOptions)
            }))
        ] : [];

        drawTagPlan(selection, plan && {
            rows: tagRows,
            canApply: plan.aligned && tagRows.some(row => row.kind !== 'conflict'),
            applyLabel: t('inspector.tilda.apply_all'),
            onApply: () => changeTags(tagPlanChanges(tagRows)),
            diff: true
        });
    }


    /** Keys that have an inspector field on this way: the preset's fields, the side width fields and their related tags */
    function fieldKeys() {
        if (_entityIDs.length !== 1) return new Set<string>();
        const keys = presetFieldsOf(context, _entityIDs[0])
            .flatMap(field => [field.key, ...(field.keys ?? [])])
            .filter((key): key is string => !!key);
        const all = [...keys, ...sideWidthKeys(_tags), ...trafficSignTagKeysFromTags(_tags)];
        // `source:width` and `note:*` open below their field (feature 25)
        return new Set([...all, ...addableRelatedKeys(all)]);
    }


    /**
     * Checklist of tags the Radnetz dataset needs: the attribute name, its state and the tags. Open
     * rows first (what TILDA cannot use or misses, then guesses, then defaults to confirm); rows in
     * order fold into one line (`listID` remembers it was opened). A missing tag links to its field
     * below; only tags without a field get the values TILDA accepts as buttons, a free input only
     * when there are no or too many values.
     */
    function drawAttributes(selection: d3.Selection<HTMLDivElement>, attributes: RequiredAttribute[], listID: string,
        headerText?: string, quickValues: Record<string, string> = {}) {
        const done = (d: RequiredAttribute) => (d.state === 'ok' || d.state === 'inherited' || !!confirmed(d)) && !onewayToMove(d);
        const open = attributes.filter(d => !done(d))
            .sort((a, b) => attributeRank(a) - attributeRank(b));
        const doneRows = attributes.filter(done);
        const showDone = _showDone.has(listID);

        const header = selection.selectAll<HTMLDivElement, string>('.tilda-attributes-header')
            .data(attributes.length && headerText ? [headerText] : []);
        header.exit().remove();
        header.enter()
            .insert('div', ':first-child')
            .attr('class', 'tilda-attributes-header')
            .merge(header)
            .text(d => d);

        const withField = fieldKeys();
        const hasField = (d: RequiredAttribute) => d.lookup.some(key => withField.has(key));

        let rows = selection.selectAll<HTMLDivElement, RequiredAttribute>('.tilda-attribute')
            .data(showDone ? [...open, ...doneRows] : open, d => d.key);
        rows.exit().remove();

        const rowsEnter = rows.enter()
            .insert('div', '.tilda-done-toggle')
            .attr('class', 'tilda-attribute');
        rowsEnter.append('span').attr('class', 'tilda-attribute-state');
        const mainEnter = rowsEnter.append('span').attr('class', 'tilda-attribute-main');
        mainEnter.append('span').attr('class', 'tilda-attribute-title');
        mainEnter.append('span').attr('class', 'tilda-attribute-tags');
        mainEnter.append('span').attr('class', 'tilda-attribute-note');
        const inputs = rowsEnter.append('span').attr('class', 'tilda-attribute-inputs');
        // a default: "Checked" confirms it, the values next to it say something else
        inputs.append('button')
            .attr('class', 'tilda-check')
            .call(svgIcon('#iD-icon-apply', ''))
            .append('span')
            .call(t.append('inspector.tilda.checks.check'));
        inputs.append('span').attr('class', 'tilda-buttons');
        inputs.append('input')
            .attr('type', 'text')
            .attr('class', 'tilda-attribute-input')
            .attr('placeholder', t('inspector.tilda.enter_value'))
            .on('keydown', function(this: HTMLInputElement, d3_event: KeyboardEvent) {
                if (d3_event.key !== 'Enter' || !this.value.trim()) return;
                d3_event.preventDefault();
                const attribute = d3_select(this.closest('.tilda-attribute')!).datum() as RequiredAttribute;
                const value = this.value.trim();
                // keys without a field (`cycleway:width`, `width:effective`) are typed here: a decimal comma becomes a point
                changeTags(attributeUpdate(attribute, isWidthValueKey(attribute.key) ? normalizeDecimalComma(value) : value));
            });
        inputs.append('datalist');

        rows = rows.merge(rowsEnter)
            .order()
            .attr('class', d => {
                const severity = attributeSeverity(d);
                return `tilda-attribute state-${d.state}${d.optional ? ' optional' : ''}${severity ? ` severity-${severity}` : ''}${confirmed(d) ? ' checked' : ''}`;
            })
            .attr('title', d => attributeFeedsText(d, packageLanguage()) ?? null);

        rows.select('.tilda-attribute-state').text(d => confirmed(d) ? STATE_ICON.ok : STATE_ICON[d.state]);

        // the attribute name, and for an untagged one "is missing; add below"
        rows.select<HTMLSpanElement>('.tilda-attribute-title')
            .each(function(d) {
                const cell = d3_select(this).text('');
                cell.append('span').attr('class', 'tilda-attribute-label').text(attributeLabel(d.id, packageLanguage()));
                if (d.tagged.length || d.state === 'inherited') return;
                const line = cell.append('span').attr('class', 'tilda-attribute-missing');
                // assumed: a default to confirm, not a request to tag it
                line.append('span').text(` ${stateText(d.state === 'assumed' ? 'not_tagged' : 'missing')}`);
                if (!hasField(d) || confirmed(d)) return;
                line.append('span').text(' · ');
                line.append('a')
                    .attr('href', '#')
                    .attr('class', 'tilda-reveal')
                    .text(stateText(d.state === 'assumed' ? 'check_below'
                        : d.optional ? 'add_below_optional' : 'add_below'))
                    .on('click', (d3_event: MouseEvent) => {
                        d3_event.preventDefault();
                        dispatch.call('reveal', section, d.lookup);
                    });
            });
        // the tags as they are tagged, or the key to tag
        rows.select<HTMLSpanElement>('.tilda-attribute-tags')
            .each(function(d) {
                const cell = d3_select(this).text('');
                if (d.tagged.length) {
                    for (const tag of d.tagged) cell.append('code').text(`${tag.key}=${tag.value}`);
                } else {
                    cell.append('code').text(d.key);
                }
            });
        rows.select('.tilda-attribute-note').text(d => {
            const check = confirmed(d);
            const note = attributeNote({ ...d, tilda: tildaValueLabel(d, d.tilda) }, packageLanguage()) ?? '';
            return check ? `${byline('checked_by', check)}. ${note}` : note;
        });

        const disabled = disabledTitle();
        rows.select<HTMLButtonElement>('.tilda-check')
            .style('display', d => d.state === 'assumed' ? null : 'none')
            .classed('active', d => !!confirmed(d))
            .attr('disabled', disabled ? 'true' : null)
            .attr('aria-pressed', d => confirmed(d) ? 'true' : 'false')
            .attr('title', d => disabled ?? t(`inspector.tilda.checks.${confirmed(d) ? 'uncheck' : 'check'}_tooltip`))
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent, d: RequiredAttribute) {
                d3_event.preventDefault();
                this.blur();
                if (d.default) toggleCheck(d.key, d.default, confirmed(d));
            });

        // values as buttons only where no field below can edit the tag
        const needsInputs = (d: RequiredAttribute) => d.state !== 'ok' && d.state !== 'inherited' && !hasField(d);
        // one click for the usual answer of a missing tag, even where a field below can edit it
        const quickValue = (d: RequiredAttribute) => !needsInputs(d) && d.state === 'missing' ? quickValues[d.key]
            : onewayToMove(d);
        rows.select<HTMLSpanElement>('.tilda-attribute-inputs')
            .style('display', d => needsInputs(d) || d.state === 'assumed' || quickValue(d) ? null : 'none');
        // a free value only when there are no values to click, or too many (a default: only the listed values)
        const freeInput = (d: RequiredAttribute) => needsInputs(d) && d.state !== 'assumed' && !quickValue(d)
            && (!d.options.length || d.options.length > MAX_BUTTONS);
        rows.select<HTMLInputElement>('input.tilda-attribute-input')
            .style('display', d => freeInput(d) ? null : 'none');

        // many options: the first few as buttons, all of them as suggestions in the input
        const datalistID = (d: RequiredAttribute) => `tilda-options-${d.key.replace(/[^\w-]/g, '_')}`;
        rows.select('input').attr('list', d => d.options.length ? datalistID(d) : null);
        const datalist = rows.select('datalist').attr('id', datalistID);
        const listOptions = datalist.selectAll<HTMLOptionElement, string>('option')
            .data(d => needsInputs(d) ? d.options : [], d => d);
        listOptions.exit().remove();
        listOptions.enter().append('option').merge(listOptions).attr('value', d => d);

        const buttons = rows.select('.tilda-buttons')
            .selectAll<HTMLButtonElement, string>('button')
            .data(d => needsInputs(d) ? d.options.slice(0, MAX_BUTTONS) : quickValue(d) ? [quickValue(d)!] : [], d => d);
        buttons.exit().remove();
        buttons.enter()
            .append('button')
            .attr('class', 'button tilda-value')
            .merge(buttons)
            .each(function(value) {
                const attribute = d3_select(this.closest('.tilda-attribute')!).datum() as RequiredAttribute;
                const moved = onewayToMove(attribute) === value;
                d3_select(this)
                    .text(moved ? t('inspector.tilda.move_oneway', { tag: `${attribute.key}=${value}` }) : value)
                    .attr('title', moved ? t('inspector.tilda.move_oneway_tooltip', { tag: `${attribute.key}=${value}`, old: `oneway=${value}` }) : null);
            })
            .on('click', function(_d3_event: MouseEvent, value: string) {
                const attribute = d3_select(this.closest('.tilda-attribute')!).datum() as RequiredAttribute;
                changeTags(attributeUpdate(attribute, value));
            });

        // the rows in order: one line that opens them
        const toggle = selection.selectAll<HTMLButtonElement, number>('.tilda-done-toggle')
            .data(doneRows.length ? [doneRows.length] : []);
        toggle.exit().remove();
        toggle.enter()
            .append('button')
            .attr('class', 'tilda-done-toggle')
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent) {
                d3_event.preventDefault();
                this.blur();
                if (_showDone.has(listID)) _showDone.delete(listID);
                else _showDone.add(listID);
                section.reRender();
            })
            .merge(toggle)
            .classed('expanded', showDone)
            .text(n => showDone ? t('inspector.tilda.done_hide') : `✓ ${t('inspector.tilda.done_rows', { n })}`);
    }


    /** Field title colors: for each key TILDA reads, how badly its tag is missing */
    function updateFieldStatus() {
        _fieldStatus = new Map();
        if (!(section as any).shouldDisplay()()) return;
        for (const card of cards()) {
            for (const attribute of [...card.attributes, ...card.roadAttributes]) {
                const severity = attributeSeverity(attribute);
                if (!severity) continue;
                for (const key of attribute.lookup) {
                    if (_fieldStatus.get(key) !== 'required') _fieldStatus.set(key, severity);
                }
            }
        }
    }

    section.fieldStatus = function(keys: string[]) {
        if (keys.some(key => _fieldStatus.get(key) === 'required')) return 'required';
        if (keys.some(key => _fieldStatus.get(key) === 'optional')) return 'optional';
        return undefined;
    };


    section.entityIDs = function(val?: string[]) {
        if (val === undefined) return _entityIDs;
        if (val.join() !== _entityIDs.join()) {
            // others may have changed the checks of this way
            if (val.length === 1) checks.loadWay(val[0]);
            _choices = new Map();
            _selfExpanded = undefined;
            _editing = new Set();
            _showDone = new Set();
        }
        _entityIDs = val;
        return section;
    };

    section.tags = function(val?: Tags) {
        if (val === undefined) return _tags;
        _tags = val;
        // drop choices that are reached now
        for (const [side, choice] of _choices) {
            if (planReached(_tags, planForMappingChoice(_tags, choice, side))) {
                _choices.delete(side);
                _editing.delete(side);
            }
        }
        updateFieldStatus();
        return section;
    };

    return utilRebind(section, dispatch, 'on');
}
