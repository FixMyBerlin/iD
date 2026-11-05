import { processBikelanes } from '@tilda-geo/bicycle-infrastructure';
import { describe, expect, it } from 'vitest';

import { reminders } from '../../../modules/tilda/reminders';

function remindersFor(tags: Record<string, string>, side: 'self' | 'left' | 'right' = 'self', target?: string) {
    // like the section: no result for the way itself still gets a card
    const result = processBikelanes(tags).find(r => r._side === side)
        ?? { _side: side, _prefix: null, _infrastructureExists: false, category: '' };
    return reminders(result, tags, target);
}

describe('reminders', () => {
    const track = { highway: 'cycleway', cycleway: 'track', is_sidepath: 'yes' };

    it('a cycle track along a road: damage signs and barriers', () => {
        expect(remindersFor(track)).toEqual(['damage_signs', 'barrier']);
    });

    it('the damage sign reminder goes away once a damage sign is tagged', () => {
        expect(remindersFor({ ...track, traffic_sign: 'DE:237;Radwegschäden' })).toEqual(['barrier']);
    });

    it('a separate path: damage signs, no barrier', () => {
        expect(remindersFor({ highway: 'cycleway', is_sidepath: 'no' })).toEqual(['damage_signs']);
    });

    it('no bike infrastructure: nothing, unless a target category is chosen', () => {
        expect(remindersFor({ highway: 'residential' })).toEqual([]);
        expect(remindersFor({ highway: 'residential' }, 'self', 'cycleway_adjoining')).toEqual(['damage_signs', 'barrier']);
    });
});
