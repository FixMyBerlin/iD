import type { BikelaneResult } from '@tilda-geo/bicycle-infrastructure';
import { DAMAGE_SIGNS } from './required_attributes';

/**
 * Reminders for things that have no tag to check: the mapper has to look for them.
 * Shown in the card of the side; the text is `inspector.tilda.reminder.<id>`.
 * - `damage_signs`: a sign about damaged paths (`traffic_sign`), only until one is tagged
 * - `barrier`: a barrier in front of the path (Absperrbake); no OSM tag, a TILDA note on the spot
 */
export type ReminderId = 'damage_signs' | 'barrier';

const PATH_CATEGORY = /^(cycleway_|footAndCycleway|footwayBicycleYes_)/;
/** cycle tracks along a road, raised kerb (Hochbord) */
const RAISED_TRACK_CATEGORY = /^cycleway_adjoining/;

export function reminders(result: BikelaneResult, tags: Tags, targetCategory?: string): ReminderId[] {
    const category = targetCategory ?? result.category;
    if (!targetCategory && !result._infrastructureExists) return [];

    const list: ReminderId[] = [];
    if (PATH_CATEGORY.test(category) && !hasDamageSign(tags)) list.push('damage_signs');
    if (RAISED_TRACK_CATEGORY.test(category)) list.push('barrier');
    return list;
}

/** `traffic_sign` of the way or of any side holds a damage sign (it can be a `;` list) */
function hasDamageSign(tags: Tags) {
    return Object.keys(tags)
        .filter(key => key === 'traffic_sign' || key.endsWith(':traffic_sign'))
        .some(key => tags[key].split(';').some(sign => DAMAGE_SIGNS.includes(sign.trim())));
}
