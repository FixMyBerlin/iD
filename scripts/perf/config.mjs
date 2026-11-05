/**
 * Shared settings of the local performance harness (see README.md).
 * Everything runs on this machine: the page, the OSM data (Maid's mock API) and the
 * data layer files. The browser blocks every other request.
 */
export const HOST = '127.0.0.1';
export const PORT = 8085;
export const ORIGIN = `http://${HOST}:${PORT}`;
/** Maid's mock OSM API (`bun tools/mock-osm-api/server.ts` in the Maid repo) */
export const MOCK_API = process.env.PERF_MOCK_API || 'http://localhost:8090';
export const SCENE = process.env.PERF_SCENE || 'dense';

/** The TILDA files of the test link, as local copies (`npm run perf:fixtures`) */
export const FIXTURE_FILES = {
    'infravelo-ren-netz-kartierung-mask.pmtiles': 'https://tilda-geo.de/api/uploads/infravelo-ren-netz-kartierung-mask.pmtiles',
    'infravelo-ren-kartierung-tracks.pmtiles': 'https://tilda-geo.de/api/uploads/infravelo-ren-kartierung-tracks.pmtiles',
    'infravelo-ren-netz-zuteilung-netz.pmtiles': 'https://tilda-geo.de/api/uploads/infravelo-ren-netz-zuteilung-netz.pmtiles'
};
