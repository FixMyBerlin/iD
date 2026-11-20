import { describe, expect, it } from 'vitest';
import { addSignToValue, parseSignGroups, removeSignFromValue, signGroupsOf, signMatchesGroups, signMeaning } from '../../../modules/mapillary/sign_groups';

describe('signGroupsOf', () => {
    it('groups bike, speed and access signs', () => {
        expect(signGroupsOf('regulatory--bicycles-only--g1')).toEqual(['bike']);
        expect(signGroupsOf('complementary--except-bicycles--g1')).toEqual(['bike']);
        expect(signGroupsOf('regulatory--pedestrians-only--g2')).toEqual(['bike']);
        expect(signGroupsOf('regulatory--maximum-speed-limit-30--g1')).toEqual(['speed']);
        expect(signGroupsOf('information--living-street--g1')).toEqual(['speed']);
        expect(signGroupsOf('regulatory--no-entry--g1')).toEqual(['access']);
        expect(signGroupsOf('regulatory--bicycles-and-buses-only--g1')).toEqual(['bike', 'access']);
    });

    it('puts the rest in other, also motorcycle signs', () => {
        expect(signGroupsOf('regulatory--no-stopping--g1')).toEqual(['other']);
        expect(signGroupsOf('complementary--motorcycles--g2')).toEqual(['other']);
    });
});

describe('signMatchesGroups', () => {
    it('shows everything for no or all groups', () => {
        expect(signMatchesGroups('regulatory--no-stopping--g1', [])).toBe(true);
        expect(signMatchesGroups('regulatory--no-stopping--g1', ['bike', 'speed', 'access', 'other'])).toBe(true);
    });

    it('shows a sign in any chosen group', () => {
        expect(signMatchesGroups('regulatory--no-stopping--g1', ['bike', 'speed'])).toBe(false);
        expect(signMatchesGroups('regulatory--bicycles-and-buses-only--g1', ['access'])).toBe(true);
    });

    it('parses lists', () => {
        expect(parseSignGroups(['speed', 'nope', 'bike'])).toEqual(['bike', 'speed']);
    });
});

describe('signMeaning', () => {
    it('reads speed limits with their tags', () => {
        expect(signMeaning('regulatory--maximum-speed-limit-30--g1')).toEqual({
            signs: ['DE:274-30'],
            tags: [{ maxspeed: '30', 'source:maxspeed': 'sign' }]
        });
        expect(signMeaning('regulatory--end-of-maximum-speed-limit-30--g2')).toEqual({ signs: ['DE:278-30'] });
        expect(signMeaning('regulatory--speed-limit-zone--g1')?.tags).toEqual([
            { maxspeed: '30', 'source:maxspeed': 'DE:zone30' },
            { maxspeed: '20', 'source:maxspeed': 'DE:zone20' }
        ]);
    });

    it('knows bike signs, also with several possible signs', () => {
        expect(signMeaning('regulatory--bicycles-only--g1')).toEqual({ signs: ['DE:237'] });
        expect(signMeaning('regulatory--dual-path-pedestrians-and-bicycles--g1')?.signs).toEqual(['DE:241-31', 'DE:241-30']);
        expect(signMeaning('regulatory--end-of-bicycles-only--g2')?.signs).toEqual(['DE:244.2']);
        expect(signMeaning('regulatory--end-of-bicycles-only--g1')).toBeUndefined();
        expect(signMeaning('regulatory--no-stopping--g1')).toBeUndefined();
    });
});

describe('addSignToValue', () => {
    it('appends supplementary signs and replaces main signs', () => {
        expect(addSignToValue('DE:239', 'DE:1022-10')).toBe('DE:239,1022-10');
        expect(addSignToValue('DE:239,1022-10', 'DE:1022-10')).toBe('DE:239,1022-10');
        expect(addSignToValue('DE:240', 'DE:237')).toBe('DE:237');
        expect(addSignToValue(undefined, 'DE:1022-10')).toBe('DE:1022-10');
        expect(addSignToValue('none', 'DE:1022-10')).toBe('DE:1022-10');
    });
});

describe('removeSignFromValue', () => {
    it('takes a supplementary sign out of the value and removes a main sign with its tag', () => {
        expect(removeSignFromValue('DE:239,1022-10', 'DE:1022-10')).toBe('DE:239');
        expect(removeSignFromValue('DE:239;1022-10;1012-32', 'DE:1022-10')).toBe('DE:239;1012-32');
        expect(removeSignFromValue('DE:1022-10', 'DE:1022-10')).toBeUndefined();
        expect(removeSignFromValue('DE:237', 'DE:237')).toBeUndefined();
        expect(removeSignFromValue(undefined, 'DE:237')).toBeUndefined();
    });
});
