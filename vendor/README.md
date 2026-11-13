# Vendored builds

Built files of packages that are not on npm yet, so the app also builds on Netlify.

| Folder | Source | Refresh |
|---|---|---|
| `surface-smoothness-field/` | `@osm-editor-kit/surface-smoothness-id-field` (`index.js` with d3 and the catalogue bundled in, `surface-smoothness-field.css`) and the photos of `@osm-editor-kit/surface-smoothness-data` (`images/`, from StreetComplete with their own licenses, see the catalogue's `attribution`), from `~/Development/OSM/osm-surface-smoothness-workspace/osm-surface-smoothness-tagging` (branch `image-first-ui`: the photo-first UI; npm 0.0.0 has the older UI) | `npm run vendor:surface-smoothness` (build the packages there first) |

`npm run dist` copies them to `dist/`. Switch to the npm dependency once the package is published with these files.

The traffic sign field was here until 2026-10-06; it now comes from npm (`@osm-traffic-signs/id-field`, `@osm-traffic-signs/converter`) and is copied from `node_modules/`.
