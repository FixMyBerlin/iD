import { describe, expect, it } from 'vitest';

import { segmentScreenAngle } from '../../../../modules/ui/sections/tilda_bike_infra';

describe('ui/sections/tilda_bike_infra segmentScreenAngle', () => {
    it('turns the east-pointing markers to the way on the screen', () => {
        expect(segmentScreenAngle([13.4, 52.5], [13.401, 52.5])).toBeCloseTo(0);
        expect(segmentScreenAngle([13.4, 52.5], [13.4, 52.501])).toBeCloseTo(-90);
        expect(segmentScreenAngle([13.4, 52.5], [13.4, 52.499])).toBeCloseTo(90);
        expect(Math.abs(segmentScreenAngle([13.4, 52.5], [13.399, 52.5])!)).toBeCloseTo(180);
    });

    it('measures east-west in meters: one degree of longitude is shorter in Berlin', () => {
        // as many degrees north as east: steeper than 45° on the screen
        expect(segmentScreenAngle([13.4, 52.5], [13.401, 52.501])!).toBeLessThan(-45);
    });

    it('gives nothing for two equal points', () => {
        expect(segmentScreenAngle([13.4, 52.5], [13.4, 52.5])).toBeUndefined();
    });
});
