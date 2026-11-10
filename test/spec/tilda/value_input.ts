import { isWidthValueKey, normalizeDecimalComma } from '../../../modules/tilda/value_input';
import { sideWidthKeys } from '../../../modules/ui/sections/side_width_fields';


describe('tilda/value_input', () => {
    it('turns a decimal comma into a point, for width keys only', () => {
        expect(normalizeDecimalComma('2,5')).toBe('2.5');
        expect(normalizeDecimalComma('1,25 m')).toBe('1.25 m');
        expect(normalizeDecimalComma('2.5')).toBe('2.5');
        expect(isWidthValueKey('width')).toBe(true);
        expect(isWidthValueKey('cycleway:width')).toBe(true);
        expect(isWidthValueKey('cycleway:right:width')).toBe(true);
        expect(isWidthValueKey('width:effective')).toBe(true);
        expect(isWidthValueKey('source:width')).toBe(false);
        expect(isWidthValueKey('note:cycleway:width')).toBe(false);
        expect(isWidthValueKey('widthless')).toBe(false);
    });
});


describe('ui/sections/side_width_fields', () => {
    it('offers width keys for sides with a lane, track or sidewalk', () => {
        expect(sideWidthKeys({ 'cycleway:right': 'track', 'cycleway:left': 'no' })).toEqual(['cycleway:right:width']);
        expect(sideWidthKeys({ 'cycleway:both': 'lane' })).toEqual(['cycleway:both:width']);
        expect(sideWidthKeys({ cycleway: 'lane' })).toEqual(['cycleway:both:width']);
        expect(sideWidthKeys({ sidewalk: 'left' })).toEqual(['sidewalk:left:width']);
        expect(sideWidthKeys({ sidewalk: 'both' })).toEqual(['sidewalk:both:width']);
        expect(sideWidthKeys({ sidewalk: 'separate', 'cycleway:both': 'no' })).toEqual([]);
    });

    it('keeps width keys that are already tagged', () => {
        expect(sideWidthKeys({ 'cycleway:left:width': '1.5' })).toEqual(['cycleway:left:width']);
    });
});
