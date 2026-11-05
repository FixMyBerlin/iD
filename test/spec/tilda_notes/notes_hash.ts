import { describe, expect, it } from 'vitest';

import { notesHashHas, notesHashWith } from '../../../modules/tilda_notes/notes_hash';

describe('notes hash parameter', () => {
    it('lists the note layers that are on; upstream\'s `true` is the OSM notes', () => {
        expect(notesHashHas('true', 'osm')).toBe(true);
        expect(notesHashHas('true', 'tilda')).toBe(false);
        expect(notesHashHas('osm,tilda', 'tilda')).toBe(true);
        expect(notesHashHas('tilda', 'osm')).toBe(false);
        expect(notesHashHas(undefined, 'osm')).toBe(false);
    });

    it('adds and removes a layer, in a fixed order; nothing on removes the parameter', () => {
        expect(notesHashWith(undefined, 'tilda', true)).toBe('tilda');
        expect(notesHashWith('tilda', 'osm', true)).toBe('osm,tilda');
        expect(notesHashWith('true', 'tilda', true)).toBe('osm,tilda');
        expect(notesHashWith('osm,tilda', 'osm', false)).toBe('tilda');
        expect(notesHashWith('tilda', 'tilda', false)).toBeNull();
    });
});
