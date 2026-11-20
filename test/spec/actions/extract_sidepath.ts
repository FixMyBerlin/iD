import { actionExtractSidepath } from '../../../modules/actions/extract_sidepath';

describe('iD.actionExtractSidepath', () => {
    function graph(tags: Record<string, string>) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: [13.4, 52.5] }),
            new iD.osmNode({ id: 'n2', loc: [13.4 + iD.geoMetersToLon(100, 52.5), 52.5] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags })
        ];
        return new iD.coreGraph(entities as unknown as iD.Graph);
    }

    it('adds a parallel way with the side tags and sets the road side to separate', () => {
        const before = graph({ highway: 'residential', 'cycleway:right': 'track', 'cycleway:right:surface': 'asphalt' });
        const action = actionExtractSidepath('w1', 'cycleway', 'right', undefined);
        expect(action.disabled!(before)).toBe(false);

        const after = action(before);
        const way = after.entity(action.getWayId());
        expect(way.tags).toEqual({ highway: 'cycleway', is_sidepath: 'yes', surface: 'asphalt', oneway: 'yes' });
        expect(after.entity('w1').tags).toEqual({ highway: 'residential', 'cycleway:right': 'separate' });

        // 4 m half road + 1 m kerb + 1 m half track = 6 m south of the road, same direction
        const nodes = after.childNodes(way);
        expect(nodes).toHaveLength(2);
        expect(nodes[0].loc[1]).toBeCloseTo(52.5 - iD.geoMetersToLat(6), 8);
        expect(nodes[0].loc[0]).toBeLessThan(nodes[1].loc[0]);
    });

    it('a segregated track is a segregated path, or with twoLines the cycleway line next to the sidewalk', () => {
        const road = { highway: 'residential', 'cycleway:right': 'track', 'cycleway:right:segregated': 'yes', sidewalk: 'separate' };
        const path = actionExtractSidepath('w1', 'cycleway', 'right', undefined);
        const pathTags = path(graph(road)).entity(path.getWayId()).tags;
        expect(pathTags).toMatchObject({ highway: 'path', foot: 'designated', segregated: 'yes', oneway: 'no', 'oneway:bicycle': 'yes' });

        const twoLines = actionExtractSidepath('w1', 'cycleway', 'right', undefined, undefined, 'twoLines');
        const lineTags = twoLines(graph(road)).entity(twoLines.getWayId()).tags;
        expect(lineTags).toMatchObject({ highway: 'cycleway', oneway: 'yes', 'traffic_mode:right': 'foot' });
        expect(lineTags.foot).toBeUndefined();
    });

    it('draws a left track against the road direction, with oneway=yes', () => {
        const before = graph({ highway: 'residential', 'cycleway:left': 'track' });
        const action = actionExtractSidepath('w1', 'cycleway', 'left', undefined);
        const after = action(before);
        const way = after.entity(action.getWayId());
        const nodes = after.childNodes(way);
        expect(way.tags.oneway).toBe('yes');
        expect(nodes[0].loc[0]).toBeGreaterThan(nodes[1].loc[0]);
        expect(nodes[0].loc[1]).toBeGreaterThan(52.5);
    });

    it('draws a two-way left track in the road direction', () => {
        const before = graph({ highway: 'residential', 'cycleway:left': 'track', 'cycleway:left:oneway': 'no' });
        const action = actionExtractSidepath('w1', 'cycleway', 'left', undefined);
        const after = action(before);
        const way = after.entity(action.getWayId());
        const nodes = after.childNodes(way);
        expect(way.tags.oneway).toBe('no');
        expect(nodes[0].loc[0]).toBeLessThan(nodes[1].loc[0]);
    });

    it('is disabled for closed or very short ways', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: [13.4, 52.5] }),
            new iD.osmNode({ id: 'n2', loc: [13.4 + iD.geoMetersToLon(1, 52.5), 52.5] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential', 'cycleway:right': 'track' } })
        ];
        const short = new iD.coreGraph(entities as unknown as iD.Graph);
        expect(actionExtractSidepath('w1', 'cycleway', 'right', undefined).disabled!(short)).toBe('too_short');
    });
});
