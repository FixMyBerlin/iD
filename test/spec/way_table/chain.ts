import { buildWayChain, swapLeftRightKey } from '../../../modules/way_table/chain';
import { buildTagRows } from '../../../modules/way_table/tag_rows';

//  n1 ---w1--> n2 ---w2--> n3 <--w3--- n4
//                          |
//                          w4 (footway) to n5
function graph() {
    // the constructor also takes a list of entities, which its type does not declare
    const entities = [
        new iD.osmNode({ id: 'n1' }),
        new iD.osmNode({ id: 'n2' }),
        new iD.osmNode({ id: 'n3' }),
        new iD.osmNode({ id: 'n4' }),
        new iD.osmNode({ id: 'n5' }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential', name: 'A', 'cycleway:left': 'lane' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential', name: 'A', maxspeed: '30' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n4', 'n3'], tags: { highway: 'residential', name: 'A', 'cycleway:left': 'lane' } }),
        new iD.osmWay({ id: 'w4', nodes: ['n3', 'n5'], tags: { highway: 'footway' } })
    ];
    return new iD.coreGraph(entities as unknown as iD.Graph);
}


describe('way_table/chain', () => {
    it('swaps left and right in keys', () => {
        expect(swapLeftRightKey('cycleway:left')).toBe('cycleway:right');
        expect(swapLeftRightKey('parking:right:orientation')).toBe('parking:left:orientation');
        expect(swapLeftRightKey('maxspeed')).toBe('maxspeed');
    });

    it('follows ways of the same kind in both directions', () => {
        const chain = buildWayChain(graph(), 'w2')!;
        expect(chain.segments.map(s => s.wayID)).toEqual(['w1', 'w2', 'w3']);
        expect(chain.centerIndex).toBe(1);
        expect(chain.junctions).toEqual([]);
    });

    it('flips reversed neighbors and their left/right tags', () => {
        const chain = buildWayChain(graph(), 'w2')!;
        const w3 = chain.segments[2];
        expect(w3.reversed).toBe(true);
        expect(w3.nodeIDs).toEqual(['n3', 'n4']);
        expect(w3.tags['cycleway:right']).toBe('lane');
        expect(w3.tags['cycleway:left']).toBeUndefined();
    });

    it('limits the number of ways per side', () => {
        const chain = buildWayChain(graph(), 'w1', 1)!;
        expect(chain.segments.map(s => s.wayID)).toEqual(['w1', 'w2']);
    });

    it('asks at a fork of two ways of the same kind', () => {
        const entities = [
            new iD.osmNode({ id: 'n1' }), new iD.osmNode({ id: 'n2' }),
            new iD.osmNode({ id: 'n3' }), new iD.osmNode({ id: 'n4' }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n2', 'n4'], tags: { highway: 'residential' } })
        ];
        const chain = buildWayChain(new iD.coreGraph(entities as unknown as iD.Graph), 'w1')!;
        expect(chain.segments.map(s => s.wayID)).toEqual(['w1']);
        expect(chain.junctions).toHaveLength(1);
        expect(chain.junctions[0].candidates.map(c => c.wayID).sort()).toEqual(['w2', 'w3']);

        const chosen = buildWayChain(new iD.coreGraph(entities as unknown as iD.Graph), 'w1', 3, new Map([['n2', 'w3']]))!;
        expect(chosen.segments.map(s => s.wayID)).toEqual(['w1', 'w3']);
    });

    it('returns undefined for missing ways', () => {
        expect(buildWayChain(graph(), 'w99')).toBeUndefined();
    });
});


describe('way_table/tag_rows', () => {
    it('compares every tag with the center way, preset keys first', () => {
        const chain = buildWayChain(graph(), 'w2')!;
        const rows = buildTagRows(chain, new Set(['maxspeed']));

        expect(rows.map(r => r.key)).toEqual(['maxspeed', 'cycleway:left', 'cycleway:right', 'highway', 'name']);
        expect(rows[0]).toMatchObject({ isPresetKey: true, differs: true });
        expect(rows[0].cells.map(c => c.status)).toEqual(['removed', 'same', 'removed']);

        const cyclewayLeft = rows.find(r => r.key === 'cycleway:left')!;
        expect(cyclewayLeft.cells.map(c => c.status)).toEqual(['added', 'empty', 'empty']);

        const highway = rows.find(r => r.key === 'highway')!;
        expect(highway.differs).toBe(false);
    });
});
