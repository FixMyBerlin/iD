import { describe, expect, it } from 'vitest';
import { bearingAlongLine, changeLabel, changesNothing, directionalTags, sideOfLine, signButtonKeys, signDirectionOnWay, signSourceChanges, signTagChanges } from '../../../modules/mapillary/sign_tagging';

describe('signButtonKeys', () => {
    it('offers the way\'s key with its directions, suggesting the sign\'s direction', () => {
        expect(signButtonKeys({})).toEqual({ keys: ['traffic_sign', 'traffic_sign:forward', 'traffic_sign:backward'], suggested: 'traffic_sign' });
        expect(signButtonKeys({}, { direction: 'backward' }).suggested).toBe('traffic_sign:backward');
        expect(signButtonKeys({ oneway: 'yes' }, { direction: 'forward' }).suggested).toBe('traffic_sign');
        expect(signButtonKeys({ oneway: 'yes' }, { direction: 'backward' }).suggested).toBe('traffic_sign:backward');
    });

    it('uses the side the bike sign stands on, if it has a bike lane or sidewalk', () => {
        const tags = { 'cycleway:right': 'track', 'cycleway:left': 'no', sidewalk: 'both' };
        expect(signButtonKeys(tags, { bikeSign: true, side: 'right', direction: 'forward' })).toEqual({
            keys: ['cycleway:right:traffic_sign', 'cycleway:right:traffic_sign:forward', 'cycleway:right:traffic_sign:backward'],
            suggested: 'cycleway:right:traffic_sign'
        });
        expect(signButtonKeys(tags, { bikeSign: true, side: 'left' }).keys[0]).toBe('sidewalk:left:traffic_sign');
        expect(signButtonKeys({}, { bikeSign: true, side: 'left' }).keys[0]).toBe('traffic_sign');
        expect(signButtonKeys(tags, { side: 'right' }).keys[0]).toBe('traffic_sign');
    });
});

describe('sideOfLine', () => {
    it('finds the side of a point along the way direction', () => {
        const line: [number, number][] = [[13.0, 52.0], [13.001, 52.0], [13.002, 52.0]];
        expect(sideOfLine(line, [13.0015, 52.0001])).toBe('left');
        expect(sideOfLine(line, [13.0015, 51.9999])).toBe('right');
        expect(sideOfLine([[13, 52]], [13, 52.1])).toBeUndefined();
    });
});

describe('sign direction', () => {
    // a way going north, like Karl-Marx-Straße at the 237 sign
    const north: [number, number][] = [[13.4412, 52.4720], [13.4413, 52.4730]];

    it('reads the way bearing near the sign', () => {
        expect(bearingAlongLine(north, [13.4413, 52.4725])).toBeCloseTo(3.9, 0);
    });

    it('turns the face direction into the travel direction along the way', () => {
        // the sign faces south (177°), so northbound traffic reads it
        expect(signDirectionOnWay(north, [13.4413, 52.4725], 176.9)).toBe('forward');
        expect(signDirectionOnWay(north, [13.4413, 52.4725], 10)).toBe('backward');
        expect(signDirectionOnWay(north, [13.4413, 52.4725], 90)).toBeUndefined();
        expect(signDirectionOnWay(north, [13.4413, 52.4725], undefined)).toBeUndefined();
    });

    it('makes speed tags directional', () => {
        expect(directionalTags({ maxspeed: '30', 'source:maxspeed': 'sign' }, 'forward'))
            .toEqual({ 'maxspeed:forward': '30', 'source:maxspeed:forward': 'sign' });
    });
});

describe('signTagChanges / signSourceChanges', () => {
    it('writes the sign, appending supplementary signs', () => {
        expect(signTagChanges({}, 'traffic_sign', 'DE:237')).toEqual({ traffic_sign: 'DE:237' });
        expect(signTagChanges({ 'cycleway:right:traffic_sign': 'DE:239' }, 'cycleway:right:traffic_sign', 'DE:1022-10'))
            .toEqual({ 'cycleway:right:traffic_sign': 'DE:239,1022-10' });
    });

    it('adds the image as source of the sign key', () => {
        expect(signSourceChanges({}, 'traffic_sign', '123')).toEqual({ 'source:traffic_sign:mapillary': '123' });
        expect(signSourceChanges({ 'source:cycleway:right:traffic_sign:mapillary': '1' }, 'cycleway:right:traffic_sign', '2'))
            .toEqual({ 'source:cycleway:right:traffic_sign:mapillary': '1;2' });
    });

    it('knows when nothing changes', () => {
        const tags = { traffic_sign: 'DE:237', 'source:traffic_sign:mapillary': '123' };
        expect(changesNothing(tags, signTagChanges(tags, 'traffic_sign', 'DE:237'))).toBe(true);
        expect(changesNothing(tags, signSourceChanges(tags, 'traffic_sign', '123'))).toBe(true);
    });
});

describe('changeLabel', () => {
    const changes = { maxspeed: '30', 'source:maxspeed': 'sign' };

    it('shows new, present and replaced values', () => {
        expect(changeLabel({}, changes)).toEqual({ label: 'maxspeed=30', present: false });
        expect(changeLabel({ maxspeed: '30', 'source:maxspeed': 'sign' }, changes)).toEqual({ label: '✓ maxspeed=30', present: true });
        expect(changeLabel({ maxspeed: '50' }, changes)).toEqual({ label: 'maxspeed=50→30', present: false, replaces: '50' });
        // the value is there, only the source is missing
        expect(changeLabel({ maxspeed: '30' }, changes)).toEqual({ label: 'maxspeed=30', present: false });
    });

    it('shortens image ids and shows added list entries', () => {
        expect(changeLabel({}, { 'source:traffic_sign:mapillary': '1586805862897512' }).label).toBe('source:traffic_sign:mapillary=1586…');
        expect(changeLabel({ 'source:traffic_sign:mapillary': '111111111' }, { 'source:traffic_sign:mapillary': '111111111;1586805862897512' }).label)
            .toBe('source:traffic_sign:mapillary=+1586…');
    });

    it('leaves out the key for sign buttons', () => {
        expect(changeLabel({ traffic_sign: 'DE:240' }, { traffic_sign: 'DE:237' }, false).label).toBe('DE:240→DE:237');
    });
});
