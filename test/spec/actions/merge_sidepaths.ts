import { actionMergeSidepaths } from '../../../modules/actions/merge_sidepaths';

describe('iD.actionMergeSidepaths', () => {
    const lon = (meters: number) => 13.4 + iD.geoMetersToLon(meters, 52.5);
    const lat = (meters: number) => 52.5 + iD.geoMetersToLat(meters);

    // a footway w1 (saved, 100 m, west → east) and a new cycleway w-1 beside it, drawn east → west
    function graph(extra: unknown[] = [], footTags = {}, bikeTags = {}) {
        return new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
            new iD.osmNode({ id: 'n-1', loc: [lon(100), lat(3)] }),
            new iD.osmNode({ id: 'n-2', loc: [lon(0), lat(3)] }),
            new iD.osmWay({ id: 'w1', version: 3, changeset: '500', nodes: ['n1', 'n2'], tags: { highway: 'footway', footway: 'sidewalk', surface: 'sett', ...footTags } }),
            new iD.osmWay({ id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'cycleway', is_sidepath: 'yes', surface: 'asphalt', oneway: 'yes', ...bikeTags } }),
            ...extra
        ] as unknown as iD.Graph);
    }

    it('keeps the saved footway as the path and deletes the new cycleway with its nodes', () => {
        const before = graph();
        const action = actionMergeSidepaths(['w1', 'w-1'], undefined, undefined);
        expect(action.disabled!(before)).toBe(false);

        const after = action(before);
        expect(action.survivorIds()).toEqual(['w1']);
        expect(after.hasEntity('w-1')).toBeUndefined();
        expect(after.hasEntity('n-1')).toBeUndefined();
        expect(after.entity('w1').nodes).toEqual(['n1', 'n2']);
        expect(after.entity('w1').tags).toEqual({
            highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes', is_sidepath: 'yes',
            'cycleway:surface': 'asphalt', 'footway:surface': 'sett',
            // the cycleway ran against the footway
            oneway: 'no', 'oneway:bicycle': '-1'
        });
    });

    it('keeps the cycleway when its changeset is older, and moves the footway\'s relation to it', () => {
        const before = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
            new iD.osmNode({ id: 'n3', loc: [lon(0), lat(3)] }),
            new iD.osmNode({ id: 'n4', loc: [lon(100), lat(3)] }),
            new iD.osmWay({ id: 'w1', version: 2, changeset: '500', nodes: ['n1', 'n2'], tags: { highway: 'footway', lit: 'no' } }),
            new iD.osmWay({ id: 'w2', version: 1, changeset: '100', nodes: ['n3', 'n4'], tags: { highway: 'cycleway', lit: 'yes', 'traffic_mode:right': 'foot' } }),
            new iD.osmRelation({ id: 'r1', tags: { type: 'route', route: 'foot' }, members: [{ id: 'w1', type: 'way', role: '' }] })
        ] as unknown as iD.Graph);
        const action = actionMergeSidepaths(['w1', 'w2'], undefined, undefined);
        const after = action(before);

        expect(action.survivorIds()).toEqual(['w2']);
        expect(after.hasEntity('w1')).toBeUndefined();
        expect(after.entity('w2').tags).toEqual({
            highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes', lit: 'yes', oneway: 'no'
        });
        expect(action.dropped()).toEqual(['lit=no']);
        expect(after.entity('r1').members).toEqual([{ id: 'w2', type: 'way', role: '' }]);
    });

    it('gives each surviving footway piece the cycleway\'s tags', () => {
        const before = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(60), lat(0)] }),
            new iD.osmNode({ id: 'n3', loc: [lon(100), lat(0)] }),
            new iD.osmNode({ id: 'n-1', loc: [lon(0), lat(3)] }),
            new iD.osmNode({ id: 'n-2', loc: [lon(100), lat(3)] }),
            new iD.osmWay({ id: 'w1', version: 1, changeset: '5', nodes: ['n1', 'n2'], tags: { highway: 'footway', surface: 'sett' } }),
            new iD.osmWay({ id: 'w2', version: 1, changeset: '5', nodes: ['n3', 'n2'], tags: { highway: 'footway', surface: 'asphalt' } }),
            new iD.osmWay({ id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'cycleway', surface: 'asphalt', 'traffic_sign:forward': 'DE:237' } }),
            new iD.osmRelation({ id: 'r1', tags: { type: 'route' }, members: [{ id: 'w-1', type: 'way', role: 'forward' }] })
        ] as unknown as iD.Graph);
        const action = actionMergeSidepaths(['w1', 'w2', 'w-1'], undefined, undefined);
        const after = action(before);

        expect(after.entity('w1').tags).toMatchObject({ 'cycleway:surface': 'asphalt', 'footway:surface': 'sett', 'traffic_sign:forward': 'DE:237' });
        // w2 runs the other way
        expect(after.entity('w2').tags).toMatchObject({ highway: 'path', surface: 'asphalt', 'traffic_sign:backward': 'DE:237' });
        expect(after.entity('r1').members.map((member: { id: string }) => member.id)).toEqual(['w1', 'w2']);
    });

    // a saved footway w1 (200 m, nodes every 50 m) and a new cycleway beside its middle part
    // (ids far from -1: the cut creates new nodes and ways, which count down from -1 in a test)
    function longFootway(bikeFrom: number, bikeTo: number, extra: unknown[] = []) {
        return new iD.coreGraph([
            ...[0, 50, 100, 150, 200].map((meters, i) => new iD.osmNode({ id: `n${i + 1}`, loc: [lon(meters), lat(0)] })),
            new iD.osmNode({ id: 'n-101', loc: [lon(bikeFrom), lat(3)] }),
            new iD.osmNode({ id: 'n-102', loc: [lon(bikeTo), lat(3)] }),
            new iD.osmWay({ id: 'w1', version: 3, changeset: '500', nodes: ['n1', 'n2', 'n3', 'n4', 'n5'], tags: { highway: 'footway', surface: 'sett' } }),
            new iD.osmWay({ id: 'w-101', nodes: ['n-101', 'n-102'], tags: { highway: 'cycleway', surface: 'asphalt' } }),
            ...extra
        ] as unknown as iD.Graph);
    }
    const meters = (graph: iD.Graph, nodeID: string) => Math.round((graph.entity(nodeID as 'n1').loc[0] - 13.4) / iD.geoMetersToLon(1, 52.5));
    const span = (graph: iD.Graph, wayID: string) => {
        const nodes = graph.entity(wayID as 'w1').nodes;
        return [meters(graph, nodes[0]), meters(graph, nodes[nodes.length - 1])];
    };

    it('cuts a footway that is too long to the length of the cycleway: new nodes where it ends', () => {
        const before = longFootway(70, 130);
        const action = actionMergeSidepaths(['w1', 'w-101'], undefined, undefined);
        expect(action.disabled!(before)).toBe(false);

        const after = action(before);
        const [pathID] = action.survivorIds();
        expect(after.hasEntity('w-101')).toBeUndefined();
        expect(after.entity(pathID).tags.highway).toBe('path');
        expect(span(after, pathID)).toEqual([70, 130]);

        // the rest stays a footway, in two pieces
        const footways = after.parentWays(after.entity('n1')).concat(after.parentWays(after.entity('n5')));
        expect(footways.map(way => way.tags.highway)).toEqual(['footway', 'footway']);
        expect(footways.map(way => span(after, way.id)).sort((a, b) => a[0] - b[0])).toEqual([[0, 70], [130, 200]]);
        expect(footways.every(way => way.tags.surface === 'sett' && way.tags.bicycle === undefined)).toBe(true);
    });

    it('cuts at a node of the footway that is close to the end of the cycleway', () => {
        const before = longFootway(51, 149);
        const action = actionMergeSidepaths(['w1', 'w-101'], undefined, undefined);
        const after = action(before);

        expect(after.entity(action.survivorIds()[0]).nodes).toEqual(['n2', 'n3', 'n4']);
    });

    it('cuts only one end when the ways start together', () => {
        const before = longFootway(2, 90);
        const action = actionMergeSidepaths(['w1', 'w-101'], undefined, undefined);
        const after = action(before);

        expect(span(after, action.survivorIds()[0])).toEqual([0, 90]);
        expect(after.parentWays(after.entity('n5')).map(way => [way.tags.highway, span(after, way.id)])).toEqual([['footway', [90, 200]]]);
    });

    it('cuts a cycleway that is too long, and keeps the saved footway as the path', () => {
        const before = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [lon(60), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(140), lat(0)] }),
            new iD.osmNode({ id: 'n-101', loc: [lon(0), lat(3)] }),
            new iD.osmNode({ id: 'n-102', loc: [lon(200), lat(3)] }),
            new iD.osmWay({ id: 'w1', version: 3, changeset: '500', nodes: ['n1', 'n2'], tags: { highway: 'footway' } }),
            new iD.osmWay({ id: 'w-101', nodes: ['n-101', 'n-102'], tags: { highway: 'cycleway', surface: 'asphalt' } })
        ] as unknown as iD.Graph);
        const action = actionMergeSidepaths(['w1', 'w-101'], undefined, undefined);
        const after = action(before);

        expect(action.survivorIds()).toEqual(['w1']);
        expect(after.entity('w1').tags).toMatchObject({ highway: 'path', 'cycleway:surface': 'asphalt' });
        // the two ends of the cycleway stay
        const rest = [...after.parentWays(after.entity('n-101')), ...after.parentWays(after.entity('n-102'))];
        expect(rest.map(way => [way.tags.highway, span(after, way.id)])).toEqual([['cycleway', [0, 60]], ['cycleway', [140, 200]]]);
    });

    it('is disabled when more than two ways differ too much in length, or the ways are not a cycleway and a footway', () => {
        const short = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
            new iD.osmNode({ id: 'n3', loc: [lon(0), lat(3)] }),
            new iD.osmNode({ id: 'n4', loc: [lon(20), lat(3)] }),
            new iD.osmNode({ id: 'n5', loc: [lon(40), lat(3)] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'footway' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: { highway: 'cycleway' } }),
            new iD.osmWay({ id: 'w4', nodes: ['n4', 'n5'], tags: { highway: 'cycleway' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n3', 'n4'], tags: { highway: 'residential' } })
        ] as unknown as iD.Graph);
        expect(actionMergeSidepaths(['w1', 'w2', 'w4'], undefined, undefined).disabled!(short)).toBe('lengths');
        expect(actionMergeSidepaths(['w1', 'w3'], undefined, undefined).disabled!(short)).toBe('not_eligible');
    });

    it('is disabled when the ways do not run side by side', () => {
        // the same length, but the cycleway turns away at a right angle
        const corner = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
            new iD.osmNode({ id: 'n3', loc: [lon(0), lat(3)] }),
            new iD.osmNode({ id: 'n4', loc: [lon(0), lat(103)] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'footway' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: { highway: 'cycleway' } })
        ] as unknown as iD.Graph);
        expect(actionMergeSidepaths(['w1', 'w2'], undefined, undefined).disabled!(corner)).toBe('apart');
    });
});
