import { select as d3_select, type Selection } from 'd3-selection';

import { t } from '../core/localizer';
import { svgIcon } from '../svg/icon';
import { uiPaneTooltip } from './pane_tooltip';

/**
 * How a list entry of the Map Data pane takes part in the map:
 *   interactive – shown, can be hovered and selected (and edited, for OSM data)
 *   readonly    – shown for orientation, but cannot be hovered or selected
 *   hidden      – not shown
 * Used by Map Features and Custom Data Layers, so both lists look and behave the same.
 * The pencil stays reserved for "edit the settings of this entry".
 */
export type LayerMode = 'interactive' | 'readonly' | 'hidden';

export const LAYER_MODES: { mode: LayerMode; icon: string }[] = [
    { mode: 'interactive', icon: '#fas-arrow-pointer' },
    { mode: 'readonly', icon: '#fas-lock' },
    { mode: 'hidden', icon: '#fas-eye-slash' }
];

type ModeButton<T> = { datum: T; mode: LayerMode; icon: string };


/**
 * Appends a 3-way toggle to each list item. The item's datum is passed to `getMode` and `setMode`.
 * `name` gives the accessible name of the entry, `tooltipPrefix` the string keys
 * `<prefix>.interactive|readonly|hidden`.
 */
export function uiLayerModeToggle<T>(options: {
    getMode: (d: T) => LayerMode;
    setMode: (d: T, mode: LayerMode) => void;
    name: (d: T) => string;
    tooltipPrefix: string;
    /** A mode this entry cannot have: the string key of the reason, shown as the button's tooltip */
    unavailable?: (d: T, mode: LayerMode) => string | undefined;
}) {
    const { getMode, setMode, name, tooltipPrefix } = options;
    const reason = (d: ModeButton<T>) => options.unavailable?.(d.datum, d.mode);

    return function(items: Selection<HTMLLIElement, T, any, any>) {
        const group = items.selectAll<HTMLDivElement, T>('.layer-mode')
            .data((d: T) => [d]);
        const groupEnter = group.enter()
            .append('div')
            .attr('class', 'layer-mode')
            .attr('role', 'radiogroup');

        // re-join every render, so the buttons see the current datum (e.g. an edited custom layer)
        const buttons = group.merge(groupEnter)
            .selectAll<HTMLButtonElement, ModeButton<T>>('button')
            .data((datum: T) => LAYER_MODES.map(d => ({ datum, ...d })), d => d.mode);

        const buttonsEnter = buttons.enter()
            .append('button')
            .attr('class', d => `layer-mode-${d.mode}`)
            .attr('role', 'radio')
            .call(uiPaneTooltip()
                .title((d: ModeButton<T>) => t.append(reason(d) ?? `${tooltipPrefix}.${d.mode}`))
            )
            .on('click', (d3_event: MouseEvent, d) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                // not `disabled`: a disabled button shows no tooltip with the reason
                if (reason(d)) return;
                setMode(d.datum, d.mode);
            })
            .each(function(d) {
                svgIcon(d.icon, '')(d3_select<HTMLElement, unknown>(this));
            });

        items
            .attr('data-mode', (d: T) => getMode(d));

        buttons.merge(buttonsEnter)
            .classed('active', d => getMode(d.datum) === d.mode)
            .classed('unavailable', d => !!reason(d))
            .attr('aria-disabled', d => reason(d) ? 'true' : null)
            .attr('aria-checked', d => String(getMode(d.datum) === d.mode))
            .attr('aria-label', d => `${name(d.datum)}: ${t(`${tooltipPrefix}.${d.mode}`)}`);
    };
}
