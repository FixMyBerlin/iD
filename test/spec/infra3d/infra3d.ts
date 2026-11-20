import { describe, expect, it } from 'vitest';

import { infra3dCovers, infra3dUrl, middleOfLine } from '../../../modules/infra3d/infra3d';

describe('infra3d', () => {
    it('builds a link that looks at a place in Berlin', () => {
        const url = new URL(infra3dUrl([13.4186, 52.4794])!);
        expect(url.origin + url.pathname).toBe('https://app.infra3d.com/edit/');
        expect(url.searchParams.get('projectUID')).toBe('ec2428b7-8e49-4d93-80a0-edfec6da1cf3');
        expect(JSON.parse(url.searchParams.get('lookAt')!)).toEqual({ easting: 13.4186, northing: 52.4794, epsg: 4326 });
    });

    it('jumps to the nearest image for a photo position', () => {
        const url = new URL(infra3dUrl([13.4186, 52.4794], 'jumpTo')!);
        expect(JSON.parse(url.searchParams.get('jumpTo')!)).toEqual({ easting: 13.4186, northing: 52.4794, epsg: 4326 });
        expect(url.searchParams.has('lookAt')).toBe(false);
    });

    it('has no link outside the projects', () => {
        expect(infra3dCovers([13.4186, 52.4794])).toBe(true);
        expect(infra3dCovers([11.57, 48.14])).toBe(false);
        expect(infra3dUrl([11.57, 48.14])).toBeUndefined();
    });

    it('finds the middle of a line along its length', () => {
        // a short and a long segment: the middle is on the long one, not at the corner
        const middle = middleOfLine([[13.4, 52.5], [13.4, 52.501], [13.4, 52.505]])!;
        expect(middle[0]).toBeCloseTo(13.4, 6);
        expect(middle[1]).toBeCloseTo(52.5025, 4);
        expect(middleOfLine([[13.4, 52.5]])).toEqual([13.4, 52.5]);
        expect(middleOfLine([])).toBeUndefined();
    });
});
