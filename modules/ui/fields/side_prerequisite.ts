import type { Selection } from 'd3-selection';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';

/**
 * Side prerequisites: iD's field option `prerequisiteTag`, per side.
 *
 * A field with keys per side (like the directional combo `cycleway:left:lane` / `cycleway:right:lane`)
 * can name the side in the prerequisite key: `{ key: 'cycleway:{side}', value: 'lane' }`.
 * - The field is allowed when the prerequisite holds on at least one side (or a value is present).
 * - A side where it does not hold is disabled, and its placeholder says which field to change first.
 *
 * The value of `cycleway:{side}` on the right side is read from `cycleway:right`, then `cycleway:both`,
 * then `cycleway`. The other options (`value`, `values`, `valueNot`, `valuesNot`) work like upstream's.
 */
export type PrerequisiteTag = {
    key?: string;
    keyNot?: string;
    value?: string;
    values?: string[];
    valueNot?: string;
    valuesNot?: string[];
};

type SidePrerequisiteTag = PrerequisiteTag & { key: string };

type FieldLike = {
    key?: string;
    keys?: string[];
    prerequisiteTag?: PrerequisiteTag;
    title: () => string;
    t: ((scope: string, options?: Record<string, unknown>) => string);
    hasTextForStringId: (id: string) => boolean;
};

const SIDE = '{side}';
const SIDE_IN_KEY = /:(left|right|forward|backward)(?=:|$)/;


export function isSidePrerequisite(prerequisite: PrerequisiteTag | undefined): prerequisite is SidePrerequisiteTag {
    return !!prerequisite?.key?.includes(SIDE);
}


export function sideOfKey(key: string) {
    return SIDE_IN_KEY.exec(key)?.[1];
}


/** The side's value of `pattern` (e.g. `cycleway:{side}`): the side key, else `:both`, else the key without side */
export function sideValue(tags: Tags, pattern: string, side: string): string | undefined {
    return tags[pattern.replace(SIDE, side)]
        ?? tags[pattern.replace(SIDE, 'both')]
        ?? tags[pattern.replace(`:${SIDE}`, '')];
}


/** A value for `key` itself, also through its `:both` or side-less form */
function hasOwnValue(tags: Tags, key: string, side: string) {
    return !!(tags[key]
        || tags[key.replace(`:${side}`, ':both')]
        || tags[key.replace(`:${side}`, '')]);
}


export function matchesPrerequisite(prerequisite: PrerequisiteTag, value: string | undefined) {
    const v = value || '';
    if (prerequisite.valuesNot) return !prerequisite.valuesNot.includes(v);
    if (prerequisite.valueNot) return prerequisite.valueNot !== v;
    if (prerequisite.values) return prerequisite.values.includes(v);
    if (prerequisite.value) return prerequisite.value === v;
    return !!v;
}


/** For `uiField.isAllowed`: on every entity, the prerequisite holds on at least one side of the field */
export function sidePrerequisiteAllowed(prerequisite: SidePrerequisiteTag, keys: string[], tagsList: Tags[]) {
    const sides = keys.map(sideOfKey).filter((side): side is string => !!side);
    return tagsList.every(tags => sides.some(side => matchesPrerequisite(prerequisite, sideValue(tags, prerequisite.key, side))));
}


/** The common forms of a side key: `cycleway:right:lane` → `cycleway:both:lane`, `cycleway:lane` */
function commonKeys(key: string, side: string) {
    return [key.replace(`:${side}`, ':both'), key.replace(`:${side}`, '')];
}


/**
 * Removes the side values that a change made pointless: for each field with a side prerequisite,
 * a side whose prerequisite held in `before` but not in `after` loses its value of that field
 * (e.g. `cycleway:right=lane` → `no` removes `cycleway:right:lane`). A value in a common key
 * (`cycleway:both:lane`) is first written to the other sides. Data that did not match before stays.
 */
export function removeUnmetSideValues(fields: Pick<FieldLike, 'keys' | 'prerequisiteTag'>[], before: Tags, after: Tags): Tags {
    let tags = after;
    for (const field of fields) {
        const prerequisite = field.prerequisiteTag;
        if (!isSidePrerequisite(prerequisite) || !field.keys) continue;

        for (const key of field.keys) {
            const side = sideOfKey(key);
            if (!side) continue;
            const held = matchesPrerequisite(prerequisite, sideValue(before, prerequisite.key, side));
            const holds = matchesPrerequisite(prerequisite, sideValue(tags, prerequisite.key, side));
            if (!held || holds || !hasOwnValue(tags, key, side)) continue;

            tags = { ...tags };
            for (const common of commonKeys(key, side)) {
                const value = tags[common];
                if (value === undefined) continue;
                // keep the common value on the other sides
                for (const other of field.keys) {
                    if (other !== key && tags[other] === undefined) tags[other] = value;
                }
                delete tags[common];
            }
            delete tags[key];
        }
    }
    return tags;
}


/** The fields of the entity's preset, for `removeUnmetSideValues` */
export function presetFieldsOf(context: iD.Context, entityID: string) {
    const graph = context.graph();
    const entity = graph.hasEntity(entityID as Parameters<typeof graph.hasEntity>[0]);
    if (!entity) return [];
    const preset = presetManager.match(entity, graph);
    return [...(preset.fields?.() ?? []), ...(preset.moreFields?.() ?? [])] as unknown as FieldLike[];
}


/** The field that edits the prerequisite key on the entity's preset, for its label and value labels */
function prerequisiteField(context: iD.Context, entityID: string, key: string, side: string): FieldLike | undefined {
    const sideKey = key.replace(SIDE, side);
    const plainKey = key.replace(`:${SIDE}`, '');
    const fields = presetFieldsOf(context, entityID);
    return fields.find(field => field.keys?.includes(sideKey))
        ?? fields.find(field => field.key === plainKey || field.key === sideKey);
}


function valueLabel(field: FieldLike | undefined, value: string) {
    if (!field) return value;
    if (field.hasTextForStringId(`options.${value}.title`)) return field.t(`options.${value}.title`);
    if (field.hasTextForStringId(`options.${value}`)) return field.t(`options.${value}`);
    return value;
}


/**
 * Disables the rows (one per side key) whose side prerequisite does not hold.
 * Used by the directional combo; `placeholder(key)` feeds the combo's own placeholder.
 */
export function uiSidePrerequisites(field: FieldLike, context: iD.Context) {
    const prerequisite = field.prerequisiteTag;
    const hints = new Map<string, string>();

    function hint(key: string, entityTags: Tags[], entityIDs: string[], side: string) {
        if (!isSidePrerequisite(prerequisite)) return undefined;
        const values = new Set(entityTags.map(tags => sideValue(tags, prerequisite.key, side)));
        const parent = prerequisiteField(context, entityIDs[0], prerequisite.key, side);
        const parentLabel = parent?.title() ?? prerequisite.key.replace(SIDE, side);
        const [value] = values;
        if (values.size === 1 && value) {
            return t('inspector.side_prerequisite.other_value', { value: valueLabel(parent, value), field: parentLabel });
        }
        return t('inspector.side_prerequisite.missing', { field: parentLabel });
    }

    return {
        /** The placeholder while the side is disabled, else undefined */
        placeholder(key: string) {
            return hints.get(key);
        },

        /** `rows`: selection of the row elements, bound to their side key */
        update(rows: Selection<HTMLElement, string, any, unknown>, entityTags: Tags[], entityIDs: string[]) {
            hints.clear();
            if (!isSidePrerequisite(prerequisite)) return;

            rows.each(function(this: HTMLElement, key: string) {
                const side = sideOfKey(key);
                if (!side) return;
                const unmet = !entityTags.some(tags => matchesPrerequisite(prerequisite, sideValue(tags, prerequisite.key, side)))
                    // like upstream: a value that is already there stays editable
                    && !entityTags.some(tags => hasOwnValue(tags, key, side));
                const text = unmet ? hint(key, entityTags, entityIDs, side) : undefined;
                if (text) hints.set(key, text);

                const input = this.querySelector('input');
                if (!input) return;
                input.disabled = !!text;
                // the combo sets its placeholder again when its options load; it reads `placeholder(key)` then
                if (text) {
                    if (input.dataset.normalPlaceholder === undefined) {
                        input.dataset.normalPlaceholder = input.getAttribute('placeholder') ?? '';
                    }
                    input.setAttribute('placeholder', text);
                } else if (input.dataset.normalPlaceholder !== undefined) {
                    input.setAttribute('placeholder', input.dataset.normalPlaceholder);
                    delete input.dataset.normalPlaceholder;
                }
            });

            rows
                .classed('side-prerequisite-unmet', (key: string) => hints.has(key))
                .attr('title', (key: string) => hints.get(key) ?? null);
        }
    };
}
