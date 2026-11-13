import { t } from '../../core/localizer';
import {
    customDataFilterLabel,
    customDataLabel,
    customDataLayers,
    isSelectable,
    type CustomDataLayer
} from '../../renderer/custom_data_layers';
import { svgIcon } from '../../svg/icon';
import { uiConfirm } from '../confirm';
import { uiLayerModeToggle, type LayerMode } from '../layer_mode_toggle';
import { uiSection } from '../section';
import { uiSettingsCustomDataLayer } from '../settings/custom_data_layer';
import { uiPaneTooltip } from '../pane_tooltip';


function layerName(layer: CustomDataLayer) {
    return layer.name || customDataLabel(layer.url);
}


/**
 * Map Data pane section to add, toggle, edit and delete custom data layers.
 */
export function uiSectionCustomDataLayers(context: iD.Context) {
    const section = (uiSection('custom-data-layers', context) as any)
        .label(() => t.append('map_data.custom_data_layers.title'))
        .disclosureHeaderOptions(renderHeaderOptions)
        .disclosureContent(renderDisclosureContent);

    function renderHeaderOptions(selection: d3.Selection) {
        selection.selectAll('button.add-custom-data-layer')
            .data([0])
            .enter()
            .append('button')
            .attr('class', 'disclosure-header-option add-custom-data-layer')
            .attr('aria-label', t('map_data.custom_data_layers.add'))
            .call(uiPaneTooltip()
                .title(() => t.append('map_data.custom_data_layers.add'))
            )
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                uiSettingsCustomDataLayer(context);
            })
            .call(svgIcon('#iD-icon-plus', ''));
    }


    function renderDisclosureContent(selection: d3.Selection) {
        const layers = customDataLayers.all();

        const empty = selection.selectAll<HTMLParagraphElement, number>('.custom-data-layers-empty')
            .data(layers.length ? [] : [0]);

        empty.exit()
            .remove();

        empty.enter()
            .append('p')
            .attr('class', 'custom-data-layers-empty deemphasize')
            .call(t.append('map_data.custom_data_layers.empty'));

        let list = selection.selectAll<HTMLUListElement, number>('ul.layer-list-custom-data')
            .data([0]);

        list = list.enter()
            .append('ul')
            .attr('class', 'layer-list layer-list-custom-data')
            .merge(list);

        let items = list.selectAll<HTMLLIElement, CustomDataLayer>('li')
            .data(layers, d => d.id);

        items.exit()
            .remove();

        const itemsEnter = items.enter()
            .append('li')
            .attr('class', 'layer-custom-data');

        const labelEnter = itemsEnter
            .append('label')
            .call(uiPaneTooltip()
                .title((d: CustomDataLayer) => (selection: d3.Selection) => {
                    selection.append('code').text(d.url);
                    const filter = customDataFilterLabel(d);
                    if (filter) {
                        selection.append('div').attr('class', 'custom-data-filter-tooltip')
                            .call(t.append('map_data.custom_data_layers.filter_tooltip', { filter }));
                    }
                })
            );

        labelEnter
            .append('span')
            .attr('class', 'custom-data-swatch');

        labelEnter
            .append('span')
            .attr('class', 'custom-data-name');

        itemsEnter
            .append('button')
            .attr('class', 'layer-edit-custom-data')
            .call(uiPaneTooltip()
                .title(() => t.append('map_data.custom_data_layers.edit_tooltip'))
            )
            .on('click', (d3_event: MouseEvent, d: CustomDataLayer) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                uiSettingsCustomDataLayer(context, d);
            })
            .call(svgIcon('#iD-icon-edit', ''));

        itemsEnter
            .append('button')
            .attr('class', 'layer-delete-custom-data')
            .call(uiPaneTooltip()
                .title(() => t.append('map_data.custom_data_layers.delete.tooltip'))
            )
            .on('click', (d3_event: MouseEvent, d: CustomDataLayer) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                confirmDelete(d);
            })
            .call(svgIcon('#iD-operation-delete', ''));

        items = items.merge(itemsEnter)
            .order()
            .classed('active', d => d.enabled);

        // the mode toggle goes before the edit and delete buttons
        items.call(modeToggle);
        items.each(function() {
            const toggle = this.querySelector('.layer-mode');
            const label = this.querySelector('label');
            if (toggle && label && label.nextSibling !== toggle) label.after(toggle);
        });

        // pass the edited layer on to the label (its tooltip reads it) and to the buttons,
        // which else open the editor with the values from before the last save
        items.select('label');
        items.select('.layer-edit-custom-data');
        items.select('.layer-delete-custom-data');

        items.select('.custom-data-swatch')
            .style('background-color', d => d.color);

        // "NAME (key=value)"; the filter part is smaller and muted
        const names = items.select('.custom-data-name')
            .text(layerName);

        names.selectAll<HTMLSpanElement, string>('.custom-data-filter')
            .data(d => customDataFilterLabel(d) ? [customDataFilterLabel(d)] : [])
            .join('span')
            .attr('class', 'custom-data-filter')
            .text(d => `(${d})`);
    }


    const modeToggle = uiLayerModeToggle<CustomDataLayer>({
        getMode: layer => !layer.enabled ? 'hidden' : isSelectable(layer) ? 'interactive' : 'readonly',
        setMode: (layer: CustomDataLayer, mode: LayerMode) => customDataLayers.update(layer.id, {
            enabled: mode !== 'hidden',
            ...(mode === 'hidden' ? {} : { selectable: mode === 'interactive' })
        }),
        name: layerName,
        tooltipPrefix: 'map_data.layer_mode.custom_data',
        // the lines of a tracked layer must stay clickable
        unavailable: (layer, mode) => layer.tracker && mode === 'readonly' ? 'map_data.layer_mode.custom_data.readonly_tracked' : undefined
    });


    function confirmDelete(layer: CustomDataLayer) {
        const modal = uiConfirm(context.container());

        modal.select('.modal-section.header')
            .append('h3')
            .call(t.append('map_data.custom_data_layers.delete.header'));

        modal.select('.modal-section.message-text')
            .append('p')
            .call(t.append('map_data.custom_data_layers.delete.message', { name: layerName(layer) }));

        const buttons = modal.select('.modal-section.buttons');

        // close() (not remove()) so the modal's document keybinding is unbound
        buttons
            .append('button')
            .attr('class', 'button cancel-button secondary-action')
            .call(t.append('confirm.cancel'))
            .on('click.cancel', () => modal.close());

        buttons
            .append('button')
            .attr('class', 'button action')
            .call(t.append('map_data.custom_data_layers.delete.confirm'))
            .on('click.delete', () => {
                modal.close();
                customDataLayers.remove(layer.id);
            });
    }


    customDataLayers.on('change.uiSectionCustomDataLayers', section.reRender);

    return section;
}
