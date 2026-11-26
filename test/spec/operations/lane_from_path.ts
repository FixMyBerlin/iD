import { select as d3_select } from 'd3-selection';
import { operationsLaneFromPath } from '../../../modules/operations/lane_from_path';

describe('operationsLaneFromPath (edit menu)', () => {
    const lat = 52.5;
    const x = (m: number) => 13.4 + iD.geoMetersToLon(m, lat);
    const y = (m: number) => lat + iD.geoMetersToLat(m);
    const segregated = { highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes' };

    let cleanup: (() => void) | undefined;
    afterEach(() => {
        cleanup?.();
        cleanup = undefined;
    });

    function realContext(entities: iD.OsmEntity[]) {
        const container = d3_select('body').append('div');
        const context = iD.coreContext().assetPath('../dist/').init().container(container as never);
        container.append('div').attr('class', 'main-map').call(context.map() as never).append('div').attr('class', 'inspector-wrap');
        context.enter(iD.modeBrowse(context) as never);
        context.perform(...entities.map(entity => iD.actionAddEntity(entity)), 'setup' as never);
        cleanup = () => {
            (context.mode() as unknown as { exit(): void }).exit();
            container.remove();
        };
        return context;
    }

    function entities(pathTags: Record<string, string>, withRoad = true) {
        const n = (id: `n${number}`, mx: number, my: number) => new iD.osmNode({ id, loc: [x(mx), y(my)] });
        return [
            n('n1', 0, 0), n('n2', 100, 0), n('n4', 10, -8), n('n5', 90, -8),
            ...(withRoad ? [new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'secondary' } })] : []),
            new iD.osmWay({ id: 'w2', nodes: ['n4', 'n5'], tags: pathTags })
        ] as iD.OsmEntity[];
    }

    it('one entry with two groups (own line, on the road), each Radfahrstreifen and Schutzstreifen', () => {
        const context = realContext(entities(segregated));
        const [menu] = operationsLaneFromPath(context, ['w2']);
        expect(menu.id).toBe('lane_from_path');
        expect(menu.disabled()).toBe(false);
        expect(menu.flyout!.map(group => group.id)).toEqual(['line', 'centerline']);
        expect(menu.flyout!.flatMap(group => group.operations.map(entry => entry.id))).toEqual([
            'lane_from_path_line_exclusive', 'lane_from_path_line_advisory',
            'lane_from_path_centerline_exclusive', 'lane_from_path_centerline_advisory'
        ]);
    });

    it('runs an entry: the path and the new lane are selected, one undo step', () => {
        const context = realContext(entities(segregated));
        const [menu] = operationsLaneFromPath(context, ['w2']);
        const before = context.history().undoAnnotation();
        menu.flyout![0].operations[0]();
        expect(context.selectedIDs()).toHaveLength(2);
        expect(context.entity('w2').tags.highway).toBe('footway');
        context.undo();
        expect(context.history().undoAnnotation()).toBe(before);
        expect(context.entity('w2').tags).toEqual(segregated);
    });

    it('is disabled without a road next to it', () => {
        const context = realContext(entities(segregated, false));
        const [menu] = operationsLaneFromPath(context, ['w2']);
        expect(menu.disabled()).toBe('no_road');
    });

    it('is not offered for other ways', () => {
        const context = realContext(entities({ highway: 'footway' }));
        expect(operationsLaneFromPath(context, ['w2'])).toEqual([]);
        expect(operationsLaneFromPath(context, ['w1'])).toEqual([]);
    });
});
