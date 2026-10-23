import { describe, expect, it } from 'vitest';

import { tildaQaClasses, tildaQaState } from '../../../modules/tilda/qa_state';

describe('tildaQaState', () => {
    it('is undefined for ways without highway, and paths without bike access', () => {
        expect(tildaQaState({ building: 'yes' })).toBeUndefined();
        expect(tildaQaState({ highway: 'footway' })).toBeUndefined();
    });

    it('unclear when TILDA cannot decide the category', () => {
        expect(tildaQaState({ highway: 'cycleway' })).toEqual({ state: 'unclear', bike: true });
    });

    it('incomplete when required tags are missing, complete when all are there', () => {
        const base = { highway: 'cycleway', cycleway: 'track', is_sidepath: 'yes' };
        expect(tildaQaState(base)!.state).toBe('incomplete');
        expect(tildaQaState({ ...base, traffic_sign: 'DE:237', width: '2', surface: 'asphalt', oneway: 'yes' })).toEqual({ state: 'complete', bike: true });
    });

    it('roads without bike infrastructure use the road checklist', () => {
        expect(tildaQaState({ highway: 'residential', 'cycleway:both': 'no', width: '8', surface: 'asphalt' })).toEqual({ state: 'complete', bike: false });
        expect(tildaQaState({ highway: 'residential' })).toEqual({ state: 'incomplete', bike: false });
    });

    it('classes are cached per tags object', () => {
        const tags = { highway: 'cycleway' };
        expect(tildaQaClasses(tags)).toBe(tildaQaClasses(tags));
        expect(tildaQaClasses(tags)).toEqual(['tilda-qa', 'tilda-qa-unclear', 'tilda-qa-bike']);
    });
});
