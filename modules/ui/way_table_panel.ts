import { debounce } from 'es-toolkit';
import { drag as d3_drag } from 'd3-drag';
import { select as d3_select } from 'd3-selection';

import { patchHash } from '../behavior/hash';
import { prefs } from '../core/preferences';
import { geoRawMercator, geoZoomToScale } from '../geo';
import { localizer, t } from '../core/localizer';
import { presetManager } from '../presets';
import { modeSelect } from '../modes/select';
import { svgIcon } from '../svg/icon';
import { utilHighlightEntities, utilStringQs } from '../util/util';
import { utilDisplayLabel } from '../util/utilDisplayLabel';
import type { NodeId, WayId } from '../osm';
import { buildWayChain, swapLeftRightKey, type ChainSegment, type JunctionChoice, type WayChain } from '../way_table/chain';
import { buildTagRows, type TagCell, type TagRow } from '../way_table/tag_rows';
import { uiTooltip } from './tooltip';

const ENABLED_PREF = 'way-table-panel';
/** URL hash parameter: the table is open */
const HASH_KEY = 'way_table';
/** the dock's height in px */
const HEIGHT_PREF = 'way-table-panel-height';
const DEFAULT_HEIGHT_PX = 200;
const MIN_HEIGHT_PX = 80;
/** the dock leaves at least this much of the editor's height to the map */
const MAX_HEIGHT_FRACTION = 0.7;
/** margin around a way that the map flies to */
const FLY_PADDING_PX = 40;


function readHeight(): number {
    const stored = Number(prefs(HEIGHT_PREF));
    return stored >= MIN_HEIGHT_PX ? stored : DEFAULT_HEIGHT_PX;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);


/**
 * The way table: the selected way and its previous and next ways as a table, one row per tag.
 * It is a dock below the map (a child of `.main-content`), so the map gets smaller while it is open.
 * - The height is fixed and stored; drag the top edge to change it. It does not follow the table.
 * - Without a selected way the dock stays open and shows a hint.
 * - Toggle with the `K` key or the button in the bottom corner of the map.
 */
export function uiWayTablePanel(context: iD.Context) {
    let _container: d3.Selection<HTMLDivElement> = d3_select<HTMLDivElement, unknown>(null!);
    // the URL (`way_table=true|false`) wins over the stored state; an open table is written to the URL
    const hashValue = utilStringQs(window.location.hash)[HASH_KEY];
    let _enabled = typeof hashValue === 'string' ? hashValue !== 'false' && hashValue !== '0' : prefs(ENABLED_PREF) === 'true';
    patchHash({ [HASH_KEY]: _enabled ? 'true' : null });
    let _height = readHeight();
    /** chosen way per ambiguous junction node, reset when the selection leaves the chain */
    let _junctionChoices = new Map<NodeId, WayId>();
    let _chain: WayChain | undefined;


    function selectedWayID(): WayId | undefined {
        const ids = context.selectedIDs();
        return ids.length === 1 && ids[0].startsWith('w') ? ids[0] as WayId : undefined;
    }


    function presetKeys(wayID: WayId) {
        const graph = context.graph();
        const entity = graph.entity(wayID);
        const preset = presetManager.match(entity, graph);
        const keys = new Set(Object.keys(preset.tags ?? {}));
        for (const field of [...preset.fields(), ...preset.moreFields()]) {
            if (field.key) keys.add(field.key);
            for (const key of field.keys ?? []) keys.add(key);
        }
        return keys;
    }


    function segmentLabel(segment: ChainSegment) {
        const entity = context.hasEntity(segment.wayID);
        return (entity && utilDisplayLabel(entity, context.graph())) || segment.wayID;
    }


    function content() {
        return context.container().select<HTMLDivElement>('.main-content');
    }


    /** The dock's height and the matching map height; `resize` tells the map about its new size */
    function applyLayout(resize = true) {
        const available = content().node()?.clientHeight || 0;
        const max = Math.max(MIN_HEIGHT_PX, available * MAX_HEIGHT_FRACTION);
        const height = _enabled ? Math.round(clamp(_height, MIN_HEIGHT_PX, max)) : 0;

        _container
            .classed('hide', !_enabled)
            .style('height', `${height}px`);
        // `.main-map` is positioned absolutely, so it does not shrink on its own (see the CSS)
        content().style('--way-table-height', `${height}px`);
        context.container().select('.way-table-control button')
            .classed('active', _enabled);

        if (resize) (context.ui() as { onResize?: () => void }).onResize?.();
    }


    /** Drag the top edge to change the height */
    function resizeBehavior() {
        let startHeight: number;
        let startY: number;
        // screen coordinates: the dock (d3-drag's default reference) moves while it is resized
        type DragEvent = { sourceEvent: MouseEvent | TouchEvent };
        const clientY = (d3_event: DragEvent) => {
            const source = d3_event.sourceEvent;
            return 'clientY' in source ? source.clientY : (source.touches[0] ?? source.changedTouches[0]).clientY;
        };
        return d3_drag<HTMLDivElement, unknown>()
            .on('start', (d3_event: DragEvent) => {
                startHeight = _container.node()!.offsetHeight;
                startY = clientY(d3_event);
            })
            .on('drag', (d3_event: DragEvent) => {
                _height = Math.max(MIN_HEIGHT_PX, startHeight - (clientY(d3_event) - startY));
                applyLayout();
            })
            .on('end', () => {
                // what the limits allowed
                _height = _container.node()!.offsetHeight;
                prefs(HEIGHT_PREF, String(_height));
            });
    }


    /**
     * Pan (and zoom out if needed) so the way is centered in the part of the map
     * that is not covered by the top bar.
     */
    function flyTo(wayID: WayId) {
        const entity = context.hasEntity(wayID);
        const overMap = context.container().select<HTMLDivElement>('.over-map').node();
        if (!entity || !overMap) return;

        // the map surface runs under the top bar; measure the free area in its pixels
        const map = context.map();
        const [width, height] = map.dimensions() as [number, number];
        const surface = context.surfaceRect();
        const area = overMap.getBoundingClientRect();
        const visible = {
            left: area.left - surface.left,
            right: area.right - surface.left,
            top: area.top - surface.top,
            bottom: area.bottom - surface.top
        };

        const extent = entity.extent(context.graph());
        const zoom = map.zoom() as number;
        const projection = geoRawMercator().scale(geoZoomToScale(zoom)).translate([0, 0]);
        const [x0, y1] = projection(extent[0]);
        const [x1, y0] = projection(extent[1]);
        const fit = Math.min(
            (visible.right - visible.left - 2 * FLY_PADDING_PX) / Math.max(x1 - x0, 1),
            (visible.bottom - visible.top - 2 * FLY_PADDING_PX) / Math.max(y1 - y0, 1)
        );
        const newZoom = fit < 1 ? Math.max(zoom + Math.log2(fit), context.minEditableZoom()) : zoom;

        // the map center is where the way's center must be, shifted by the offset of the visible center
        projection.scale(geoZoomToScale(newZoom));
        const [cx, cy] = projection(extent.center());
        const offsetX = width / 2 - (visible.left + visible.right) / 2;
        const offsetY = height / 2 - (visible.top + visible.bottom) / 2;
        map.centerZoomEase(projection.invert([cx + offsetX, cy + offsetY]), newZoom, 350);
    }


    function selectWay(wayID: WayId | undefined) {
        if (!wayID) return;
        utilHighlightEntities([wayID], false, context);
        context.enter(modeSelect(context, [wayID]));
        flyTo(wayID);
    }


    function highlight(wayID: WayId | undefined, highlighted: boolean) {
        if (wayID) utilHighlightEntities([wayID], highlighted, context);
    }


    function neighborID(offset: -1 | 1) {
        return _chain?.segments[_chain.centerIndex + offset]?.wayID;
    }


    /** Renders the dock into `.main-content`, below the map */
    function wayTablePanel(selection: d3.Selection) {
        _container = selection.selectAll<HTMLDivElement, number>('.way-table-panel')
            .data([0]);

        const enter = _container.enter()
            .append('div')
            .attr('class', 'way-table-panel fillD');

        enter
            .append('div')
            .attr('class', 'way-table-resize')
            .call(resizeBehavior());

        enter
            .append('div')
            .attr('class', 'way-table-empty')
            .call(t.append('way_table.empty'));

        enter
            .append('div')
            .attr('class', 'way-table-body');

        _container = _container.merge(enter);
        // the map gets its size right after the UI is built (`ui.onResize()` in `ui/init.js`)
        applyLayout(false);
        redraw();
    }


    /** The button in the bottom corner of the map that opens and closes the dock */
    wayTablePanel.renderToggleButton = function(selection: d3.Selection) {
        selection
            .append('button')
            .attr('aria-label', t('way_table.title'))
            .classed('active', _enabled)
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                wayTablePanel.toggle();
            })
            .call(svgIcon('#iD-icon-sidebar-left', 'light'))
            .call((uiTooltip() as any)
                .placement(localizer.textDirection() === 'rtl' ? 'right' : 'left')
                .heading(() => t.append('way_table.title'))
                .title(() => t.append('way_table.tooltip'))
                .keys([t('way_table.key')])
                .scrollContainer(context.container().select('.over-map'))
            );
    };


    function redraw() {
        if (_container.empty() || !_enabled) return;

        const wayID = selectedWayID();
        if (wayID) {
            if (_chain && !_chain.segments.some(segment => segment.wayID === wayID)) {
                _junctionChoices = new Map();
            }
            // in the direction of the selected way: the ways before it on the left, the next ones on the right
            _chain = buildWayChain(context.graph(), wayID, undefined, _junctionChoices);
        } else {
            _chain = undefined;
        }

        _container.select('.way-table-empty').classed('hide', !!_chain);
        const body = _container.select<HTMLDivElement>('.way-table-body')
            .classed('hide', !_chain);
        if (!_chain || !wayID) return;

        const chain = _chain;
        const rows = buildTagRows(chain, presetKeys(wayID), removedKeys(chain));

        drawJunctions(body, chain.junctions);
        drawTable(body, chain, rows);
        scrollToCenter(body);
    }


    /** Keys of tags that were removed from a way in this session, in chain direction: they keep their row */
    function removedKeys(chain: WayChain) {
        const base = context.history().base();
        const graph = context.graph();
        return chain.segments.flatMap(segment => {
            const before = base.hasEntity(segment.wayID);
            const now = graph.hasEntity(segment.wayID);
            if (!before || !now) return [];
            return Object.keys(before.tags)
                .filter(key => !(key in now.tags))
                .map(key => segment.reversed ? swapLeftRightKey(key) : key);
        });
    }


    /** Scroll sideways so the selected way's column is in the middle */
    function scrollToCenter(body: d3.Selection<HTMLDivElement>) {
        const bodyNode = body.node();
        const centerNode = body.select<HTMLTableCellElement>('thead th.center').node();
        const keyNode = body.select<HTMLTableCellElement>('thead th.way-table-key-header').node();
        if (!bodyNode || !centerNode || !keyNode) return;

        // the sticky key column covers the left part of the visible area
        const visibleWidth = bodyNode.clientWidth - keyNode.offsetWidth;
        bodyNode.scrollLeft = centerNode.offsetLeft - keyNode.offsetWidth - (visibleWidth - centerNode.offsetWidth) / 2;
    }


    function drawJunctions(body: d3.Selection<HTMLDivElement>, junctions: JunctionChoice[]) {
        let junctionList = body.selectAll<HTMLDivElement, JunctionChoice>('.way-table-junction')
            .data(junctions, d => `${d.direction}-${d.nodeID}`);

        junctionList.exit()
            .remove();

        const junctionEnter = junctionList.enter()
            .insert('div', ':first-child')
            .attr('class', 'way-table-junction');

        junctionEnter
            .append('span')
            .attr('class', 'way-table-junction-label');

        junctionList = junctionList.merge(junctionEnter);

        junctionList.select('.way-table-junction-label')
            .text(d => t(d.direction === 'forward' ? 'way_table.junction.forward' : 'way_table.junction.backward'));

        const buttons = junctionList.selectAll<HTMLButtonElement, ChainSegment>('button')
            .data(d => d.candidates, d => d.wayID);

        buttons.exit()
            .remove();

        buttons.enter()
            .append('button')
            .attr('class', 'way-table-junction-choice')
            .on('click', function(_d3_event: MouseEvent, d: ChainSegment) {
                const junction = d3_select(this.parentElement).datum() as JunctionChoice;
                _junctionChoices.set(junction.nodeID, d.wayID);
                highlight(d.wayID, false);
                redraw();
            })
            .on('pointerenter', (_d3_event: PointerEvent, d: ChainSegment) => highlight(d.wayID, true))
            .on('pointerleave', (_d3_event: PointerEvent, d: ChainSegment) => highlight(d.wayID, false))
            .merge(buttons)
            // same-named ways are common at a junction, so the id tells them apart
            .text(d => `${segmentLabel(d)} ${d.wayID}`);
    }


    /** Previous / next way, in the table's corner cell */
    function drawNavigation(selection: d3.Selection<HTMLTableCellElement>) {
        const nav = selection
            .append('div')
            .attr('class', 'way-table-nav');

        for (const [offset, icon, label] of [[-1, '#iD-icon-backward', 'way_table.previous'], [1, '#iD-icon-forward', 'way_table.next']] as const) {
            nav
                .append('button')
                .attr('class', `way-table-${offset < 0 ? 'previous' : 'next'}`)
                .attr('title', t(label))
                .property('disabled', !neighborID(offset))
                .on('click', () => selectWay(neighborID(offset)))
                .on('pointerenter', () => highlight(neighborID(offset), true))
                .on('pointerleave', () => highlight(neighborID(offset), false))
                .call(svgIcon(icon, ''));
        }
    }


    function drawTable(body: d3.Selection<HTMLDivElement>, chain: WayChain, rows: TagRow[]) {
        let table = body.selectAll<HTMLTableElement, number>('table')
            .data([0]);

        const tableEnter = table.enter()
            .append('table')
            .attr('class', 'way-table');

        tableEnter.append('thead').append('tr');
        tableEnter.append('tbody');

        table = table.merge(tableEnter);

        // header: one column per way
        const headerData: (ChainSegment | null)[] = [null, ...chain.segments];
        const headerCells = table.select('thead tr')
            .selectAll<HTMLTableCellElement, ChainSegment | null>('th')
            .data(headerData);

        headerCells.exit()
            .remove();

        headerCells.enter()
            .append('th')
            .merge(headerCells)
            .attr('class', (d, i) => {
                if (!d) return 'way-table-key-header';
                return [
                    'way-table-way',
                    i - 1 === chain.centerIndex ? 'center' : '',
                    d.reversed ? 'reversed' : ''
                ].filter(Boolean).join(' ');
            })
            .each(function(d) {
                const th = d3_select(this).text('');
                if (!d) {
                    th.call(drawNavigation);
                    return;
                }
                // name and way id; the whole cell selects the way and highlights it on the map
                const title = th
                    .append('div')
                    .attr('class', 'way-table-way-title')
                    .attr('title', d.reversed ? t('way_table.reversed') : null);
                title
                    .append('span')
                    .attr('class', 'way-table-way-name')
                    .text(`${segmentLabel(d)}${d.reversed ? ' ⇄' : ''}`);
                title
                    .append('span')
                    .attr('class', 'way-table-way-id')
                    .text(d.wayID);
            })
            .attr('role', d => d ? 'button' : null)
            .attr('tabindex', (d, i) => d && i - 1 !== chain.centerIndex ? 0 : null)
            .on('click', (_d3_event: MouseEvent, d) => {
                if (d && d.wayID !== chain.segments[chain.centerIndex]?.wayID) selectWay(d.wayID);
            })
            .on('keydown', (d3_event: KeyboardEvent, d) => {
                if (d && d3_event.key === 'Enter' && d.wayID !== chain.segments[chain.centerIndex]?.wayID) selectWay(d.wayID);
            })
            .on('pointerenter', (_d3_event: PointerEvent, d) => highlight(d?.wayID, true))
            .on('pointerleave', (_d3_event: PointerEvent, d) => highlight(d?.wayID, false));

        // rows: one per tag key
        let tagRows = table.select('tbody')
            .selectAll<HTMLTableRowElement, TagRow>('tr')
            .data(rows, d => d.key);

        tagRows.exit()
            .remove();

        const tagRowsEnter = tagRows.enter()
            .append('tr');

        tagRowsEnter
            .append('th')
            .attr('class', 'way-table-key');

        // changed in this mapping session: the tag differs from the downloaded way
        const base = context.history().base();
        const graph = context.graph();
        const isEdited = (key: string, columnIndex: number) => {
            const segment = chain.segments[columnIndex];
            const before = base.hasEntity(segment.wayID);
            const now = graph.hasEntity(segment.wayID);
            if (!before || !now) return false;   // a new way: nothing to compare with
            // the table shows a reversed way in chain direction, its own keys have left and right swapped
            const ownKey = segment.reversed ? swapLeftRightKey(key) : key;
            return before.tags[ownKey] !== now.tags[ownKey];
        };

        tagRows = tagRows.merge(tagRowsEnter)
            .order()
            .classed('preset-key', d => d.isPresetKey)
            .classed('differs', d => d.differs)
            .classed('edited', d => d.cells.some((_cell, i) => isEdited(d.key, i)));

        tagRows.select('.way-table-key')
            .text(d => d.key);

        const cells = tagRows.selectAll<HTMLTableCellElement, TagCell>('td')
            .data(d => d.cells);

        cells.exit()
            .remove();

        cells.enter()
            .append('td')
            .merge(cells)
            .attr('class', (d, i) => `way-table-value ${d.status}${i === chain.centerIndex ? ' center' : ''}`)
            .classed('edited', function(_d, i) {
                const row = d3_select<Element, TagRow>(this.parentElement!).datum();
                return isEdited(row.key, i);
            })
            .attr('title', function(_d, i) {
                const row = d3_select<Element, TagRow>(this.parentElement!).datum();
                return isEdited(row.key, i) ? t('way_table.edited') : null;
            })
            .text(d => d.value ?? '');
    }


    const debouncedRedraw = debounce(redraw, 100);

    wayTablePanel.enabled = () => _enabled;

    wayTablePanel.toggle = function(enabled?: boolean) {
        _enabled = enabled ?? !_enabled;
        prefs(ENABLED_PREF, String(_enabled));
        patchHash({ [HASH_KEY]: _enabled ? 'true' : null });
        if (!_enabled && _chain) {
            for (const segment of _chain.segments) highlight(segment.wayID, false);
        }
        applyLayout();
        redraw();
        return wayTablePanel;
    };

    // the editor got a new height: the dock may have to shrink
    d3_select(window).on('resize.wayTablePanel', () => {
        if (_enabled) applyLayout();
    });

    context.on('enter.wayTablePanel', redraw);
    context.history()
        .on('change.wayTablePanel', debouncedRedraw)
        .on('merge.wayTablePanel', debouncedRedraw);   // neighbors may load after the selection

    context.keybinding()
        .on(t('way_table.key'), (d3_event: KeyboardEvent) => {
            d3_event.stopImmediatePropagation();
            d3_event.preventDefault();
            wayTablePanel.toggle();
        }, false);

    return wayTablePanel;
}
