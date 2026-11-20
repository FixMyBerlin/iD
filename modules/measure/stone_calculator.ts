import { select as d3_select } from 'd3-selection';

import { actionChangeTags } from '../actions/change_tags';
import { t } from '../core/localizer';
import { svgIcon } from '../svg/icon';
import { uiTooltip } from '../ui/tooltip';
import { STONE_SIZES_CM, formatStoneSource, parseStoneSource, stoneWidth, type StoneCount } from './stones';
import { withoutRedundantPartSources } from '@tilda-geo/bicycle-infrastructure-tagging';
import { definedTags } from '../tilda/tags';

const BUTTON_CLASS = 'stone-calculator-button';
const PANEL_CLASS = 'stone-calculator';
/** width keys a stone count makes sense for (not buffers) */
const STONE_KEY = /(^|:)width(:effective)?$/;

export const isStoneKey = (key: string) => STONE_KEY.test(key);
/** The width source key of the Radinfra FAQ: `source:width`, `source:cycleway:width` */
const sourceKeyOf = (key: string) => `source:${key}`;

/** "7,5" or "7.5"; anything else is no count (0) */
export function parseCount(text: string): number {
    const value = text.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(value) ? Number(value) : 0;
}


/**
 * The stone calculator next to the measuring tape (WORKDOC feature 21): "6 Steine à 20 cm = 1.2 m".
 * "Übernehmen" sets the width and its source in one undo step. Open when the source of the width is
 * a stone count already. Drawn into the width fields by the measuring tape's listeners.
 */
export function stoneCalculator(context: iD.Context) {
    /** keys opened or closed by the button, for the selected feature */
    const _toggled = new Map<string, boolean>();
    /** the numbers typed in, per key, until applied */
    const _drafts = new Map<string, StoneCount>();
    let _entityKey = '';

    const tooltip = (uiTooltip() as any)
        .placement('top')
        .title(() => t.append('inspector.stone_calculator.button'));

    function entity() {
        const ids = context.selectedIDs();
        return ids.length === 1 ? context.hasEntity(ids[0] as iD.OsmEntity['id']) : undefined;
    }

    function source(key: string) {
        const value = entity()?.tags[sourceKeyOf(key)];
        return typeof value === 'string' ? value : undefined;
    }

    function isOpen(key: string) {
        return _toggled.get(key) ?? !!parseStoneSource(source(key));
    }

    function stonesOf(key: string): StoneCount {
        return _drafts.get(key) ?? parseStoneSource(source(key)) ?? { count: 0, cm: STONE_SIZES_CM[0] };
    }

    function apply(key: string, refresh: () => void) {
        const current = entity();
        const stones = stonesOf(key);
        if (!current || !(stones.count > 0) || !(stones.cm > 0)) return;
        const tags = definedTags(withoutRedundantPartSources({ ...current.tags, [key]: stoneWidth(stones), [sourceKeyOf(key)]: formatStoneSource(stones) }));
        context.perform(actionChangeTags(current.id, tags), t('inspector.stone_calculator.annotation'));
        _drafts.delete(key);
        refresh();
    }

    /** Draws the button into `host` (the field's input row) and the panel below it */
    function refresh(formField: HTMLElement, host: HTMLElement, key: string, refreshAll: () => void) {
        const selected = context.selectedIDs().join();
        if (selected !== _entityKey) {
            _entityKey = selected;
            _toggled.clear();
            _drafts.clear();
        }

        let button = host.querySelector<HTMLElement>(`:scope > .${BUTTON_CLASS}`);
        if (!button) {
            const created = d3_select(document.createElement('button'))
                .attr('type', 'button')
                .attr('class', `form-field-button ${BUTTON_CLASS}`)
                .call(svgIcon('#fas-border-all', ''))
                .call(tooltip)
                .on('click', (d3_event: Event) => {
                    d3_event.preventDefault();
                    d3_event.stopPropagation();
                    _toggled.set(key, !isOpen(key));
                    refreshAll();
                });
            button = created.node()!;
            host.appendChild(button);
        }
        const open = isOpen(key);
        button.classList.toggle('active', open);

        let panel = d3_select(formField).selectAll<HTMLDivElement, number>(`:scope > .${PANEL_CLASS}`)
            .data(open ? [0] : []);
        panel.exit().remove();
        if (!open) return;

        const enter = panel.enter()
            .insert('div', '.field-related')
            .attr('class', PANEL_CLASS);
        const row = enter.append('div').attr('class', 'stone-calculator-row');
        row.append('input')
            // text, not number: a number input drops or rejects the comma in some browser languages
            .attr('type', 'text')
            .attr('inputmode', 'decimal')
            .attr('class', 'stone-count')
            .attr('aria-label', t('inspector.stone_calculator.count'))
            .on('input', function(this: HTMLInputElement) {
                _drafts.set(key, { ...stonesOf(key), count: parseCount(this.value) });
                drawResult();
            });
        row.append('span').attr('class', 'stone-calculator-text').text(t('inspector.stone_calculator.stones_of'));
        row.append('span').attr('class', 'stone-sizes');
        row.append('span').attr('class', 'stone-calculator-result');
        enter.append('button')
            .attr('type', 'button')
            .attr('class', 'stone-calculator-apply')
            .text(t('inspector.stone_calculator.apply'))
            .on('click', (d3_event: Event) => {
                d3_event.preventDefault();
                apply(key, refreshAll);
            });
        panel = panel.merge(enter);

        const stones = stonesOf(key);
        const countInput = panel.select<HTMLInputElement>('input.stone-count').node()!;
        if (document.activeElement !== countInput) countInput.value = stones.count ? String(stones.count).replace('.', ',') : '';

        panel.select('.stone-sizes').selectAll<HTMLButtonElement, number>('button')
            .data([...new Set([...STONE_SIZES_CM, stones.cm])], d => String(d))
            .join('button')
            .attr('type', 'button')
            .attr('class', 'stone-size')
            .text(d => `${String(d).replace('.', ',')} cm`)
            .classed('active', d => d === stonesOf(key).cm)
            .on('click', (d3_event: Event, d) => {
                d3_event.preventDefault();
                _drafts.set(key, { ...stonesOf(key), cm: d });
                refreshAll();
            });

        function drawResult() {
            const current = stonesOf(key);
            const ok = current.count > 0;
            panel.select('.stone-calculator-result').text(ok ? `= ${stoneWidth(current)} m` : '');
            panel.select<HTMLButtonElement>('.stone-calculator-apply')
                .property('disabled', !ok)
                .attr('title', ok ? `${key}=${stoneWidth(current)}, ${sourceKeyOf(key)}=${formatStoneSource(current)}` : null);
        }
        drawResult();
    }

    function remove(formField: HTMLElement, host: HTMLElement | null) {
        host?.querySelector(`:scope > .${BUTTON_CLASS}`)?.remove();
        formField.querySelector(`:scope > .${PANEL_CLASS}`)?.remove();
    }

    return { refresh, remove };
}
