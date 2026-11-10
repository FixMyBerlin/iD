import { describe, expect, it } from 'vitest';

import { footwaysNextTo } from '../../../modules/validations/cycleway_traffic_mode';
import type { osmWay } from '../../../modules/osm';

describe('footwaysNextTo (traffic_mode hint on separate cycleways)', () => {
    const lon = (meters: number) => 13.4 + iD.geoMetersToLon(meters, 52.5);
    const lat = (meters: number) => 52.5 + iD.geoMetersToLat(meters);

    /** A 100 m cycleway along the x axis, a 100 m footway at `y` meters next to it */
    function setup(bikeTags: Record<string, string>, y: number, footTags: Record<string, string> = { highway: 'footway', footway: 'sidewalk' }) {
        const graph = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: bikeTags }),
            new iD.osmNode({ id: 'n3', loc: [lon(0), lat(y)] }),
            new iD.osmNode({ id: 'n4', loc: [lon(100), lat(y)] }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: footTags })
        ] as unknown as iD.Graph);
        const ways = [graph.entity('w1'), graph.entity('w2')] as unknown as osmWay[];
        return footwaysNextTo(graph, ways[0], ways);
    }

    const cycleway = { highway: 'cycleway', oneway: 'yes' };

    it('a footway within 5 m (either side)', () => {
        expect(setup(cycleway, -2)).toEqual(['w2']);
        expect(setup(cycleway, 4.5)).toEqual(['w2']);
        expect(setup({ highway: 'path', bicycle: 'designated' }, 2)).toEqual(['w2']);
    });

    it('not when the footway is further away', () => {
        expect(setup(cycleway, 6.5)).toEqual([]);
    });

    it('not when traffic_mode says it already, or is set on both sides', () => {
        expect(setup({ ...cycleway, 'traffic_mode:right': 'foot' }, -2)).toEqual([]);
        expect(setup({ ...cycleway, 'traffic_mode:left': 'foot' }, -2)).toEqual([]);
        expect(setup({ ...cycleway, 'traffic_mode:both': 'no' }, -2)).toEqual([]);
        expect(setup({ ...cycleway, 'traffic_mode:left': 'motor_vehicle', 'traffic_mode:right': 'no' }, -2)).toEqual([]);
        // one side set: the other may still be the footway
        expect(setup({ ...cycleway, 'traffic_mode:left': 'motor_vehicle' }, -2)).toEqual(['w2']);
    });

    it('not on a crossing (its own TILDA category)', () => {
        expect(setup({ highway: 'cycleway', cycleway: 'crossing' }, -2)).toEqual([]);
        expect(setup({ highway: 'path', path: 'crossing', bicycle: 'designated' }, -2)).toEqual([]);
    });

    it('only on cycleways, and only next to footways', () => {
        expect(setup({ highway: 'path', bicycle: 'designated', foot: 'designated' }, -2)).toEqual([]);
        expect(setup({ highway: 'residential' }, -2)).toEqual([]);
        expect(setup(cycleway, -2, { highway: 'cycleway' })).toEqual([]);
    });
});
