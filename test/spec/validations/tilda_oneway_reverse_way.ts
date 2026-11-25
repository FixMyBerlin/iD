import { validationOnewayReverseWay } from '../../../modules/validations/tilda_rules';

describe('iD.validationOnewayReverseWay (TILDA rule oneway_reverse_way)', () => {
    function setup(tags: Record<string, string>) {
        const context = iD.coreContext().assetPath('../dist/').init();
        context.perform(
            iD.actionAddEntity(new iD.osmNode({ id: 'n1', loc: [13.4, 52.5] })),
            iD.actionAddEntity(new iD.osmNode({ id: 'n2', loc: [13.401, 52.5] })),
            iD.actionAddEntity(new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags })),
            'setup' as never
        );
        const validator = validationOnewayReverseWay(context);
        const issues = () => validator(context.entity('w1'), context.graph());
        return { context, issues };
    }

    /** Runs the "reverse the way" fix and returns the way after it */
    function reverse(tags: Record<string, string>) {
        const { context, issues } = setup(tags);
        const [issue] = issues();
        expect(issue).toBeDefined();
        const fix = issue.dynamicFixes!(context).find((candidate: { icon?: string }) => candidate.icon === 'iD-operation-reverse')!;
        expect(fix).toBeDefined();
        fix.issue = issue;
        const before = context.history().undoAnnotation();
        Reflect.apply(fix.onClick!, fix, [context]);
        const way = context.entity('w1');
        // one undo step
        context.undo();
        expect(context.history().undoAnnotation()).toBe(before);
        expect(context.entity('w1').nodes).toEqual(['n1', 'n2']);
        return { way, issuesAfter: () => setup(way.tags as Record<string, string>).issues() };
    }

    it('reverses a cycleway with oneway=-1: the nodes turn round, oneway is yes', () => {
        const { way, issuesAfter } = reverse({ highway: 'cycleway', oneway: '-1' });
        expect(way.nodes).toEqual(['n2', 'n1']);
        expect(way.tags).toEqual({ highway: 'cycleway', oneway: 'yes' });
        expect(issuesAfter()).toEqual([]);
    });

    it('reverses a foot and cycle path with oneway:bicycle=-1: oneway:bicycle is yes, the sides swap', () => {
        const { way } = reverse({
            highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes',
            oneway: 'no', 'oneway:bicycle': '-1', 'traffic_mode:right': 'foot'
        });
        expect(way.nodes).toEqual(['n2', 'n1']);
        expect(way.tags).toMatchObject({ oneway: 'no', 'oneway:bicycle': 'yes', 'traffic_mode:left': 'foot' });
        expect(way.tags['traffic_mode:right']).toBeUndefined();
    });

    it('reverses oneway=-1 together with oneway:bicycle=-1: both are yes', () => {
        const { way } = reverse({ highway: 'cycleway', oneway: '-1', 'oneway:bicycle': '-1' });
        expect(way.nodes).toEqual(['n2', 'n1']);
        expect(way.tags).toMatchObject({ oneway: 'yes', 'oneway:bicycle': 'yes' });
    });

    it('is quiet for oneway:bicycle=yes and for a road', () => {
        expect(setup({ highway: 'cycleway', oneway: 'yes' }).issues()).toEqual([]);
        expect(setup({ highway: 'residential', oneway: '-1' }).issues()).toEqual([]);
    });
});
