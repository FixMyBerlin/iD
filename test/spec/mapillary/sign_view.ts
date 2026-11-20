import { describe, expect, it } from 'vitest';
import { bearingDegrees, bestImage, cameraPitch, dayLabels, imagesByDay, panoX, viewFromFlatCamera, viewFromLocation, viewFromOutline, type SignImage } from '../../../modules/mapillary/sign_view';

const sign: [number, number] = [13.445274, 52.474224];
const day = (date: string) => new Date(`${date}T10:00:00Z`).getTime();
const images: SignImage[] = [
    { id: 'old-near', loc: [13.44528, 52.47423], capturedAt: day('2024-08-31'), isPano: true },
    { id: 'new-far', loc: [13.4456, 52.4742], capturedAt: day('2026-08-02'), isPano: true },
    { id: 'new-near', loc: [13.4454, 52.47425], capturedAt: day('2026-08-02'), isPano: true }
];

describe('imagesByDay / bestImage', () => {
    it('groups by day, newest first, the image at a good distance first', () => {
        const days = imagesByDay(images, sign);
        expect(days.map(d => d.day)).toEqual(['2026-08-02', '2024-08-31']);
        expect(days[0].best.id).toBe('new-near');
        expect(days[0].images.length).toBe(2);
    });

    it('shows the newest day\'s best image first', () => {
        expect(bestImage(images, sign)?.id).toBe('new-near');
        expect(bestImage([], sign)).toBeUndefined();
    });

    it('prefers images with the sign\'s outline, and not right below the sign', () => {
        const below = { id: 'below', loc: [13.445275, 52.474224] as [number, number], capturedAt: day('2024-09-01'), isPano: true };
        const ten = { id: 'ten', loc: [13.44542, 52.474224] as [number, number], capturedAt: day('2024-09-01'), isPano: true };
        expect(bestImage([below, ten], sign)?.id).toBe('ten');
        expect(bestImage([{ ...below, outline: [[0.5, 0.5]] as [number, number][] }, ten], sign)?.id).toBe('below');
    });
});

describe('view on the sign', () => {
    it('reads bearings and their place in a 360° image', () => {
        expect(bearingDegrees([13, 52], [13, 53])).toBeCloseTo(0);
        expect(bearingDegrees([13, 52], [14, 52])).toBeCloseTo(90, 0);
        expect(panoX(90, 90)).toBe(0.5);
        expect(panoX(0, 90)).toBe(0.25);
        expect(panoX(350, 10)).toBeCloseTo(0.4444);
    });

    it('zooms in more on far signs', () => {
        const near = viewFromLocation(0.6, { loc: [13.44535, 52.47425], isPano: true }, sign);
        const far = viewFromLocation(0.6, { loc: [13.4456, 52.4742], isPano: true }, sign);
        expect(near.center[0]).toBe(0.6);
        expect(near.center[1]).toBeLessThan(0.5);
        expect(far.zoom).toBeGreaterThan(near.zoom);
        expect(far.zoom).toBeLessThanOrEqual(3);
    });

    it('centers on the outline', () => {
        const view = viewFromOutline([[0.4, 0.4], [0.42, 0.4], [0.42, 0.43], [0.4, 0.43]], false);
        expect(view?.center[0]).toBeCloseTo(0.41);
        expect(view?.center[1]).toBeCloseTo(0.415);
        expect(view?.zoom).toBeCloseTo(3);
        expect(viewFromOutline([], true)).toBeUndefined();
    });

    it('aims at the sign in a flat image (Karl-Marx-Straße, sign seen at x 0.70, y 0.24)', () => {
        const pitch = cameraPitch([1.5950373204353, 0.12891562029802, -0.11141651929283]);
        expect(pitch).toBeCloseTo(-1.6, 1);
        const camera = { focal: 0.82176620034361, width: 4032, height: 3024, compassAngle: 351.27185608208, pitch };
        const view = viewFromFlatCamera(camera, [13.441292452663, 52.47237869733], [13.441302, 52.47246]);
        expect(view?.center[0]).toBeCloseTo(0.69, 1);
        expect(view?.center[1]).toBeGreaterThan(0.2);
        expect(view?.center[1]).toBeLessThan(0.35);
        expect(view?.zoom).toBeLessThanOrEqual(2);
        // behind the camera
        expect(viewFromFlatCamera({ ...camera, compassAngle: 180 }, [13.441292452663, 52.47237869733], [13.441302, 52.47246])).toBeUndefined();
    });
});

describe('dayLabels', () => {
    const now = new Date('2026-10-01T12:00:00Z');

    it('shows month and year and the age in short', () => {
        expect(dayLabels('2026-08-02', now, 'en')).toEqual({ month: 'Aug 2026', age: '2mo ago' });
        expect(dayLabels('2026-09-30', now, 'en').age).toBe('yesterday');
        expect(dayLabels('2025-04-15', now, 'en').age).toBe('18mo ago');
        expect(dayLabels('2023-08-01', now, 'en').age).toBe('3y ago');
        expect(dayLabels('2026-08-02', now, 'de')).toEqual({ month: 'Aug. 2026', age: 'vor 2 Monaten' });
    });
});
