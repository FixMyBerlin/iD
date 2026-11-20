import { select as d3_select } from 'd3-selection';

import { t } from '../core/localizer';
import { services } from '../services';
import { SIGN_GROUPS, signGroupsOf, type SignGroup } from '../mapillary/sign_groups';
import { uiTooltip } from './tooltip';
import type { coreContext } from '../core';

/**
 * Filter chips below the "Traffic signs" layer in the Photo Overlays pane (WORKDOC feature 26):
 * one per sign group, several can be on; all on shows every sign. Each chip counts the loaded
 * signs in view.
 */
export function uiMapillarySignGroups(context: coreContext) {
    let _counts = new Map<SignGroup, number>();


    function countsInView(): Map<SignGroup, number> {
        const counts = new Map<SignGroup, number>(SIGN_GROUPS.map(group => [group, 0]));
        const service = services.mapillary;
        if (!service) return counts;
        for (const sign of service.signs(context.projection)) {
            for (const group of signGroupsOf(sign.value ?? '')) counts.set(group, counts.get(group)! + 1);
        }
        return counts;
    }


    function toggle(group: SignGroup) {
        const current = context.photos().signGroups();
        const chosen = current.length ? current : [...SIGN_GROUPS];
        const next = chosen.includes(group) ? chosen.filter(item => item !== group) : [...chosen, group];
        // nothing chosen would hide every sign; treat it as "all"
        const list = SIGN_GROUPS.filter(item => next.includes(item));
        context.photos().setSignGroups((list.length ? list : SIGN_GROUPS).join(','), true);
    }


    return function render(selection: d3.Selection<HTMLLIElement>) {
        const enabled = context.layers().layer('mapillary-signs')?.enabled() ?? false;
        const shown = context.photos().signGroups();
        const isShown = (group: SignGroup) => !shown.length || shown.includes(group);
        _counts = enabled ? countsInView() : new Map();

        let wrap = selection.selectAll<HTMLDivElement, number>('.mapillary-sign-groups')
            .data(enabled ? [0] : []);
        wrap.exit().remove();
        wrap = wrap.enter()
            .append('div')
            .attr('class', 'mapillary-sign-groups')
            .attr('role', 'group')
            .attr('aria-label', t('photo_overlays.sign_groups.label'))
            .merge(wrap);

        const chips = wrap.selectAll<HTMLButtonElement, SignGroup>('.mapillary-sign-group')
            .data(SIGN_GROUPS);

        const enter = chips.enter()
            .append('button')
            .attr('type', 'button')
            .attr('class', d => `mapillary-sign-group mapillary-sign-group-${d}`)
            .on('click', (_event, d) => toggle(d))
            .each(function(d) {
                d3_select(this).call((uiTooltip() as any)
                    .title(() => (tip: d3.Selection) => tip.text(
                        `${t(`photo_overlays.sign_groups.${d}.tooltip`)}. ${t('photo_overlays.sign_groups.tooltip', { count: _counts.get(d) ?? 0 })}`
                    ))
                    .placement('top'));
            });
        enter.append('span').attr('class', 'mapillary-sign-group-label');
        enter.append('span').attr('class', 'mapillary-sign-group-count');

        const all = enter.merge(chips)
            .classed('active', isShown)
            .attr('aria-pressed', d => String(isShown(d)));
        all.select('.mapillary-sign-group-label').text(d => t(`photo_overlays.sign_groups.${d}.title`));
        all.select('.mapillary-sign-group-count').text(d => String(_counts.get(d) ?? 0));
    };
}
