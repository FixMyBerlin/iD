/**
 * Highlighted Mapillary users and organizations (WORKDOC feature 18).
 * Tiles only carry `creator_id` and `organization_id`. Usernames are resolved to creator ids with
 * `images?creator_username=`, organization slugs by resolving each organization id seen in the tiles
 * with `/{id}?fields=slug`. Everything is cached for the session.
 */

export type HighlightSubject = {
    creator_id?: string | number;
    organization_id?: string | number;
};

type FetchJson = (url: string) => Promise<any>;

export function createHighlightResolver(fetchJson: FetchJson, onResolved: () => void) {
    /** lower case username -> creator id (`null`: not found) */
    const creatorIds = new Map<string, string | null>();
    /** organization id -> lower case slug (`null`: not found) */
    const orgSlugs = new Map<string, string | null>();
    const pending = new Set<string>();

    function request(key: string, url: string, done: (json: any) => void) {
        if (pending.has(key)) return;
        pending.add(key);
        fetchJson(url)
            .then(done)
            .catch(() => done(null))
            .then(() => onResolved());
    }

    function lookupUser(name: string) {
        if (creatorIds.has(name)) return;
        request('u:' + name,
            `https://graph.mapillary.com/images?creator_username=${encodeURIComponent(name)}&limit=1&fields=creator`,
            json => creatorIds.set(name, json?.data?.[0]?.creator?.id ?? null));
    }

    function lookupOrg(id: string) {
        if (orgSlugs.has(id)) return;
        request('o:' + id,
            `https://graph.mapillary.com/${encodeURIComponent(id)}?fields=slug`,
            json => orgSlugs.set(id, json?.slug ? String(json.slug).toLowerCase() : null));
    }

    return {
        /** Whether the subject belongs to a listed user or organization; starts lookups for what is not yet known */
        isHighlighted(subject: HighlightSubject, users: string[], orgs: string[]): boolean {
            let hit = false;
            if (subject.creator_id !== undefined && subject.creator_id !== null) {
                const creator = String(subject.creator_id);
                for (const user of users) {
                    const name = user.toLowerCase();
                    lookupUser(name);
                    if (creatorIds.get(name) === creator) hit = true;
                }
            }
            if (subject.organization_id !== undefined && subject.organization_id !== null && orgs.length) {
                const orgId = String(subject.organization_id);
                lookupOrg(orgId);
                const slug = orgSlugs.get(orgId);
                if (slug && orgs.some(org => org.toLowerCase() === slug)) hit = true;
            }
            return hit;
        },
        /** Start user lookups even before an image is seen */
        prefetchUsers(users: string[]) {
            users.forEach(user => lookupUser(user.toLowerCase()));
        }
    };
}
