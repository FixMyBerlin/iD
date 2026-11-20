import { select as d3_select } from 'd3-selection';

import { behaviorBreathe } from '../behavior/breathe';
import { behaviorHover } from '../behavior/hover';
import { behaviorLasso } from '../behavior/lasso';
import { behaviorSelect } from '../behavior/select';
import { t } from '../core/localizer';
import { modeBrowse } from './browse';
import { modeDragNode } from './drag_node';
import { services } from '../services';
import { uiTildaNoteEditor } from '../ui/tilda_note_editor';
import { utilKeybinding } from '../util';
import type { TildaNote } from '../tilda_notes/note';


/** An internal TILDA note is selected and shown in the sidebar (WORKDOC feature 29); modelled on `select_note.js` */
export function modeSelectTildaNote(context: iD.Context, selectedNoteID: string) {
    const service = services.tildaNotes;
    const keybinding = utilKeybinding('select-tilda-note');
    let _newFeature = false;

    const noteEditor: any = uiTildaNoteEditor(context)
        .on('change', function(this: unknown, note?: TildaNote) {
            context.map().pan([0, 0]);  // trigger a redraw
            if (!note) return;
            if (note.id !== selectedNoteID) {
                // the new note was saved and got its id from TILDA
                context.enter(modeSelectTildaNote(context, note.id));
                return;
            }
            (context.ui().sidebar as any).show(noteEditor.note(note));
        });

    const behaviors: any[] = [
        behaviorBreathe(),
        behaviorHover(context),
        behaviorSelect(context),
        behaviorLasso(context),
        (modeDragNode(context) as any).behavior
    ];

    function checkSelectedID() {
        const note = service.getNote(selectedNoteID);
        if (!note) context.enter(modeBrowse(context) as any);
        return note;
    }

    function selectNote() {
        if (!checkSelectedID()) return;
        context.surface()
            .selectAll('.layer-tilda-notes .tilda-note-' + selectedNoteID)
            .classed('selected', true);
    }

    function esc() {
        if (context.container().select('.combobox').size()) return;
        context.enter(modeBrowse(context) as any);
    }

    const mode = {
        id: 'select-tilda-note',
        button: 'browse',

        zoomToSelected() {
            const note = service.getNote(selectedNoteID);
            if (note) context.map().centerZoomEase(note.loc, 20);
        },

        newFeature(val: boolean) {
            _newFeature = val;
            return mode;
        },

        enter() {
            const note = checkSelectedID();
            if (!note) return;

            service.selectedID(selectedNoteID);
            behaviors.forEach(context.install);

            keybinding
                .on(t('inspector.zoom_to.key'), mode.zoomToSelected, false)
                .on('⎋', esc as any, true);

            d3_select(document).call(keybinding);

            selectNote();

            const sidebar: any = context.ui().sidebar;
            sidebar.show(noteEditor.note(note).newNote(_newFeature));

            // expand the sidebar, avoid obscuring the note if needed
            sidebar.expand(sidebar.intersects(note.extent()));

            context.map().on('drawn.select', selectNote);

            // the list has no body and no comments: read the note
            if (!note.isNew()) {
                service.loadNote(selectedNoteID, (err, loaded) => {
                    if (service.selectedID() !== selectedNoteID) return;
                    if (err && err.code === 'note_not_found') {
                        service.removeNote(note);
                        context.enter(modeBrowse(context) as any);
                        return;
                    }
                    sidebar.show(noteEditor.note(loaded || note).error(err || null));
                });
            }
        },

        exit() {
            behaviors.forEach(context.uninstall);

            d3_select(document).call(keybinding.unbind);

            context.surface()
                .selectAll('.layer-tilda-notes .selected')
                .classed('selected hover', false);

            context.map().on('drawn.select', null);
            context.ui().sidebar.hide();
            service.selectedID(null);

            // a new note without any input is dropped; with input it stays as a pin to come back to
            const note = service.getNote(selectedNoteID);
            if (note && note.isNew() && !note.newSubject && !note.newBody) {
                service.removeNote(note);
                context.map().pan([0, 0]);
            }
        }
    };

    return mode;
}
