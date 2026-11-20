import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { CUSTOM_DATA_COLORS, customDataLayers, type CustomDataLayer } from '../../renderer/custom_data_layers';
import { PROGRESS_TRACKERS, type ProgressTrackerID } from '../../progress/tracker';
import { utilNoAuto } from '../../util';
import { uiConfirm } from '../confirm';


/**
 * Modal to add a custom data layer, or to edit one when `layer` is given.
 */
export function uiSettingsCustomDataLayer(context: iD.Context, layer?: CustomDataLayer) {
    const modal = uiConfirm(context.container()).okButton();

    modal
        .classed('settings-modal settings-custom-data-layer', true);

    modal.select('.modal-section.header')
        .append('h3')
        .call(t.append(layer
            ? 'map_data.custom_data_layers.settings.header_edit'
            : 'map_data.custom_data_layers.settings.header_add'
        ));

    const textSection = modal.select('.modal-section.message-text');

    textSection
        .append('label')
        .call(t.append('map_data.custom_data_layers.settings.name'));

    const nameInput = textSection
        .append('input')
        .attr('class', 'field-name')
        .attr('type', 'text')
        .call(utilNoAuto)
        .property('value', layer?.name ?? '');

    textSection
        .append('label')
        .call(t.append('map_data.custom_data_layers.settings.url'));

    const urlInput = textSection
        .append('textarea')
        .attr('class', 'field-url')
        .attr('placeholder', t('map_data.custom_data_layers.settings.url_placeholder'))
        .call(utilNoAuto)
        .on('input.custom-data-layer', updateSaveDisabled)
        .property('value', layer?.url ?? '');

    textSection
        .append('div')
        .attr('class', 'instructions-formats deemphasize')
        .call(t.append('map_data.custom_data_layers.settings.formats'));

    textSection
        .append('label')
        .call(t.append('map_data.custom_data_layers.settings.filter'));

    const filterRow = textSection
        .append('div')
        .attr('class', 'filter-row');

    const filterKeyInput = filterRow
        .append('input')
        .attr('class', 'field-filter-key')
        .attr('type', 'text')
        .attr('placeholder', t('map_data.custom_data_layers.settings.filter_key'))
        .attr('aria-label', t('map_data.custom_data_layers.settings.filter_key'))
        .call(utilNoAuto)
        .property('value', layer?.filterKey ?? '');

    filterRow
        .append('span')
        .attr('class', 'filter-equals')
        .text('=');

    const filterValueInput = filterRow
        .append('input')
        .attr('class', 'field-filter-value')
        .attr('type', 'text')
        .attr('placeholder', t('map_data.custom_data_layers.settings.filter_value'))
        .attr('aria-label', t('map_data.custom_data_layers.settings.filter_value'))
        .call(utilNoAuto)
        .property('value', layer?.filterValue ?? '');

    textSection
        .append('div')
        .attr('class', 'instructions-filter deemphasize')
        .call(t.append('map_data.custom_data_layers.settings.filter_help'));

    textSection
        .append('label')
        .call(t.append('map_data.custom_data_layers.settings.color'));

    const colorInput = textSection
        .append('input')
        .attr('class', 'field-color')
        .attr('type', 'color')
        .property('value', layer?.color ?? CUSTOM_DATA_COLORS[customDataLayers.all().length % CUSTOM_DATA_COLORS.length]);

    // progress tracking: the lines of the layer can be marked as done for one task
    textSection
        .append('label')
        .call(t.append('map_data.custom_data_layers.settings.tracker.label'));

    let tracker: ProgressTrackerID | undefined = layer?.tracker;
    const trackerOptions: (ProgressTrackerID | undefined)[] = [undefined, ...Object.keys(PROGRESS_TRACKERS) as ProgressTrackerID[]];
    const trackerLabels = textSection
        .append('div')
        .attr('class', 'tracker-options')
        .selectAll('label')
        .data(trackerOptions)
        .enter()
        .append('label');

    trackerLabels
        .append('input')
        .attr('type', 'radio')
        .attr('name', 'custom-data-layer-tracker')
        .property('checked', d => d === tracker)
        .on('change', (_d3_event: Event, d) => { tracker = d; });

    trackerLabels
        .append('span')
        .each(function(d) {
            t.append(`map_data.custom_data_layers.settings.tracker.${d ?? 'none'}`)(d3_select(this));
        });

    textSection
        .append('div')
        .attr('class', 'instructions-tracker deemphasize')
        .call(t.append('map_data.custom_data_layers.settings.tracker.help'));

    const buttonSection = modal.select('.modal-section.buttons');

    buttonSection
        .insert('button', '.ok-button')
        .attr('class', 'button cancel-button secondary-action')
        .call(t.append('confirm.cancel'))
        .on('click.cancel', () => modal.close());

    buttonSection.select('.ok-button')
        .on('click.save', clickSave);

    updateSaveDisabled();
    nameInput.node()?.focus();


    function currentUrl() {
        return String(urlInput.property('value')).replace(/[\r\n]+/g, '').trim();
    }

    function updateSaveDisabled() {
        buttonSection.select('.ok-button')
            .attr('disabled', currentUrl() ? null : true);
    }

    function clickSave() {
        const url = currentUrl();
        if (!url) return;

        const name = String(nameInput.property('value'));
        const color = String(colorInput.property('value'));
        const filter = {
            filterKey: String(filterKeyInput.property('value')),
            filterValue: String(filterValueInput.property('value'))
        };
        modal.close();

        // lines that are tracked must be clickable
        const tracking = { tracker, ...(tracker ? { selectable: true } : {}) };
        if (layer) {
            customDataLayers.update(layer.id, { name, url, color, ...filter, ...tracking });
        } else {
            const added = customDataLayers.add(url, name, filter);
            customDataLayers.update(added.id, { color, ...tracking });
        }
    }
}
