/**
 * Ways that pedestrians use too: paths, footways and cycleways with `foot=yes|designated` or
 * `segregated=yes`. TILDA asks for the riding direction there as `oneway:bicycle` (tagging package
 * 0.5.0, `preferredKeyAlways` of the oneway row), and the fork's field writes that key. Pedestrians
 * walk both ways, so a value for bikes also sets `oneway=no` (like the merge of cycleway and footway
 * does). A plain `oneway=yes` would make the way one-way for pedestrians too. A cycleway without foot
 * traffic keeps `oneway` (as StreetComplete's cycleway direction quest does).
 */
export function sharedWithPedestrians(tags: Record<string, string | undefined>): boolean {
    if (tags.highway === 'path' || tags.highway === 'footway') return true;
    return tags.highway === 'cycleway'
        && (tags.foot === 'yes' || tags.foot === 'designated' || tags.segregated === 'yes');
}

/** `tags` after a change; `changedKeys` are the keys the mapper set in this change */
export function withPathOneway(tags: Record<string, string>, changedKeys: Iterable<string>): Record<string, string> {
    if (!sharedWithPedestrians(tags)) return tags;
    if (![...changedKeys].includes('oneway:bicycle') || tags['oneway:bicycle'] === undefined) return tags;
    if (tags.oneway === 'no') return tags;
    return { ...tags, oneway: 'no' };
}
