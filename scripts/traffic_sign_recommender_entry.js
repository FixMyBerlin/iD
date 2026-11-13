// Entry for `dist/traffic-sign-converter/recommender.js`, a lazy-loaded ESM bundle with the
// parts of the vendored traffic sign converter that turn a `traffic_sign` value into
// recommended tags. The vendored slim browser bundle (`id-field-browser.js`) does not
// include `signsToTags`, and the unbundled files import `opening_hours` by bare name.
export { trafficSignTagToSigns } from '../node_modules/@osm-traffic-signs/converter/dist/trafficSignTagToSigns/trafficSignTagToSigns.js';
export { signsToTags } from '../node_modules/@osm-traffic-signs/converter/dist/signsToTags/signsToTags.js';
export { signsToTrafficSignTagValue } from '../node_modules/@osm-traffic-signs/converter/dist/signsToTrafficSignTag/signsToTrafficSignTagValue.js';
