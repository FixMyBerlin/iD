/**
 * Project configuration of the Mapillary layer (WORKDOC feature 18), set before `context.init()`:
 *
 *     iD.mapillaryConfig({ highlightUsers: ['radinfra'], highlightOrgs: ['fixmycity'] });
 *
 * URL parameters (`photo_dates`, `photo_highlight_users`, `photo_highlight_orgs`, `photo_sign_groups`) win over this.
 */

export type MapillaryConfig = {
    /** Default "from" date of the age filter (`YYYY-MM-DD`), used when the URL has no `photo_dates`; `null` for no default */
    defaultFromDate: string | null;
    /** Usernames whose images are highlighted */
    highlightUsers: string[];
    /** Organization slugs whose images are highlighted */
    highlightOrgs: string[];
    /** Traffic sign groups shown by default (`bike`, `speed`, `access`, `other`; WORKDOC feature 26); empty = all */
    signGroups: string[];
};

let _config: MapillaryConfig = {
    defaultFromDate: '2024-01-01',
    highlightUsers: [],
    highlightOrgs: [],
    signGroups: []
};


/** Get the config, or merge in changes */
export function mapillaryConfig(changes?: Partial<MapillaryConfig>): MapillaryConfig {
    if (changes) _config = { ..._config, ...changes };
    return _config;
}


/** Comma or semicolon separated list, trimmed, without empty parts and duplicates */
export function parseList(value: string | null | undefined): string[] {
    if (!value) return [];
    const parts = value.replace(/;/g, ',').split(',').map(part => part.trim()).filter(Boolean);
    return [...new Set(parts)];
}


/**
 * A URL value wins over the configured list, also when it is empty (the user cleared the list);
 * an absent URL value falls back to the config
 */
export function effectiveList(urlValue: string | null | undefined, configured: string[]): string[] {
    if (urlValue === null || urlValue === undefined) return configured;
    return parseList(urlValue);
}


/**
 * The value to keep for a list the user entered: `null` (no URL parameter) when it equals the
 * configured list, else the joined list (`''` when the user cleared it)
 */
export function listOverride(value: string | null | undefined, configured: string[]): string | null {
    const list = parseList(value);
    const same = list.length === configured.length && list.every((item, i) => item === configured[i]);
    return same ? null : list.join(',');
}
