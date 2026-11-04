import type { Dispatch } from 'd3-dispatch';
import type { Field } from '@openstreetmap/id-tagging-schema';

import { t } from '../../core/localizer';
import { presetField } from '../../presets/field';
import { PART_WIDTH_KEYS, partWidthMode } from '../../width/part_widths';
import { uiField } from '../field';

/**
 * The widths of the parts of a shared foot and cycle path (`cycleway:width`, `footway:width`),
 * shown right below the width field. Built like the side widths (`side_width_fields.ts`): the
 * schema's `width` field with another key, so the measuring tape and the source line below the
 * field work the same. Shown on segregated paths and when a part is tagged; on other paths for
 * walking and cycling the width field gets a "Per part" button.
 */
export function uiPartWidthFields(context: iD.Context, dispatch: Dispatch<object>) {
    let _signature = '';
    let _fields: unknown[] = [];
    let _entityKey = '';
    /** the button on the width field: undefined = not used for this feature */
    let _shown: boolean | undefined;

    function createField(key: string, entityIDs: string[], widthField: Partial<Field>) {
        const part = key.split(':')[0];
        const field = presetField(`part_width/${part}`, { ...widthField, key } as Field);
        const labelID = `inspector.part_width.${part}`;
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

    const partFields = {
        /** 'always', 'optional' (the button decides) or undefined, for one selected feature */
        mode(tags: TagsMulti, entityIDs: string[]) {
            return entityIDs.length === 1 ? partWidthMode(tags) : undefined;
        },

        /** Whether the part fields are open: always, or after the button */
        open(tags: TagsMulti, entityIDs: string[]) {
            const key = entityIDs.join();
            if (key !== _entityKey) {
                _entityKey = key;
                _shown = undefined;
            }
            const mode = partFields.mode(tags, entityIDs);
            return mode === 'always' || (mode === 'optional' && _shown === true);
        },

        toggle() {
            _shown = !_shown;
        },

        /** The part fields to show; rebuilt only when the selection changes */
        fields(tags: TagsMulti, entityIDs: string[], widthField: Partial<Field> | undefined) {
            if (!partFields.open(tags, entityIDs)) return [];
            const signature = entityIDs.join();
            if (signature !== _signature) {
                _signature = signature;
                _fields = PART_WIDTH_KEYS.map(key => createField(key, entityIDs, widthField ?? { type: 'number' }));
            }
            return _fields;
        }
    };

    return partFields;
}
