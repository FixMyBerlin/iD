// Stand-in for the converter's `data-definitions/countryDefinitions.js` in the traffic sign
// recommender bundle: only the German catalogue. The converter bundles all countries (~800 KB);
// this editor only recommends tags for `DE:` signs (`modules/traffic_sign/recommender.ts`).
import { trafficSignDataDE } from '../node_modules/@osm-traffic-signs/converter/dist/data-definitions/DE/trafficSignDataDE.js';

export const countryDefinitions = { DE: trafficSignDataDE };
export const countries = Object.keys(countryDefinitions);
export const countryDefinitionMap = new Map(Object.entries(countryDefinitions));
