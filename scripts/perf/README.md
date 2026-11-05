# Local performance harness

Measures the editor with real mouse input and records where the time goes, without any public
service: the OSM data comes from Maid's mock OSM API (frozen fixtures), the TILDA data layers from
local copies, and the browser blocks every other request. Our key-value DB answers with an empty
list. Background imagery is off, so tile decoding is not part of the numbers.

## Setup (once)

1. A checkout of Maid next to this repo (`~/Development/OSM/Maid`, `bun install` there).
2. `npm run perf:fixtures` downloads the three TILDA files of the test link into
   `scripts/perf/fixtures/` (git-ignored). A person runs this; the benchmark itself never goes online.
3. System Chrome (Playwright drives it through `playwright-core`, no browser download).

## Run

```bash
# Maid's mock OSM API with the fixtures (dense = Neukölln, bbox 13.418,52.476 – 13.448,52.493)
(cd ../Maid && bun tools/mock-osm-api/server.ts --port 8090)

npm run build:css && npm run build:data   # dist/iD.css, dist/data
npm run perf:build                        # dist/perf/iD.js with local endpoints only
npm run perf -- --zoom 17 --label mytest  # starts its own page server on 127.0.0.1:8085
```

The page is the test link of 2026-10-15 (mask and track layers, read-only categories, hidden
categories) at `--center` (default 13.4330,52.4845, inside the fixture).

Steps, with real mouse input: hover, drag pan, wheel zoom, select a road, hover and pan with the
selection, a tag change, undo, Escape, select a data layer line. Per step: frames per second, 95th
percentile and longest frame, frames over 50 ms, long tasks, duration, map movement, full and
partial redraws, rendered vertices, and accidental edits (must stay 0).

The CPU profile is attributed to source modules; `*` marks modules this fork changed. Reports go
to `scripts/perf/reports/` (git-ignored), with the `.cpuprofile` for Chrome's DevTools.

| Option | |
| --- | --- |
| `--zoom`, `--center lon,lat` | where the map starts |
| `--profile-steps dragPan` | profile only these steps |
| `--only dragPan,hoverBrowse` | run only these steps (the selection steps always run) |
| `--trace` | the browser's own work per step (style, layout, paint, …) instead of the JS profile |
| `--no-layers`, `--no-readonly` | without the data layers / read-only categories |
| `--css '…'`, `--eval '…'` | experiments: CSS or JavaScript added after loading |
| `--base-url` | another editor for comparison, e.g. stock iD from Maid's reference build: `bun tools/refs/id/serve.ts` in Maid, then `--base-url 'http://localhost:8081/?scene=dense&validation=1'` |
| `--headed` | watch the browser |

`node scripts/perf/tree.mjs <file.cpuprofile> <function> [depth] [minMs]` prints the call tree of
one function, merged over all its calls.

Numbers vary with the machine's load by 10–30 %; compare runs made one after another. A slower
editor makes the same mouse input take longer (each move waits for the page), so compare frames,
long-task share and redraw counts, not only totals.
