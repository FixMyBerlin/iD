import { joinImageIds, mapillaryKeyLabel, mapillaryKeysOf, splitImageIds } from './tag_keys';

/**
 * Row model of the Mapillary images field (WORKDOC feature 19): one row per image key,
 * one entry per image id, and the tag changes for editing, adding and removing images.
 */

type TagsLike = Record<string, string | string[] | undefined>;

export type ImageRow = {
    key: string;
    label: string;
    /** image ids; an empty string is an input that has not been filled yet */
    ids: string[];
};


/**
 * @param tags the feature's tags
 * @param pendingKeys keys that have an extra empty input ("+" was clicked)
 */
export function buildImageRows(tags: TagsLike, pendingKeys: ReadonlySet<string> = new Set()): ImageRow[] {
    return mapillaryKeysOf(tags).map(key => ({
        key,
        label: mapillaryKeyLabel(key),
        ids: [...splitImageIds(tags[key] as string), ...(pendingKeys.has(key) ? [''] : [])]
    }));
}


/** An image id from what was typed or pasted: also accepts a Mapillary URL (`…?pKey=<id>`) */
export function normalizeImageId(input: string): string {
    const trimmed = input.trim();
    const fromUrl = trimmed.match(/[?&]pKey=([\w-]+)/);
    return fromUrl ? fromUrl[1] : trimmed;
}


/** Tag change for setting the image at `index` of `key` (`index` past the end appends); an empty value removes it */
export function setImageChange(tags: TagsLike, key: string, index: number, value: string): Record<string, string | undefined> {
    const ids = splitImageIds(typeof tags[key] === 'string' ? tags[key] as string : undefined);
    const id = normalizeImageId(value);
    if (index >= ids.length) ids.push(id);
    else ids[index] = id;
    return { [key]: joinImageIds(ids) };
}


/** Tag change for removing the image at `index` of `key` */
export function removeImageChange(tags: TagsLike, key: string, index: number): Record<string, string | undefined> {
    const ids = splitImageIds(typeof tags[key] === 'string' ? tags[key] as string : undefined);
    ids.splice(index, 1);
    return { [key]: joinImageIds(ids) };
}
