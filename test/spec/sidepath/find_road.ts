import { roadForSidepath } from '../../../modules/sidepath/find_road';

describe('sidepath/find_road', () => {
    const lat = 52.5;
    const x = (m: number) => 13.4 + iD.geoMetersToLon(m, lat);
    const y = (m: number) => lat + iD.geoMetersToLat(m);
    let entities: iD.OsmEntity[];
    let count: number;

    beforeEach(() => {
        entities = [];
        count = 0;
    });

    /** A way from (x1, y1) to (x2, y2) in meters */
    function way(id: `w${number}`, from: [number, number], to: [number, number], tags: Record<string, string>) {
        const a = new iD.osmNode({ id: `n${++count}` as const, loc: [x(from[0]), y(from[1])] });
        const b = new iD.osmNode({ id: `n${++count}` as const, loc: [x(to[0]), y(to[1])] });
        const w = new iD.osmWay({ id, nodes: [a.id, b.id], tags });
        entities.push(a, b, w);
        return w;
    }

    function find() {
        const graph = new iD.coreGraph(entities as unknown as iD.Graph);
        const ways = entities.filter(e => e.type === 'way') as iD.OsmWay[];
        return roadForSidepath(graph, 'w1', ways);
    }

    const cycleway = (offset: number, tags: Record<string, string> = { highway: 'cycleway', oneway: 'yes' }) =>
        way('w1', [10, offset], [90, offset], tags);

    it('finds the road next to it, the side and the distance', () => {
        way('w2', [0, 0], [100, 0], { highway: 'residential' });
        cycleway(-8);
        expect(find()).toMatchObject({ roadID: 'w2', side: 'right', reason: 'nearest' });
        expect(find()!.distance).toBeCloseTo(8, 0);
    });

    it('gives the side in the road\'s drawing direction', () => {
        way('w2', [100, 0], [0, 0], { highway: 'residential' });
        cycleway(-8);
        expect(find()).toMatchObject({ roadID: 'w2', side: 'left' });
    });

    it('takes a road whose side is cycleway=separate over a nearer road', () => {
        way('w2', [0, 0], [100, 0], { highway: 'primary', 'cycleway:right': 'separate' });
        way('w3', [0, -12], [100, -12], { highway: 'service' });
        cycleway(-8);
        expect(find()).toMatchObject({ roadID: 'w2', side: 'right', reason: 'cycleway_separate' });
    });

    it('does not take cycleway=separate of the other side', () => {
        way('w2', [0, 0], [100, 0], { highway: 'primary', 'cycleway:left': 'separate' });
        way('w3', [0, -12], [100, -12], { highway: 'service' });
        cycleway(-8);
        expect(find()).toMatchObject({ roadID: 'w3', reason: 'nearest' });
    });

    it('takes sidewalk(:bicycle)=separate next, also on both sides', () => {
        way('w2', [0, 0], [100, 0], { highway: 'secondary', 'sidewalk:both': 'separate' });
        way('w3', [0, -12], [100, -12], { highway: 'service' });
        cycleway(-8);
        expect(find()).toMatchObject({ roadID: 'w2', reason: 'sidewalk_separate' });

        entities = [];
        way('w2', [0, 0], [100, 0], { highway: 'secondary', 'sidewalk:bicycle:right': 'separate' });
        way('w3', [0, -12], [100, -12], { highway: 'service' });
        cycleway(-8);
        expect(find()).toMatchObject({ roadID: 'w2', reason: 'sidewalk_separate' });
    });

    it('prefers cycleway=separate over sidewalk=separate', () => {
        way('w2', [0, 0], [100, 0], { highway: 'secondary', 'sidewalk:right': 'separate' });
        way('w4', [0, -20], [100, -20], { highway: 'secondary', 'cycleway:left': 'separate' });
        cycleway(-8);
        expect(find()).toMatchObject({ roadID: 'w4', side: 'left', reason: 'cycleway_separate' });
    });

    it('finds nothing when two roads of the same rank are about equally near', () => {
        way('w2', [0, 0], [100, 0], { highway: 'residential' });
        way('w3', [0, -16], [100, -16], { highway: 'residential' });
        cycleway(-8);
        expect(find()).toBeUndefined();
    });

    it('finds nothing for a road that crosses it, is too far away, or is no road', () => {
        way('w5', [50, -50], [50, 50], { highway: 'residential' });
        way('w6', [0, -40], [100, -40], { highway: 'residential' });
        way('w7', [0, -5], [100, -5], { highway: 'footway' });
        cycleway(-8);
        expect(find()).toBeUndefined();
    });

    it('needs the road along at least half of the sidepath', () => {
        way('w2', [0, 0], [40, 0], { highway: 'residential' });
        cycleway(-8);
        expect(find()).toBeUndefined();
    });
});
