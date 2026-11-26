import { actionLaneFromPath, subLine } from '../../../modules/actions/lane_from_path';
import { lineLengthMeters } from '../../../modules/sidepath/offset_line';
import { roadForSidepath } from '../../../modules/sidepath/find_road';

describe('iD.actionLaneFromPath (lane out of a segregated foot and cycle path)', () => {
    const lat = 52.5;
    const x = (m: number) => 13.4 + iD.geoMetersToLon(m, lat);
    const y = (m: number) => lat + iD.geoMetersToLat(m);
    const toMeters = (loc: [number, number]) => [
        (loc[0] - 13.4) / iD.geoMetersToLon(1, lat), (loc[1] - lat) / iD.geoMetersToLat(1)
    ];

    const segregated = {
        highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes',
        'cycleway:width': '1.6', 'cycleway:surface': 'asphalt', 'footway:surface': 'paving_stones'
    };

    /** A road going east (0–100 m) and a path 8 m south of it (10–90 m), drawn east or west */
    function graph(pathTags: Record<string, string> = segregated, pathWest = false) {
        const n = (id: `n${number}`, mx: number, my: number) => new iD.osmNode({ id, loc: [x(mx), y(my)] });
        const entities = [
            n('n1', 0, 0), n('n2', 50, 0), n('n3', 100, 0),
            n('n4', 10, -8), n('n5', 90, -8),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'secondary', 'sidewalk:right': 'separate' } }),
            new iD.osmWay({ id: 'w2', nodes: pathWest ? ['n5', 'n4'] : ['n4', 'n5'], tags: pathTags })
        ];
        return new iD.coreGraph(entities as unknown as iD.Graph);
    }

    function road(g: iD.Graph) {
        const found = roadForSidepath(g, 'w2', [g.entity('w1'), g.entity('w2')] as never);
        expect(found).toBeDefined();
        return found!;
    }

    it('finds the road and the side', () => {
        expect(road(graph())).toEqual({ roadID: 'w1', side: 'right', along: true });
        expect(road(graph(segregated, true))).toEqual({ roadID: 'w1', side: 'right', along: false });
    });

    it('as its own line: the path becomes the sidewalk, a new lane runs along the road between road and sidewalk', () => {
        const g = graph();
        const action = actionLaneFromPath('w2', road(g), 'line', 'exclusive');
        expect(action.disabled!(g)).toBe(false);
        const result = action(g);

        expect(result.entity('w2').tags).toMatchObject({ highway: 'footway', footway: 'sidewalk', is_sidepath: 'yes', surface: 'paving_stones' });
        expect(result.entity('w2').tags.bicycle).toBeUndefined();
        expect(result.entity('w2').tags.segregated).toBeUndefined();
        expect(result.entity('w1').tags).toEqual({ highway: 'secondary', 'sidewalk:right': 'separate', 'cycleway:right': 'separate' });

        const lane = result.entity(action.getLaneId()!) as iD.OsmWay;
        expect(lane.tags).toMatchObject({ highway: 'cycleway', cycleway: 'lane', lane: 'exclusive', width: '1.6', surface: 'asphalt' });
        expect(lane.tags.is_sidepath).toBeUndefined();
        const locs = result.childNodes(lane).map(node => toMeters(node.loc as [number, number]));
        // drawn east like the road, from beside the path's start to beside its end, between road (0) and path (-8)
        expect(locs[0][0]).toBeCloseTo(10, 0);
        expect(locs[locs.length - 1][0]).toBeCloseTo(90, 0);
        for (const [, my] of locs) expect(my).toBeCloseTo(-6.5, 1);
    });

    it('a path drawn against the road gives the same lane line, drawn with the road', () => {
        const g = graph(segregated, true);
        const action = actionLaneFromPath('w2', road(g), 'line', 'advisory');
        const result = action(g);
        const lane = result.entity(action.getLaneId()!) as iD.OsmWay;
        expect(lane.tags.lane).toBe('advisory');
        const locs = result.childNodes(lane).map(node => toMeters(node.loc as [number, number]));
        expect(locs[0][0]).toBeLessThan(locs[locs.length - 1][0]);
    });

    it('tagged on the road: no new way, cycleway:<side>=lane on the road', () => {
        const g = graph();
        const action = actionLaneFromPath('w2', road(g), 'centerline', 'advisory');
        const result = action(g);
        expect(action.getLaneId()).toBeUndefined();
        expect(result.entity('w1').tags).toMatchObject({
            'cycleway:right': 'lane', 'cycleway:right:lane': 'advisory', 'cycleway:right:width': '1.6', 'sidewalk:right': 'separate'
        });
        expect(result.entity('w2').tags).toMatchObject({ highway: 'footway', footway: 'sidewalk' });
        expect(Object.keys(result.entities).filter(id => id.startsWith('w')).sort()).toEqual(['w1', 'w2']);
    });

    it('gives the package\'s review messages (a width of the whole way is removed)', () => {
        const g = graph({ ...segregated, width: '4' });
        const action = actionLaneFromPath('w2', road(g), 'line', 'exclusive');
        const result = action(g);
        expect(result.entity('w2').tags.width).toBeUndefined();
        expect(action.review().length).toBeGreaterThan(0);
    });

    it('is not offered for a footway or a crossing', () => {
        for (const tags of [{ highway: 'footway' }, { ...segregated, path: 'crossing' }]) {
            const g = graph(tags);
            const action = actionLaneFromPath('w2', { roadID: 'w1', side: 'right', along: true }, 'line', 'exclusive');
            expect(action.disabled!(g)).toBe('not_eligible');
        }
    });
});

describe('subLine', () => {
    const lat = 52.5;
    const line: [number, number][] = [[13.4, lat], [13.4 + iD.geoMetersToLon(100, lat), lat]];

    it('cuts the piece between two distances', () => {
        const piece = subLine(line, 20, 70);
        expect(piece).toHaveLength(2);
        expect(lineLengthMeters(piece)).toBeCloseTo(50, 3);
    });

    it('keeps the inner nodes', () => {
        const bent: [number, number][] = [...line, [line[1][0], lat + iD.geoMetersToLat(100)]];
        const piece = subLine(bent, 50, 150);
        expect(piece).toHaveLength(3);
        expect(lineLengthMeters(piece)).toBeCloseTo(100, 3);
    });
});
