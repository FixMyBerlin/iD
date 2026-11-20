import { modeSelectTildaNote } from '../modes/select_tilda_note';
import { services } from '../services';

/** URL hash: `id=tilda-note/<id>` for a selected TILDA note (OSM notes use `id=note/<id>`) */
const PREFIX = 'tilda-note/';


export function isTildaNoteHashId(id: string): boolean {
    return id.startsWith(PREFIX);
}


/** The hash id of the selected, saved TILDA note; `null` when none is selected */
export function tildaNoteHashId(): string | null {
    const id = services.tildaNotes?.selectedID();
    return id && +id > 0 ? PREFIX + id : null;
}


/**
 * Read the note of a hash id from TILDA, turn the layer on and select it.
 * Does nothing when the note cannot be read (not logged in, no access, gone).
 */
export function selectTildaNoteFromHash(context: iD.Context, hashId: string, moveTo: boolean) {
    const service = services.tildaNotes;
    const id = hashId.slice(PREFIX.length);
    if (!service || !service.configured() || !/^\d+$/.test(id)) return;
    if (service.selectedID() === id) return;

    service.loadNote(id, (err, note) => {
        if (err || !note) return;
        if (moveTo) context.map().centerZoom(note.loc, 17);
        const layer: any = context.layers().layer('tilda-notes');
        if (!layer.enabled()) layer.enabled(true);
        context.enter(modeSelectTildaNote(context, id) as any);
    });
}

