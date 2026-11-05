import type { Dispatch } from 'd3-dispatch';
import type { Field } from '@openstreetmap/id-tagging-schema';

import { t } from '../../core/localizer';
import { presetField } from '../../presets/field';
import { uiField } from '../field';

type Prefix = 'cycleway' | 'sidewalk';
type SideKey = 'left' | 'right' | 'both';

/** Values of `cycleway:*` that describe a lane or track with its own width */
const CYCLEWAY_WITH_WIDTH = new Set(['lane', 'track', 'opposite_lane', 'opposite_track', 'share_busway']);
/** Values of `sidewalk:*` that mean a sidewalk is mapped on the road */
const SIDEWALK_PRESENT = new Set(['yes', 'both', 'left', 'right']);

const WIDTH_KEY = /^(cycleway|sidewalk):(left|right|both):width$/;


function valueFor(tags: TagsMulti, key: string) {
    const value = tags[key];
    return typeof value === 'string' ? value : undefined;
}


/** Sides of `prefix` that exist on the road, as they are tagged (`both` or `left`/`right`) */
function taggedSides(tags: TagsMulti, prefix: Prefix): SideKey[] {
    const present = (value: string | undefined) => !!value && (
        prefix === 'cycleway' ? CYCLEWAY_WITH_WIDTH.has(value) : SIDEWALK_PRESENT.has(value)
    );

    // `sidewalk=left|right|both` names the sides directly
    const plain = valueFor(tags, prefix);
    if (prefix === 'sidewalk' && (plain === 'left' || plain === 'right')) return [plain];

    if (present(valueFor(tags, `${prefix}:both`)) || present(plain)) return ['both'];

    return (['left', 'right'] as const).filter(side => present(valueFor(tags, `${prefix}:${side}`)));
}


/** Width keys to show: for each tagged side, plus width keys that are already set */
export function sideWidthKeys(tags: TagsMulti): string[] {
    const keys = new Set<string>();
    for (const prefix of ['cycleway', 'sidewalk'] as const) {
        for (const side of taggedSides(tags, prefix)) keys.add(`${prefix}:${side}:width`);
    }
    for (const key of Object.keys(tags)) {
        if (WIDTH_KEY.test(key)) keys.add(key);
    }
    return [...keys].sort();
}


/**
 * Extra inspector fields for `cycleway:left|right|both:width` and `sidewalk:…:width`.
 * id-tagging-schema has no fields for these keys, so they would only show in the raw tag editor.
 * They reuse the schema's `width` field (number, meters) with a side-specific key and label.
 */
export function uiSideWidthFields(context: iD.Context, dispatch: Dispatch<object>) {
    let _signature = '';
    let _fields: unknown[] = [];

    function createField(key: string, entityIDs: string[], widthField: Partial<Field>) {
        // take the schema's width settings (type, units, minValue), but not its id-based texts
        const [, prefix, side] = WIDTH_KEY.exec(key)!;
        const field = presetField(`side_width/${prefix}_${side}`, { ...widthField, key } as Field);
        // labels are looked up by field id, which the schema does not know
        const labelID = `inspector.side_width.${prefix}.${side}`;
        field.label = () => t.append(labelID);
        field.title = () => t(labelID);

        const inspectorField = (uiField as any)(context, field, entityIDs, { show: true });
        inspectorField
            .on('change', (tagChange: TagsUpdate, onInput: boolean) => {
                dispatch.call('change', inspectorField, entityIDs, tagChange, onInput);
            })
            .on('revert', (keys: string[]) => {
                dispatch.call('revert', inspectorField, keys);
            });
        return inspectorField;
    }

    return {
        /** The fields for `tags`; rebuilt only when the list of keys changes */
        fields(tags: TagsMulti, entityIDs: string[], widthField: Partial<Field> | undefined, shownKeys: Set<string>) {
            const keys = sideWidthKeys(tags).filter(key => !shownKeys.has(key));
            const signature = `${entityIDs.join()}|${keys.join()}`;
            if (signature !== _signature) {
                _signature = signature;
                _fields = keys.map(key => createField(key, entityIDs, widthField ?? { type: 'number' }));
            }
            return _fields;
        },

        reset() {
            _signature = '';
            _fields = [];
        }
    };
}
