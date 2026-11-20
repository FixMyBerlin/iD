// Builds `dist/traffic-sign-converter/recommender.js` (see `traffic_sign_recommender_entry.js`):
// the parts of the traffic sign converter (`@osm-traffic-signs/converter`) that turn a `traffic_sign` value into tags,
// with two stand-ins to keep the lazy bundle small (`opening_hours`, only the German catalogue).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const shim = name => fileURLToPath(new URL(name, import.meta.url));

await build({
  entryPoints: [shim('./traffic_sign_recommender_entry.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  logLevel: 'warning',
  outfile: 'dist/traffic-sign-converter/recommender.js',
  alias: { opening_hours: shim('./traffic_sign_recommender_opening_hours_shim.js') },
  plugins: [{
    name: 'german-catalogue-only',
    setup(b) {
      b.onResolve({ filter: /\/countryDefinitions\.js$/ }, args =>
        args.importer.endsWith('traffic_sign_recommender_country_shim.js') ? undefined : { path: shim('./traffic_sign_recommender_country_shim.js') }
      );
    }
  }]
});
