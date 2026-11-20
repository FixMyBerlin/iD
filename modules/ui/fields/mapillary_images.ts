import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select, type Selection } from 'd3-selection';

import { localizer, t } from '../../core/localizer';
import { svgIcon } from '../../svg/icon';
import { utilNoAuto, utilRebind } from '../../util';
import { mapillaryKeyLabel, suggestedMapillaryKeys } from '../../mapillary/tag_keys';
import { buildImageRows, removeImageChange, setImageChange } from '../../mapillary/field_rows';
import { formatRelativeAge, loadImageInfo, type MapillaryImageInfo } from '../../mapillary/image_info';
import { showMapillaryImage } from '../../mapillary/viewer';
import { activeTargetEvents, getActiveTarget, setActiveTarget } from '../../mapillary/active_target';

/**
 * "Mapillary images" field (WORKDOC feature 19): one table row per image (`;`-separated ids of all
 * Mapillary image keys), laid out like the directional combo. The label cell has the key's label
 * and, small below it, the capture age and image type; the value cell the id with link, "show in
 * viewer" and remove buttons. "+" in the field label adds an image to a chosen key.
 * Replaces the schema's `mapillary` identifier field.
 */

/** One row of the table: an image of a key, or the new-image row with a key chooser (`key` = '') */
type ImageEntry = { key: string; index: number; id: string; label: string };


/** Second label line: capture age and image type ("last year · 360°"); the date as tooltip */
function imageInfoText(info: MapillaryImageInfo): { text: string; title: string } {
    const parts: string[] = [];
    let title = '';
    if (info.capturedAt) {
        const age = formatRelativeAge(info.capturedAt, new Date(), localizer.localeCode());
        if (age) parts.push(age);
        title = new Date(info.capturedAt).toLocaleString(localizer.localeCode());
    }
    parts.push(t(info.isPano ? 'inspector.mapillary_images.panorama' : 'inspector.mapillary_images.flat'));
    return { text: parts.join(' · '), title };
}


export function uiFieldMapillaryImages(field: unknown, context: iD.Context) {
    const dispatch = d3_dispatch('change');
    let _tags: TagsMulti = {};
    let _entityIDs: string[] = [];
    /** "+" in the field label was clicked: a row with a key chooser is shown */
    let _adding = false;
    let _addKey: string | undefined;
    let _container = d3_select<HTMLElement, unknown>(null!);
    let _list = d3_select<HTMLUListElement, unknown>(null!);
    let _focusNew = false;

    const singleTags = (): Tags => {
        const tags: Tags = {};
        for (const [key, value] of Object.entries(_tags)) {
            if (typeof value === 'string') tags[key] = value;
        }
        return tags;
    };


    function change(changes: TagsUpdate) {
        dispatch.call('change', mapillaryImages, changes);
    }


    /** Keys offered for a new image: existing ones (another image) and the likely new ones */
    function chooserKeys() {
        return suggestedMapillaryKeys(singleTags());
    }


    function entries(): ImageEntry[] {
        // images of another field's key (`source:traffic_sign:mapillary`) show below that field (feature 25, `preset_fields.js`)
        const hidden: ReadonlySet<string> = (field as { hiddenKeys?: Set<string> }).hiddenKeys ?? new Set();
        const tags = Object.fromEntries(Object.entries(singleTags()).filter(([key]) => !hidden.has(key)));
        const list: ImageEntry[] = buildImageRows(tags).flatMap(row =>
            row.ids.map((id, index) => ({
                key: row.key,
                index,
                id,
                label: index ? `${row.label} ${index + 1}` : row.label
            })));
        if (_adding) list.push({ key: '', index: -1, id: '', label: '' });
        return list;
    }


    /** the row "set photo from viewer" writes to gets an outline */
    function updateActiveTarget() {
        const active = getActiveTarget(_entityIDs.join(','));
        _list.selectAll<HTMLLIElement, ImageEntry>('li.labeled-input')
            .classed('mly-active-target', d => !!d.key && d.key === active);
    }


    function fillInfo(node: HTMLElement, id: string) {
        const info = d3_select(node);
        if (!id) {
            info.text('').attr('title', null).datum('');
            return;
        }
        info.text('…').attr('title', null).datum(id);
        loadImageInfo(id).then(result => {
            if (info.datum() !== id) return;   // the row shows another image by now
            const { text, title } = result ? imageInfoText(result) : { text: '', title: '' };
            info.text(text).attr('title', title || null);
        });
    }


    /** "+" in the field label, in front of the trash icon */
    function drawAddButton() {
        const label = _container.select('.field-label');
        if (label.empty()) return;
        let button = label.selectAll<HTMLButtonElement, number>('.mly-add-icon').data([0]);
        button = button.enter()
            .insert('button', '.remove-icon')
            .attr('type', 'button')
            .attr('class', 'mly-add-icon')
            .attr('title', t('inspector.mapillary_images.add_image'))
            .call(svgIcon('#iD-icon-plus', ''))
            .on('click', function(d3_event) {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                _adding = !_adding;
                _focusNew = _adding;
                render();
            })
            .merge(button);
        button.classed('active', _adding);
    }


    function drawLabelCell(selection: Selection<HTMLLIElement, ImageEntry, any, any>) {
        const label = selection.append('div').attr('class', 'label mly-image-label');
        label.append('span').attr('class', 'mly-image-title');
        label.append('span').attr('class', 'mly-image-info');
    }


    function drawChooser(row: Selection<HTMLLIElement, ImageEntry, any, any>) {
        const keys = chooserKeys();
        if (!_addKey || !keys.includes(_addKey)) _addKey = keys[0];

        let select = row.select('.mly-image-label').selectAll<HTMLSelectElement, number>('select').data([0]);
        select = select.enter()
            .append('select')
            .attr('class', 'mly-add-key')
            .attr('title', t('inspector.mapillary_images.choose_key'))
            .on('change', function() { _addKey = (this as HTMLSelectElement).value; })
            .merge(select);
        const options = select.selectAll<HTMLOptionElement, string>('option').data(keys, d => d);
        options.exit().remove();
        options.enter().append('option')
            .attr('value', d => d)
            .text(d => mapillaryKeyLabel(d))
            .attr('title', d => d);
        select.selectAll('option').order();
        select.property('value', _addKey!);
    }


    function render() {
        if (_list.empty()) return;
        drawAddButton();

        const rows = _list.selectAll<HTMLLIElement, ImageEntry>('li.labeled-input')
            .data(entries(), d => `${d.key}#${d.index}`);
        rows.exit().remove();

        const enter = rows.enter().append('li').attr('class', 'labeled-input mly-image');
        enter.call(drawLabelCell);

        const inputCell = enter.append('div').attr('class', 'mly-image-value')
            .append('div').attr('class', 'mly-image-value-inner');
        inputCell.append('input')
            .attr('type', 'text')
            .attr('class', 'mly-image-input')
            .attr('placeholder', t('inspector.mapillary_images.image_id'))
            .call(utilNoAuto)
            .on('change', function(d3_event, d) {
                const value = (this as HTMLInputElement).value;
                if (d.key) {
                    change(setImageChange(_tags, d.key, d.index, value));
                } else if (_addKey && value.trim()) {
                    // new image: appended to the chosen key
                    const key = _addKey;
                    _adding = false;
                    _addKey = undefined;
                    change(setImageChange(_tags, key, Number.MAX_SAFE_INTEGER, value));
                }
            });
        inputCell.append('a')
            .attr('class', 'form-field-button mly-image-link')
            .attr('target', '_blank')
            .attr('rel', 'noopener noreferrer')
            .attr('title', t('inspector.mapillary_images.view_on_mapillary'))
            .call(svgIcon('#iD-icon-out-link', ''));
        inputCell.append('button')
            .attr('type', 'button')
            .attr('class', 'form-field-button mly-image-show')
            .attr('title', t('inspector.mapillary_images.show_in_viewer'))
            .call(svgIcon('#fas-eye', ''))
            .on('click', function(d3_event, d) {
                d3_event.preventDefault();
                if (d.id) showMapillaryImage(context, d.id);
            });
        inputCell.append('button')
            .attr('type', 'button')
            .attr('class', 'form-field-button mly-image-remove')
            .attr('title', t('inspector.mapillary_images.remove_image'))
            .call(svgIcon('#iD-operation-delete', ''))
            .on('click', function(d3_event, d) {
                d3_event.preventDefault();
                if (d.key) {
                    change(removeImageChange(_tags, d.key, d.index));
                } else {
                    _adding = false;
                    render();
                }
            });

        const merged = enter.merge(rows)
            .attr('data-key', d => d.key || null)
            .classed('mly-new-image', d => !d.key)
            .on('focusin.activeTarget click.activeTarget', (d3_event, d) => {
                if (d.key) setActiveTarget(_entityIDs.join(','), d.key);
            })
            .order();

        merged.select<HTMLElement>('.mly-image-label').attr('title', d => d.key || null);
        merged.select('.mly-image-title').text(d => d.label);
        merged.filter(d => !d.key).call(drawChooser);
        merged.select<HTMLElement>('.mly-image-info').each(function(d) {
            if (d3_select(this).datum() !== d.id || !this.textContent) fillInfo(this, d.id);
        });
        merged.select<HTMLInputElement>('.mly-image-input').each(function(d) {
            if (this !== document.activeElement) this.value = d.id;
            this.title = d.id;
        });
        merged.select<HTMLAnchorElement>('.mly-image-link')
            .attr('href', d => d.id ? `https://www.mapillary.com/app/?pKey=${encodeURIComponent(d.id)}` : null)
            .classed('disabled', d => !d.id);
        merged.select('.mly-image-show').property('disabled', d => !d.id);

        _list.classed('empty', merged.empty());
        updateActiveTarget();

        if (_focusNew) {
            _focusNew = false;
            _list.node()?.querySelector<HTMLInputElement>('.mly-new-image .mly-image-input')?.focus();
        }
    }


    function mapillaryImages(selection: Selection<any, unknown, any, any>) {
        _container = selection;

        let wrap = selection.selectAll<HTMLDivElement, number>('.form-field-input-wrap')
            .data([0]);
        wrap = wrap.enter()
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-mapillary-images')
            .merge(wrap);

        let list = wrap.selectAll<HTMLUListElement, number>('ul.rows').data([0]);
        list = list.enter()
            .append('ul')
            .attr('class', 'rows rows-table')
            .merge(list);
        _list = list as unknown as typeof _list;

        activeTargetEvents.on('change.mapillaryField', updateActiveTarget);
        render();
    }


    mapillaryImages.tags = function(tags: TagsMulti) {
        _tags = tags;
        render();
        return mapillaryImages;
    };


    mapillaryImages.entityIDs = function(val?: string[]) {
        if (val === undefined) return _entityIDs;
        if (val.join() !== _entityIDs.join()) {
            _adding = false;
            _addKey = undefined;
        }
        _entityIDs = val;
        return mapillaryImages;
    };


    mapillaryImages.focus = function() {
        _list.node()?.querySelector<HTMLInputElement>('.mly-image-input')?.focus();
    };


    return utilRebind(mapillaryImages, dispatch, 'on');
}

uiFieldMapillaryImages.supportsMultiselection = false;
