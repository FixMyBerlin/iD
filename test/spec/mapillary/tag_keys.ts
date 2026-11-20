import { describe, expect, it } from 'vitest';

import {
    joinImageIds,
    mapillaryImageIds,
    mapillaryKeyLabel,
    mapillaryKeysOf,
    parseMapillaryKey,
    preferredImageId,
    splitImageIds,
    suggestedMapillaryKeys
} from '../../../modules/mapillary/tag_keys';

describe('mapillary/tag_keys', () => {
    it('parses the keys in our data', () => {
        expect(parseMapillaryKey('mapillary')).toMatchObject({ source: false, trafficSign: false });
        expect(parseMapillaryKey('mapillary:backward')).toMatchObject({ direction: 'backward' });
        expect(parseMapillaryKey('source:cycleway:right:traffic_sign:mapillary')).toMatchObject({ source: true, prefix: 'cycleway', side: 'right', trafficSign: true });
        expect(parseMapillaryKey('source:traffic_sign:forward:mapillary')).toMatchObject({ source: true, trafficSign: true, direction: 'forward' });
        expect(parseMapillaryKey('cycleway:both:mapillary:backward')).toMatchObject({ prefix: 'cycleway', side: 'both', direction: 'backward' });
        expect(parseMapillaryKey('source:mapillary:forward')).toMatchObject({ source: true, direction: 'forward' });
        expect(parseMapillaryKey('mapillary:2')).toMatchObject({ number: 2 });
        expect(parseMapillaryKey('mapillary:map_feature')).toBeUndefined();
        expect(parseMapillaryKey('was:mapillary')).toBeUndefined();
        expect(parseMapillaryKey('mapillary:2019')).toBeUndefined();
    });

    it('splits and joins id lists', () => {
        expect(splitImageIds('1; 2;;3')).toEqual(['1', '2', '3']);
        expect(joinImageIds(['1', '2', '1', ''])).toBe('1;2');
        expect(joinImageIds([])).toBeUndefined();
    });

    it('orders keys and picks the preferred image', () => {
        const tags = {
            highway: 'secondary', 'source:traffic_sign:mapillary': '9',
            'cycleway:right:mapillary': '5', mapillary: '1;2', 'mapillary:backward': '3'
        };
        expect(mapillaryKeysOf(tags)).toEqual(['mapillary', 'mapillary:backward', 'cycleway:right:mapillary', 'source:traffic_sign:mapillary']);
        expect(mapillaryImageIds(tags)).toEqual(['1', '2', '3', '5', '9']);
        expect(preferredImageId(tags)).toBe('1');
        expect(preferredImageId({ ...tags, 'mapillary:forward': '7' })).toBe('7');
        expect(preferredImageId({ 'cycleway:right:mapillary': '5' })).toBe('5');
        expect(preferredImageId({})).toBeUndefined();
    });

    it('labels keys', () => {
        expect(mapillaryKeyLabel('mapillary')).toBe('Image');
        expect(mapillaryKeyLabel('source:cycleway:right:traffic_sign:mapillary')).toBe('Right bike lane · traffic sign (source)');
        expect(mapillaryKeyLabel('mapillary:forward')).toBe('Forward');
    });

    it('suggests keys for the sides and signs the feature has', () => {
        const keys = suggestedMapillaryKeys({ highway: 'secondary', 'cycleway:right': 'track', 'cycleway:right:traffic_sign': 'DE:237', sidewalk: 'left' });
        expect(keys).toEqual([
            'mapillary:forward', 'mapillary', 'mapillary:backward',
            'cycleway:right:mapillary', 'sidewalk:left:mapillary', 'source:cycleway:right:traffic_sign:mapillary'
        ]);
    });

    it('skips sides mapped as separate ways', () => {
        const keys = suggestedMapillaryKeys({ highway: 'secondary', 'cycleway:both': 'separate', 'sidewalk:both': 'separate' });
        expect(keys).toEqual(['mapillary:forward', 'mapillary', 'mapillary:backward']);
    });
});
