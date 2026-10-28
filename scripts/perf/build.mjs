// Builds dist/perf/iD.js: the editor with every outside endpoint replaced by a local one
// (Maid's mock OSM API, presets from node_modules, a blackhole for the rest). Usage: npm run perf:build
import esbuild from 'esbuild';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { MOCK_API, ORIGIN, SCENE } from './config.mjs';

Object.assign(process.env, {
    ID_API_CONNECTION_URL: `${MOCK_API}/s/${SCENE}`,
    ID_API_CONNECTION_API_URL: `${MOCK_API}/s/${SCENE}`,
    ID_API_CONNECTION_CLIENT_ID: 'perf-no-auth',
    ID_TAGINFO_API_URL: `${ORIGIN}/blackhole/taginfo/`,
    ID_NOMINATIM_API_URL: `${ORIGIN}/blackhole/nominatim/`,
    ID_PRESETS_CDN_URL: `${ORIGIN}/cdn/id-tagging-schema/`,
    ID_OCI_CDN_URL: `${ORIGIN}/cdn/osm-community-index/`,
    ID_NSI_CDN_URL: `${ORIGIN}/blackhole/nsi/`,
    ID_WMF_SITEMATRIX_CDN_URL: `${ORIGIN}/blackhole/wmf-sitematrix/`,
    ID_SHOW_DONATION_MESSAGE: 'false'
});
// after the env is set: config/envs.js reads it when it is imported
const { default: envs } = await import('../../config/envs.js');

await esbuild.build({
    define: envs,
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/id.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/perf/iD.js',
    target: browserslistToEsbuild(),
    loader: { '.DS_Store': 'empty', '.swp': 'empty' },
    treeShaking: false
});
