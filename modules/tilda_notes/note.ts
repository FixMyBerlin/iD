import { geoExtent } from '../geo';

export type TildaNoteStatus = 'open' | 'closed';

export type TildaNoteAuthor = { id: string; name: string };

export type TildaNoteComment = {
    id: number;
    body: string;
    createdAt: string;
    updatedAt: string;
    author: TildaNoteAuthor;
    isAuthor: boolean;
};

export type TildaNoteProps = {
    id?: string;
    loc: [number, number];
    status: TildaNoteStatus;
    subject?: string;
    /** Markdown; `null` when the note has only a subject; `undefined` until the note was read */
    body?: string | null;
    authorName?: string;
    createdAt?: string;
    commentCount?: number;
    /** `undefined` until the note was read (the list has no comments) */
    comments?: TildaNoteComment[];
    /** Unsaved input, kept with the note so it survives a redraw */
    newSubject?: string;
    newBody?: string;
    newComment?: string;
};

let _nextId = -1;


/**
 * An internal TILDA note. Its own class (not `osmNote`), so that the select and hover behaviors
 * can tell the private TILDA notes from the public OpenStreetMap notes.
 */
export class TildaNote {
    readonly type = 'tilda-note';
    id!: string;
    loc!: [number, number];
    status!: TildaNoteStatus;
    subject?: string;
    body?: string | null;
    authorName?: string;
    createdAt?: string;
    commentCount?: number;
    comments?: TildaNoteComment[];
    newSubject?: string;
    newBody?: string;
    newComment?: string;

    constructor(props: TildaNoteProps) {
        Object.assign(this, props);
        if (!this.id) this.id = String(_nextId--);
    }

    extent() {
        return new geoExtent(this.loc);
    }

    update(attrs: Partial<TildaNoteProps>): TildaNote {
        return new TildaNote({ ...this, ...attrs });
    }

    isNew(): boolean {
        return +this.id < 0;
    }

    /** `false` while only the list data is there (no body, no comments) */
    isLoaded(): boolean {
        return this.isNew() || this.comments !== undefined;
    }
}
