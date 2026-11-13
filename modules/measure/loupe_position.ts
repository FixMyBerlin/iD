import type { Vec2 } from '../geo/vector';

/**
 * Where the measuring tape's magnifier goes (feature 21): next to the dragged end, never on the
 * tape itself and inside the map. Tries the direction pointing away from the other end first,
 * then the two sides, then the diagonals, farther out if needed; falls back to the candidate
 * farthest from the tape.
 */


/** Distance of point `p` to the segment `a`–`b` */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}


/**
 * Center of the magnifier (radius `radius`) for the dragged end `handle`, the other end `other`
 * and a map of `size` px. `gap` is the free space between the magnifier and the tape.
 */
export function loupeCenter(handle: Vec2, other: Vec2, size: Vec2, radius: number, gap = 12): Vec2 {
    let ux = handle[0] - other[0];
    let uy = handle[1] - other[1];
    const length = Math.hypot(ux, uy);
    if (length < 1) {
        // ends on top of each other: prefer above
        ux = 0; uy = -1;
    } else {
        ux /= length; uy /= length;
    }

    const distance = radius + gap + 12;   // 12: the handle ring
    const s = Math.SQRT1_2;
    const directions: Vec2[] = [
        [ux, uy],                                  // away from the tape
        [-uy, ux], [uy, -ux],                      // the sides
        [(ux - uy) * s, (uy + ux) * s], [(ux + uy) * s, (uy - ux) * s],
        [(-uy - ux) * s, (ux - uy) * s], [(uy - ux) * s, (-ux - uy) * s]
    ];

    // close to the handle first; farther out when the handle is near a map edge or corner
    const candidates = [1, 1.6, 2.3, 3].flatMap(scale =>
        directions.map(([dx, dy]) => [handle[0] + dx * distance * scale, handle[1] + dy * distance * scale] as Vec2));
    const inside = (c: Vec2) =>
        c[0] - radius >= 0 && c[1] - radius >= 0 && c[0] + radius <= size[0] && c[1] + radius <= size[1];
    const clear = (c: Vec2) => distanceToSegment(c, handle, other) >= radius + gap;

    const best = candidates.find(c => inside(c) && clear(c));
    if (best) return best;

    // no free place inside the map: keep it inside, as far from the tape as possible
    const clamp = (c: Vec2): Vec2 => [
        Math.max(radius, Math.min(size[0] - radius, c[0])),
        Math.max(radius, Math.min(size[1] - radius, c[1]))
    ];
    return candidates
        .map(clamp)
        .reduce((a, b) => distanceToSegment(b, handle, other) > distanceToSegment(a, handle, other) ? b : a);
}
