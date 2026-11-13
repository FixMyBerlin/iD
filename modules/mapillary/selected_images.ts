import { mapillaryImageIds } from './tag_keys';

/**
 * The images of the selected features (all image keys, WORKDOC feature 19) that are in the loaded
 * tile data, without duplicates.
 */
export function selectedFeatureImages<T extends { id: string | number }>(
    selectedTags: Array<Record<string, string | undefined>>,
    cachedImage: (id: string) => T | undefined
): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const tags of selectedTags) {
        for (const id of mapillaryImageIds(tags)) {
            if (seen.has(id)) continue;
            seen.add(id);
            const image = cachedImage(id);
            if (image) result.push(image);
        }
    }
    return result;
}
