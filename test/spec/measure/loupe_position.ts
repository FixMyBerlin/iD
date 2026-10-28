import { describe, expect, it } from 'vitest';

import { distanceToSegment, loupeCenter } from '../../../modules/measure/loupe_position';

const SIZE: [number, number] = [800, 600];
const R = 80;

describe('measure/loupe_position', () => {
    it('measures the distance to a segment', () => {
        expect(distanceToSegment([5, 5], [0, 0], [10, 0])).toBe(5);
        expect(distanceToSegment([-3, 4], [0, 0], [10, 0])).toBe(5);
        expect(distanceToSegment([3, 4], [0, 0], [0, 0])).toBe(5);
    });

    it('goes away from the tape when there is space', () => {
        // horizontal tape, dragging the right end: the lens goes further right
        const center = loupeCenter([400, 300], [300, 300], SIZE, R);
        expect(center[0]).toBeGreaterThan(400 + R);
        expect(center[1]).toBeCloseTo(300);
    });

    it('goes to a side near the map edge, never on the tape', () => {
        // dragged end close to the right edge
        const handle: [number, number] = [780, 300];
        const other: [number, number] = [600, 300];
        const center = loupeCenter(handle, other, SIZE, R);
        expect(center[0] + R).toBeLessThanOrEqual(SIZE[0]);
        expect(distanceToSegment(center, handle, other)).toBeGreaterThanOrEqual(R);
    });

    it('stays inside the map in a corner', () => {
        const center = loupeCenter([10, 10], [200, 200], SIZE, R);
        expect(center[0] - R).toBeGreaterThanOrEqual(0);
        expect(center[1] - R).toBeGreaterThanOrEqual(0);
        expect(distanceToSegment(center, [10, 10], [200, 200])).toBeGreaterThanOrEqual(R);
    });
});
