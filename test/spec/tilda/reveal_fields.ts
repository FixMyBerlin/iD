import { processBikelanes } from '@tilda-geo/bicycle-infrastructure';
import { requiredAttributes, roadAttributes, type RequiredAttribute } from '@tilda-geo/bicycle-infrastructure-tagging';
import { radnetzBerlin } from '@tilda-geo/bicycle-infrastructure-tagging/profiles/radnetz-berlin';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { applyPresetCustomization } from '../../../modules/presets/customization';
import { RADNETZ_PRESET_CUSTOMIZATION } from '../../../modules/presets/radnetz_customization';


/**
 * The TILDA box's "add below" / "check below" opens the field of the first `lookup` key that has a
 * field (`presetFields.revealField`). That field must write the attribute's key: on a segregated
 * path TILDA asks for `cycleway:surface:colour`, but `lookup` also had `surface:colour`, and with no
 * field for the part key the plain `surface/colour` field opened and wrote `surface:colour`.
 */
type FieldDef = { key?: string; keys?: string[] };

const schemaFields = JSON.parse(readFileSync(
    createRequire(import.meta.url).resolve('@openstreetmap/id-tagging-schema/dist/fields.json'), 'utf8'));

const { fields, presets } = applyPresetCustomization(RADNETZ_PRESET_CUSTOMIZATION, {
    fields: schemaFields as any,
    presets: Object.fromEntries(Object.keys(RADNETZ_PRESET_CUSTOMIZATION.setFields!).map(id => [id, { tags: {}, geometry: ['line'] }])) as any
});

function presetFieldDefs(presetID: string): FieldDef[] {
    const preset = presets![presetID]!;
    return [...(preset.fields ?? []), ...(preset.moreFields ?? [])]
        .map(id => (fields as Record<string, FieldDef>)[id])
        .filter((field): field is FieldDef => !!field);
}

function attributesFor(tags: Record<string, string>): RequiredAttribute[] {
    return processBikelanes(tags).flatMap(result => [
        ...requiredAttributes(result, tags, { profile: radnetzBerlin }),
        ...(result._side === 'self' ? roadAttributes(tags, { profile: radnetzBerlin }) : [])
    ]);
}

/** The field "check below" opens for this attribute (like `revealField`), its keys */
function revealedFieldKeys(attribute: RequiredAttribute, fieldDefs: FieldDef[]) {
    const keysOf = (field: FieldDef) => [field.key, ...(field.keys ?? [])].filter(Boolean) as string[];
    const firstKey = attribute.lookup.find(key => fieldDefs.some(field => keysOf(field).includes(key)));
    const field = firstKey && fieldDefs.find(f => keysOf(f).includes(firstKey));
    return field ? keysOf(field) : undefined;
}

const CASES: { name: string; presetID: string; tags: Record<string, string> }[] = [
    {
        // the tester's case
        name: 'segregated foot and cycle path',
        presetID: 'highway/path/bicycle_foot',
        tags: { highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes', is_sidepath: 'yes', traffic_sign: 'DE:241-30' }
    },
    {
        name: 'segregated cycleway with foot access',
        presetID: 'highway/cycleway/bicycle_foot',
        tags: { highway: 'cycleway', bicycle: 'designated', foot: 'designated', segregated: 'yes', is_sidepath: 'yes' }
    },
    {
        name: 'segregated footway with bicycle access',
        presetID: 'highway/footway',
        tags: { highway: 'footway', bicycle: 'designated', segregated: 'yes', traffic_sign: 'DE:241-31' }
    },
    {
        name: 'shared foot and cycle path',
        presetID: 'highway/path/bicycle_foot',
        tags: { highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'no', traffic_sign: 'DE:240' }
    },
    {
        name: 'cycleway',
        presetID: 'highway/cycleway',
        tags: { highway: 'cycleway', is_sidepath: 'yes' }
    },
    {
        name: 'road with bike lanes',
        presetID: 'highway/secondary',
        tags: { highway: 'secondary', 'cycleway:both': 'lane', oneway: 'yes' }
    }
];

/**
 * Known exception: on paths and footways TILDA asks for `oneway:bicycle`, the presets only have the
 * `oneway` field. TILDA reads both, and the box then offers to move `oneway` to `oneway:bicycle`
 * (`onewayToMove` in tilda_bike_infra.ts).
 */
function knownException(attribute: RequiredAttribute, fieldKeys: string[]) {
    return attribute.key === 'oneway:bicycle' && fieldKeys.includes('oneway');
}

describe('tilda: "check below" opens the field of the asked key', () => {
    it.each(CASES)('$name', ({ name, presetID, tags }) => {
        const fieldDefs = presetFieldDefs(presetID);
        expect(fieldDefs.length).toBeGreaterThan(0);
        for (const attribute of attributesFor(tags)) {
            const keys = revealedFieldKeys(attribute, fieldDefs);
            if (!keys) continue;   // no field: the box has its own buttons
            if (knownException(attribute, keys)) continue;
            expect(keys, `${attribute.id} (${attribute.key}) on ${name}`).toContain(attribute.key);
        }
    });

    it('a segregated path asks for cycleway:surface:colour and offers its field', () => {
        const tags = CASES[0]!.tags;
        const colour = attributesFor(tags).find(attribute => attribute.id === 'surface_colour')!;
        expect(colour.key).toBe('cycleway:surface:colour');
        expect(revealedFieldKeys(colour, presetFieldDefs('highway/path/bicycle_foot'))).toEqual(['cycleway:surface:colour']);
    });
});
