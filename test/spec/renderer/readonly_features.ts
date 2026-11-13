import { readOnlyFeatures } from '../../../modules/renderer/readonly_features';

// a building and a road that share the node n2
function graph() {
    const entities = [
        new iD.osmNode({ id: 'n1' }), new iD.osmNode({ id: 'n2' }), new iD.osmNode({ id: 'n3' }), new iD.osmNode({ id: 'n4' }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n1'], tags: { building: 'yes' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n2', 'n4'], tags: { highway: 'residential' } })
    ];
    return new iD.coreGraph(entities as unknown as iD.Graph);
}

// stand-in for rendererFeatures.getMatches
const features = {
    getMatches: (entity: iD.OsmEntity) => entity.tags.building ? { buildings: true } : entity.tags.highway ? { traffic_roads: true } : {}
};


describe('renderer/readonly_features', () => {
    afterEach(() => {
        for (const key of readOnlyFeatures.keys()) readOnlyFeatures.toggle(key);
    });

    it('marks entities of read-only categories', () => {
        const g = graph();
        expect(readOnlyFeatures.isReadOnly(g.entity('w1'), g, features)).toBe(false);

        readOnlyFeatures.toggle('buildings');
        expect(readOnlyFeatures.isReadOnlyKey('buildings')).toBe(true);
        expect(readOnlyFeatures.isReadOnly(g.entity('w1'), g, features)).toBe(true);
        expect(readOnlyFeatures.isReadOnly(g.entity('w2'), g, features)).toBe(false);
    });

    it('keeps vertices editable when an editable way uses them', () => {
        const g = graph();
        readOnlyFeatures.toggle('buildings');
        expect(readOnlyFeatures.isReadOnly(g.entity('n1'), g, features)).toBe(true);   // only the building
        expect(readOnlyFeatures.isReadOnly(g.entity('n2'), g, features)).toBe(false);  // building and road
    });
});
