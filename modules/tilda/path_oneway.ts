import { onewayKey } from '@tilda-geo/bicycle-infrastructure-tagging';

/**
 * Ways that pedestrians use too: paths, footways and cycleways with `foot=yes|designated` or
 * `segregated=yes` (also under construction). TILDA asks for the riding direction there as
 * `oneway:bicycle` (`onewayKey` of the tagging package), and the fork's field writes that key.
 * Pedestrians walk both ways, so a value for bikes also sets `oneway=no` (like the merge of cycleway
 * and footway does). A plain `oneway=yes` would make the way one-way for pedestrians too.
 */
export function withPathOneway(tags: Record<string, string>, changedKeys: Iterable<string>): Record<string, string> {
    if (onewayKey(tags) !== 'oneway:bicycle') return tags;
    if (![...changedKeys].includes('oneway:bicycle') || tags['oneway:bicycle'] === undefined) return tags;
    if (tags.oneway === 'no') return tags;
    return { ...tags, oneway: 'no' };
}
