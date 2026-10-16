import type { Field, Preset } from '@openstreetmap/id-tagging-schema';

import type { PresetCustomization } from './customization';

/**
 * Preset customization for the Radnetz Berlin editor: fields for the tags TILDA and the
 * infraVelo dataset need (WORKDOC feature 16, "Data index"), presets for TILDA categories
 * that id-tagging-schema has no preset for, and shorter field lists for the presets we map.
 */

// Values as TILDA accepts them (`sanitize-road-tags.ts` in @tilda-geo/bicycle-infrastructure)
const SEPARATION_OPTIONS = {
    no: 'None',
    bollard: 'Bollards',
    flex_post: 'Flexible posts',
    vertical_panel: 'Vertical panels (Leitboys)',
    studs: 'Studs',
    bump: 'Bumps / kerb stones on the marking',
    kerb: 'Kerb',
    planter: 'Planters',
    fence: 'Fence',
    jersey_barrier: 'Jersey barrier',
    guard_rail: 'Guard rail',
    structure: 'Structure (wall, building)',
    greenery: 'Greenery',
    hedge: 'Hedge',
    tree_row: 'Tree row',
    ditch: 'Ditch',
    cone: 'Cones'
};
const MARKING_OPTIONS = {
    no: 'None',
    solid_line: 'Solid line',
    dashed_line: 'Dashed line',
    double_solid_line: 'Double solid line',
    barred_area: 'Barred area (Sperrfläche)',
    pictogram: 'Pictograms',
    surface: 'Coloured surface'
};
const TRAFFIC_MODE_OPTIONS = {
    motor_vehicle: 'Motor vehicles',
    parking: 'Parking',
    psv: 'Buses (bus lane)',
    bicycle: 'Bicycles',
    foot: 'Pedestrians',
    no: 'Nothing'
};

function sideField(key: string, label: string, options: Record<string, string>, customValues = false): Field {
    return {
        key: `${key}:both`,
        keys: [`${key}:left`, `${key}:right`],
        type: 'directionalCombo',
        label,
        geometry: ['line'],
        options: Object.keys(options),
        customValues,
        autoSuggestions: false,
        strings: {
            options,
            types: { [`${key}:left`]: 'Left', [`${key}:right`]: 'Right' }
        }
    } as Field;
}

const FIELDS: Record<string, Field> = {
    // replaces the schema's `mapillary` identifier field: all image keys, several images each (feature 19)
    mapillary: {
        key: 'mapillary',
        type: 'mapillaryImages',
        label: 'Mapillary Images',
        universal: true
    } as unknown as Field,
    dual_carriageway: {
        key: 'dual_carriageway',
        type: 'check',
        label: 'Dual Carriageway',
        geometry: ['line']
    } as Field,
    is_sidepath: {
        key: 'is_sidepath',
        type: 'check',
        label: 'Along a Road (Sidepath)',
        geometry: ['line']
    } as Field,
    'surface/colour': {
        key: 'surface:colour',
        type: 'combo',
        label: 'Surface Colour',
        geometry: ['line'],
        options: ['no', 'red', 'green', 'red;green'],
        strings: { options: { no: 'Not coloured', red: 'Red', green: 'Green', 'red;green': 'Red and green' } }
    } as Field,
    'sett/length': {
        key: 'sett:length',
        // the three sizes TILDA tells apart (≤ 8 cm mosaic, ≤ 13 cm small, else large), in cm
        type: 'radio',
        label: 'Sett Stone Size',
        geometry: ['line', 'area'],
        options: ['0.05', '0.1', '0.15'],
        strings: { options: { '0.05': 'Mosaic sett, 5 cm', '0.1': 'Small sett, 10 cm', '0.15': 'Large sett (cobblestone), 15 cm' } },
        prerequisiteTag: { key: 'surface', value: 'sett' }
    } as Field,
    'width/effective': {
        key: 'width:effective',
        type: 'number',
        label: 'Usable Width (Meters)',
        geometry: ['line'],
        minValue: 0
    } as Field,
    'source/width': {
        key: 'source:width',
        type: 'combo',
        label: 'Width Source',
        geometry: ['line'],
        // the values the Radinfra mappers use (FAQ); the measuring tape writes `Luftbild <year>` itself.
        // Not in a field list: the editor below the width field (related tags) takes its options, also for side widths
        options: ['Luftbild 2026', 'Luftbild 2025', 'Messung aus Punktwolke (Infra3DViewer)', 'survey'],
        prerequisiteTag: { key: 'width' }
    } as Field,
    separation: sideField('separation', 'Separation', SEPARATION_OPTIONS),
    marking: sideField('marking', 'Marking', MARKING_OPTIONS),
    buffer: sideField('buffer', 'Buffer Width (Meters)', { no: 'No buffer', '0.25': '0.25', '0.5': '0.5', '0.75': '0.75', '1': '1' }, true),
    traffic_mode: sideField('traffic_mode', 'Traffic Next To It', TRAFFIC_MODE_OPTIONS),
    // `bicycle=use_sidepath` per direction, merged into `bicycle` when equal (feature 17, sidepath extraction)
    'bicycle/direction': {
        key: 'bicycle',
        keys: ['bicycle:forward', 'bicycle:backward'],
        type: 'directionalCombo',
        label: 'Bicycles, by Direction',
        geometry: ['line'],
        options: ['use_sidepath', 'optional_sidepath', 'yes', 'designated', 'no'],
        customValues: false,
        autoSuggestions: false,
        strings: {
            options: {
                use_sidepath: 'Use the separate cycleway (mandatory)',
                optional_sidepath: 'Separate cycleway, not mandatory',
                yes: 'Allowed',
                designated: 'Designated',
                no: 'Not allowed'
            },
            types: { 'bicycle:forward': 'Forward', 'bicycle:backward': 'Backward' }
        }
    } as Field,
    // surface and smoothness in one field, photos first (feature 24)
    surface_smoothness: {
        key: 'surface',
        keys: ['surface', 'smoothness'],
        type: 'surfaceSmoothness',
        label: 'Surface & Smoothness',
        geometry: ['line', 'area']
    } as unknown as Field,
    'cycleway/lane': {
        key: 'cycleway:both:lane',
        keys: ['cycleway:left:lane', 'cycleway:right:lane'],
        type: 'directionalCombo',
        label: 'Bike Lane Type',
        geometry: ['line'],
        options: ['advisory', 'exclusive'],
        customValues: false,
        // only on a side with a painted lane; shown right below the bike infrastructure field
        prerequisiteTag: { key: 'cycleway:{side}', value: 'lane' },
        strings: {
            options: { advisory: 'Advisory (Schutzstreifen)', exclusive: 'Exclusive (Radfahrstreifen)' },
            types: { 'cycleway:left:lane': 'Left', 'cycleway:right:lane': 'Right' }
        }
    } as Field
};


/** Fields that feed the Radnetz dataset, in the order mappers check them */
const WAY_DETAILS = ['surface_smoothness', 'width', 'traffic_sign'];
const WAY_DETAILS_MORE = [
    // `source:width` is no field here: it shows below the width field (related tags, feature 25)
    'surface/colour', 'sett/length', 'width/effective',
    // the directions of `traffic_sign` are rows of its field (feature 27)
    'lit', 'bridge/name', 'tunnel/name', 'not/name'
];

const ROAD_FIELDS = [
    'name', 'oneway', 'oneway/bicycle', 'dual_carriageway', 'maxspeed', 'lanes',
    // `cycleway/lane` only appears when a side has a lane (side prerequisite)
    'cycleway', 'cycleway/lane', 'sidewalk', 'parking/side/parking', ...WAY_DETAILS, 'structure', 'access'
];
const ROAD_MORE_FIELDS = [
    'bicycle/direction', 'lane_markings', 'parking/side/orientation', 'traffic_calming_road', ...WAY_DETAILS_MORE
];

const BICYCLE_ROAD_FIELDS = [
    'name', 'traffic_sign', 'access', 'oneway', 'oneway/bicycle', 'maxspeed',
    'surface_smoothness', 'width', 'parking/side/parking', 'traffic_mode', 'marking', 'buffer',
    'sidewalk', 'cycleway', 'structure'
];

const SEPARATE_WAY_FIELDS = [
    'name', 'is_sidepath', 'oneway', ...WAY_DETAILS, 'separation', 'structure', 'access'
];
const SEPARATE_WAY_MORE_FIELDS = ['marking', 'buffer', 'traffic_mode', 'segregated', ...WAY_DETAILS_MORE];

const FOOTWAY_FIELDS = ['name', 'access', 'traffic_sign', 'is_sidepath', 'surface_smoothness', 'width', 'structure'];
const FOOTWAY_MORE_FIELDS = ['oneway', 'segregated', 'tactile_paving', 'wheelchair', ...WAY_DETAILS_MORE];


const ROAD_PRESETS: Record<string, string[]> = {
    'highway/trunk': ['ref_road_number'],
    'highway/primary': ['ref_road_number'],
    'highway/secondary': ['ref_road_number'],
    'highway/tertiary': ['ref_road_number', 'bicycle_road'],
    'highway/residential': ['bicycle_road'],
    'highway/unclassified': ['bicycle_road'],
    'highway/living_street': ['bicycle_road'],
    'highway/service': []
};

const SEPARATE_WAY_PRESETS = [
    'highway/cycleway',
    'highway/cycleway/bicycle_foot',
    'highway/path/bicycle_foot'
];
const FOOTWAY_PRESETS = ['highway/footway', 'highway/footway/sidewalk', 'highway/path'];

const CROSSING_PRESETS = [
    'highway/cycleway/crossing', 'highway/cycleway/crossing/bicycle_foot', 'highway/cycleway/crossing/marked',
    'highway/cycleway/crossing/traffic_signals', 'highway/cycleway/crossing/uncontrolled', 'highway/cycleway/crossing/unmarked',
    'highway/footway/crossing', 'highway/footway/crossing/marked', 'highway/footway/crossing/traffic_signals',
    'highway/footway/crossing/uncontrolled', 'highway/footway/crossing/unmarked', 'highway/footway/crossing/zebra',
    'highway/path/crossing', 'highway/path/crossing/bicycle_foot', 'highway/path/crossing/marked',
    'highway/path/crossing/traffic_signals', 'highway/path/crossing/uncontrolled', 'highway/path/crossing/unmarked'
];


/** TILDA categories without an id-tagging-schema preset. Berlin 2026-09: 851 of 959 bicycle road ways are `residential`, 22 `cycleway`. */
const PRESETS: Record<string, Preset> = {
    'highway/cycleway/link': {
        name: 'Cycleway Link (Routing Connection)',
        terms: ['link', 'connection', 'routing', 'Radweg-Verbindung', 'cyclewayLink'],
        tags: { highway: 'cycleway', cycleway: 'link' },
        geometry: ['line'],
        icon: 'fas-biking',
        fields: ['oneway', 'surface_smoothness', 'width', 'traffic_sign', 'lit'],
        moreFields: ['is_sidepath', 'surface/colour', 'access']
    } as Preset,
    'highway/residential/bicycle_road': {
        name: 'Bicycle Road (Fahrradstraße)',
        terms: ['bicycle road', 'bicycle street', 'Fahrradstraße', 'DE:244.1', 'bicycleRoad'],
        tags: { highway: 'residential', bicycle_road: 'yes' },
        addTags: { highway: 'residential', bicycle_road: 'yes', bicycle: 'designated', traffic_sign: 'DE:244.1' },
        geometry: ['line'],
        icon: 'fas-biking',
        fields: BICYCLE_ROAD_FIELDS,
        moreFields: ['lit', 'dual_carriageway', 'lane_markings', ...WAY_DETAILS_MORE]
    } as Preset,
    'highway/residential/bicycle_road/vehicle_destination': {
        name: 'Bicycle Road, Motor Vehicles Allowed (Kfz frei / Anlieger frei)',
        terms: ['Fahrradstraße', 'Anlieger frei', 'Kfz frei', 'DE:1020-30', 'bicycleRoad_vehicleDestination'],
        tags: { highway: 'residential', bicycle_road: 'yes', vehicle: 'destination' },
        addTags: {
            highway: 'residential', bicycle_road: 'yes', vehicle: 'destination',
            bicycle: 'designated', traffic_sign: 'DE:244.1,1020-30'
        },
        geometry: ['line'],
        icon: 'fas-biking',
        fields: BICYCLE_ROAD_FIELDS,
        moreFields: ['lit', 'dual_carriageway', 'lane_markings', ...WAY_DETAILS_MORE]
    } as Preset,
    'highway/cycleway/bicycle_road': {
        name: 'Bicycle Road on a Cycleway (Fahrradstraße)',
        terms: ['Fahrradstraße', 'DE:244.1', 'bicycleRoad'],
        tags: { highway: 'cycleway', bicycle_road: 'yes' },
        addTags: { highway: 'cycleway', bicycle_road: 'yes', traffic_sign: 'DE:244.1' },
        geometry: ['line'],
        icon: 'fas-biking',
        fields: BICYCLE_ROAD_FIELDS,
        moreFields: ['is_sidepath', 'lit', ...WAY_DETAILS_MORE]
    } as Preset
};


export const RADNETZ_PRESET_CUSTOMIZATION: PresetCustomization = {
    fields: FIELDS,
    presets: PRESETS,
    setFields: {
        ...Object.fromEntries(Object.entries(ROAD_PRESETS).map(([id, extraMore]) => [id, {
            fields: id === 'highway/service' ? ['service', ...ROAD_FIELDS] : ROAD_FIELDS,
            moreFields: [...extraMore, ...ROAD_MORE_FIELDS]
        }])),
        ...Object.fromEntries(SEPARATE_WAY_PRESETS.map(id => [id, {
            // shared foot and cycle paths: `segregated` decides the TILDA category
            fields: id.endsWith('bicycle_foot') ? [...SEPARATE_WAY_FIELDS.slice(0, 2), 'segregated', ...SEPARATE_WAY_FIELDS.slice(2)] : SEPARATE_WAY_FIELDS,
            moreFields: SEPARATE_WAY_MORE_FIELDS.filter(f => !(id.endsWith('bicycle_foot') && f === 'segregated'))
        }])),
        ...Object.fromEntries(FOOTWAY_PRESETS.map(id => [id, { fields: FOOTWAY_FIELDS, moreFields: FOOTWAY_MORE_FIELDS }]))
    },
    // crossings: TILDA category `crossing` needs width, surface, oneway; bicycle access on footway/path crossings
    addFields: Object.fromEntries(CROSSING_PRESETS.map(id => [id, ['width', 'oneway', 'access']])),
    addMoreFields: Object.fromEntries(CROSSING_PRESETS.map(id => [id, ['surface/colour', 'smoothness', 'traffic_sign']]))
};
