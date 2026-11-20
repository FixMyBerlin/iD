import { lineLengthMeters, offsetLine } from '../../../modules/sidepath/offset_line';

describe('sidepath/offset_line', () => {
    // a 100 m line going east, and one with a right angle (east, then north)
    const east: [number, number][] = [[13.4, 52.5], [13.4 + iD.geoMetersToLon(100, 52.5), 52.5]];
    const corner: [number, number][] = [...east, [east[1][0], 52.5 + iD.geoMetersToLat(100)]];

    it('moves a straight line to the right (south when going east) and left', () => {
        const right = offsetLine(east, 10, 'right');
        expect(right[0][1]).toBeCloseTo(52.5 - iD.geoMetersToLat(10), 8);
        expect(right[0][0]).toBeCloseTo(13.4, 8);
        const left = offsetLine(east, 10, 'left');
        expect(left[1][1]).toBeCloseTo(52.5 + iD.geoMetersToLat(10), 8);
    });

    it('keeps the distance to both segments at a corner', () => {
        const right = offsetLine(corner, 10, 'right');
        // the corner moves 10 m east and 10 m south (outside of the left turn)
        expect(right[1][0]).toBeCloseTo(east[1][0] + iD.geoMetersToLon(10, 52.5), 6);
        expect(right[1][1]).toBeCloseTo(52.5 - iD.geoMetersToLat(10), 6);
    });

    it('measures lines in meters', () => {
        expect(lineLengthMeters(east)).toBeCloseTo(100, 3);
    });
});
