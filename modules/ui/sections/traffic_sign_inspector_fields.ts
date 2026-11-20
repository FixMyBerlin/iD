import type { Dispatch } from 'd3-dispatch';
import type { Field, Geometry } from '@openstreetmap/id-tagging-schema';

import { t } from '../../core/localizer';
import { presetField } from '../../presets/field';
import {
    TRAFFIC_SIGN_FIELD_TYPE,
    TRAFFIC_SIGN_GROUP_FIELD_TYPE,
    WAY_SIGN_KEYS,
    fieldIdForTrafficSignTagKey,
    labelForTrafficSignTagKey,
    trafficSignTagKeysFromTags
} from '../../presets/traffic_sign_fields';
import { parseSignKey, signRows } from '../../traffic_sign/sign_field_rows';
import { uiField } from '../field';

type PresetManager = { field(id: string): presetField | undefined };

const SIDE_GROUPS = ['cycleway', 'sidewalk'] as const;


/** Which extra traffic sign fields the tags need; the inspector rebuilds them when this changes */
export function trafficSignFieldsSignature(tags: TagsMulti, geometries: Geometry[]) {
    const sides = geometries.includes('line') ? SIDE_GROUPS.map(group => signRows(tags, group).map(row => row.key).join(',')) : [];
    return [...sides, ...trafficSignTagKeysFromTags(tags)].join('\0');
}


/**
 * Traffic sign fields that are not preset fields (WORKDOC features 2 and 27):
 * - on ways, "Traffic sign (bike lanes)" / "(sidewalks)" with a row per side that has a bike lane /
 *   sidewalk, and per tagged sign key of that group;
 * - the way's own sign field (`traffic_sign` with its directions) when the preset has none and a
 *   sign is tagged;
 * - a single field for any other tagged sign key.
 * Keys already covered by preset fields (`presetKeys`) or earlier entries of `fieldsArr` are skipped.
 */
export function appendTrafficSignInspectorFields(
    fieldsArr: { key?: string, keys?: string[] }[],
    tags: TagsMulti,
    context: iD.Context,
    entityIDs: string[],
    presetsManager: PresetManager,
    geometries: Geometry[],
    dispatch: Dispatch<object>,
    presetKeys: (string | undefined)[] = []
) {
    const shownKeys = new Set([...presetKeys, ...fieldsArr.flatMap(field => field.keys ?? [field.key])]);

    function append(field: presetField) {
        if (!field.matchAllGeometry(geometries)) return;
        const inspectorField = (uiField as any)(context, field, entityIDs, { show: true });
        inspectorField
            .on('change', (tagChange: TagsUpdate, onInput: boolean) => {
                dispatch.call('change', inspectorField, entityIDs, tagChange, onInput);
            })
            .on('revert', (keys: string[]) => {
                dispatch.call('revert', inspectorField, keys);
            });
        fieldsArr.push(inspectorField);
        for (const key of field.keys ?? [field.key]) shownKeys.add(key);
    }

    function groupField(id: string, key: string, keys: string[], signGroup: string, label: string) {
        return presetField(id, {
            key, keys, type: TRAFFIC_SIGN_GROUP_FIELD_TYPE, signGroup, label,
            snake_case: false, caseSensitive: true
        } as unknown as Field);
    }

    if (geometries.includes('line')) {
        for (const group of SIDE_GROUPS) {
            const keys = signRows(tags, group).map(row => row.key).filter(key => !shownKeys.has(key));
            if (!keys.length) continue;
            append(groupField(`traffic_sign/${group}`, `${group}:traffic_sign`, keys, group, t(`inspector.traffic_sign_group.label.${group}`)));
        }
    }

    const tagged = trafficSignTagKeysFromTags(tags).filter(key => !shownKeys.has(key));
    if (tagged.some(key => parseSignKey(key)?.group === 'way')) {
        append(groupField('traffic_sign', 'traffic_sign', WAY_SIGN_KEYS, 'way', t('inspector.traffic_sign_group.label.way')));
    }

    for (const tagKey of trafficSignTagKeysFromTags(tags)) {
        if (shownKeys.has(tagKey)) continue;

        const fieldID = fieldIdForTrafficSignTagKey(tagKey);
        let field = presetsManager.field(fieldID);
        if (!field || field.key !== tagKey || (field.type as string) !== TRAFFIC_SIGN_FIELD_TYPE) {
            field = presetField(fieldID, {
                key: tagKey,
                type: TRAFFIC_SIGN_FIELD_TYPE,
                label: labelForTrafficSignTagKey(tagKey),
                snake_case: false,
                caseSensitive: true
            } as unknown as Field);
        }
        append(field);
    }
}
