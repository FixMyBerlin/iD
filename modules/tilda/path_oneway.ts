/**
 * Paths and footways (also shared foot and cycle paths): TILDA reads the riding direction from
 * `oneway:bicycle`, and the fork's field writes that key. Pedestrians walk both ways there, so a
 * value for bikes also sets `oneway=no` (like the merge of cycleway and footway does). A plain
 * `oneway=yes` would make the path one-way for pedestrians too.
 */
const PATH_HIGHWAYS = new Set(['path', 'footway']);

/** `tags` after a change; `changedKeys` are the keys the mapper set in this change */
export function withPathOneway(tags: Record<string, string>, changedKeys: Iterable<string>): Record<string, string> {
    if (!PATH_HIGHWAYS.has(tags.highway ?? '')) return tags;
    if (![...changedKeys].includes('oneway:bicycle') || tags['oneway:bicycle'] === undefined) return tags;
    if (tags.oneway === 'no') return tags;
    return { ...tags, oneway: 'no' };
}
