import { dispatch as d3_dispatch } from 'd3-dispatch';

import { prefs } from './preferences';
import { utilRebind } from '../util/rebind';

/**
 * A favorite preset with its keyboard shortcut.
 * The shortcut is assigned once and stays fixed until the user changes it.
 */
export type PresetFavorite = {
    presetId: string;
    shortcut: string;
};

const STORAGE_KEY = 'preset-favorites';
/** Format of the first version: `{ [shortcut]: presetId }`, shortcuts derived from the order */
const LEGACY_STORAGE_KEY = 'preset_favorites';

/** Digits used by the draw modes (point, line, area) */
const RESERVED_SHORTCUTS = new Set(['1', '2', '3']);
/** Digits reachable with the left hand while the right hand is on the mouse */
const LEFT_HAND_DIGITS = '12345';
const MAX_SHORTCUT_LENGTH = 3;

export function isValidShortcut(shortcut: string) {
    return /^(0|[1-9][0-9]{0,2})$/.test(shortcut) && !RESERVED_SHORTCUTS.has(shortcut);
}

function isLeftHand(shortcut: string) {
    return [...shortcut].every(digit => LEFT_HAND_DIGITS.includes(digit));
}

/**
 * All valid shortcuts, in the order new favorites get them:
 * 1. one or two left-hand digits (4, 5, 11, 12 … 55)
 * 2. other one or two digit numbers (6 … 9, 0, 10, 16 …)
 * 3. three digit numbers, left-hand first
 */
function shortcutCandidates() {
    const all: string[] = [];
    for (let i = 0; i < 10 ** MAX_SHORTCUT_LENGTH; i++) {
        const shortcut = String(i);
        if (isValidShortcut(shortcut)) all.push(shortcut);
    }

    const rank = (shortcut: string) => {
        const short = shortcut.length <= 2;
        const leftHand = isLeftHand(shortcut);
        if (short && leftHand) return 0;
        if (short) return 1;
        return leftHand ? 2 : 3;
    };

    return all.sort((a, b) =>
        rank(a) - rank(b) ||
        a.length - b.length ||
        (a === '0' ? 1 : 0) - (b === '0' ? 1 : 0) ||  // `0` sits right of `9` on the keyboard
        Number(a) - Number(b)
    );
}

const SHORTCUT_CANDIDATES = shortcutCandidates();

/**
 * Stores the user's favorite presets and their number shortcuts in local preferences.
 *
 * - The list order is the display order. Reordering does not change shortcuts.
 * - A new favorite gets the first free shortcut from `SHORTCUT_CANDIDATES`.
 * - Setting a shortcut that another favorite uses swaps the two shortcuts.
 *
 * Events:
 *   'change' - the favorites or their shortcuts changed
 */
function createPresetFavorites() {
    const dispatch = d3_dispatch('change');

    let _favorites: PresetFavorite[] | undefined;

    function load(): PresetFavorite[] {
        if (_favorites) return _favorites;

        _favorites = parseStored() ?? parseLegacy() ?? [];
        return _favorites;
    }

    function parseStored() {
        const stored = prefs(STORAGE_KEY);
        if (!stored) return undefined;
        try {
            const parsed: unknown = JSON.parse(stored);
            if (!Array.isArray(parsed)) return undefined;
            return parsed.filter((item): item is PresetFavorite =>
                typeof item?.presetId === 'string' && typeof item?.shortcut === 'string'
            );
        } catch {
            return undefined;
        }
    }

    function parseLegacy() {
        const stored = prefs(LEGACY_STORAGE_KEY);
        if (!stored) return undefined;
        try {
            const parsed: Record<string, string> = JSON.parse(stored);
            const favorites = Object.entries(parsed)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([shortcut, presetId]) => ({ presetId, shortcut }));
            prefs(LEGACY_STORAGE_KEY, null);
            save(favorites);
            return favorites;
        } catch {
            return undefined;
        }
    }

    function save(favorites: PresetFavorite[]) {
        _favorites = favorites;
        prefs(STORAGE_KEY, JSON.stringify(favorites));
        dispatch.call('change');
    }

    function nextFreeShortcut() {
        const used = new Set(load().map(favorite => favorite.shortcut));
        return SHORTCUT_CANDIDATES.find(shortcut => !used.has(shortcut));
    }

    const presetFavorites = {
        /** Favorites in display order */
        favorites(): PresetFavorite[] {
            return [...load()];
        },

        getFavoritesInOrder(): string[] {
            return load().map(favorite => favorite.presetId);
        },

        getShortcut(presetId: string): string | undefined {
            return load().find(favorite => favorite.presetId === presetId)?.shortcut;
        },

        getPreset(shortcut: string): string | undefined {
            return load().find(favorite => favorite.shortcut === shortcut)?.presetId;
        },

        /** All shortcuts as `{ [shortcut]: presetId }` */
        getAllShortcuts(): Record<string, string> {
            return Object.fromEntries(load().map(favorite => [favorite.shortcut, favorite.presetId]));
        },

        isFavorite(presetId: string) {
            return load().some(favorite => favorite.presetId === presetId);
        },

        /** Adds the preset at the end of the list with the next free shortcut */
        addFavorite(presetId: string) {
            if (presetFavorites.isFavorite(presetId)) return presetFavorites;

            const shortcut = nextFreeShortcut();
            if (!shortcut) return presetFavorites;

            save([...load(), { presetId, shortcut }]);
            return presetFavorites;
        },

        removeFavorite(presetId: string) {
            save(load().filter(favorite => favorite.presetId !== presetId));
            return presetFavorites;
        },

        /**
         * Sets the shortcut of a favorite.
         * If another favorite uses this shortcut, that favorite gets the old shortcut.
         * Returns the preset that the shortcut was taken from, if any.
         */
        setShortcut(presetId: string, shortcut: string): string | undefined {
            if (!isValidShortcut(shortcut)) {
                throw new Error(`Invalid preset shortcut "${shortcut}"`);
            }

            const favorites = load();
            const current = favorites.find(favorite => favorite.presetId === presetId);
            if (!current || current.shortcut === shortcut) return undefined;

            const other = favorites.find(favorite => favorite.shortcut === shortcut);
            save(favorites.map(favorite => {
                if (favorite === current) return { ...favorite, shortcut };
                if (favorite === other) return { ...favorite, shortcut: current.shortcut };
                return favorite;
            }));

            return other?.presetId;
        },

        /** Changes the display order. Shortcuts stay the same. */
        reorder(orderedPresetIds: string[]) {
            const byId = new Map(load().map(favorite => [favorite.presetId, favorite]));
            save(orderedPresetIds
                .map(presetId => byId.get(presetId))
                .filter(favorite => favorite !== undefined)
            );
            return presetFavorites;
        },

        clearAll() {
            save([]);
            return presetFavorites;
        },

        /** Forget the cached state, e.g. after the preferences changed in tests */
        reset() {
            _favorites = undefined;
        }
    };

    return utilRebind(presetFavorites, dispatch, 'on');
}

export const presetFavorites = createPresetFavorites();
