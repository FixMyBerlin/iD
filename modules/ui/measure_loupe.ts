import { select as d3_select } from 'd3-selection';

import type { Vec2 } from '../geo/vector';
import { loupeCenter } from '../measure/loupe_position';

const SIZE = 160;
const ZOOM = 3;
const R = SIZE / 2;


/**
 * Magnifier for the measuring tape: a round div next to the dragged handle that
 * shows the background imagery 3× larger. The dragged end is the center, marked
 * with a crosshair; the tape towards the other end is drawn in the lens as well.
 * The lens is placed where it does not cover the tape (`loupeCenter`).
 *
 * It clones the background layer once at drag start (the map does not move
 * while dragging) and moves the clone with a CSS transform. Without a
 * background layer it does nothing.
 */
export function uiMeasureLoupe(context: iD.Context) {
    let _loupe: d3.Selection<HTMLDivElement> | null = null;
    let _content: HTMLElement | null = null;

    const loupe = {
        /** `at` is the dragged end, `other` the other end, in surface (map) pixels */
        start(at: Vec2, other: Vec2) {
            loupe.end();

            const map = context.container().select<HTMLElement>('.main-map');
            const background = map.select<HTMLElement>('.layer-background').node();
            if (map.empty() || !background) return;

            const content = background.cloneNode(true) as HTMLElement;
            content.classList.add('measure-loupe-image');

            _loupe = map.append('div').attr('class', 'measure-loupe');
            _loupe.append('div').attr('class', 'measure-loupe-lens').node()!.appendChild(content);

            const svg = _loupe.append('svg')
                .attr('class', 'measure-loupe-overlay')
                .attr('width', SIZE)
                .attr('height', SIZE);
            svg.append('line').attr('class', 'measure-loupe-tape');
            // crosshair with a gap, so the measured point itself stays visible
            svg.append('path').attr('class', 'measure-loupe-cross-halo')
                .attr('d', crossPath());
            svg.append('path').attr('class', 'measure-loupe-cross')
                .attr('d', crossPath());
            svg.append('circle').attr('class', 'measure-loupe-dot')
                .attr('cx', R).attr('cy', R).attr('r', 1.5);

            _content = content;
            loupe.move(at, other);
        },

        move(at: Vec2, other: Vec2) {
            if (!_loupe || !_content) return;

            const map = context.container().select<HTMLElement>('.main-map').node();
            const size: Vec2 = [map?.clientWidth ?? 0, map?.clientHeight ?? 0];
            const [cx, cy] = loupeCenter(at, other, size, R);

            _loupe
                .style('left', `${cx - R}px`)
                .style('top', `${cy - R}px`);

            // put the handle's map point in the center of the lens
            d3_select(_content).style(
                'transform',
                `translate(${R}px, ${R}px) scale(${ZOOM}) translate(${-at[0]}px, ${-at[1]}px)`
            );

            // the tape, from the center towards the other end
            _loupe.select('.measure-loupe-tape')
                .attr('x1', R).attr('y1', R)
                .attr('x2', R + (other[0] - at[0]) * ZOOM)
                .attr('y2', R + (other[1] - at[1]) * ZOOM);
        },

        end() {
            if (_loupe) _loupe.remove();
            _loupe = null;
            _content = null;
        },
    };

    return loupe;
}


function crossPath() {
    const gap = 5;
    const arm = 22;
    return `M${R - arm},${R}H${R - gap}M${R + gap},${R}H${R + arm}` +
        `M${R},${R - arm}V${R - gap}M${R},${R + gap}V${R + arm}`;
}
