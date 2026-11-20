import type { Dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import type { Field } from '@openstreetmap/id-tagging-schema';

import { t } from '../../core/localizer';
import { presetManager } from '../../presets';
import { presetField } from '../../presets/field';
import { RADNETZ_RELATED_BUTTONS } from '../../presets/radnetz_related_tags';
import {
    ADDABLE_CATEGORIES,
    BUTTON_CATEGORIES,
    RELATED_CATEGORIES,
    assignRelatedTags,
    relatedButtonKeys,
    compareRelatedTags,
    newRelatedKey,
    relatedSide,
    templateFieldIDs,
    type RelatedButtonKey,
    type RelatedCategory,
    type RelatedTag
} from '../../presets/related_tags';
import { parseMapillaryKey, splitImageIds } from '../../mapillary/tag_keys';
import { showMapillaryImage } from '../../mapillary/viewer';
import { svgIcon } from '../../svg/icon';
import { uiField } from '../field';

/**
 * Related tags below the inspector fields (WORKDOC feature 25): `Source: Luftbild 2026 ✎` for
 * `source:width`, the same for notes, check dates and Mapillary images of the field's keys.
 * Title buttons (source, note, check date; curated list) and the pencil open full fields for the
 * tags in a light box below; the lines stay and show the new value.
 * Open editors close when a feature is selected again.
 */

type InspectorField = {
    id: string;
    key?: string;
    keys?: string[];
    type: string;
    safeid: string;
    title(): string;
    allKeys(tags: TagsMulti): string[];
    effectiveKeys?: string[];
    render(selection: d3.Selection<HTMLElement>): void;
    state(val: string): InspectorField;
    tags(val: TagsMulti): InspectorField;
    on(type: string, fn: (...args: any[]) => void): InspectorField;
};

/** A line below a field: a tagged related tag, or one the mapper just added (`value` '') */
type Line = RelatedTag & { fieldTitle: string; fieldKey: string; fieldKeys: string[] };

/** Icons of the title buttons (`BUTTON_CATEGORIES`) */
const BUTTON_ICONS: Partial<Record<RelatedCategory, string>> = {
    source: '#fas-book-open',
    note: '#fas-comment',
    check_date: '#fas-calendar-days'
};

let _instances = 0;


export function uiRelatedTags(context: iD.Context, dispatch: Dispatch<object>) {
    /** keys with an open editor */
    const _expanded = new Set<string>();
    /** keys opened by a title button (or the TILDA checklist) that have no value yet, with their field */
    const _pending = new Map<string, Omit<RelatedTag, 'value'> & { fieldID: string }>();
    const _editors = new Map<string, InspectorField>();
    let _assigned = new Map<string, RelatedTag[]>();
    let _tags: TagsMulti = {};
    let _entityIDs: string[] = [];
    let _state = '';
    let _focusKey: string | undefined;
    let _selection: d3.Selection<HTMLElement> | undefined;

    function reset() {
        _expanded.clear();
        _pending.clear();
        _editors.clear();
    }
    // a new selection (also of the same feature) starts with closed editors
    context.on(`enter.relatedTags${++_instances}`, reset);


    const fieldKeysOf = (field: InspectorField) =>
        [...new Set([field.key, ...(field.keys ?? []), ...(field.effectiveKeys ?? field.allKeys(_tags))])].filter((key): key is string => !!key);

    const owners = (fields: InspectorField[]) => fields.filter(field => field.type !== 'mapillaryImages');

    const valueOf = (key: string) => (typeof _tags[key] === 'string' ? _tags[key] as string : undefined);


    /**
     * Assigns the related tags to the shown fields. Call before the fields render.
     * Returns the keys shown below fields: the Mapillary images field leaves them out.
     */
    function assign(fields: InspectorField[], tags: TagsMulti, entityIDs: string[], state: string) {
        _tags = tags;
        _entityIDs = entityIDs;
        _state = state;
        const shown = owners(fields);
        _assigned = assignRelatedTags(shown.map(field => ({ id: field.id, keys: fieldKeysOf(field) })), tags);
        for (const key of _pending.keys()) {
            if (valueOf(key) !== undefined) _pending.delete(key);
        }
        return new Set([..._assigned.values()].flat().map(tag => tag.key));
    }


    function linesOf(field: InspectorField): Line[] {
        const lines: RelatedTag[] = [...(_assigned.get(field.id) ?? [])];
        for (const [key, pending] of _pending) {
            if (pending.fieldID === field.id && !lines.some(line => line.key === key)) lines.push({ ...pending, value: '' });
        }
        const fieldKeys = [...new Set([field.key, ...(field.keys ?? [])])].filter((key): key is string => !!key);
        // per category the field's own key first (`check_date:surface` before `check_date:smoothness`)
        const own = (line: RelatedTag) => (line.baseKey === field.key ? 0 : 1);
        return lines
            .sort((a, b) => RELATED_CATEGORIES.indexOf(a.category) - RELATED_CATEGORIES.indexOf(b.category) ||
                own(a) - own(b) || compareRelatedTags(a, b))
            .map(line => ({ ...line, fieldTitle: field.title(), fieldKey: field.key ?? '', fieldKeys }));
    }


    /** Keys the title buttons of the field open, from the curated list */
    function buttonKeysOf(field: InspectorField): RelatedButtonKey[] {
        if (field.type === 'mapillaryImages') return [];
        return relatedButtonKeys(RADNETZ_RELATED_BUTTONS, fieldKeysOf(field), field.key, _tags);
    }


    function sideLabel(line: Line) {
        const side = relatedSide(line.baseKey);
        // the field is about this side already (`cycleway:left:width`): no need to repeat it
        if (!side || relatedSide(line.fieldKey) === side) return undefined;
        return t(`inspector.related.side.${side}`);
    }


    /** In a field for several keys (surface & smoothness) a line says which key it is about */
    const namesKey = (line: Line) => line.fieldKeys.length > 1 && !relatedSide(line.baseKey);

    /** `surface` → the title of the schema's `surface` field ("Surface"), else the key */
    function keyTitle(key: string) {
        const field = presetManager.field(key.replace(/:/g, '/')) as unknown as { title?: () => string } | undefined;
        return field?.title?.() ?? key;
    }


    function lineLabel(line: Line) {
        const details: string[] = [];
        const side = sideLabel(line);
        if (side) details.push(side);
        else if (namesKey(line)) details.push(keyTitle(line.baseKey));
        if (line.category === 'mapillary') {
            const parsed = parseMapillaryKey(line.key);
            if (parsed?.trafficSign && !/(^|:)traffic_sign(:|$)/.test(line.baseKey)) details.push(t('inspector.related.traffic_sign'));
            if (parsed?.source) details.push(t('inspector.related.source').toLowerCase());
        }
        const label = t(`inspector.related.${line.category}`);
        return details.length ? `${label} (${details.join(', ')})` : label;
    }


    function editorFor(line: Line) {
        let editor = _editors.get(line.key);
        if (editor) return editor;

        const template = templateFieldIDs(line).map(id => presetManager.field(id)).find(Boolean) as unknown as (Field & { id: string }) | undefined;
        const base = template ? { ...template } : { type: 'text' };
        delete (base as Partial<Field>).prerequisiteTag;
        delete (base as Partial<Field>).keys;
        const field = presetField(template?.id ?? `related/${line.key}`, { ...base, key: line.key } as Field);
        // "Note – Surface" in a field for several keys, else "Source – Width"
        const replacements = namesKey(line)
            ? { category: t(`inspector.related.${line.category}`), field: keyTitle(line.baseKey) }
            : { category: lineLabel(line), field: line.fieldTitle };
        field.title = () => t('inspector.related.editor_label', replacements);
        field.label = () => t.append('inspector.related.editor_label', replacements);

        editor = (uiField as any)(context, field, _entityIDs, { show: true, revert: false, info: false }) as InspectorField;
        editor.on('change', (tagChange: TagsUpdate, onInput: boolean) => {
            // the trash button (or an emptied value) removes the tag: close its editor. An editor that
            // was empty anyway stays open (leaving it, e.g. for another editor's ✕, also reports "removed")
            if (!onInput && tagChange[line.key] === undefined && valueOf(line.key) !== undefined) {
                _expanded.delete(line.key);
                _pending.delete(line.key);
            }
            dispatch.call('change', editor, _entityIDs, tagChange, onInput);
        });
        _editors.set(line.key, editor);
        return editor;
    }


    function toggle(key: string) {
        if (_expanded.has(key)) {
            close(key);
        } else {
            _expanded.add(key);
            _focusKey = key;
        }
        redraw();
    }


    /** Title button: opens the editors of its keys (new ones stay empty until filled), or closes them */
    function toggleCategory(field: InspectorField, category: RelatedCategory, keys: RelatedButtonKey[]) {
        const tagged = (_assigned.get(field.id) ?? []).filter(tag => tag.category === category).map(tag => tag.key);
        const all = [...new Set([...keys.map(key => key.key), ...tagged])];
        if (all.some(key => _expanded.has(key))) {
            for (const key of all) close(key);
        } else {
            for (const key of keys) {
                if (valueOf(key.key) === undefined) _pending.set(key.key, { ...key, fieldID: field.id });
            }
            for (const key of all) _expanded.add(key);
            _focusKey = all[0];
        }
        redraw();
    }


    function close(key: string) {
        _expanded.delete(key);
        _pending.delete(key);   // an added tag without a value goes away again
    }


    /** Buttons in the field title (source, note, check date), before the trash button */
    function drawButtons(formField: d3.Selection<HTMLElement>, field: InspectorField) {
        const keys = buttonKeysOf(field);
        const categories = BUTTON_CATEGORIES
            .map(category => ({ category, keys: keys.filter(key => key.category === category) }))
            .filter(d => d.keys.length);
        const isOpen = (d: { category: RelatedCategory }) =>
            linesOf(field).some(line => line.category === d.category && _expanded.has(line.key));

        let buttons = formField.select('.field-label').selectAll<HTMLButtonElement, typeof categories[number]>('.field-related-toggle')
            .data(categories, d => d.category);
        buttons.exit().remove();
        buttons = buttons.enter()
            .insert('button', '.remove-icon')
            .attr('type', 'button')
            .attr('class', d => `field-related-toggle field-related-toggle-${d.category}`)
            .each(function(d) { d3_select(this).call(svgIcon(BUTTON_ICONS[d.category] ?? '', '')); })
            .merge(buttons)
            .on('click', (d3_event: MouseEvent, d) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                toggleCategory(field, d.category, d.keys);
            });
        buttons
            .classed('active', isOpen)
            .attr('title', d => t(isOpen(d) ? 'inspector.related.close_category' : 'inspector.related.add_category',
                { category: t(`inspector.related.${d.category}`), key: d.keys.map(key => key.key).join(', ') }));
    }


    function drawField(wrap: d3.Selection<HTMLElement>) {
        const field = wrap.datum() as InspectorField;
        const formField = wrap.select<HTMLElement>('.form-field');
        const lines = linesOf(field);
        drawButtons(formField, field);

        let block = formField.selectAll<HTMLDivElement, number>('.field-related')
            .data(lines.length ? [0] : []);
        block.exit().remove();
        const blockEnter = block.enter()
            .append('div')
            .attr('class', 'field-related');
        blockEnter.append('div').attr('class', 'field-related-lines');
        blockEnter.append('div').attr('class', 'field-related-editors');
        // below everything the field draws (also below an open picker, e.g. surface & smoothness)
        block = block.merge(blockEnter).raise();

        // compact lines: "Source: Luftbild 2026 ✎"
        let rows = block.select('.field-related-lines').selectAll<HTMLDivElement, Line>('.field-related-line')
            .data(lines, (d: Line) => d.key);
        rows.exit().remove();
        const rowsEnter = rows.enter()
            .append('div')
            .attr('class', 'field-related-line');
        rowsEnter.append('span').attr('class', 'field-related-label');
        rowsEnter.append('span').attr('class', 'field-related-value');
        rowsEnter.append('button')
            .attr('type', 'button')
            .attr('class', 'field-related-button field-related-show')
            .attr('title', t('inspector.mapillary_images.show_in_viewer'))
            .call(svgIcon('#fas-eye', ''))
            .on('click', (d3_event: MouseEvent, d: Line) => {
                d3_event.preventDefault();
                const id = splitImageIds(d.value)[0];
                if (id) showMapillaryImage(context, id);
            });
        rowsEnter.append('button')
            .attr('type', 'button')
            .attr('class', 'field-related-button field-related-edit')
            .call(svgIcon('#iD-icon-edit', ''))
            .on('click', (d3_event: MouseEvent, d: Line) => {
                d3_event.preventDefault();
                toggle(d.key);
            });
        rows = rows.merge(rowsEnter).order();
        rows.attr('title', (d: Line) => d.value ? `${d.key}=${d.value}` : d.key);
        rows.select('.field-related-label').text((d: Line) => `${lineLabel(d)}:`);
        rows.select('.field-related-value')
            .classed('empty', (d: Line) => !d.value)
            .text((d: Line) => d.value || t('inspector.related.empty'));
        rows.select('.field-related-show')
            .style('display', (d: Line) => d.category === 'mapillary' && d.value ? null : 'none');
        rows.select('.field-related-edit')
            .classed('active', (d: Line) => _expanded.has(d.key))
            .attr('title', (d: Line) => t(_expanded.has(d.key) ? 'inspector.related.close' : 'inspector.related.edit', { key: d.key }));

        // the open editors: full fields in one light box below the lines
        const open = lines.filter(line => _expanded.has(line.key));
        const box = block.select('.field-related-editors').classed('open', open.length > 0);
        let editors = box.selectAll<HTMLDivElement, Line>('.field-related-editor')
            .data(open, (d: Line) => d.key);
        editors.exit().remove();
        editors = editors.enter()
            .append('div')
            // not `wrap-form-field`: the field list's data join would take these as its own and remove them
            .attr('class', 'field-related-editor')
            .merge(editors)
            .order();
        editors.each(function(this: HTMLElement, line: Line) {
            const editor = editorFor(line);
            editor.state(_state).tags(_tags);
            const editorWrap = d3_select(this).call(editor.render);
            editorWrap.select('.field-label').selectAll('.field-related-close')
                .data([0])
                .enter()
                .append('button')
                .attr('type', 'button')
                .attr('class', 'field-related-close')
                .attr('title', t('inspector.related.close', { key: line.key }))
                .call(svgIcon('#iD-icon-close', ''))
                .on('click', (d3_event: MouseEvent) => {
                    d3_event.preventDefault();
                    d3_event.stopPropagation();
                    close(line.key);
                    redraw();
                });
            if (_focusKey === line.key) {
                _focusKey = undefined;
                (this.querySelector('input, textarea') as HTMLElement | null)?.focus();
            }
        });
        for (const key of [..._editors.keys()]) {
            if (!_expanded.has(key)) _editors.delete(key);
        }
    }


    function redraw() {
        if (!_selection) return;
        _selection.selectAll<HTMLElement, InspectorField>('.form-fields-container > .wrap-form-field')
            .each(function(this: HTMLElement) {
                drawField(d3_select(this) as d3.Selection<HTMLElement>);
            });
    }


    return {
        assign,

        /** Draws the lines and editors below the rendered fields in `selection` */
        render(selection: d3.Selection<HTMLElement>) {
            _selection = selection;
            redraw();
        },

        /**
         * Opens the editor of one of `keys` below its field (the TILDA checklist's "add below").
         * Returns the field, or `undefined` when no shown field can take one of the keys.
         */
        reveal(keys: readonly string[], fields: InspectorField[]): InspectorField | undefined {
            for (const field of owners(fields)) {
                const tagged = (_assigned.get(field.id) ?? []).find(tag => keys.includes(tag.key));
                if (tagged) {
                    _expanded.add(tagged.key);
                    _focusKey = tagged.key;
                    return field;
                }
                for (const baseKey of fieldKeysOf(field)) {
                    const addable = ADDABLE_CATEGORIES
                        .map(category => ({ key: newRelatedKey(category, baseKey), category, baseKey }))
                        .find(candidate => keys.includes(candidate.key));
                    if (!addable) continue;
                    _pending.set(addable.key, { ...addable, fieldID: field.id });
                    _expanded.add(addable.key);
                    _focusKey = addable.key;
                    return field;
                }
            }
            return undefined;
        },

        reset
    };
}
