import { select as d3_select } from 'd3-selection';
import { drag as d3_drag } from 'd3-drag';

import { presetManager } from '../../presets';
import { isValidShortcut, presetFavorites } from '../../core/preset_favorites';
import { t } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { svgIcon } from '../../svg/icon';
import { uiPresetIcon } from '../preset_icon';
import { utilNoAuto } from '../../util';

const GEOMETRY_ICONS: Record<string, string> = {
    point: '#iD-icon-point',
    line: '#iD-icon-line',
    area: '#iD-icon-area',
    vertex: '#iD-icon-vertex',
    relation: '#iD-icon-relation'
};

/** Minimal drag distance in px before a row counts as dragged */
const DRAG_THRESHOLD = 5;

/**
 * Renders the favorites in the preferences pane.
 * Each row shows the preset and an input for its shortcut.
 * Rows can be dragged to change the display order, which does not change shortcuts.
 */
export function renderFavoritesList(
    container: d3.Selection<HTMLOListElement>,
    favorites: string[],
    onRemove: (presetId: string) => void
) {
    let items = container.selectAll<HTMLLIElement, string>('.favorite-presets-item')
        .data(favorites, d => d);

    items.exit()
        .remove();

    const itemsEnter = items.enter()
        .append('li')
        .attr('class', 'favorite-presets-item');

    itemsEnter
        .append('nav')
        .attr('class', 'drag-indicator')
        .call(svgIcon('#iD-operation-move', 'inline operation'));

    itemsEnter
        .append('figure')
        .attr('class', 'preset-icon-wrapper');

    itemsEnter
        .append('h4')
        .attr('class', 'preset-name');

    const rightGroupEnter = itemsEnter
        .append('div')
        .attr('class', 'preset-right-group');

    rightGroupEnter
        .append('ul')
        .attr('class', 'preset-geometries');

    rightGroupEnter
        .append('input')
        .attr('type', 'text')
        .attr('class', 'favorite-shortcut')
        .attr('inputmode', 'numeric')
        .attr('maxlength', 3)
        .attr('aria-label', t('preferences.favorite_presets.shortcut_label'))
        .call(utilNoAuto)
        .on('input', shortcutInput)
        .on('change', shortcutChange);

    rightGroupEnter
        .append('button')
        .attr('class', 'favorite-remove')
        .on('click', (d3_event: MouseEvent, presetId: string) => {
            d3_event.stopPropagation();
            onRemove(presetId);
        })
        .call(svgIcon('#iD-operation-delete', ''))
        .call((uiTooltip() as any)
            .title(() => t.append('preferences.favorite_presets.remove_tooltip'))
            .placement('bottom')
        );

    items = items.merge(itemsEnter)
        .order();

    items.select<HTMLElement>('.preset-icon-wrapper')
        .each(function(presetId) {
            const preset = presetManager.item(presetId);
            if (!preset) return;
            d3_select(this)
                .call(uiPresetIcon()
                    .geometry(preset.geometry[0])
                    .preset(preset)
                );
        });

    items.select<HTMLElement>('.preset-name')
        .each(function(presetId) {
            const selection = d3_select(this).text('');
            const preset = presetManager.item(presetId);
            if (preset) {
                preset.nameLabel()(selection);
            } else {
                selection.text(presetId);
            }
        });

    items.select<HTMLUListElement>('.preset-geometries')
        .each(function(presetId) {
            const geometries: string[] = presetManager.item(presetId)?.geometry ?? [];
            const icons = d3_select(this)
                .selectAll<HTMLLIElement, string>('li')
                .data(geometries.filter(geometry => GEOMETRY_ICONS[geometry]));

            icons.exit()
                .remove();

            icons.enter()
                .append('li')
                .merge(icons)
                .each(function(geometry) {
                    d3_select(this)
                        .text('')
                        .call(svgIcon(GEOMETRY_ICONS[geometry], ''));
                });
        });

    items.select<HTMLInputElement>('.favorite-shortcut')
        .classed('invalid', false)
        .property('value', presetId => presetFavorites.getShortcut(presetId) ?? '');

    items.call(d3_drag<HTMLLIElement, string>()
        .filter(d3_event => !(d3_event.target as Element).closest('input, button'))
        .on('start', dragStart)
        .on('drag', dragMove)
        .on('end', dragEnd)
    );


    function shortcutInput(this: HTMLInputElement) {
        this.value = this.value.replace(/[^0-9]/g, '');
        d3_select(this)
            .classed('invalid', this.value !== '' && !isValidShortcut(this.value));
    }

    function shortcutChange(this: HTMLInputElement, d3_event: Event, presetId: string) {
        const shortcut = this.value;
        if (!isValidShortcut(shortcut)) {
            // restore the stored shortcut
            this.value = presetFavorites.getShortcut(presetId) ?? '';
            d3_select(this).classed('invalid', false);
            return;
        }

        // A shortcut used by another favorite is swapped, see `presetFavorites.setShortcut`
        presetFavorites.setShortcut(presetId, shortcut);
    }


    let _dragOrigin: { x: number, y: number } | undefined;
    let _targetIndex: number | undefined;

    function dragStart(d3_event: { x: number, y: number }) {
        _dragOrigin = { x: d3_event.x, y: d3_event.y };
        _targetIndex = undefined;
    }

    function dragMove(this: HTMLLIElement, d3_event: { x: number, y: number }) {
        if (!_dragOrigin) return;

        const x = d3_event.x - _dragOrigin.x;
        const y = d3_event.y - _dragOrigin.y;
        const row = d3_select(this);

        if (!row.classed('dragging') && Math.hypot(x, y) <= DRAG_THRESHOLD) return;

        const index = items.nodes().indexOf(this);
        row.classed('dragging', true);
        _targetIndex = undefined;

        items.style('transform', function(_d, index2) {
            if (index2 === index) {
                return `translate(${x}px, ${y}px)`;
            }
            if (index2 > index && d3_event.y > this.offsetTop) {
                if (_targetIndex === undefined || index2 > _targetIndex) _targetIndex = index2;
                return 'translateY(-100%)';
            }
            if (index2 < index && d3_event.y < this.offsetTop + this.offsetHeight) {
                if (_targetIndex === undefined || index2 < _targetIndex) _targetIndex = index2;
                return 'translateY(100%)';
            }
            return null;
        });
    }

    function dragEnd(this: HTMLLIElement) {
        const row = d3_select(this);
        if (!row.classed('dragging')) return;

        const index = items.nodes().indexOf(this);
        row.classed('dragging', false);
        items.style('transform', null);

        if (_targetIndex === undefined || _targetIndex === index) return;

        const newOrder = [...favorites];
        const [moved] = newOrder.splice(index, 1);
        newOrder.splice(_targetIndex, 0, moved);
        presetFavorites.reorder(newOrder);
    }
}
