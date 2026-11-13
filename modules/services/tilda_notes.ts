import { dispatch as d3_dispatch } from 'd3-dispatch';

import serviceOsm from './osm';
import { geoExtent } from '../geo';
import { utilRebind } from '../util/rebind';
import { tildaNotesConfig, tildaNotesConfigured } from '../tilda_notes/config';
import { TildaNote, type TildaNoteComment, type TildaNoteStatus } from '../tilda_notes/note';
import type { Projection } from '../geo/raw_mercator';

/**
 * Internal notes of one TILDA folder (WORKDOC feature 29). API: tilda-geo `docs/External-Notes-API.md`.
 *
 * Auth: iD's OSM access token is exchanged once for a short-lived TILDA token; all notes calls use
 * that token. The whole folder is loaded at once (a folder holds a project's notes, not a planet's)
 * and refreshed from time to time.
 */

/** Why the notes cannot be shown: `login` = not logged in to OSM; else an error code of the API */
export type TildaNotesAccess = 'ok' | 'loading' | 'login' | string;

export class TildaNotesError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, message: string) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

type ApiNote = {
    id: number;
    subject: string;
    body: string | null;
    status: TildaNoteStatus;
    createdAt: string;
    longitude: number;
    latitude: number;
    author: { id: string; name: string } | null;
    comments: TildaNoteComment[];
};

type ApiListFeature = {
    geometry: { coordinates: [number, number] };
    properties: {
        id: number;
        status: TildaNoteStatus;
        subject: string;
        authorName: string | null;
        commentCount: number;
    };
};

type Callback<T> = (err: TildaNotesError | null, result?: T) => void;

const REFRESH_AFTER = 60_000;   // ms

const dispatch = d3_dispatch('loadedNotes', 'change');

let _notes = new Map<string, TildaNote>();
let _token: { token: string; expiresAt: number } | null = null;
let _tokenRequest: Promise<string> | null = null;
let _access: TildaNotesAccess = 'loading';
let _loadedAt = 0;
let _listRequest: Promise<void> | null = null;
let _selectedID: string | null = null;
let _wasAuthenticated = false;
let _generation = 0;   // raised on reset / auth change; answers of older requests are dropped


function toError(err: unknown): TildaNotesError {
    if (err instanceof TildaNotesError) return err;
    // a blocked origin comes without CORS headers, so the browser only reports a network error
    return new TildaNotesError('network', 0, err instanceof Error ? err.message : String(err));
}


function setAccess(access: TildaNotesAccess) {
    if (_access === access) return;
    _access = access;
    dispatch.call('change');
}


async function readError(response: Response): Promise<TildaNotesError> {
    let code = 'http_' + response.status;
    let message = response.statusText;
    try {
        const json = await response.json();
        if (json && json.error) code = json.error;
        if (json && json.message) message = json.message;
    } catch {
        // not JSON: keep the HTTP status
    }
    return new TildaNotesError(code, response.status, message);
}


/** The TILDA token, requested with the OSM token when there is none or it is about to expire */
function getToken(): Promise<string> {
    if (_token && _token.expiresAt - Date.now() > 30_000) return Promise.resolve(_token.token);
    if (_tokenRequest) return _tokenRequest;

    if (!serviceOsm.authenticated()) {
        return Promise.reject(new TildaNotesError('login', 401, 'Not logged in to OpenStreetMap'));
    }

    const generation = _generation;
    const request = fetch(`${tildaNotesConfig().origin}/api/auth/osm-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceOsm.getAccessToken()}` }
    }).then(async response => {
        if (!response.ok) throw await readError(response);
        const json = await response.json();
        if (generation === _generation) {
            _token = { token: json.token, expiresAt: Date.parse(json.expiresAt) };
        }
        return json.token as string;
    }).finally(() => {
        if (_tokenRequest === request) _tokenRequest = null;
    });
    _tokenRequest = request;
    return request;
}


async function api<T>(path: string, init?: { method: string; body?: object }): Promise<T> {
    const { origin, regionSlug, folderId } = tildaNotesConfig();
    const url = `${origin}/api/notes/${encodeURIComponent(regionSlug)}/${folderId}${path}`;

    for (let attempt = 0; ; attempt++) {
        const token = await getToken();
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (init?.body) headers['Content-Type'] = 'application/json';

        const response = await fetch(url, {
            method: init?.method || 'GET',
            headers,
            body: init?.body ? JSON.stringify(init.body) : undefined
        });
        if (response.ok) return response.json();

        const error = await readError(response);
        const expired = error.code === 'token_expired' || error.code === 'invalid_token';
        if (expired && attempt === 0) {
            _token = null;
            continue;
        }
        throw error;
    }
}


function fromApiNote(json: ApiNote): TildaNote {
    return new TildaNote({
        id: String(json.id),
        loc: [json.longitude, json.latitude],
        status: json.status,
        subject: json.subject,
        body: json.body,
        authorName: json.author?.name,
        createdAt: json.createdAt,
        commentCount: json.comments.length,
        comments: json.comments
    });
}


/** Store the server's version of a note, keeping the user's unsaved input */
function storeApiNote(json: ApiNote, keepInput = true): TildaNote {
    let note = fromApiNote(json);
    const cached = _notes.get(note.id);
    if (keepInput && cached?.newComment) note = note.update({ newComment: cached.newComment });
    _notes.set(note.id, note);
    // after a write (`keepInput` false) the list answer may be older than the change: refresh soon
    if (!keepInput) _loadedAt = 0;
    dispatch.call('loadedNotes');
    return note;
}


function run<T>(promise: Promise<T>, callback?: Callback<T>) {
    promise.then(
        result => { if (callback) callback(null, result); },
        err => {
            const error = toError(err);
            // errors about the user's access concern the whole layer
            if (['login', 'invalid_osm_token', 'no_tilda_user', 'not_member'].includes(error.code)) {
                setAccess(error.code);
            }
            if (callback) callback(error);
        }
    );
}


const service = {

    title: 'tildaNotes',

    init: function() {
        // logging in or out of OSM changes who we are for TILDA
        if (!(serviceOsm as any).on) return;   // osm service not initialised
        _wasAuthenticated = serviceOsm.authenticated();
        (serviceOsm as any).on('change.tilda-notes', () => {
            // `change` also fires for other things (e.g. user details): only a login or logout matters
            const isAuthenticated = serviceOsm.authenticated();
            if (isAuthenticated === _wasAuthenticated) return;
            _wasAuthenticated = isAuthenticated;
            this.reset();
        });
    },


    reset: function() {
        _generation++;
        _notes = new Map();
        _token = null;
        _tokenRequest = null;
        _listRequest = null;
        _loadedAt = 0;
        _access = 'loading';
        dispatch.call('change');
        dispatch.call('loadedNotes');
    },


    configured: function(): boolean {
        return tildaNotesConfigured();
    },


    /** `ok` once the notes were loaded; else why they are not there */
    access: function(): TildaNotesAccess {
        return _access;
    },


    /** Load the folder's notes, at most once per `REFRESH_AFTER`; `force` to load now */
    loadNotes: function(force = false) {
        if (!tildaNotesConfigured()) return;
        if (_listRequest) return;
        if (!force && Date.now() - _loadedAt < REFRESH_AFTER) return;

        if (!serviceOsm.authenticated()) {
            setAccess('login');
            return;
        }

        const generation = _generation;
        _loadedAt = Date.now();
        const request = api<{ features: ApiListFeature[] }>('').then(json => {
            if (generation !== _generation) return;

            const next = new Map<string, TildaNote>();
            // keep notes that are not saved yet
            _notes.forEach(note => { if (note.isNew()) next.set(note.id, note); });

            json.features.forEach(feature => {
                const props = feature.properties;
                const id = String(props.id);
                const cached = _notes.get(id);
                const listProps = {
                    id,
                    loc: feature.geometry.coordinates,
                    status: props.status,
                    subject: props.subject,
                    authorName: props.authorName ?? undefined,
                    commentCount: props.commentCount
                };
                // a note that was read keeps its body and comments until it is read again
                next.set(id, cached ? cached.update(listProps) : new TildaNote(listProps));
            });
            _notes = next;
            setAccess('ok');
            dispatch.call('loadedNotes');
        }).catch(err => {
            if (generation !== _generation) return;
            setAccess(toError(err).code);
        }).finally(() => {
            if (_listRequest === request) _listRequest = null;
        });
        _listRequest = request;
    },


    /** The notes in the current viewport */
    notes: function(projection: Projection): TildaNote[] {
        const viewport = projection.clipExtent();
        const min: [number, number] = [viewport[0][0], viewport[1][1]];
        const max: [number, number] = [viewport[1][0], viewport[0][1]];
        const extent = new geoExtent(projection.invert(min), projection.invert(max)).padByMeters(50);
        return Array.from(_notes.values()).filter(note => extent.contains(note.loc));
    },


    getNote: function(id: string): TildaNote | undefined {
        return _notes.get(String(id));
    },


    /** Put a note in the cache without talking to TILDA (a new note, unsaved input) */
    replaceNote: function(note: TildaNote): TildaNote {
        _notes.set(note.id, note);
        return note;
    },


    removeNote: function(note: TildaNote) {
        _notes.delete(note.id);
    },


    selectedID: function(id?: string | null): string | null {
        if (id !== undefined) _selectedID = id;
        return _selectedID;
    },


    /** Read one note with its body and comments */
    loadNote: function(id: string, callback?: Callback<TildaNote>) {
        run(api<ApiNote>(`/${id}`).then(json => storeApiNote(json)), callback);
    },


    createNote: function(note: TildaNote, callback?: Callback<TildaNote>) {
        const body = {
            subject: note.newSubject,
            body: note.newBody,
            longitude: note.loc[0],
            latitude: note.loc[1]
        };
        run(api<ApiNote>('', { method: 'POST', body }).then(json => {
            _notes.delete(note.id);
            return storeApiNote(json, false);
        }), callback);
    },


    /** Post the unsaved reply (if any) and set the status (if given) */
    updateNote: function(note: TildaNote, newStatus: TildaNoteStatus | null, callback?: Callback<TildaNote>) {
        const send = async () => {
            let json: ApiNote | undefined;
            if (note.newComment) {
                json = await api<ApiNote>(`/${note.id}/comments`, { method: 'POST', body: { body: note.newComment } });
                // the reply is saved, also when the status change below fails
                storeApiNote(json, false);
            }
            if (newStatus) {
                json = await api<ApiNote>(`/${note.id}`, { method: 'PATCH', body: { resolved: newStatus === 'closed' } });
            }
            if (!json) return note;
            return storeApiNote(json, false);
        };
        run(send(), callback);
    }

};

type Listener = (typenames: string, callback: null | (() => void)) => void;

export default utilRebind(service, dispatch, 'on') as typeof service & { on: Listener };
