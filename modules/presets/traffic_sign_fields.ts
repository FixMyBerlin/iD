import type { Field } from '@openstreetmap/id-tagging-schema';

/** Field type of the lazy-loaded traffic sign field (not part of id-tagging-schema) */
export const TRAFFIC_SIGN_FIELD_TYPE = 'trafficSign';

const TRAFFIC_SIGN_TAG_KEY_PATTERN = /traffic_sign(?::(?:forward|backward|left|right))?$/;
const TRAFFIC_SIGN_KEY_PATTERN = /^traffic_sign(?::(?:forward|backward|left|right))?$/;

type TrafficSignFieldData = Pick<Field, 'key' | 'label'> & {
    type: typeof TRAFFIC_SIGN_FIELD_TYPE;
    snake_case: false;
    caseSensitive: true;
};

function trafficSignField(key: string, label: string): TrafficSignFieldData {
    return { key, type: TRAFFIC_SIGN_FIELD_TYPE, label, snake_case: false, caseSensitive: true };
}

/** Fields that id-tagging-schema does not have, but which we want to show */
export const EXTRA_TRAFFIC_SIGN_FIELDS: Record<string, TrafficSignFieldData> = {
    'traffic_sign/forward': trafficSignField('traffic_sign:forward', 'Traffic Sign (Forward)'),
    'traffic_sign/backward': trafficSignField('traffic_sign:backward', 'Traffic Sign (Backward)')
};

const FIELD_ID_BY_TAG_KEY: Record<string, string> = {
    'traffic_sign': 'traffic_sign',
    'traffic_sign:forward': 'traffic_sign/forward',
    'traffic_sign:backward': 'traffic_sign/backward',
    'traffic_sign:left': 'traffic_sign/left',
    'traffic_sign:right': 'traffic_sign/right'
};

const LABEL_BY_TAG_KEY: Record<string, string> = {
    'traffic_sign': 'Traffic Sign',
    'traffic_sign:forward': 'Traffic Sign (Forward)',
    'traffic_sign:backward': 'Traffic Sign (Backward)',
    'traffic_sign:left': 'Traffic Sign (Left)',
    'traffic_sign:right': 'Traffic Sign (Right)'
};

const SORT_RANK_BY_TAG_KEY: Record<string, number> = {
    'traffic_sign': 0,
    'traffic_sign:forward': 1,
    'traffic_sign:backward': 2,
    'traffic_sign:left': 3,
    'traffic_sign:right': 4
};


/** Field type of the traffic sign fields with one row per key (WORKDOC feature 27) */
export const TRAFFIC_SIGN_GROUP_FIELD_TYPE = 'trafficSignGroup';

/** Keys of the way's traffic sign field: the sign and its directions */
export const WAY_SIGN_KEYS = ['traffic_sign', 'traffic_sign:forward', 'traffic_sign:backward'];


/**
 * Switches all `traffic_sign*` fields to the traffic sign field type; the `traffic_sign` field
 * becomes the group with the directions as rows
 */
export function applyTrafficSignFieldTypes(fields: Record<string, { key?: string, keys?: string[], type?: string, signGroup?: string } | undefined>) {
    for (const fieldData of Object.values(fields)) {
        if (fieldData?.key === 'traffic_sign') {
            fieldData.type = TRAFFIC_SIGN_GROUP_FIELD_TYPE;
            fieldData.keys = WAY_SIGN_KEYS;
            fieldData.signGroup = 'way';
        } else if (fieldData?.key && TRAFFIC_SIGN_KEY_PATTERN.test(fieldData.key)) {
            fieldData.type = TRAFFIC_SIGN_FIELD_TYPE;
        }
    }
}


export function isTrafficSignValueTagKey(tagKey: string) {
    return TRAFFIC_SIGN_TAG_KEY_PATTERN.test(tagKey);
}


/** The traffic sign keys of `tags` that have a single value, main sign first */
export function trafficSignTagKeysFromTags(tags: TagsMulti | undefined) {
    if (!tags) return [];

    const rank = (tagKey: string) => SORT_RANK_BY_TAG_KEY[tagKey] ?? 10;

    return Object.keys(tags)
        .filter(tagKey => {
            const value = tags[tagKey];
            return typeof value === 'string' && value !== '' && isTrafficSignValueTagKey(tagKey);
        })
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}


export function fieldIdForTrafficSignTagKey(tagKey: string) {
    return FIELD_ID_BY_TAG_KEY[tagKey] ?? `traffic_sign/${tagKey.replace(/[:/]/g, '_')}`;
}


const SIDE_PREFIX_LABEL: Record<string, string> = { cycleway: 'Bike Lane', sidewalk: 'Sidewalk' };
const SIDE_LABEL: Record<string, string> = { left: 'Left', right: 'Right', both: 'Both Sides' };


/**
 * English label for a traffic sign key. Side keys of roads get the side and the infrastructure:
 * `cycleway:right:traffic_sign:forward` → "Traffic Sign (Right Bike Lane, forward)".
 */
export function labelForTrafficSignTagKey(tagKey: string) {
    if (LABEL_BY_TAG_KEY[tagKey]) return LABEL_BY_TAG_KEY[tagKey];

    const [head, suffix = ''] = tagKey.split(/:?traffic_sign/);
    const parts: string[] = [];
    const side = head.match(/^(cycleway|sidewalk)(?::(left|right|both))?$/);
    if (side) {
        parts.push(side[2] ? `${SIDE_LABEL[side[2]]} ${SIDE_PREFIX_LABEL[side[1]]}` : SIDE_PREFIX_LABEL[side[1]]);
    } else if (head) {
        parts.push(head);
    }
    if (suffix.startsWith(':')) parts.push(suffix.slice(1));

    return parts.length ? `Traffic Sign (${parts.join(', ')})` : tagKey;
}
