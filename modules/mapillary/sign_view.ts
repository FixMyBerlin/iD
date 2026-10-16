/**
 * Which image shows a Mapillary traffic sign best and where the sign is in it (WORKDOC feature 26).
 * Pure; positions are Mapillary JS "basic" coordinates (`[0, 0]` top left, `[1, 1]` bottom right
 * of the image, for 360° images the whole panorama).
 */

export type LngLat = [number, number];

export type SignImage = {
    id: string;
    /** Mapillary's computed position (used for the view math; signs are located from it) */
    loc: LngLat;
    /** the camera's GPS position, where iD draws the image marker */
    originalLoc?: LngLat;
    /** capture time in ms */
    capturedAt: number;
    isPano: boolean;
    creator?: string;
    /** the sign's outline in this image, if Mapillary detected it there */
    outline?: [number, number][];
};

export type ImageDay = {
    /** `YYYY-MM-DD` (UTC) */
    day: string;
    images: SignImage[];
    /** the day's image that shows the sign best (`compareSignImages`) */
    best: SignImage;
};

export type ViewTarget = { center: [number, number]; zoom: number };

/** Typical sign width (m) and its height above the camera (m) */
const SIGN_WIDTH = 0.65;
const SIGN_ABOVE_CAMERA = 0.25;
/** Horizontal field of view of the viewer at zoom 0, and the share of it the sign should fill */
const VIEW_FOV_AT_ZOOM_0 = 115;
const SIGN_SHARE = 0.3;
const MAX_ZOOM = 3;


export function distanceMeters(a: LngLat, b: LngLat): number {
    const rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad;
    const dLng = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad);
    return Math.sqrt(dLat * dLat + dLng * dLng) * 6371008.8;
}


/** Compass bearing in degrees from `from` to `to` */
export function bearingDegrees(from: LngLat, to: LngLat): number {
    const rad = Math.PI / 180;
    const [lng1, lat1] = [from[0] * rad, from[1] * rad];
    const [lng2, lat2] = [to[0] * rad, to[1] * rad];
    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    return (Math.atan2(y, x) / rad + 360) % 360;
}


/** Images about this far from the sign show it best: near enough to read, far enough to see it whole */
const GOOD_DISTANCE = 10;

/**
 * Better images first: those where Mapillary outlined the sign (the view can be aimed exactly),
 * then those nearest to a good distance (an image right below the sign does not show it)
 */
export function compareSignImages(a: SignImage, b: SignImage, signLoc: LngLat): number {
    if (!!a.outline !== !!b.outline) return a.outline ? -1 : 1;
    const score = (image: SignImage) => Math.abs(Math.log(Math.max(distanceMeters(image.loc, signLoc), 0.5) / GOOD_DISTANCE));
    return score(a) - score(b);
}


/** The images grouped by capture day, newest first, each day's images best first */
export function imagesByDay(images: readonly SignImage[], signLoc: LngLat): ImageDay[] {
    const days = new Map<string, SignImage[]>();
    for (const image of images) {
        const day = new Date(image.capturedAt).toISOString().slice(0, 10);
        if (!days.has(day)) days.set(day, []);
        days.get(day)!.push(image);
    }
    return [...days.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([day, list]) => {
            const sorted = [...list].sort((a, b) => compareSignImages(a, b, signLoc));
            return { day, images: sorted, best: sorted[0] };
        });
}


/** The image to show first: the newest day's best image */
export function bestImage(images: readonly SignImage[], signLoc: LngLat): SignImage | undefined {
    return imagesByDay(images, signLoc)[0]?.best;
}


function zoomForAngle(degrees: number): number {
    if (!(degrees > 0)) return 0;
    const zoom = Math.log2(VIEW_FOV_AT_ZOOM_0 * SIGN_SHARE / degrees);
    return Math.max(0, Math.min(MAX_ZOOM, zoom));
}


/** View on the sign from its outline in the image */
export function viewFromOutline(outline: readonly [number, number][], isPano: boolean): ViewTarget | undefined {
    if (!outline.length) return undefined;
    const xs = outline.map(point => point[0]);
    const ys = outline.map(point => point[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const size = Math.max(maxX - minX, maxY - minY);
    // a flat image at zoom 0 shows its whole width
    const zoom = isPano ? zoomForAngle(size * 360) : Math.max(0, Math.min(MAX_ZOOM, Math.log2(SIGN_SHARE / size)));
    return { center: [(minX + maxX) / 2, (minY + maxY) / 2], zoom };
}


/**
 * View on the sign in a 360° image from where it is: `x` is the horizontal position of the sign
 * (from the viewer's projection, or `panoX` as fallback); the height and zoom come from the distance.
 */
export function viewFromLocation(x: number, image: Pick<SignImage, 'loc' | 'isPano'>, signLoc: LngLat): ViewTarget {
    const distance = Math.max(distanceMeters(image.loc, signLoc), 1);
    const elevation = Math.atan(SIGN_ABOVE_CAMERA / distance) * 180 / Math.PI;
    const y = image.isPano ? 0.5 - elevation / 180 : 0.45;
    const width = 2 * Math.atan(SIGN_WIDTH / 2 / distance) * 180 / Math.PI;
    return { center: [x, y], zoom: zoomForAngle(width) };
}


/** A flat (perspective) camera as Mapillary describes it */
export type FlatCamera = {
    /** focal length relative to the larger image side */
    focal: number;
    width: number;
    height: number;
    /** compass direction the camera looks at */
    compassAngle: number;
    /** degrees, negative = looking down */
    pitch: number;
};

/** Flat images are mostly taken lower than 360° ones, so the sign is higher above the camera */
const SIGN_ABOVE_FLAT_CAMERA = 1.5;
const MAX_FLAT_ZOOM = 2;

/**
 * View on the sign in a flat image (pinhole model, without lens distortion); `undefined` when the
 * sign is outside the image. The zoom stays moderate because sign locations are a few meters off.
 */
export function viewFromFlatCamera(camera: FlatCamera, imageLoc: LngLat, signLoc: LngLat): ViewTarget | undefined {
    const rad = Math.PI / 180;
    const size = Math.max(camera.width, camera.height);
    const distance = Math.max(distanceMeters(imageLoc, signLoc), 1);
    const delta = ((bearingDegrees(imageLoc, signLoc) - camera.compassAngle + 540) % 360) - 180;
    if (Math.abs(delta) >= 80) return undefined;
    const x = 0.5 + camera.focal * Math.tan(delta * rad) * size / camera.width;
    if (x < 0 || x > 1) return undefined;
    const elevation = Math.atan(SIGN_ABOVE_FLAT_CAMERA / distance) / rad - camera.pitch;
    const y = Math.max(0, Math.min(1, 0.5 - camera.focal * Math.tan(elevation * rad) * size / camera.height));

    const fov = 2 * Math.atan(0.5 * camera.width / size / camera.focal) / rad;
    const width = 2 * Math.atan(SIGN_WIDTH / 2 / distance) / rad;
    const zoom = Math.max(0, Math.min(MAX_FLAT_ZOOM, Math.log2(fov * SIGN_SHARE / width)));
    return { center: [x, y], zoom };
}


/**
 * Pitch in degrees of a camera from Mapillary's rotation (axis-angle, world to camera; world z is
 * up, the camera looks along its z axis)
 */
export function cameraPitch(rotation: readonly number[]): number {
    const angle = Math.hypot(rotation[0], rotation[1], rotation[2]);
    if (!angle) return 0;
    const kz = rotation[2] / angle;
    // the vertical part of the viewing direction: the matrix entry R33 of Rodrigues' formula
    const up = Math.cos(angle) + (1 - Math.cos(angle)) * kz * kz;
    return Math.asin(Math.max(-1, Math.min(1, up))) * 180 / Math.PI;
}


/**
 * Horizontal position of a compass bearing in a 360° image whose center looks along `compassAngle`
 * (a rough estimate; the viewer's projection is more exact)
 */
export function panoX(bearing: number, compassAngle: number): number {
    const x = 0.5 + (bearing - compassAngle) / 360;
    return ((x % 1) + 1) % 1;
}


/**
 * The two lines of a capture day button: month and year ("Aug. 2026") and the age in short
 * ("vor 2 Monaten"): days below 45 days, months below 2 years, then years
 */
export function dayLabels(day: string, now: Date, locale: string): { month: string; age: string } {
    const date = new Date(`${day}T12:00:00Z`);
    const month = date.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const days = Math.max(0, Math.round((now.getTime() - date.getTime()) / 86400000));
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
    let age: string;
    if (days < 45) age = rtf.format(-days, 'day');
    else if (days < 730) age = rtf.format(-Math.round(days / 30.44), 'month');
    else age = rtf.format(-Math.round(days / 365.25), 'year');
    return { month, age };
}
