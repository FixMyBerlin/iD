import { geoSphericalDistance } from '../geo';

/**
 * Links into infra3D, the street-level imagery we have for Berlin (WORKDOC feature 36).
 * The link format is the one of `buildInfra3dUrl` in `@osm-editor-kit/street-imagery` (the package
 * TILDA uses, `src/openers/infra3d.ts`). It is repeated here: importing the package bundles all
 * of it (about 7,000 lines with date-fns) for these few lines.
 * infra3D asks for a login; without an account the link ends on its login page.
 */

const INFRA3D_EDIT_URL = 'https://app.infra3d.com/edit/';

type Infra3dProject = {
    uid: string;
    label: string;
    /** west, south, east, north */
    bbox: [number, number, number, number];
};

/** The projects we link to, as in TILDA (`imageryLinks.const.ts`); a place inside the `bbox` gets the link */
export const INFRA3D_PROJECTS: Infra3dProject[] = [
    {
        uid: 'ec2428b7-8e49-4d93-80a0-edfec6da1cf3',
        label: 'infra3D Berlin',
        bbox: [13.08, 52.33, 13.77, 52.68]
    }
];

type Loc = [lon: number, lat: number];

function projectAt(loc: Loc) {
    return INFRA3D_PROJECTS.find(({ bbox }) => loc[0] >= bbox[0] && loc[0] <= bbox[2] && loc[1] >= bbox[1] && loc[1] <= bbox[3]);
}

/** infra3D has images at this place */
export function infra3dCovers(loc: Loc) {
    return !!projectAt(loc);
}

/**
 * The link for a place, or undefined outside the projects.
 * - `lookAt`: the nearest image (within 100 m), turned to the place
 * - `jumpTo`: the nearest image, e.g. to see the same view as a photo taken there
 */
export function infra3dUrl(loc: Loc, mode: 'lookAt' | 'jumpTo' = 'lookAt') {
    const project = projectAt(loc);
    if (!project) return undefined;
    const place = encodeURIComponent(JSON.stringify({ easting: loc[0], northing: loc[1], epsg: 4326 }));
    return `${INFRA3D_EDIT_URL}?projectUID=${encodeURIComponent(project.uid)}&${mode}=${place}`;
}

/** The point at half the length of a line: on the line, unlike the center of its bounding box */
export function middleOfLine(coords: Loc[]): Loc | undefined {
    if (!coords.length) return undefined;
    const lengths = coords.slice(1).map((coord, i) => geoSphericalDistance(coords[i], coord));
    let rest = lengths.reduce((sum, length) => sum + length, 0) / 2;
    for (let i = 0; i < lengths.length; i++) {
        if (rest <= lengths[i] && lengths[i] > 0) {
            const share = rest / lengths[i];
            const [a, b] = [coords[i], coords[i + 1]];
            return [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
        }
        rest -= lengths[i];
    }
    return coords[0];
}

/** Where to look for a feature: its location, the middle of a line, else the center of its extent */
export function infra3dTargetOfEntity(entity: iD.OsmEntity, graph: iD.Graph): Loc | undefined {
    if (entity.type === 'node') return (entity as iD.OsmNode).loc as Loc;
    if (entity.type === 'way' && !(entity as iD.OsmWay).isClosed()) {
        return middleOfLine(graph.childNodes(entity as iD.OsmWay).map(node => node.loc as Loc));
    }
    const extent = entity.extent(graph);
    return extent ? extent.center() as Loc : undefined;
}

export function openInfra3d(url: string) {
    window.open(url, '_blank', 'noopener');
}
