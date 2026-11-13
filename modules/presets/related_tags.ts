import { parseMapillaryKey } from '../mapillary/tag_keys';

/**
 * Related tags of a field (WORKDOC feature 25): tags about a field's key that have no field of their own,
 * like `source:width`, `note:width`, `check_date:surface` or `source:traffic_sign:mapillary`.
 * They show as a small line below the field they belong to. Numbered keys (`source:width:1`) are not handled.
 */

export type RelatedCategory = 'source' | 'note' | 'check_date' | 'mapillary';

export type RelatedTag = {
    key: string;
    category: RelatedCategory;
    /** the key of the field this tag is about (`width`, `cycleway:left:width`) */
    baseKey: string;
    value: string;
};

export type FieldKeys = { id: string; keys: readonly string[] };

type TagsLike = Record<string, string | string[] | undefined>;

export const RELATED_CATEGORIES: readonly RelatedCategory[] = ['source', 'note', 'check_date', 'mapillary'];

/** Categories `reveal` (the TILDA checklist's "add below") can open for any field */
export const ADDABLE_CATEGORIES: readonly RelatedCategory[] = ['source', 'note'];

/** Categories with a button in the field title */
export const BUTTON_CATEGORIES: readonly RelatedCategory[] = ['source', 'note', 'check_date'];

/**
 * Title buttons, curated: per field key, the key each button adds (`width` → `{ source: 'source:width' }`).
 * Tags that are already there always show below the field, with or without a button.
 */
export type RelatedButtons = Readonly<Record<string, Partial<Record<RelatedCategory, string>>>>;

export type RelatedButtonKey = { key: string; category: RelatedCategory; baseKey: string };


/** `source:width` → `width`; the key a Mapillary image key is about (`source:cycleway:right:traffic_sign:mapillary` → `cycleway:right:traffic_sign`) */
function mapillaryBaseKey(key: string): string | undefined {
    const parsed = parseMapillaryKey(key);
    if (!parsed || parsed.number !== undefined) return undefined;
    const base = key.replace(/^source:/, '').replace(/(^|:)mapillary(:(forward|backward))?$/, '');
    return base || undefined;
}


/** The category of `tagKey` when it is a related tag of `baseKey`, else `undefined` */
export function relatedCategoryOf(tagKey: string, baseKey: string): RelatedCategory | undefined {
    if (!baseKey || tagKey === baseKey) return undefined;
    if (tagKey === `source:${baseKey}` || tagKey === `${baseKey}:source`) return 'source';
    if ([`note:${baseKey}`, `description:${baseKey}`, `${baseKey}:note`, `${baseKey}:description`].includes(tagKey)) return 'note';
    if (tagKey === `check_date:${baseKey}` || tagKey === `${baseKey}:check_date`) return 'check_date';
    const imageBase = mapillaryBaseKey(tagKey);
    // an image of the side also belongs to the side's field (`cycleway:right:traffic_sign:mapillary` to `cycleway:right`)
    if (imageBase && (imageBase === baseKey || imageBase.startsWith(`${baseKey}:`))) return 'mapillary';
    return undefined;
}


/**
 * Assigns each related tag to the field whose key it is about. With several candidates the most
 * specific key wins (`cycleway:right:traffic_sign` over `cycleway:right`). Keys that a field edits
 * itself are never related tags.
 */
export function assignRelatedTags(fields: readonly FieldKeys[], tags: TagsLike): Map<string, RelatedTag[]> {
    const result = new Map<string, RelatedTag[]>();
    const fieldKeys = new Set(fields.flatMap(field => field.keys));

    for (const [tagKey, value] of Object.entries(tags)) {
        if (typeof value !== 'string' || value === '' || fieldKeys.has(tagKey)) continue;
        let best: { fieldID: string; tag: RelatedTag } | undefined;
        for (const field of fields) {
            for (const baseKey of field.keys) {
                const category = relatedCategoryOf(tagKey, baseKey);
                if (!category) continue;
                if (!best || baseKey.length > best.tag.baseKey.length) {
                    best = { fieldID: field.id, tag: { key: tagKey, category, baseKey, value } };
                }
            }
        }
        if (!best) continue;
        if (!result.has(best.fieldID)) result.set(best.fieldID, []);
        result.get(best.fieldID)!.push(best.tag);
    }

    for (const list of result.values()) list.sort(compareRelatedTags);
    return result;
}


export function compareRelatedTags(a: RelatedTag, b: RelatedTag) {
    return RELATED_CATEGORIES.indexOf(a.category) - RELATED_CATEGORIES.indexOf(b.category) ||
        a.baseKey.localeCompare(b.baseKey) || a.key.localeCompare(b.key);
}


/**
 * The keys the title buttons of a field open. A key of the field counts when it has a value; the
 * field's main key (`cycleway` for `check_date:cycleway`) also when any other key of the field has one.
 */
export function relatedButtonKeys(buttons: RelatedButtons, fieldKeys: readonly string[], mainKey: string | undefined, tags: TagsLike): RelatedButtonKey[] {
    const has = (key: string) => typeof tags[key] === 'string' && tags[key] !== '';
    const anyValue = fieldKeys.some(has);
    const result = new Map<string, RelatedButtonKey>();
    for (const baseKey of fieldKeys) {
        const entry = buttons[baseKey];
        if (!entry || !(has(baseKey) || (baseKey === mainKey && anyValue))) continue;
        for (const category of BUTTON_CATEGORIES) {
            const key = entry[category];
            if (key && !result.has(key)) result.set(key, { key, category, baseKey });
        }
    }
    return [...result.values()];
}


/** The key a new related tag of `category` gets: `source:width`, `note:width` */
export function newRelatedKey(category: RelatedCategory, baseKey: string): string {
    if (category === 'mapillary') return /(^|:)traffic_sign(:|$)/.test(baseKey) ? `source:${baseKey}:mapillary` : `${baseKey}:mapillary`;
    return `${category}:${baseKey}`;
}


/** All keys `revealRelated` can open below the field with these keys */
export function addableRelatedKeys(fieldKeys: readonly string[]): string[] {
    return fieldKeys.flatMap(key => ADDABLE_CATEGORIES.map(category => newRelatedKey(category, key)));
}


/**
 * Preset field id whose field (options, type) the editor of a related tag reuses: the key without
 * a road side (`source:cycleway:left:width` → `source/width`), as field ids spell keys with `/`.
 */
export function templateFieldIDs(tag: Pick<RelatedTag, 'key' | 'category'>): string[] {
    const plain = tag.key.replace(/(^|:)(cycleway|sidewalk)(:(left|right|both))?:/, '$1');
    const ids = [tag.key, plain].map(key => key.replace(/:/g, '/'));
    if (tag.category !== 'mapillary') ids.push(tag.category);
    return [...new Set(ids)];
}


/** The side or direction a related tag is about, for its label (`cycleway:left:width` → `left`) */
export function relatedSide(baseKey: string): 'left' | 'right' | 'both' | 'forward' | 'backward' | undefined {
    const match = baseKey.match(/(?:^|:)(left|right|both|forward|backward)(?::|$)/);
    return match ? match[1] as ReturnType<typeof relatedSide> : undefined;
}
