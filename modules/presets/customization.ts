import type { Field, Fields, Preset, Presets } from '@openstreetmap/id-tagging-schema';

/**
 * Project-specific changes to the tagging schema, applied while the presets load.
 * iD itself only offers `presetManager.merge()`, which replaces whole presets; this
 * adds fields and puts them into existing presets without copying their definitions.
 *
 * Set it from the page that loads iD, before `context.init()`:
 *   iD.presetManager.customize(iD.RADNETZ_PRESET_CUSTOMIZATION);
 * The Radnetz Berlin customization is in `radnetz_customization.ts`.
 */
export interface PresetCustomization {
    /** New fields (or replacements), like in id-tagging-schema's `fields.json`. `label` is used as is, not translated. */
    fields?: Record<string, Field>;
    /** preset id → field ids to append to the preset's `fields` (shown by default) */
    addFields?: Record<string, string[]>;
    /** preset id → field ids to append to the preset's `moreFields` */
    addMoreFields?: Record<string, string[]>;
    /** preset id → field ids to remove from `fields` and `moreFields` */
    removeFields?: Record<string, string[]>;
    /** preset id → new `fields` / `moreFields` lists, replacing the schema's (for full control over the order) */
    setFields?: Record<string, { fields?: string[]; moreFields?: string[] }>;
    /** New presets (or replacements), like in id-tagging-schema's `presets.json`. `name` is used as is, not translated. */
    presets?: Record<string, Preset>;
}


/** Returns copies of the raw fields and presets with the customization applied */
export function applyPresetCustomization(
    customization: PresetCustomization | undefined,
    raw: { fields?: Fields; presets?: Presets }
) {
    if (!customization) return raw;

    const fields = raw.fields && { ...raw.fields, ...customization.fields };

    let presets = raw.presets;
    if (presets) {
        presets = { ...presets, ...customization.presets };
        for (const [presetID, lists] of Object.entries(customization.setFields ?? {})) {
            const preset = presets[presetID];
            if (preset) presets[presetID] = { ...preset, ...lists };
        }
        const append = (list: Record<string, string[]> | undefined, prop: 'fields' | 'moreFields') => {
            for (const [presetID, fieldIDs] of Object.entries(list ?? {})) {
                const preset = presets![presetID];
                if (!preset) continue;
                const existing = preset[prop] ?? [];
                const missing = fieldIDs.filter(id => !existing.includes(id));
                // the field may already come from `moreFields`; `fields` wins
                const moreFields = prop === 'fields'
                    ? preset.moreFields?.filter(id => !fieldIDs.includes(id))
                    : preset.moreFields;
                presets![presetID] = { ...preset, moreFields, [prop]: [...existing, ...missing] };
            }
        };
        append(customization.addFields, 'fields');
        append(customization.addMoreFields, 'moreFields');

        for (const [presetID, fieldIDs] of Object.entries(customization.removeFields ?? {})) {
            const preset = presets[presetID];
            if (!preset) continue;
            const keep = (list: string[] | undefined) => list?.filter(id => !fieldIDs.includes(id));
            presets[presetID] = { ...preset, fields: keep(preset.fields), moreFields: keep(preset.moreFields) };
        }
    }

    return { fields, presets };
}
