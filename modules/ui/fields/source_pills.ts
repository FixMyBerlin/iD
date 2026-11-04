import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util';

/**
 * A source field as pills (WORKDOC feature 25): one click on a common value ("Luftbild 2026",
 * "Messung aus Punktwolke (Infra3DViewer)"), a second click removes it. Other values go into the
 * small text input next to them. Used for the width sources below the width fields.
 */
export function uiFieldSourcePills(field: any) {
    const dispatch = d3_dispatch('change');
    const options: string[] = field.options ?? [];
    let _value: string | undefined;
    let _selection = d3_select<HTMLDivElement, number>(null!);

    function change(value: string | undefined) {
        const update: TagsUpdate = {};
        update[field.key] = value || undefined;
        dispatch.call('change', sourcePills, update);
    }

    /** What the input shows: a value that is not one of the pills */
    const shownInInput = () => (_value && !options.includes(_value) ? _value : '');

    /** Only what was typed: leaving the input untouched (e.g. to click a pill) changes nothing */
    function typed(this: HTMLInputElement) {
        const value = this.value.trim();
        if (value !== shownInInput()) change(value);
    }

    function sourcePills(selection: d3.Selection) {
        let wrap = selection.selectAll<HTMLDivElement, number>('.form-field-input-wrap')
            .data([0]);
        wrap = wrap.enter()
            .append('div')
            .attr('class', `form-field-input-wrap form-field-input-${field.type} source-pills`)
            .merge(wrap);
        _selection = wrap;

        wrap.selectAll<HTMLButtonElement, string>('button.source-pill')
            .data(options, d => d)
            .enter()
            .append('button')
            .attr('type', 'button')
            .attr('class', 'source-pill')
            .text(d => d)
            .on('click', (d3_event: MouseEvent, d) => {
                d3_event.preventDefault();
                change(_value === d ? undefined : d);
            });

        wrap.selectAll<HTMLInputElement, number>('input.source-pills-other')
            .data([0])
            .enter()
            .append('input')
            .attr('type', 'text')
            .attr('class', 'source-pills-other')
            .attr('placeholder', t('inspector.source_pills.other'))
            .call(utilNoAuto)
            .on('change', typed)
            .on('blur', typed);

        update();
    }

    function update() {
        _selection.selectAll<HTMLButtonElement, string>('button.source-pill')
            .classed('active', d => d === _value)
            .attr('aria-pressed', d => String(d === _value));
        // the input shows a value that is not one of the pills
        _selection.select<HTMLInputElement>('input.source-pills-other')
            .call(utilGetSetValue, shownInInput());
    }

    sourcePills.tags = function(tags: TagsMulti) {
        const value = tags[field.key];
        _value = typeof value === 'string' ? value : undefined;
        update();
        return sourcePills;
    };

    sourcePills.focus = function() {
        _selection.select<HTMLInputElement>('input.source-pills-other').node()?.focus();
    };

    return utilRebind(sourcePills, dispatch, 'on');
}
