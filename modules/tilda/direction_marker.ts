import type { Selection } from 'd3-selection';

/**
 * Maid's direction markers (`dist/img/maid-direction`, taken over unchanged from Maid's
 * `packages/renderer/assets/direction`): each points east, so left to right is the way's drawing direction.
 */
export type DirectionShape = 'forward' | 'reversed' | 'both' | 'drawn';

/** The marker of a oneway value, by what the value means for the line: `yes` with it, `-1` against it, `no` both (Maid) */
export const ONEWAY_SHAPE: Record<string, Exclude<DirectionShape, 'drawn'> | undefined> = { yes: 'forward', '-1': 'reversed', no: 'both' };


/**
 * The screen direction from `a` to `b` ([lon, lat]), degrees clockwise from east (north is -90°, the screen's y runs
 * down); east-west distances shrink with the latitude. Nothing for two equal points.
 */
export function segmentScreenAngle(a: [number, number], b: [number, number]): number | undefined {
    if (a[0] === b[0] && a[1] === b[1]) return undefined;
    const dx = (b[0] - a[0]) * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
    return Math.atan2(-(b[1] - a[1]), dx) * 180 / Math.PI;
}


/**
 * The screen direction of a way along its first segment (Maid's `lineAngleOf`): the first segment, not first to
 * last node, which misleads on a U-shaped or closed way. Nothing for a node or a way with missing nodes.
 */
export function wayScreenAngle(context: iD.Context, entityID: string): number | undefined {
    const way = context.hasEntity(entityID as Parameters<iD.Context['hasEntity']>[0]);
    if (!way || way.type !== 'way') return undefined;
    const [a, b] = (way as iD.OsmWay).nodes.slice(0, 2).map(id => context.hasEntity(id)?.loc as [number, number] | undefined);
    return a && b ? segmentScreenAngle(a, b) : undefined;
}


/** Appends a marker, turned by `angle` degrees clockwise */
export function directionIcon<E extends Element>(
    context: iD.Context, parent: Selection<E, unknown, any, any>, shape: DirectionShape, angle: number | undefined
) {
    return parent.append('img')
        .attr('class', 'direction-marker')
        .attr('src', context.imagePath(`maid-direction/${shape}.svg`))
        .attr('alt', '')
        .style('transform', angle ? `rotate(${angle}deg)` : '');
}
