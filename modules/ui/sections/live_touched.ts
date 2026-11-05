import { select as d3_select } from 'd3-selection';
import { PRIVACY_URL, type LiveItem } from '@osm-editor-kit/live-touched';

import { kvErrorMessage } from '../../core/kv_error_message';
import { t } from '../../core/localizer';
import type { LiveTouched } from '../../live_touched/live_touched';
import { modeSelect } from '../../modes/select';
import { svgIcon } from '../../svg/icon';
import { utilDisplayLabel } from '../../util/utilDisplayLabel';
import { uiConfirm } from '../confirm';
import { uiSection } from '../section';

const TYPE_LETTER = { node: 'n', way: 'w', relation: 'r' } as const;


function entityID(item: LiveItem) {
    return `${TYPE_LETTER[item.type]}${item.id}` as `w${number}`;
}


/**
 * Map Data pane section for live touched: the on/off switch (with consent on first use),
 * the list of objects that others edit nearby, and "Delete my data on the server".
 */
export function uiSectionLiveTouched(context: iD.Context) {
    const section = (uiSection('live-touched', context) as any)
        .label(() => t.append('live_touched.title'))
        .disclosureContent(renderDisclosureContent);

    let _nukeResult: number | undefined;


    function liveTouched(): LiveTouched | undefined {
        // set on the ui object in `ui/init.js`
        return (context.ui() as { liveTouched?: LiveTouched }).liveTouched;
    }


    function isLoggedIn() {
        return !!context.connection()?.authenticated();
    }


    /** "{user} edited this 12 min ago", with the user name as a link to the OSM profile */
    function renderStatus(selection: d3.Selection, item: LiveItem) {
        const marker = '\u0000';
        const minutes = Math.round(item.ageMs / 60000);
        const text = t(`live_touched.status.${item.status}`, { user: marker, minutes, version: item.newVersion ?? '?' });
        const [before, after = ''] = text.split(marker);
        selection.text('');
        selection.append('span').text(before);
        selection.append('a')
            .attr('href', `https://www.openstreetmap.org/user/${encodeURIComponent(item.user.display_name)}`)
            .attr('target', '_blank')
            .attr('rel', 'noopener')
            .on('click', (d3_event: MouseEvent) => d3_event.stopPropagation())
            .text(item.user.display_name);
        selection.append('span').text(after);
    }


    /** Only for conflicts: what the other edit means for my own edit */
    function hintText(item: LiveItem) {
        if (item.hint === 'parallel') return t('live_touched.hint.parallel');
        if (item.hint === 'outdated') {
            return t('live_touched.hint.outdated', { user: item.user.display_name, local: item.localVersion ?? '?', remote: item.newVersion ?? '?' });
        }
        return '';
    }


    function itemLabel(item: LiveItem) {
        const entity = context.hasEntity(entityID(item));
        const label = entity && utilDisplayLabel(entity, context.graph());
        return label || `${item.type} ${item.id}`;
    }


    function selectItem(item: LiveItem) {
        const id = entityID(item);
        if (context.hasEntity(id)) {
            context.enter(modeSelect(context, [id]));
        }
        context.zoomToEntity(id);
    }


    /** Turns live edits on; when the server cannot be reached (e.g. this address is not allowed there) it says so */
    function turnOn(live: LiveTouched) {
        live.enable()
            .catch((err: unknown) => {
                console.error('live touched:', err);  // eslint-disable-line no-console
                (context.ui().flash as any)
                    .duration(6000)
                    .iconName('#iD-icon-no')
                    .label(t.append('live_touched.unreachable', { reason: kvErrorMessage(err) }))();
            })
            .finally(section.reRender);
    }

    function toggle(this: HTMLInputElement) {
        const live = liveTouched();
        if (!live || (this.checked && !isLoggedIn())) {
            this.checked = false;
            return;
        }

        if (!this.checked) {
            live.disable().finally(section.reRender);
            return;
        }
        if (live.hasConsent()) {
            turnOn(live);
            return;
        }
        this.checked = false;
        showConsent();
    }


    function showConsent() {
        const modal = uiConfirm(context.container());

        modal.select('.modal-section.header')
            .append('h3')
            .call(t.append('live_touched.title'));

        const text = modal.select('.modal-section.message-text');
        text
            .append('p')
            .call(t.append('live_touched.consent.body'));
        text
            .append('p')
            .append('a')
            .attr('href', PRIVACY_URL)
            .attr('target', '_blank')
            .attr('rel', 'noopener')
            .call(t.append('live_touched.consent.privacy'));

        const buttons = modal.select('.modal-section.buttons');
        buttons
            .append('button')
            .attr('class', 'button cancel-button secondary-action')
            .call(t.append('confirm.cancel'))
            .on('click.cancel', () => modal.close());
        buttons
            .append('button')
            .attr('class', 'button action')
            .call(t.append('live_touched.consent.accept'))
            .on('click.accept', () => {
                modal.close();
                const live = liveTouched();
                if (live) turnOn(live);
                section.reRender();
            });
    }


    function confirmNuke() {
        const modal = uiConfirm(context.container());

        modal.select('.modal-section.message-text')
            .append('p')
            .call(t.append('live_touched.nuke.confirm'));

        const buttons = modal.select('.modal-section.buttons');
        buttons
            .append('button')
            .attr('class', 'button cancel-button secondary-action')
            .call(t.append('confirm.cancel'))
            .on('click.cancel', () => modal.close());
        buttons
            .append('button')
            .attr('class', 'button action')
            .call(t.append('live_touched.nuke.button'))
            .on('click.nuke', () => {
                modal.close();
                liveTouched()?.nukeMyData()
                    .then(result => { _nukeResult = result.deleted; })
                    .catch((err: unknown) => console.error('live touched:', err))  // eslint-disable-line no-console
                    .finally(section.reRender);
            });
    }


    function renderDisclosureContent(selection: d3.Selection) {
        const live = liveTouched();
        const state = live?.state();
        const enabled = !!state?.enabled;

        // on/off switch
        let toggleList = selection.selectAll<HTMLUListElement, number>('ul.live-touched-toggle')
            .data([0]);

        const toggleEnter = toggleList.enter()
            .append('ul')
            .attr('class', 'layer-list live-touched-toggle');

        const labelEnter = toggleEnter
            .append('li')
            .append('label');

        labelEnter
            .append('input')
            .attr('type', 'checkbox')
            .on('change', toggle);

        labelEnter
            .append('span')
            .call(t.append('live_touched.toggle'));

        const canToggle = !!live && (enabled || isLoggedIn());
        toggleList = toggleList.merge(toggleEnter);
        toggleList.select('li')
            .classed('disabled', !canToggle);
        toggleList.select('input')
            .property('checked', enabled)
            .property('disabled', !canToggle);

        // login needed: a warning box above everything else, with a login button
        const loginBox = selection.selectAll<HTMLDivElement, number>('.live-touched-login')
            .data(isLoggedIn() ? [] : [0]);
        loginBox.exit().remove();
        const loginEnter = loginBox.enter()
            .insert('div', 'ul.live-touched-toggle')
            .attr('class', 'live-touched-login');
        loginEnter
            .append('p')
            .call(t.append('live_touched.login'));
        loginEnter
            .append('button')
            .attr('class', 'button action')
            .call(t.append('live_touched.login_button'))
            .on('click', () => {
                context.connection()?.authenticate(() => section.reRender(), {});
            });

        // status messages: error, zoom, empty, nuke result
        const messages: string[] = [];
        if (enabled && state?.error) messages.push(`${state.error.code}: ${state.error.message}`);
        if (enabled && state?.zoomedOutTooFar) messages.push(t('live_touched.zoomIn'));
        if (enabled && !state?.zoomedOutTooFar && !state?.items.length) messages.push(t('live_touched.empty'));
        if (_nukeResult !== undefined) messages.push(t('live_touched.nuke.done', { count: _nukeResult }));

        const messageRows = selection.selectAll<HTMLParagraphElement, string>('p.live-touched-message')
            .data(messages, d => d);
        messageRows.exit().remove();
        messageRows.enter()
            .insert('p', '.live-touched-items')
            .attr('class', 'live-touched-message deemphasize')
            .text(d => d);

        // list of objects that others edit
        let list = selection.selectAll<HTMLUListElement, number>('ul.live-touched-items')
            .data([0]);
        list = list.enter()
            .append('ul')
            .attr('class', 'layer-list live-touched-items')
            .merge(list);

        let rows = list.selectAll<HTMLLIElement, LiveItem>('li')
            .data(enabled ? state?.items ?? [] : [], d => `${d.user.osm_uid}-${d.type}-${d.id}`);
        rows.exit().remove();

        const rowsEnter = rows.enter()
            .append('li')
            .attr('class', 'live-touched-item')
            .on('click', (_d3_event: MouseEvent, d: LiveItem) => selectItem(d));
        const headEnter = rowsEnter.append('div').attr('class', 'live-touched-item-head');
        headEnter.append('span').attr('class', 'live-touched-item-title');
        headEnter.append('span').attr('class', 'live-touched-item-id');
        rowsEnter.append('div').attr('class', 'live-touched-item-status');
        const hintEnter = rowsEnter.append('div').attr('class', 'live-touched-item-hint');
        hintEnter.call(svgIcon('#iD-icon-alert', 'inline'));
        hintEnter.append('span');

        rows = rows.merge(rowsEnter)
            .order()
            .attr('class', d => `live-touched-item live-touched-item-${d.status} live-touched-hint-${d.hint}`);

        rows.select('.live-touched-item-title')
            .text(itemLabel);
        rows.select('.live-touched-item-id')
            .text(d => `${TYPE_LETTER[d.type]}/${d.id}`);
        rows.select<HTMLDivElement>('.live-touched-item-status')
            .each(function(d) {
                renderStatus(d3_select<HTMLElement, unknown>(this), d);
            });
        rows.select('.live-touched-item-hint')
            .classed('hide', d => !hintText(d))
            .select('span')
            .text(hintText);

        // footer
        let footer = selection.selectAll<HTMLDivElement, number>('.live-touched-footer')
            .data([0]);
        const footerEnter = footer.enter()
            .append('div')
            .attr('class', 'live-touched-footer');
        footerEnter
            .append('a')
            .attr('href', PRIVACY_URL)
            .attr('target', '_blank')
            .attr('rel', 'noopener')
            .call(t.append('live_touched.consent.privacy'));
        footerEnter
            .append('button')
            .attr('class', 'button live-touched-nuke')
            .call(t.append('live_touched.nuke.button'))
            .on('click', confirmNuke);
        footer = footer.merge(footerEnter);
        footer.select('.live-touched-nuke')
            .property('disabled', !live || !isLoggedIn());
    }


    /** Pulsing dot on the Map Data button while others edit in view */
    function updateIndicator() {
        const othersNearby = !!liveTouched()?.state().othersNearby;
        context.container().select('.map-pane-control.map-data-control button')
            .classed('live-touched-others-nearby', othersNearby);
    }


    // login and logout change what is possible
    (context.connection() as unknown as { on(type: string, listener: () => void): void } | undefined)?.on('change.uiSectionLiveTouched', () => section.reRender());

    // `ui/init.js` sets up live touched before it builds the panes
    liveTouched()?.session.subscribe(() => {
        updateIndicator();
        section.reRender();
    });

    return section;
}

