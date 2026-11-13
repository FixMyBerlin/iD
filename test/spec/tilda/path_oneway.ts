import { withPathOneway } from '../../../modules/tilda/path_oneway';


describe('tilda/path_oneway', () => {
    const path = { highway: 'path', bicycle: 'designated', foot: 'designated' };

    it('a bike direction on a path or footway also sets oneway=no', () => {
        expect(withPathOneway({ ...path, 'oneway:bicycle': 'yes' }, ['oneway:bicycle']))
            .toEqual({ ...path, 'oneway:bicycle': 'yes', oneway: 'no' });
        expect(withPathOneway({ highway: 'footway', bicycle: 'yes', 'oneway:bicycle': 'no' }, ['oneway:bicycle']).oneway).toBe('no');
        // an old `oneway=yes` (pedestrians too) becomes `no`
        expect(withPathOneway({ ...path, oneway: 'yes', 'oneway:bicycle': '-1' }, ['oneway:bicycle']).oneway).toBe('no');
    });

    it('nothing else changes', () => {
        // the bike direction was not changed now
        const old = { ...path, oneway: 'yes', 'oneway:bicycle': 'yes' };
        expect(withPathOneway(old, ['surface'])).toBe(old);
        // removed
        expect(withPathOneway({ ...path }, ['oneway:bicycle'])).toEqual(path);
        // cycleways and roads keep `oneway`
        const cycleway = { highway: 'cycleway', 'oneway:bicycle': 'yes' };
        expect(withPathOneway(cycleway, ['oneway:bicycle'])).toBe(cycleway);
        const road = { highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' };
        expect(withPathOneway(road, ['oneway:bicycle'])).toBe(road);
    });
});
