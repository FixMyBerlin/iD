import { t } from '../../core/localizer';
import { uiCmd } from '../cmd';
import { uiMapInMap } from '../map_in_map';
import { uiSection } from '../section';
import { uiTooltip } from '../tooltip';

type InfoPanels = { toggle(which: string): void };

/**
 * Preferences ▸ Panels: the checkboxes that open or close a panel on the map.
 * They were at the bottom of the background list and of the data layers.
 * The panels keep the checkboxes in sync through the `*-toggle-item` classes.
 */
export function uiSectionPanels(context: iD.Context) {
    const section = (uiSection('preferences-panels', context) as any)
        .label(() => t.append('preferences.panels.title'))
        .disclosureContent(renderDisclosureContent);

    const items = [
        { id: 'minimap', label: 'background.minimap.description', tooltip: 'background.minimap.tooltip',
          keys: () => [t('background.minimap.key')], toggle: () => (uiMapInMap as unknown as { toggle(): void }).toggle() },
        { id: 'background-panel', panel: 'background', label: 'background.panel.description', tooltip: 'background.panel.tooltip' },
        { id: 'location-panel', panel: 'location', label: 'background.location_panel.description', tooltip: 'background.location_panel.tooltip' },
        { id: 'history-panel', panel: 'history', label: 'map_data.history_panel.title', tooltip: 'map_data.history_panel.tooltip' },
        { id: 'measurement-panel', panel: 'measurement', label: 'map_data.measurement_panel.title', tooltip: 'map_data.measurement_panel.tooltip' }
    ];

    function renderDisclosureContent(selection: d3.Selection) {
        const listEnter = selection.selectAll('.panels-list')
            .data([0])
            .enter()
            .append('ul')
            .attr('class', 'layer-list panels-list');

        for (const item of items) {
            const panel = item.panel;
            const labelEnter = listEnter
                .append('li')
                .attr('class', `${item.id}-toggle-item`)
                .append('label')
                .call((uiTooltip() as any)
                    .title(() => t.append(item.tooltip))
                    .keys(panel ? [uiCmd('⌘⇧' + t(`info_panels.${panel}.key`))] : item.keys!())
                    .placement('bottom')
                );

            labelEnter
                .append('input')
                .attr('type', 'checkbox')
                .on('change', function(d3_event: Event) {
                    d3_event.preventDefault();
                    if (panel) {
                        (context.ui() as unknown as { info: InfoPanels }).info.toggle(panel);
                    } else {
                        item.toggle!();
                    }
                });

            labelEnter
                .append('span')
                .call(t.append(item.label));
        }
    }

    return section;
}
