import { t } from '../core/localizer';
import { behaviorDraw } from '../behavior/draw';
import { modeBrowse } from './browse';
import { modeSelectTildaNote } from './select_tilda_note';
import { services } from '../services';
import { TildaNote } from '../tilda_notes/note';


/** Place a new internal TILDA note (WORKDOC feature 29); the note is saved from its editor */
export function modeAddTildaNote(context: iD.Context) {
    const mode = {
        id: 'add-tilda-note',
        button: 'tilda-note',
        icon: '#iD-icon-note',
        layerId: 'tilda-notes',
        title: t.append('tilda_notes.add.title'),
        description: t.append('tilda_notes.add.description'),
        key: '⇧' + t('modes.add_note.key'),
        enter,
        exit
    };

    const behavior: any = behaviorDraw(context)
        .on('click', add)
        .on('cancel', cancel)
        .on('finish', cancel);

    function add(loc: [number, number]) {
        const note = services.tildaNotes.replaceNote(new TildaNote({ loc, status: 'open' }));

        // force a redraw (there is no history change that would otherwise do this)
        context.map().pan([0, 0]);

        context.enter(modeSelectTildaNote(context, note.id).newFeature(true));
    }

    function cancel() {
        context.enter(modeBrowse(context) as any);
    }

    function enter() {
        context.install(behavior);
    }

    function exit() {
        context.uninstall(behavior);
    }

    return mode;
}
