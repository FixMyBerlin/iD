import tildaLabelsDe from '../../data/tilda_labels.de.json' with { type: 'json' };
import { localizer, t } from '../core/localizer';

/**
 * Groups of TILDA categories for the "Change to" select, in the order mappers need them.
 * Categories the library offers that are in no group end up in `other`.
 */
export const CATEGORY_GROUPS: { id: string; categories: string[] }[] = [
    { id: 'track', categories: ['cycleway_adjoining', 'cycleway_isolated', 'cycleway_adjoiningOrIsolated'] },
    { id: 'lane', categories: [
        'cyclewayOnHighway_advisory',
        'cyclewayOnHighway_exclusive',
        'cyclewayOnHighway_advisoryOrExclusive',
        'cyclewayOnHighwayProtected',
        'cyclewayOnHighwayBetweenLanes',
        'sharedMotorVehicleLane'
    ] },
    { id: 'foot', categories: [
        'footAndCyclewayShared_adjoining',
        'footAndCyclewayShared_isolated',
        'footAndCyclewayShared_adjoiningOrIsolated',
        'footAndCyclewaySegregated_adjoining',
        'footAndCyclewaySegregated_isolated',
        'footAndCyclewaySegregated_adjoiningOrIsolated',
        'footwayBicycleYes_adjoining',
        'footwayBicycleYes_isolated',
        'footwayBicycleYes_adjoiningOrIsolated',
        'pedestrianAreaBicycleYes'
    ] },
    { id: 'bus', categories: ['sharedBusLaneBikeWithBus', 'sharedBusLaneBusWithBike'] },
    { id: 'bicycle_road', categories: ['bicycleRoad', 'bicycleRoad_vehicleDestination'] },
    { id: 'special', categories: ['cyclewayLink', 'crossing'] }
];


/**
 * German labels as TILDA shows them, generated from tilda-geo's processed topic docs
 * (`npm run update:tilda-labels`). Keys like `category=cycleway_adjoining`.
 * Our UI strings exist only in English (`data/core.yaml`), so German users get these instead.
 */
const LABELS_DE: Record<string, string> = tildaLabelsDe;

const GROUP_LABELS_DE: Record<string, string> = {
    track: 'Radwege',
    lane: 'Auf der Fahrbahn',
    foot: 'Mit dem Fußverkehr',
    bus: 'Mit dem Busverkehr',
    bicycle_road: 'Fahrradstraßen',
    special: 'Sonderfälle: Verbindungsstücke und Querungen',
    other: 'Weitere'
};


function isGerman() {
    return localizer.languageCode() === 'de';
}


export function categoryLabel(category: string | undefined) {
    if (!category) return t('inspector.tilda.no_category');
    const german = LABELS_DE[`category=${category}`];
    if (isGerman() && german) return german;
    return t(`inspector.tilda.category.${category}`, { default: category });
}


export function categoryGroupLabel(group: string) {
    if (isGerman() && GROUP_LABELS_DE[group]) return GROUP_LABELS_DE[group];
    return t(`inspector.tilda.category_group.${group}`, { default: group });
}


/** `categories` sorted into `CATEGORY_GROUPS` (empty groups left out); the rest goes to `other` */
export function groupCategories(categories: string[]) {
    const grouped = CATEGORY_GROUPS
        .map(group => ({ id: group.id, categories: group.categories.filter(category => categories.includes(category)) }));
    const known = new Set(CATEGORY_GROUPS.flatMap(group => group.categories));
    grouped.push({ id: 'other', categories: categories.filter(category => !known.has(category)) });
    return grouped.filter(group => group.categories.length);
}
