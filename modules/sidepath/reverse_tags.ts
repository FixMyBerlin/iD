import { reverseTags } from '@tilda-geo/bicycle-infrastructure-tagging';
import { definedTags } from '../tilda/tags';

const OPPOSITE: Record<string, string> = { yes: '-1', '-1': 'yes' };

/**
 * `reverseTags` of the package, plus `oneway:bicycle`: the package only turns `oneway`
 * (tagging package 0.1.0; reported, remove this once the package turns it too).
 */
export function reverseWayTags(tags: Tags): Tags {
    const reversed = definedTags(reverseTags(tags));
    const bicycle = tags['oneway:bicycle'];
    if (bicycle && OPPOSITE[bicycle] && reversed['oneway:bicycle'] === bicycle) {
        return { ...reversed, 'oneway:bicycle': OPPOSITE[bicycle] };
    }
    return reversed;
}
