import { PMTiles, TileType } from 'pmtiles';

/**
 * Support for Protomaps `.pmtiles` archives in the vector tile service.
 * A PMTiles archive is a single file that is read with HTTP range requests.
 * Only archives with Mapbox Vector Tiles (MVT) are supported.
 * See https://docs.protomaps.com/pmtiles/
 */

export type Tile = { id: string; xyz: [number, number, number] };

type Tiler = { zoomExtent(extent: [number, number]): unknown };

export type PMTilesSource = {
    pmtiles: PMTiles;
    /** resolves once the archive header is read and the zoom range is known */
    ready: Promise<void>;
};


export function isPMTilesUrl(url: string) {
    const path = url.split(/[?#]/)[0];
    return /\.pmtiles$/i.test(path);
}


/**
 * Opens the archive and limits `tiler` to the zoom levels that the archive contains.
 * Views above the max zoom then use the tiles of the max zoom ("overzoom").
 */
export function createPMTilesSource(url: string, tiler: Tiler): PMTilesSource {
    const pmtiles = new PMTiles(url);

    const ready = pmtiles.getHeader()
        .then(header => {
            if (header.tileType !== TileType.Mvt) {
                throw new Error(`Unsupported PMTiles tile type ${header.tileType}, only MVT is supported`);
            }
            tiler.zoomExtent([header.minZoom, header.maxZoom]);
        });

    return { pmtiles, ready };
}


/** Fetches one tile. Resolves to `undefined` if the archive has no data for it. */
export function fetchPMTile(source: PMTilesSource, tile: Tile, signal: AbortSignal) {
    const [x, y, z] = tile.xyz;
    return source.ready
        .then(() => source.pmtiles.getZxy(z, x, y, signal))
        .then(response => response?.data);
}
