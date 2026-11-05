import { actionExtractMergeSidepaths } from '../../../modules/actions/extract_merge_sidepaths';
import type { osmWay } from '../../../modules/osm';

describe('iD.actionExtractMergeSidepaths', () => {
    const lon = (meters: number) => 13.4 + iD.geoMetersToLon(meters, 52.5);
    const lat = (meters: number) => 52.5 + iD.geoMetersToLat(meters);

    /** A 100 m road along the x axis, with footways at the given y (meters) */
    function graph(roadTags: Record<string, string>, footways: Record<number, [number, number, number]>) {
        const entities: (iD.OsmNode | iD.OsmWay)[] = [
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: roadTags })
        ];
        for (const [key, [y, from, to]] of Object.entries(footways)) {
            const number = Number(key);
            const [a, b] = [`n${number * 10 + 1}` as const, `n${number * 10 + 2}` as const];
            entities.push(
                new iD.osmNode({ id: a, loc: [lon(from), lat(y)] }),
                new iD.osmNode({ id: b, loc: [lon(to), lat(y)] }),
                new iD.osmWay({ id: `w${number}`, nodes: [a, b], tags: { highway: 'footway', footway: 'sidewalk', surface: 'sett' } })
            );
        }
        return new iD.coreGraph(entities as unknown as iD.Graph);
    }

    const nearby = (g: iD.Graph) => () => (['w2', 'w3', 'w4'] as const).filter(id => g.hasEntity(id)).map(id => g.entity(id)) as unknown as osmWay[];
    const road = { highway: 'residential', 'cycleway:both': 'track', 'cycleway:both:surface': 'asphalt' };

    it('extracts the right cycle track and merges it into the sidewalk next to it', () => {
        const before = graph(road, { 2: [-8.5, 0, 100], 3: [8.5, 0, 100] });
        const action = actionExtractMergeSidepaths('w1', ['right'], undefined, undefined, nearby(before));
        expect(action.disabled!(before)).toBe(false);

        const after = action(before);
        expect(action.survivorIds()).toEqual(['w2']);
        expect(after.entity('w2').tags).toMatchObject({ highway: 'path', bicycle: 'designated', foot: 'designated' });
        // the left sidewalk and the left track stay as they were
        expect(after.entity('w3').tags.highway).toBe('footway');
        expect(after.entity('w1').tags['cycleway:right']).toBe('separate');
        expect(after.entity('w1').tags['cycleway:left']).toBe('track');
        // the extracted cycleway is gone again: the road and two footways are all the ways there are
        expect(Object.keys(after.entities).filter(id => id.startsWith('w-') && after.hasEntity(id as `w${number}`))).toEqual([]);
    });

    it('does both sides in one step', () => {
        const before = graph(road, { 2: [-8.5, 0, 100], 3: [8.5, 0, 100] });
        const action = actionExtractMergeSidepaths('w1', ['right', 'left'], undefined, undefined, nearby(before));
        const after = action(before);
        expect(action.survivorIds().sort()).toEqual(['w2', 'w3']);
        expect(after.entity('w2').tags.highway).toBe('path');
        expect(after.entity('w3').tags.highway).toBe('path');
        expect(after.entity('w1').tags['cycleway:both']).toBe('separate');
    });

    it('keeps the extraction when a side has no sidewalk way, and reports the failed merge', () => {
        const before = graph(road, { 2: [-8.5, 0, 100] });
        const both = actionExtractMergeSidepaths('w1', ['right', 'left'], undefined, undefined, nearby(before));
        expect(both.disabled!(before)).toBe(false);
        expect(both.problem(before)).toBeUndefined();

        const after = both(before);
        expect(after).not.toBe(before);
        expect(both.partialProblem()).toMatchObject({ reason: 'no_sidewalk', step: 'merge', side: 'left' });
        expect(both.survivorIds()).toHaveLength(1);
        expect(both.extractedIds()).toHaveLength(1);
        expect(after.entity(both.extractedIds()[0]).tags.highway).toBe('cycleway');
    });

    it('cuts a sidewalk that runs on past the road', () => {
        const before = graph(road, { 2: [-8.5, -50, 150] });
        const action = actionExtractMergeSidepaths('w1', ['right'], undefined, undefined, nearby(before));
        expect(action.disabled!(before)).toBe(false);
        const after = action(before);
        expect(action.survivorIds()).toHaveLength(1);
        expect(after.entity(action.survivorIds()[0]).tags.highway).toBe('path');
    });

    describe('crossing footways', () => {
        it('takes footways along the cycleway and not a crossing one', () => {
            const g = graph(road, { 2: [-8.5, 0, 100], 3: [8.5, 0, 100] });
            const crossing = [
                new iD.osmNode({ id: 'n41', loc: [lon(50), lat(-14)] }),
                new iD.osmNode({ id: 'n42', loc: [lon(50), lat(0)] }),
                new iD.osmWay({ id: 'w4', nodes: ['n41', 'n42'], tags: { highway: 'footway' } })
            ];
            const withCrossing = crossing.reduce((acc, entity) => acc.replace(entity as never), g);
            const extract = actionExtractMergeSidepaths('w1', ['right'], undefined, undefined, nearby(withCrossing));
            expect(extract.disabled!(withCrossing)).toBe(false);
            extract(withCrossing);
            expect(extract.survivorIds()).toEqual(['w2']);
        });
    });
});
