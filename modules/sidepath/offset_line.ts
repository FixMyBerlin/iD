import { geoMetersToLat, geoMetersToLon } from '../geo';

type Loc = [number, number];

/**
 * A line parallel to `locs`, `meters` to the right (or left) of its direction.
 * Each vertex moves along the average normal of its two segments, scaled so both segments
 * keep the distance; very sharp angles are capped at twice the distance so the line does not
 * shoot off. Computed in a local metric plane around the line's middle latitude.
 */
export function offsetLine(locs: Loc[], meters: number, side: 'left' | 'right'): Loc[] {
    if (locs.length < 2) return locs.slice();

    const lat0 = locs.reduce((sum, loc) => sum + loc[1], 0) / locs.length;
    const degLon = geoMetersToLon(1, lat0);
    const degLat = geoMetersToLat(1);
    const points = locs.map(([lon, lat]) => [lon / degLon, lat / degLat]);
    const sign = side === 'right' ? 1 : -1;

    // right-hand unit normal of each segment (x east, y north)
    const normals = points.slice(1).map((point, i) => {
        const dx = point[0] - points[i][0];
        const dy = point[1] - points[i][1];
        const length = Math.hypot(dx, dy) || 1;
        return [dy / length, -dx / length];
    });

    return points.map((point, i) => {
        const before = normals[i - 1] ?? normals[i];
        const after = normals[i] ?? normals[i - 1];
        let nx = before[0] + after[0];
        let ny = before[1] + after[1];
        const length = Math.hypot(nx, ny);
        if (length < 1e-9) {
            // the line turns back on itself: use one segment's normal
            [nx, ny] = before;
        } else {
            nx /= length;
            ny /= length;
        }
        const cos = nx * before[0] + ny * before[1];
        const scale = 1 / Math.max(cos, 0.5);
        const distance = sign * meters * scale;
        return [(point[0] + nx * distance) * degLon, (point[1] + ny * distance) * degLat] as Loc;
    });
}


/** Length of a line in meters (local plane, good enough for a street) */
export function lineLengthMeters(locs: Loc[]) {
    if (locs.length < 2) return 0;
    const lat0 = locs[0][1];
    const degLon = geoMetersToLon(1, lat0);
    const degLat = geoMetersToLat(1);
    let length = 0;
    for (let i = 1; i < locs.length; i++) {
        length += Math.hypot((locs[i][0] - locs[i - 1][0]) / degLon, (locs[i][1] - locs[i - 1][1]) / degLat);
    }
    return length;
}


/** Meters from a point to the nearest point of a line (local plane) */
export function distanceToLineMeters(point: Loc, line: Loc[]) {
    const degLon = geoMetersToLon(1, point[1]);
    const degLat = geoMetersToLat(1);
    const xy = line.map(loc => [(loc[0] - point[0]) / degLon, (loc[1] - point[1]) / degLat]);
    let nearest = Math.min(...xy.map(([x, y]) => Math.hypot(x, y)));
    for (let i = 1; i < xy.length; i++) {
        const [ax, ay] = xy[i - 1];
        const [dx, dy] = [xy[i][0] - ax, xy[i][1] - ay];
        const lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) continue;
        const along = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
        nearest = Math.min(nearest, Math.hypot(ax + along * dx, ay + along * dy));
    }
    return nearest;
}


export type LineProjection = {
    /** the nearest point of the line */
    loc: Loc;
    /** meters from the point to it */
    distance: number;
    /** meters from the start of the line to it */
    along: number;
    /** it lies on the segment from this node index to the next */
    index: number;
};

/** The nearest point of a line to a point, and where on the line it is (local plane) */
export function projectOnLine(point: Loc, line: Loc[]): LineProjection {
    const degLon = geoMetersToLon(1, point[1]);
    const degLat = geoMetersToLat(1);
    const xy = line.map(loc => [(loc[0] - point[0]) / degLon, (loc[1] - point[1]) / degLat]);
    let best: LineProjection = { loc: line[0], distance: Math.hypot(xy[0][0], xy[0][1]), along: 0, index: 0 };
    let walked = 0;
    for (let i = 1; i < xy.length; i++) {
        const [ax, ay] = xy[i - 1];
        const [dx, dy] = [xy[i][0] - ax, xy[i][1] - ay];
        const length = Math.hypot(dx, dy);
        if (length) {
            const share = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (length * length)));
            const distance = Math.hypot(ax + share * dx, ay + share * dy);
            if (distance < best.distance) {
                best = {
                    loc: [point[0] + (ax + share * dx) * degLon, point[1] + (ay + share * dy) * degLat],
                    distance,
                    along: walked + share * length,
                    index: i - 1
                };
            }
        }
        walked += length;
    }
    return best;
}
