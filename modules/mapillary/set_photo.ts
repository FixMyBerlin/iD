import { joinImageIds, splitImageIds, suggestedMapillaryKeys } from './tag_keys';

/**
 * Pure logic of writing the shown Mapillary image to a feature (WORKDOC feature 20, now buttons in
 * the viewer bar of feature 26): the keys offered, the suggested one and the appended value.
 */

type TagsLike = Record<string, string | string[] | undefined>;

export const DEFAULT_TARGET_KEY = 'mapillary';


/** The key the main button writes to */
export function resolveTargetKey(active: string | undefined): string {
    return active || DEFAULT_TARGET_KEY;
}


/** Value of `key` with `id` added to the `;` list (no duplicates) */
export function appendImageId(tags: TagsLike, key: string, id: string): string {
    const value = tags[key];
    const ids = splitImageIds(typeof value === 'string' ? value : undefined);
    return joinImageIds([...ids, id]) ?? id;
}


/** Value of `key` without `id`; undefined when no id is left */
export function removeImageId(tags: TagsLike, key: string, id: string): string | undefined {
    const value = tags[key];
    return joinImageIds(splitImageIds(typeof value === 'string' ? value : undefined).filter(other => other !== id));
}


export function hasImageId(tags: TagsLike, key: string, id: string): boolean {
    const value = tags[key];
    return splitImageIds(typeof value === 'string' ? value : undefined).includes(id);
}


/** The keys offered in the dropdown: the existing image keys and the likely new ones */
export function targetKeys(tags: TagsLike): string[] {
    return suggestedMapillaryKeys(tags);
}


/**
 * The image key buttons: every existing and likely image key (`targetKeys`) except `exclude` (the
 * sign's source key, which has its own button), and the suggested one: the row last chosen in the
 * Mapillary images field, else `mapillary`
 */
export function imageButtonKeys(tags: TagsLike, activeTarget: string | undefined, exclude?: string): { keys: string[]; suggested: string } {
    const keys = targetKeys(tags).filter(key => key !== exclude);
    return { keys, suggested: resolveTargetKey(activeTarget) };
}
