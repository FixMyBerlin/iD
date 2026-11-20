import type { OsmTags } from '@tilda-geo/bicycle-infrastructure';

/**
 * Between iD's tag types and the `OsmTags` of the TILDA packages, whose values may be `undefined`.
 */

/** iD tags from package tags: keys without a value are left out */
export function definedTags(tags: OsmTags): Tags {
    const result: Tags = {};
    for (const [key, value] of Object.entries(tags)) {
        if (value !== undefined) result[key] = value;
    }
    return result;
}


/** Package tags from the tags of a multiselection: keys with different values are left out */
export function singleValueTags(tags: TagsMulti): OsmTags {
    const result: OsmTags = {};
    for (const [key, value] of Object.entries(tags)) {
        if (typeof value === 'string') result[key] = value;
    }
    return result;
}
