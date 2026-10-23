import { isValidShortcut, presetFavorites } from '../../../modules/core/preset_favorites';
import { prefs } from '../../../modules/core/preferences';


describe('presetFavorites', () => {
    beforeEach(() => {
        prefs('preset-favorites', null);
        prefs('preset_favorites', null);
        presetFavorites.reset();
    });

    describe('isValidShortcut', () => {
        it('accepts numbers with up to 3 digits', () => {
            expect(isValidShortcut('4')).toBe(true);
            expect(isValidShortcut('0')).toBe(true);
            expect(isValidShortcut('42')).toBe(true);
            expect(isValidShortcut('999')).toBe(true);
        });

        it('rejects draw mode keys, leading zeros, letters and long numbers', () => {
            expect(isValidShortcut('1')).toBe(false);
            expect(isValidShortcut('3')).toBe(false);
            expect(isValidShortcut('05')).toBe(false);
            expect(isValidShortcut('8a')).toBe(false);
            expect(isValidShortcut('1000')).toBe(false);
            expect(isValidShortcut('')).toBe(false);
        });
    });

    describe('addFavorite', () => {
        it('assigns left-hand shortcuts first', () => {
            ['a', 'b', 'c', 'd'].forEach(id => presetFavorites.addFavorite(id));
            expect(presetFavorites.favorites().map(f => f.shortcut)).toEqual(['4', '5', '11', '12']);
        });

        it('keeps shortcuts fixed when a favorite is removed', () => {
            ['a', 'b', 'c'].forEach(id => presetFavorites.addFavorite(id));
            presetFavorites.removeFavorite('a');
            expect(presetFavorites.getShortcut('b')).toBe('5');
            expect(presetFavorites.getShortcut('c')).toBe('11');

            presetFavorites.addFavorite('d');
            expect(presetFavorites.getShortcut('d')).toBe('4');
        });

        it('does not add a favorite twice', () => {
            presetFavorites.addFavorite('a').addFavorite('a');
            expect(presetFavorites.favorites()).toHaveLength(1);
        });
    });

    describe('setShortcut', () => {
        it('swaps shortcuts on conflict', () => {
            ['a', 'b'].forEach(id => presetFavorites.addFavorite(id));
            const takenFrom = presetFavorites.setShortcut('b', '4');
            expect(takenFrom).toBe('a');
            expect(presetFavorites.getShortcut('a')).toBe('5');
            expect(presetFavorites.getShortcut('b')).toBe('4');
        });

        it('throws on invalid shortcuts', () => {
            presetFavorites.addFavorite('a');
            expect(() => presetFavorites.setShortcut('a', '2')).toThrow();
        });
    });

    describe('reorder', () => {
        it('changes the order but not the shortcuts', () => {
            ['a', 'b'].forEach(id => presetFavorites.addFavorite(id));
            presetFavorites.reorder(['b', 'a']);
            expect(presetFavorites.getFavoritesInOrder()).toEqual(['b', 'a']);
            expect(presetFavorites.getShortcut('a')).toBe('4');
        });
    });

    it('migrates the legacy format', () => {
        prefs('preset_favorites', JSON.stringify({ '9': 'b', '8': 'a' }));
        expect(presetFavorites.favorites()).toEqual([
            { presetId: 'a', shortcut: '8' },
            { presetId: 'b', shortcut: '9' }
        ]);
        expect(prefs('preset_favorites')).toBeNull();
    });
});
