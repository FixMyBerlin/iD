# Radnetz Berlin editor — WORKDOC

A project-specific iD build that combines several features into one editor for the Radnetz Berlin project.
This file holds the plan and progress. Update it whenever something changes.

## Goals

1. **Primary:** build a great, complete editor for this project, here in this worktree.
2. **Secondary:** later, extract single features into separate branches/contributions.

We do not let goal 2 slow down goal 1. Features are merged or built directly on `radnetz-mapping`.
Keep features reasonably separated (own files, own commits, clear commit messages) where it's cheap, so they can be extracted later.

## Ground rules

- We work on **`FixMyBerlin/iD`** (remote `fixmyberlin`), since 2026-10-13. Push with `git push fixmyberlin radnetz-mapping` (the branch tracks it, so plain `git push` works too). With `gh`, always pass `--repo FixMyBerlin/iD`: the fork's parents are `tordans/iD` and `openstreetmap/iD`, and `gh` would pick one of them otherwise.
- `tordans/iD` stays `origin`: the repository is shared with the other iD worktrees, which push there. It was our fork until then. Its branch `radnetz-berlin` and its PR 10 are frozen; we do not push there anymore.
- `openstreetmap/iD` (`upstream`) is read-only for us: only fetch from it. Its push URL is set to `NO_PUSH_to_openstreetmap_iD`.
- All feature work happens on the `radnetz-mapping` branch unless noted. It is the default branch of the fork; `develop` there is the copy of upstream.
- Netlify (site `radnetz-mapping`, FixMyCity team) builds and serves only this branch: `https://radnetz-mapping.netlify.app`. No deploy previews, no other branches (`netlify.toml`).

## Setup

| What | Value |
|---|---|
| Worktree | `~/Development/OSM/iD--radnetz-berlin` |
| Branch | `radnetz-mapping` → `fixmyberlin/radnetz-mapping` (FixMyBerlin/iD); until 2026-10-13 `radnetz-berlin` on tordans/iD |
| Base | `upstream/develop` @ `32c05ed6f` (merged 2026-10-13; first base `d9879e101`, 2026-09-27) |
| Main checkout | `~/Development/OSM/iD` (`develop`) |

Updating the base: `git -C ~/Development/OSM/iD pull --ff-only upstream develop`, then merge `develop` into `radnetz-mapping`.

## Features

Status: ⬜ not started · 🟨 in progress · ✅ integrated

### 1. Multiple custom backgrounds — ✅

- Source: branch `multiple-custom-backgrounds` (worktree `~/Development/OSM/iD--backgrounds`, 23 commits, on origin).
- Redo of openstreetmap/iD#11850 for #8874. Stable synthetic id plus a single `addOrGetCustomSource` path.
- Manual browser tests still TODO.

### 2. Traffic signs — ✅

- Source: branch **`traffic-sign-field-integration`** (worktree `~/Development/OSM/iD-traffic-sign-field`, 1 commit, 2026-06-06).
  - Adds a lazy-loaded `traffic_sign` field in the inspector (`modules/ui/fields/traffic_sign.js`, `modules/presets/traffic_sign_fields.js`, `modules/ui/sections/traffic_sign_inspector_fields.js`, build step in `scripts/build_data.js`).
  - Uses the `@osm-traffic-signs/id-field` package from `~/Development/OSM/osm-traffic-sign-tools-id-field` (also WIP, last commit "WIP").
  - The worktree has **uncommitted changes** (`data/core.yaml`, `data/traffic_sign_field_locales.yaml`, `package.json`, `scripts/server.js`, …). Review them before taking the branch over.
- Decision (2026-09-27): use this branch. The old `traffic-signs` branch (2025-02) was an early prototype (combo field with 3rd-party icons, openstreetmap/iD#10254) and is superseded.
- Expect a UI rework after integration.
- **Review (2026-09-30):**
  - The field only edits the sign value (plus a link to the external tool). It did not suggest the tags a sign implies.
  - Fixed: side keys (`cycleway:right:traffic_sign`) showed the raw key as label.
  - Fixed: presets that list `traffic_sign` (our road/path presets, feature 15) showed the field twice.
- **Tag suggestions (2026-09-30).** Below each traffic sign field, the same tag-plan UI as the TILDA section (`modules/ui/tag_plan.ts`, `css/95_tag_plan.css`) lists what the changed sign implies, with one "Apply these tags" button (one undo step). The TILDA section then shows the category for the new tags, so the flow is: change the sign → apply the suggested tags → TILDA recomputes.
  - Source of the rules: the traffic sign converter's `signsToTags` (each sign's `tagRecommendationsByGeometry`, geometry `way`). It comes from a lazy bundle `dist/traffic-sign-converter/recommender.js` (~160 KB), built from the vendored converter files by `npm run dist:traffic-sign-recommender` (`scripts/traffic_sign_recommender_entry.js`). `opening_hours` is replaced by a shim, since it is only used to prettify conditional time ranges and is ~750 KB. The slim `id-field-browser.js` has no `signsToTags`; the source repo's build setup has uncommitted WIP, so the bundle is built here.
  - Logic in `modules/traffic_sign/sign_tag_plan.ts` (tests in `test/spec/traffic_sign/`):
    - Add or change the implied tags.
    - `highway` changes only on separate paths (e.g. 237 → 240 turns `highway=cycleway` into `path`).
    - Roads ignore signs whose `highway` list does not include them (e.g. 245 on a primary).
    - Normalize the value (`DE:241` → `DE:241-30`).
    - Remove tags the previous sign implied, or restore their downloaded value.
    - The previous sign is the value before the change while the way stays selected, else the downloaded one. Unchanged signs show nothing, so existing data is not nagged.
  - Road sides (`cycleway:<side>:traffic_sign`, `sidewalk:<side>:traffic_sign`) get only `bicycle`, `foot` and `segregated`, as side keys.
  - **Package update (2026-10-01):** vendored the current `feature/id-field` build (`npm run vendor:traffic-signs`). It shows `traffic_sign=none` as "No sign" / "Unbeschildert" (TILDA's label) with the tooltip "explicitly no sign" instead of "Unknown sign" (commit `eb562b88` in the tool, local, not pushed). The package now has its own tag suggestions; this editor turns them off (`suggestTags: false`) and keeps its own, whose box class is now `traffic-sign-plan` (the package removed every `.traffic-sign-suggestions`). The converter now bundles all countries; the recommender build (`scripts/build_traffic_sign_recommender.js`) swaps in a German-only `countryDefinitions`, so it stays ~160 KB instead of ~980 KB.
  - Open: directional keys (`traffic_sign:forward/backward`) get no suggestions yet. Conditional values are not prettified (shim). The same plan could later feed a validation for existing inconsistent data (feature 9).

### 3. Favorites and shortcuts — ✅

- Source: branch **`pr/11269-favorites-shortcuts`** on tordans/iD (2 commits).
  - `632e57d85`: kaligrafy's original commit, rebased onto 2026 develop.
  - `d310bac74`: Tobias's UI rework (favorites, numbered shortcuts, selectable in preset lists, settings UI; `preset_shortcuts.js` → `preset_favorites.ts`).
- The original PR openstreetmap/iD#11269 has not changed since Aug 2025; the tordans branch is the newer version.
- **Needed rework: shortcut assignment.**
  - Today: every favorite gets a number shortcut automatically from its position, and numbers shift when favorites are reordered.
  - Wanted:
    - A new favorite gets a free number automatically, **preferring left-hand keys** (e.g. 1–5 before 6–0).
    - Once assigned, the number is **fixed**. Reordering or removing other favorites does not change it.
    - Users change numbers in the **preferences panel**. Conflicts (two favorites with one number) are handled there.
  - Shortcuts stay **number-only** (no alphanumeric like `8a`).
- Related, low priority: kaligrafy/iD branches `feat/preset-shortcut-from-selection`, `feat/preset-shortcuts-batch`, `feat/clone-shortcuts` (based on kaligrafy's `v5`/`v6`, not on develop).

### 4. Custom data layers: multiple, from URLs, PMTiles — ✅

- Built directly on `radnetz-berlin`; extract into its own branch later if needed.
- Goal: iD has a single custom data layer (GeoJSON/GPX/KML via upload or URL). We want:
  - **multiple** custom data layers,
  - loaded from **external URLs** (no upload needed),
  - **PMTiles** (vector tiles) support, so we only load the part of the map being edited,
  - the same UI pattern as multiple custom backgrounds (feature 1), but in the Map data pane.
- **Minimap** (2026-10-03): enabled custom data layers are drawn in the minimap too, in their colour, as thin outlines with a light fill (no labels, not clickable). GeoJSON layers show completely; PMTiles / vector tile layers show the part the main map has loaded (the minimap does not load tiles for its wider view, that would abort the main map's requests). `svgCustomData(…, { minimap: true })`, used in `ui/map_in_map.js`.
- Fallback: if PMTiles is too hard, start with GeoJSON from URL. GeoJSON can get large, and we only edit parts of the map.
- Test data (same data in two formats):
  - `https://tilda-geo.de/api/uploads/radverkehrsnetz-vorrangnetz-mask.pmtiles`
  - `https://tilda-geo.de/api/uploads/radverkehrsnetz-vorrangnetz-mask.geojson`
  - `https://tilda-geo.de/api/uploads/radverkehrsnetz.pmtiles`
  - `https://tilda-geo.de/api/uploads/radverkehrsnetz.geojson`
  - The real project file will be similar.
- Reference: Rapid (`~/Development/OSM/Rapid`) already supports PMTiles:
  - `modules/services/VectorTileService.js`: MVT/PMTiles fetching and parsing
  - `modules/pixi/PixiLayerCustomData.js`: custom data layer rendering
  - `modules/ui/settings/custom_data.js`: custom data URL dialog
  - `modules/ui/sections/data_layers.js`: data layers pane
  - `modules/util/fetch_response.js`
- Plan sketch:
  1. Read Rapid's VectorTileService for PMTiles handling (`pmtiles` lib, header/directory reads).
  2. Map it onto iD's `modules/svg/data.js` (d3/SVG, not Pixi) and `modules/ui/sections/data_layers.js`.
  3. Reuse the storage/id model from multiple custom backgrounds.
- **Filter (2026-09-30, ✅):** each layer can have an optional `key` + `value` filter in its settings.
  - Only features whose properties match are drawn: no key = all features; key without value = the property is set; key and value = the property equals the value (as a string, so numbers match too).
  - The row shows `Name (key=value)` (`key=*` without a value), the filter part smaller and muted; the tooltip adds "Only features with key=value".
  - The same URL can be added several times with different filters, e.g. `radverkehrsnetz.pmtiles` once with `ist_radvorrangnetz=Radvorrangnetz` and once with `ist_radvorrangnetz=Ergänzungsnetz` in different colors.
  - Code: `matchesCustomDataFilter` / `customDataFilterLabel` in `modules/renderer/custom_data_layers.ts`, applied in `layerFeatures()` of `modules/svg/custom_data.ts`. Stored as `filterKey` / `filterValue` (left out when empty).
  - Tooltip fix: read-only and hidden rows dimmed their whole label, including the tooltip inside it, so the tooltip was see-through. Now only the label's content is dimmed.

### 5. Map style "lenses" — ✅ (Radnetz QA lens bundled)

- Idea: a lens is a CSS file that restyles the OSM data on the map for one mapping theme or for QA (issue openstreetmap/iD#11189).
- Source A: kaligrafy's PR openstreetmap/iD#12473 "Add Lens support" (branch `kaligrafy/iD:feat/theme-css-upstream`, 5 commits, Jun 2026):
  - Lens section in the Map data pane. Built-in default lens or an imported `.css` file, kept in localStorage.
  - Lens CSS is injected unlayered and core CSS is wrapped in `@layer ideditor`, so a lens overrides core styles without `!important`.
  - `svgTagClasses` emits `tag-{key}[-{value}]` classes only for keys that the lens CSS uses.
  - Imported CSS is sanitized (`@import`/`url()` removed) and a warning is shown.
- Source B: **kaligrafy/iD `v6` branch** (last change 2026-09-22), further along than the PR:
  - lens keyboard shortcuts (Alt+letter) plus a UI to assign them (`modules/behavior/lens_shortcuts.js`),
  - bundled lenses built at build time (`config/bundled_lenses.js`, `scripts/build_bundled_lenses.js`, `lenses/*.css`: maxspeed, Québec, …),
  - more `tag_classes` support (maxspeed, flat counts, highway error classes).
  - `v6` has 195 commits of mostly Québec-specific work, so don't merge the branch. Cherry-pick the lens commits:
    `b50a25d67`, `484e80ecf`, `4d4c0047d` (shortcuts), `dfadc0451` (maxspeed tag classes), `46bb85bdc` (bundling), and parts of `1c5a20e12` / `1d1f563f9`.
- Plan: take Source A as the base, add the Source B commits, then write our own Radnetz Berlin lens CSS.
- Done (2026-09-27): merged Source A. Cherry-picked the v6 shortcut commits `b50a25d67`, `484e80ecf`, `4d4c0047d` (Alt+letter, shortcut UI). `lens_shortcuts` converted to TS, strings moved to `data/core.yaml` (v6 uses its own `data/locales/custom/*.json`).
- Not taken yet: maxspeed tag classes (`dfadc0451`) and build-time bundling (`46bb85bdc`, `1c5a20e12`, `1d1f563f9`). They are mixed with Québec lens files. Build our own bundling once we have a Radnetz Berlin lens.
- Note: the lens only overrides core styles when `dist/iD.css` is wrapped in `@layer ideditor` (done by `scripts/build_css.js`). Restart the dev server after pulling changes to `build_css.js`.
- Done (2026-09-30): **bundled lenses** and the first one, **"Radnetz QA"** (`modules/lenses/radnetz_qa.ts`, listed in `modules/lenses/index.ts`). The lens list is now: Default (iD's normal style, `⌥D`) and Radnetz QA (`⌥Q`), then imported lenses. A bundled lens has a fixed shortcut (reserved for imported lenses), localized name/tooltip, its CSS as a string, and optional computed classes: while it is active, `appendLensTagClasses` adds `classes(tags)` to every map element.
  - Radnetz QA colors ways by the TILDA checklist (feature 8, `modules/tilda/qa_state.ts`, cached per tags object): green = all required tags there, orange = a required tag missing / not accepted by TILDA / only guessed, red = TILDA cannot decide the category (`needsClarification`, `*_adjoiningOrIsolated`, `*_advisoryOrExclusive`). Wide = bike infrastructure (way or its sides), thin = roads without it (road checklist); everything else fades to 30 %. Classes `tilda-qa`, `tilda-qa-complete|incomplete|unclear`, `tilda-qa-bike|road`.
  - Around Rosenthaler Platz (z17): 192 ways, 21 complete, 167 incomplete (mostly roads without `width`), 4 unclear.
- Open: a legend on the map; separate colors per side (lanes are drawn on the road's line); "why incomplete" on hover.
- Fetch without adding a remote: `git fetch https://github.com/kaligrafy/iD.git feat/theme-css-upstream:kg-lens v6:kg-v6`.

### 6. Way-as-table comparison — ✅ (v1, read-only)

- Renders a chain of connected ways as a table so you can compare the tags of the current way with the previous and following ones.

**Wanted UI**

- **Panel**
  - A panel that by default spans the full width, is docked at the bottom and takes about 2/3 of the editor height.
  - Users can resize and move it. Size and position are stored in local preferences (`prefs`).
  - iD's existing info panels (`modules/ui/info.js`, Cmd+I) are small fixed boxes, so this needs a new panel component.
- **Content:** columns for the selected way, the previous way(s) and the next way(s). Rows are all tags that appear on any of these ways.
- **Navigation**
  - Previous/next buttons select the neighbour way and move the table along the chain.
  - Hovering a button (or a column) highlights that way on the map, so you can see what you are about to select. Use iD's hover behavior (`utilHighlightEntities` / hover classes).
- **Tag highlight:** tags that belong to the selected way's preset (its fields plus `moreFields`) get a subtle highlight, so important tags stand out from the rest.
- **Editing**
  - v1: read-only, if that is easier.
  - v2: raw tag editing like the "Tags" section (text or list), no field widgets.

**Open design points**

- **Junctions:** when more than two ways meet at an end node, which one is "next"?
  - Default: best match (same `highway`/`name`, continuing direction).
  - If the match is ambiguous, show a small chooser.
- **Direction:** order columns along the selected way's direction. Mark neighbours that point the opposite way.
- **Chain length:** how many neighbours per side (the core package defaults to 5, with "load more")?

**Done (2026-09-27)**

- `modules/way_table/chain.ts`: chain logic ported from `osm-way-as-table-ui` (`buildChain`, `neighborMatch`, `direction`), synchronous on the iD graph. Up to 3 ways per side; `choices` pins ways at ambiguous junctions.
- `modules/way_table/tag_rows.ts`: one row per key, cell status `same`/`changed`/`added`/`removed`/`empty`, preset keys first.
- `modules/ui/way_table_panel.ts`: the panel. Toggle with `K` (`T`/`Y` are the flip operations) or the checkbox in Map Data ▸ Data Layers. Layout stored in `way-table-panel-layout` as fractions of the map area.
- 2026-09-29: the panel is now docked at the bottom (full width minus the map controls). Its height follows the table up to a maximum set by dragging the top edge (`way-table-panel-max-height`, fraction of the map height; the old free move/resize and `way-table-panel-layout` are gone). Clicking a way column or previous/next selects the way and eases the map so the way is centered in the map area above the panel, zooming out if it does not fit (`flyTo()`, measured against the map surface because the map runs under the top bar).
- 2026-10-03: the table is now a **dock below the map**, not a floating panel (possible since the bottom bar is gone, feature 31).
  - It is a child of `.main-content`; the map gets smaller (`--way-table-height` for `.main-map`, and `ui.onResize()` subtracts the dock from the map dimensions).
  - The height is fixed and stored in px (`way-table-panel-height`, default 200, at least 80, at most 70 % of the editor height). Drag the top edge to change it. It no longer follows the table or the selected way.
  - While it is open and no way is selected, it stays open and shows a hint.
  - Compact: no header row. Previous / next are in the table's corner cell; cell padding is smaller.
  - Toggle: the button in the bottom corner of the map (blue while open), or `K`. `K` is now in the shortcut list (`?`).
  - The checkbox in Map Data ▸ Data layers is gone (`sections/way_table_panel_item.ts` removed); the button replaces it.
  - The info panels keep 44 px free at the edge, so they do not cover the map buttons.
  - German strings for the table added.
  - Checked in the browser: open / close with button and `K`, map height before and after, reload with the dock open, resize by dragging (and its upper limit), previous / next, hint without a selection, info panel next to the button.
- 2026-10-03: at most 2 ways before and 2 after the selected way (was 3). A way's header cell shows name and way id; the whole cell is the hover area (highlights the way on the map) and the click target. The junction chooser shows the id too.
- 2026-10-03: the columns follow the **order of the ways on the map**: left to right, or top to bottom when the chain is mostly vertical (`runsAgainstReadingOrder`, `mirrorChain` in `chain.ts`; `orderLikeMap` in the panel compares the screen positions of the chain's two ends). Before, the order followed the direction of the selected way, so the table could read right to left. Only the column order changes: tags and the ⇄ mark stay relative to the direction of the selected way. The previous / next buttons go to the left / right column. Limit: a chain near 45° or with a sharp bend can change its order when the selection moves along it.
- Reference, not built: the street space editor (`~/Development/OSM/parking-lanes`, `app/src/modes/table/domain/window-table-chain.ts`) shows the opposite carriageway of a dual carriageway as an extra column next to its pair ("dual" badge), found by geometry (`find-dual-carriageway-sibling.ts`: antiparallel, 2–30 m apart, overlapping). Junctions it handles like we do (a chooser).
- Open: raw tag editing (v2), a "load more" per side, keyboard navigation between ways, better column widths for long values.

**Existing code to reuse**

- `~/Development/OSM/osm-way-as-table-ui` (monorepo; issue link in `NOTE.md`):
  - `packages/core/src/traversal/`: `buildChain`, `neighborMatch` (incl. `JunctionChoice`), `direction`, with tests.
    - Framework-free, reusable in iD through an adapter.
  - `packages/core/src/ui/`: `TableView`, `TagRow`, `Cell`.
    - This is **React**. iD uses d3, so use it as the design reference and port it to d3.
  - `packages/id-plugin`: only a stub (`mount()`, `createIdAdapter(context)`). The adapter needs `getWay` / `getWaysForNode`, which map to `context.graph()` / `graph.parentWays(node)`.
- `~/Development/OSM/parking-lanes`: the app where this table is used today. Use it as the UX reference.

### 7. Side indicator for directional combo fields — ✅

- Source: branch `side-indicator` (4 commits, 2026-05, on origin), merged 2026-09-27.
- Hovering or focusing the left/right row of a directional combo field (e.g. `cycleway:left`/`:right`, `sidewalk:*`) draws blue arrows on that side of the selected way. The label gets a matching arrow. Hidden when the visible part of the way is too curved (`modules/geo/way_viewport_straightness.ts`).
- Merge work: state ported to the TS `context.ts` (`directionalComboIndicator()` / `setDirectionalComboIndicator()`), `directional_combo_arrow` converted to TS, tests updated to current test APIs (`new iD.osmNode`, no `d3` global, vitest matchers).
- The same hover/focus → map indicator pattern is the base for the width indicator (feature 10).

### 8. TILDA bike infrastructure helper — 🟨 (v1 built)

**Done (2026-09-27):** inspector section "TILDA Bike Infrastructure" below the preset fields, for single ways with `highway=*`. Uses `@tilda-geo/bicycle-infrastructure` ^0.1.2 from npm.
- One card per TILDA result (this way / left side / right side): category label (with the German term) and id, colored by state (exact / incomplete / needs clarification / none). Hovering a left/right card shows the side on the map (side indicator, feature 7).
- Gap questions from `analyzeCategoryGaps` as buttons (e.g. `cycleway:right:lane` advisory / exclusive).
- Target category select. The tag plan lists removals, additions and changes with reasons; "Apply these tags" only appears when the plan reaches the target (checked with `processBikelanes`). All edits go through the entity editor, so each apply is one undo step.
- Checklist "Needed for the Radnetz dataset" per side (width, surface, traffic sign, oneway for separate ways; separation / traffic mode / buffer / marking for protected lanes; buffer / marking for on-road lanes and bicycle roads) with quick-value buttons and a value input.
- Code: `modules/tilda/category_plan.ts` (planner, ported from street-space-editor + fixes), `modules/tilda/required_attributes.ts`, `modules/ui/sections/tilda_bike_infra.ts`, `css/89_tilda_bike_infra.css`, labels under `inspector.tilda` in `data/core.yaml`; tests in `test/spec/tilda/`.
- Library issues found (worked around in `category_plan.ts`, to fix in tilda-schemas): for left/right plans `planTagsForCategory` writes the presence key as `cycleway:<side>:cycleway` instead of `cycleway:<side>`, and without an existing `cycleway:<side>` it plans bare keys (`lane=…`). It also does not split `cycleway:both`. Our wrapper splits `:both`, adds `cycleway:<side>=lane|track|…` for the target, fixes the keys and checks the result with `processBikelanes`.
- **v2 (2026-09-29): checklist per category from the data index (feature 16).** `modules/tilda/required_attributes.ts` is a rule table: per rule the own-way key (made side-specific with `writeKeyForSide`), the infraVelo attributes it feeds, TILDA's accepted values and how TILDA reads it. Each row shows label, key, tagged value (also found via `:both` / plain key, like TILDA), a state and a note: ✓ ok, ✓ grey = inherited (surface from the road, `traffic_mode` from `parking:*`, sidepath from the category), `?` guess (TILDA's `assumed_no`/`implicit_yes` oneway), ✗ ignored (TILDA drops the value), `!` missing; optional rows ("only if it applies") are grey. "TILDA reads it as …" shows sanitizing (`cobblestone` → `large_sett`, `orange` → `red`, `oneway:bicycle=no` → `car_not_bike`). Values TILDA accepts are buttons (first 6) and suggestions in the input. With a target category chosen, the checklist is for the target. Roads that are not bike infrastructure themselves get a "This road" card (mixed traffic: oneway, `oneway:bicycle`, `dual_carriageway`, width, surface, `cycleway:*` presence). Tests: `test/spec/tilda/required_attributes.ts`.
- 2026-09-30: every highway way gets a "This way" card with the target select, also when TILDA has no result for it (e.g. a sidewalk without bike access; the chip says "TILDA does not process this way …"). Choosing a target shows the tag plan and the checklist of that category. Road sides without any `cycleway:*`/`sidewalk:*` tags still get no card (would add two cards to every road).
- 2026-09-30 (UI rework): the section comes right after Feature Type, above the fields. The intro text is behind an info button in the section header (shown only when open). "This road" (mixed traffic checklist) is merged into the "This way" card; that card collapses when the bike infrastructure is on the sides and the way itself is none. Each card header shows the category chip and an edit button; the "Change to" select only appears after clicking edit (clicking it again cancels). The select is grouped with `<optgroup>` (cycle tracks, on the carriageway, with pedestrians, with buses, bicycle roads, special cases: links and crossings). In a German UI the category names are TILDA's own: `data/tilda_labels.de.json`, generated by `npm run update:tilda-labels` (`scripts/update_tilda_labels.js`) from tilda-geo's processed topic docs `app/src/data/generated/topicDocs/inspectorTranslations.gen.ts` (all `atlas_bikelanes--*` keys). Rerun it after the topic docs change; the JSON is committed because Netlify has no tilda-geo checkout. Optional checklist rows say "only if it applies" next to the name.
- 2026-09-30 (compact header, with feature 23): each card header is one line: side, category chip and target cut with an ellipsis (full name and TILDA id in the tooltip), and the edit button as a framed button like the field buttons. A card body with nothing to show is hidden. The intro behind the info button is plain text like the info text of fields. A way that is not bike infrastructure shows the category "Mixed traffic" instead of "TILDA does not process this way …", and its checklist has no own heading. Fixed: "This way" could not be collapsed again (the header click read a stale datum).
- 2026-09-30 (diff + lane): the tags under "Change to" are shown as iD's tag diff (`utilTagDiff`, the "suggested" table of the outdated tags issue): `- key=old` red, `+ key=new` green, the reason only as tooltip (`drawTagPlan(…, { diff: true })`; the traffic sign field keeps the list with reasons). Fixed: with a chosen target the checklist took the target category as the source of its own tag ("TILDA uses advisory from elsewhere" for `cycleway:left:lane`). TILDA has `_advisory` / `_exclusive` only from the `lane` tag, so `lane` has no category fallback any more, and `is_sidepath` uses the category only when it is the current one (TILDA can derive it from `footway=sidewalk` etc.).
- 2026-09-30 (checklist as tags): each checklist row is the tag itself, `key=value` as tagged (the key where it was found, e.g. `cycleway:both:width=2`; several lines for `cycleway:left=…` / `cycleway:right=…`), with the state icon; the attribute name and the infraVelo attributes are the tooltip. A missing tag reads "`key` is missing; add below" (required, orange) or "…; add below if relevant" (only if it applies, or TILDA only guesses; yellow). The link shows the field in the Fields section (also a "more field"), scrolls to it and flashes it (`presetFields.revealField(keys)`, wired in `entity_editor.js` via the section's `reveal` event). The field titles always carry the same color (`presetFields.fieldStatus(tildaSection.fieldStatus)` → `.field-status-required|optional`), also when the TILDA section is closed. Value buttons and the free input stay only for tags without a field below (`presetFieldsOf` + side width keys + tagged traffic sign keys). Open for review: road side cards (`cycleway:<side>:traffic_sign`, `:surface`, `:surface:colour`, `:source:width`, `:oneway`, `:sett:length`, and the separation / marking / buffer / traffic_mode keys of protected lanes and next to parking) have no fields, so they keep the buttons; `cycleway:<side>:lane` with a chosen target shows the link although the lane type field only appears once the side has `lane` (the link then does nothing); the gap questions and the "Change to" plan keep their buttons.
- 2026-09-30 (assumed oneway): a missing `oneway` is a notice, not a request, where the default is reliable: new state `assumed` (blue "i", "`oneway` is not tagged; check below" + "TILDA assumes oneway=no. Check it; no need to tag it."; no color, also not on the field title, no value buttons). Applies to roads (mixed traffic; infraVelo reads a missing `oneway` as two-way) and to every category whose `implicitOneWayConfidence` in the library's `CATEGORY_DEFINITIONS` is `high` or `medium` (on-road lanes, bus lanes, lanes between car lanes, protected lanes, bicycle roads, …; the value is the category's `implicitOneWay`). Categories with `low` confidence (separate cycleways, shared foot and cycle paths, footways with bicycles, crossings) still ask ("TILDA assumes …; please tag it"). Cycleway links have no checklist at all (excluded in `requiredAttributes`), so nothing asks for their `oneway`. Upstream only if TILDA's own QA or the infraVelo export should share the rule: then `processBikelanes` could return the oneway confidence per result.
- 2026-09-30 (more defaults, parking): `surface:colour` (not coloured) and `dual_carriageway` (no) are `assumed` notices too. `traffic_mode:*` where it is optional (lanes on the road: the outer side; bicycle roads: both sides) is read from the road's `parking:<side>` / `parking:both` like TILDA does (`derive-traffic-mode.ts`; only for the categories where TILDA infers it: on-road lanes, lanes between car lanes, protected lanes, bicycle roads): a ✓ row "TILDA reads parking from `parking:right=lane`" (`no` for `parking:*=no`), no notice. Only without any parking tag it is an `assumed` notice (nothing next to it). New rule option `derivedFrom` → attribute `source`. `traffic_mode:*` of protected lanes stays required. `source:width` stays optional ("add below if relevant"), `oneway:bicycle` on one-way roads stays a request.
- 2026-09-30 (Radinfra FAQ audit): checked the checklist against the mappers' FAQ ("Fragen & Antworten Radinfra Mappen", copy-paste templates). Changes: (1) the width source is `source:cycleway:<side>:width` (FAQ decision), not `cycleway:<side>:source:width` (rule option `sourceFor`); (2) `surface:colour` stays a notice (missing = not coloured, we don't force `no`); (3) large sett is `sett:length=0.15` (was 0.16; field and checklist); (4) lanes: a missing `buffer:right` next to parking is `no` (FAQ: leave it out without a buffer) → notice; (5) lanes: no `marking:right` (lines are set by law, infraVelo reads only the buffer); (6) protected lanes: `traffic_mode:*` read from `parking:*` on the outer side, else a notice (only parking/foot matter); (7) bicycle roads: `marking:left/right` always, `buffer:*` only with a line marking; (8) shared bus lanes: `width` optional; (9) one-way roads: `oneway:bicycle` always a request (also on dual carriageways); (10) road `width` stays required (changed 2026-10-19: no `width` / `source:width` for roads, infraVelo leaves `breite` empty for mixed traffic); (12) `source:width` is a request only when the width was tagged in this session (compared to the downloaded data), not for existing widths; the measuring tape writes `source:<key>=Luftbild <year of the background imagery>` with the width (`measuredSource`); the `source/width` field offers the FAQ values; (15) the damage signs `Radwegschäden`, `Gehwegschäden`, `Geh- und Radwegschäden` are traffic sign quick values. Not in the TILDA checklist (mapped anyway): `mapillary`, `source:traffic_sign:mapillary`. `DE:600` belongs in osm-traffic-sign-tool (osmberlin/osm-traffic-sign-tool#179), separate.
- Next: QA validations (feature 9), German texts, "why not category X" explanations.

**Original plan:**

**Goal:** mappers pick the TILDA bike infrastructure category a way should have. The sidebar then shows which tags are missing or conflicting for that category, and which are required for the Radnetz dataset (width, surface, …).

**Sources**

- `@tilda-geo/bicycle-infrastructure` (npm 0.1.2, source `~/Development/FMC/tilda-geo-schema-spec-and-library-workspace/tilda-schemas/packages/bicycle-infrastructure`). Port of TILDA's LUA bikelane processing, 100% category match against the Berlin export.
  - `processBikelanes(tags)`: 1..N results (`self`, `left`, `right` side) with `category`, `surface`, `oneway`, `separation_*`, `buffer_*`, `marking_*`, `traffic_mode_*`, `width`, …
  - `analyzeCategoryGaps(tags, results)`: for incomplete categories (`*_adjoiningOrIsolated`, `*_advisoryOrExclusive`, `needsClarification`) the missing keys, allowed values and which category each unlocks.
  - `listTargetCategories()` and `planTagsForCategory(tags, target, side)`: `add` / `change` / `conflicts` to reach a target category.
  - Category vocabulary: `schemas/bicycle-infrastructure-category/schema/category.schema.json` (29 values incl. `needsClarification`, `data_no`, `separate_geometry`, `not_expected`).
  - Local WIP: uncommitted changes to `plan-tags-for-category.ts` in that repo. Check before relying on newer behavior.
- Street-space-editor (`~/Development/OSM/street-space-editor` → `parking-lanes`), bicycle mode, already uses this in a UI:
  - `app/src/modes/bicycle/domain/bicycle-edit-helpers.ts`: `findGapResult`, `defaultTargetCategory`, `planForSide`, `applyCategoryPlan`.
  - `app/src/modes/bicycle/domain/bicycle-category-plan.ts`: `MACRO_CATEGORY_SUGGESTIONS` (bicycle road, bus lanes, crossing), which the library planner skips.
  - `app/src/modes/bicycle/domain/bicycle-tag-keys.ts`: the key lists that matter per side.
- Design for a guided "tagging helper": `osm-cycleway-tagging-helper/plans/cycleway-tagging-helper/{plan,canvas}.mdx` in the same workspace. Questions are derived from missing predicates, plus "why not category X" explanations. Reuse its question design.
- TILDA LUA: `~/Development/FMC/tilda-geo/processing/topics/roads_bikelanes/` (bikelanes, roads, paths, todos; see the QA list below).

**Decision: a custom inspector section, not presets.**
Presets match on a fixed tag set and cannot express "category X on the left side of this road". The category comes from many tags, per side, in a fixed rule order. So:

- A new inspector section "TILDA Radinfrastruktur" (TS module, added next to the preset fields like the traffic sign fields) for ways with `highway=*`:
  1. **Current result** per side (`self`/`left`/`right`): category label, short explanation, color chip.
  2. **Target category** select per side (default from `defaultTargetCategory`), grouped: separate paths / on-road lanes / shared / other.
  3. **Tag plan** for the target: rows "add `key=value`", "change `key` a → b", "conflict". Each row has a one-click "apply" button that goes through `actionChangeTags`, plus "apply all". The reason text comes from the library.
  4. **Gaps**: for incomplete categories, the questions from `analyzeCategoryGaps` as buttons (e.g. `is_sidepath` yes/no, `cycleway:right:lane` advisory/exclusive).
  5. **Required attributes checklist** for the Radnetz dataset (from infravelo `inspector/QA.md`, see below): oneway, width (+ source), surface (+ `sett:length` for sett), `surface:colour`, traffic_sign (or `none`); for protected lanes separation / traffic_mode / buffer / marking left+right. Green check / missing, with the field to fill.
- Also a **preset category** "TILDA Radinfrastruktur" with a few presets for the separate-geometry cases (`highway=cycleway` + `is_sidepath`, segregated foot+bike path, shared path, bicycle road) whose fields are the checklist keys. That gives mappers a quick start. Build it as a local preset override (like the traffic sign fields in `modules/presets/traffic_sign_fields.ts`), not in id-tagging-schema.
- Map support: a lens (feature 5) colored by TILDA category, computed live with `processBikelanes` → CSS classes (`tilda-category-*`) via the tag-class hook from the lens work.

**Easy / hard**

- Easy: adding the npm package, the "current category" readout, the checklist, apply buttons (plain tag changes).
- Medium: side handling (`left`/`right` keys vs `self`), macro categories, keeping the section in sync with the raw tag editor.
- Hard: good explanations ("why not X") and question flow; live category coloring on the map for all ways (performance: cache per entity version).

### 9. QA rules — ⬜ (plan)

Rules from TILDA todos (`tilda-geo/processing/topics/roads_bikelanes/bikelanes/bikelane_todo_categories.lua`, `roads/road_todo_categories.lua`), the infravelo QA inspector (`~/Development/FMC/infravelo-radnetz/inspector/src/components/shared/*Style.ts`, `inspector/QA.md`, live: https://infravelo-qa.netlify.app/) and the infravelo validation scripts (`validation/*.py`).

How we implement them: **(V)** iD validation (issues pane, with fixes), **(H)** hint in the TILDA helper section (feature 8), **(L)** lens / map coloring, **(—)** not in the editor.

| Rule | Source | How here |
|---|---|---|
| `needsClarification`: tagging not enough to categorize | TILDA todo `needs_clarification`, infravelo category layer "Führung gar nicht erkannt" | V + H (gap questions) + L |
| `*_adjoiningOrIsolated`: missing `is_sidepath=yes/no` | TILDA `adjoining_or_isolated`, infravelo "Führung ungenau" | V + H |
| `*_advisoryOrExclusive`: missing `cycleway:*:lane=advisory/exclusive` | TILDA `advisory_or_exclusive` | V + H |
| `cycleway=track` too vague | TILDA `needs_clarification_track` | V + H |
| Mixed `cycleway`/`cycleway:both` with `cycleway:SIDE` | TILDA `mixed_cycleway_both` | V (fix: merge into sides) |
| Deprecated `cycleway=shared` | TILDA road todo `deprecated_cycleway_shared` | V (upstream iD may already cover it; check) |
| Missing `segregated=yes/no` on foot+bike ways | TILDA `missing_segregated` | V + H |
| Missing `bicycle=designated` + `foot=designated` for DE:240 | TILDA `missing_access_tag_240` | V (fix adds tags) |
| Missing `bicycle=designated` on bicycle roads | TILDA `missing_access_tag_bicycle_road` | V |
| Footway with bicycle access that should be `highway=path` | TILDA `unexpected_bicycle_access_on_footway` | V (warning, needs survey) |
| `highway=path` that should be `highway=cycleway` (DE:237) | TILDA `unexpected_highway_path` | V |
| Missing traffic sign (`DE:*` or `none`) | TILDA `missing_traffic_sign`, infravelo traffic sign layer | H + L; the traffic sign field (feature 2) helps fill it |
| Malformed traffic sign value | TILDA `malformed_traffic_sign` | V using the traffic sign converter package |
| Bicycle road without `DE:244.1` / vehicle destination sign | TILDA `missing_traffic_sign_244`, `..._vehicle_destination` | V + H |
| Missing `oneway` on bike infrastructure | TILDA `missing_oneway`, infravelo oneway layer | H + L |
| One-way road without `oneway:bicycle` | infravelo `QA.md`, oneway layer | H |
| Missing `width` / missing width source | TILDA `missing_width`, infravelo width layer ("Quellenangabe der Breite fehlt") | H + width tool (feature 10) |
| `surface=sett` without `sett:length` (mosaic / small / large) | infravelo sett layer, `QA.md` | H |
| Missing `surface` | TILDA `missing_surface` | H |
| Missing `surface:colour` where colored paint is expected | infravelo surface colour layer | H + L |
| Protected lanes: `separation`, `traffic_mode`, `buffer`, `marking` left+right | infravelo buffer/marking layer, `QA.md` | H + L |
| Bicycle roads: `marking_left/right`, `buffer_left/right` | infravelo buffer/marking layer | H |
| Road likely missing `cycleway:SIDE=no` | infravelo "cycleway no" layer | H + L |
| One-way pair without `dual_carriageway=yes` | infravelo dual carriageway layer, `validation/analyse_dual_carriageway.py` | V (needs a neighbor lookup: same name, opposite direction) |
| Crossing longer than 100 m | TILDA `crossing_too_long` | V |
| Not edited for ~10 years | TILDA `currentness_too_old`, infravelo age layer | L (color by last edit date) |
| Edited by the project account vs. others since project start | infravelo update source layer | L (needs changeset user; maybe later) |
| Mapillary coverage for way / sign | TILDA `*__mapillary` todos, infravelo Mapillary layer | L (via Mapillary layers already in iD; later) |
| Damage notes via `traffic_sign=*schäden*` + `source:traffic_sign:mapillary` | infravelo `QA.md` "ERGÄNZEN" | H (hint in traffic sign field) |
| `cycleway:note` for explanations | infravelo `QA.md` | H |
| Duplicate include/exclude ids, snapping/aggregation checks, Knotenpunkte ids | infravelo `validation/*.py` | — (processing-side, not editing) |

Notes:
- iD validations live in `modules/validations/*`. New ones go into their own TS files and are registered in `modules/validations/index`.
- Most rules only need the tags of one way plus `processBikelanes`, so they are cheap. Dual carriageway and crossing length need geometry and neighbors.

### 10. Width: map indicator and editing — 🟨 (indicator done, editing open)

**Done (2026-09-27):**
- Hovering or focusing a width input (preset field or raw tag editor row) draws the width as a band on the map with a label. `width`/`est_width`: band around the way. `cycleway:*:width`/`sidewalk:*:width`: band on that side, starting at the road edge (half of `width`, else a default by highway type). The band updates while typing.
- New fields "Bike Lane Width, Left/Right/Both" and "Sidewalk Width, …" appear when that side has a lane/track/sidewalk, or the key is already tagged (id-tagging-schema has no fields for these keys).
- Code: `modules/width/width_tags.ts` (parsing, fallbacks), `modules/width/width_indicator.ts` (state + event delegation, no change to the field code), `modules/svg/width_indicator.ts`, `modules/ui/sections/side_width_fields.ts`, `css/87_width_indicator.css`.
- Open: the right-click "Edit width" tool; the band for a `cycleway` side ignores a sidewalk or parking between road and lane.


**Wanted**

1. When the width field (`width`, `cycleway:*:width`, `est_width`, …) is hovered or focused, the map shows the width as a band around the selected way, like street-space-editor's width mode.
2. A right-click action "Edit width" on ways: drag handles on both sides of the way change the width on the map, and the width field updates.

**Reference:** street-space-editor width mode, `~/Development/OSM/parking-lanes/app/src/modes/width/`:
- `domain/handle-geometry.ts`: handle count by way length (1 / 2 / 3), handle positions, rectangles and hit areas (turf).
- `domain/road-width-from-tags.ts`, `domain/highway-width-fallbacks.ts`: parse `width`/`est_width`, fallback widths by highway type and oneway.
- `map/width-layer-paint.ts`, `map/WidthHandlesLayer.tsx`: band and handle styling (MapLibre; we draw SVG).
- `measure-guide/*`: what to measure per infrastructure type; useful as help text.

**Plan and difficulty**

- Easy: port the width parsing and fallbacks as TS (`modules/width/*`).
- Easy–medium: the indicator. Same pattern as the side indicator (feature 7): the field sets a state on focus/hover, an SVG layer draws a band. Band = the way's line with `stroke-width` = width in meters × pixels per meter at the current zoom (`projection.scale()` and latitude). Needs a hook in the width field (upstream `input`/`roadwidth` field is JS; add a small TS helper and call it from there).
- Medium: `cycleway:left:width` etc. need the band offset to that side (combine with the side indicator's side logic).
- Medium–hard: "Edit width" operation. A new operation in the edit menu (TS, like the operations in `modules/operations/*`) that enters a new mode with SVG drag handles. Dragging changes a preview width; on release, `context.perform(actionChangeTags(…))` with the rounded width (0.1 m) and `source:width` if we want it. The field updates by itself through the normal redraw. Hard parts: pointer handling inside iD's modes (similar to `modeMove`/`modeRotate`), handles on curved ways, undo annotation, touch.
- Open: which keys the tool edits (`width` of the way vs `cycleway:*:width` for lanes on the road), and whether to write `width:source` / `source:width` (infravelo wants a width source).

### 11. Live touched: see what others edit right now — 🟨 (integrated, T10 test open)

- Source: `~/Development/OSM/osm-live-touched` (package `@osm-editor-kit/live-touched`, from npm `^0.1.0`). Start from its `packages/live-touched/README.md` ("iD integration guide") and `docs/concept.md`. Its `WORKPLAN.md` tracks the steps (T10 = the iD test).
- Integrated 2026-09-27:
  - `modules/services/osm.js`: `getAccessToken()` (the backend uses the token only to read user id and name).
  - `modules/live_touched/live_touched.ts`: session wiring. Reports locally modified objects on history `change` (also fires on undo, redo, reset, restore), marks them saved on uploader `resultSuccess` (the changeset has its id there), reports the view on map `move`, sets `.live-touched-*` classes on map `drawn`. Turns back on after reload if enabled and consent is current.
  - `modules/ui/sections/live_touched.ts`: "Live edits nearby" in the Map Data pane: switch with consent dialog on first use, login hint, zoom-in / empty messages, list (select + zoom on click, user link, status, age, hint), privacy link, "Delete my data on the server". Pulsing dot on the Map Data button while others edit in view.
  - `css/88_live_touched.css`: orange `touched`, faded dashed `stale`, violet `saved`, red casing for `parallel`/`outdated`.
  - Strings under `live_touched` in `data/core.yaml` (English only; German texts are in `docs/concept.md`).
- Checked so far: unit/integration test with an in-memory backend and two users (`test/spec/live_touched/live_touched.ts`): alice's iD edit is shared, bob sees it, a parallel edit gets the `parallel` hint and the "others nearby" flag, undo deletes the entry, "delete my data" works. In the browser (logged out): section renders, login hint shows, switch is disabled.
- **T10 (Tobias):** open iD at `http://127.0.0.1:8080` (not `localhost`; only `127.0.0.1:*` is allowed by the backend) in two browser profiles with two OSM accounts, same area at zoom ≥ 15. Turn on "Show and share live edits" in both (consent dialog). Edit in one; the other should list it within ~10 s and show the orange halo. Also check: parallel hint when both edit the same way, "saved" (violet) after an upload, the map halos on lines, areas and points, and "Delete my data on the server".
- Open question for osm-live-touched (from Cursor Bugbot on PR #10): the full OSM token goes to the backend, which only needs the user id and name. The consent text now says so; a narrower mechanism would be better.
- Not verified yet: the halo CSS on real map elements (needs real entries), the upload → `saved` path in a real upload.

### 12. Read-only feature categories — ✅ (v1)

**Done (2026-09-27):**
- Lock button per row in Map Data ▸ Map Features. Locked categories stay visible (grayscale, 50 % opacity) and get no pointer events, so no hover, click or snapping while drawing; the lasso skips them too. State in the URL (`readonly_features=buildings,water`) and the pref `readonly-features`.
- Vertices are read-only only if all their parent ways are, so a road node shared with a building stays editable.
- Code: `modules/renderer/readonly_features.ts` (store, matching via `features().getMatches`, classes on every map redraw), `modules/ui/layer_mode_toggle.ts` (shared toggle, see Icon conventions), hooks in `map_features.js`, `behavior/lasso.js`, `ui/init.js`; `css/92_readonly_features.css`; test `test/spec/renderer/readonly_features.ts`.
- Not covered in v1: selecting a read-only object via search, the feature list or `id=` in the URL still works.

**Original plan:**

**Goal:** mark whole feature categories (e.g. buildings and water) as **read-only**. They stay on the map for orientation, in a muted style, but cannot be edited. This works like the Map Features filters, which *hide* categories: same category list, same kind of URL state and list UI, but "read-only" instead of "hidden". For our project this keeps the map calm and prevents accidental edits to things we do not map (buildings, water, landuse …) while we focus on streets and bike infrastructure.

**How iD's filters work today** (`modules/renderer/features.js`)
- Rules per category via `defineRule(key, filter)`: `points`, `traffic_roads`, `service_roads`, `paths`, `buildings`, `building_parts`, `indoor`, `landuse`, `boundaries`, `water`, `rail`, `pistes`, `aerialways`, `power`, `past_future`, `others`.
- State: URL hash `disable_features=buildings,water` and pref `disabled-features`; `features.enable/disable/enabled/disabled`.
- List: Map Display pane ▸ "Map Features" (moved from Map Data, feature 30) (`modules/ui/sections/map_features.js`), one checkbox per category.
- Hidden entities are skipped by the renderer and by selection/lasso via `features.isHidden*`.

**Wanted behavior**
- A second state per category: `readonly`. URL hash `readonly_features=buildings,water`, pref `readonly-features`, same keys as the filters. If a category is hidden, hidden wins.
- List: in the "Map Features" section, a "read-only" toggle per category next to the visibility checkbox (or a separate section with the same list; decide when building).
- Rendering: muted, e.g. lower luminance / grayscale (all colors pulled toward gray), maybe lower opacity. Done with a class (`readonly-feature`) on the SVG elements plus CSS. To check: CSS `filter: grayscale() brightness()` on SVG shapes vs. overriding `stroke`/`fill` colors; performance with many elements.
- Not editable:
  - not selectable by click or lasso, no hover highlight,
  - drawing does not snap to or connect with them (new ways must not join buildings or water),
  - no move/rotate/delete via other selections (e.g. a shared node with an editable way: decide what happens),
  - no interaction at all in v1: clicking does nothing (decided 2026-09-27).
- Follow-up phase: a quick override for one object, e.g. Shift+click opens it in the inspector in normal edit mode.

**Plan and difficulty**
- Easy: rules and category list reuse the existing `defineRule` definitions; URL/pref state like `disable_features`; list UI; CSS for the muted style.
- Medium: adding the class to all drawn elements (areas, lines, points, vertices, labels) and keeping it cached per entity like the hidden cache.
- Hard: making them non-interactive everywhere: hover, select, lasso, snapping in draw modes (`behaviorDraw`, `behaviorHover`, `modes/drag_node`), shared nodes, validations that suggest fixes on read-only objects. Likely one central check `features.isReadOnly(entity, graph, geometry)`, called where `isHidden` is called today.
- Code: new TS module (e.g. `modules/renderer/readonly_features.ts`) that reuses the rules from `features.js`, plus small hooks in the upstream files.

### 13. Hide toolbar button labels — ✅

- Source: `iD--v3-reloaded` worktree (commits `1f76e0820`, `439e18668`, `7d74005f8`), ported to the current toolbar.
- Preferences ▸ Interface ▸ "Show button labels". Unchecked, the captions under the top toolbar buttons ("Add Feature", "Undo / Redo", …) are hidden and the toolbar is 60 px instead of 71 px high. Stored in the pref `preferences.interface.labels` (same key as in v3). **Off by default** in this fork (since 2026-10-03); a stored choice is kept.
- Code: `modules/ui/sections/interface.ts`, `css/91_interface_prefs.css`, applied at startup in `ui/init.js`.

### 14. Show Mapillary image from the field — ➡️ (now part of feature 19)

### 15. Preset customization and missing fields — ✅ (v1; side variants open)

**Done (2026-09-29):**
- `customize()` also takes `setFields` (replace a preset's `fields`/`moreFields`, for order), `removeFields` and new `presets`. The Radnetz config moved to `modules/presets/radnetz_customization.ts`. `presets/field.ts` falls back to the field's own `strings` for option and side labels (`options.bollard`, `types.separation:left`), so custom fields show readable values without translations.
- New fields: `is_sidepath` (check), `surface/colour`, `sett/length` (only for `surface=sett`; mosaic / small / large), `width/effective`, `source/width` (only with `width`), and directional (left/right/both) `separation`, `marking`, `buffer`, `traffic_mode`, `cycleway/lane` (advisory/exclusive per side). Option lists are TILDA's accepted values.
- New presets (TILDA categories without a schema preset):
  - `highway/cycleway/link` "Cycleway Link (Routing Connection)" — TILDA `cyclewayLink` (Berlin 2026-09: 495 ways).
  - `highway/residential/bicycle_road` (`addTags` `bicycle=designated`, `traffic_sign=DE:244.1`) and `…/vehicle_destination` (`vehicle=destination`, `traffic_sign=DE:244.1,1020-30`) — TILDA `bicycleRoad` / `bicycleRoad_vehicleDestination`. iD's "incomplete tags" validation then asks for a missing sign or `bicycle=designated` (TILDA todos `missing_traffic_sign_244`, `missing_access_tag_bicycle_road`).
  - `highway/cycleway/bicycle_road`.
  - Berlin bicycle roads by highway (Overpass 2026-09-29): residential 851, service 25, construction 25, cycleway 22, unclassified 20, track 9, pedestrian 7. Signs: `DE:244.1,1020-30` 666, none 135, `DE:244.1` 56. Access: `vehicle=destination` 622 (+37 with `motor_vehicle`), `motor_vehicle=destination` 190 — the latter match the base preset; the TILDA card still shows the right category.
- Field lists (the fields that feed the dataset first; removed `incline`, tolls, weights/heights, destination signs, hazards, trolley wire, `covered`, MTB/hiking scales, `dog`, `stroller`, …):
  - roads (trunk … living_street, service): name, oneway, oneway (bicycles), dual carriageway, maxspeed, lanes, bike lanes, sidewalks, parking, surface, smoothness, width, traffic sign, structure, access; more: lane type, lane markings, parking orientation, surface colour, sett size, usable width, width source, directional signs.
  - bicycle roads: + traffic mode / marking / buffer left/right (the `trennstreifen` inputs).
  - cycleways and foot+cycle paths: name, sidepath, (segregated), oneway, surface, smoothness, width, traffic sign, separation, structure, access.
  - footway, sidewalk, path: name, access, traffic sign, sidepath, surface, smoothness, width, structure.
  - crossings (cycleway/footway/path): + width, oneway, access; more: surface colour, smoothness, traffic sign.
- **Side prerequisites (2026-09-30):** iD's field option `prerequisiteTag` can now name the side in its key, e.g. `cycleway/lane` has `{ key: 'cycleway:{side}', value: 'lane' }`.
  - The field is allowed (shown, or offered in "Add field") only when the prerequisite holds on at least one side, or when the field already has a value. This is the same rule as upstream's `prerequisiteTag`.
  - In the directional combo, a side where it does not hold is disabled, and its placeholder (and tooltip) names the field to change first, e.g. "“Keiner”: change “Fahrradinfrastruktur” first". A side value that is already there stays editable.
  - The side value is read from `cycleway:right`, then `cycleway:both`, then `cycleway`. `value`, `values`, `valueNot` and `valuesNot` work as upstream.
  - Code: `modules/ui/fields/side_prerequisite.ts` (pure helpers + `uiSidePrerequisites`, tests in `test/spec/ui/fields/side_prerequisite.ts`); small hooks in `modules/ui/field.js` (`isAllowed`, class `has-side-prerequisite`) and `modules/ui/fields/directional_combo.js` (row state, placeholder).
  - Grouping: `cycleway/lane` moved from `moreFields` to the road `fields`, right after `cycleway`. It only appears when a side has `lane`. In the compact sidebar (feature 23), a field with a side prerequisite has no line above it, so it reads as part of the field above.
  - **Cleanup (2026-09-30):** a change that makes a side's prerequisite stop holding also removes that field's value on that side (e.g. `cycleway:right=lane` → `no` removes `cycleway:right:lane`). A value in a common key (`cycleway:both:lane`) is first written to the other side. Only a change that breaks the prerequisite removes anything, so data that was already inconsistent stays. It is generic: it reads the declared prerequisites of the preset's fields (`removeUnmetSideValues` in `side_prerequisite.ts`, one call in `entity_editor.js` `changeTags`, so it also applies to raw tag edits). Side fields without a declared prerequisite (e.g. `cycleway:right:width`) are not touched.
  - **Planned upstream PR (later, separate from this branch):** "directional combo knows its parent tag". It needs `{side}` in `prerequisiteTag.key` documented in id-tagging-schema, the helpers in iD, and fields that use it (lane type, `parking:{side}:orientation` with `valuesNot: [no, separate]`, `sidewalk:{side}:surface`, …). Part of it: the cleanup below.
- Open: side variants (`cycleway:<side>:separation:left`, `cycleway:<side>:surface`, …) have no fields; the TILDA section's checklist (feature 8) covers them with key + options. Fields could follow as "sub-fields" of the `cycleway` directional field.
- Open: a preset category "TILDA Radinfrastruktur"; presets for `footwayBicycleYes` (sidewalk + `bicycle=yes` + `DE:239,1022-10`) and bicycle roads on `service`/`unclassified`.


- `presetManager.customize()` (`modules/presets/customization.ts`): adds fields and appends them to existing presets' `fields` / `moreFields` while the schema loads. Set in `index.html` before `context.init()`: `iD.presetManager.customize(iD.RADNETZ_PRESET_CUSTOMIZATION)`. A field's `label` is used untranslated (small fallback in `presets/field.ts`). Test: `test/spec/presets/customization.ts`.
- Done: `dual_carriageway` (type `check`, yes / no / unset) as a regular field on `highway/trunk`, `primary`, `secondary`, `tertiary`, `residential`, `unclassified`, `living_street`. id-tagging-schema has no field for it at all. Not on `service` and `road`.
- Note: the TILDA library (`@tilda-geo/bicycle-infrastructure`) does not read `dual_carriageway`; it matters for our own road processing and QA.

**TILDA tags without an iD field** (keys read by `@tilda-geo/bicycle-infrastructure` 0.1.x or `modules/tilda/required_attributes.ts`, checked against id-tagging-schema v6):

| Tags | Where | Proposal |
|---|---|---|
| `separation:left/right`, `marking:left/right`, `buffer:left/right` | separate cycleways (`highway=cycleway/path`) | combo fields with the TILDA value lists (`bollard`, `flex_post`, `kerb`, `solid_line`, `dashed_line`, `parking`, …); one "Separation" group, left/right with the side indicator |
| `cycleway:<side>:separation[:left/right]`, `:marking…`, `:buffer…` | road with a cycle lane | same fields as side variants, shown under the cycleway field when the side has a lane |
| `traffic_mode:left/right`, `cycleway:<side>:traffic_mode…` | both | combo (`motor_vehicle`, `parking`, `foot`, `bicycle`, …) |
| `cycleway:<side>:surface`, `:smoothness`, `:segregated`, `:oneway`, `:traffic_sign`, `:lane`, `:surface:colour` | road with a cycle lane | side variants of the existing fields; `:width` is already covered by feature 10 |
| `is_sidepath` | separate paths next to a road | check field (`yes` / `no`), on `highway/cycleway`, `footway`, `path` |
| `surface:colour` | lanes and cycleways | combo (`red`, `green`, …) |
| `footway`, `path` (sub-types like `sidewalk`, `crossing`) | footways and paths | iD shows them through preset choice only; a combo would help in TILDA review |
| `width:lanes`, `bicycle:lanes`, `cycleway:lanes` | roads | lane-based tags; rather the way table or raw tags, no field |
| `access:reason` | any | text field in `moreFields`, low priority |
| `traffic_sign:forward/backward` | — | already added by feature 2 |

### 16. Data index: infraVelo result ⇐ TILDA ⇐ OSM tags — 📚 (reference for validations)

**Reference:** the Radnetz dataset for infraVelo is built by `~/Development/FMC/infravelo-radnetz` (read at commit `56f605e`, 2026-01-29). Use that repo for this index, not the older analyses in `~/Development/FMC/scripts`. Its first step, `scripts/translate_attributes_tilda_to_rvn.py` (run by `process_tilda_data.sh`), turns three TILDA exports into the infraVelo attributes; later steps (matching, snapping onto the Detailnetz, Schutzstreifen conversion, overrides, aggregation per `elem_nr` + direction) only move and merge those values. Spec: `processing/REQUIREMENTS.md` (says it may be outdated; the Python code is the truth). So what we validate in iD is the OSM input of that one translation step.

| TILDA export | infraVelo file | Rows |
|---|---|---|
| `bikelanes` (one row per way and side, category from the bikelane rules) | `TILDA Bikelanes Translated` | bike infrastructure |
| `roads` (motor vehicle roads) | `TILDA Streets Translated` | `fuehr` = "Mischverkehr mit motorisiertem Verkehr" |
| `roadsPathClasses` (footway, path, track, …) | `TILDA Paths Translated` | `fuehr` = "Sonstige Wege (…)" |

Sources for the OSM side: `@tilda-geo/bicycle-infrastructure` (`categories/category-specs.ts`, `predicates.ts`, `refine-predicates.ts`, `sanitize/*`, `derive/*`) and TILDA's LUA for roads (`tilda-geo/processing/topics/roads_bikelanes/roads/road_classification.lua`, `helper/sanitize_tags.lua`).
Note on `~/Development/FMC/tilda-geo--osm-tag-mapping` (branch `osm-tag-mapping`, last commit 2026-07-13, 29 commits ahead of develop, report uncommitted): it builds `processing/filter/osmiumTagFilter/contract.yaml`, the list of keys/values the osmium pre-filter keeps. For `roads_bikelanes` that is only the `highway` values (plus `leisure=track` as exclusion); it does not list the tags each category reads. Not useful for this index yet.

**Two geometry versions.** TILDA splits every road into *self* (the way itself) plus one object per side from `cycleway:<side>:*` (prefix `cycleway`) and `sidewalk:<side>:*` (prefix `sidewalk`, only for `sidewalk:<side>:bicycle=yes` style tagging). Specificity: `cycleway:*` < `cycleway:both:*` < `cycleway:<side>:*`. Paths (`cycleway`, `footway`, `path`, `bridleway`, `steps`, …) are never split. So each attribute has two keys:
- **Own way** (separate geometry, or the road itself for bicycle roads / bus lanes / lanes in the middle): `width`, `surface`, `oneway`, `traffic_sign`, `separation:left`, …
- **Road side** (centerline tagging): `cycleway:<side>:width`, `cycleway:<side>:surface`, `cycleway:<side>:oneway`, `cycleway:<side>:traffic_sign[:forward]`, `cycleway:<side>:separation:left`, … (`writeKeyForSide()` in the library builds these). Surface/smoothness fall back to the road's own `surface` for on-road categories (`copySurfaceSmoothnessFromParent`).

#### A. Attribute index (bikelanes)

| infraVelo attribute | TILDA field | OSM tags (own way) | OSM tags (road side) | TILDA sanitizing / notes |
|---|---|---|---|---|
| `verkehrsri` (one / two directions) | `oneway` | `oneway`, `oneway:bicycle` | `cycleway:<side>:oneway` (+ road's `oneway`, `oneway:bicycle`) | derived: `oneway:bicycle=yes`→yes; `oneway:bicycle=no`→`car_not_bike`/no; `oneway=yes/no`; else `assumed_no` or `implicit_yes` (category default). infraVelo maps `assumed_no`/`implicit_yes` to a direction but they are guesses → **require explicit `oneway`** |
| `fuehr` (type) | `category` (+ `traffic_sign`) | see table B | see table B | 240 / 239+1022-10 / 242+1022-10 in `traffic_sign` pick the sub-type |
| `pflicht` (mandatory use) | `traffic_sign` (+ `_forward`, `_backward`) | `traffic_sign`, `traffic_sign:forward/backward` | `cycleway:<side>:traffic_sign[:forward/backward]` | yes if 237, 240 or 241 is in any of them. `traffic_sign=none` states "no sign". TILDA sanitizes the sign string (`DE:` prefix, German text variants) |
| `breite` (width, 0.1 m) | `width_effective` else `width` | `width:effective`, `width` (+ `source:width`) | `cycleway:<side>:width` (+ `source:cycleway:<side>:width`) | parsed as meters; `m`/`meter` stripped, first of `a;b`. Lanes in the middle: from the road's `width:lanes` |
| `ofm` (surface) | `surface` | `surface` (+ `sett:length` for `sett`) | `cycleway:<side>:surface`, else road `surface` | sanitized: `cobblestone`/`unhewn_cobblestone`→`large_sett`, `sett` + `sett:length` ≤0.08→mosaic, ≤0.13→small, else large; `earth/dirt/mud/clay`→`ground`; `paving_stones:20/30`→`paving_stones`; unknown values → dropped (logged). infraVelo groups into Asphalt / Beton / Gepflastert / Kopfstein / Ungebunden / Sonstige; missing → `NICHT-GEFUNDEN` |
| `farbe` (coloured) | `surface_color` | `surface:colour` | `cycleway:<side>:surface:colour` | allowed `red`, `green`, `red;green`, `no`; `grey/gray/none/silver`→`no`, `orange`→`red`. infraVelo: yes if red or green |
| `protek` (protection, only `cyclewayOnHighwayProtected`) | `separation_left/right`, `marking_left/right`, `traffic_mode_left/right`, `buffer_*` | `separation:left/right`, `marking:left/right`, `traffic_mode:left/right`, `buffer:left/right` | `cycleway:<side>:separation:left/right`, `…:marking:…`, `…:traffic_mode:…`, `…:buffer:…` | `<key>:<side>` → `<key>:both` → (left only) `<key>`. separation allowed: `no bollard flex_post vertical_panel studs bump planter kerb fence jersey_barrier guard_rail structure ditch greenery hedge tree_row cone yes …`; marking: `solid_line dashed_line double_solid_line barred_area pictogram surface`; traffic_mode: `no motor_vehicle parking psv bicycle foot` (`motorized`→`motor_vehicle`); buffer: meters, `no`→0 |
| `trennstreifen` (buffer to parking on the right; bicycle roads: both sides) | `traffic_mode_right` (+ left for bicycle roads), `buffer_right`, `marking_right` | `traffic_mode:right`, `buffer:right`, `marking:right` | `cycleway:<side>:traffic_mode:right`, `…:buffer:right`, `…:marking:right` | yes if parking on the right and `buffer:right` ≥ 0.6 (bicycle roads: parking and buffer > 0 or a `solid_line`/`dashed_line` marking, either side). **Fallback:** without `traffic_mode`, TILDA infers `parking` from the road's `parking:<side>` / `parking:both` (≠ `no`) — on-road lanes use their own side, bicycle roads both sides. No parking → "entfällt" |
| `nutz_beschr` (use restriction) | `traffic_sign` | `traffic_sign` containing `Radwegschäden`, `Gehwegschäden`, … (+ `source:traffic_sign:mapillary`) | side variant | not for mixed traffic |
| `Kommentar` | `lifecycle` | `highway=construction` + `construction=*`, `temporary=yes` | — | construction / temporary text plus the list of missing attributes |

#### B. Category index (`fuehr` ⇐ TILDA `category` ⇐ OSM)

Berlin km from the TILDA export in that repo (`infravelo-radnetz/data/TILDA Radwege Berlin.fgb`, Sept 2025, clipped to Berlin). "Own way" includes bicycle roads and lanes in the middle, which are the road itself.

| infraVelo `fuehr` | TILDA category | km own way / road side | OSM tags, own way | OSM tags, road side |
|---|---|---|---|---|
| Radfahrstreifen | `cyclewayOnHighway_exclusive`, `cyclewayOnHighwayBetweenLanes` | 0.5 / 181; 3 / 0 | (rare) `highway=cycleway` + `cycleway=lane` + `lane=exclusive`; between lanes: `cycleway:lanes` has `\|lane\|` or `bicycle:lanes` has `\|designated\|` on the road | `cycleway:<side>=lane` + `cycleway:<side>:lane=exclusive` |
| Schutzstreifen | `cyclewayOnHighway_advisory` | 0.4 / 272 | as above with `lane=advisory` | `cycleway:<side>=lane` + `cycleway:<side>:lane=advisory` |
| *(TODO, gap)* | `cyclewayOnHighway_advisoryOrExclusive` | 2 / 20 | `lane` missing | `cycleway:<side>:lane` missing |
| Geschützter Radfahrstreifen | `cyclewayOnHighwayProtected` | 6 / 28 | a sidepath (`is_sidepath=yes` or similar) with `separation:left` ∈ {bollard, flex_post, vertical_panel, studs, bump, planter, fence, jersey_barrier, guard_rail} (and no `traffic_mode:right=motor_vehicle`, no `segregated`), or `traffic_mode:left=parking`, or `traffic_mode:right=motor_vehicle` + such a `separation:right` | `cycleway:<side>=track\|lane` + `cycleway:<side>:separation:left=…` (+ `traffic_mode`) |
| Radfahrstreifen mit Linienverkehr frei (237 + 1026-32) | `sharedBusLaneBikeWithBus` | 0 / 2 | `highway=cycleway` + `lane=share_busway`, or sign `DE:237` with `1024-14`/`1026-32` (the checklist offers `DE:237,1026-32` "Linienverkehr frei", 2026-10-19) | `cycleway:<side>=lane` + `cycleway:<side>:lane=share_busway`, or that sign on the road |
| Bussonderfahrstreifen mit Radverkehr frei (245 + 1022-10) | `sharedBusLaneBusWithBike` | 0 / 59 | `cycleway=share_busway`, or sign `DE:245` with `1022-10`/`1022-14` | `cycleway:<side>=share_busway` |
| Fahrradstraße /-zone (244) | `bicycleRoad`, `bicycleRoad_vehicleDestination` | 4 + 42 / 0 | `bicycle_road=yes` or sign `DE:244*`; vehicle destination: sign with `1020-30` (or "Kfz frei" text) or `vehicle`/`motor_vehicle` = `destination`/`yes` | — (always the road itself) |
| Radweg | `cycleway_adjoining`, `cycleway_isolated`, `cycleway_adjoiningOrIsolated`, `footAndCyclewaySegregated_*`, `footAndCyclewayShared_*` (without 240) | see below | `highway=cycleway` (+ `is_sidepath`), or `cycleway=track` on a cycleway, or sign `DE:237` on a path-like way; segregated: `segregated=yes` + `bicycle`/`foot` designated or sign `DE:241`; shared: `segregated=no` + designated, or sign `DE:240` | `cycleway:<side>=track` (+ `cycleway:<side>:segregated`, `:traffic_sign`); sidewalk variants via `sidewalk:<side>:bicycle=designated` + `:segregated` |
| Gemeinsamer Geh- und Radweg mit Z240 | `footAndCyclewayShared_*` + `traffic_sign` has 240 | 65+21+183 / 11 | as shared, plus `traffic_sign=DE:240` | `cycleway:<side>=track` + `cycleway:<side>:traffic_sign=DE:240` |
| Gehweg mit „Radverkehr frei“ (239 + 1022-10) | `footwayBicycleYes_*` + sign 239 and 1022-10 | 157+9+430 / 24 | `highway=footway\|path` + `bicycle=yes` (or sign with `1022-10`), not a crossing; plus `traffic_sign=DE:239,1022-10` | `sidewalk:<side>:bicycle=yes` (+ `sidewalk:<side>:traffic_sign`) |
| Fußgängerzone „Radverkehr frei“ | `pedestrianAreaBicycleYes` + sign 242 and 1022-10 | 15 / 0 | `highway=pedestrian` + `bicycle=yes\|designated` + `traffic_sign=DE:242.1,1022-10` | — |
| Mischverkehr mit motorisiertem Verkehr | `sharedMotorVehicleLane`; all of `roads` | 0 / 2 | `highway=cycleway` + `cycleway=shared_lane` (rare) | `cycleway:<side>=shared_lane` |
| Sonstige Wege | `footwayBicycleYes_*` without the sign, `pedestrianAreaBicycleYes` without the sign; all of `roadsPathClasses` | | | |
| Kreuzungsweg | `crossing` | 83 / 2 | `highway=cycleway` + `cycleway=crossing\|traffic_island`, or `cycleway=lane` + `lane=crossing`, or `highway=footway\|path` + `footway\|path=crossing\|traffic_island` + `bicycle=yes\|designated`; not longer than 100 m | rare (crossing tagged on a road side) |
| *(TODO, "Klärung notwendig")* | `needsClarification` | 297 / 5 | `highway=cycleway` that matches nothing above (mostly missing `is_sidepath`/`segregated`/signs), `path`/`footway` + `bicycle=designated` | same on a side |
| not in the dataset | `cyclewayLink` | 4 / 0 | `highway=cycleway` + `cycleway=link` (routing connector; Berlin: 495 ways) | — |
| no infrastructure | `data_no`, `separate_geometry`, `not_expected` | | | `cycleway:<side>=no\|none`, `=separate`; left side of a one-way road tagged with plain `cycleway=*` |

Sidepath refinement (`_adjoining` / `_isolated` / `_adjoiningOrIsolated`): adjoining if `is_sidepath=yes`, `footway=sidewalk`, `path=sidewalk|sidepath`, `cycleway=sidepath` or it is a road side; isolated if `is_sidepath=no`, `highway=service|track`; otherwise unknown → **`is_sidepath` is required on every separate cycleway/footway/path** with bike access. Berlin: 700 km of `*_adjoiningOrIsolated` (mostly `footwayBicycleYes` on footways).

#### C. Roads and paths (`roads`, `roadsPathClasses`)

| infraVelo attribute | TILDA field | OSM tags | Notes |
|---|---|---|---|
| `verkehrsri` | `oneway`, `oneway_bicycle` | `oneway`, `oneway:bicycle`, `dual_carriageway` | roads: `oneway=yes` + `dual_carriageway=yes` → `yes_dual_carriageway`; `oneway=no` is dropped (= two-way). `oneway:bicycle=no` → two-way for bikes |
| `breite` | `width_effective` / `width` | `width:effective`, `width` (+ `source:width`) | |
| `ofm` | `surface` | `surface` (+ `sett:length`) | same sanitizing as above |
| `farbe` | — | — | roads have no `surface_color` column → always "Nein" |
| `pflicht` | `traffic_sign` | — | streets: always "Nein"; paths: from `traffic_sign` (237/240/241) |
| `protek` / `trennstreifen` | — | — | "Ohne" / "entfällt" (no `traffic_mode` on roads) |
| no bike infrastructure on the sides | `cycleway:<side>` presence | `cycleway:both/left/right=no\|separate`, `sidewalk:<side>:bicycle` | infravelo QA layer "cycleway no": roads in the network should say explicitly that there is no lane |

#### D. Required tags per TILDA category (drives the sidebar, feature 8)

Key names are for the own way; on a road side they get the `cycleway:<side>:` / `sidewalk:<side>:` prefix.

| Category group | Required | Conditional |
|---|---|---|
| all bike infrastructure | `traffic_sign` (or `none`), `width`, `surface`, `oneway` | `sett:length` if `surface=sett`; `surface:colour` if coloured; `source:width` |
| separate ways (`cycleway_*`, `footAndCycleway*`, `footwayBicycleYes_*`, `needsClarification`) | + `is_sidepath` (yes/no) | `segregated` on shared/segregated foot+cycle ways; `bicycle`+`foot=designated` with DE:240/241 |
| `cyclewayOnHighway_*`, `cyclewayOnHighwayBetweenLanes`, `sharedBus*` | + `lane` (advisory/exclusive) on the side | `traffic_mode:right`, `buffer:right`, `marking:right` when parking is next to the lane (`trennstreifen`) |
| `cyclewayOnHighwayProtected` | + `separation:left/right`, `marking:left/right`, `buffer:left/right`, `traffic_mode:left/right` | |
| `bicycleRoad*` | `traffic_sign` (DE:244.1 …), `width`, `surface`, `oneway`, `oneway:bicycle` if one-way | `traffic_mode:left/right` (or `parking:*`), `marking:left/right`, `buffer:left/right`; `vehicle`/`motor_vehicle` |
| `crossing` | `width`, `surface`, `oneway` | `traffic_sign`, `surface:colour`, `crossing` (signals/markings) |
| roads (mixed traffic) | `oneway` (+ `oneway:bicycle`, `dual_carriageway` if one-way), `surface`, `cycleway:both/left/right` | `surface:colour` |

### 17. Extract a side into a separate way — ✅ (v1)

**Done (2026-09-30):** built as specified below.
- Code: `modules/sidepath/extract_tags.ts` (tag logic), `modules/sidepath/offset_line.ts`, `modules/actions/extract_sidepath.ts`, `modules/operations/extract_sidepath.ts` (added to the edit menu by a small hook in `modules/modes/select.js`, after iD's "Extract"), `css/96_extract_sidepath.css`, strings `operations.extract_sidepath.*`. Tests: `test/spec/sidepath/`, `test/spec/actions/extract_sidepath.ts`.
- Hovering a menu entry previews the new way (magenta dashed). The tooltip gives the offset, how many side tags move, and what the road gets.
- The operation needs the traffic sign rules (the lazy recommender bundle, loaded when a road is selected); until they are there the entry is disabled with "Loading the traffic sign rules …". If loading fails, it extracts without sign rules.
- Question 3 (`foot=use_sidepath` for sidewalks): built with "never".
- `use_sidepath` only when the side's **sign** designates it (237, 240, 241); a combined path without a sign is `bicycle`/`foot=designated` but the road gets no `use_sidepath`.
- Simplified against the spec: the kerb/buffer distance is a fixed 1 m (the side's `buffer` is not used yet). Unsided meta keys (`check_date:cycleway`, `source:cycleway:width`) stay on the road.
- Also: field "Bicycles, by Direction" (`bicycle/direction`) on the road presets; iD's edit menu no longer shows an empty "Shortcut" row for operations without a key.
- Tested in the browser (local test edits, all undone): right cycle track with DE:237 on Torstraße, and track + sidewalk with DE:241 as one path. TILDA reads the new ways as "Cycle track, along a road" / "Segregated foot and cycle path, along a road".
- Next: "extract along the chain" (way table, feature 6); snap the new way's ends to crossing paths; use `buffer` and the sidewalk/parking order from street-space-editor for the offset.

**Goal.** Many Berlin roads carry their cycle track and sidewalk as tags on the road (`cycleway:right=track`, `sidewalk:both=yes`, …). For the Radnetz dataset, and for width, separation and surface details, a separate way is often better: it gets its own geometry, junctions and full tagging. Today that conversion is manual and error-prone. You have to draw a parallel way, copy and rename ~10 tags, change the road to `…=separate` and remember `bicycle=use_sidepath`. This feature does it with one right-click. The result is one undo step, and the new way is selected so the mapper can align it with the imagery and connect it.

**Principle.** The side's tags are read exactly as TILDA reads them: `getTransformedObjects` from `@tilda-geo/bicycle-infrastructure`, the same unnesting as street-space-editor's `expandSidepaths`, with specificity `prefix` < `prefix:both` < `prefix:<side>`, plus `source:`/`note:` meta keys. So after the extraction TILDA sees the same attributes on the new way as it saw on the side before. Only the category changes from "road side" to "own way".

#### When the operations appear

Only for a single selected way with `highway` = a road class (not path-like classes, not areas), fully loaded and not locked.

| Side has… (after unnesting, per side) | Offered |
|---|---|
| `cycleway:<side>` = `track` (also via `cycleway`, `cycleway:both`, `opposite_track`) | "Extract <side> cycle track" |
| `cycleway:<side>` = `lane` / `share_busway` **with** a physical `separation:*` (protected lane) | "Extract <side> protected bike lane" — offered, but **not recommended**: the default for Radnetz is to keep protected lanes on the centerline. The entry sits at the end of the group, and its tooltip says "Usually kept on the road; only extract with a good reason (e.g. a long kerb-separated section)." No hint or validation ever suggests it. |
| `cycleway:<side>` = `lane` / `shared_lane` / `share_busway` without separation, `no`, `separate`, `opposite` | nothing (painted lanes stay on the road) |
| `sidewalk:<side>` = `yes` (also via `sidewalk=both|left|right|yes`, `sidewalk:both`) | "Extract <side> sidewalk" |
| both a cycle track and a sidewalk on the same side | both entries above, plus "Extract <side> cycle track and sidewalk as one path" |

So one road can offer up to 6 entries (left/right × cycleway / sidewalk / combined path). In the edit menu they sit together after "Reverse", all with iD's `iD-operation-extract` icon, ordered right side first (the side cycle tracks are on in Germany). Tooltips say what will happen, e.g. "Create a separate cycleway about 10 m to the right and set `cycleway:right=separate` on this road."

Disabled (entry shown greyed, with iD's usual reason tooltip): way not fully downloaded, too large (off-screen), or the new geometry would not fit (way shorter than 2 m).

#### Tagging per variant

Notation: `S` = the side's unnested tags (e.g. `S.surface` comes from `cycleway:right:surface` ?? `cycleway:both:surface` ?? `cycleway:surface`). `R` = the road's tags.

**A. Cycle track → `highway=cycleway`**

New way:
- `highway=cycleway`, `is_sidepath=yes`. No `is_sidepath:of*` (decided, question 6).
- Copied from `S`: `surface`, `smoothness`, `width` (+ `source:width`), `surface:colour`, `sett:length`, `segregated`, `traffic_sign` (+ `:forward`/`:backward`), `separation:*`, `buffer:*`, `marking:*`, `traffic_mode:*`, `lit` (else copy `R.lit`), `oneway`, `note`, `check_date`, and any other `S` key except the ones below.
- Dropped: the presence value itself (`cycleway=track`), `lane`, and keys that only make sense on the road (`lanes`, `width:lanes`, …).
- Highway and access from the sign, taken from the traffic sign tool (decided, question 4). The vendored converter's `trafficSignTagToSigns()` + `signsToTags(signs, 'DE', 'way')` give each sign's `tagRecommendationsByGeometry` (`osm-traffic-sign-tools-id-field/packages/traffic-sign-converter/src/data-definitions/DE/data/infrastructure.ts`), so the rules live in one place:
  - `DE:237` → `highway=cycleway`, `bicycle=designated`.
  - `DE:240` → `highway=path`, `bicycle=designated`, `foot=designated`, `segregated=no`, `is_sidepath=yes`, `traffic_sign=DE:240`.
  - `DE:241-30` / `DE:241-31` → `highway=path`, `bicycle=designated`, `foot=designated`, `segregated=yes`, `is_sidepath=yes`, `traffic_sign=DE:241-30|31`. A bare `DE:241` is written as `DE:241-30`, following the tool's redirect (`signsToTrafficSignTagValue`); the side (`-30` bike left, `-31` bike right) can't be derived from the road tags.
  - No sign → `highway=cycleway` (implies bicycle designated); `traffic_sign=none` is kept if tagged.
  - `S.segregated` from the road is only used when the sign does not decide it.
- Direction (changed 2026-10-01): the new way is **always drawn in the road's direction**, so the side's tags stay valid without turning them (`separation:left`, `traffic_sign:forward`), and a later merge with a sidewalk (feature 28) usually finds both ways in the same direction. The bike direction is in the tags: `S.oneway` if tagged (`yes` / `-1` / `no`), otherwise `oneway=yes` on the right side and `oneway=-1` on the left. Before, the left side was drawn against the road with `oneway=yes`, and its side tags were not turned. If the road has `oneway=yes` + `oneway:bicycle=no` and the left side has no oneway tag, we do **not** guess: `oneway` stays unset and the TILDA checklist shows it as missing.

Road (centerline):
- `cycleway:<side>=separate`. All `cycleway:<side>:*` keys and their `source:`/`note:`/`check_date:` variants are removed.
- If the value came from `cycleway` or `cycleway:both`, it is first split into `cycleway:left` / `cycleway:right` (and `cycleway:both:*` sub-keys into both sides), so the other side keeps its tags. If both sides end up equal (`separate`), they are merged back into `cycleway:both=separate`.
- Use-sidepath, only if the new way is designated (sign 237, 240 or 241), direction-specific and merged like the directional combo (question 2):
  - Right side extracted → `bicycle:forward=use_sidepath`.
  - Left side extracted → `bicycle:backward=use_sidepath`.
  - Both sides designated (after the second extraction) → merged into `bicycle=use_sidepath` (and the directional keys removed).
  - On a one-way road the forward side alone → `bicycle=use_sidepath`, unless `oneway:bicycle=no`.
  - An existing `bicycle=*` value other than `yes`/`designated`/unset is not overwritten (reported in the flash message).

**B. Sidewalk → `highway=footway` + `footway=sidewalk`**

New way:
- `highway=footway`, `footway=sidewalk` (TILDA treats that as a sidepath, so no `is_sidepath` needed).
- Copied from `S` (prefix `sidewalk`): `surface`, `smoothness`, `width`, `sett:length`, `lit`, `kerb`, `tactile_paving`, `traffic_sign`, `note`, `check_date`, …
- Bicycle access from `S.bicycle`:
  - `yes` → `bicycle=yes` (TILDA `footwayBicycleYes`; the sign `DE:239,1022-10` is kept if tagged).
  - `designated` → the shared path of variant A: `highway=path`, `bicycle=designated`, `foot=designated`, `segregated` from the sign (240 / 241) or `S`; `footway=sidewalk` is dropped (TILDA foot+cycle categories need the designations and `segregated`).
  - `no` → `bicycle=no`.
- No `oneway`.

Road:
- `sidewalk:<side>=separate`.
- The old one-key schema is converted to sided keys: `sidewalk=right` means right yes, left no. The same split and merge rules as for cycleways apply.
- `foot=use_sidepath` only on request (open question below); by default nothing, because in Germany pedestrians have no general "must use" rule like bikes do.

**C. Cycle track + sidewalk on the same side → one `highway=path`**

For "Geh- und Radweg" mapped as two side tags:
- `highway=path`, `bicycle=designated`, `foot=designated`, `is_sidepath=yes`.
- `segregated`:
  - `yes` if a cycle track and a sidewalk are both tagged (two strips) or the sign is 241.
  - `no` if the sign is 240.
  - Otherwise `S_cycleway.segregated` or `S_sidewalk.segregated`.
- Split keys (Key:segregated wiki; the same as street-space-editor's width/surface modes and what TILDA reads):
  - `cycleway:surface`, `cycleway:smoothness`, `cycleway:width` (+ `source:cycleway:width`), `cycleway:surface:colour` ← from the cycle track.
  - `footway:surface`, `footway:smoothness`, `footway:width` ← from the sidewalk.
- Combined keys:
  - `surface` / `smoothness`: only when both parts have the same value (then the split keys are left out).
  - `width`: the sum of both widths, only if both are known.
  - `lit`: from either part, else from the road.
- `traffic_sign` from the cycle track side (240/241 live there), else the sidewalk side.
- Direction: `oneway=no` for the path; the cycle direction as `oneway:bicycle` (the rules from A, where `oneway=yes` becomes `oneway:bicycle=yes`).
- TILDA check: TILDA reads `cycleway:*` on a path as the bike values (`surface` ← `cycleway:surface`), so the Radnetz attributes stay the same.
- Road: both A and B changes (`cycleway:<side>=separate`, `sidewalk:<side>=separate`, `bicycle:<dir>=use_sidepath` when designated).

#### Geometry

- A copy of the road's line offset to the chosen side: right = right of the way's direction.
- **Offset from the road width (decided, question 5),** stacked like the street cross-section (road → parking → cycle track → sidewalk), the same order as street-space-editor's `surface-sidepath-offset.ts`:
  - `road/2`: from `roadWidthFromTags()` in `modules/width/width_tags.ts`, i.e. `width` → `est_width` → a default by highway and oneway.
  - `+ parking`: only when `parking:<side>` (or `:both`) = `lane`/`street_side`. By `parking:<side>:orientation`: parallel 2 m (default), diagonal 4.5 m, perpendicular 5 m. `half_on_kerb` counts 1 m, `on_kerb` 2 m; `no`/`separate` counts 0.
  - `+ 1 m`: kerb / buffer. If the side has a tagged `buffer`, that value is used instead.
  - **Cycle track:** `+ track/2`, where `track` = `S.width` or 2 m.
  - **Sidewalk:** `+ track` (the full cycle track width, if that side has one, extracted or not) `+ sidewalk/2`, where `sidewalk` = `S.width` or 2.5 m.
  - **Combined path:** `+ (track + sidewalk)/2`.
  - Example: residential without tags, no parking, track + sidewalk: track at 4 + 1 + 1 = 6 m, sidewalk at 4 + 1 + 2 + 1.25 ≈ 8.3 m. Secondary two-way with parallel parking: track at 7 + 2 + 1 + 1 = 11 m.
- The width defaults are TILDA's: iD's `width_tags.ts` table (ported from street-space-editor) has the same numbers as `tilda-geo/processing/topics/parking/roads/helper/road_width_tags.lua` and the shared `highway_width_fallbacks.lua` on the CQI branch (`feature/cycling-quality-index`): primary 18 / 12 one-way, secondary 14 / 9, tertiary 10 / 7, residential/unclassified 8, living_street 5, service 4, unknown 10. The est-width branch adds `est_width` as the second source, which iD already does. So nothing to copy now.
  - Later: move the table plus `roadWidth(tags)` into `@tilda-geo/bicycle-infrastructure` (TS port of TILDA's LUA, used by iD and street-space-editor) once the CQI branch has merged the LUA table. Then the three places share one source.
  - Each vertex is moved along the average of its two segment normals, in meters converted with `geoMetersToLat/Lon`.
  - Very sharp angles are clamped so the line doesn't loop.
- New nodes only. Nothing is connected to the road network. iD's "disconnected way" / "almost junction" validations then show the ends to connect, which is intended because junctions need a human.
- Node order: the road's, always.
- After the operation: one undo step ("Extracted the right cycle track into a separate way"). The new way is selected, and the map doesn't move. Flash text: what was changed on the road.

#### Edge cases

- **Road split into several ways:** only the selected way is converted. The way table (feature 6) shows the neighbours. v2: "extract along the chain".
- **Way with `cycleway:right=separate` already:** that side isn't offered.
- **Directional traffic signs on the road** (`traffic_sign:forward=DE:237` without side keys): not moved in v1 (the flash message says so).
- **Parking lanes between road and track** (`parking:right=lane`): only affect the offset. v1 uses the fixed distances.
- **Roundabouts / closed ways:** not offered in v1.

#### Implementation plan (after review)

- `modules/sidepath/extract_tags.ts`: pure functions. `sideTags(tags, prefix, side)` via `getTransformedObjects`, `newWayTags(variant, …)`, `roadTagChanges(variant, …)`, `signTags(trafficSign)` (via the vendored traffic sign converter). Unit tests for every row of the tables above.
- `modules/sidepath/offset_line.ts`: offset coordinates; `sidepathOffsetMeters(tags, prefix, side)` for the stacking (uses `roadWidthFromTags`).
- `modules/actions/extract_sidepath.ts`: one action that adds nodes + way and changes the road tags.
- `modules/operations/extract_sidepath.ts`: one operation factory per variant/side (`operationExtractSidepath(context, ids, { prefix, side })`), registered in `modules/operations/index` and in the edit menu. Not named `extract` (iD already has "Extract" for points from areas).
- Strings under `operations.extract_sidepath.*` in `data/core.yaml`.
- Field `bicycle/direction` in `radnetz_customization.ts` (road presets, `moreFields`); the merge helper `setDirectionalValue(tags, key, direction, value)` shared with the action.

#### Open questions for review

1. ~~Offer protected bike lanes?~~ **Decided (2026-09-30):** offer them, but as a user decision only. The default is to keep them on the centerline; the UI does not recommend extracting them (see the table). Kerb-separated tracks are the conventional case for separate ways.
2. ~~Directional or plain `use_sidepath`?~~ **Decided (2026-09-30):** direction-specific, merged once both directions are equal.
   - The action writes `bicycle:forward` / `bicycle:backward` and merges into `bicycle=…` when both sides have the same value, using the same rule as iD's directional combo (`modules/ui/fields/directional_combo.js` `change()`): equal → common key, directional keys removed; different → both directional keys, common key removed. A plain `bicycle=yes` that is already there becomes the value of the other direction (`bicycle:backward=yes`), like the field does.
   - New field `bicycle/direction` (directionalCombo, `key: bicycle`, `keys: [bicycle:forward, bicycle:backward]`, options `use_sidepath`, `optional_sidepath`, `yes`, `designated`, `no`; labels "Forward" / "Backward") in `moreFields` of the road presets (not bicycle roads). Mappers see and fix the result with the same merge behavior. Checked: the directional combo is generic on `keys`, so `:forward/:backward` works.
   - Caveats:
     - The field also appears on roads that only have a plain `bicycle=*` (iD shows `moreFields` whose key is tagged), next to the Access field that edits the same `bicycle` key.
     - The up-arrow in the row label is fine for forward/backward; the side indicator (feature 7) only knows left/right, so it shows nothing for this field.
3. `foot=use_sidepath` for sidewalks: never, always, or as a separate option?
4. ~~240/241: `highway=cycleway` or `highway=path`?~~ **Decided (2026-09-30):** `highway=path` + `foot=designated` + `bicycle=designated` + `segregated=no` (240) / `yes` (241-30/31), with `is_sidepath=yes` and the sign. The tags come from the traffic sign tool's recommendations.
5. ~~Fixed offsets or from the road width?~~ **Decided (2026-09-30):** from the road width with TILDA's fallbacks, stacked by parking / track / sidewalk (see Geometry).
6. ~~`is_sidepath:of` / `is_sidepath:of:name`?~~ **Decided (2026-09-30):** no, the new way only gets `is_sidepath=yes` (cycleway, path) or `footway=sidewalk`.

### 18. Mapillary layer: recent imagery, own users, the selected way's images — ✅ (v1)

For Radnetz we map from recent imagery, and often from our own captures (user `radinfra`, organization `fixmycity`). The layer should make both visible at a glance.

**Data (checked 2026-09-30):** Mapillary's vector tiles (`mly1_public/2`, layer `image`) carry `id`, `captured_at`, `compass_angle`, `creator_id`, `is_pano`, `quality_score`, `sequence_id`, and on some images `organization_id` (320 of 181,216 images in one Mitte z14 tile). No usernames.
- Username → `creator_id`: Graph API `images?creator_username=<name>&limit=1&fields=creator` (`radinfra` → `750463990876291`).
- Organization slug → id: no search endpoint. Collect the `organization_id`s seen in tiles and resolve each once with `/{id}?fields=slug` (`fixmycity` → `231009332916068`); cache per session.

1. **Default age filter from 2024-01-01** — `context.photos()` starts with `fromDate = 2024-01-01` unless the URL has `photo_dates`. The age slider's histogram gets a marker line at that date ("2024-01-01: older imagery"), so mappers see how much older imagery they hide. The default comes from the project config (below).
2. **Age colors** — markers and sequence lines are colored by capture date instead of iD's single green:
   - Images older than the cutoff date are red. The cutoff is the "from" filter date, else 2024-01-01; they are only visible when the filter is widened.
   - The time from the cutoff to today is split into three equal parts: newest third green, middle yellow, oldest orange. With cutoff 2024-01-01 and today 2026-09: green from 2025-10, yellow from 2024-12, orange before.
   - The bands adapt when the filter changes. A small legend sits under the age slider.
   - Open for review: the request said "all after 1.1.2024 is red". Read here as "all *older than* 1.1.2024 is red", since newer is the preferred imagery.
3. **Highlight users and organizations** — images from listed users/orgs get an extra white-ringed dot (their own color, e.g. blue) in the middle of the marker, and their sequences a slightly thicker line.
   - Lists are comma-separated usernames and org slugs, in the URL (`photo_highlight_users=radinfra`, `photo_highlight_orgs=fixmycity`) and in the project config (`index.html`: `iD.mapillaryHighlight({ users: ['radinfra'], orgs: ['fixmycity'] })` or similar), editable in the Photo Overlays pane ("Highlight users" / "Highlight organizations" inputs next to the existing username filter).
   - URL wins over the config; the pane writes the URL.
4. **The selected way's images** — when a way is selected, every Mapillary image id in its tags (all keys of feature 19) that is in the loaded tiles gets a distinct marker (e.g. a magenta dot + a larger ring). It is shown even when the age/type/username filters would hide it. Deselecting removes it.

Code: `modules/svg/mapillary_images.ts` (classes and filter exceptions), `modules/renderer/photos.js` (defaults, URL params), `modules/ui/sections/photo_overlays.js` (marker line, legend, inputs); new TS helpers in `modules/mapillary/` (config, highlight id resolution, age bands), CSS in its own file.

**Status (v1, built by a Sonnet agent, reviewed):**
- Config: `iD.mapillaryConfig({ defaultFromDate, highlightUsers, highlightOrgs })` in `index.html` (`modules/mapillary/config.ts`; `defaultFromDate: null` turns the default filter off).
- Highlight inputs start with the configured lists; what the user enters replaces them, an empty input means no highlighting (`photo_highlight_users=` stays in the URL), entering the configured list again drops the parameter.
- Classes `mly-age-new|mid|old|outdated`, `mly-highlighted` (sequence), `mly-highlight-dot`, `mly-selected-feature-image` (magenta ring); CSS `css/97_mapillary_highlight.css`.
- Tested: at Hauptstraße/Traunsteiner Str. the radinfra images get the dot and their sequence the thicker line; bands new/mid/old show; a way's `mapillary` image older than the cutoff appears when the way is selected.
- Limits: the cutoff line on the slider stays at the configured date when the filter is widened. The selected way's images are only drawn if their tile is loaded (zoom ≥ 12).
- The photo viewer closes itself when the requested image cannot be loaded, instead of staying open as an empty black box: Mapillary (`service.imageFailed()`: unknown image id, failed request; not when another image was requested meanwhile, and not while an earlier image is still shown), Panoramax (image data request fails) and flat photos of any service (`<img>` error). `context.ui().photoviewer.hide()` closes the viewer of every service.

### 19. Mapillary image fields: all our keys, several images, show in the viewer — ✅ (v1, replaces feature 14)

**Keys in our data** (Berlin PBF 2026-08, `osmium cat -f opl`; TILDA reads the same, `extract_bikelanes.lua`: `mapillary`, `source:mapillary`, `mapillary:forward/backward` (+ `source:`), `traffic_sign:mapillary`, `source:traffic_sign(:forward|:backward):mapillary`, each also on road sides after unnesting):

| Key | Berlin | | Key | Berlin |
|---|---|---|---|---|
| `mapillary` | 5835 | | `cycleway:left:traffic_sign:mapillary` | 67 |
| `cycleway:right:mapillary` | 1187 | | `cycleway:both:mapillary` | 47 |
| `source:traffic_sign:mapillary` | 1046 | | `source:mapillary` | 31 |
| `source:cycleway:right:traffic_sign:mapillary` | 675 | | `mapillary:backward` | 23 |
| `cycleway:left:mapillary` | 352 | | `traffic_sign:mapillary` | 16 |
| `source:cycleway:left:traffic_sign:mapillary` | 144 | | `source:sidewalk:right:traffic_sign:mapillary` | 15 |
| `cycleway:right:traffic_sign:mapillary` | 138 | | `cycleway:mapillary`, `source:traffic_sign:backward/forward:mapillary`, `mapillary:forward`, `sidewalk:*:mapillary`, `cycleway:both:mapillary:backward`, … | < 15 each |

- Several images in one value (`;`) are rare: 17 of 5835 `mapillary`, 1 of 31 `source:mapillary`.
- No numbered keys (`mapillary:1`, `:2`) in Berlin. Germany (`germany-latest.osm.pbf`, 70,547 `mapillary`) has the same key set plus: `mapillary:image` 220 (nonstandard), `mapillary:2019` 12 / `mapillary:2020` 8 (years; **not supported**, numbered keys have at most 3 digits), `mapillary:addr` 7, `source:ref|maxspeed:mapillary` 7 each, `mapillary_url` 4. Only `mapillary:image` is frequent enough to consider; not handled for now. The field supports numbered keys anyway.
- Not image ids, excluded: `mapillary:map_feature`, `was:mapillary`.
- Key grammar we handle: `[source:][cycleway|sidewalk[:left|:right|:both]:][traffic_sign[:forward|:backward]:]mapillary[:forward|:backward|:<n>]`, plus `source:mapillary[:forward|:backward]`. Labels from the parts, e.g. "Right bike lane · traffic sign (source)".

1. **One "Mapillary images" field** replaces the `mapillary` identifier field (custom field type, like the traffic sign field):
   - It lists every image key of the feature, one row per key.
   - Each row lists its images: `;`-separated values become a small list.
   - Per image: the id (editable), the external link (as today), and an eye button "Show in viewer". The eye button turns on the Mapillary layer, opens the viewer and selects the image (`services.mapillary.selectImage`, `showViewer`). This was feature 14.
   - Under each image: its age in relative time ("3 months ago", with the date on hover), the username, and "360°" if it is a panorama. This comes from the Graph API `/{id}?fields=captured_at,creator,is_pano`, cached per id, loaded when the row is visible.
   - "+" on a row adds another image to that key. "+ Add image" at the bottom adds a row with a key chooser: the keys above that make sense for this feature — road sides only on roads that have that side, the sign keys only with a sign.
   - The field shows when any of its keys is tagged, and is in `moreFields` of the Radnetz presets.
2. **Auto-show on select** — a checkbox in the Mapillary part of the Photo Overlays pane, on by default: "Show the way's Mapillary image when selecting it".
   - When on and a way with image keys is selected, the layer turns on and the viewer shows the first image.
   - Order: `mapillary:forward`, then `mapillary`, then the other keys in field order; the first id of a list.
   - Stored in `prefs`.

Code: `modules/mapillary/tag_keys.ts` (parse keys and values, labels, preferred image; shared with features 18 and 20, with tests), `modules/ui/fields/mapillary_images.ts`, `modules/presets/…` (field type override), strings in `data/core.yaml`.

**Status (v1, built by a Sonnet agent, reviewed):**
- Field type `mapillaryImages` (`modules/ui/fields/mapillary_images.ts`, CSS `css/98_mapillary_field.css`), helpers `modules/mapillary/{field_rows,image_info,viewer,auto_show}.ts` with tests.
- The customization replaces the `mapillary` field with `universal: true` instead of adding it to each preset's `moreFields`: every preset offers it, and it shows once any image key is tagged. `presets/field.ts`: `allKeys` includes all image keys of the tags (present/modified/revert), and the field's own label wins over the schema's translated "Mapillary Image ID".
- Pasting a Mapillary URL (`pKey=`) stores the id. Removing the last image of a key removes the tag.
- Auto-show: `context.on('enter')` hook (`initMapillaryAutoShow` in `ui/init.js`), pref `mapillary-auto-show-selected`, checkbox shown while the Mapillary layer is on.
- Layout (after review): one table row per image like the directional combo — label cell = key label + small age and image type (360° / flat, no username), value cell = id (cut off) + link + eye + trash. The "+" sits in the field label before the trash and adds a row with a key chooser.
- Not supported: multi-selection.

### 20. "Set photo from viewer" for all image keys — ✅ (v2: buttons in the viewer bar)

iD's eye-dropper button in the photo viewer always writes `mapillary=<id>`. With the keys of feature 19 that is too limited.
- Target:
  - The main button writes to the **active target**: the image key row that was last focused or clicked in the Mapillary images field (the row gets an "active target" outline); otherwise `mapillary`.
  - A caret next to the button opens a short list of targets: the feature's existing image keys, plus the likely new ones (`mapillary:forward`, `mapillary:backward`, `cycleway:right:mapillary`, …, `source:traffic_sign:mapillary`). Each entry has a tooltip "Add to `<key>`".
- Append, don't overwrite: if the key already has images, the id is added to its `;` list (no duplicates). The button tooltip says where it goes.
- Keeps iD's disabled states ("already set" per target key, "too far").

Code: `modules/ui/photoviewer.js` (small hook), new `modules/ui/mapillary_set_photo.ts`.

**Status (v1, built by a Sonnet agent, reviewed):**
- `modules/mapillary/active_target.ts` (target per selection, `change` dispatch, shared by field and viewer), `modules/mapillary/set_photo.ts` (pure: target, append, disabled reason; tests), `modules/ui/mapillary_set_photo.ts` (button + caret menu). Hook at the top of `renderAddPhotoIdButton` in `photoviewer.js`: Mapillary only, other providers unchanged. CSS in `css/98_mapillary_field.css`.
- Only an explicitly chosen target row is outlined; with the default `mapillary` nothing is. With several features selected, the menu lists the first one's keys; "already set" needs the id on all of them.
- The button also re-renders when the viewer's image changes (iD's did not, so its disabled state could be stale).
- Open: eyeball check of the caret menu styling in a visible window.

**v2 (2026-10-01, decided): the eyedropper and its key menu are gone for Mapillary.** The bar above the viewer (feature 26) shows, while one feature is selected and an image is shown, a `key=1586…` button per image key of the feature (`suggestedMapillaryKeys`: existing keys, `mapillary[:forward|:backward]`, the sides with a bike lane / sidewalk, the sign source keys). Each shows its state like the sign buttons: `✓` when the image is in the key, `+1586…` when it is added to a list. The row last chosen in the Mapillary images field is outlined as suggested (else `mapillary`). Disabled with iD's "too far" text when the image is more than 100 m away. With a selected sign, these buttons follow the sign's buttons (without the sign's own source key). Sides mapped as `separate` get no image key. Only one selected feature (the menu also handled several). Code: `imageButtonKeys` in `modules/mapillary/set_photo.ts`, `imageActionsFor` in `modules/ui/mapillary_sign_bar.ts`; `photoviewer.js` keeps iD's code and only drops `mapillary` from the eyedropper's providers; `modules/ui/mapillary_set_photo.ts` and its CSS are removed.

### 21. Measuring tape ("Maßband") for width fields — ✅ (v1)

**Goal.** Measure a width on the aerial image directly from the width field, instead of guessing or using a separate tool. The measured value goes into the field with 5 cm precision.

**Where.** Every width input: `width`, `est_width`, `width:effective`, `cycleway:width`, `footway:width`, the side width fields (`cycleway|sidewalk:<side>:width`, feature 10), `buffer:*` in meters. Not the raw tag editor: it only ever shows the plain tags. Each gets a "measure" button (ruler icon, tooltip "Measure on the map") next to iD's +/- buttons.

**Start.**
- Clicking the button starts the tape for this key and the selected way.
- The width band (feature 10) is hidden while measuring and comes back afterwards.
- Initial position: the middle of the part of the way that is visible on screen, at a right angle (90°) to the way there, centered on the way, reaching to both sides.
- Initial length: the current value of the field, else the road width (`roadWidthFromTags`) for `width`, else 2 m.

**UI on the map.**
- A blue line with an end handle at both ends and the length as a label ("3.45 m").
- The handles must not hide the point being measured: a thin ring with a transparent center and a small crosshair, with a larger invisible hit area around it.
- Drag an end handle → that end moves anywhere on the map. The way only sets the start position. Drag the line itself → the whole tape moves.
- **Magnifier** while dragging an end: a round loupe (about 160 px, 3× zoom) next to the pointer shows the selected background imagery around the handle, with a crosshair. It uses a clone of the background tiles taken at drag start; the map does not move while dragging.

**Value.**
- Length = spherical distance of the two ends, rounded to 0.05 m, written without trailing zeros (`2.35`, `2.4`).
- While dragging, the field input shows the value live.
- On drag end the tag is written: one undo step per drag, "Measured width".
- Leaving the field or the way keeps the last written value; nothing is reverted.

**End.** Clicking the button again, pressing Esc, or selecting something else (or nothing) ends the tape. Moving the map keeps it (the ends are geo coordinates).

**Code (plan).**
- `modules/measure/measure_tape.ts`: state singleton — active key, entity, the two ends; dispatch `change`.
- `modules/measure/initial_tape.ts`: pure; visible middle of a way, the perpendicular line, rounding.
- `modules/svg/measure_tape.ts`: SVG layer with the line, handles, label, d3 drag.
- `modules/ui/measure_loupe.ts`: the magnifier.
- Button: added by event delegation / a small hook where iD renders fields, like the width indicator (feature 10).
- The width indicator checks the tape and hides itself while it is active.
- CSS `css/98_measure_tape.css`. Tests for the pure parts.

**Status (v1, built by a Sonnet agent, reviewed):**
- Code as planned, plus `modules/measure/measure_tape_listeners.ts` (a MutationObserver on the sidebar adds the button to width fields; raw tag rows only get the live value while dragging). CSS is `css/99_measure_tape.css`; icon `fas-pen-ruler` (already in the sprite).
- Measurable keys: `width`, `est_width`, `width:effective`, `*:width`, `buffer:*`; not `maxwidth`, not `*:source`, not `source:*` / `note:*` / `check_date:*` (e.g. `source:width`). Needs exactly one selected way.
- Measuring again overwrites the width and its `source:<key>`, also a more precise source like `ARCore` (decided 2026-09-30: the mapper sees the value and its source below the field and only measures when it is needed).
- Hooks in upstream files: `svg/layers.ts` (layer `measure-tape`), `svg/width_indicator.ts` (hidden while measuring), `ui/init.js` (listeners).
- Dragging the whole tape writes nothing (length unchanged); Esc is caught before it deselects the way.
- Magnifier: crosshair with a gap and a dot on the measured point, the tape drawn in the lens; placed away from the tape, beside it or diagonal (farther out near map edges), always inside the map (`modules/measure/loupe_position.ts`, tested). Handles use a crosshair cursor.
- Open: touch input untested.

### 22. Access field: all tagged access keys, add a mode of transport — ✅ (merged)

- Source: branch `show-tagged-access-tags` on origin (tordans/iD), the branch of PR openstreetmap/iD#12011. Merged as a merge commit, so later updates of the branch can be merged again.
- The "Allowed Access" field shows the default rows (All, Foot, Horses, Bicycles, Motor Vehicles) plus every tagged access key, in OSM wiki order (`modules/ui/fields/access_keys.ts`, land-based keys only; waterways use `access_simple`).
- A "+" in the field label adds a row with a key combobox ("Add a new mode of transport"); choosing a key opens the value combobox (`uiCombobox.open`).
- Remove/revert use the shown keys: the field sets `field.effectiveKeys`, and `uiField.allKeys` prefers them.
- Temporary English labels for the extra keys (`data/access_field_types.en.json`) are merged into the tagging locale until id-tagging-schema ships them (`modules/presets/access_field_type_strings.js`, hooked into the localizer).
- Merge fixes (only in this branch, not on the PR branch): the localizer hook moved to `localizer.ts` (upstream migrated it), `uiField.allKeys(tags)` keeps our argument, and the new access specs use `d3_select` instead of the removed `d3` global. **The PR branch itself needs the same spec fix when it is rebased on current develop.**
- Same "+ in the field label" pattern as the Mapillary images field (feature 19).
- Tested: a road with `bicycle=designated`, `motorcar=destination`, `hgv=no` shows Cars and Heavy goods vehicle as extra rows.

### 23. Compact sidebar — 🟨 (rounds 1–4 done)

Goal: more room for the data in the entity editor, keeping iD's look and feel.

- **Round 1 (2026-09-30):**
  - Feature type is the header of the sidebar: no disclosure, edge to edge, with a small "Feature type" line above the preset name (`modules/ui/sections/feature_type.js` uses `.content()` instead of `.disclosureContent()`).
  - All sections run edge to edge, separated by a line. The section headers are full-width rows. Their bodies keep a small gutter (`--sidebar-gutter`, 10px).
  - Fields: no grey box around them, tighter labels, inputs and spacing.
  - Tags: the raw tag editor has no side padding; the rows are the only frame.
  - Relations only follow the general section changes.
  - All in `css/99_sidebar_compact.css`, which overrides `80_app.css`. Everything is scoped to `.entity-editor`, so the preset list and the other panes are unchanged.
- **Grouping (2026-09-30):** a field with a side prerequisite sits right below its parent field, without the separator line (see feature 15, side prerequisites). General field grouping is still to be discussed.
- **Round 2 (2026-09-30), experiment: fields without boxes:**
  - A line above each field label is the only separator. The label is plain text; its buttons have no borders.
  - Inputs and buttons keep their darker background. The borders inside the input area take the sidebar color: the outer edges disappear, and the inner ones become small gaps between input, caret and buttons. The input area has rounded corners, but not while a combobox is open, so its dropdown can hang below.
  - The label buttons and the input buttons are both 26px wide, so they line up.
  - No scrollbar track when nothing scrolls, and a thin one otherwise (`.inspector-body`: `auto` instead of `scroll`).
  - Traffic sign field: the "No signs yet" text is hidden, since other fields have no empty text either.
  - Buttons we added use Font Awesome icons (measuring tape `fas-pen-ruler`, Mapillary `fas-eye`), which fill the whole icon box, while iD's icons have a margin. They are drawn at 14px so they look the same size.
  - Mapillary images field: the input fills the whole row height (the compact input height had left a gap below it), and the row buttons line up with the label buttons.
  - Not changed yet: the TILDA cards still have their boxes.
- **Round 3 (2026-09-30):** the borderless fields stay.
  - No line between fields any more, only space.
  - One gap color everywhere: rows of the directional combo (its rows are table rows, so the gap goes on the cells), access rows, Structure's radio options and the raw tag rows all use the sidebar color (`--bg-color-2`).
  - No rounded corners on cells inside a field's rows; only the field's input area is rounded.
  - Row labels ("Left side", "All") start where the text of an input starts (8px).
  - Structure's sub fields (bridge type, layer) are flat rows like the rest, without the inner box.
  - Dropdown and up/down arrows use the same light grey as the label icons.
  - Field titles are no longer clickable (before, some focused their input and some did nothing): `field.js` prevents the label's click unless it is on a button, and the cursor stays the default one.
- **Round 4 (2026-10-01): field title buttons** (delete, undo, info, the related tags buttons of feature 25):
  - Only visible while the field is hovered or focused (touch: focus the input), faded in within 0.12 s; hidden buttons can't be clicked.
  - 22px squares with the input's background and 4px radius, 3px apart, 4px above the input; a stronger background (text colour mixed in) on hover and when active.
  - Icons: iD's at 16px; Font Awesome icons smaller (11px), since they fill their box.
  - Link buttons in fields (e.g. the Mapillary "open" link) use the text colour like the other field buttons, not the blue link colour.
  - Known side effect: the undo button was the only sign that a field was changed; it now also shows only on hover.
  - The lock tooltip of a locked field (Wikidata) stays as in iD, on the whole field, so it also shows over the title buttons. Attaching it to the title text and input instead did not work (the input clips it, a disabled input gets no hover events) and was reverted.
- **Open ideas (to discuss):**
  - Group the fields (e.g. "Geometry & width", "Surface", "Bike infrastructure", "Access & traffic signs", "Other"), with small subheadings inside the Fields section instead of more disclosures. Possible in a preset field order, or as a mapping from field ids to groups in our code.
  - Merge the TILDA section into the fields. For example, the TILDA checklist rows could become field groups, or the fields could show TILDA's state per field.
  - Sticky section headers, so the current section stays visible while scrolling.

### 24. Surface and smoothness by photo — ✅ (v1; package local, not released)

Goal: one field for `surface` and `smoothness` where mappers choose by photo first, with a text fallback. Two steps that depend on each other: first the surface, then the smoothness for that surface.

- **Sources:**
  - Data: `@osm-editor-kit/surface-smoothness-data` (catalogue + photos extracted from StreetComplete: 26 surfaces, 8 smoothness levels, 43 surface × smoothness reference photos).
  - UI: `@osm-editor-kit/surface-smoothness-id-field` (D3), both from `~/Development/OSM/osm-surface-smoothness-workspace/osm-surface-smoothness-tagging`.
  - The flow follows the parking-lanes app's picker (`parking-lanes/app/src/modes/surface/controls/SurfaceSmoothnessPicker.tsx`).
  - Earlier iD integration (combo + smoothness cards): worktree `iD-surface-smoothness-worktree`, branch `surface-smoothness-field`.
- **Where the work happens:** the UI is improved in the package itself: branch `image-first-ui` in `osm-surface-smoothness-tagging` (5 commits on `main`, changeset `.changeset/image-first-ui.md`, README updated, `bun run check` green). **Status 2026-09-30: local only — not pushed, not released (decided: fine for now).** Both packages are on npm only as 0.0.0 with the older UI (the data package also still GPL with vehicle icons), so the fork vendors the local build: `npm run vendor:surface-smoothness` → `vendor/surface-smoothness-field/` (`index.js` with d3 and the catalogue bundled in, CSS, `images/`), copied to `dist/surface-smoothness-field/` by `npm run dist`. Switch to npm once a new version is published.
- **UI (package):**
  - Two tiles side by side: the surface and its smoothness, each with its photo (or emoji) and label; an empty frame in the border color with the name while not set. Tags only in the tooltip.
  - Clicking a tile opens its picker below. Surface first: a grid of small photos, the usual surfaces first, the others behind "More" (see round 3). Choosing a surface opens the smoothness picker: StreetComplete's reference photos for that surface, best to worst, or all 8 levels with their emoji where there are none. Clicking the smoothness tile without a surface opens the surface picker.
  - Round 2 (after review): first version had a separate "Oberflächenglätte" heading and large rows with `key=value`; now the two compact tiles only.
  - Round 3: each open picker has a dropdown below the photos, for values without a photo. It offers the catalogue's values plus the schema's `surface` / `smoothness` options (package adapter `options`; e.g. `concrete:plates` "Betonplatten"), with iD's translated labels; any typed value works. The grid shows 12 surfaces (three rows of four: asphalt, paving stones, concrete, sett, cobblestone, concrete lanes, compacted, fine gravel, gravel, grass paver, ground, dirt); the 14 rare or unspecific ones (`paved`, `unpaved`, `wood`, `metal`, `rubber`, `sand`, …) are behind "More".
  - Round 4: no text mode and no switch in the field label any more. An open picker shows its photos, then one label | input row (iD's row style, e.g. "Oberfläche | Asphalt") that takes any value; its suggestions are the catalogue's values plus the schema's (`concrete:plates`, …). All 26 surfaces show at once (no "More"). 10px space between the two tiles and the open picker. 4 surfaces have no photo (`artificial_turf`, `paved`, `unpaved`, `acrylic`); 3 have no German schema label and show the English catalogue title (`rock`, `rubber`, `acrylic`).
  - Round 5: the label | input row is iD's own combo field for the schema's `surface` / `smoothness` field (translated dropdown, iD's styles), rendered by the wrapper through the package's new `adapters.renderInput` hook. The package's own simple dropdown stays as the fallback for other hosts.
  - Choosing the current value again removes it. Changing the surface removes a smoothness the new surface does not offer (the package's tested rule, e.g. asphalt `excellent` → sett).
  - Tooltips show the tag and the photo credit (license from the catalogue).
- **iD side:** field type `surfaceSmoothness` (`modules/ui/fields/surface_smoothness.ts`: lazy-loads the bundle, passes iD's translated value labels, options, titles and placeholders from the schema's `surface` / `smoothness` fields, and renders `uiFieldCombo` into the input row). Radnetz field `surface_smoothness` (keys `surface`, `smoothness`) replaces `surface` + `smoothness` in the road, bicycle road, separate way, footway and cycleway-link field lists. Strings `inspector.surface_smoothness.*` (English only).
- **Open:**
  - Push the package branch, merge it, and release a new version of both packages (the data package on npm is still 0.0.0 GPL with vehicle icons); then switch the fork from `vendor/` to npm.
  - The field label is English ("Surface & Smoothness").
  - Surfaces without a photo (`artificial_turf`, `paved`, `unpaved`, `acrylic`) show empty tiles; maybe sort them last or drop them from the grid.
  - Side keys (`cycleway:right:surface`) are not covered yet; the package already takes custom keys.
  - `sett:length` could become a third step for sett.
  - Crossings still use the plain `smoothness` field in "more fields".

### 25. Related tags below their field (source, note, check date, Mapillary) — ✅ (v1)

Goal: tags about a field's key that have no field of their own (`source:width`, `note:width`, `check_date:surface`, `source:traffic_sign:mapillary`, `cycleway:right:mapillary`) show and can be edited at that field, instead of only in the raw tag editor. Fields we only had for such tags (`source/width`) can go.

**Background: our earlier upstream draft (openstreetmap/iD#12005, branch `related-keys`, March 2026).** Read-only notes; nothing is written there.
- The draft put category icons (calendar, comment, link, …) in the field's label bar; clicking one opened a box with the sub fields below the field. Categories: check_date, note/description, source, conditional, numbered (`:1`, `:2`), other (`cycleway:*`, `footway:*`, …).
- Feedback in the thread:
  - Icons in the label bar mix with delete/info (we clicked delete by accident ourselves); our own follow-up proposed a small line below the field instead.
  - Numbered keys were "really, really confusing"; OpenHistoricalMap adds "Source 1", "Source 2" via the Add Field menu instead. **Ignored here, as decided.**
  - OHM (1ec5) activates sub fields with fixed buttons: predictable, but does not scale past a few kinds; sided and lane fields get complicated.
  - RudyTheDev: good direction, but the key knowledge should live in the tagging schema, not hard-coded in iD; show which input to use for a sub key (`bicycle:surface` needs the `surface` field); make it compact; show that there are more sub keys.
  - Also asked: `cycleway:surface` / `footway:surface` (the "other" category). **Not covered.**
- How this relates: the same core idea (nesting by key, editors below the field), existing values as a line below the field as the thread preferred, and a schema field as the editor where one exists, which answers part of the "which input" point. Title buttons only where the tag is common (curated list), and they only show on hover (feature 23), so they don't crowd the title. Still iD-side rules for four categories, not schema-driven; fine for this fork.

**UX:**
- **Lines below the field** for the related tags that are tagged: `Source: Luftbild 2026 ✎`, `Note: … ✎`, `Checked: 2025-04-01 ✎`, `Mapillary (source): … 👁 ✎` (👁 shows the image in the viewer). The tag `key=value` is the tooltip; long values are cut. Tags the mapper added by hand always show here.
- **Title buttons** before the trash: source (open book, `fas-book-open`), note (speech bubble, `fas-comment`), check date (calendar, `fas-calendar-days`). Only from the curated list below, and only when the field has a value. A button opens the editor(s) of its category, clicked again it closes them; an open one stays visible.
- **Editors** open in one light rounded box below the lines (`--bg-color-2`, border, 6px radius): full fields (the schema's field where one exists: `source/width` for any `source:*:width`, `source`, `note`, `check_date`), each with ✕ (close) and trash (remove the tag). Check dates get iD's "today" button (`input.js`, also for `check_date:*`). The ✎ of a line opens or closes its editor; the line shows the new value while typing.
- An editor closes when its tag is removed; an empty editor stays open until closed (leaving it also reports "removed").
- Selecting a feature again (also the same one) closes all editors: only the lines show.
- Labels name the side (`Source (left)`), or in fields for several keys the key by its schema title (line `Note (Oberfläche)`, editor `Note – Oberfläche`); the field's own key comes first.
- **Surface & smoothness:** the lines sit below the two tiles; an open picker pushes them down.
- **TILDA:** the checklist's "add below" also opens these editors (e.g. `source:cycleway:right:width` below the side width field), focused and with the checklist's colour on the editor title.
- **Mapillary:** images of another field's key show below that field and are left out of the Mapillary images field, which only shows when the feature has images of its own (`mapillary`, `mapillary:forward`, …).
- Which tag belongs to which field: `source:<key>` / `<key>:source`, `note:` / `description:` (both orders), `check_date:` (both orders), and Mapillary keys of the key or its sub keys. With several candidates the most specific field wins (`cycleway:right:traffic_sign` before `cycleway:right`). Numbered keys are ignored.

**Curated button list** (`modules/presets/radnetz_related_tags.ts`): the keys of the fields on our road, bike, footway and crossing presets (50 fields, ~60 keys) matched against taginfo key lists for `source:`, `:source`, `note:`, `:note`, `description:`, `:description`, `check_date:`, `:check_date` (taginfo world and Geofabrik Berlin, 2026-09-30; anonymous reads). Count world / Berlin:

| Button | Keys (world / Berlin) |
|---|---|
| source | `source:maxspeed` 2.8M / 31k, `source:width` 131k / 25k, `source:cycleway:right:width` 5.9k / 5.8k, `…:both:width` 2.1k / 2.1k, `source:cycleway:width` 9.6k / 1.1k, `…:left:width` 0.7k / 0.7k, `source:ref` 403k / 226, `source:name` 1.6M / 102, `source:surface` 65k / 56, `source:width:effective` 55 / 52, `source:access` 13k / 25, `source:sett:length` 26 / 24, `source:bicycle` 19k / 23, `source:sidewalk:*:width` ~40 / ~40, `source:buffer:*` 0 / 26, `source:lanes` 38k, `source:oneway` 22k, `source:lit` 22k |
| note | `note:maxspeed` 5.4k / 22, `note:name` 17k / 152, `surface:note` 10k / 84, `note:lanes` 10k, `note:access` 7.3k, `parking:*:note` ~30 / ~20, `note:traffic_sign` 0.5k, `note:bicycle_road` 37 / 13 |
| check date | `check_date:cycleway` 34k / 4k, `check_date:tactile_paving` 34k / 2.4k, `check_date:surface` 297k / 2.2k, `check_date:smoothness` 42k / 1.5k, `check_date:crossing` 31k / 153, `check_date:lit` 21k / 86 |

- Rule of thumb: Berlin ≥ ~20 or world ≥ ~10k, plus the Radnetz tags (`buffer`, `sett:length`, side widths). The key form is the more common one (`surface:note` over `note:surface`).
- Left out on purpose: `wheelchair:description` (74k, its own meaning), `check_date:ref` (823 in Berlin, odd), `cycleway:*:description` (26 in Berlin; a description, not a note), `source:bridge` / `source:tunnel`, `note:width` (83).
- Later this list could move into the tagging schema (a field property), as the upstream discussion suggested.

**Not done:** "+ Source / + Note" links below the field on hover (tried first: the field jumped); chips in one wrapped row instead of lines; editing inline in the line instead of a full field.

**Code:**
- `modules/presets/related_tags.ts`: pure rules (which tag belongs to which field, button keys, editor templates); tests `test/spec/presets/related_tags.ts`.
- `modules/presets/radnetz_related_tags.ts`: the curated button list.
- `modules/ui/sections/related_tags.ts`: title buttons, lines, editor box.
- Hooks: `preset_fields.js` (assign before the fields render, draw after, `revealField` fallback, status colours also on editors), `ui/field.js` (`hiddenKeys` don't make a field present), `fields/mapillary_images.ts` (leaves out `hiddenKeys`), `tilda_bike_infra.ts` (`fieldKeys` includes the related keys), `fields/input.js` ("today" for `check_date:*`), `fields/surface_smoothness.ts` (keeps the lines below after loading).
- CSS `css/99_related_tags.css`; the general title button style is in `css/99_sidebar_compact.css` (feature 23). Strings `inspector.related.*`. Icons `fas-book-open`, `fas-comment` in `scripts/build_data.js`.
- `source/width` is removed from the field lists and kept as the editor template.
- Pitfall: the editors must not have iD's `wrap-form-field` class. The field list's data join selects every `.wrap-form-field` below it and removed them on each redraw (typing lost the focus after one letter).

**Open:**
- Multi-selection: lines only for tags with the same value on all features.
- Strings are English only ("Source – Breite (Meter)" in the German UI).
- "Other" related tags (`cycleway:surface`, `footway:surface`, `*:conditional`) and numbered keys are not covered.
- `fixme:*` could be a fifth category.
- The source icon (open book) is a proposal; a rosette (`fas-award`) was the other idea.

### 26. Mapillary traffic signs: filter, see the sign, map it — ✅ (v1)

**Goal.** Find, see and map the traffic signs that matter for bike infrastructure and maxspeed, with Mapillary's detected signs ("Traffic signs" layer).

**Research (2026-10-01).**
- *Rapid* (`../Rapid`, upstream `main` 2026-04, no sign branches): detected objects are drawn with preset icons on a dark round marker, yellow when selected; signs without a sprite get a "?" placeholder (Rapid#1518). A selected sign is a selectable feature with a sidebar panel (type, first/last seen). On select, Rapid loads the map feature with `images`, highlights all of them on the map, picks the *nearest* image, zooms the map to show sign and image, and draws only a yellow outline with the sign name. Taken over here: best image, highlight its images, only the selected outline. Not taken: selection as its own sidebar mode (in iD the way stays selected while we look at signs, which is what we want for mapping).
- *iD today*: clicking a sign loads `/<map_feature>/detections` and opens the image of the *first* detection. The viewer outlines *every* object Mapillary detected in that image (cars, trees, buildings) in white; the sign is not centered or zoomed.
- *API* (sign `1014865383456284`, `regulatory--turn-right-ahead--g1` at Richardplatz): `/<id>?fields=images` lists 21 images (2024-08 … 2026-08, all 360°); `/<id>/detections` gives an outline for only 3 of them (the 2024 ones). Image dates, compass angle and pano flag come in one batch request (`/?ids=a,b,…&fields=captured_at,compass_angle,is_pano,creator`). So for most images the sign position must be computed from the image location, its compass angle and the sign location.
- *vizsim/mapillary_trafficsigns*: per-state GeoParquet of all Mapillary sign detections in Germany, and campaign mappings for 237, 240, 241, 244.2, 1022-10, 1000-33, 274-30, 350. Berlin (2026-09-30): 470k detections, 642 values; most frequent `no-stopping` 90k, `general-directions` 71k, `no-parking` 29k, `maximum-speed-limit-30` 26k, … — the bike and maxspeed signs drown in parking and direction signs without a filter.
- *Traffic sign tool*: has no Mapillary mapping. The mapping lives in this fork for now (bike, maxspeed, access); it is a plain per-country table that can later move into the tool's country data.

**What it does.**
1. **Group filter** — chips below "Traffic signs" in the Photo Overlays pane: *Bike*, *Speed*, *Access & oneway*, *Other*; several can be on, each with the number of loaded signs in view. They filter the map markers and the outlines in the viewer. URL `photo_sign_groups=bike,speed`; project default `iD.mapillaryConfig({ signGroups })`, for Radnetz `bike, speed, access` (hides *Other*, 79 % of the Berlin detections). Groups match the sign name (`bicycl|bike|cyclist|cycling|pedestrians-only`, `speed|living-street|built-up-area`, oneway / no entry / closed / bus only …), so all design variants are covered. Berlin: bike 24k, speed 48k, access 27k, other 371k.
2. **Click a sign** → loads the map feature with all its images, their dates and the outlines, and shows the newest day's best image (from within the age filter if possible). Best = an image where the sign is outlined, then the one nearest to ~10 m (an image right below the sign does not show it).
3. **Turned to the sign** — the view is centered and zoomed on the sign's outline in that image: the outline Mapillary linked to the sign, else the image's own detection with the same sign value (this is the box the viewer draws; it exists for almost every image; with several, the one nearest to the computed estimate — the estimate alone was up to 60° off in a 360° image, so it is not used as a filter). That outline is drawn yellow with its name. Without an outline the position is computed: 360° images from the viewer's projection of the sign location (x) and the distance (height); flat images with a pinhole model from focal length, compass angle and the camera pitch (from Mapillary's rotation), zoom ≤ 2 because sign locations are a few meters off.
4. **Only sign outlines** in the viewer while the "Map features" layer is off (an image has ~500 detections: road, cars, trees …), and only those of the chosen groups.
5. **The selected sign on the map**: yellow frame (class `mly-sign-selected`; iD clears `.selected` on every redraw) and a dotted yellow line from the shown image's marker via its computed position (small yellow dot) to the sign.
   - Image positions: Mapillary has the camera's GPS position (`geometry`, `originalLngLat`) and a computed one (`computed_geometry`). iD's markers and viewer use the original one; Rapid switched to computed and back to original (facebook/Rapid#1582: computed matches the detections better, but is sometimes far off). Decided (2026-10-01): iD's regular image display stays as it is; the sign line shows both. The view math uses the computed position, because Mapillary locates the signs from it.
6. **Sign bar** above the photo viewer (over the map, so the image stays free):
   - Mapillary icon + the German sign's icon and name from the traffic sign tool (lazy bundle), e.g. "DE:237 Radweg"; unknown signs show Mapillary's name ("Turn right ahead"). Each icon has a tooltip with its source ("Detected by Mapillary: regulatory--…" / "German traffic sign this detection means …: DE:274-30 …").
   - One button per capture day, newest first; the shown day is yellow, clicking it again steps through that day's images. Each button has two lines, month and year ("Aug. 2026") over the age ("vor 2 Monaten", `Intl.RelativeTimeFormat` narrow: days below 45 days, months below 2 years, then years), and an image icon with the count, "2/24" for the shown day (`dayLabels` in `sign_view.ts`, icon `far-image`); tooltip: full date, users, 360°, "image 2 of 24".
   - With one way selected: tag buttons (speed signs: `maxspeed=30 + source:maxspeed=sign`; zones `DE:zone30/20`), then per possible sign a row of three `key=value` buttons — plain, `:forward`, `:backward` of one base key (no key dropdown, decided 2026-10-01) — and a source button `source:<key>:mapillary=1586…` (the image id, shortened; appended to an existing list). The sign buttons write only the sign (supplementary signs are appended: `DE:239,1022-10`). Several possible signs (241-30 / 241-31, zone 30 / 20) get one row each.
   - Direction: Mapillary's `aligned_direction` is where the sign's face points; the traffic it applies to travels the opposite way. Compared with the way's direction at the nearest segment (±60°) it gives "↑ forward" / "↓ backward" (shown in the bar); signs across the way get none.
   - Base key: for bike signs the sign key of the road side the sign stands on (from the way geometry) if that side has a bike lane, else a sidewalk (same side rules as feature 27); otherwise `traffic_sign`. The key that fits the sign's direction is outlined yellow ("suggested"): on `traffic_sign` the direction (plain when the way is one-way that way), on the sides the plain key. The source button goes to the suggested key.
   - While a sign is selected, auto-show (feature 19) does not replace its image when a way is selected.
   - Speed signs with a direction offer `maxspeed:forward=30` (+ `source:maxspeed:forward=sign`) first, then `maxspeed=30`. Tag buttons show the main tag; the tooltip lists all.
   - The write buttons are a group of their own below the days (line above). Each shows what it would change: `✓ maxspeed=30` (green, disabled) when everything is tagged already, `maxspeed=50→30` (orange, tooltip "replaces 50") when another value is tagged; sign buttons the same without the key (`DE:240→DE:237`). Logic in `changeLabel` (`sign_tagging.ts`).
   - One close (decided 2026-10-01): the viewer's ✕ closes the image and deselects the sign (bar, frame and line go away); the bar has no ✕ of its own. Clicking the selected sign on the map again deselects it and keeps the image.

**Mapping table** (`modules/mapillary/sign_groups.ts`, per country later): 237, 240, 241-30/-31 (by symbol order), 244.2 (`end-of-bicycles-only--g2`, vizsim), 239, 254, 1022-10, 1010-52, 1000-33 (`complementary--bike-route`, vizsim), 245(+1022-10), 357-50, 138, 274-<n>, 278-<n>, 274.1(-20), 274.2(-20), 325.1/.2, 310/311, 267, 220-10/-20, 250, 260, 251, 253, 255, 259, 245.

**Code.** Pure: `modules/mapillary/sign_groups.ts` (groups, meanings, appending signs), `sign_view.ts` (images by day, best image, view from outline / location / flat camera, camera pitch), `sign_tagging.ts` (target keys, default key, side of the way, tag changes); tests in `test/spec/mapillary/sign_*.ts`. State: `modules/mapillary/sign_select.ts` (API calls, selection, turning the viewer). UI: `modules/ui/mapillary_sign_bar.ts`, `modules/ui/mapillary_sign_groups.ts`, CSS `css/99_mapillary_signs.css`, strings `photo_overlays.sign_groups.*`, `mapillary_sign_bar.*`. Hooks in upstream files: `svg/mapillary_signs.ts` (filter, click, selected class, link line, outline filter), `services/mapillary.ts` (`getViewer`, `setOutlineFilter`, `decodeDetectionOutline` taken out of `makeTag`), `renderer/photos.js` (`signGroups`), `ui/sections/photo_overlays.js` (chips), `ui/init.js` (bar), `traffic_sign/recommender.ts` (`loadedSignDescriber`).

**Tested** (browser): Richardplatz (turn right sign, 21 images, 6 days; "Radfahrer frei" written to `traffic_sign` + `source:traffic_sign:mapillary`, undone), Karl-Marx-Straße (237 → default `cycleway:right:traffic_sign`; Tempo 30 → maxspeed button; flat and 360° images centered on the sign).

**Open:**
- Strings English only. The bar's look on small viewers (3 rows) is open for review.
- The images of the sign could be highlighted on the map (Rapid does).
- The mapping table could move into the traffic sign tool's country data.
- `regulatory--bicycles-only` may also be the bicycle road sign (244.1) — unchecked.

### 27. Traffic sign fields for the way, the bike lanes and the sidewalks — ✅ (v1)

**Goal.** Edit every traffic sign key of a road in the fields, also the ones that are not tagged yet: the way's sign with its directions, and the signs of the bike lanes and sidewalks per side (like the cycleway field has a combo per side).

**Usage in Germany** (taginfo Geofabrik, 2026-10-01): `traffic_sign` 675k, `:forward` 28k, `:backward` 23k; `cycleway:right:traffic_sign` 13.9k (`:forward` 289, `:backward` 187), `cycleway:left:traffic_sign` 4.6k (58 / 256), `cycleway:both:traffic_sign` 4.5k (0 / 0), `cycleway:traffic_sign` 1.3k; `sidewalk:right:traffic_sign` 3k (156 / 109), `sidewalk:left:traffic_sign` 2.1k (58 / 124), `sidewalk:both:traffic_sign` 1k.

**What it does.** Three fields, each a list of rows; every row is the traffic sign field of its key with its tag suggestions (feature 2):
1. **Traffic sign** (the preset's `traffic_sign` field, now a group with `keys` `traffic_sign`, `:forward`, `:backward`): the plain row always; a direction row when tagged or added with "+ ↑ forward" / "+ ↓ backward" (ways only).
2. **Traffic sign (bike lanes)**: shown on ways with a bike lane on a side (`cycleway:<side>`, `cycleway:both`, `cycleway` not `no`/`none`/`separate`): one row per side (`Both sides` when both sides are tagged together and no sign is tagged per side), plus every tagged `cycleway…traffic_sign…` key (also directions and `cycleway:traffic_sign`).
3. **Traffic sign (sidewalks)**: the same for sidewalks, for every side with a mapped sidewalk (`sidewalk=both|left|right`, `sidewalk:<side>`; decided 2026-10-01: a sidewalk can have `DE:239` without bike tags).
- Directions on the sides are rare, so they show only when tagged (decided by default; nobody objected).
- The two side fields follow the `traffic_sign` field in the field list. Other tagged sign keys (e.g. on presets without a sign field) still get a single field each, as before.
- The Mapillary sign bar (feature 26) uses the same side rules for its base key.

**Code.** `modules/traffic_sign/sign_field_rows.ts` (pure: `parseSignKey`, `sidesWith`, `signRows`; tests `test/spec/traffic_sign/sign_field_rows.ts`), field type `trafficSignGroup` in `modules/ui/fields/traffic_sign_group.ts` (one `uiFieldTrafficSign` per row), `modules/presets/traffic_sign_fields.ts` (`traffic_sign` becomes the group), `modules/ui/sections/traffic_sign_inspector_fields.ts` (side group fields, signature), hook in `ui/sections/preset_fields.js` (placement after `traffic_sign`, group keys count as shown), CSS `css/99_traffic_sign_group.css`, strings `inspector.traffic_sign_group.*`. `traffic_sign/forward|backward` are no longer separate "more fields" of the Radnetz presets.

**Open:**
- A side row is shown next to its direction rows (`cycleway:right:traffic_sign` empty + `…:forward` tagged).

**Redesign 2026-10-05 (way field: switches instead of rows with labels on the left).**
- History check: the package (`@osm-traffic-signs/id-field`) never had direction logic; rows, labels and "+ forward" buttons were all ours (`traffic_sign_group.ts`). The narrow boxed rows came from a class clash: our rows used `.traffic-sign-row`, which the package styles (flex, border). Our classes are now `traffic-sign-group-*`.
- Layout: every row is the full-width sign field again; its label is a thin strip above it. With only the whole way's row there is no strip (the look before feature 27). Same for the bike lane and sidewalk fields.
- Switches in the label of the way's field: **Ganzer Weg | Je Richtung** (EN "Whole way | Per direction"; ways only, or when a direction is tagged). "Whole way" is on by default, "Per direction" only when a direction is tagged. A switch whose rows have a sign cannot be switched off; one of the two is always on. Replaces the "+ ↑ forward" / "+ ↓ backward" buttons. The tooltips explain the keys ("whole way" = `traffic_sign` without a suffix).
- Wording: "Whole way" instead of "both"; rows "↑ In Wegrichtung (forward)", "↓ Gegen die Wegrichtung (backward)".
- Merging (`mergeWaySigns`, like `:left` + `:right` → `:both`): forward = backward (whole way empty or the same) → whole way; whole way + one direction with the same sign and no other direction → whole way. Not merged: whole way = forward with a different backward.
  - The merge is a **display** first: selecting a way never changes tags. The tags follow with the next change of the whole way's sign (`waySignChanges` removes the redundant direction tags).
  - Once the user switches "Per direction" on or edits a direction row, the rows show the tags as they are and nothing is merged for this selection. Reason: signs are added one by one; forward `A` + backward `A` on the way to `A,B` / `A,C` must not collapse in between. Next time the way is selected, equal signs show merged.
- German strings for all group labels (`inspector.traffic_sign_group.*`).
- Tested in the browser: empty way, whole + same backward, forward = backward, different directions, whole + other backward; switches on/off and their locks; removing the sign of a merged display removes both direction tags.
- 2026-10-05, second round (review by Tobias):
  - Only one switch, **Je Richtung** ("Per direction"); the whole way's row is always there. It is locked on while a direction is tagged.
  - Row labels are plain text in the text color above the row (no strip, no borders, no gray). The direction labels have an arrow that points along the way as it is on the map, like the side arrows of the directional combo (same glyph, `geoWayDominantHeadingInViewport`; hidden when the visible part of the way is too curved; follows map moves).
  - One look for switched-on buttons in the sidebar (`css/99_z_sidebar_toggle.css`): a tint of the link color with a thin ring instead of a filled blue button or the barely visible `--active-bg-color`. Used by the "Je Richtung" switch, the measuring tape button, the open related-tags editor and the TILDA edit button.
- Open: explain the merge in the field's info (ⓘ) panel too (now only in the switch tooltips); the same merge for the directions of the side keys.

### 28. Merge a cycleway and a footway into one path — ✅ (v1)

**Done (2026-10-01):** built as specified below.
- Code: `modules/sidepath/merge_tags.ts` (pure: `partKind`, `combinedPathTags`, `mergeSelection`, `reverseTags`, `commonTags`), `modules/actions/merge_sidepaths.ts`, `modules/operations/merge_sidepaths.ts` (hooked into `modules/modes/select.js` after the extract entries), `distanceToLineMeters` in `modules/sidepath/offset_line.ts`, `loadedSignJoiner()` in `modules/traffic_sign/recommender.ts`, CSS in `css/96_extract_sidepath.css`, strings `operations.merge_sidepaths.*`. Tests: `test/spec/sidepath/merge_tags.ts`, `test/spec/actions/merge_sidepaths.ts`.
- Feature 17's variant C now calls `combinedPathTags` too. Changes for C: the signs of both sides are joined (`DE:237;239`), the sidewalk's other keys (e.g. `kerb`) are kept, `traffic_mode:<side>=foot` is dropped, and the road gets `use_sidepath` when either side's sign designates bikes.
- Different from the plan:
  - Several cycleways **and** several footways: the entry is shown disabled with the reason, not hidden.
  - **Side by side check (new):** every node of each way must be within 25 m of a way of the other kind, else disabled ("… don't run side by side"). Found in the browser test: a sidewalk that turns the corner had a matching length.
  - Equally old ways (both new, or the same changeset): the footway stays.
  - With one way plus several pieces there is nothing to pair; when the single way stays, differing other keys of the pieces take the first piece's value.
  - A deleted way that runs against the surviving one has its tags turned first (`:forward`/`:backward`, `:left`/`:right`, `oneway`), so a cycleway with `oneway=yes` against the footway gives `oneway:bicycle=-1`.
- Tested in the browser on Torstraße (test edits undone, nothing uploaded): extracted cycle track (DE:237) + a sidewalk piece (DE:239) → `highway=path`, `traffic_sign=DE:237;239`, `cycleway:surface` / `footway:surface`, one undo step; the real sidewalks there were refused for length (116 m against 81 m) until split, and the corner sidewalk for "side by side".
- Open: the preview colors (kept way magenta, deleted way dashed red) were changed after the last screenshot and not looked at again; under the selection halo the preview was hard to see. Strings English only. Tooltip does not list the resulting tags.

**Changed (2026-10-08): a way that is too long is cut, and half of the ways in view is enough.**
- Two ways (one cycleway, one footway) whose lengths differ by more than 15 m or 20 %: the entry is no longer disabled. The longer way is cut where the shorter one ends, the part alongside is merged, and what runs on stays as it is (a footway stays a footway). Usually that is the sidewalk, cut to the length of the cycleway; a cycleway that is too long is cut the same way.
  - The cut is at the point of the longer way nearest to each end of the shorter one. A node of the longer way within 3 m is used for it, else a new node is added. No cut at an end where the longer way runs on for less than 5 m.
  - The tooltip says which way is cut. One undo step for cut and merge.
  - More than two ways with lengths that differ too much: still disabled ("… Split the ways first, or select one cycleway and one footway"), because there is no clear place to cut.
  - The side by side check (25 m) only looks at the part that is merged, not at what runs on.
- "Not enough of it is visible": extract (feature 17) and merge now need 50 % of the ways in view instead of 80 %.
- Code: `planCut` / `cutWay` in `modules/actions/merge_sidepaths.ts`, `projectOnLine` in `modules/sidepath/offset_line.ts`, `cut` in `mergeSelection`. Tests: four cut cases in `test/spec/actions/merge_sidepaths.ts`.
- Checked in the browser by script (test edit undone): a new 79 m cycleway beside the middle of a 263 m sidewalk (w1228562470) → a 79 m `highway=path` with the tags of both, and two footways of 77 m and 107 m left over; the entry was enabled and its tooltip named the cut.
- Not checked: the hover preview (it still draws the whole long way as "stays"), and clicking the menu entry by hand.

**Goal.** Still the goal of feature 17: make it as easy as possible to turn infrastructure mapped on the centerline into its own geometry. Often the cycle track should not end up as its own `highway=cycleway` but together with the sidewalk as one `highway=path` ("Geh- und Radweg"). Feature 17's variant C does that only when both the track and the sidewalk are still tags on the road. In Berlin the sidewalk is usually a separate way already, so this needs a second step.

**Decided (2026-10-01): two steps, not one.**
1. Extract the cycle track from the centerline (feature 17, variant A).
2. Select the cycleway and the footway(s) and run a new operation that merges them into one path.

Rejected: finding the sidewalk automatically at the right-click on the centerline (looking at 90° from a long road segment). Several sidewalk pieces can run along one road way, and their lengths don't match the road's pieces, so there is no reliable pairing. The mapper picks the ways.

#### The operation

- "Merge into a foot and cycle path", in the edit menu next to the extract entries.
- Offered when the selection is two or more ways, with at least one **bike part** (`highway=cycleway`, or `highway=path` with `bicycle=designated` and no `foot=designated`) and at least one **foot part** (`highway=footway`, or `highway=path` with `foot=designated` and no `bicycle=designated`), and nothing else.
- More than two ways (decided 2026-10-01): always **one** way of one kind and several of the other (one cycleway + several footways, or one footway + several cycleways). Several of both kinds is not offered; that pairing is too complex.
- Lengths (decided 2026-10-01): they only have to match within reason. The single way's length is compared with the summed length of the other kind's pieces; up to 15 m or 20 % difference (whichever is larger) is fine. Beyond that the entry is disabled with "The lengths differ too much. Split the ways first." The numbers are a first guess to tune in the browser.
- When the single way survives and the pieces of the other kind differ in a part key (e.g. two footways with different `surface`), the entry is disabled with "… have different surface. Split the <way> first.", because one way can only carry one value per part.
- Hovering the entry previews which ways stay (highlight) and which go (dashed), like the extract preview. One undo step. The surviving ways stay selected.

#### Which geometry stays

- The **older** kind wins: all bike pieces or all foot pieces stay, the other kind is deleted.
  - A way that is already saved beats a way created in this session (negative ID).
  - Among saved ways the one with the older changeset wins (decided 2026-10-01): the lower `changeset` ID of the loaded version, which iD has on every entity. That is the age of the way's last edit, not of its creation; iD does not load the history.
  - With several pieces per kind, the kind that has the oldest piece wins.
- Each surviving piece gets the merged tags, using the piece of the other kind that runs alongside it (the nearest one at the piece's middle).
- No splitting or joining in v1: the surviving pieces keep their nodes and their junctions. Nodes of a deleted way that other ways use stay; its other nodes are deleted.
- Relations of a deleted way (e.g. a bicycle route): the membership moves to the surviving piece(s) alongside, same role, if they are not members yet. In the usual flow this does not come up: the cycleway was just extracted (unsaved, no relations) and loses. It matters when two old ways are merged.

#### Tags of the merged path

The same rules as variant C of feature 17; the shared part of `planExtraction` moves into one function that both use.

- `highway=path`, `bicycle=designated`, `foot=designated`.
- `segregated`: `no` with sign 240, `yes` with sign 241, otherwise `yes` (two parts were mapped).
- `is_sidepath=yes` when a part has it or the foot part is `footway=sidewalk`. `footway=sidewalk` itself is dropped.
- **Part keys** (`surface`, `smoothness`, `width`, `surface:colour`, `sett:length`, and their `source:` / `note:` / `check_date:` keys):
  - both parts have the same value → the plain key (`surface=asphalt`);
  - the values differ → no plain key, but `cycleway:surface` and `footway:surface`;
  - only one part has a value → only that part's prefixed key (a plain key would also claim it for the other part).
  - `width`: `cycleway:width` and `footway:width`; the plain `width` is the sum when both are known.
- **Other keys** (`lit`, `name`, `incline`, …): the same value or only on one part → kept; different values → the surviving way's value, and the flash message lists the dropped ones.
- `oneway`: the path gets `oneway=no`; the bike part's `oneway` becomes `oneway:bicycle`.
- `traffic_sign` (decided 2026-10-01): the signs of both parts in one value, joined by the traffic sign tool (`trafficSignTagToSigns` on each value, then `signsToTrafficSignTagValue` on the bike part's signs followed by the foot part's): the country prefix once, `;` between signs, `,` before supplementary signs.
  - `DE:237` + `DE:239` → `DE:237;239`; `DE:237` + `DE:239,1022-10` → `DE:237;239,1022-10`.
  - The same sign on both parts (`DE:240` + `DE:240`) is written once. A sign on one part only is kept as it is.
  - `traffic_sign=none` on one part and a sign on the other → the sign; `none` on both → `none`.
  - Direction keys (`traffic_sign:forward` / `:backward`) are merged per key the same way; a deleted way that ran against the surviving one swaps forward and backward.
- `traffic_mode:<side>` that names the other part is removed (decided 2026-10-01): `traffic_mode:left|right|both=foot` on the bike part and `=bicycle` on the foot part. On old data it was only there to say that the two ways are in fact one space, which the path now says itself. Other values (`motor_vehicle`, `parking`, …) stay, and so does the neighbour on the far side.
- Mapillary keys (feature 19): the IDs of both parts, joined with `;`.
- The road is not changed (it already has `…=separate` and `use_sidepath` from the first step).
- Check after the merge: TILDA must read the same bike attributes from the path as from the cycleway before (it reads `cycleway:*` on a path), as tested for variant C.

#### Code plan

- `modules/sidepath/merge_tags.ts` (pure): `partKind(tags)`, `mergeOptions(ways)`, `survivingKind(ways)`, `mergedPathTags(bike, foot)`; tests for every rule above. The split-key logic is shared with `extract_tags.ts`.
- `modules/actions/merge_sidepaths.ts`: pairs the pieces, changes the tags, moves relation memberships, deletes the other ways.
- `modules/operations/merge_sidepaths.ts`: the menu entry with preview and tooltip, hooked in next to the extract operations in `modules/modes/select.js`. Strings `operations.merge_sidepaths.*`.

#### Open questions

1. ~~Lengths that don't match.~~ **Decided (2026-10-01):** allowed within reason, otherwise the mapper splits first (see "The operation").
2. ~~Which way is "older"?~~ **Decided (2026-10-01):** by changeset age; no second menu entry.
3. ~~A value on one part only?~~ **Decided (2026-10-01):** the prefixed key (`cycleway:surface`), no plain key. Equal values on both parts merge into the plain key (`surface`), which then stands for both.
4. ~~Signs 237 + 239 on the two parts?~~ **Decided (2026-10-01):** one `traffic_sign` joined by the tool's rules, `DE:237;239`.
5. ~~Keep the one-step extract (feature 17, variant C)?~~ **Decided (2026-10-01):** yes. It is already built: a road with `sidewalk=right` + `sidewalk:surface=sett` and `cycleway:right=track` + `cycleway:right:surface=asphalt` offers "Extract right cycle track and sidewalk as one path" and gives `highway=path` with `cycleway:surface=asphalt` and `footway:surface=sett`.
   - To do with this feature: variant C uses the same shared tag function as the merge, so both give the same result. The one change for C: the signs of both sides are joined into one `traffic_sign` (today C takes the cycle track's sign, else the sidewalk's).

### 29. Internal notes from TILDA in iD — 🟡 (built; check with a real login open)

**Goal.** Mappers of the project share comments and feedback internally, on the map, without public OSM notes. TILDA already has internal notes with folders. iD shows the notes of one TILDA folder like OSM notes: read, write a new one, comment, resolve. The TILDA region and the folder are fixed in this project's config.

#### Status quo in TILDA (read 2026-10-01, `~/Development/FMC/tilda-geo`, branch `develop`)

- **Data** (`app/prisma/schema.prisma`): `Note` (subject, body, latitude, longitude, `resolvedAt`, author, one `folderId`), `NoteComment` (body, author), `NoteFolder` (name; many-to-many with `Region`, so one folder can show in several regions).
- **Logic** (`app/src/server/notes/`): everything we need exists as functions: `getNotesAndCommentsForRegion` (GeoJSON of one folder), `getNoteAndComments`, `createNote`, `createNoteComment`, `updateNoteResolvedAt`, `updateNote`, `deleteNote`, folder functions.
- **Who may:** only region members and admins (`canAccessMemberModeForRegion`, `authorizeRegionMemberByRegionSlug`), also on public regions; the folder must belong to the region (`assertFolderInRegion`). Edit / delete only by the author.
- **How it is reached:** only as TanStack Start server functions (`notes.functions.ts`), TILDA's internal RPC for its own frontend. There is **no HTTP API** for notes (`/api/notes/$regionSlug` only has the `download` child). The CORS helper (`server/api/util/cors.ts`) allows `GET` from `*` only.
- **Auth:** Better Auth with OSM OAuth2 as the only login (`server/auth/auth.server.ts`). A TILDA user **is** an OSM user: `User.osmId` (unique), found or created at login from OSM's `/user/details.json`. The session is a cookie on the TILDA domain. The only token auth is `AdminApiToken` (hashed bearer tokens, admins only, for the admin API).

#### Do iD and TILDA share the auth?

- **The same identity, not the same credential.** Both log in with OSM OAuth2, so both know the same OSM user id. But each has its own OAuth client: iD holds an OSM access token of iD's client (scopes `read_prefs write_prefs write_api read_gpx write_notes`); TILDA has its own client and gives the browser a session cookie for the TILDA domain.
- iD (on Netlify / localhost) cannot use TILDA's cookie: another origin, browsers block third-party cookies, and TILDA sends no CORS headers for it.
- **Bridge that works:** iD's OSM token proves who the user is. A new TILDA endpoint takes it as `Authorization: Bearer`, asks OSM `/api/0.6/user/details.json` with it (the same call TILDA makes at login), gets the `osmId`, finds the `User`, and then runs the normal member check. No new login for the mapper.
- **Conditions:** the mapper has logged into TILDA at least once (so the `User` exists) and is a member of the region; else a clear 403 ("log into TILDA once" / "ask for access"). iD and that TILDA must use the same OSM server (production OSM; check what staging uses).

**Feasible: yes,** but TILDA has to get a small external API first. Nothing can be built on the iD side against today's TILDA.

#### Options for the TILDA side

| | How | Verdict |
|---|---|---|
| A | Every request carries iD's OSM token; TILDA checks it with OSM (cached a few minutes by token hash) | simplest; the OSM token (with `write_api`) travels on every call |
| **B** | Token exchange: iD sends the OSM token once to `POST /api/external/session`, TILDA checks it and returns its own short-lived bearer token (hashed in the DB, like `AdminApiToken`) for the notes endpoints | **recommended**: the OSM token is sent once, TILDA's token can only do notes, can be revoked |
| C | TILDA as its own OAuth provider with a login popup in iD | cleanest separation, most work, a second login |
| D | TILDA's cookie cross-site (`SameSite=None` + CORS with credentials) | fragile: third-party cookies are blocked more and more |

In all cases TILDA never stores the OSM token, and the endpoints get a CORS allow-list of our iD origins with `Authorization` and `POST`.

#### What iD needs from the API

- `GET` notes of the folder as GeoJSON (optional `bbox`, `status`), with subject, status, author name, comment count.
- `GET` one note with body and comments (author names, dates).
- `POST` a note (subject, body, lon/lat), `POST` a comment, `PATCH` resolved / reopened. Edit and delete can stay in TILDA.
- Answers that tell "not logged in", "not a TILDA user yet", "not a member" apart.

#### iD side (after the API exists)

- Config in `index.html`: `tildaNotes: { origin, regionSlug, folderId }`.
- A layer and an editor like iD's OSM notes (`modules/svg/notes.js`, `modules/ui/note_editor.js`, the notes part of `modules/services/osm.js`) as new TS files: `modules/services/tilda_notes.ts`, `modules/svg/tilda_notes.ts`, `modules/ui/tilda_note_editor.ts`, an entry in the Map Data pane, own pin color so they are not taken for OSM notes.
- The OSM token comes from iD's logged-in connection; without a login the layer asks to log in.
- A link "Open in TILDA" on each note.

#### Prompt for the TILDA session

```
We want mappers to read and write TILDA's internal notes from our iD editor fork
(worktree /Users/tordans/Development/OSM/iD--radnetz-berlin, branch radnetz-berlin,
plan in its WORKDOC.md, feature 29 "Internal notes from TILDA in iD"). Read that section first.

Work in a new worktree of tilda-geo (suggested: ../tilda-geo--external-notes-api, branch
external-notes-api from develop). Do not change the iD worktree.

Task: an external HTTP API for internal notes, used cross-origin by iD.

1. Auth by OSM identity (option B of the WORKDOC):
   - POST /api/external/session with "Authorization: Bearer <OSM OAuth2 access token>".
     Verify the token by calling OSM /api/0.6/user/details.json (reuse getOsmApiUrl and the
     parsing in server/auth/auth.server.ts), map osmId to our User. Never store or log the OSM token.
   - Return a short-lived TILDA bearer token (random, only its hash in the DB, expiry, scope
     "notes"), modelled on AdminApiToken / server/admin/adminApiTokens.server.ts.
   - Distinct errors: invalid OSM token (401), OSM user has no TILDA account yet (403
     "no_tilda_user"), later per region: not a member (403 "not_member").
2. Notes endpoints under /api/external/notes/$regionSlug/$folderId, authorised with that token,
   reusing the existing functions in app/src/server/notes (they take Headers and build the
   session from the cookie; refactor so the session can also come from the token, without
   weakening the member checks or the audit context):
   - GET list as GeoJSON (optional bbox, status)
   - GET /$noteId with body and comments
   - POST note, POST /$noteId/comments, PATCH /$noteId (resolved true/false)
3. CORS for these routes only: an allow-list of origins from env (our Netlify preview and
   http://127.0.0.1:8080 for dev), methods GET/POST/PATCH/OPTIONS, header Authorization;
   answer the preflight.
4. Tests like the existing notes tests (member vs non-member, folder not in region, expired
   token, wrong origin), and a short doc of the API (request/response examples) that the iD
   side can build against.

Before coding: check my assumptions in the WORKDOC against the code, tell me which OSM server
staging and production use (iD uses production OSM), and say if Better Auth already offers a
bearer/API-key plugin that fits better than a new token table. Then propose the plan.
```

**Decided (2026-10-02):** option B (token exchange); iD reads, writes, replies, resolves and reopens. Region `infravelo`, folder `12`, on **staging** for now (note folders are not on production yet). The feature is only for this fork, never proposed elsewhere.

#### Implementation (2026-10-02)

TILDA's API is live on staging (tilda-geo `docs/External-Notes-API.md`, commit 732855d63): `POST /api/auth/osm-token` and `/api/notes/{regionSlug}/{folderId}`.

- **Two kinds of notes, side by side.** Both layers are in Map Data ▸ Data layers and can be on at the same time.
  - "OpenStreetMap Notes (public)": iD's notes, unchanged, off by default.
  - "TILDA Notes (internal)": on by default; turning it off is remembered (`tilda-notes.enabled` in the browser storage).
- **Telling them apart.**
  - Pins: TILDA's teal. Open = teal with a white `?`, resolved = white with a teal check, new = light teal with a plus. OSM notes keep red / green.
  - Toolbar: one "add note" button per enabled layer, labelled "OSM" and "TILDA" (the label stays on a narrow toolbar). Shortcuts `N` (OSM) and `⇧N` (TILDA).
  - Editor: title "TILDA note" and a teal banner "Internal note: only members of this region in TILDA can see it."
- **Editor, aligned with TILDA.**
  - A note has a subject and a text (Markdown); both are required for a new note, as in TILDA's form.
  - Below: the replies (author, date, Markdown), a reply box, "Save reply", "Mark as resolved" / "Reopen" (with a reply typed: "Reply and resolve" / "Reply and reopen").
  - Status words as in TILDA: open / resolved (offen / erledigt).
  - Footer link "Open in TILDA": the folder's notes page, centered on the note. Edit, delete and folders stay in TILDA.
  - Saved at once in TILDA, not with the OSM changeset.
- **Access problems are said in words,** in the layer list and in the editor: not logged in to OSM (with a login link), no TILDA account yet, not a member of the region (with a link to TILDA), TILDA not reachable.
- **Markdown is rendered safely:** raw HTML is shown as text, only http(s) and mailto links, images become links.
- **URL:** a selected TILDA note is in the hash as `id=tilda-note/<id>` (OSM notes: `id=note/<id>`). Opening such a link reads the note, turns the layer on and selects it; without `map=` it also moves there. Without access nothing is selected (`modules/tilda_notes/hash.ts`, hooks in `behavior/hash.js`).
- **Loading:** the whole folder in one request, refreshed at most once a minute while the map moves and right after a write. A note's text and replies are read when it is selected. Pins show from zoom 10.

Config (`index.html`, before `context.init()`): `iD.tildaNotesConfig({ origin, regionSlug, folderId })`. Without it the feature is off.

Code: `modules/tilda_notes/` (config, note class, Markdown), `modules/services/tilda_notes.ts`, `modules/svg/tilda_notes.ts`, `modules/modes/add_tilda_note.ts`, `modules/modes/select_tilda_note.ts`, `modules/ui/tilda_note_editor.ts`, `css/95_tilda_notes.css`. Small hooks in upstream files: `ui/tools/notes.js` (one button per layer), `ui/top_toolbar.js`, `ui/sections/data_layers.js`, `ui/sidebar.js` (hover), `behavior/select.js`, `behavior/hover.js`, `renderer/map.js`, `svg/layers.ts`.

**Tested:** unit tests (config, note, Markdown); in the browser against a mocked API in the page (list, read, reply, resolve, new note, hover, layer off, not-logged-in hint); the staging API with curl (preflight for `http://127.0.0.1:8080`, `401 missing_token`).

**Not tested yet:** the real round trip with an OSM login (the test browser has none); opening a `tilda-note/` link on a fresh page load (the mock only exists after the load; selecting by changing the hash was tested). First thing to check after logging in at `http://127.0.0.1:8080`.

**Left out:** dragging a new note before saving (click again instead), editing or deleting notes.

**Open**
1. Are all project mappers members of the `infravelo` region in TILDA? Others get the "not a member" hint.
2. Switch to production: change `origin` (and the folder id, if it differs) in `index.html` once note folders are on production.
3. A new iD origin (another deploy preview number, a production URL) must be added to `externalApiOrigins` in tilda-geo.
4. "Open in TILDA" opens the folder at the note's place, not the note itself (TILDA's URL for a selected note was not looked into).

### 30. Right sidebar buttons: Map Display and Photos panes — ✅

Goal: the Map Data pane was crowded (datasets, photos, lens, feature filter, panel toggles). Each button is now one job.

- **Buttons, top to bottom:** Background, Map Data, Map Display (new), Photos (new), Issues, Preferences, Help. Locate stays above them. (Help, Locate and Zoom-to-selection are hidden in this project, see below.)
- **Map Data** (`U`): "which data is loaded". Data layers (OSM, OSM notes, TILDA notes, Osmose), Custom data layers, Overlays, Live edits nearby.
  - iD's old single custom-data slot only shows while it holds data (e.g. a GPX file dropped on the map). Custom data layers replaced it (feature 4).
- **Map Display** (`⇧J`, palette icon): "how OSM is drawn". Style options, Lens, Map features (still collapsed).
  - The "hidden features" hint in the footer and in the preset list now opens and names this pane.
- **Photos** (`J`, camera icon): the former Photo overlays section, unchanged inside (services, Mapillary filters, sign groups, local photos). It is the pane's only group, so it has no open/close header (like the Issues pane).
- **Preferences ▸ Panels** (new section): minimap, background, location, history and measurement panel (the way table switch moved on to Data layers, see below). They were at the bottom of the background list and of Data layers. Their shortcuts are unchanged.
- **Button tooltips:** pane name as heading, one sentence on what is inside, the shortcut. For all seven buttons, English and German.
- **Help and shortcuts:** the street-level help page points to the Photos pane (with its icon). The shortcut list (`?`) has both new panes.
- **Overlays moved to Map Data (2026-10-03):** the "Overlays" section (imagery-index overlays such as the locator overlay) is now in Map Data, after Custom data layers. Checked in `renderer/background.js`: the background's display options (brightness, contrast, saturation, sharpness) and the imagery offset only act on the base layer, never on overlays, so nothing tied the section to the Background pane. The `overlays=` URL parameter and the minimap are unchanged.
- **Way table switch (2026-10-03):** it moved from Preferences ▸ Panels to Map Data ▸ Data layers, and was then replaced by a button in the bottom corner of the map (feature 6).
- **Optional buttons (2026-10-03):** zoom in / out, zoom-to-selection, locate and help are user settings in Preferences ▸ Interface, all off by default (feature 31). This replaced the project config `iD.uiConfig({ hiddenMapControls })`, which is gone.
  - The buttons are always created and only hidden, so their shortcuts keep working (`+` / `-`, "zoom to this", `H` for help).
  - The gap between the map buttons and the pane buttons, and the rounded corners, follow the buttons that are shown (`css/91_interface_prefs.css`).
  - The walkthrough skips its two steps that point at the Help button while it is hidden.
- **Not a button, on purpose:** sign groups and Mapillary filters (they filter one layer, so they stay in Photos); a "Radnetz" button with layers and lens (layers are data, the lens is display); the 17 map feature categories alone; favorites.
- **Code:**
  - `modules/ui/panes/map_display.ts`, `modules/ui/panes/photos.ts`, `modules/ui/sections/panels.ts` (new).
  - Small changes upstream: `panes/map_data.js`, `panes/preferences.js`, `sections/data_layers.js`, `sections/background_list.js` (toggles removed), `ui/pane.js` (tooltip), `ui/init.js`, `ui/feature_info.js`, `ui/intro/helper.js` (`{photos_icon}`, `{photos}`).
  - Strings: `map_display.*`, `photos_pane.*`, `pane_tooltips.*`, `preferences.panels.title`. German in `data/traffic_sign_field_locales.yaml`, which `scripts/build_data.js` now merges deeply, so single upstream strings can be overridden.
  - After adding a Font Awesome icon: `npm run build:data`, then `npm run dist:svg:fa`.
- **Checked in the browser (German UI):** all panes and sections, both shortcuts, tooltips, minimap checkbox in sync with `/`, help text, shortcut list. Tests: 2614 passing.
- **Left as is:** the help pages for notes, GPS and QA still point to Map Data, which is still right.

### 31. No bottom bar — ✅

Goal: the grey footer bar is gone; the map gets its height. Everything it held has a new place.

| Was in the footer | Now |
| --- | --- |
| Scale | Optional, off by default (Preferences ▸ Interface ▸ "Show the scale"). Floats bottom left, above the attribution. |
| "Edits by a, b and 28 others" | History panel (`⌘⇧H`), while nothing is selected. |
| "live" / "dev" chip | Preferences ▸ OpenStreetMap server, as radio buttons (only when the build offers more than one server). |
| Bug and translate links | Help pane, at the end. |
| Version (and the "what's new" badge) | Help pane, at the end. |
| User name, picture, "Log out" / "Log in" | Top toolbar, far end: "Log in" button, or the user's picture with a menu (name → profile, Preferences, Log out). |
| Issue count chip, "N hidden features" chip | Float bottom left, above the attribution (next to the scale). They only show when there is something to say. |
| Flash messages ("nothing to undo", …) | A toast at the bottom center of the map. |
| API status (offline, read-only, rate limit) | Unchanged: a red line at the very bottom, only while there is a problem. |

- **Optional controls:** Preferences ▸ Interface has one checkbox each for button labels, scale, zoom buttons, "zoom to this", "show my location" and the help button. All are off by default; prefs `preferences.interface.<id>`.
- **Help is hidden by default**, so the version and the bug link are too. `H` still opens the Help pane.
- **Account menu and Preferences:** the menu has a link that opens the Preferences pane. The pane and its button stay where they are (the pane is long, has a shortcut, and holds things that are not about the account).
- **Code:**
  - New: `modules/ui/tools/account.ts`, `modules/ui/sections/osm_server.ts`, `modules/ui/panels/history_contributors.ts`, `css/96_bottom_bar.css`.
  - Changed: `ui/init.js` (footer removed, `.map-status` and the flash toast in `.over-map`), `ui/sections/interface.ts`, `ui/top_toolbar.js`, `ui/panes/help.js`, `ui/panes/preferences.js`, `ui/panels/history.js`, `ui/version.js`, `renderer/map.js` (footer height is 0).
  - Removed: `modules/ui/config.ts`. No longer used, left in place: `ui/account.js`, `ui/contributors.js`, `ui/source_switch.js`.
  - Strings: `account.*`, `preferences.interface.*`, `preferences.osm_server.*`; German in `data/traffic_sign_field_locales.yaml`.
- **Checked in the browser (German UI):** no footer, all six checkboxes, corners and gap of the right sidebar, scale, hidden-features chip, flash toast, History panel list, Help pane footer, account menu with a faked login (name, Preferences, Log out).
- **Not tested:** the account button with a real OSM login and picture; switching to the dev server.
- **Open:** the bug link points to `openstreetmap/iD`. Bugs of this fork do not belong there; decide on another target (or drop the link).

### 32. TILDA checklist: defaults to check, `oneway:bicycle`, wrong `cycleway:*:oneway` — ✅ (v1 built 2026-10-06)

Three changes to the checklist of the TILDA section (feature 8, `modules/tilda/required_attributes.ts`) and one new validation.

**Built (2026-10-06):**

- **A, B, C1** as planned below. Rules: `assumed` + `note` (text id `inspector.tilda.default.<note>`) + `assumedOptions`; an `assumed` attribute carries `default` (`surface:colour=no`) and only offers the values that differ. `sideOnewayDefault(tags, side)` is the direction on a road side (right `yes`, left `-1`; on a one-way road both `yes`, except the left side when `oneway:bicycle=no`).
- **C2:** `modules/validations/cycleway_side_oneway.ts` with two rules, so each can be switched off in the Issues pane: `cycleway_oneway_wrong` (warning) and `cycleway_oneway_redundant` (suggestion). This was Q3; built as two types. `validator.revalidateRule(type, filter)` (new, in `modules/core/validator.js`) reruns a rule when the stored checks change.
- The merge of cycleway and footway writes `oneway:bicycle` only for `yes` / `-1`.
- Texts: English in `data/core.yaml`, German in `data/traffic_sign_field_locales.yaml`. The older texts of the TILDA section are still English only.
- Tests: `test/spec/tilda/required_attributes.ts` (defaults), `test/spec/validations/cycleway_side_oneway.ts` (every table row), `test/spec/sidepath/merge_tags.ts`.
- **Checked in the browser** (w211220112, not logged in): the redundant issue with its text and fix; after a test edit (`oneway:bicycle=no`) the "likely wrong" issue with the three actions, "This is correct here" disabled with the login note; the `surface:colour` row with its text, the "Checked" button and the values `red`, `green`, `red;green`.
- **Not tested:** the issues in a visible browser pane over a normal editing session (the pane was hidden, which pauses iD's background validation; the rules were run directly).
- **Finding:** the reference way w211220112 has `oneway=yes` + `oneway:bicycle=yes`, so its `cycleway:left:oneway=yes` is reported as "not needed", not as "likely wrong". That matches the rule (on a one-way road both sides run with the road).
- **Open, for TILDA:** for a track on a road side without the tag TILDA exports `assumed_no` (two-way), not "with the traffic". Our text says "with the traffic on this side". If the tags are removed in bulk, TILDA's default for side tracks should change too, or the infraVelo export reads these as two-way.

Plan as written before the build (Q1 and Q2 are answered by feature 33; Q3–Q5 are decided):

**Finding first: our own checklist repeats the mistake of the last mapping round.** For a cycle track on a road side (`cycleway:left=track`, TILDA confidence "low") the checklist says "`cycleway:left:oneway` is missing … TILDA assumes …; please tag it" and offers the buttons `yes`, `no`, `-1`. A mapper who sees a one-way track clicks `yes`. On the left side that is wrong.

#### A. One rule for "tags with a default" (`surface:colour` is the model)

Today (state `assumed`): a blue "i" row, "`surface:colour` is not tagged; check below", note "TILDA assumes surface:colour=no. Check it; no need to tag it.", no value buttons.

Planned: the row says what the missing tag means and when to tag it.

- Text per attribute instead of the generic note, e.g. "Not tagged = not coloured. Tag it only if the surface is red or green."
- Only the values that differ from the default are offered (`red`, `green`, `red;green`). The default value (`no`) is no button and no suggestion.
- A tagged default (`surface:colour=no`) stays as it is: ✓, no warning, no fix. We do not remove correct explicit tags.
- No colour on the row and none on the field title (as today).
- **Decided (2026-10-06):** the mapper confirms the default with a "Checked" button. The answer is stored in our key-value DB with the way id, not in OSM (feature 33). This applies to every row of this kind (A, B, C1).

#### B. `oneway:bicycle` only where it says something

Today: on every one-way road and one-way bicycle road a missing `oneway:bicycle` is a request (orange, "is missing; add below"; Radinfra FAQ audit point 9).

Planned: same style as A.

- One-way road without `oneway:bicycle`: notice "Not tagged = bicycles follow the one-way. Tag `oneway:bicycle=no` only if bicycles may ride against it." Only `no` is offered.
- Road that is not one-way: no row (as today). A tagged `oneway:bicycle` there is left alone.
- A tagged `oneway:bicycle=yes` on a one-way road stays (✓, no warning).
- Same rule for bicycle roads (`BICYCLE_ROAD`) and roads in mixed traffic (`ROAD`).
- Own code that writes the tag:
  - "Merge cycleway and footway" (feature 28) writes `oneway=no` + `oneway:bicycle=<oneway of the cycleway>`. With a two-way cycleway that gives `oneway:bicycle=no` on a way that is not one-way. Planned: write `oneway:bicycle` only when it is `yes` or `-1`.
  - "Extract a side" (feature 17) adds `oneway:bicycle=no` only for the old `cycleway=opposite_*` schema. That is the useful case; no change.
- The default is confirmed with the "Checked" button (feature 33). This replaces the FAQ decision "explicit on every one-way road"; the mapper still looks at every one-way road, but the answer is not an OSM tag.

#### C. `cycleway:<side>:oneway`: stop asking for it, and offer to clean it up

Background (Berlin community notes): the Radinfra project set thousands of `cycleway:*:oneway=yes`. `oneway` refers to the direction of the way's geometry, so on the left side the usual direction is `-1`, not `yes`. The defaults are enough: right side with the way's direction, left side against it; on a one-way road both sides run with the road.

**C1. Checklist: never request the tag on a road side.**

- For results of a road side (`left` / `right`) a missing `oneway` is always a notice, for every category (also tracks): "Not tagged = runs with the traffic on this side. Tag `cycleway:<side>:oneway=no` only if bicycles may ride both ways here."
- Only `no` is offered. No `yes` / `-1` buttons. The default is confirmed with the "Checked" button (feature 33).
- Separate ways (`highway=cycleway` etc.) keep today's rule: `oneway` is requested where TILDA's default is unreliable. There `oneway=yes` is clear, because the way has its own geometry.

**C2. Validation with a fix** (new `modules/validations/cycleway_side_oneway.ts`, issue type `cycleway_side_oneway`, severity warning, shown in the Issues pane and in the sidebar of the way like every iD issue). It checks ways with `highway=*` for `cycleway:left:oneway`, `cycleway:right:oneway`, `cycleway:both:oneway` and `cycleway:oneway`:

| Tagged | Road | Message | Fixes |
|---|---|---|---|
| `cycleway:left:oneway=yes` | not one-way | Likely wrong: says bicycles on the left side ride in the way's direction, against the traffic next to them | "Remove the tag" (default applies) · "Bicycles ride both ways here" → `=no` |
| `cycleway:both:oneway=yes`, `cycleway:oneway=yes` | not one-way | Likely wrong for the left side (same reason) | same |
| `cycleway:right:oneway=yes` | any | Not needed: this is the default | "Remove the tag" |
| `cycleway:left:oneway=yes`, `…:both…` | `oneway=yes`, bicycles too | Not needed: on a one-way road both sides run with the road | "Remove the tag" |
| `cycleway:left:oneway=yes` | `oneway=yes` + `oneway:bicycle=no` | Likely wrong: the left side is the contraflow side | "Remove the tag" · "both ways" → `=no` |
| `cycleway:left:oneway=-1` | not one-way, or `oneway=yes` + `oneway:bicycle=no` | Not needed: this is the default (we want as few `-1` as possible) | "Remove the tag" |

- Not reported: `cycleway:*:oneway=no` (two-way track, real information), and `-1` where it is not the default (`cycleway:right:oneway=-1`, or `cycleway:left:oneway=-1` on a one-way road that bicycles follow): rare, and real information.
- The rare correct `cycleway:left:oneway=yes` (e.g. w211220112, cycleway on the left of a side arm of Frankfurter Allee): a third action "This is correct here" stores that in the key-value DB (feature 33); the issue is then gone for this way, for everyone.
- Each fix is one undo step. Nothing is fixed automatically or in bulk; the mapper decides per way, with the photo next to it.
- The issue is reported for every loaded way, not only edited ones, so the Issues pane ("everything in view") works as a work list for the cleanup.
- **Q3:** should the "likely wrong" and the "not needed" rows be two issue types, so the pane can show only the wrong ones?
- **Decided (2026-10-06):** a redundant `cycleway:left:oneway=-1` is reported as "not needed" (see the table).
- **Decided (2026-10-06):** the validation runs everywhere, not only in Berlin.

**Not part of this:** the bulk removal itself (community decision), finding the tags that existed before the project (needs history data), and the two TILDA todos from the notes (direction arrows on the map, how the processing reads `oneway=-1`: today `derive_oneway.lua` ignores `-1` and falls back to the category default). The last one stays in "Open questions".

**Tests planned:** unit tests for the three rule changes and for each table row of the validation; in the browser one way per table row plus the reference way above.

### 33. "I checked this" and "Verified": stored in the key-value DB, not in OSM — 🟡 (built 2026-10-06; saving not tested with a login)

**Built (2026-10-06):**

- `modules/tilda/checks.ts`: `tildaChecks(context)` (one per editor) with `get`, `set`, `remove`, `load`, `loadWay`, `disabledReason`, `isMine` and a `change` event. All entries are loaded on first use and again every 5 minutes; selecting a way reloads its entries. `@osm-editor-kit/key-value-db-client` is a direct dev dependency now.
- TILDA section: every default row has a "Checked" button next to the values that differ. Checked rows show ✓ and "Checked by <user>, <date>". A check only counts for the same default (if the default changes, e.g. the road becomes one-way, the row is unchecked again).
- "Verified" is a row below the cards (not in the section header as planned: the status text needs the room), with "Verified by <user>, <date>" and "(the way was changed since)".
- Buttons are disabled with a reason: not logged in, new way without an OSM id, checks still loading, API not reachable from this address.
- Validation: "This is correct here" on a "likely wrong" issue stores the check; the issue is then not reported.
- Tests: `test/spec/tilda/checks.ts` with an in-memory client.
- **Checked in the browser (not logged in):** the entries load from `127.0.0.1` (the API answers), the buttons show "Log in to OpenStreetMap to save checks".
- **Not tested:** saving, unchecking, restoring after a reload, "by you", "changed since", and the issue disappearing after "This is correct here". All need an OSM login, which I cannot do.

Plan as written before the build:

**Rule:** whenever we do not force a tag in OSM, the mapper confirms the default with a check button. The answer goes to our key-value DB, with the OSM way id. OSM gets no tag.

**Store**

- key-value-db, project `infravelo-radnetz`, base URL `https://key-value-store.fixmycity.workers.dev`, client `@osm-editor-kit/key-value-db-client` (already a dependency, used by live touched, feature 11). The public project key goes into the code like the one of live touched.
- Reading is public. Writing needs an OSM login (the token iD already has). Every logged-in OSM user may write and change all entries. Entries do not expire.
- Allowed origins: `http://127.0.0.1:*` and the Netlify preview of PR 10. On `localhost` the API refuses the request, so the buttons are disabled there with a note.

**Data: one entry per check**

- Entry id `way/<id>/<check>`, e.g. `way/123/surface:colour`, `way/123/cycleway:left:oneway`, `way/123/verified`. (To check when building: which characters an id may contain; else the colons become another separator.)
- Entry tags: `way/<id>` (all entries of a way in one `list` call), `check:<check>` and `verified` (lists per kind, for a lens or statistics).
- Entry data: `{ answer, wayVersion }`. `answer` is the confirmed default as a tag (`surface:colour=no`); `wayVersion` is the OSM version of the way at that moment.
- Who and when come from the server (`updated_by`, `updated_at`); the client cannot fake them.
- Unchecking deletes the entry. So a check stays checked until someone unchecks it.

**Checks in the TILDA checklist (features 8 and 32)**

- Every row in the state "not tagged, default assumed" gets a check button in place of the blue "i": `surface:colour` (not coloured), `oneway:bicycle` (bicycles follow the one-way), `oneway` of a road side (runs with the traffic on that side), `oneway` of a road (two-way), `dual_carriageway`, `traffic_mode:*` / `buffer:*` where the default is "nothing next to it".
- Unchecked: "`surface:colour` is not tagged = not coloured" + button "Checked". Checked: ✓ "Checked by <user>, <date>" + the button is active; clicking it again unchecks.
- Selecting the way loads its entries (`list` with tag `way/<id>`) and restores the buttons. While loading the buttons are disabled.
- When the mapper tags the key after all (`surface:colour=red`), the row is a normal ✓ row and the stored check is not shown. It is not deleted by itself.
- The check is not an edit in iD: no undo step, nothing to upload. It is saved at once.

**Checks for the validation (feature 32, C2)**

- The issue for a `cycleway:left:oneway=yes` gets a third action next to the fixes: "This is correct here" → entry `way/<id>/cycleway:left:oneway` with the answer `cycleway:left:oneway=yes`. The issue is then not reported for this way, for everyone and in every session.
- If the tag value changes later, the stored answer no longer matches and the issue can come back.
- For this the validation needs the entries before a way is selected: at start we load all entries of the project (paged `list`), then only the changes (`updatedSince`) every few minutes and after own writes.

**"Verified" (4-Augen-Prinzip)**

- A button "Verified" in the TILDA section (built as a row below the cards). It stores `way/<id>/verified` with the way version; who and when come from the server.
- Shown as "Verified by <user>, <date>". Clicking again removes it.
- If the way has a newer version than the verified one, the text says "… (changed since)". The entry stays until someone removes or renews it.
- One "verified" per way, not per side or per check.

**Decided (2026-10-06)**

- A mapper may verify a way they edited last themselves; the text then says "by you".
- Ways that are split or merged get new ids; their checks do not follow. Accepted, the mapper checks again.
- No lens for checked / verified: the data is not in OSM, so it would be hard to draw.

**Code (planned):** `modules/tilda/checks.ts` (client, cache, load and save), buttons in `modules/ui/sections/tilda_bike_infra.ts`, the lookup in the new validation. Tests with a mocked client.

### 34. What is in the URL — ✅ (review 2026-10-09)

A link should open the editor the way the sender saw it. iD keeps this state in the URL hash; a parameter in the URL wins over the stored state of the browser, and the state is written back to the URL.

**In the URL**

| Feature | Parameter | Since |
|---|---|---|
| Map place, selected feature, background (also a custom one as `background=custom:<url>`), hidden categories | `map`, `id`, `background`, `disable_features` | iD |
| Photo layers, photo filters, the open photo | `photo_overlay`, `photo_dates`, `photo_username`, `photo` | iD |
| Mapillary: highlighted users and organisations, sign groups, the selected sign (features 18, 26) | `photo_highlight_users`, `photo_highlight_orgs`, `photo_sign_groups`, `photo_sign` | earlier |
| A selected TILDA note (feature 29) | `id=tilda-note/<id>` | earlier |
| Read-only categories (feature 12) | `readonly_features` | earlier; from 2026-10-09 also written when the state comes from the browser storage |
| Custom data layers (feature 4): the enabled ones with URL, name, colour, filter, overlay flag | `data_layers` | 2026-10-09 |
| Way table open (feature 6) | `way_table` | 2026-10-09 |
| Lens (feature 5): the bundled lens, or `default` | `lens` | 2026-10-09 |
| Note layers that are on: `osm`, `tilda` (feature 29) | `notes` | 2026-10-09 (iD only read `notes=true` on load) |

**Not in the URL, and why**

| Feature | Where it lives | In the URL? |
|---|---|---|
| An imported lens (feature 5) | its CSS is in the sender's browser storage | No: there is no URL to link to. With an imported lens active the `lens` parameter is removed. |
| Live edits nearby on / off (feature 11) | browser storage, after a consent dialog | No: it needs the user's consent, a link must not turn it on. |
| Way table height, sidebar width, photo viewer size | browser storage | No: depends on the screen. |
| Area fill, toolbar labels, optional buttons, hidden map controls (features 13, 30, 31) | browser storage | No: personal preferences. Area fill could be added if needed for screenshots. |
| Favorite presets and their numbers (feature 3) | browser storage | No: personal. |
| Names of the stored custom backgrounds (feature 1) | browser storage | The active one is in `background`; its name is not. |
| TILDA section: chosen target category, open cards; traffic sign "Per direction"; measuring tape | not stored, lost on reload | No: steps of an edit in progress. |
| "Checked" / "Verified" (feature 33) | key-value DB, per way | No: shared data, the same for everyone. |
| Unsaved edits | iD's own restore in the browser storage | No. |

Notes on the new parameters:
- `lens`: only ids of bundled lenses (and `default`) are accepted; anything else is ignored. The link sets the receiver's stored lens.
- `notes`: with the parameter exactly the listed layers are on (`notes=osm` turns the TILDA notes off for that session and stores it). The TILDA layer, on by default, writes itself into the URL when it starts. Helpers in `modules/tilda_notes/notes_hash.ts`.
- `data_layers`: a link enables exactly its layers. Layers the receiver does not have are added to their stored layers (name and colour from the link); their other layers are turned off, not deleted. Format in `API.md`.
- `|` in `data_layers` shows as `%7C` in the address bar (iD's hash writer only leaves `/ : , { }` unescaped).

## Integration order (proposal)

1. Multiple custom backgrounds (most mature)
2. Favorites and shortcuts, then the shortcut-assignment rework
3. Traffic signs
4. Custom data layers (builds on 1's UI pattern)
5. Lenses
6. Way-as-table
7. Side indicator
8. TILDA bike infrastructure helper (after merging all others)
9. QA rules (with 8)
10. Width indicator and editing
11. Live touched (T10 test with two accounts)
12. Read-only feature categories
13. Hide toolbar button labels
14. Access field (PR #12011 branch, merged as is)

## Coding conventions (this branch)

- New code is TypeScript with `const`/`let`. Old upstream files stay JS; change them as little as possible and put new logic in new TS modules (e.g. `modules/ui/favorite_button.ts` is called from upstream's `feature_type.js`).
- Follow the modern TS files upstream uses: `modules/ui/sections/map_style_options.ts`, `modules/ui/fields/check.ts`, `modules/svg/mapillary_signs.ts`.
  - Global types `iD.Context`, `d3.Selection<T>`, `Tags`, `TagsMulti` from `modules/globals.d.ts`.
  - Sections: `(uiSection(id, context) as any).label(…).disclosureContent(…)`; tooltips: `(uiTooltip() as any).title(…)`.
  - d3 events: `.on('click', (d3_event, d) => …)`; namespaced listeners `store.on('change.someName', …)`; typed joins `selectAll<HTMLLIElement, Datum>(…)`.
  - Small stores are singletons with a d3 `dispatch('change')` and `utilRebind(obj, dispatch, 'on')`, persisted with `prefs()` (see `modules/core/preset_favorites.ts`, `modules/renderer/custom_data_layers.ts`).
- New CSS goes into its own file (e.g. `css/85_custom_data_layers.css`).
- Checks: `npx tsc`, `npx eslint modules test/spec`, `npx vitest run`, `npm run build:data`.

## Icon conventions (Map Data and Map Display panes)

- One toggle for every list entry that can take part in the map (`modules/ui/layer_mode_toggle.ts`, `css/94_layer_mode_toggle.css`):
  - pointer (`fas-arrow-pointer`) = interactive: shown, can be selected (and edited, for OSM data). The default.
  - lock (`fas-lock`) = read-only: shown for orientation, cannot be hovered or selected. Same lock as iD's locked fields.
  - crossed eye (`fas-eye-slash`) = hidden.
  - Used by Map Features (hidden = iD's filter, read-only = feature 12) and Custom Data Layers (hidden = disabled, read-only = `selectable: false`).
- Pencil (`iD-icon-edit`) = "edit the settings of this entry" (custom backgrounds, custom data layers, lenses), like upstream's background list.
- Trash (`iD-operation-delete`) = delete the entry, always with a confirm modal.
- Tooltips in panes: one per element. Row tooltip on the `label` (never the `li`), buttons their own; both via `uiPaneTooltip()` (`modules/ui/pane_tooltip.ts`: on top, kept inside the pane). No native `title` attributes.

## Dev notes

- New FontAwesome icon (added to the list in `scripts/build_data.js`): run `npm run build:data` (writes `svg/fontawesome/*.svg`, commit it) **and** `npm run dist:svg:fa` (rebuilds `dist/img/fa-sprite.svg`), then reload. Without the second step the icon is missing locally; the deploy runs `npm run dist` and has it.

- Dev server: `npm start` (port 8080, or `PORT=… npm start`). The CSS watcher only knows files that existed at startup; run `npm run build:css` after adding a CSS file.
- A fresh worktree needs the SVG sprites: `npx run-p "dist:svg:*"`, and the traffic sign assets: `npx run-p dist:traffic-sign-field dist:traffic-sign-converter`.
- The traffic sign packages come from npm since 2026-10-06: `@osm-traffic-signs/id-field` (0.1.0) and `@osm-traffic-signs/converter` (0.7.0), dev dependencies. `npm run dist:traffic-sign-field` / `dist:traffic-sign-converter` copy their `dist/` from `node_modules/` to `dist/`; the recommender bundle (`scripts/traffic_sign_recommender_*.js`) imports the converter's files from `node_modules/`. Source: `~/Development/OSM/osm-traffic-sign-tools` (`main`), released with `bun run release --package --id-field` there. To try an unreleased build, copy its `dist/` over `dist/traffic-sign-field/` (`bun run dev:id-field` with `ID_WORKTREE`). The surface/smoothness field is still vendored, see `vendor/README.md`.
- Since the lens merge, all iD CSS is in `@layer ideditor`. CSS loaded later without a layer (e.g. the traffic sign field's `id-field.css`) always wins over it; overriding such CSS from `css/` needs `!important`. The field-box look of the traffic sign field was such an override until 2026-10-06; it is part of the package now.

### 35. Progress tracking for the lines of a custom data layer — 🟡 (built 2026-10-12; saving not tested with a login)

Goal: track which lines of a dataset are done, for two tasks: the mapping of the REN network and the separate mapping of `track` cycleways.

- **Setting per layer.** The dialog of a custom data layer has "Progress tracking": No tracking, "Track mapping progress", "Track "track" separation mapping progress". With a tracker the layer is made selectable. The tracker is the 6th field of the `data_layers` URL parameter.
- **Storage.** One project per tracker in the key-value DB: `infravelo-tracker` (mapping) and `infravelo-track-tracker` (track). One entry per done line; "Not done" deletes it. Who and when come from the server. Reading is public, writing needs the OSM login (`modules/progress/tracker.ts`).
- **Id of a line.** The property `id`, else `lfd_nr`. `zuteilung_netz` has `lfd_nr` (unique; `element_nr` is not). The track lines (`centerline_tracks_pruefliste.geojson`) have `id` like `way/1079383678/cycleway/right`. A line without one of them cannot be tracked.
- **Per view.** The API has no area query. As its docs suggest, an entry has the z14 tiles of its line as tags (`z14/8802/5376`), and every draw asks for the tiles of the view plus one ring that are not fresh (2 minutes). Nothing is loaded when more than 60 tiles are in view.
- **Map.** Tracked lines get a casing: red, green when done (`css/85_custom_data_layers.css`). Zoomed out too far to load the marks, there are no casings.
- **Sidebar.** A selected line shows a "Done" toggle above its properties, with "Done: user, date"; a second click takes the mark away (`modules/ui/progress_tracking.ts`).

Limits and open points:
- The projects allow the origins `http://127.0.0.1:*`, `https://fixmyberlin.github.io` and the Netlify preview of PR 10 (checked 2026-10-12). Another preview number or a production URL has to be added.
- PMTiles cut a line at tile borders. The tile tags come from the pieces of the line that are drawn when it is marked. A part of the line in a tile that was not loaded then has no tag; the ring of tiles around the view covers the usual case.
- Two states only, decided 2026-10-12: nothing and done.
- URLs to use: mapping lines `https://tilda-geo.de/api/uploads/infravelo-ren-netz-zuteilung-netz.pmtiles` (tracker `mapping`), track lines `https://tilda-geo.de/api/uploads/infravelo-ren-kartierung-tracks.geojson` (tracker `track`, 4,663 lines, 3.8 MB).

### 36. infra3D links — 🟡 (built 2026-10-12; the links not opened with an infra3D account)

infra3D is street-level imagery we have for Berlin; it needs a login. The link format is the one of `buildInfra3dUrl` in `@osm-editor-kit/street-imagery` (the package TILDA uses), repeated in a few lines: importing the package bundled all of it (about 7,000 lines). The project (`infra3D Berlin`, with its bbox) is the one from TILDA (`modules/infra3d/infra3d.ts`). The links open in a new tab.

- **Sidebar.** A "3D" button in the preset header of a selected feature, next to the favorite heart and the info button: infra3D's nearest image, turned to the feature. For a line the target is the point at half its length, for a node its position, else the center of the extent. Only shown inside the project's bbox.
- **Mapillary bar** (above the viewer). "infra3D ↗": with a selected sign it looks at the sign; without, it opens the image nearest to where the shown Mapillary image was taken. The bar now also shows with an image and nothing selected, for this link.
- Not built: "click on the map to open". The two buttons cover a selected feature and a shown image; a free map click would need its own mode.

### 37. Local performance harness — ✅ (2026-10-15)

`scripts/perf/` (README there): the test link with real mouse input against Maid's mock OSM API and local copies of the TILDA files; no public service is used, the browser blocks everything else. Per step frames, long tasks, redraws, accidental edits; a CPU profile attributed to source modules (ours marked); `--trace` for the browser's own work; `--base-url` runs the same steps on stock iD (Maid's reference build).

Findings of the first runs (dense Neukölln fixture, 1600×1000):

| Step, zoom 17 (22,000 features in view) | before | after | stock iD 2.42 |
| --- | --- | --- | --- |
| pan | 13 fps, 25 s for the input | 32 fps, 11 s | 21–33 fps, 9–18 s |
| pan with a selection | 10–15 fps | 32 fps | 25–29 fps |
| hover | 37 fps | 56 fps | 6–8 fps |

At the test link's zoom 19.25 every step is at ~60 fps now (pan with a selection was 15 fps).

What was slow, all from this fork:
- Read-only categories were muted with `filter` and then `opacity` on every element. Each such element is painted as its own transparent group, so every repaint got very slow (pan with a selection 13 fps at z19). Now `stroke-opacity` / `fill-opacity`, not on the invisible shadows.
- Their click targets lost the class on every redraw (the draws rewrite the class attribute) and got it back: thousands of style changes per redraw. Targets now get an inline `pointer-events: none`; checked elements are remembered while their data is the same.
- iD's own (empty) data layer redrew the whole map whenever a vector tile of our data layers arrived (`svg/data.js`).
- With a selection, every redraw drew all vertices twice (`drawSelected` before the full vertex draw). Now it only updates the selected set when a full draw follows.

Left as it is (iD in general): a full redraw at z17 costs 250–500 ms and runs every 750 ms while panning; iD validates newly loaded data in the background; switching on the Mapillary layer redraws the whole map once.

### 38. Extract and merge in one click — 🟡 (built 2026-10-20; not tried by hand in the browser)

**Goal.** Feature 17 (extract a cycle track from the centerline) and feature 28 (merge cycleway and footway into one path) in one click, for roads whose sidewalk is a separate way already. The mapper chooses the side: right, left or both.

- Menu entries after the extract entries: "Extract right cycle track and merge with sidewalk", "… left …", "Extract both cycle tracks and merge with sidewalks" (only for sides with `cycleway:<side>=track`; protected lanes are not offered).
- **Shortcut ⌘G** (one enabled entry runs, several open the menu at the pointer, like ⌘E for extract).
- **Merge stays on ⌘M** (decided 2026-10-20): a key for the left hand was tried, but ⌘D, ⌘A, ⌘Y, ⌘⇧E and ⌘X did not work in the browser, and ⌘B is iD's background switch. ⌘E extract, ⌘M merge, ⌘G both.
- Per side: extract variant A, then look for the footway: `highway=footway` or a foot-designated path (`partKind`), at least half of it within 7 m of the new cycleway, or running along a third of the cycle track (long sidewalk beside a short road piece); the part along must stretch 5 m (a crossing footway does not). The footways found are merged with the extracted cycleway by feature 28 (same tags, same cut of the longer way). The older way survives, so the existing sidewalk keeps its line and its history.
- This reverses the earlier decision of feature 28 not to search the sidewalk automatically: the mapper now asks for it with the click, and the entry is disabled with the reason when it does not fit.
- Nothing runs half: if one side has no sidewalk way (`no_sidewalk`) or the merge is not possible (`lengths`, `apart`, `mixed`, `different_values`), the entry is disabled and says why, also for "both".
- Hover preview: the footways that become the path. One undo step; the paths stay selected.
- Code: `modules/sidepath/find_sidewalk.ts`, `modules/actions/extract_merge_sidepaths.ts`, `modules/operations/extract_merge_sidepaths.ts` (the shared key operation is `sidepathKeyOperation` in `operations/extract_sidepath.ts`), hooked into `modules/modes/select.js`; strings `operations.extract_merge_sidepaths.*`. Tests: `test/spec/actions/extract_merge_sidepaths.ts`, `test/spec/operations/extract_sidepath.ts`.

## Progress log

- 2026-10-20: Extract and merge in one click (feature 38, ⌘G).
- 2026-10-15: Local performance harness (feature 37) and four performance fixes found with it: read-only styling without per-element transparency, read-only targets with an inline style, no full redraw from iD's empty data layer on our vector tiles, no double vertex draw with a selection.
- 2026-10-14: Tester feedback and a check of the progress marks.
  - Read-only features: since 2026-10-13 all touch targets were checked, also midpoints, whose datum is no OSM entity. The check threw on every redraw while read-only categories were set; that stopped the listeners after it. Effects seen: the right-click menu of a way did not open (no split), and very likely the sidebar and the Mapillary bar did not update after a click (TILDA value buttons, "No sign here", the image buttons). Fixed; the right-click was reproduced and checked in Firefox.
  - Progress marks (feature 35): the map shows the marks from the key-value DB only, never from the dataset. Before a change the line's mark is read again; when someone else changed it since the view was loaded, nothing is written and a message says so ("bob marked this line as done in the meantime"). A selected line is read again at once. A map that stands still asks for new marks every ~2 minutes.
  - Key-value DB errors are named: address not allowed, login not accepted, too many requests, offline (`core/kv_error_message.ts`), for checks, progress and live edits. All four projects accept the new address (checked 2026-10-13).
  - Extract and merge (features 17, 28): no "not enough of it is visible" anymore.
- 2026-10-13: Fixes from the first day on the new site and from a tester's list.
  - Measuring tape (feature 21): the tape layer was below iD's click targets. A press on a handle that sat over a node or way went to that object: the tape closed and the node was dragged. The layer is now the topmost. Reproduced and checked in Firefox with Playwright. A drag start without a tape no longer throws.
  - Traffic sign fields: an empty field offers "No sign here", which sets `none`.
  - Map: direction arrows also for `oneway:bicycle=yes` / `-1` on ways that are not one-way (`svg/lines.js`).
  - TILDA checklist: with `oneway=no` and `oneway:bicycle=yes` the row says "TILDA reads yes from oneway:bicycle=yes" instead of "TILDA reads it as yes".
  - `unload` → `pagehide` for releasing the history lock (`ui/init.js`): Chrome is turning `unload` off, then the lock stayed.
  - Live edits: when the server cannot be reached, a message instead of an uncaught error.
  - Not ours to fix, both are allow lists for the new address `https://radnetz-mapping.netlify.app`: TILDA (`appInstances.const.ts` in tilda-geo, for the notes login) and the key-value project `live-touched`.
- 2026-10-13: Merged `upstream/develop` (9 commits, among them `coreHistory` in TypeScript). No conflicts; one type fix in `ui/fields/traffic_sign.ts`. A rebase was tried first and dropped: it replays the six feature merges and conflicts on the first. Backup of the state before: local branch `backup/radnetz-mapping-before-rebase-2026-10-13`.
- 2026-10-13: OSM login on the Netlify site: own OAuth 2 application under the OSM account "FixMyCity TILDA" (client id in `netlify.toml`; redirect URIs for the Netlify site and `127.0.0.1:8080`). iD's default application only allows the addresses of the iD project. The local build still uses iD's default application. Not tested yet.
- 2026-10-13: Three points left from the review of 2026-10-12:
  - Progress: a failed request no longer disables "Done"; the note says a click tries again.
  - Custom data layers: read-only is not available for a layer with progress tracking (the button is greyed, its tooltip says why).
  - Mapillary bar: a green button takes its tag out again only when the tag was set in this session. A tag that was there before stays, the button is inert as it was.
- 2026-10-13: Moved to the fork `FixMyBerlin/iD`: branch `radnetz-mapping` (default branch), Netlify site `radnetz-mapping`, a draft PR there against `develop` as the overview (FixMyBerlin/iD PR 1, never merged). The PR on tordans/iD is closed with a link. The Netlify site is linked to the repo through the Netlify GitHub app of the FixMyBerlin organisation; deploy previews are off and only `radnetz-mapping` is built. The new site's origin is allowed in the three key-value DB projects (checked 2026-10-13). To do: update the editor links in the track dataset and the MapRoulette tasks; test the OSM login on the new address.
- 2026-10-12: Review of the day's changes, fixed: a mark set while the view was loading could vanish again; zoomed out, every tracked line looked not done (now no casings there); polygons of data layers are not culled by their bounds (a mask's bounds are not reliable); the progress section could land below the properties; the way table keeps the row of a tag removed in this session; removing a supplementary sign keeps the value's separator; the infra3D link no longer pulls in the whole imagery package.
- 2026-10-12: infra3D links (feature 36): a "3D" button in the sidebar's preset header and "infra3D ↗" in the Mapillary bar.
- 2026-10-12: Progress tracking: "Done" is one toggle (nothing / done). Origins of the three key-value projects checked: `127.0.0.1` and the Netlify preview of PR 10 answer 200.
- 2026-10-12: Progress tracking for the lines of a custom data layer (feature 35): setting per layer, done / not done in the sidebar, red / green casing, marks loaded per view from the key-value DB.
- 2026-10-12: Fixes from a list by the user.
  - TILDA notes use production: `https://tilda-geo.de`, region `infravelo`, folder 13 (both index pages). Not tested with a login.
  - Mapillary buttons in the bar above the viewer: a tagged (green) button is no longer disabled, a click takes the tag out again (an image id out of its list, a supplementary sign out of the sign value, else the whole tag). The tooltips name the colours: green = already tagged, yellow frame = suggested, orange = replaces another value.
  - Read-only features: the click targets of nodes were never marked (the selector matched `path` and `g` in the touch layer, node targets are `circle` and `rect`), so nodes of read-only features could be selected and moved. Now all `.target` elements are marked. Unchanged by design: a node shared with an editable way stays editable.
  - Custom data layers: the outline of a polygon of a read-only layer stayed clickable (iD's rule for area fills is more specific; ours is `!important` now). The row of a read-only data layer is not dimmed anymore, as the layer looks the same on the map.
  - Way table (feature 6): cells changed in this session have a violet frame, their row a light tint and a mark at the key. The columns are in the direction of the selected way again (ways before it on the left, next ones on the right); the order "like on the map" from 2026-10-03 is removed.
- 2026-10-12: Performance. Measured with a CPU profile in headless Chrome (Tempelhof, z17.6, 6,400 features in view, 1300 px map; hover, drag, wheel zoom, select, tag change).
  - Hovering a side card of the TILDA section or a left/right field redrew the whole map on every enter and leave (`context.setDirectionalComboIndicator` fired the context's `change`). Now only the ways with the arrows are redrawn (`map.redrawEntities(ids)`), and nothing when the value did not change.
  - Read-only features: the classes were applied to all map elements after every draw, also the small ones on hover, even without a read-only category. Now nothing runs without a category, and with one it uses `classList` directly.
  - Tag classes (`svg/tag_classes.ts`, upstream code plus our lens classes) were the most expensive function of every redraw. The result is cached per tags object and current class string; a lens change clears the cache (`lensClassesVersion()`).
  - Selecting: the full redraw after a mode change runs in its own task, so the selection and the sidebar show first.
  - Result in the same scenario: selecting a way about 250 ms → about 100 ms blocked; hover with a way selected 31 → 57 fps; tag change about 110 → 65 ms; full redraw about 140 → 110 ms.
  - Not ours and unchanged: a full redraw of a dense view costs about 100 ms (iD), and every hover change with a selection redraws all visible vertices (iD).
- 2026-10-12: Custom data layers: after saving an edit, the edit dialog opened with the old name and filter again (and a later save wrote them back). The edit and delete buttons of a row kept the layer object from when the row was first drawn; they now get the current one on every render (`modules/ui/sections/custom_data_layers.ts`).
- 2026-10-09: URL: `lens` (bundled lens) and `notes=osm,tilda` (note layers) (feature 34).
- 2026-10-09: URL: `data_layers` (custom data layers), `way_table`, and `readonly_features` also written from the stored state; review of what is in the URL (feature 34).
- 2026-10-09: Two fixes for the deployed preview.
  - Background list: imagery with several years showed one year only, and choosing it did nothing. The label of a new row was drawn twice, the second time as plain text, which removed the year dropdown; the radio button then failed looking for it. Fixed in `modules/ui/sections/background_list.js`; the rows also get a copy of the source per render, as in the `multiple-custom-backgrounds` branch. That branch has the same double drawing (its `drawListItems`, "render the label text on enter") and needs the same fix. Checked in the browser: ten Berlin years in the dropdown, radio and dropdown change the background and the URL.
  - TILDA notes were missing on Netlify: `dist/index.html` (the page Netlify serves) did not call `iD.tildaNotesConfig(...)`, only the development `index.html` did. Added, with the Mapillary `signGroups` that were missing there too. **Both files carry the project config; change them together.**
- 2026-10-08: `@osm-traffic-signs/id-field` 0.1.1 (long sign ids with a value stay in their row); the fork's temporary CSS for it is removed.
- 2026-10-08: Merge of cycleway and footway cuts the longer way to the length of the other (two ways); extract and merge work with half of the ways in view (features 17, 28).
- 2026-10-08: Sidebar, issues section (feature 23): the issue boxes and their texts ran from edge to edge. Cause: the section body is a `.grouped-items-area`, whose padding the compact styles set to 0. It keeps the gutter of a section body now. Traffic sign field: a long value (time restriction) with its input no longer runs out of the row (the input wraps, the code gets an ellipsis; fix lives in `css/93_traffic_sign_field.css` and should move into `@osm-traffic-signs/id-field`). Checked by measuring the layout of every sidebar section for a way, a node, a relation and a multi-selection (all inside the gutter). Not seen as a picture: the browser pane was not displayed. Not checked: the "suggested tags" table of an outdated-tags issue (no such issue could be produced in the test).
- 2026-10-08: Light theme and hover preview (features 6, 23):
  - Way table: all colours come from the theme variables (`css/86_way_table_panel.css`), so the dock is light in the light theme. Before it had light text for a dark background only.
  - Sidebar in the light theme: the entity editor gets a slightly darker surface (`--bg-color-2` / `--bg-color-3` set on `.entity-editor`, end of `css/99_sidebar_compact.css`), so the white inputs stand out from the labels as in the dark theme.
  - Hover preview (nothing selected, `.inspector-hover`): the controls of this fork are hidden or greyed like iD's own (`css/99_zz_inspector_hover.css`): TILDA edit / value / "Checked" / "Verified" buttons, the "Per direction" switch, related-tag buttons, measuring tape, and drag / remove / add of the traffic sign field.
  - Checked in the browser with the light theme emulated; the hover preview was triggered by script. Not checked: the hover preview in the dark theme after this change.
- 2026-10-06: Built features 32 and 33: defaults with a "Checked" button (`surface:colour`, `oneway:bicycle`, side `oneway`), "Verified" per way, both stored in the key-value DB; two validations for `cycleway:*:oneway`.
- 2026-10-06: Plan for the TILDA checklist defaults (`surface:colour`, `oneway:bicycle`) and the `cycleway:*:oneway` cleanup validation written (feature 32); waiting for confirmation.
- 2026-10-06: Plan for "Checked" and "Verified" buttons stored in the key-value DB written (feature 33).
- 2026-10-06: Traffic sign field comes from npm (`@osm-traffic-signs/id-field` 0.1.0, `@osm-traffic-signs/converter` 0.7.0); `vendor/traffic-sign-*` and the fork's CSS overrides are gone.
- 2026-10-05: Traffic sign field redesigned: full-width rows, switches "Whole way | Per direction", equal direction signs merge into the whole way (feature 27).
- 2026-10-03: Way table columns follow the order of the ways on the map (feature 6).
- 2026-10-03: Photo viewer closes itself when the image cannot be loaded (feature 18).
- 2026-10-03: Way table is a dock below the map with a fixed, stored height and a toggle button in the map's bottom corner; the checkbox in Map Data is gone (feature 6).
- 2026-10-03: Bottom bar removed; its contents moved to the map, the toolbar, Preferences, Help and the History panel (feature 31). Optional buttons are user settings now, the `uiConfig` project config is gone.
- 2026-10-03: Overlays section moved from Background to Map Data; way table switch moved from Preferences to Map Data ▸ Data layers (feature 30).
- 2026-10-03: Config `iD.uiConfig({ hiddenMapControls })`; the project hides the zoom, zoom-to-selection, locate and help buttons (feature 30).
- 2026-10-03: Custom data layers are shown in the minimap (feature 4); the Photos pane has no open/close header any more (feature 30).
- 2026-10-03: "Show button labels" is off by default (feature 13).
- 2026-10-02: TILDA's internal notes in iD (feature 29): own layer (on by default), teal pins, own add button and editor next to the public OSM notes; reads and writes the staging API of region `infravelo`, folder 12.
- 2026-10-01: Right sidebar split: new Map Display and Photos panes, panel toggles moved to Preferences, tooltips and shortcuts for the panes (feature 30).
- 2026-10-01: Analysis for TILDA's internal notes in iD (feature 29): feasible via the shared OSM identity, needs a small external API in TILDA; prompt for the TILDA session written.
- 2026-10-01: The selected Mapillary sign is in the URL (`photo_sign=<id>`) and selected again after a reload, so the viewer is not blank (feature 26; `restoreSelectedSign` in `modules/mapillary/sign_select.ts`).
- 2026-10-01: Extracted ways are always drawn in the road's direction; a left cycle track gets `oneway=-1` instead of a reversed line (feature 17).
- 2026-10-01: "Merge into a foot and cycle path" for a selected cycleway and footway(s) (feature 28), the second step after extracting a side; the one-step extract (feature 17 C) shares its tag rules.
- 2026-10-01: The viewer bar writes the shown image to the feature's image keys (`key=1586…` buttons); the Mapillary eyedropper and its key menu are removed (feature 20 v2). Capture day buttons with month, age and image position (feature 26).
- 2026-10-01: Traffic sign fields for the way (with directions), the bike lanes and the sidewalks, a row per side (feature 27). Sign bar: three `key=value` buttons instead of the key dropdown, a source button (feature 26).
- 2026-10-01: Mapillary traffic signs (feature 26): sign group filter (bike / speed / access / other), click a sign → newest best image turned to the sign's outline, only sign outlines in the viewer, selected sign + dotted line on the map, sign bar with capture days and buttons that write the sign (or maxspeed) to the selected way, with the direction from the sign's facing. Research on Rapid and vizsim/mapillary_trafficsigns.
- 2026-10-01: Field title buttons only on hover/focus, as small squares with the input's background; link buttons in fields no longer blue. A lock tooltip change was tried and reverted (feature 23).
- 2026-09-30/10-01: Related tags at their field (feature 25): `source:*`, `note:*`, `check_date:*` and Mapillary images of a key as lines below the field; source / note / check date buttons in the title from a curated taginfo-based list; editors in a light box. `source/width` is no longer a separate field.
- 2026-09-30: Measuring tape: no button on `source:width` / `note:width`; re-measuring overwrites width and source (decided, feature 21).
- 2026-09-30: TILDA checklist audited against the Radinfra mappers' FAQ: source key, sett 0.15, lane buffer/marking, protected lane traffic mode, bicycle road marking, bus lane width, `oneway:bicycle`, width source only for new widths (measuring tape writes it), damage signs (feature 8).
- 2026-09-30: TILDA checklist: `surface:colour` and `dual_carriageway` as assumed notices; `traffic_mode` read from the road's `parking:*` like TILDA, a notice only without parking tags (feature 8).
- 2026-09-30: TILDA checklist: missing `oneway` is a notice ("TILDA assumes …, check it") on roads and where TILDA's oneway default is reliable (high/medium confidence), not a request to tag it (feature 8).
- 2026-09-30: `sett:length` as a radio group with cm labels ("Mosaic sett, 5 cm", "Small sett, 10 cm", "Large sett, 16 cm"; the sizes TILDA tells apart). Other tagged values (e.g. `0.15`) show as an extra option, like iD does for radio fields. Fixed: option labels of our own fields were ignored when the field passed its own fallback (radio fields showed `"0.05"`); our strings now win (`modules/presets/field.ts`).
- 2026-09-30: TILDA checklist as plain tags with "is missing; add below" links to the fields, the same orange / yellow on the field titles, value buttons only where no field exists (feature 8).
- 2026-09-30: TILDA "Change to" as iD's tag diff; lane type no longer counted as set by the chosen target category (feature 8).
- 2026-09-30: TILDA section in the compact style (feature 8): one-line card headers, framed edit button, no empty card bodies, plain intro text, "Mixed traffic" for the way itself, "This way" collapses again.
- 2026-09-30: Surface and smoothness by photo, round 5 (feature 24): the input row below the photos is iD's own combo (translated dropdown). Package in a clean local state (branch `image-first-ui`, not pushed or released).
- 2026-09-30: Surface and smoothness by photo, round 4 (feature 24): label | input row in the open picker, all surfaces at once, no text mode.
- 2026-09-30: Surface and smoothness by photo, round 3 (feature 24): dropdown below each picker, 12 surfaces before "More".
- 2026-09-30: Surface and smoothness by photo, round 2 (feature 24): two compact tiles side by side, pickers open below.
- 2026-09-30: Surface and smoothness by photo (feature 24): photo-first UI built in the surface-smoothness package (branch `image-first-ui`), vendored here as a new field that replaces `surface` + `smoothness`.
- 2026-09-30: Side prerequisites clean up: changing a side's parent so the prerequisite no longer holds removes that side's detail value (feature 15).
- 2026-09-30: Compact sidebar round 3 (feature 23): no lines between fields, one muted gap color for rows and tag rows, row labels aligned with input text, flat Structure sub fields, light arrows, field titles not clickable.
- 2026-09-30: Side prerequisites (feature 15): the lane type field only appears when a side has a lane; the other side is disabled with a hint to change the bike infrastructure first. Written to be reused for a later upstream PR.
- 2026-09-30: Compact sidebar round 2 (feature 23): fields without boxes, no reserved scrollbar track, same-size field buttons, Mapillary field gaps fixed, no "No signs yet" text.
- 2026-09-30: Compact sidebar, round 1 (feature 23): Feature type as the header, sections edge to edge, fields and tags tighter.
- 2026-09-30: TILDA section UI rework (feature 8): right after Feature type, category chip and edit button in each card header, grouped target select, info button for the intro, German category names generated from tilda-geo's topic docs.
- 2026-09-30: Custom data layers get an optional key=value filter (feature 4). Pane tooltips of read-only/hidden rows no longer see-through. English fallback for our UI strings in other locales. Mapillary field: input and buttons fill the row height.

- 2026-09-30: Mapillary features 18–20 and the measuring tape (21) built with Sonnet agents and reviewed; Mapillary field redesigned as a directional-combo table; magnifier fixed (crosshair, placement). Netlify now gets the project setup (`dist/index.html`). Merged the access field branch (feature 22).
- 2026-09-30: Extract a road side into a separate way (feature 17). TILDA target select also for ways TILDA does not process (feature 8).
- 2026-09-30: Traffic sign review; tag suggestions below the traffic sign field, in the same UI as the TILDA tag plan (feature 2).
- 2026-09-30: Bundled lens "Radnetz QA" (feature 5): ways colored by how complete their TILDA checklist is.
- 2026-09-29: Way table docked at the bottom, flies to the selected way.
- 2026-09-29: Data index infraVelo ⇐ TILDA ⇐ OSM (feature 16). TILDA checklist per category with keys, values and TILDA's reading (feature 8 v2). Preset customization v1: Radnetz fields, bicycle road and cycleway link presets, shorter field lists (feature 15).
- 2026-09-27: `develop` updated from upstream. Created worktree and branch `radnetz-berlin` on tordans/iD. Took stock of the feature sources. Decided on the traffic-sign source branch.
- 2026-09-27: Custom data layers can be made non-selectable. Lens section and TILDA section redesigned in iD's style; TILDA section moved to the top of the inspector. Ported the toolbar label preference from v3 (feature 13).
- 2026-09-27: Switched live touched to npm 0.1.0. Built the TILDA bike infrastructure section (feature 8 v1).
- 2026-09-27: Width indicator and side width fields. Integrated live touched (feature 11), tested with a fake backend.
- 2026-09-27: Full UI test run of all features (no OSM uploads, test edits discarded). Fixed the way table checkbox state. Merged the side indicator branch. Planned features 8–10.
- 2026-09-27: Merged the lens PR and the v6 lens shortcut commits. Added the way table panel. All six features are in `radnetz-berlin`, checked in the browser.
- 2026-09-27: Merged multiple custom backgrounds. Merged favorites and reworked the shortcuts (fixed numbers, left-hand first, swap on conflict, number input in preferences). Merged the traffic sign field (converted to TS). Added PMTiles support and multiple custom data layers. All checked in the browser with the test URLs.

## Next steps

- Known upstream behavior: leaving (blur) a directional combo row without typing rewrites `cycleway:both=no` to `cycleway=no` (upstream `directional_combo.js` calls `change` on blur and uses the common key when both sides match). Equivalent for TILDA, but an unexpected edit. Consider not writing on blur when nothing changed.
- Known issue: deleting the active custom background switches to "None" instead of the previous background (from the backgrounds branch).
- Features 8–10 (plans above).
- T10: two-account test of live touched (feature 11).
- Feature 12 (read-only categories): ready to build (v1 without interaction).
- German strings for the new UI (favorites, custom data layers, lenses, way table).
- Way table v2: raw tag editing.
- Features 18–20: Mapillary layer, image fields, set-photo targets.
- Feature 15: side-variant fields (`cycleway:<side>:separation…`), preset category, `footwayBicycleYes` preset.
- Feature 9 validations, using the data index (feature 16) as the rule list.
- Feature 17 v2: extract along the chain; snap the ends.
- Feature 29: run the TILDA prompt; build the iD layer once the API exists.
- Feature 28: check the hover preview; tune the length (15 m / 20 %) and distance (25 m) limits on real data.
- Decide whether iD's single "Custom Map Data" row should stay next to the new "Custom Data Layers" section.

## Open questions

- How to bring features in: merge the source branches (easy to re-sync) or cherry-pick (cleaner history)? Default: merge.
- Where will the build be deployed for project users?
- TILDA exports a side track without `oneway` as two-way (`assumed_no`); the Berlin default is "with the traffic" (feature 32).
- TILDA processing ignores `oneway=-1` (`derive_oneway.lua` only reads `yes` / `no`, else the category default). To check in TILDA, not here (feature 32).
