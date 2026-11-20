import {
    clipSegmentToExtent, formatTapeLabel, formatTapeValue, initialTapeEnds, initialTapeMeters,
    isMeasurableKey, perpendicularEnds, roundTapeMeters, tapeLength, visibleMiddle
} from '../../../modules/measure/initial_tape';
import { geoSphericalDistance } from '../../../modules/geo/geo';

describe('measure/initial_tape', () => {
    it('rounds to 5 cm and drops trailing zeros', () => {
        expect(roundTapeMeters(2.347)).toBe(2.35);
        expect(roundTapeMeters(2.42)).toBe(2.4);
        expect(formatTapeValue(2.35)).toBe('2.35');
        expect(formatTapeValue(2.399)).toBe('2.4');
        expect(formatTapeValue(3.01)).toBe('3');
        expect(formatTapeLabel(3.45)).toBe('3.45 m');
    });

    it('knows the measurable keys', () => {
        for (const key of ['width', 'est_width', 'width:effective', 'cycleway:width', 'footway:width',
            'cycleway:left:width', 'sidewalk:both:width', 'buffer:left', 'buffer:left:width']) {
            expect(isMeasurableKey(key), key).toBe(true);
        }
        for (const key of ['', 'maxwidth', 'width:source', 'source:width', 'source:cycleway:left:width', 'note:width', 'name', 'buffer', 'widthy']) {
            expect(isMeasurableKey(key), key).toBe(false);
        }
    });

    it('starts with the value, else road width for width, else 2 m', () => {
        expect(initialTapeMeters('width', '3.5', {})).toBe(3.5);
        expect(initialTapeMeters('width', '', { highway: 'residential' })).toBe(8);
        expect(initialTapeMeters('cycleway:left:width', '', { highway: 'residential' })).toBe(2);
    });

    it('clips a segment to the extent', () => {
        const extent: [[number, number], [number, number]] = [[0, 0], [1, 1]];
        expect(clipSegmentToExtent([-1, 0.5], [2, 0.5], extent)).toEqual([[0, 0.5], [1, 0.5]]);
        expect(clipSegmentToExtent([2, 2], [3, 3], extent)).toBeNull();
        expect(clipSegmentToExtent([0.2, 0.2], [0.4, 0.4], extent)).toEqual([[0.2, 0.2], [0.4, 0.4]]);
    });

    it('finds the middle of the visible part', () => {
        const extent: [[number, number], [number, number]] = [[0, 50], [0.01, 50.01]];
        // a long west-east way, only 0.0..0.01 is visible
        const middle = visibleMiddle([[-0.1, 50.005], [0.1, 50.005]], extent)!;
        expect(middle.point[0]).toBeCloseTo(0.005, 6);
        expect(middle.point[1]).toBeCloseTo(50.005, 6);
    });

    it('creates a perpendicular tape of the requested length centered on the way', () => {
        const ends = perpendicularEnds([13.4, 52.5], [13.399, 52.5], [13.401, 52.5], 4);
        expect(ends[0][0]).toBeCloseTo(13.4, 8);
        expect(ends[1][0]).toBeCloseTo(13.4, 8);
        expect(ends[0][1]).not.toBeCloseTo(ends[1][1], 6);
        expect(tapeLength(ends)).toBeCloseTo(4, 2);
        expect(geoSphericalDistance(ends[0], [13.4, 52.5])).toBeCloseTo(2, 2);
    });

    it('is perpendicular for a diagonal segment too', () => {
        const from: [number, number] = [13.4, 52.5];
        const to: [number, number] = [13.402, 52.5015];
        const ends = initialTapeEnds([from, to], null, 3)!;
        const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
        expect(geoSphericalDistance(ends[0], mid)).toBeCloseTo(1.5, 1);
        const cos = Math.cos(52.5 * Math.PI / 180);
        const wayDir = [(to[0] - from[0]) * cos, to[1] - from[1]];
        const tapeDir = [(ends[1][0] - ends[0][0]) * cos, ends[1][1] - ends[0][1]];
        expect(wayDir[0] * tapeDir[0] + wayDir[1] * tapeDir[1]).toBeCloseTo(0, 8);
    });
});
