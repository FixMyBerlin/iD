import { select as d3_select } from 'd3-selection';

import { prefs } from '../../core/preferences';
import { t } from '../../core/localizer';
import { uiSection } from '../section';
import { uiTooltip } from '../tooltip';

/**
 * Preferences ▸ Interface: options for the editor's own UI.
 * - "Show button labels" shows the captions under the top toolbar buttons
 *   ("Add Feature", "Undo / Redo", …). Without them the toolbar is shorter.
 *   Ported from the iD--v3-reloaded worktree (commits 1f76e0820, 439e18668, 7d74005f8).
 * - The optional controls: the scale and the right sidebar buttons we rarely need.
 *   They are always created and only hidden, so their shortcuts keep working.
 * All options are off unless the user turned them on.
 */

export const INTERFACE_LABELS_PREF = 'preferences.interface.labels';

/** Optional controls: id (pref `preferences.interface.<id>`, string `preferences.interface.<id>`) and element */
const OPTIONAL_CONTROLS = [
    { id: 'scale', selector: '.map-status .scale-block' },
    { id: 'zoom', selector: '.map-control.zoombuttons' },
    { id: 'zoom-to-selection', selector: '.map-control.zoom-to-selection-control' },
    { id: 'geolocate', selector: '.map-control.geolocate-control' },
    { id: 'help', selector: '.map-control.help-control' }
];

const OPTIONS = [
    { id: 'labels', pref: INTERFACE_LABELS_PREF },
    ...OPTIONAL_CONTROLS.map(control => ({ id: control.id, pref: `preferences.interface.${control.id}` }))
];


function isOn(pref: string) {
    return prefs(pref) === 'true';
}


/** Applies the interface preferences to the container; call at startup and after changes */
export function applyInterfacePrefs(context: iD.Context, options?: { resize?: boolean }) {
    const container = context.container();
    container.classed('hide-toolbar-labels', !isOn(INTERFACE_LABELS_PREF));
    for (const control of OPTIONAL_CONTROLS) {
        container.selectAll(control.selector)
            .classed('hide', !isOn(`preferences.interface.${control.id}`));
    }
    if (options?.resize) {
        // the toolbar height changed, so the map area did too
        (context.ui() as { onResize?: () => void }).onResize?.();
    }
}


export function uiSectionInterface(context: iD.Context) {
    const section = (uiSection('preferences-interface', context) as any)
        .label(() => t.append('preferences.interface.title'))
        .disclosureContent(renderDisclosureContent);

    function renderDisclosureContent(selection: d3.Selection) {
        let list = selection.selectAll<HTMLUListElement, number>('ul.interface-options-list')
            .data([0]);
        list = list.enter()
            .append('ul')
            .attr('class', 'layer-list interface-options-list')
            .merge(list);

        const items = list.selectAll<HTMLLIElement, typeof OPTIONS[number]>('li')
            .data(OPTIONS, d => d.id);

        const labelEnter = items.enter()
            .append('li')
            .attr('class', d => `interface-${d.id}-item`)
            .append('label')
            .call((uiTooltip() as any)
                .title((d: typeof OPTIONS[number]) => t.append(`preferences.interface.${d.id}.tooltip`))
                .placement('bottom')
            );

        labelEnter
            .append('input')
            .attr('type', 'checkbox')
            .on('change', function(this: HTMLInputElement, _d3_event: Event, d) {
                prefs(d.pref, this.checked ? 'true' : 'false');
            });

        labelEnter
            .append('span')
            .each(function(d) {
                d3_select(this).call(t.append(`preferences.interface.${d.id}.description`));
            });

        list.selectAll<HTMLLIElement, typeof OPTIONS[number]>('li')
            .classed('active', d => isOn(d.pref))
            .select('input')
            .property('checked', d => isOn(d.pref));
    }

    for (const option of OPTIONS) {
        prefs.onChange(option.pref, () => {
            applyInterfacePrefs(context, { resize: option.pref === INTERFACE_LABELS_PREF });
            section.reRender();
        });
    }

    return section;
}
