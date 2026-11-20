import { describe, expect, it } from 'vitest';

import { labelForTrafficSignTagKey } from '../../../modules/presets/traffic_sign_fields';

describe('labelForTrafficSignTagKey', () => {
    it('labels the plain and directional keys', () => {
        expect(labelForTrafficSignTagKey('traffic_sign')).toBe('Traffic Sign');
        expect(labelForTrafficSignTagKey('traffic_sign:forward')).toBe('Traffic Sign (Forward)');
    });

    it('labels side keys of roads', () => {
        expect(labelForTrafficSignTagKey('cycleway:right:traffic_sign')).toBe('Traffic Sign (Right Bike Lane)');
        expect(labelForTrafficSignTagKey('sidewalk:left:traffic_sign:forward')).toBe('Traffic Sign (Left Sidewalk, forward)');
        expect(labelForTrafficSignTagKey('cycleway:traffic_sign')).toBe('Traffic Sign (Bike Lane)');
    });
});
