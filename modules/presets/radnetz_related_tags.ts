import type { RelatedButtons } from './related_tags';

/**
 * Title buttons for related tags in the Radnetz Berlin editor (WORKDOC feature 25): only where
 * the tag is common. Counts from taginfo (2026-09-30, world / Berlin); the key form is the more
 * common one (`surface:note` 10k over `note:surface` 1.8k). Other related tags still show below
 * their field when they are tagged, just without a button to add them.
 */
const SIDES = ['left', 'right', 'both'] as const;

export const RADNETZ_RELATED_BUTTONS: RelatedButtons = {
    // source 2.8M / 31k, note 5k / 22
    maxspeed: { source: 'source:maxspeed', note: 'note:maxspeed' },
    // 131k / 25k, the width sources of the Radinfra FAQ
    width: { source: 'source:width' },
    'width:effective': { source: 'source:width:effective' },
    'cycleway:width': { source: 'source:cycleway:width' },
    ...Object.fromEntries(SIDES.flatMap(side => [
        // 5.9k / 5.8k (right), 2k (both), 0.7k (left)
        [`cycleway:${side}:width`, { source: `source:cycleway:${side}:width` }],
        [`sidewalk:${side}:width`, { source: `source:sidewalk:${side}:width` }],
        // Berlin only (16 / 4 / 6), new tag of the Radnetz mapping
        [`buffer:${side}`, { source: `source:buffer:${side}` }],
        // Berlin 10 each (note and description)
        [`parking:${side}`, { note: `parking:${side}:note` }]
    ])),
    'sett:length': { source: 'source:sett:length' },
    // check date 297k / 2.2k, source 65k / 56, note 10k / 84
    surface: { source: 'source:surface', note: 'surface:note', check_date: 'check_date:surface' },
    smoothness: { check_date: 'check_date:smoothness' },   // 42k / 1.5k
    cycleway: { check_date: 'check_date:cycleway' },       // 34k / 4k
    tactile_paving: { check_date: 'check_date:tactile_paving' },   // 34k / 2.4k
    crossing: { check_date: 'check_date:crossing' },       // 31k / 153
    lit: { source: 'source:lit', check_date: 'check_date:lit' },   // 22k, 21k
    name: { source: 'source:name', note: 'note:name' },    // 1.6M, 17k
    ref: { source: 'source:ref' },                         // 403k
    lanes: { source: 'source:lanes', note: 'note:lanes' },   // 38k, 10k
    oneway: { source: 'source:oneway' },                   // 22k
    access: { source: 'source:access', note: 'note:access' },   // 13k, 7k
    bicycle: { source: 'source:bicycle' },                 // 19k
    traffic_sign: { note: 'note:traffic_sign' },           // 0.5k (+ `traffic_sign:note` 0.8k)
    bicycle_road: { note: 'note:bicycle_road' }            // Berlin 13
};
