import { select as d3_select } from 'd3-selection';

import { actionChangeTags } from '../actions';
import { activeTargetEvents, clearActiveTarget, getActiveTarget } from '../mapillary/active_target';
import { appendImageId, imageButtonKeys, removeImageId } from '../mapillary/set_photo';
import { geoSphericalDistance } from '../geo';
import { infra3dUrl, openInfra3d } from '../infra3d/infra3d';
import { t, localizer } from '../core/localizer';
import { services } from '../services';
import { svgIcon } from '../svg/icon';
import { loadSignRecommender, loadedSignDescriber, type SignDescription } from '../traffic_sign/recommender';
import { removeSignFromValue, signGroupsOf, signMeaning, signName } from '../mapillary/sign_groups';
import { clearSelectedSign, restoreSelectedSign, selectedSign, showSignImage, signSelectEvents, type SelectedSign } from '../mapillary/sign_select';
import { changeLabel, directionalTags, sideOfLine, signButtonKeys, signDirectionOnWay, signSourceChanges, signTagChanges, type SignDirection } from '../mapillary/sign_tagging';
import { dayLabels, type ImageDay } from '../mapillary/sign_view';
import type { coreContext } from '../core';

/**
 * The bar above the Mapillary viewer (WORKDOC features 20 and 26): with a selected traffic sign,
 * what the sign is, its images by capture day and buttons that write it to the selected way; with
 * a selected feature, buttons that add the shown image to one of its image keys.
 */

type Action = {
    id: string;
    label: string;
    title: string;
    present: boolean;
    replaces?: string;
    /** sign buttons: the sign value, and whether the key fits the sign's direction */
    sign?: string;
    suggested?: boolean;
    /** the image as source of the sign */
    source?: boolean;
    /** the image in one of the feature's image keys */
    image?: boolean;
    disabled?: boolean;
    changes: Record<string, string>;
    /** what a click on a tagged ("present") button does: the tags as they are without the change (undefined: no tag) */
    remove: Record<string, string | undefined>;
};



export function initMapillarySignBar(context: coreContext) {
    const render = () => renderSignBar(context);
    let lastSelection = '';
    signSelectEvents.on('change.signBar', render);
    activeTargetEvents.on('change.signBar', render);
    context.history().on('change.signBar', render);
    context.on('enter.signBar', () => {
        // the image key chosen in the Mapillary images field belongs to the selected feature
        const selection = context.selectedIDs().join(',');
        if (selection !== lastSelection) {
            lastSelection = selection;
            clearActiveTarget();
        }
        render();
    });
    services.mapillary?.event.on('imageChanged.signBar', () => {
        // closing the viewer ends the sign selection too (one close for both)
        const sign = selectedSign();
        // (`hideViewer` sends this before it marks the viewer as closed; its `hide` class is already set)
        const closed = context.container().select('.photoviewer').classed('hide');
        if (sign && !sign.loading && closed) {
            clearSelectedSign();
        } else {
            render();
        }
    });
    restoreSelectedSign(context);
}


/** `regulatory--turn-right-ahead--g1` → "Turn right ahead" */
function mapillaryLabel(value: string): string {
    const name = signName(value).replace(/-/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
}


function describe(context: coreContext, signs: string[]): SignDescription[] | undefined {
    const describer = loadedSignDescriber();
    if (!describer) {
        // the traffic sign tool's names and icons load with its bundle
        loadSignRecommender(context).then(() => renderSignBar(context)).catch(() => {});
        return undefined;
    }
    return signs.flatMap(sign => describer(sign));
}


/** The selected way, if exactly one way is selected */
/** The selected feature, if exactly one is selected */
function selectedEntity(context: coreContext): iD.OsmEntity | undefined {
    const ids = context.selectedIDs();
    return ids.length === 1 ? context.hasEntity(ids[0]) : undefined;
}


function selectedWay(context: coreContext): iD.OsmWay | undefined {
    const ids = context.selectedIDs();
    if (ids.length !== 1) return undefined;
    const entity = context.hasEntity(ids[0]);
    return entity?.type === 'way' ? entity as iD.OsmWay : undefined;
}


function labelled(tags: Record<string, string>, changes: Record<string, string>, title: string) {
    const { label, present, replaces } = changeLabel(tags, changes);
    const note = present ? t('mapillary_sign_bar.present') : replaces ? t('mapillary_sign_bar.replaces', { value: replaces }) : '';
    return { label, present, replaces, changes, title: note ? `${title} (${note})` : title };
}


function actionsFor(sign: SelectedSign, tags: Record<string, string>, keys: string[], suggested: string, direction?: SignDirection): Action[] {
    const meaning = signMeaning(sign.value);
    if (!meaning) return [];
    // speed signs: the direction the sign applies to first (`maxspeed:forward`), then both directions
    const tagSets = (meaning.tags ?? []).flatMap(changes => direction ? [directionalTags(changes, direction), changes] : [changes]);
    // the label is the main tag (with what is tagged now); the tooltip lists all of them (with the source)
    const actions: Action[] = tagSets.map((changes, i) => {
        const list = Object.entries(changes).map(([k, v]) => `${k}=${v}`);
        const remove = Object.fromEntries(Object.keys(changes).map(key => [key, undefined]));
        return { id: `tags-${i}`, remove, ...labelled(tags, changes, `${t('mapillary_sign_bar.write_tags')}: ${list.join(', ')}`) };
    });
    // each possible sign as `key=value` for the plain key and its directions
    for (const value of meaning.signs) {
        for (const key of keys) {
            const changes = signTagChanges(tags, key, value);
            actions.push({
                id: `sign-${value}-${key}`,
                sign: value,
                suggested: key === suggested,
                remove: { [key]: removeSignFromValue(tags[key], value) },
                ...labelled(tags, changes, t('mapillary_sign_bar.write_sign', { key }))
            });
        }
    }
    // the image as source of the suggested key: `source:traffic_sign:mapillary=1586…`
    if (sign.imageId) {
        const changes = signSourceChanges(tags, suggested, sign.imageId);
        const sourceKey = Object.keys(changes)[0];
        actions.push({
            id: 'source',
            source: true,
            remove: { [sourceKey]: removeImageId(tags, sourceKey, sign.imageId) },
            ...labelled(tags, changes, t('mapillary_sign_bar.write_source'))
        });
    }
    return actions;
}


export function renderSignBar(context: coreContext) {
    // the bar sits above the viewer, over the map, so the image stays free
    const viewer = context.container().select('.photoviewer');
    const mapillaryShown = !context.container().select('.photoviewer .mly-wrapper:not(.hide)').empty();
    if (viewer.empty()) return;
    const sign = mapillaryShown ? selectedSign() : null;
    const image = mapillaryShown ? services.mapillary?.getActiveImage() : null;
    // infra3D at the sign (turned to it), else where the shown image was taken
    const infra3d = sign ? infra3dUrl(sign.loc) : image ? infra3dUrl(image.loc, 'jumpTo') : undefined;
    // with a sign: the sign, its images and what to write; without: the image keys of the feature
    const shown = !!sign || (!!image && (!!selectedEntity(context) || !!infra3d));

    let bar = viewer.selectAll<HTMLDivElement, number>('.mapillary-sign-bar')
        .data(shown ? [0] : []);
    bar.exit().remove();
    const enter = bar.enter()
        .append('div')
        .attr('class', 'mapillary-sign-bar');

    const head = enter.append('div').attr('class', 'mapillary-sign-bar-head');
    head.append('span').attr('class', 'mapillary-sign-bar-icons');
    head.append('span').attr('class', 'mapillary-sign-bar-name');
    head.append('span').attr('class', 'mapillary-sign-bar-direction hide');
    enter.append('div').attr('class', 'mapillary-sign-bar-days');
    // what can be written to the selected feature, separated from the sign's images above
    const write = enter.append('div').attr('class', 'mapillary-sign-bar-write');
    write.append('div').attr('class', 'mapillary-sign-bar-actions mapillary-sign-bar-tags');
    write.append('div').attr('class', 'mapillary-sign-bar-signs');
    write.append('div').attr('class', 'mapillary-sign-bar-actions mapillary-sign-bar-source');
    write.append('div').attr('class', 'mapillary-sign-bar-actions mapillary-sign-bar-images');
    // the same place in other imagery
    enter.append('div').attr('class', 'mapillary-sign-bar-links')
        .append('button')
        .attr('type', 'button')
        .attr('class', 'mapillary-sign-bar-infra3d')
        .text('infra3D ↗');

    bar = enter.merge(bar);
    if (!shown) return;

    bar.classed('with-sign', !!sign);
    bar.selectAll('.mapillary-sign-bar-head, .mapillary-sign-bar-days').classed('hide', !sign);
    if (sign) {
        renderHead(context, bar, sign);
        renderDays(context, bar.select('.mapillary-sign-bar-days'), sign);
    }
    renderActions(context, bar, sign);

    bar.select('.mapillary-sign-bar-links').classed('hide', !infra3d);
    bar.select('.mapillary-sign-bar-infra3d')
        .attr('title', t(sign ? 'infra3d.tooltip_sign' : 'infra3d.tooltip_image'))
        .on('click', () => {
            if (infra3d) openInfra3d(infra3d);
        });
}


function renderHead(context: coreContext, bar: d3.Selection<HTMLDivElement>, sign: SelectedSign) {
    const meaning = signMeaning(sign.value);
    const described = meaning ? describe(context, [meaning.signs[0]]) : undefined;

    // the Mapillary icon, then the German sign(s) when we know them
    const icons = [{
        id: `mapillary-${sign.value}`,
        href: `#${sign.value}`,
        svg: undefined as string | undefined,
        title: t('mapillary_sign_bar.icon.mapillary', { value: sign.value })
    }].concat((described ?? []).filter(d => d.svgName).map(d => ({
        id: d.value,
        href: '',
        svg: context.asset(`traffic-sign-converter/data-svgs/DE/svgs/${d.svgName}.svg`),
        title: t('mapillary_sign_bar.icon.sign', { sign: d.value.startsWith('DE:') ? d.value : `DE:${d.value}`, name: d.name })
    })));
    const icon = bar.select('.mapillary-sign-bar-icons').selectAll<HTMLElement, typeof icons[0]>('.mapillary-sign-bar-icon')
        .data(icons, d => d.id);
    icon.exit().remove();
    const iconEnter = icon.enter()
        .append(d => document.createElement(d.svg ? 'img' : 'span'))
        .attr('class', 'mapillary-sign-bar-icon')
        .each(function(d) {
            if (d.svg) {
                d3_select(this).attr('src', d.svg).attr('alt', d.id);
            } else {
                d3_select(this).append('svg').append('use').attr('href', d.href);
            }
        });
    iconEnter.merge(icon)
        .attr('title', d => d.title)
        .order();

    const name = described?.[0]?.known
        ? `${meaning!.signs[0]} ${described[0].name}`
        : meaning ? `${meaning.signs[0]} · ${mapillaryLabel(sign.value)}` : mapillaryLabel(sign.value);
    bar.select('.mapillary-sign-bar-name')
        .text(sign.loading ? `${name} – ${t('mapillary_sign_bar.loading')}` : name)
        .attr('title', sign.value);
}


function renderDays(context: coreContext, selection: d3.Selection<HTMLDivElement>, sign: SelectedSign) {
    const shownId = services.mapillary?.getActiveImage()?.id;
    const isShown = (day: ImageDay) => day.images.some(image => image.id === shownId);

    const buttons = selection.selectAll<HTMLButtonElement, ImageDay>('.mapillary-sign-bar-day')
        .data(sign.days, d => d.day);
    buttons.exit().remove();
    const enter = buttons.enter()
        .append('button')
        .attr('type', 'button')
        .attr('class', 'mapillary-sign-bar-day')
        .on('click', (_event, day) => {
            // a click on the shown day steps through its images
            const index = day.images.findIndex(image => image.id === services.mapillary?.getActiveImage()?.id);
            const next = index >= 0 ? day.images[(index + 1) % day.images.length] : day.best;
            showSignImage(context, next.id);
        });
    // left: month and year over the age; right: an image icon with "2/4"
    const dates = enter.append('span').attr('class', 'mapillary-sign-bar-day-dates');
    dates.append('span').attr('class', 'mapillary-sign-bar-day-month');
    dates.append('span').attr('class', 'mapillary-sign-bar-day-age');
    const count = enter.append('span').attr('class', 'mapillary-sign-bar-day-count');
    count.call(svgIcon('#far-image', 'mapillary-sign-bar-day-icon'));
    count.append('span').attr('class', 'mapillary-sign-bar-day-position');

    const all = enter.merge(buttons)
        .classed('active', isShown)
        .attr('title', day => {
            const creators = [...new Set(day.images.map(image => image.creator).filter(Boolean))].join(', ');
            const pano = day.images.every(image => image.isPano) ? ' · 360°' : '';
            const index = day.images.findIndex(image => image.id === shownId);
            const position = index >= 0 && day.images.length > 1 ? ` · ${t('mapillary_sign_bar.image_of', { n: index + 1, count: day.images.length })}` : '';
            const date = new Date(`${day.day}T12:00:00Z`).toLocaleDateString(localizer.languageCode(), { dateStyle: 'long', timeZone: 'UTC' });
            return `${date} · ${creators}${pano}${position}`;
        });
    const now = new Date();
    const locale = localizer.languageCode();
    all.select('.mapillary-sign-bar-day-month').text(day => dayLabels(day.day, now, locale).month);
    all.select('.mapillary-sign-bar-day-age').text(day => dayLabels(day.day, now, locale).age);
    all.attr('aria-label', day => new Date(`${day.day}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: 'long', timeZone: 'UTC' }));
    // keep the shown day in view when the row scrolls
    const active = all.filter(isShown).node();
    if (active && active.parentElement) {
        const row = active.parentElement;
        if (active.offsetLeft < row.scrollLeft || active.offsetLeft + active.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollLeft = active.offsetLeft - 4;
        }
    }
    all.select('.mapillary-sign-bar-day-position').text(day => {
        const index = day.images.findIndex(image => image.id === shownId);
        return index >= 0 ? `${index + 1}/${day.images.length}` : String(day.images.length);
    });
}


function renderActions(context: coreContext, bar: d3.Selection<HTMLDivElement>, sign: SelectedSign | null) {
    const way = selectedWay(context);
    const entity = selectedEntity(context);
    const tags = (entity?.tags ?? {}) as Record<string, string>;
    const coords = way ? context.graph().childNodes(way).map(node => node.loc as [number, number]) : [];
    const direction = sign && way ? signDirectionOnWay(coords, sign.loc, sign.facing) : undefined;
    const { keys, suggested } = signButtonKeys(tags, {
        bikeSign: !!sign && signGroupsOf(sign.value).includes('bike'),
        side: sign ? sideOfLine(coords, sign.loc) : undefined,
        direction
    });
    const signActions = sign && way ? actionsFor(sign, tags, keys, suggested, direction) : [];

    // which way along the selected way the sign applies to
    bar.select('.mapillary-sign-bar-direction')
        .classed('hide', !direction)
        .text(direction ? t(`mapillary_sign_bar.direction.${direction}`) : '')
        .attr('title', direction ? t('mapillary_sign_bar.direction.tooltip') : null);

    const tagActions = signActions.filter(action => !action.sign && !action.source);
    const signRowActions = signActions.filter(action => action.sign);
    const sourceActions = signActions.filter(action => action.source);
    const imageActions = entity ? imageActionsFor(context, entity, sourceActions[0] ? Object.keys(sourceActions[0].changes)[0] : undefined) : [];

    bar.select('.mapillary-sign-bar-write').classed('hide', !signActions.length && !imageActions.length);
    renderButtons(context, bar.select<HTMLDivElement>('.mapillary-sign-bar-tags').classed('hide', !tagActions.length), tagActions);
    renderButtons(context, bar.select<HTMLDivElement>('.mapillary-sign-bar-source').classed('hide', !sourceActions.length), sourceActions);
    renderButtons(context, bar.select<HTMLDivElement>('.mapillary-sign-bar-images').classed('hide', !imageActions.length), imageActions);

    // one row of `key=value` buttons per possible sign
    const signValues = [...new Set(signRowActions.map(action => action.sign!))];
    const rows = bar.select('.mapillary-sign-bar-signs')
        .classed('hide', !signRowActions.length)
        .selectAll<HTMLDivElement, string>('.mapillary-sign-bar-actions')
        .data(signValues, d => d);
    rows.exit().remove();
    rows.enter()
        .append('div')
        .attr('class', 'mapillary-sign-bar-actions')
        .merge(rows)
        .order()
        .each(function(value) {
            renderButtons(context, d3_select<HTMLDivElement, string>(this), signRowActions.filter(action => action.sign === value));
        });
}


/**
 * The shown image as `key=1586…` for each image key of the feature (WORKDOC feature 20, replaces
 * the viewer's eyedropper and its key menu); the row chosen in the Mapillary images field is the
 * suggested one. Disabled when the image is more than 100 m away, like iD's button.
 */
function imageActionsFor(context: coreContext, entity: iD.OsmEntity, exclude: string | undefined): Action[] {
    const image = services.mapillary?.getActiveImage();
    if (!image) return [];
    const id = String(image.id);
    const tags = entity.tags as Record<string, string>;
    const { keys, suggested } = imageButtonKeys(tags, getActiveTarget(entity.id), exclude);
    const tooFar = geoSphericalDistance(entity.extent(context.graph()).center(), image.loc) > 100;
    return keys.map(key => {
        const changes = { [key]: appendImageId(tags, key, id) };
        const action: Action = {
            id: `image-${key}`,
            image: true,
            suggested: key === suggested,
            remove: { [key]: removeImageId(tags, key, id) },
            ...labelled(tags, changes, t('mapillary_sign_bar.write_image', { key }))
        };
        if (tooFar && !action.present) {
            action.disabled = true;
            action.title = t('inspector.set_photo_from_viewer.disable.too_far');
        }
        return action;
    });
}


function renderButtons(context: coreContext, row: d3.Selection<HTMLDivElement>, actions: Action[]) {
    // A tagged (green) button takes its tag out again only when the tag was set in this session:
    // a tag that was on the feature before is not removed by a click out of habit.
    const base = context.history().base();
    const removable = (d: Action) => {
        if (!d.present) return false;
        const entity = d.image ? selectedEntity(context) : selectedWay(context);
        if (!entity) return false;
        const before = base.hasEntity(entity.id);
        return !before || Object.keys(d.changes).some(key => before.tags[key] !== entity.tags[key]);
    };
    const title = (d: Action) => {
        if (removable(d)) return `${d.title} – ${t('mapillary_sign_bar.present_undo')}`;
        return d.suggested ? `${d.title} – ${t(d.image ? 'mapillary_sign_bar.suggested_image' : 'mapillary_sign_bar.suggested')}` : d.title;
    };

    const buttons = row.selectAll<HTMLButtonElement, Action>('.mapillary-sign-bar-action')
        .data(actions, d => d.id);
    buttons.exit().remove();
    buttons.enter()
        .append('button')
        .attr('type', 'button')
        .attr('class', 'mapillary-sign-bar-action')
        .merge(buttons)
        .order()
        .text(d => d.label)
        .attr('title', title)
        .classed('present', d => d.present)
        .classed('removable', removable)
        .classed('replaces', d => !!d.replaces)
        .classed('suggested', d => !!d.suggested && !d.present)
        .property('disabled', d => !!d.disabled || (d.present && !removable(d)))
        .on('click', (_event, d) => {
            const entity = d.image ? selectedEntity(context) : selectedWay(context);
            if (!entity) return;
            // a second click takes a tag of this session out again
            const undo = removable(d);
            const tags: Record<string, string> = { ...entity.tags, ...(undo ? {} : d.changes) };
            if (undo) {
                for (const [key, value] of Object.entries(d.remove)) {
                    if (value === undefined) {
                        delete tags[key];
                    } else {
                        tags[key] = value;
                    }
                }
            }
            context.perform(
                actionChangeTags(entity.id, tags),
                t(undo ? 'mapillary_sign_bar.annotation_remove' : 'mapillary_sign_bar.annotation')
            );
        });
}
