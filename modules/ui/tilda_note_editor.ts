import { dispatch as d3_dispatch } from 'd3-dispatch';

import { t } from '../core/localizer';
import { modeBrowse } from '../modes/browse';
import { services } from '../services';
import { svgIcon } from '../svg/icon';
import { tildaNotesConfig, tildaNotesPageUrl } from '../tilda_notes/config';
import { tildaNoteMarkdown } from '../tilda_notes/markdown';
import { utilNoAuto, utilRebind } from '../util';
import { localeDateString } from '../util/date';
import type { TildaNote, TildaNoteStatus } from '../tilda_notes/note';
import type { TildaNotesError } from '../services/tilda_notes';

type Selection = d3.Selection<any>;
type Post = { author?: string; date?: string; markdown: string | null };

const ACCESS_ERRORS = ['login', 'invalid_osm_token', 'no_tilda_user', 'not_member'];


/**
 * Sidebar editor of an internal TILDA note (WORKDOC feature 29): subject, text and replies,
 * a reply box, resolve / reopen. Edit, delete and folders stay in TILDA.
 * It reuses the styles of the OSM note editor and marks itself as internal.
 */
export function uiTildaNoteEditor(context: iD.Context) {
    const dispatch = d3_dispatch('change');
    const service = services.tildaNotes;

    let _note: TildaNote;
    let _newNote = false;
    let _error: TildaNotesError | null = null;
    let _saving = false;
    let _selection: Selection | null = null;


    function noteEditor(selection: Selection) {
        _selection = selection;
        selection.html('');

        const header = selection.append('div')
            .attr('class', 'header fillL');

        header.append('button')
            .attr('class', 'close')
            .attr('title', t('icons.close'))
            .on('click', () => context.enter(modeBrowse(context) as any))
            .call(svgIcon('#iD-icon-close', ''));

        header.append('h2')
            .call(t.append('tilda_notes.title'));

        const editor = selection.append('div')
            .attr('class', 'body')
            .append('div')
            .attr('class', 'modal-section note-editor tilda-note-editor');

        editor.append('div')
            .attr('class', 'tilda-note-private')
            .call(svgIcon('#fas-lock', 'inline'))
            .append('span')
            .call(t.append('tilda_notes.private'));

        editor
            .call(renderHeader)
            .call(renderThread)
            .call(renderNotice);

        const isSelected = service.selectedID() === _note.id;
        if (isSelected) editor.call(renderSave);

        if (!_note.isNew()) {
            selection.append('div')
                .attr('class', 'footer')
                .append('a')
                .attr('class', 'view-on-osm')
                .attr('target', '_blank')
                .attr('rel', 'noopener')
                .attr('href', tildaNotesPageUrl(_note.loc))
                .call(svgIcon('#iD-icon-out-link', 'inline'))
                .append('span')
                .call(t.append('tilda_notes.open_in_tilda'));
        }
    }


    function renderHeader(selection: Selection) {
        const header = selection.append('div')
            .attr('class', 'note-header tilda-note-header');

        const icon = header.append('div')
            .attr('class', 'note-header-icon tilda-note ' + _note.status)
            .classed('new', _note.isNew());

        icon.append('div')
            .attr('class', 'preset-icon-28')
            .call(svgIcon('#iD-icon-note', 'note-fill'));

        const annotation = icon.append('div')
            .attr('class', 'note-icon-annotation');
        if (_note.isNew()) {
            annotation.call(svgIcon('#iD-icon-plus', 'icon-annotation'));
        } else if (_note.status === 'open') {
            annotation.append('span').attr('class', 'tilda-note-annotation').text('?');
        } else {
            annotation.call(svgIcon('#iD-icon-apply', 'icon-annotation'));
        }

        const label = header.append('div')
            .attr('class', 'note-header-label');

        if (_note.isNew()) {
            label.call(t.append('tilda_notes.new'));
            return;
        }

        label.append('div')
            .attr('class', 'tilda-note-subject')
            .text(_note.subject || '');

        const meta = label.append('div')
            .attr('class', 'tilda-note-meta');
        meta.append('span')
            .attr('class', 'tilda-note-status ' + _note.status)
            .call(t.append('tilda_notes.status.' + _note.status));
        meta.append('span')
            .text(` · #${_note.id}`);
        if (!_note.isLoaded() && _note.commentCount) {
            meta.append('span').text(' · ');
            meta.append('span').call(t.append('tilda_notes.replies', { count: _note.commentCount }));
        }
    }


    function renderThread(selection: Selection) {
        if (_note.isNew()) return;

        const thread = selection.append('div')
            .attr('class', 'comments-container');

        if (!_note.isLoaded()) {
            thread.append('div')
                .attr('class', 'comment tilda-note-loading')
                .append('div')
                .attr('class', 'comment-main')
                .call(t.append(_error ? 'tilda_notes.not_loaded' : 'tilda_notes.loading'));
            return;
        }

        const posts: Post[] = [
            { author: _note.authorName, date: _note.createdAt, markdown: _note.body ?? null },
            ...(_note.comments || []).map(comment => ({
                author: comment.author?.name,
                date: comment.createdAt,
                markdown: comment.body
            }))
        ];

        const main = thread.selectAll('.comment')
            .data(posts)
            .enter()
            .append('div')
            .attr('class', 'comment')
            .append('div')
            .attr('class', 'comment-main');

        const metadata = main.append('div')
            .attr('class', 'comment-metadata');

        metadata.append('div')
            .attr('class', 'comment-author')
            .text(d => d.author || t('note.anonymous'));

        metadata.append('div')
            .attr('class', 'comment-date')
            .text(d => d.date ? localeDateString(d.date) : '');

        main.append('div')
            .attr('class', 'comment-text tilda-note-markdown')
            .html(d => tildaNoteMarkdown(d.markdown || `_${t('tilda_notes.no_body')}_`));
    }


    /** Why the note cannot be read or changed, with what to do about it */
    function renderNotice(selection: Selection) {
        const access = service.access();
        const code = _error ? _error.code : (ACCESS_ERRORS.includes(access) ? access : null);
        if (!code) return;

        const known = ACCESS_ERRORS.includes(code) || code === 'network';
        const notice = selection.append('div')
            .attr('class', 'field-warning tilda-note-notice');

        notice.call(svgIcon('#iD-icon-alert', 'inline'));
        notice.append('span')
            .call(known
                ? t.append('tilda_notes.errors.' + code)
                : t.append('tilda_notes.errors.other', { message: _error?.message || code }));

        if (code === 'login' || code === 'invalid_osm_token') {
            notice.append('a')
                .attr('href', '#')
                .on('click', d3_event => {
                    d3_event.preventDefault();
                    (services.osm as any).authenticate();
                })
                .call(t.append('login'));
        } else if (code === 'no_tilda_user' || code === 'not_member') {
            notice.append('a')
                .attr('target', '_blank')
                .attr('rel', 'noopener')
                .attr('href', tildaNotesConfig().origin)
                .call(t.append('tilda_notes.open_tilda'));
        }
    }


    function renderSave(selection: Selection) {
        const save = selection.append('div')
            .attr('class', 'note-save save-section cf');

        if (_note.isNew()) {
            save.append('h4')
                .call(t.append('tilda_notes.subject'));

            const subject = save.append('input')
                .attr('type', 'text')
                .attr('class', 'tilda-note-subject-input')
                .attr('maxlength', 200)
                .attr('placeholder', t('tilda_notes.subject'))
                .property('value', _note.newSubject || '')
                .call(utilNoAuto)
                .on('input', function() { input('newSubject', this.value); })
                .on('keydown', keydown);

            save.append('h4')
                .call(t.append('tilda_notes.body'));

            save.append('textarea')
                .attr('class', 'new-comment-input')
                .attr('placeholder', t('tilda_notes.body_placeholder'))
                .property('value', _note.newBody || '')
                .call(utilNoAuto)
                .on('input', function() { input('newBody', this.value); })
                .on('keydown', keydown);

            if (_newNote) subject.node()!.focus();
        } else {
            save.append('h4')
                .call(t.append('tilda_notes.reply'));

            save.append('textarea')
                .attr('class', 'new-comment-input')
                .attr('placeholder', t('tilda_notes.reply_placeholder'))
                .property('value', _note.newComment || '')
                .call(utilNoAuto)
                .on('input', function() { input('newComment', this.value); })
                .on('keydown', keydown);
        }

        save.append('p')
            .attr('class', 'note-save-prose tilda-note-prose')
            .call(t.append('tilda_notes.save_explanation'));

        save.append('div')
            .attr('class', 'buttons');

        updateButtons();
    }


    function input(key: 'newSubject' | 'newBody' | 'newComment', value: string) {
        _note = service.replaceNote(_note.update({ [key]: value.trim() || undefined }));
        updateButtons();
    }


    // fast submit with cmd/ctrl + enter
    function keydown(d3_event: KeyboardEvent) {
        if (d3_event.key !== 'Enter' || !(d3_event.metaKey || d3_event.ctrlKey)) return;
        d3_event.preventDefault();
        if (_note.isNew()) {
            if (canSaveNew()) saveNew();
        } else if (_note.newComment) {
            update(null);
        }
    }


    function canWrite() {
        return !_saving && !ACCESS_ERRORS.includes(service.access());
    }

    function canSaveNew() {
        return canWrite() && !!_note.newSubject && !!_note.newBody;
    }


    function updateButtons() {
        if (!_selection) return;
        const buttons = _selection.select<HTMLElement>('.note-save .buttons');
        if (buttons.empty()) return;
        buttons.html('');

        if (_note.isNew()) {
            buttons.append('button')
                .attr('class', 'button cancel-button secondary-action')
                .call(t.append('confirm.cancel'))
                .on('click', cancel);

            buttons.append('button')
                .attr('class', 'button save-button action')
                .attr('disabled', canSaveNew() ? null : true)
                .call(t.append('tilda_notes.save'))
                .on('click', saveNew);
            return;
        }

        const isOpen = _note.status === 'open';
        const withReply = _note.newComment ? '_reply' : '';
        const nextStatus: TildaNoteStatus = isOpen ? 'closed' : 'open';

        buttons.append('button')
            .attr('class', 'button status-button action')
            .attr('disabled', canWrite() ? null : true)
            .call(t.append(`tilda_notes.${isOpen ? 'resolve' : 'reopen'}${withReply}`))
            .on('click', () => update(nextStatus));

        buttons.append('button')
            .attr('class', 'button comment-button action')
            .attr('disabled', canWrite() && _note.newComment ? null : true)
            .call(t.append('tilda_notes.save_reply'))
            .on('click', () => update(null));
    }


    function cancel() {
        service.removeNote(_note);
        context.enter(modeBrowse(context) as any);
    }


    function done(err: TildaNotesError | null, note?: TildaNote) {
        _saving = false;
        _error = err;
        if (note) _note = note;
        // on an error the input stays in the cached note, so nothing is lost
        dispatch.call('change', undefined, err ? service.getNote(_note.id) || _note : note);
    }


    function saveNew() {
        _saving = true;
        updateButtons();
        service.createNote(_note, done);
    }


    function update(newStatus: TildaNoteStatus | null) {
        _saving = true;
        updateButtons();
        service.updateNote(_note, newStatus, done);
    }


    noteEditor.note = function(val: TildaNote) {
        _note = val;
        return noteEditor;
    };

    noteEditor.newNote = function(val: boolean) {
        _newNote = val;
        return noteEditor;
    };

    noteEditor.error = function(val: TildaNotesError | null) {
        _error = val;
        return noteEditor;
    };


    return utilRebind(noteEditor, dispatch, 'on');
}
