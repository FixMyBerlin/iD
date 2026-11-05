import type { Dispatch } from 'd3-dispatch';

import { geoMetersToLon } from '../geo/geo';
import type { Projection } from '../geo/raw_mercator';
import type { Vec2 } from '../geo/vector';
import { measureTape } from '../measure/measure_tape';
import { widthIndicator } from '../width/width_indicator';
import { parseOsmWidth, roadWidthFromTags, widthTargetForKey, type WidthSide } from '../width/width_tags';

/** A band to draw: a closed polygon in screen coordinates plus a label position */
type Band = {
    id: string;
    points: Vec2[];
    label: string;
    labelAt: Vec2;
};

/** Longest miter before a corner is cut, as a multiple of the offset */
const MITER_LIMIT = 3;


/**
 * Offsets a screen polyline sideways by `distance` px. Positive is left of the
 * drawing direction (screen y points down, so left of (dx, dy) is (dy, -dx)).
 */
function offsetPolyline(points: Vec2[], distance: number): Vec2[] {
    const normals = points.slice(1).map((point, i) => {
        const dx = point[0] - points[i][0];
        const dy = point[1] - points[i][1];
        const length = Math.hypot(dx, dy) || 1;
        return [dy / length, -dx / length] as Vec2;
    });

    return points.map((point, i) => {
        const before = normals[i - 1] ?? normals[i];
        const after = normals[i] ?? normals[i - 1];
        let nx = before[0] + after[0];
        let ny = before[1] + after[1];
        const length = Math.hypot(nx, ny);
        if (length < 1e-6) {
            [nx, ny] = after;
        } else {
            nx /= length;
            ny /= length;
        }
        // scale so the offset stays `distance` from both segments at a corner
        const cos = nx * after[0] + ny * after[1];
        const scale = Math.min(1 / Math.max(cos, 1e-6), MITER_LIMIT);
        return [point[0] + nx * distance * scale, point[1] + ny * distance * scale] as Vec2;
    });
}


function band(id: string, line: Vec2[], from: number, to: number, label: string): Band {
    const inner = offsetPolyline(line, from);
    const outer = offsetPolyline(line, to);
    const middle = Math.floor(line.length / 2);
    const labelAt = line.length % 2
        ? offsetPolyline(line, (from + to) / 2)[middle]
        : offsetPolyline([line[middle - 1], line[middle]], (from + to) / 2)
            .reduce((a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Vec2);
    return { id, points: [...inner, ...outer.reverse()], label, labelAt };
}


function formatMeters(meters: number) {
    return `${Number(meters.toFixed(2))} m`;
}


/**
 * Draws the width that `widthIndicator` previews: a band around the way for `width`,
 * or a band on the left/right side of the road for `cycleway:*:width` and `sidewalk:*:width`.
 * Side bands start at the road edge (half of `width`, or a default by highway type).
 */
export function svgWidthIndicator(projection: Projection, context: iD.Context, dispatch: Dispatch<object>) {
    widthIndicator.on('change.svgWidthIndicator', () => dispatch.call('change'));


    function bandsForState(): Band[] {
        // the band is hidden while the measuring tape is active
        const state = measureTape.state() ? null : widthIndicator.state();
        const target = state && widthTargetForKey(state.key);
        const meters = parseOsmWidth(state?.value);
        if (!state || !target || !meters || meters <= 0) return [];

        const graph = context.graph();
        const bands: Band[] = [];

        for (const id of state.entityIDs) {
            const way = graph.hasEntity(id as `w${number}`);
            if (!way || way.type !== 'way') continue;

            const nodes = graph.childNodes(way);
            if (nodes.length < 2) continue;
            const line = nodes.map(node => projection(node.loc));

            // pixels per meter at the way's first node
            const [lon, lat] = nodes[0].loc;
            const east = projection([lon + geoMetersToLon(1, lat), lat]);
            const pxPerMeter = Math.hypot(east[0] - line[0][0], east[1] - line[0][1]);
            const widthPx = meters * pxPerMeter;

            if (target.kind === 'way') {
                bands.push(band(`${id}-way`, line, widthPx / 2, -widthPx / 2, formatMeters(meters)));
                continue;
            }

            const roadHalfPx = roadWidthFromTags(way.tags).meters / 2 * pxPerMeter;
            for (const side of target.sides as WidthSide[]) {
                const sign = side === 'left' ? 1 : -1;
                bands.push(band(
                    `${id}-${side}`,
                    line,
                    sign * roadHalfPx,
                    sign * (roadHalfPx + widthPx),
                    formatMeters(meters)
                ));
            }
        }

        return bands;
    }


    function drawWidthIndicator(selection: d3.Selection<SVGGElement>) {
        const bands = bandsForState();

        const paths = selection.selectAll<SVGPathElement, Band>('path.width-indicator-band')
            .data(bands, d => d.id);

        paths.exit()
            .remove();

        paths.enter()
            .append('path')
            .attr('class', 'width-indicator-band')
            .merge(paths)
            .attr('d', d => `M${d.points.map(p => p.join(',')).join('L')}Z`);

        const labels = selection.selectAll<SVGTextElement, Band>('text.width-indicator-label')
            .data(bands, d => d.id);

        labels.exit()
            .remove();

        labels.enter()
            .append('text')
            .attr('class', 'width-indicator-label')
            .merge(labels)
            .attr('x', d => d.labelAt[0])
            .attr('y', d => d.labelAt[1])
            .text(d => d.label);
    }


    return drawWidthIndicator;
}
