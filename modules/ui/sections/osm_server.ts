import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import { uiSection } from '../section';

type ApiConnection = { url: string; apiUrl?: string; client_id: string };

/** kept in the module, so it survives a `ui.restart()`; the editor starts on the first connection */
let _current = 0;

/**
 * Preferences ▸ OSM server: which OSM API the editor reads from and uploads to
 * (live or the development server). Was the "live" / "dev" chip in the footer (`ui/source_switch.js`).
 * Only used when the build offers more than one connection.
 */
export function uiSectionOsmServer(context: iD.Context) {
    const section = (uiSection('preferences-osm-server', context) as any)
        .label(() => t.append('preferences.osm_server.title'))
        .disclosureContent(renderDisclosureContent);

    const names = ['live', 'dev'];

    function connections(): ApiConnection[] {
        return (context.connection() as any)?.apiConnections() ?? [];
    }

    function switchTo(index: number) {
        const osm = context.connection() as any;
        if (!osm || index === _current || context.inIntro()) return false;
        if (context.history().hasChanges() && !window.confirm(t('source_switch.lose_changes'))) return false;

        context.enter(modeBrowse(context) as any);
        context.history().clearSaved();   // remove saved history
        context.flush();                  // remove stored data
        _current = index;
        osm.switch(connections()[index]); // warning: dispatches 'change' event
        return true;
    }

    function renderDisclosureContent(selection: d3.Selection) {
        let list = selection.selectAll<HTMLUListElement, number>('ul.osm-server-list')
            .data([0]);
        list = list.enter()
            .append('ul')
            .attr('class', 'layer-list osm-server-list')
            .merge(list);

        const items = list.selectAll<HTMLLIElement, ApiConnection>('li')
            .data(connections());

        const labelEnter = items.enter()
            .append('li')
            .append('label');

        labelEnter
            .append('input')
            .attr('type', 'radio')
            .attr('name', 'osm-server')
            .on('change', function(_d3_event: Event, d) {
                switchTo(connections().indexOf(d));
                // also resets the radio buttons when the user kept their changes
                section.reRender();
            });

        const text = labelEnter
            .append('span');
        text
            .append('span')
            .attr('class', 'osm-server-name')
            .each(function(_d, i) {
                if (names[i]) d3_select(this).call(t.append(`preferences.osm_server.${names[i]}`));
            });
        text
            .append('span')
            .attr('class', 'osm-server-url')
            .text(d => d.url.replace(/^https?:\/\//, ''));

        list.selectAll<HTMLLIElement, ApiConnection>('li')
            .classed('active', (_d, i) => i === _current)
            .select('input')
            .property('checked', (_d, i) => i === _current);

        const hint = selection.selectAll('.osm-server-hint')
            .data([0]);
        hint.enter()
            .append('div')
            .attr('class', 'osm-server-hint')
            .call(t.append('preferences.osm_server.hint'));
    }

    return section;
}
