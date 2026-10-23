import { dispatch as d3_dispatch } from 'd3-dispatch';
import type { Image as MlyViewerImage, Viewer } from 'mapillary-js';

import { patchHash } from '../behavior';
import { services } from '../services';
import { utilStringQs } from '../util';
import { accessToken, decodeDetectionOutline } from '../services/mapillary';
import { bearingDegrees, bestImage, cameraPitch, imagesByDay, panoX, viewFromFlatCamera, viewFromLocation, viewFromOutline, type ImageDay, type LngLat, type SignImage, type ViewTarget } from './sign_view';
import type { coreContext } from '../core';

/**
 * The selected Mapillary traffic sign (WORKDOC feature 26): clicking a sign on the map loads all
 * images that show it, shows the newest one turned to the sign, and keeps the list for the sign
 * bar in the viewer (`ui/mapillary_sign_bar.ts`).
 */

const apiUrl = 'https://graph.mapillary.com/';
const BATCH = 50;

export type SelectedSign = {
    id: string;
    /** Mapillary value, `regulatory--bicycles-only--g1` */
    value: string;
    loc: LngLat;
    firstSeen?: string;
    lastSeen?: string;
    /** where the sign's face points (degrees), Mapillary's `aligned_direction` */
    facing?: number;
    days: ImageDay[];
    /** the image shown for this sign */
    imageId?: string;
    /** detection id per image id, for the highlighted outline */
    detections: Map<string, string>;
    loading: boolean;
};

let _selected: SelectedSign | null = null;
let _requestId = 0;

export const signSelectEvents = d3_dispatch('change');


export function selectedSign(): SelectedSign | null {
    return _selected;
}


export function clearSelectedSign() {
    _requestId++;
    _selected = null;
    patchHash({ photo_sign: null });
    signSelectEvents.call('change');
}


async function getJSON<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ ...params, access_token: accessToken });
    const response = await fetch(`${apiUrl}${path}?${query}`);
    if (!response.ok) throw new Error(`Mapillary API ${response.status}`);
    return response.json() as Promise<T>;
}


type FeatureResponse = {
    id: string;
    object_value: string;
    geometry?: { coordinates: LngLat };
    first_seen_at?: string;
    last_seen_at?: string;
    aligned_direction?: number;
    images?: { data: { id: string; geometry: { coordinates: LngLat } }[] };
};

type ImageResponse = {
    id: string;
    captured_at: number;
    is_pano: boolean;
    creator?: { username: string };
    computed_geometry?: { coordinates: LngLat };
    geometry?: { coordinates: LngLat };
};

type DetectionResponse = { data: { id: string; geometry: string; image: { id: string } }[] };


async function loadSignImages(feature: FeatureResponse): Promise<{ images: SignImage[]; detections: Map<string, string> }> {
    const ids = (feature.images?.data ?? []).map(image => image.id);
    const infos: ImageResponse[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
        const result = await getJSON<Record<string, ImageResponse>>('', {
            ids: ids.slice(i, i + BATCH).join(','),
            fields: 'id,captured_at,is_pano,creator,computed_geometry,geometry'
        });
        infos.push(...Object.values(result));
    }

    const outlines = new Map<string, [number, number][]>();
    const detections = new Map<string, string>();
    try {
        const result = await getJSON<DetectionResponse>(`${feature.id}/detections`, { fields: 'id,geometry,image' });
        for (const detection of result.data) {
            outlines.set(detection.image.id, decodeDetectionOutline(detection.geometry));
            detections.set(detection.image.id, detection.id);
        }
    } catch {
        // without outlines the view is computed from the locations
    }

    const images = infos.map(info => ({
        id: info.id,
        loc: (info.computed_geometry ?? info.geometry)!.coordinates,
        originalLoc: info.geometry?.coordinates,
        capturedAt: info.captured_at,
        isPano: info.is_pano,
        creator: info.creator?.username,
        outline: outlines.get(info.id)
    })).filter(image => image.loc);
    return { images, detections };
}


/**
 * Selects a sign: loads its images and shows the best one, turned to the sign. Images outside the
 * age filter are listed too, but the first image is from within it when there is one.
 */
export async function selectMapillarySign(context: coreContext, sign: { id: string; value: string; loc: LngLat }) {
    const requestId = ++_requestId;
    _selected = { id: sign.id, value: sign.value, loc: sign.loc, days: [], detections: new Map(), loading: true };
    // in the URL, so a reload shows the sign again (`restoreSelectedSign`)
    patchHash({ photo_sign: sign.id });
    signSelectEvents.call('change');

    try {
        const feature = await getJSON<FeatureResponse>(sign.id, {
            fields: 'id,object_value,geometry,first_seen_at,last_seen_at,aligned_direction,images'
        });
        const { images, detections } = await loadSignImages(feature);
        if (requestId !== _requestId) return;

        const loc = feature.geometry?.coordinates ?? sign.loc;
        _selected = {
            ..._selected!,
            value: feature.object_value ?? sign.value,
            loc,
            firstSeen: feature.first_seen_at,
            lastSeen: feature.last_seen_at,
            facing: feature.aligned_direction,
            days: imagesByDay(images, loc),
            detections,
            loading: false
        };

        const fromDate = context.photos().fromDate();
        const recent = fromDate ? images.filter(image => image.capturedAt >= new Date(fromDate).getTime()) : images;
        const first = bestImage(recent.length ? recent : images, loc);
        signSelectEvents.call('change');
        if (first) await showSignImage(context, first.id);
    } catch (err) {
        if (requestId !== _requestId) return;
        console.error('mapillary sign', err);   // eslint-disable-line no-console
        _selected = { ..._selected!, loading: false };
        signSelectEvents.call('change');
    }
}


/** Selects the sign of the URL (`photo_sign=<id>`) again after a reload; its value and place come from Mapillary */
export function restoreSelectedSign(context: coreContext) {
    const id = utilStringQs(window.location.hash).photo_sign;
    if (!id || !/^\d+$/.test(id) || _selected) return;
    selectMapillarySign(context, { id, value: '', loc: context.map().center() as LngLat });
}


/** Shows one of the selected sign's images, turned to the sign */
export async function showSignImage(context: coreContext, imageId: string) {
    const service = services.mapillary;
    const sign = _selected;
    if (!service || !sign) return;
    const image = sign.days.flatMap(day => day.images).find(candidate => candidate.id === imageId);
    if (!image) return;

    sign.imageId = imageId;
    signSelectEvents.call('change');

    await service.ensureViewerLoaded(context);
    const detectionId = sign.detections.get(imageId);
    if (detectionId) service.highlightDetection({ id: detectionId } as Parameters<typeof service.highlightDetection>[0]);
    service.showViewer(context);
    // the bar shows only while the Mapillary viewer is open; reopening on the same image sends no image event
    signSelectEvents.call('change');

    const viewer = service.getViewer();
    if (!viewer) return;
    // Mapillary JS rejects a move to the image it already shows (auto-show may have opened it);
    // `viewer.getImage()` never settles while the viewer has no image yet, so ask the service
    let current: MlyViewerImage;
    try {
        current = service.getActiveImage()?.id === imageId ? await viewer.getImage() : await viewer.moveTo(imageId);
    } catch (error) {
        service.imageFailed(error);   // unless another image was requested meanwhile
        return;
    }
    if (_selected !== sign || sign.imageId !== imageId) return;
    service.setActiveImage(current);
    await turnToSign(viewer, current, image, sign);
}


/** Outlines of all signs Mapillary detected in an image, by image id */
const _imageOutlines = new Map<string, Promise<{ id: string; value: string; outline: [number, number][] }[]>>();

function imageOutlines(imageId: string) {
    if (!_imageOutlines.has(imageId)) {
        _imageOutlines.set(imageId, getJSON<{ data: { id: string; value: string; geometry: string }[] }>(`${imageId}/detections`, { fields: 'id,value,geometry' })
            .then(result => result.data.map(d => ({ id: d.id, value: d.value, outline: decodeDetectionOutline(d.geometry) })))
            .catch(() => {
                _imageOutlines.delete(imageId);
                return [];
            }));
    }
    return _imageOutlines.get(imageId)!;
}


/** Horizontal distance of two image positions; 360° images wrap around */
function xDistance(a: number, b: number, isPano: boolean) {
    const d = Math.abs(a - b);
    return isPano ? Math.min(d, 1 - d) : d;
}


/**
 * Turns the viewer to the sign. Best is the sign's outline in this image (the box the viewer draws):
 * the one Mapillary linked to this sign, else the image's detection of the same sign value (the
 * one nearest to where the sign should be, if there are several). Without an outline the position is computed from the locations.
 */
async function turnToSign(viewer: Viewer, current: MlyViewerImage, image: SignImage, sign: SelectedSign) {
    const signLoc = sign.loc;
    const compass = current.computedCompassAngle ?? current.originalCompassAngle;
    let estimate: ViewTarget | undefined;

    if (!image.isPano && current.cameraParameters?.length) {
        estimate = viewFromFlatCamera({
            focal: current.cameraParameters[0],
            width: current.width,
            height: current.height,
            compassAngle: compass,
            pitch: cameraPitch(current.rotation)
        }, image.loc, signLoc);
    } else if (image.isPano) {
        // first a rough direction from the compass, then the viewer's own projection of the sign
        let x = panoX(bearingDegrees(image.loc, signLoc), compass);
        try {
            viewer.setCenter([x, 0.5]);
            const pixel = await viewer.project({ lng: signLoc[0], lat: signLoc[1] });
            const basic = pixel && await viewer.unprojectToBasic(pixel);
            if (basic && basic[0] >= 0 && basic[0] <= 1) x = basic[0];
        } catch {
            // keep the estimate
        }
        estimate = viewFromLocation(x, image, signLoc);
    }

    let outline = image.outline;
    let detectionId = sign.detections.get(image.id);
    if (!outline) {
        const candidates = (await imageOutlines(image.id)).filter(d => d.value === sign.value);
        const centerX = (d: { outline: [number, number][] }) => viewFromOutline(d.outline, image.isPano)!.center[0];
        const nearest = candidates.sort((a, b) => estimate
            ? xDistance(centerX(a), estimate.center[0], image.isPano) - xDistance(centerX(b), estimate.center[0], image.isPano)
            : 0)[0];
        // Mapillary lists this image as showing the sign, so a detection of the same sign is it; with
        // several, the one nearest to the estimate (the estimate alone can be far off in 360° images)
        if (nearest) {
            outline = nearest.outline;
            detectionId = nearest.id;
        }
    }
    if (_selected !== sign || sign.imageId !== image.id) return;

    if (detectionId && detectionId !== sign.detections.get(image.id)) {
        // draw this outline as the selected one (yellow, with its name)
        sign.detections.set(image.id, detectionId);
        services.mapillary.highlightDetection({ id: detectionId } as Parameters<typeof services.mapillary.highlightDetection>[0]);
        services.mapillary.resetTags();
        services.mapillary.updateDetections(image.id, `${apiUrl}${image.id}/detections?access_token=${accessToken}&fields=id,image,geometry,value`);
    }

    const view = (outline && viewFromOutline(outline, image.isPano)) || estimate;
    if (!view) return;   // the sign is not in this flat image's view
    viewer.setCenter(view.center);
    viewer.setZoom(view.zoom);
}
