import { select as d3_select } from 'd3-selection';
import { operationsExtractSidepath } from '../../../modules/operations/extract_sidepath';
import { operationsExtractMergeSidepaths } from '../../../modules/operations/extract_merge_sidepaths';
import { operationsMergeSidepaths } from '../../../modules/operations/merge_sidepaths';
import { loadSignRecommender, loadedSignRecommender } from '../../../modules/traffic_sign/recommender';
import type { Operation } from '../../../modules/core/history';

describe('sidepath operations: keyboard shortcuts', () => {
    type EntityId = `${'c' | 'n' | 'r' | 'w'}${number}`;
    const lon = (meters: number) => 13.4 + iD.geoMetersToLon(meters, 52.5);
    const lat = (meters: number) => 52.5 + iD.geoMetersToLat(meters);

    // the sign rules are a separate bundle: a failed load means "work without rules", which is enough here
    beforeAll(async () => {
        await loadSignRecommender({ asset: () => './no-such-recommender.js' } as unknown as iD.Context).catch(() => undefined);
    });

    it('works without the sign rules', () => {
        expect(loadedSignRecommender()).toBeNull();
    });

    function context(graph: iD.Graph) {
        const showEditMenu = vi.fn();
        // flash.duration(…).iconName(…).iconClass(…).label(…)()
        const flash: Record<string, unknown> = {};
        for (const name of ['duration', 'iconName', 'iconClass']) flash[name] = () => flash;
        flash.label = () => () => undefined;
        const fake = {
            graph: () => graph,
            entity: (id: EntityId) => graph.entity(id),
            hasEntity: (id: EntityId) => graph.hasEntity(id),
            surfaceRect: () => ({ width: 800, height: 600 }),
            projection: Object.assign((loc: number[]) => [loc[0] * 0 + 100, loc[1] * 0 + 100], { invert: () => [0, 0] }),
            map: () => ({ mouse: () => [300, 200], withinEditableZoom: () => true }),
            ui: () => ({ showEditMenu, flash }),
            validator: () => ({ validate: vi.fn() }),
            perform: vi.fn(),
            enter: vi.fn(),
            hasHiddenConnections: () => false
        };
        return { fake: fake as unknown as iD.Context, showEditMenu };
    }

    function roadEntities(tags: Record<string, string>) {
        return [
            new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
            new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags })
        ];
    }

    function roadGraph(tags: Record<string, string>) {
        return new iD.coreGraph(roadEntities(tags) as unknown as iD.Graph);
    }

    /** The operation behind ⌘E: the behavior of the first entry */
    function keyOperation(operations: ReturnType<typeof operationsExtractSidepath>) {
        const behavior = operations[0].behavior as { which(): Operation };
        return behavior.which();
    }

    describe('extract', () => {
        it('has no key on the menu entries: the key does not pick one', () => {
            const { fake } = context(roadGraph({ highway: 'residential', 'cycleway:right': 'track' }));
            const operations = operationsExtractSidepath(fake, ['w1']);
            expect(operations.every(operation => operation.keys.length === 0)).toBe(true);
        });

        it('binds ⌘E once, through the first entry', () => {
            const { fake } = context(roadGraph({ highway: 'residential', 'cycleway:right': 'track', 'sidewalk:right': 'yes' }));
            const operations = operationsExtractSidepath(fake, ['w1']);
            expect(operations.length).toBeGreaterThan(1);
            expect(operations.filter(operation => operation.behavior)).toHaveLength(1);
            expect(keyOperation(operations).keys).toEqual([iD.uiCmd('⌘E')]);
        });

        it('does not bind a key for a road without anything to extract', () => {
            const { fake } = context(roadGraph({ highway: 'residential' }));
            expect(operationsExtractSidepath(fake, ['w1'])).toEqual([]);
        });

        it('extracts right away when there is one choice', () => {
            // a real context: the extract enters select mode on the new way
            const container = d3_select('body').append('div');
            const real = iD.coreContext().assetPath('../dist/').init().container(container as never);
            container.append('div').attr('class', 'main-map').call(real.map() as never).append('div').attr('class', 'inspector-wrap');
            real.enter(iD.modeBrowse(real) as never);
            real.perform(...roadEntities({ highway: 'residential', 'cycleway:right': 'track' }).map(entity => iD.actionAddEntity(entity)));

            try {
                const operations = operationsExtractSidepath(real, ['w1']);
                expect(operations).toHaveLength(1);

                const key = keyOperation(operations);
                expect(key.disabled()).toBe(false);
                key();
                expect(real.graph().entity('w1').tags['cycleway:right']).toBe('separate');
                expect(real.mode().id).toBe('select');
            } finally {
                (real.mode() as unknown as { exit(): void }).exit();
                container.remove();
            }
        });

        it('opens a menu with all choices at the pointer when there are several', async () => {
            const { fake, showEditMenu } = context(roadGraph({ highway: 'residential', 'cycleway:right': 'track', 'sidewalk:right': 'yes' }));
            const operations = operationsExtractSidepath(fake, ['w1']);
            expect(operations.length).toBeGreaterThan(1);

            // "disabled" with an interrupt: no operation runs and no "Extract" flash comes first
            const key = keyOperation(operations);
            expect(key.disabled()).toBe('choose');
            await key.interrupts!.choose();
            expect(fake.perform).not.toHaveBeenCalled();
            expect(showEditMenu).toHaveBeenCalledWith([300, 200], 'keyboard', operations);
        });

        it('anchors the menu at the road when the pointer is outside of the map', async () => {
            const { fake, showEditMenu } = context(roadGraph({ highway: 'residential', 'cycleway:right': 'track', 'sidewalk:right': 'yes' }));
            fake.map = (() => ({ mouse: () => [-20, 200], withinEditableZoom: () => true })) as unknown as typeof fake.map;
            const operations = operationsExtractSidepath(fake, ['w1']);
            await keyOperation(operations).interrupts!.choose();
            expect(showEditMenu.mock.calls[0][0]).toEqual([100, 100]);
        });
    });

    describe('extract and merge', () => {
        it('binds ⌘G once, through the first entry, for a road with a cycle track on both sides', () => {
            const { fake } = context(roadGraph({ highway: 'residential', 'cycleway:both': 'track' }));
            const operations = operationsExtractMergeSidepaths(fake, ['w1']);
            expect(operations.map(operation => operation.id)).toEqual(Array(3).fill('extract_merge_sidepaths'));
            expect(operations.every(operation => operation.keys.length === 0)).toBe(true);
            expect(keyOperation(operations).keys).toEqual([iD.uiCmd('⌘G')]);
        });

        it('offers one side for a road with one cycle track, and nothing for a protected lane', () => {
            const { fake } = context(roadGraph({ highway: 'residential', 'cycleway:right': 'track' }));
            expect(operationsExtractMergeSidepaths(fake, ['w1'])).toHaveLength(1);
            const protectedLane = context(roadGraph({ highway: 'residential', 'cycleway:right': 'lane' }));
            expect(operationsExtractMergeSidepaths(protectedLane.fake, ['w1'])).toEqual([]);
        });
    });

    describe('merge into a foot and cycle path', () => {
        function pairGraph() {
            return new iD.coreGraph([
                new iD.osmNode({ id: 'n1', loc: [lon(0), lat(0)] }),
                new iD.osmNode({ id: 'n2', loc: [lon(100), lat(0)] }),
                new iD.osmNode({ id: 'n3', loc: [lon(0), lat(3)] }),
                new iD.osmNode({ id: 'n4', loc: [lon(100), lat(3)] }),
                new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'footway', footway: 'sidewalk' } }),
                new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: { highway: 'cycleway', is_sidepath: 'yes' } })
            ] as unknown as iD.Graph);
        }

        it('binds ⌘M for a cycleway with a footway, and not ⌘C (copy)', () => {
            const { fake } = context(pairGraph());
            const [operation] = operationsMergeSidepaths(fake, ['w1', 'w2']);
            expect(operation.keys).toEqual([iD.uiCmd('⌘M')]);
            expect(operation.keys).not.toContain(iD.uiCmd('⌘C'));
            expect(operation.behavior).toBeDefined();
        });

        it('has no key for a selection that cannot be merged', () => {
            const { fake } = context(pairGraph());
            expect(operationsMergeSidepaths(fake, ['w1'])).toEqual([]);
        });
    });
});
