import { select as d3_select } from 'd3-selection';

import { localizer, t } from '../../core/localizer';
import { prefs } from '../../core/preferences';
import {
    DEFAULT_LENS_SHORTCUT,
    getBundledLens,
    LENS_PREF,
    LENS_SHORTCUTS_PREF,
    UPLOADED_LENSES_PREF,
    getSelectedLensId,
    getShortcutForLens,
    getUploadedLenses,
    listLenses,
    removeUploadedLens,
    setSelectedLensId,
    type LensEntry
} from '../../core/lenses';
import { svgIcon } from '../../svg/icon';
import { uiCmd } from '../cmd';
import { uiConfirm } from '../confirm';
import { uiSection } from '../section';
import { uiSettingsLens } from '../settings/lens';
import { uiPaneTooltip } from '../pane_tooltip';
import { uiTooltip } from '../tooltip';


/**
 * Map Data pane section to pick a lens: the built-in default, or a CSS file
 * imported by the user (kept in localStorage). Styled like the Background list:
 * one radio row per lens, "+" in the header to import, edit and delete buttons
 * on imported lenses, and the ⌥ shortcut in the row tooltip.
 */
export function uiSectionLenses(context: iD.Context) {
    const section = (uiSection('map-data-lenses', context) as any)
        .label(() => t.append('map_data.lens.title'))
        .disclosureHeaderOptions(renderHeaderOptions)
        .disclosureContent(renderDisclosureContent);

    const tooltipPlacement = () => localizer.textDirection() === 'rtl' ? 'right' : 'left';


    function lensName(entry: LensEntry) {
        if (entry.source === 'default') return t('map_data.lens.default');
        const bundled = getBundledLens(entry.id);
        if (bundled) return t(bundled.nameID);
        return entry.name || entry.id;
    }

    function lensTooltipID(entry: LensEntry) {
        if (entry.source === 'default') return 'map_data.lens.default_tooltip';
        return getBundledLens(entry.id)?.tooltipID ?? 'map_data.lens.select_tooltip';
    }

    function lensShortcut(entry: LensEntry) {
        return entry.source === 'default' ? DEFAULT_LENS_SHORTCUT : getShortcutForLens(entry.id);
    }

    function uploadedLens(id: string) {
        return getUploadedLenses().find(lens => lens.id === id);
    }


    function renderHeaderOptions(selection: d3.Selection) {
        selection.selectAll('button.add-lens')
            .data([0])
            .enter()
            .append('button')
            .attr('class', 'disclosure-header-option add-lens')
            .attr('aria-label', t('map_data.lens.add'))
            .call((uiTooltip() as any)
                .title(() => t.append('map_data.lens.add'))
                .placement(tooltipPlacement())
            )
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                uiSettingsLens(context);
            })
            .call(svgIcon('#iD-icon-plus', ''));
    }


    function renderDisclosureContent(selection: d3.Selection) {
        let list = selection.selectAll<HTMLUListElement, number>('ul.layer-list-lenses')
            .data([0]);
        list = list.enter()
            .append('ul')
            .attr('class', 'layer-list layer-list-lenses')
            .merge(list);

        let items = list.selectAll<HTMLLIElement, LensEntry>('li')
            .data(listLenses(), d => d.id);
        items.exit().remove();

        const itemsEnter = items.enter()
            .append('li')
            .attr('class', d => `lens-item lens-item-${d.source}`);

        const labelEnter = itemsEnter.append('label');
        labelEnter
            .append('input')
            .attr('type', 'radio')
            .attr('name', 'lens')
            .on('change', (_d3_event: Event, d: LensEntry) => setSelectedLensId(d.id));
        labelEnter
            .append('span');

        const uploadedEnter = itemsEnter.filter(d => d.source === 'uploaded');

        uploadedEnter
            .append('button')
            .attr('class', 'lens-edit')
            .call(uiPaneTooltip()
                .title(() => t.append('map_data.lens.edit_tooltip'))
            )
            .on('click', (d3_event: MouseEvent, d: LensEntry) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                const lens = uploadedLens(d.id);
                if (lens) uiSettingsLens(context, lens);
            })
            .call(svgIcon('#iD-icon-edit', ''));

        uploadedEnter
            .append('button')
            .attr('class', 'lens-delete')
            .call(uiPaneTooltip()
                .title(() => t.append('map_data.lens.remove'))
            )
            .on('click', (d3_event: MouseEvent, d: LensEntry) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                confirmDelete(d);
            })
            .call(svgIcon('#iD-operation-delete', ''));

        items = items.merge(itemsEnter)
            .order();

        const selectedID = getSelectedLensId();
        items
            .classed('active', d => d.id === selectedID)
            .select('input')
            .property('checked', d => d.id === selectedID);

        items.select('label > span')
            .text(lensName);

        // the ⌥ shortcut shows in the tooltip, like ⌘B in the Background list
        items.select<HTMLLabelElement>('label')
            .each(function(d) {
                const shortcut = lensShortcut(d);
                const tooltip = uiPaneTooltip()
                    .title(() => t.append(lensTooltipID(d)))
                    .keys(shortcut ? [uiCmd('⌥' + shortcut.toUpperCase())] : null);
                d3_select(this).call((uiTooltip() as any).destroyAny).call(tooltip);
            });
    }


    function confirmDelete(entry: LensEntry) {
        const modal = uiConfirm(context.container());

        modal.select('.modal-section.header')
            .append('h3')
            .call(t.append('map_data.lens.delete.header'));

        modal.select('.modal-section.message-text')
            .append('p')
            .call(t.append('map_data.lens.delete.message', { name: lensName(entry) }));

        const buttons = modal.select('.modal-section.buttons');
        buttons
            .append('button')
            .attr('class', 'button cancel-button secondary-action')
            .call(t.append('confirm.cancel'))
            .on('click.cancel', () => modal.close());
        buttons
            .append('button')
            .attr('class', 'button action')
            .call(t.append('map_data.lens.delete.confirm'))
            .on('click.delete', () => {
                modal.close();
                removeUploadedLens(entry.id);
            });
    }


    prefs.onChange(LENS_PREF, section.reRender);
    prefs.onChange(UPLOADED_LENSES_PREF, section.reRender);
    prefs.onChange(LENS_SHORTCUTS_PREF, section.reRender);

    return section;
}
