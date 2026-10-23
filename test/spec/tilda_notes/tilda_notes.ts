import { describe, expect, it } from 'vitest';

import { tildaNotesConfig, tildaNotesConfigured, tildaNotesPageUrl } from '../../../modules/tilda_notes/config';
import { tildaNoteMarkdown } from '../../../modules/tilda_notes/markdown';
import { TildaNote } from '../../../modules/tilda_notes/note';
import { isTildaNoteHashId, tildaNoteHashId } from '../../../modules/tilda_notes/hash';
import { services, serviceTildaNotes } from '../../../modules/services';

describe('tilda_notes/config', () => {
    it('is off without a config and on with origin, region and folder', () => {
        expect(tildaNotesConfigured()).toBe(false);
        tildaNotesConfig({ origin: 'https://tilda.example', regionSlug: 'berlin', folderId: 7 });
        expect(tildaNotesConfigured()).toBe(true);
    });

    it('links to the folder in TILDA, centered on the note', () => {
        expect(tildaNotesPageUrl([13.4, 52.5])).toBe(
            'https://tilda.example/regionen/berlin/hinweise?map=17/52.50000/13.40000&v=3&notes=%7B%22key%22%3A7%7D'
        );
    });
});

describe('tilda_notes/note', () => {
    it('gives a new note a negative id', () => {
        const note = new TildaNote({ loc: [13.4, 52.5], status: 'open' });
        expect(note.isNew()).toBe(true);
        expect(note.isLoaded()).toBe(true);
    });

    it('is not loaded until it has comments, and keeps its id on update', () => {
        const note = new TildaNote({ id: '42', loc: [13.4, 52.5], status: 'open', subject: 'A' });
        expect(note.isNew()).toBe(false);
        expect(note.isLoaded()).toBe(false);
        const read = note.update({ body: null, comments: [] });
        expect(read.id).toBe('42');
        expect(read.subject).toBe('A');
        expect(read.isLoaded()).toBe(true);
    });
});

describe('tilda_notes/markdown', () => {
    it('renders Markdown', () => {
        expect(tildaNoteMarkdown('**fett**')).toContain('<strong>fett</strong>');
    });

    it('shows raw HTML as text', () => {
        const html = tildaNoteMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;script&gt;');
    });

    it('keeps http links (in a new tab) and drops other schemes', () => {
        const scheme = ['java', 'script:'].join('');
        const html = tildaNoteMarkdown(`[ok](https://example.org) [bad](${scheme}alert(1))`);
        expect(html).toContain('<a href="https://example.org" target="_blank" rel="noopener nofollow">ok</a>');
        expect(html).not.toContain(scheme);
        expect(html).toContain('bad');
    });

    it('turns images into links', () => {
        const html = tildaNoteMarkdown('![Foto](https://example.org/a.png)');
        expect(html).not.toContain('<img');
        expect(html).toContain('>Foto</a>');
    });
});

describe('tilda_notes/hash', () => {
    it('tells TILDA note ids from OSM note ids', () => {
        expect(isTildaNoteHashId('tilda-note/41')).toBe(true);
        expect(isTildaNoteHashId('note/41')).toBe(false);
    });

    it('gives the hash id of a selected, saved note only', () => {
        // the test setup removes all services
        const before = services.tildaNotes;
        services.tildaNotes = serviceTildaNotes;
        expect(tildaNoteHashId()).toBe(null);
        serviceTildaNotes.selectedID('-1');
        expect(tildaNoteHashId()).toBe(null);
        serviceTildaNotes.selectedID('41');
        expect(tildaNoteHashId()).toBe('tilda-note/41');
        serviceTildaNotes.selectedID(null);
        services.tildaNotes = before;
    });
});
