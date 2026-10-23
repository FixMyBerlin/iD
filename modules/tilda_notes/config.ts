/**
 * Project configuration of the TILDA notes (WORKDOC feature 29), set before `context.init()`:
 *
 *     iD.tildaNotesConfig({ origin: 'https://tilda-geo.de', regionSlug: 'infravelo', folderId: 13 });
 *
 * TILDA notes are the project's internal notes (only members of the TILDA region see them),
 * next to the public OpenStreetMap notes. Without a config the feature is off.
 * API: tilda-geo `docs/External-Notes-API.md`.
 */

export type TildaNotesConfig = {
    /** TILDA instance, without a trailing slash; `null` turns the feature off */
    origin: string | null;
    /** Slug of the TILDA region the folder belongs to */
    regionSlug: string;
    /** Id of the note folder (the `key` of the `notes` URL parameter in TILDA) */
    folderId: number;
};

let _config: TildaNotesConfig = {
    origin: null,
    regionSlug: '',
    folderId: 0
};


/** Get the config, or merge in changes */
export function tildaNotesConfig(changes?: Partial<TildaNotesConfig>): TildaNotesConfig {
    if (changes) _config = { ..._config, ...changes };
    return _config;
}


export function tildaNotesConfigured(): boolean {
    return !!(_config.origin && _config.regionSlug && _config.folderId);
}


/** The notes page of the folder in TILDA, centered on `loc` ([lon, lat]) when given */
export function tildaNotesPageUrl(loc?: [number, number]): string {
    const { origin, regionSlug, folderId } = _config;
    const params = [];
    if (loc) params.push(`map=17/${loc[1].toFixed(5)}/${loc[0].toFixed(5)}`);
    params.push('v=3');
    params.push(`notes=${encodeURIComponent(JSON.stringify({ key: folderId }))}`);
    return `${origin}/regionen/${regionSlug}/hinweise?${params.join('&')}`;
}
