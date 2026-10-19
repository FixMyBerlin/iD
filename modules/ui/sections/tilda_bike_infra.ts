import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import {
    analyzeCategoryGaps,
    isIncompleteCategoryId,
    listTargetCategories,
    processBikelanes,
    writeKeyForSide,
    type BikelaneResult,
    type CategoryGap
} from '@tilda-geo/bicycle-infrastructure';

import { kvErrorMessage } from '../../core/kv_error_message';
import { localizer, t } from '../../core/localizer';
import { svgIcon } from '../../svg/icon';
import { utilRebind } from '../../util/rebind';
import { categoryForSide, planCategory, type Side, type TildaTagPlan } from '../../tilda/category_plan';
import { categoryGroupLabel, categoryLabel, groupCategories } from '../../tilda/category_labels';
import { reminders, type ReminderId } from '../../tilda/reminders';
import { tildaChecks, VERIFIED, type TildaCheck } from '../../tilda/checks';
import { requiredAttributes, roadAttributes, type RequiredAttribute } from '../../tilda/required_attributes';
import { trafficSignTagKeysFromTags } from '../../presets/traffic_sign_fields';
import { presetFieldsOf } from '../fields/side_prerequisite';
import { uiPaneTooltip } from '../pane_tooltip';
import { uiSection } from '../section';
import { drawTagPlan, tagPlanChanges, type TagPlanRow } from '../tag_plan';
import { sideWidthKeys } from './side_width_fields';
import { addableRelatedKeys } from '../../presets/related_tags';

/** One card per TILDA result (self / left / right side of the way) */
type SideCard = {
    side: Side;
    result: BikelaneResult;
    gaps: CategoryGap[];
    target: string | undefined;
    plan: TildaTagPlan | undefined;
    attributes: RequiredAttribute[];
    /** mixed traffic checklist, for a way that is not bike infrastructure itself */
    roadAttributes: RequiredAttribute[];
    /** things to look for that have no tag to check */
    reminders: ReminderId[];
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


/** What TILDA makes of the tagged value, if that is worth saying */
function stateNote(attribute: RequiredAttribute) {
    const { state, value, tilda } = attribute;
    if (state === 'inherited' && attribute.source) return t('inspector.tilda.state.derived', { value: tilda, tag: attribute.source });
    if (state === 'inherited') return t('inspector.tilda.state.inherited', { value: tilda });
    if (state === 'guess') return t('inspector.tilda.state.guess', { value: tilda });
    if (state === 'assumed') {
        return attribute.note ? t(`inspector.tilda.default.${attribute.note}`)
            : t('inspector.tilda.default.generic', { tag: attribute.default });
    }
    if (state === 'ignored') return t('inspector.tilda.state.ignored', { value });
    if (state === 'ok' && tilda !== undefined && tilda !== value) {
        // another tag decides (`oneway:bicycle` over `oneway`): name it, "reads it as yes" alone misleads
        return attribute.source ? t('inspector.tilda.state.derived', { value: tilda, tag: attribute.source })
            : t('inspector.tilda.state.normalized', { value: tilda });
    }
    return '';
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
    /** target category per side, chosen by the user */
    let _targets = new Map<Side, string>();
    /** the user opened or closed the card of the way itself; undefined = automatic */
    let _selfExpanded: boolean | undefined;
    let _showIntro = false;
    /** sides whose "Change to" select is open */
    let _editing = new Set<Side>();
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
            const target = _targets.get(side);
            const plan = target && target !== result.category ? planCategory(_tags, target, side) : undefined;
            // bike infrastructure on the sides: the way itself (mixed traffic) matters less
            const collapsible = side === 'self' && !selfIsInfrastructure && sidesHaveInfrastructure;
            return {
                side,
                result,
                gaps: gaps.find(gap => gap._side === side)?.missing ?? [],
                target,
                plan,
                attributes: requiredAttributes(result, _tags, target !== result.category ? target : undefined, edited),
                roadAttributes: side === 'self' && !selfIsInfrastructure ? roadAttributes(_tags, edited) : [],
                reminders: reminders(result, _tags, target !== result.category ? target : undefined),
                collapsible,
                collapsed: collapsible && !(_selfExpanded ?? !!target)
            };
        });
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
                if (_editing.has(d.side) || d.target) {
                    _editing.delete(d.side);
                    _targets.delete(d.side);
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

        cardSelection.select('.tilda-target-name')
            .text(d => d.target && d.target !== d.result.category ? `→ ${categoryLabel(d.target)}` : '')
            .attr('title', d => d.target && d.target !== d.result.category ? categoryLabel(d.target) : null);
        cardSelection.select('.tilda-edit')
            .classed('active', d => _editing.has(d.side) || !!d.target)
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
            .text(d => d.result.category ? categoryLabel(d.result.category) : t('inspector.tilda.mixed_traffic'))
            // the full name (the label may be cut), and the TILDA category id: the value in the TILDA dataset
            .attr('title', d => d.result.category
                ? `${categoryLabel(d.result.category)}\n${t('inspector.tilda.category_id', { id: d.result.category })}`
                : null);

        cardSelection.select<HTMLDivElement>('.tilda-gaps').each(function(d) { drawGaps(d3_select(this), d); });
        cardSelection.select<HTMLDivElement>('.tilda-target').each(function(d) { drawTarget(d3_select(this), d); });
        cardSelection.select<HTMLDivElement>('.tilda-attributes').each(function(d) {
            const header = d.target && d.target !== d.result.category
                ? t('inspector.tilda.required_for', { category: categoryLabel(d.target) })
                : t('inspector.tilda.required');
            drawAttributes(d3_select(this), d.attributes, header);
        });
        cardSelection.select<HTMLDivElement>('.tilda-road-attributes').each(function(d) {
            // no header: "mixed traffic" is the category above, why the data is needed is in the info text
            drawAttributes(d3_select(this), d.roadAttributes, undefined, MIXED_TRAFFIC_QUICK_VALUES);
        });

        cardSelection.select<HTMLDivElement>('.tilda-reminders').each(function(d) { drawReminders(d3_select(this), d.reminders); });

        drawVerified(selection);
    }


    /** Hints without an indicator in the tags: look for it, so it is not forgotten */
    function drawReminders(selection: d3.Selection<HTMLDivElement>, ids: ReminderId[]) {
        const rows = selection.selectAll<HTMLDivElement, ReminderId>('.tilda-reminder')
            .data(ids, d => d);
        rows.exit().remove();
        rows.enter()
            .append('div')
            .attr('class', d => `tilda-reminder tilda-reminder-${d}`)
            .each(function(d) {
                const row = d3_select(this);
                row.append('span').attr('class', 'tilda-reminder-title').call(t.append(`inspector.tilda.reminder.${d}.title`));
                row.append('span').call(t.append(`inspector.tilda.reminder.${d}.text`));
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


    /** Questions that make an incomplete category exact, one button per answer */
    function drawGaps(selection: d3.Selection<HTMLDivElement>, card: SideCard) {
        let rows = selection.selectAll<HTMLDivElement, CategoryGap>('.tilda-gap')
            .data(card.gaps, d => d.key);
        rows.exit().remove();

        const rowsEnter = rows.enter()
            .append('div')
            .attr('class', 'tilda-gap');
        rowsEnter.append('div').attr('class', 'tilda-gap-reason');
        rowsEnter.append('div').attr('class', 'tilda-buttons');

        rows = rows.merge(rowsEnter);
        rows.select('.tilda-gap-reason')
            .each(function(d) {
                const reason = d3_select(this).text('');
                reason.append('code').text(writeKeyForSide(d.key, card.side, card.result._prefix));
                // the library adds a note about its internal key names; not useful here
                reason.append('span').text(` ${d.reason.replace(/\s*\(transformed from [^)]*\)/, '')}`);
            });

        const buttons = rows.select('.tilda-buttons')
            .selectAll<HTMLButtonElement, string>('button')
            .data(d => d.values, d => d);
        buttons.exit().remove();
        buttons.enter()
            .append('button')
            .attr('class', 'button tilda-value')
            .merge(buttons)
            .text(d => d)
            .on('click', function(_d3_event: MouseEvent, value: string) {
                const gap = d3_select(this.parentElement!.parentElement!).datum() as CategoryGap;
                changeTags({ [writeKeyForSide(gap.key, card.side, card.result._prefix)]: value });
            });
    }


    /** Target category select, and the tags to add or change to reach it */
    function drawTarget(selection: d3.Selection<HTMLDivElement>, card: SideCard) {
        const current = card.result.category;
        const targets = listTargetCategories({ fromCategory: current, fromIncomplete: isIncompleteCategoryId(current) })
            .filter(target => target !== current);
        // the current category first, then the targets in groups (<optgroup>)
        const groups = [{ id: 'current', categories: [current] }, ...groupCategories(targets)];

        let label = selection.selectAll<HTMLLabelElement, number>('label')
            .data(_editing.has(card.side) || card.target ? [0] : []);
        label.exit().remove();
        const labelEnter = label.enter().append('label').attr('class', 'tilda-target-label');
        labelEnter.append('div').attr('class', 'tilda-subheading').call(t.append('inspector.tilda.target'));
        labelEnter.append('select');
        label = label.merge(labelEnter);

        const select = label.select<HTMLSelectElement>('select')
            // set on every render: the card is reused when another way is selected
            .on('change', function(this: HTMLSelectElement) {
                const value = this.value;
                if (value === current) {
                    _targets.delete(card.side);
                } else {
                    _targets.set(card.side, value);
                }
                section.reRender();
            });
        const optgroups = select.selectAll<HTMLOptGroupElement, { id: string; categories: string[] }>('optgroup')
            .data(groups, d => d.id)
            .join('optgroup')
            .order()   // the card is reused when another way is selected
            .attr('label', d => d.id === 'current' ? t('inspector.tilda.current_group') : categoryGroupLabel(d.id));
        optgroups.selectAll<HTMLOptionElement, string>('option')
            .data(d => d.categories, d => d)
            .join('option')
            .order()
            .attr('value', d => d)
            .text(d => d === current ? `${categoryLabel(d)} (${t('inspector.tilda.current')})` : categoryLabel(d));
        select.property('value', card.target ?? current);

        const plan = card.plan;
        const rows: TagPlanRow[] = plan ? [
            ...plan.remove.map(key => ({ kind: 'remove' as const, key, value: _tags[key] ?? '', reason: t('inspector.tilda.remove_reason') })),
            // add only what is still missing (the plan may repeat existing tags)
            ...plan.add.filter(entry => _tags[entry.key] === undefined)
                .map(entry => ({ kind: 'add' as const, key: entry.key, value: entry.value, reason: entry.reason })),
            ...plan.change.map(entry => ({ kind: 'change' as const, key: entry.key, value: entry.to, from: entry.from, reason: entry.reason })),
            ...plan.conflicts.map(entry => ({ kind: 'conflict' as const, key: entry.key, value: entry.value, reason: entry.reason }))
        ] : [];

        drawTagPlan(selection, plan && {
            rows,
            canApply: plan.aligned && rows.some(row => row.kind !== 'conflict'),
            applyLabel: t('inspector.tilda.apply_all'),
            onApply: () => changeTags(tagPlanChanges(rows)),
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
     * Checklist of tags the Radnetz dataset needs, as the tags themselves: `key=value` with a state,
     * the attribute name as tooltip. A missing tag links to its field below; only tags without a
     * field get the values TILDA accepts as buttons (plus a free input).
     */
    function drawAttributes(selection: d3.Selection<HTMLDivElement>, attributes: RequiredAttribute[], headerText?: string,
        quickValues: Record<string, string> = {}) {
        const header = selection.selectAll<HTMLDivElement, string>('.tilda-attributes-header')
            .data(attributes.length && headerText ? [headerText] : []);
        header.exit().remove();
        header.enter()
            .append('div')
            .attr('class', 'tilda-attributes-header')
            .merge(header)
            .text(d => d);

        const withField = fieldKeys();
        const hasField = (d: RequiredAttribute) => d.lookup.some(key => withField.has(key));

        let rows = selection.selectAll<HTMLDivElement, RequiredAttribute>('.tilda-attribute')
            .data(attributes, d => d.key);
        rows.exit().remove();

        const rowsEnter = rows.enter()
            .append('div')
            .attr('class', 'tilda-attribute');
        rowsEnter.append('span').attr('class', 'tilda-attribute-state');
        const mainEnter = rowsEnter.append('span').attr('class', 'tilda-attribute-main');
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
                changeTags({ [attribute.key]: this.value.trim() });
            });
        inputs.append('datalist');

        rows = rows.merge(rowsEnter)
            .attr('class', d => {
                const severity = attributeSeverity(d);
                return `tilda-attribute state-${d.state}${d.optional ? ' optional' : ''}${severity ? ` severity-${severity}` : ''}${confirmed(d) ? ' checked' : ''}`;
            })
            .attr('title', d => [
                t(`inspector.tilda.attribute.${d.id}`, { default: d.id }),
                t('inspector.tilda.feeds', { attributes: d.feeds.join(', ') })
            ].join('\n'));

        rows.select('.tilda-attribute-state').text(d => confirmed(d) ? STATE_ICON.ok : STATE_ICON[d.state]);

        // the tags as they are tagged, or "`key` is missing; add below"
        rows.select<HTMLSpanElement>('.tilda-attribute-tags')
            .each(function(d) {
                const cell = d3_select(this).text('');
                if (d.tagged.length) {
                    for (const tag of d.tagged) cell.append('code').text(`${tag.key}=${tag.value}`);
                    return;
                }
                const line = cell.append('span').attr('class', 'tilda-attribute-missing');
                line.append('code').text(d.key);
                if (d.state === 'inherited') return;
                // assumed: a default to confirm, not a request to tag it
                line.append('span').text(` ${t(d.state === 'assumed' ? 'inspector.tilda.not_tagged' : 'inspector.tilda.missing')}`);
                if (!hasField(d) || confirmed(d)) return;
                line.append('span').text('; ');
                line.append('a')
                    .attr('href', '#')
                    .attr('class', 'tilda-reveal')
                    .text(t(d.state === 'assumed' ? 'inspector.tilda.check_below'
                        : d.optional ? 'inspector.tilda.add_below_optional' : 'inspector.tilda.add_below'))
                    .on('click', (d3_event: MouseEvent) => {
                        d3_event.preventDefault();
                        dispatch.call('reveal', section, d.lookup);
                    });
            });
        rows.select('.tilda-attribute-note').text(d => {
            const check = confirmed(d);
            return check ? `${byline('checked_by', check)}. ${stateNote(d)}` : stateNote(d);
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
        const quickValue = (d: RequiredAttribute) => !needsInputs(d) && d.state === 'missing' ? quickValues[d.key] : undefined;
        rows.select<HTMLSpanElement>('.tilda-attribute-inputs')
            .style('display', d => needsInputs(d) || d.state === 'assumed' || quickValue(d) ? null : 'none');
        // a default: only the listed values say something else, no free value
        rows.select<HTMLInputElement>('input.tilda-attribute-input')
            .style('display', d => d.state === 'assumed' || quickValue(d) ? 'none' : null);

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
            .text(d => d)
            .on('click', function(_d3_event: MouseEvent, value: string) {
                const attribute = d3_select(this.closest('.tilda-attribute')!).datum() as RequiredAttribute;
                changeTags({ [attribute.key]: value });
            });
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
            _targets = new Map();
            _selfExpanded = undefined;
            _editing = new Set();
        }
        _entityIDs = val;
        return section;
    };

    section.tags = function(val?: Tags) {
        if (val === undefined) return _tags;
        _tags = val;
        // drop targets that are reached now
        for (const [side, target] of _targets) {
            if (categoryForSide(_tags, side) === target) {
                _targets.delete(side);
                _editing.delete(side);
            }
        }
        updateFieldStatus();
        return section;
    };

    return utilRebind(section, dispatch, 'on');
}
