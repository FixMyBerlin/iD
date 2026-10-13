import type { Dispatch } from 'd3-dispatch';
import { drag as d3_drag } from 'd3-drag';

import type { Projection } from '../geo/raw_mercator';
import type { Vec2 } from '../geo/vector';
import { formatTapeLabel, tapeLength, type TapeEnds } from '../measure/initial_tape';
import { measureTape } from '../measure/measure_tape';
import { uiMeasureLoupe } from '../ui/measure_loupe';

type Handle = 'a' | 'b' | 'both';

/** Radius of the ring and of the invisible hit area around it, in px */
const RING_RADIUS = 9;
const HIT_RADIUS = 24;
const CROSS = 4;


/**
 * Draws the measuring tape (feature 21): a line with a ring + crosshair handle
 * at both ends and the length as a label. Ends can be dragged; dragging the
 * line moves the whole tape.
 */
export function svgMeasureTape(projection: Projection, context: iD.Context, dispatch: Dispatch<object>) {
    measureTape.on('change.svgMeasureTape', () => dispatch.call('change'));

    const loupe = uiMeasureLoupe(context);
    let _dragStart: { ends: Vec2[]; pointer: Vec2 } | null = null;


    function project(ends: TapeEnds): [Vec2, Vec2] {
        return [projection(ends[0]), projection(ends[1])];
    }

    function handlePoint(handle: 'a' | 'b'): Vec2 {
        const state = measureTape.state()!;
        return projection(state.ends[handle === 'a' ? 0 : 1]);
    }


    const behavior = d3_drag<SVGElement, Handle>()
        .subject((d3_event, d) => {
            // no tape anymore (it ended with this very press): nothing to drag, but do not throw
            if (d === 'both' || !measureTape.state()) return { x: d3_event.x, y: d3_event.y };
            const [x, y] = handlePoint(d);
            return { x, y };
        })
        .on('start', (d3_event, d) => {
            d3_event.sourceEvent?.stopPropagation();
            const state = measureTape.state();
            if (!state) return;

            _dragStart = { ends: project(state.ends), pointer: [d3_event.x, d3_event.y] };
            measureTape.setEnds(state.ends, true);
            if (d !== 'both') loupe.start(handlePoint(d), handlePoint(d === 'a' ? 'b' : 'a'));
        })
        .on('drag', (d3_event, d) => {
            d3_event.sourceEvent?.stopPropagation();
            const state = measureTape.state();
            if (!state || !_dragStart) return;

            const [a, b] = _dragStart.ends;
            const point: Vec2 = [d3_event.x, d3_event.y];
            let ends: TapeEnds;
            if (d === 'both') {
                const dx = point[0] - _dragStart.pointer[0];
                const dy = point[1] - _dragStart.pointer[1];
                ends = [
                    projection.invert([a[0] + dx, a[1] + dy]),
                    projection.invert([b[0] + dx, b[1] + dy])
                ];
            } else {
                const moved = projection.invert(point);
                ends = d === 'a' ? [moved, state.ends[1]] : [state.ends[0], moved];
            }
            measureTape.setEnds(ends, true);
            if (d !== 'both') loupe.move(point, projection(ends[d === 'a' ? 1 : 0]));
        })
        .on('end', (d3_event) => {
            d3_event.sourceEvent?.stopPropagation();
            loupe.end();
            _dragStart = null;
            const state = measureTape.state();
            if (!state) return;
            measureTape.setEnds(state.ends, false);
            measureTape.commit(context);
        });


    function stopPropagation(d3_event: Event) {
        // keep iD's select/hover/pan behaviors out of the tape
        d3_event.stopPropagation();
    }


    function drawMeasureTape(selection: d3.Selection<SVGGElement>) {
        const state = measureTape.state();
        const data = state ? [state] : [];

        let group = selection.selectAll<SVGGElement, typeof state>('g.measure-tape-group')
            .data(data as any[], (d: any) => d.entityID + d.key);

        group.exit().remove();

        const enter = group.enter().append('g').attr('class', 'measure-tape-group');

        enter.append('line').attr('class', 'measure-tape-hit')
            .datum<Handle>('both');
        enter.append('line').attr('class', 'measure-tape-line');

        for (const handle of ['a', 'b'] as const) {
            const g = enter.append('g').attr('class', `measure-tape-handle ${handle}`)
                .datum<Handle>(handle);
            g.append('circle').attr('class', 'measure-tape-handle-hit').attr('r', HIT_RADIUS);
            g.append('circle').attr('class', 'measure-tape-ring').attr('r', RING_RADIUS);
            g.append('path').attr('class', 'measure-tape-cross')
                .attr('d', `M${-CROSS},0H${CROSS}M0,${-CROSS}V${CROSS}`);
        }

        enter.append('text').attr('class', 'measure-tape-label');

        enter.selectAll<SVGElement, Handle>('.measure-tape-hit, .measure-tape-handle')
            .on('pointerdown.measureTape', stopPropagation)
            .on('mousedown.measureTape', stopPropagation)
            .on('touchstart.measureTape', stopPropagation)
            .on('click.measureTape', stopPropagation)
            .call(behavior);

        group = enter.merge(group as any) as any;
        if (!state) return;

        const [a, b] = project(state.ends);
        group.selectAll('.measure-tape-hit')
            .attr('x1', a[0]).attr('y1', a[1]).attr('x2', b[0]).attr('y2', b[1]);
        group.selectAll('.measure-tape-line')
            .attr('x1', a[0]).attr('y1', a[1]).attr('x2', b[0]).attr('y2', b[1]);
        group.selectAll('.measure-tape-handle.a')
            .attr('transform', `translate(${a[0]},${a[1]})`);
        group.selectAll('.measure-tape-handle.b')
            .attr('transform', `translate(${b[0]},${b[1]})`);

        // label beside the middle of the line, on its upper side
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy) || 1;
        let nx = -dy / length;
        let ny = dx / length;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const offset = 14;
        group.selectAll('.measure-tape-label')
            .attr('x', (a[0] + b[0]) / 2 + nx * offset)
            .attr('y', (a[1] + b[1]) / 2 + ny * offset)
            .text(formatTapeLabel(tapeLength(state.ends)));
    }


    return drawMeasureTape;
}
