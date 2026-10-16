import { describe, expect, it } from 'vitest';

import { applyPresetCustomization } from '../../../modules/presets/customization';
import { RADNETZ_PRESET_CUSTOMIZATION } from '../../../modules/presets/radnetz_customization';

describe('applyPresetCustomization', () => {
    const raw = {
        fields: { name: { key: 'name', type: 'text' } } as any,
        presets: {
            'highway/primary': { tags: { highway: 'primary' }, geometry: ['line'], fields: ['name'], moreFields: ['dual_carriageway', 'lit'] },
            'highway/secondary': { tags: { highway: 'secondary' }, geometry: ['line'], fields: ['{highway/primary}'] }
        } as any
    };

    it('returns the input without a customization', () => {
        expect(applyPresetCustomization(undefined, raw)).toBe(raw);
    });

    it('adds fields and moves them from moreFields to fields', () => {
        const result = applyPresetCustomization({
            fields: { dual_carriageway: { key: 'dual_carriageway', type: 'check' } as any },
            addFields: { 'highway/primary': ['dual_carriageway'], 'highway/missing': ['dual_carriageway'] }
        }, raw);
        expect(result.fields!.dual_carriageway.type).toBe('check');
        expect(result.presets!['highway/primary'].fields).toEqual(['name', 'dual_carriageway']);
        expect(result.presets!['highway/primary'].moreFields).toEqual(['lit']);
        expect(result.presets!['highway/missing']).toBeUndefined();
        // does not change the input
        expect(raw.presets['highway/primary'].fields).toEqual(['name']);
    });

    it('appends moreFields without duplicates', () => {
        const result = applyPresetCustomization({ addMoreFields: { 'highway/primary': ['lit', 'width'] } }, raw);
        expect(result.presets!['highway/primary'].moreFields).toEqual(['dual_carriageway', 'lit', 'width']);
    });

    it('sets, removes fields and adds presets', () => {
        const result = applyPresetCustomization({
            setFields: { 'highway/primary': { fields: ['name', 'width'] } },
            removeFields: { 'highway/primary': ['lit'] },
            presets: { 'highway/cycleway/link': { tags: { highway: 'cycleway', cycleway: 'link' }, geometry: ['line'] } as any }
        }, raw);
        expect(result.presets!['highway/primary'].fields).toEqual(['name', 'width']);
        expect(result.presets!['highway/primary'].moreFields).toEqual(['dual_carriageway']);
        expect(result.presets!['highway/cycleway/link'].tags).toEqual({ highway: 'cycleway', cycleway: 'link' });
    });

    it('Radnetz: field lists only use known or custom fields', () => {
        const c = RADNETZ_PRESET_CUSTOMIZATION;
        expect(c.fields!.dual_carriageway.type).toBe('check');
        expect(c.setFields!['highway/residential'].fields).toContain('dual_carriageway');
        expect(c.setFields!['highway/residential'].moreFields).not.toContain('incline');
        expect(c.setFields!['highway/cycleway/bicycle_foot'].fields!.slice(0, 3)).toEqual(['name', 'is_sidepath', 'segregated']);
        expect(c.presets!['highway/residential/bicycle_road/vehicle_destination'].tags.vehicle).toBe('destination');
        expect(c.setFields!['highway/secondary'].moreFields).toContain('bicycle/direction');
        expect(c.presets!['highway/residential/bicycle_road'].moreFields).not.toContain('bicycle/direction');
    });
});
