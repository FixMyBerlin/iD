import { processBikelanes } from '@tilda-geo/bicycle-infrastructure';
import { describe, expect, it } from 'vitest';

import { lookupKeys, requiredAttributes, roadAttributes, sideOnewayDefault } from '../../../modules/tilda/required_attributes';

function resultFor(tags: Record<string, string>, side: 'self' | 'left' | 'right') {
    const result = processBikelanes(tags).find(r => r._side === side);
    if (!result) throw new Error(`no ${side} result`);
    return result;
}

function byId(attributes: ReturnType<typeof requiredAttributes>) {
    return Object.fromEntries(attributes.map(a => [a.id, a]));
}

describe('lookupKeys', () => {
    it('reads sided keys like TILDA: side, both, plain (left only)', () => {
        expect(lookupKeys('separation:left', 'self', null)).toEqual(['separation:left', 'separation:both', 'separation']);
        expect(lookupKeys('separation:right', 'self', null)).toEqual(['separation:right', 'separation:both']);
        expect(lookupKeys('width', 'right', 'cycleway')).toEqual(['cycleway:right:width', 'cycleway:both:width', 'cycleway:width']);
    });
});

describe('requiredAttributes', () => {
    it('advisory lane on the right: side keys, surface from the road, parking inferred', () => {
        const tags = {
            highway: 'secondary', surface: 'asphalt', 'parking:right': 'lane',
            'cycleway:right': 'lane', 'cycleway:right:lane': 'advisory'
        };
        const attributes = byId(requiredAttributes(resultFor(tags, 'right'), tags));

        expect(attributes.width.key).toBe('cycleway:right:width');
        expect(attributes.width.state).toBe('missing');
        expect(attributes.surface.state).toBe('inherited');
        expect(attributes.surface.tilda).toBe('asphalt');
        expect(attributes.lane.state).toBe('ok');
        expect(attributes.traffic_mode_right.state).toBe('inherited');
        expect(attributes.traffic_mode_right.tilda).toBe('parking');
        expect(attributes.traffic_mode_right.source).toBe('parking:right=lane');
        // not coloured is the default
        expect(attributes.surface_colour.state).toBe('assumed');
        expect(attributes.surface_colour.tilda).toBe('no');
        // parking on the right → the buffer to it is needed
        expect(attributes.buffer_right.key).toBe('cycleway:right:buffer:right');
        // lanes run with the traffic: TILDA's default is reliable, a notice to check
        expect(attributes.oneway.state).toBe('assumed');
        expect(attributes.oneway.tilda).toBe('yes');
    });

    it('a chosen target category is no source for the tag that makes it', () => {
        const tags = { highway: 'secondary', 'cycleway:both': 'no' };
        const attributes = byId(requiredAttributes(resultFor(tags, 'left'), tags, 'cyclewayOnHighway_advisory'));

        expect(attributes.lane.key).toBe('cycleway:left:lane');
        expect(attributes.lane.state).toBe('missing');
    });

    it('separate cycleway needs is_sidepath', () => {
        const without = { highway: 'cycleway', 'cycleway': 'track' };
        expect(byId(requiredAttributes(resultFor(without, 'self'), without)).is_sidepath.state).toBe('missing');

        const withSidepath = { ...without, is_sidepath: 'yes' };
        expect(byId(requiredAttributes(resultFor(withSidepath, 'self'), withSidepath)).is_sidepath.state).toBe('ok');
    });

    it('shows how TILDA sanitizes values', () => {
        const tags = { highway: 'cycleway', cycleway: 'track', is_sidepath: 'yes', surface: 'cobblestone', 'surface:colour': 'orange' };
        const attributes = byId(requiredAttributes(resultFor(tags, 'self'), tags));
        expect(attributes.surface.state).toBe('ok');
        expect(attributes.surface.tilda).toBe('large_sett');
        expect(attributes.surface_colour.tilda).toBe('red');
        expect(attributes.oneway.state).toBe('guess');

        const unknown = { ...tags, surface: 'lava' };
        expect(byId(requiredAttributes(resultFor(unknown, 'self'), unknown)).surface.state).toBe('ignored');
    });

    it('asks for sett:length on sett', () => {
        const tags = { highway: 'cycleway', cycleway: 'track', is_sidepath: 'yes', surface: 'sett' };
        expect(byId(requiredAttributes(resultFor(tags, 'self'), tags)).sett_length.state).toBe('missing');
    });

    it('lists the attributes of the target category', () => {
        const tags = { highway: 'cycleway', cycleway: 'track', is_sidepath: 'yes' };
        const modes = { ...tags, 'traffic_mode:left': 'no', 'traffic_mode:right': 'no' };
        const attributes = byId(requiredAttributes(resultFor(modes, 'self'), modes, 'cyclewayOnHighwayProtected'));
        expect(Object.keys(attributes)).toEqual(expect.arrayContaining(['separation_left', 'marking_left', 'traffic_mode_left', 'traffic_mode_right']));
        expect(attributes.is_sidepath).toBeUndefined();
    });

    describe('protected lane: delimitation depends on the parking side', () => {
        const base = { highway: 'cycleway', cycleway: 'track', is_sidepath: 'yes' };
        const modes = { 'traffic_mode:left': 'no', 'traffic_mode:right': 'no' };
        const idsFor = (extra: Record<string, string>, withModes = true) => {
            const tags = { ...base, ...(withModes ? modes : {}), ...extra };
            return Object.keys(byId(requiredAttributes(resultFor(tags, 'self'), tags, 'cyclewayOnHighwayProtected')));
        };

        it('shows the delimitation only once traffic_mode is set on both sides', () => {
            for (const extra of <Record<string, string>[]>[{}, { 'traffic_mode:left': 'no' }, { 'traffic_mode:right': 'parking' }]) {
                const ids = idsFor(extra, false);
                expect(ids).toEqual(expect.arrayContaining(['traffic_mode_left', 'traffic_mode_right']));
                for (const id of ['separation_left', 'marking_left', 'buffer_left', 'separation_right', 'marking_right', 'buffer_right'])
                    expect(ids).not.toContain(id);
            }
        });

        it('asks for traffic_mode on both sides first', () => {
            const ids = idsFor({});
            expect(ids.indexOf('traffic_mode_right')).toBeGreaterThan(ids.indexOf('traffic_mode_left'));
            expect(ids.indexOf('traffic_mode_right')).toBeLessThan(ids.indexOf('separation_left'));
        });

        it('without parking on the right only the left side is needed', () => {
            for (const extra of <Record<string, string>[]>[{}, { 'traffic_mode:left': 'parking' }, { 'traffic_mode:left': 'no', 'traffic_mode:right': 'no' }]) {
                const ids = idsFor(extra);
                expect(ids).toEqual(expect.arrayContaining(['separation_left', 'marking_left']));
                expect(ids).not.toEqual(expect.arrayContaining(['separation_right']));
                expect(ids).not.toEqual(expect.arrayContaining(['marking_right']));
                expect(ids).not.toEqual(expect.arrayContaining(['buffer_right']));
            }
        });

        it('with parking on the right both sides are needed, the buffer only on the right', () => {
            const ids = idsFor({ 'traffic_mode:right': 'parking' });
            expect(ids).toEqual(expect.arrayContaining(['separation_left', 'marking_left', 'separation_right', 'marking_right', 'buffer_right']));
            expect(ids).not.toContain('buffer_left');
        });

        it('the buffer is only asked towards parking', () => {
            expect(idsFor({})).not.toContain('buffer_left');
            expect(idsFor({ 'traffic_mode:left': 'parking' })).toContain('buffer_left');
            expect(idsFor({ 'traffic_mode:left': 'parking' })).not.toContain('buffer_right');
        });
    });
});

describe('defaults (WORKDOC feature 32)', () => {
    it('surface:colour: not coloured is the default, only the colours are offered', () => {
        const tags = { highway: 'cycleway', is_sidepath: 'yes' };
        const colour = byId(requiredAttributes(resultFor(tags, 'self'), tags)).surface_colour;
        expect(colour.state).toBe('assumed');
        expect(colour.default).toBe('surface:colour=no');
        expect(colour.note).toBe('surface_colour');
        expect(colour.options).toEqual(['red', 'green', 'red;green']);
    });

    it('a tagged default stays a normal row', () => {
        const tags = { highway: 'cycleway', is_sidepath: 'yes', 'surface:colour': 'no' };
        const colour = byId(requiredAttributes(resultFor(tags, 'self'), tags)).surface_colour;
        expect(colour.state).toBe('ok');
        expect(colour.default).toBeUndefined();
    });

    it('a track on a road side: oneway is never asked for, only "both ways" is offered', () => {
        const tags = { highway: 'secondary', 'cycleway:left': 'track', 'cycleway:right': 'track' };
        const left = byId(requiredAttributes(resultFor(tags, 'left'), tags)).oneway;
        const right = byId(requiredAttributes(resultFor(tags, 'right'), tags)).oneway;
        expect(left.state).toBe('assumed');
        expect(left.key).toBe('cycleway:left:oneway');
        expect(left.default).toBe('cycleway:left:oneway=-1');
        expect(left.note).toBe('oneway_side');
        expect(left.options).toEqual(['no']);
        expect(right.default).toBe('cycleway:right:oneway=yes');
    });

    it('sideOnewayDefault: both sides of a one-way road run with the road, except the contraflow side', () => {
        expect(sideOnewayDefault({ highway: 'residential' }, 'left')).toBe('-1');
        expect(sideOnewayDefault({ highway: 'residential' }, 'right')).toBe('yes');
        expect(sideOnewayDefault({ highway: 'residential', oneway: 'yes' }, 'left')).toBe('yes');
        expect(sideOnewayDefault({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' }, 'left')).toBe('-1');
    });

    it('a separate cycleway still asks for oneway', () => {
        const tags = { highway: 'cycleway', is_sidepath: 'yes' };
        expect(byId(requiredAttributes(resultFor(tags, 'self'), tags)).oneway.state).toBe('guess');
    });

    it('one-way bicycle road: oneway:bicycle is a default too', () => {
        const tags = { highway: 'residential', bicycle_road: 'yes', oneway: 'yes' };
        const attribute = byId(requiredAttributes(resultFor(tags, 'self'), tags)).oneway_bicycle;
        expect(attribute.state).toBe('assumed');
    });
});

describe('traffic signs', () => {
    it('bike lane shared with buses: 237 with "Linienverkehr frei" (1026-32)', () => {
        const tags = { highway: 'secondary', 'cycleway:right': 'lane', 'cycleway:right:traffic_sign': 'DE:237,1026-32' };
        const result = resultFor(tags, 'right');
        expect(result.category).toBe('sharedBusLaneBikeWithBus');
        expect(byId(requiredAttributes(result, tags)).traffic_sign.options).toContain('DE:237,1026-32');
        expect(byId(requiredAttributes(result, tags)).traffic_sign.options).not.toContain('DE:237,1024-14');
    });
});

describe('bicycle roads', () => {
    it('width:effective is asked for, but optional', () => {
        const tags = { highway: 'residential', bicycle_road: 'yes', traffic_sign: 'DE:244.1' };
        const attributes = byId(requiredAttributes(resultFor(tags, 'self'), tags));
        expect(attributes.width_effective.key).toBe('width:effective');
        expect(attributes.width_effective.state).toBe('missing');
        expect(attributes.width_effective.optional).toBe(true);

        const tagged = { ...tags, 'width:effective': '3.5' };
        expect(byId(requiredAttributes(resultFor(tagged, 'self'), tagged)).width_effective.state).toBe('ok');
    });

    it('marking=no is valid although TILDA drops it; other unknown values are ignored', () => {
        const tags = { highway: 'residential', bicycle_road: 'yes', traffic_sign: 'DE:244.1' };
        const no = { ...tags, 'marking:both': 'no' };
        const attributes = byId(requiredAttributes(resultFor(no, 'self'), no));
        expect(attributes.marking_left.state).toBe('ok');
        expect(attributes.buffer_left).toBeUndefined();

        const protectedTags = { highway: 'cycleway', cycleway: 'track', is_sidepath: 'yes', 'traffic_mode:left': 'no', 'traffic_mode:right': 'no', 'marking:left': 'no' };
        const protectedAttributes = byId(requiredAttributes(resultFor(protectedTags, 'self'), protectedTags, 'cyclewayOnHighwayProtected'));
        expect(protectedAttributes.marking_left.state).toBe('ok');

        const unknown = { ...tags, 'marking:both': 'foo' };
        expect(byId(requiredAttributes(resultFor(unknown, 'self'), unknown)).marking_left.state).toBe('ignored');
    });

    it('not for other categories', () => {
        const tags = { highway: 'cycleway', is_sidepath: 'yes' };
        expect(byId(requiredAttributes(resultFor(tags, 'self'), tags)).width_effective).toBeUndefined();
    });
});

describe('roadAttributes', () => {
    it('lane without parking tags: nothing next to it is assumed', () => {
        const tags = { highway: 'secondary', 'cycleway:right': 'lane', 'cycleway:right:lane': 'exclusive' };
        const attributes = byId(requiredAttributes(resultFor(tags, 'right'), tags));
        expect(attributes.traffic_mode_right.state).toBe('assumed');

        const noParking = { ...tags, 'parking:both': 'no' };
        const derived = byId(requiredAttributes(resultFor(noParking, 'right'), noParking));
        expect(derived.traffic_mode_right.state).toBe('inherited');
        expect(derived.traffic_mode_right.source).toBe('parking:both=no');
    });

    it('Radinfra FAQ: lanes need no marking, a missing buffer is no buffer', () => {
        const tags = { highway: 'secondary', 'parking:right': 'lane', 'cycleway:right': 'lane', 'cycleway:right:lane': 'advisory' };
        const attributes = byId(requiredAttributes(resultFor(tags, 'right'), tags));
        expect(attributes.marking_right).toBeUndefined();
        expect(attributes.buffer_right.state).toBe('assumed');
    });

    it('Radinfra FAQ: the width source is asked only for a width tagged now, as source:cycleway:<side>:width', () => {
        const tags = { highway: 'secondary', 'cycleway:right': 'lane', 'cycleway:right:lane': 'advisory', 'cycleway:right:width': '1.5' };
        expect(byId(requiredAttributes(resultFor(tags, 'right'), tags)).source_width).toBeUndefined();

        const attributes = byId(requiredAttributes(resultFor(tags, 'right'), tags, undefined, new Set(['cycleway:right:width'])));
        expect(attributes.source_width.key).toBe('source:cycleway:right:width');
        expect(attributes.source_width.state).toBe('missing');
        expect(attributes.source_width.optional).toBe(false);

        const withSource = { ...tags, 'source:cycleway:right:width': 'Luftbild 2026' };
        expect(byId(requiredAttributes(resultFor(withSource, 'right'), withSource, undefined, new Set(['cycleway:right:width']))).source_width.state).toBe('ok');
    });

    it('oneway=no with oneway:bicycle=yes: names the tag TILDA reads instead', () => {
        const tags = { highway: 'cycleway', oneway: 'no', 'oneway:bicycle': 'yes' };
        const oneway = byId(requiredAttributes(resultFor(tags, 'self'), tags)).oneway;
        expect(oneway.value).toBe('no');
        expect(oneway.tilda).toBe('yes');
        expect(oneway.source).toBe('oneway:bicycle=yes');
        // without the other tag there is no source
        const plain = { highway: 'cycleway', oneway: 'yes' };
        expect(byId(requiredAttributes(resultFor(plain, 'self'), plain)).oneway.source).toBeUndefined();
    });

    it('Radinfra FAQ: bicycle roads always need the marking, the buffer only with a line', () => {
        const tags = { highway: 'residential', bicycle_road: 'yes', traffic_sign: 'DE:244.1' };
        const attributes = byId(requiredAttributes(resultFor(tags, 'self'), tags));
        expect(attributes.marking_left.state).toBe('missing');
        // on the road itself, never as `cycleway:<side>:…`; there is no separation
        expect(attributes.separation_left).toBeUndefined();
        expect(attributes.separation_right).toBeUndefined();
        expect(attributes.marking_left.key).toBe('marking:left');
        expect(attributes.marking_right.key).toBe('marking:right');
        expect(attributes.buffer_left).toBeUndefined();

        const dashed = { ...tags, 'marking:both': 'dashed_line' };
        expect(byId(requiredAttributes(resultFor(dashed, 'self'), dashed)).buffer_left.state).toBe('missing');
    });

    it('road without oneway: two-way is assumed, not asked for', () => {
        const attributes = byId(roadAttributes({ highway: 'residential' }));
        expect(attributes.oneway.state).toBe('assumed');
        expect(attributes.oneway.tilda).toBe('no');
    });

    it('one-way road: oneway:bicycle and dual_carriageway, cycleway presence from any side key', () => {
        const attributes = byId(roadAttributes({ highway: 'residential', oneway: 'yes', 'cycleway:left': 'no' }));
        // bicycles follow the one-way: a default to confirm, only `no` is offered
        expect(attributes.oneway_bicycle.state).toBe('assumed');
        expect(attributes.oneway_bicycle.default).toBe('oneway:bicycle=yes');
        expect(attributes.oneway_bicycle.options).toEqual(['no']);
        expect(attributes.dual_carriageway.state).toBe('assumed');
        expect(attributes.dual_carriageway.optional).toBe(true);
        expect(attributes.cycleway.state).toBe('ok');
        expect(attributes.cycleway.value).toBe('no');
        expect(byId(roadAttributes({ highway: 'residential', 'cycleway:left': 'no', 'cycleway:right': 'lane' })).cycleway.value).toBe('left=no, right=lane');
    });

    it('mixed traffic: no width and no width source (Leistungsbeschreibung, attribute 15)', () => {
        const attributes = byId(roadAttributes({ highway: 'residential', width: '7.5' }, new Set(['width'])));
        expect(attributes.width).toBeUndefined();
        expect(attributes.source_width).toBeUndefined();
    });

    it('not for paths', () => {
        expect(roadAttributes({ highway: 'cycleway' })).toEqual([]);
    });
});
