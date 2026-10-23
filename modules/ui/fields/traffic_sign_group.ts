import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { geoWayDominantHeadingInViewport, geoWayStraightnessInViewport } from '../../geo';
import { DIRECTIONAL_COMBO_ARROW_UP_PATH, DIRECTIONAL_COMBO_ARROW_VIEWBOX } from '../../svg/directional_combo_arrow';
import { presetField } from '../../presets/field';
import { TRAFFIC_SIGN_FIELD_TYPE, WAY_SIGN_KEYS } from '../../presets/traffic_sign_fields';
import {
    mergeWaySigns, signRows, waySignChanges, waySigns, type SignGroup, type SignRow, type WaySigns
} from '../../traffic_sign/sign_field_rows';
import { utilRebind } from '../../util';
import { uiFieldTrafficSign } from './traffic_sign';
import type { Field } from '@openstreetmap/id-tagging-schema';

/**
 * A traffic sign field with one row per key (WORKDOC feature 27): the way's sign with its
 * directions, or the signs of the bike lanes / sidewalks per side. Each row is the traffic sign
 * field of its key, with its tag suggestions.
 *
 * The way's field always shows the sign of the whole way (`traffic_sign`); the switch "Per
 * direction" in its label adds the rows for `:forward` and `:backward`. Direction signs that say
 * the same as the whole way are shown merged into it (`mergeWaySigns`); the tags follow with the
 * next change of the whole way's sign.
 */
export function uiFieldTrafficSignGroup(field: { key: string; signGroup?: SignGroup }, context: iD.Context) {
    const dispatch = d3_dispatch('change');
    const group: SignGroup = field.signGroup ?? 'way';
    const rowFields = new Map<string, ReturnType<typeof uiFieldTrafficSign>>();
    /** the switch as the user set it while this feature is selected; `undefined`: follow the tags */
    let _showDirections: boolean | undefined;
    let _tags: TagsMulti = {};
    let _entityIDs: string[] = [];
    let _selection: d3.Selection | null = null;


    function fieldForRow(key: string) {
        if (!rowFields.has(key)) {
            const data = { key, type: TRAFFIC_SIGN_FIELD_TYPE, label: key, snake_case: false, caseSensitive: true } as unknown as Field;
            const instance = uiFieldTrafficSign(presetField(`traffic_sign/${key.replace(/:/g, '_')}`, data), context);
            instance.on('change', (tags: TagsUpdate, onInput?: boolean) => dispatch.call('change', trafficSignGroup, rowChange(key, tags), onInput));
            instance.entityIDs(_entityIDs);
            rowFields.set(key, instance);
        }
        return rowFields.get(key)!;
    }


    function rowLabel(row: SignRow): string {
        const parts: string[] = [];
        if (row.side) parts.push(t(`inspector.traffic_sign_group.side.${row.side}`));
        if (row.direction) parts.push(t(`inspector.traffic_sign_group.direction.${row.direction}`));
        // the way's plain sign next to its directions
        else if (!row.side && group === 'way') parts.push(t('inspector.traffic_sign_group.direction.both'));
        return parts.join(' ');
    }


    function isTagged(key: string) {
        const value = _tags[key];
        return Array.isArray(value) || (typeof value === 'string' && value !== '');
    }


    /**
     * What the way's field shows. The tags as they are once the user switched the directions on
     * (so signs can be built up per direction) and for a multiselection with different values;
     * else merged.
     */
    function wayState() {
        const multiple = WAY_SIGN_KEYS.some(key => Array.isArray(_tags[key]));
        const merged = !multiple && _showDirections !== true;
        const signs: WaySigns = merged ? mergeWaySigns(waySigns(_tags)) : waySigns(_tags);
        const directionsTagged = merged
            ? !!(signs.forward || signs.backward)
            : isTagged('traffic_sign:forward') || isTagged('traffic_sign:backward');
        // tagged directions are always shown: the switch is locked on
        return { merged, signs, directions: directionsTagged || _showDirections === true, locked: directionsTagged };
    }


    /** The tags a row field reads: the merged signs for the way's rows */
    function rowTags(): TagsMulti {
        if (group !== 'way') return _tags;
        const state = wayState();
        if (!state.merged) return _tags;
        const tags = { ..._tags };
        delete tags['traffic_sign:forward'];
        delete tags['traffic_sign:backward'];
        delete tags.traffic_sign;
        if (state.signs.whole) tags.traffic_sign = state.signs.whole;
        if (state.signs.forward) tags['traffic_sign:forward'] = state.signs.forward;
        if (state.signs.backward) tags['traffic_sign:backward'] = state.signs.backward;
        return tags;
    }


    /** A change of a row, plus the tags that bring a merged display into the tags */
    function rowChange(key: string, change: TagsUpdate): TagsUpdate {
        if (group !== 'way') return change;
        if (key !== 'traffic_sign') {
            // from now on the directions are edited as tagged: equal signs are not merged away
            // while the user builds them up
            _showDirections = true;
            return change;
        }
        const state = wayState();
        if (!state.merged || !('traffic_sign' in change)) return change;
        const whole = typeof change.traffic_sign === 'string' && change.traffic_sign !== '' ? change.traffic_sign : undefined;
        return { ...change, ...waySignChanges(_tags, { ...state.signs, whole }) };
    }


    function wayRows(): SignRow[] {
        const state = wayState();
        const rows: SignRow[] = [{ key: 'traffic_sign' }];
        if (state.directions) {
            rows.push({ key: 'traffic_sign:forward', direction: 'forward' });
            rows.push({ key: 'traffic_sign:backward', direction: 'backward' });
        }
        return rows;
    }


    /** Only ways have directions; other features get the switches when a direction is tagged */
    function hasToggles() {
        if (group !== 'way') return false;
        return wayState().locked || (_entityIDs.length > 0 && _entityIDs.every(id => id.startsWith('w')));
    }


    /** The switch "Per direction" in the field's label */
    function renderToggle() {
        const label = _selection!.select<HTMLElement>('.field-label');
        if (label.empty()) return;

        const state = group === 'way' && hasToggles() ? wayState() : undefined;
        const toggle = label.selectAll<HTMLButtonElement, number>('.traffic-sign-toggle')
            .data(state ? [0] : []);
        toggle.exit().remove();
        if (!state) return;

        toggle.enter()
            .insert('button', 'button')
            .attr('type', 'button')
            .attr('class', 'traffic-sign-toggle sidebar-toggle')
            .text(t('inspector.traffic_sign_group.toggle.directions'))
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                const now = wayState();
                if (now.locked) return;
                _showDirections = !now.directions;
                render();
            })
            .merge(toggle)
            .classed('active', state.directions)
            .classed('locked', state.locked)
            .attr('aria-pressed', String(state.directions))
            .attr('title', t(`inspector.traffic_sign_group.toggle.${state.locked ? 'directions_locked_tooltip' : 'directions_tooltip'}`));
    }


    /**
     * The arrows in the direction labels point along the way as it is on the map, like the side
     * arrows of the directional combo fields. Hidden while the visible part of the way is too curved.
     */
    function updateArrows() {
        if (!_selection || group !== 'way') return;
        const arrows = _selection.selectAll<SVGSVGElement, SignRow>('.traffic-sign-group-arrow');
        if (arrows.empty()) return;

        const graph = context.graph();
        const entity = _entityIDs.length === 1 ? graph.hasEntity(_entityIDs[0] as iD.OsmWay['id']) as iD.OsmWay | undefined : undefined;
        let heading: number | undefined;
        if (entity && entity.type === 'way' && entity.geometry(graph) === 'line') {
            const nodes = graph.childNodes(entity);
            if (nodes.length > 1 && geoWayStraightnessInViewport(context.projection, nodes, entity.isClosed()).isStraightEnough) {
                heading = geoWayDominantHeadingInViewport(context.projection, nodes, entity.isClosed())?.headingDeg;
            }
        }
        // the glyph points up; a heading of 0° runs to the right
        arrows
            .classed('hide', heading === undefined)
            .style('transform', d => heading === undefined ? null : `rotate(${heading + (d.direction === 'backward' ? 270 : 90)}deg)`);
    }


    function render() {
        if (!_selection) return;
        const rows = group === 'way' ? wayRows() : signRows(_tags, group);
        const labelled = rows.length > 1 || group !== 'way' || rows[0]?.key !== 'traffic_sign';
        const tags = rowTags();

        renderToggle();

        let list = _selection.selectAll<HTMLDivElement, number>('.traffic-sign-group-rows').data([0]);
        list = list.enter().append('div').attr('class', 'traffic-sign-group-rows').merge(list);

        const items = list.selectAll<HTMLDivElement, SignRow>('.traffic-sign-group-row')
            .data(rows, d => d.key);
        items.exit().remove();
        const enter = items.enter()
            .append('div')
            .attr('class', 'traffic-sign-group-row');
        enter.append('div').attr('class', 'traffic-sign-group-label');
        enter.append('div').attr('class', 'traffic-sign-group-input');

        const all = enter.merge(items).order();
        all.select<HTMLDivElement>('.traffic-sign-group-label')
            .classed('hide', d => !labelled || !rowLabel(d))
            .each(function(d) {
                const label = d3_select(this).text(labelled ? rowLabel(d) : '');
                if (!labelled || !d.direction || group !== 'way') return;
                label.append('svg')
                    .datum(d)
                    .attr('class', 'traffic-sign-group-arrow')
                    .attr('viewBox', DIRECTIONAL_COMBO_ARROW_VIEWBOX)
                    .attr('aria-hidden', 'true')
                    .append('path')
                    .attr('d', DIRECTIONAL_COMBO_ARROW_UP_PATH);
            });
        all.select<HTMLDivElement>('.traffic-sign-group-input')
            .each(function(d) {
                const instance = fieldForRow(d.key);
                instance.tags(tags);
                d3_select<HTMLElement, unknown>(this).call(instance as unknown as (selection: d3.Selection) => void);
            });

        updateArrows();
    }


    function trafficSignGroup(selection: d3.Selection) {
        _selection = selection;
        if (group === 'way') context.map().on('move.trafficSignGroup', updateArrows);
        render();
    }


    trafficSignGroup.tags = function(tags: TagsMulti) {
        _tags = tags;
        render();
        return trafficSignGroup;
    };


    trafficSignGroup.entityIDs = function(val?: string[]) {
        if (val === undefined) return _entityIDs;
        if (val.join() !== _entityIDs.join()) {
            _showDirections = undefined;
        }
        _entityIDs = val;
        for (const instance of rowFields.values()) instance.entityIDs(val);
        return trafficSignGroup;
    };


    trafficSignGroup.focus = function() {
        rowFields.values().next().value?.focus();
        return trafficSignGroup;
    };


    return utilRebind(trafficSignGroup, dispatch, 'on');
}

