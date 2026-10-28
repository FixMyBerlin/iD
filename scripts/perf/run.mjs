// Local performance run of the editor (scripts/perf/README.md): loads the test link against the
// mock OSM API and local data layer files, plays real mouse input, records frames, long tasks and a
// CPU profile, and attributes the CPU time to source modules (ours or iD's).
//
// Usage: node scripts/perf/run.mjs [--zoom 19.25] [--center 13.4330,52.4845] [--label name] [--no-profile] [--headed]
// Needs: npm run perf:build, Maid's mock API on 8090. Writes scripts/perf/reports/<date>-<label>.json
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { MOCK_API, ORIGIN } from './config.mjs';
import { startServer } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const { values: args } = parseArgs({ options: {
    zoom: { type: 'string', default: '19.25' },
    center: { type: 'string', default: '13.4330,52.4845' },
    label: { type: 'string', default: 'run' },
    'no-profile': { type: 'boolean', default: false },
    trace: { type: 'boolean', default: false },
    /** experiments: CSS added to the page after loading */
    css: { type: 'string', default: '' },
    /** experiments: JavaScript run in the page after loading */
    eval: { type: 'string', default: '' },
    /** run only these steps (comma separated) */
    only: { type: 'string', default: '' },
    /** profile only these steps (comma separated); the others still run */
    'profile-steps': { type: 'string', default: '' },
    'no-layers': { type: 'boolean', default: false },
    'no-readonly': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    /** another editor page for comparison, e.g. stock iD from Maid's reference build:
        http://127.0.0.1:8081/?scene=dense&validation=1 (bun tools/refs/id/serve.ts in the Maid repo) */
    'base-url': { type: 'string', default: '' },
    width: { type: 'string', default: '1600' },
    height: { type: 'string', default: '1000' }
} });

const [lon, lat] = args.center.split(',').map(Number);
const layers = args['no-layers'] ? '' :
    `&data_layers=${ORIGIN}/fixtures/infravelo-ren-netz-kartierung-mask.pmtiles%7CMaske%7Cff26d4%7C%7Co` +
    `%3B${ORIGIN}/fixtures/infravelo-ren-kartierung-tracks.pmtiles%7CTrack%7Cffc400%7C%7C%7Ctrack`;
// the test link of 2026-10-15, at a place inside the fixture
const hash = 'disable_features=address_points,building_parts,indoor,boundaries,water,pistes,aerialways,power' +
    `&notes=tilda&map=${args.zoom}/${lat}/${lon}&background=Berlin-2026${layers}` +
    (args['no-readonly'] ? '' : '&readonly_features=points,buildings,landuse,rail,past_future,others');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const server = await startServer().catch(() => undefined);   // already running is fine
const browser = await chromium.launch({ channel: 'chrome', headless: !args.headed });
const browserContext = await browser.newContext({ viewport: { width: Number(args.width), height: Number(args.height) }, deviceScaleFactor: 1 });

// only this machine: the page, the mock API; our key-value DB answers empty; everything else is blocked
const blocked = [];
await browserContext.route('**/*', route => {
    const url = route.request().url();
    const local = url.startsWith(ORIGIN) || url.startsWith(MOCK_API) || url.startsWith('data:') || url.startsWith('blob:') ||
        (args['base-url'] && url.startsWith(new URL(args['base-url']).origin));
    if (local) return route.continue();
    if (url.startsWith('https://key-value-store.fixmycity.workers.dev/')) {
        const one = /\/entries\/[^?]+$/.test(new URL(url).pathname);
        return route.fulfill({ status: one ? 404 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
            body: one ? '{"error":{"code":"not_found","message":"not found"}}' : '{"items":[],"next_cursor":null}' });
    }
    blocked.push(url.slice(0, 120));
    return route.abort();
});
await browserContext.addInitScript(() => {
    try {
        localStorage.clear();
        localStorage.setItem('sawSplash', 'true');
        localStorage.setItem('sawPrivacyVersion', '99999999');
    } catch { /* ignore */ }
});

const page = await browserContext.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

// ---- load until settled: the entities in view stop changing and the data layers are drawn
const start = Date.now();
const pageUrl = args['base-url'] ? `${args['base-url']}#${hash}` : `${ORIGIN}/perf.html#${hash}`;
await page.goto(pageUrl);
await page.waitForFunction(() => window.context && window.context.history, null, { timeout: 60000 });
let last = -1, stableSince = Date.now();
while (Date.now() - start < 90000) {
    const count = await page.evaluate(() => {
        const c = window.context;
        return c.history().intersects(c.map().extent()).length + document.querySelectorAll('.main-map path').length;
    });
    if (count !== last) { last = count; stableSince = Date.now(); }
    if (count > 0 && Date.now() - stableSince > 2000) break;
    await sleep(200);
}
const loadMs = stableSince - start;
const scene = await page.evaluate(() => ({
    inView: window.context.history().intersects(window.context.map().extent()).length,
    svgElements: document.querySelectorAll('.main-map svg *').length,
    dataLayerPaths: document.querySelectorAll('.main-map .layer-custom-data path').length,
    map: window.context.map().dimensions()
}));

// the welcome dialog would cover the map (it also shows for a new privacy version); the sidebar
// is open in both editors, so the map has the same size
await page.evaluate(() => {
    document.querySelectorAll('.shaded').forEach(element => element.remove());
    if (window.context.ui().sidebar?.expand) window.context.ui().sidebar.expand();
});
await sleep(500);
if (args.css) await page.addStyleTag({ content: args.css });
if (args.eval) console.log('eval:', await page.evaluate(code => String(eval(code)), args.eval));

// ---- frames and long tasks per step
await page.evaluate(() => {
    window.__frames = []; window.__long = [];
    let lastTime = performance.now();
    (function loop() { const now = performance.now(); window.__frames.push(now - lastTime); lastTime = now; requestAnimationFrame(loop); })();
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__long.push(entry.duration); }).observe({ entryTypes: ['longtask'] });
    // input latency: how long each pointer event took from input to the next frame
    window.__events = [];
    new PerformanceObserver(list => {
        for (const e of list.getEntries()) window.__events.push({ name: e.name, duration: e.duration, processing: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime });
    }).observe({ type: 'event', durationThreshold: 16, buffered: false });
    window.__mark = () => {
        const frames = window.__frames.splice(0).slice(1), long = window.__long.splice(0);
        const events = window.__events.splice(0).filter(e => /pointermove|mousemove|pointerdown|wheel|click|pointerup/.test(e.name));
        const avg = (list, key) => list.length ? Math.round(list.reduce((a, e) => a + e[key], 0) / list.length) : 0;
        const total = frames.reduce((a, b) => a + b, 0) || 1;
        const sorted = [...frames].sort((a, b) => a - b);
        return {
            fps: Math.round(frames.length / total * 1000),
            p95Frame: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0),
            maxFrame: Math.round(sorted[sorted.length - 1] || 0),
            framesOver50: frames.filter(f => f > 50).length,
            longTaskMs: Math.round(long.reduce((a, b) => a + b, 0)),
            longestTask: Math.round(Math.max(0, ...long)),
            // events over 16 ms: count, average duration (input to next paint) and handler time
            slowEvents: events.length, eventMs: avg(events, 'duration'), handlerMs: avg(events, 'processing')
        };
    };
});

const cdp = await browserContext.newCDPSession(page);
// --trace: the browser's own work per step (style, layout, paint, …) instead of the JS profile
const traceEvents = [];
let traceDone;
if (args.trace) {
    cdp.on('Tracing.dataCollected', event => traceEvents.push(...event.value));
    cdp.on('Tracing.tracingComplete', () => traceDone?.());
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
} else if (!args['no-profile']) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    if (!args['profile-steps']) await cdp.send('Profiler.start');
}

const mapBox = await page.evaluate(() => { const r = document.querySelector('.main-map').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const cx = mapBox.x + mapBox.w / 2, cy = mapBox.y + mapBox.h / 2;
/** A point on the empty map near the center: a drag there pans and never moves a node */
async function emptyPoint() {
    return page.evaluate(([x0, y0]) => {
        for (let r = 0; r < 300; r += 6) {
            for (let a = 0; a < 16; a++) {
                const x = x0 + r * Math.cos(a / 16 * 2 * Math.PI), y = y0 + r * Math.sin(a / 16 * 2 * Math.PI);
                const el = document.elementFromPoint(x, y);
                if (el && (el.classList.contains('surface') || el.closest('.layer-background, .supersurface') && !el.closest('.layer-osm, .layer-touch, .layer-mapdata'))) return [x, y];
            }
        }
        return [x0, y0];
    }, [cx, cy]);
}
const steps = {};
const stepProfiles = [];
const profileSteps = new Set(args['profile-steps'].split(',').filter(Boolean));
const onlySteps = new Set(args.only.split(',').filter(Boolean));
await page.evaluate(() => {
    window.__lastCenter = window.context.map().center();
    window.__draws = { full: 0, partial: 0 };
    window.__drawStacks = [];
    window.context.map().on('drawn.perfHarness', info => {
        window.__draws[info && info.full ? 'full' : 'partial']++;
        if (info && info.full) window.__drawStacks.push(new Error().stack.split('\n').slice(2, 14).map(l => l.trim().replace(/\(?http:\/\/[^)]*\/(dist\/perf\/)?/, '').replace(/\)$/, '')).filter(l => !/d3-dispatch|call_default|dispatch\.js|debounce|throttle|invoke|edges|signal|onTimerEnd|drawEditable|redraw \(|immediateRedraw/.test(l)).slice(0, 4).join(' < '));
    });
});
async function step(name, fn) {
    // the selection steps always run: later steps need their state
    if (onlySteps.size && !onlySteps.has(name) && !['selectWay', 'escape'].includes(name)) return;
    const profiling = profileSteps.has(name) && !args['no-profile'] && !args.trace;
    if (profiling) await cdp.send('Profiler.start');
    await page.evaluate(n => { window.__mark(); performance.mark(`step-start:${n}`); }, name);
    const t0 = Date.now();
    await fn();
    await sleep(500);
    steps[name] = { ...(await page.evaluate(n => {
        performance.mark(`step-end:${n}`);
        // a step must not edit by accident (e.g. a drag that moves a node instead of the map)
        const center = window.context.map().center();
        const moved = window.__lastCenter ? Math.round(Math.hypot(center[0] - window.__lastCenter[0], center[1] - window.__lastCenter[1]) * 1e6) / 10 : 0;
        window.__lastCenter = center;
        const draws = window.__draws;
        window.__draws = { full: 0, partial: 0 };
        const vertices = document.querySelectorAll('.layer-osm g.vertex').length;
        return { ...window.__mark(), vertices, mode: window.context.mode().id, edits: window.context.history().difference().summary().length, movedM: moved, fullDraws: draws.full, partialDraws: draws.partial };
    }, name)), ms: Date.now() - t0 };
    if (profiling) stepProfiles.push((await cdp.send('Profiler.stop')).profile);
}
async function sweep(pressed) {
    for (let i = 0; i < 120; i++) {
        await page.mouse.move(cx + mapBox.w * 0.3 * Math.sin(i / 10), cy + mapBox.h * 0.3 * Math.sin(i / 6));
        await sleep(16);
    }
    if (pressed) await page.mouse.up();
}
/** A point on a line of the given kind, on screen and not under the sidebar */
async function pointOn(selector) {
    return page.evaluate(sel => {
        const r = document.querySelector('.main-map').getBoundingClientRect();
        // a few candidates are enough; testing thousands would show up in the profile
        for (const el of [...document.querySelectorAll(sel)].slice(0, 300)) {
            const length = el.getTotalLength ? el.getTotalLength() : 0;
            if (!length) continue;
            const p = el.getPointAtLength(length / 2);
            const m = el.getScreenCTM();
            const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
            if (x < r.left + 80 || x > r.right - 80 || y < r.top + 80 || y > r.bottom - 80) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit === el) return { x, y };
        }
        return null;
    }, selector);
}

if (process.env.PERF_DEBUG) process.on('exit', () => {});
if (process.env.PERF_DEBUG) console.log('at center:', await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el && `${el.tagName}.${el.getAttribute('class')}`; }, [cx, cy]));
await step('hoverBrowse', () => sweep(false));
await step('dragPan', async () => { const [x, y] = await emptyPoint(); await page.mouse.move(x, y); await page.mouse.down(); await sweep(true); });
await step('wheelZoom', async () => {
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, i < 5 ? -120 : 120); await sleep(150); }
    await sleep(800);
});
const road = await pointOn('.layer-touch path.line.target');
await step('selectWay', async () => { if (road) await page.mouse.click(road.x, road.y); await sleep(700); });
const selected = await page.evaluate(() => window.context.selectedIDs());
await step('hoverSelected', () => sweep(false));
await step('dragPanSelected', async () => { const [x, y] = await emptyPoint(); await page.mouse.move(x, y); await page.mouse.down(); await sweep(true); });
await step('tagChange', async () => {
    await page.evaluate(() => {
        const c = window.context, id = c.selectedIDs()[0];
        if (id) c.perform(iD.actionChangeTags(id, { ...c.entity(id).tags, perf_test: 'yes' }), 'perf');
    });
    await sleep(400);
});
await step('undo', async () => { await page.evaluate(() => window.context.undo()); await sleep(400); });
await step('escape', async () => { await page.keyboard.press('Escape'); await sleep(400); });
const line = await pointOn('.layer-custom-data:not(.not-selectable) path.shadow');
await step('selectDataLine', async () => { if (line) await page.mouse.click(line.x, line.y); await sleep(700); });
const dataSelected = await page.evaluate(() => window.context.mode().id);
await step('escape2', async () => { await page.keyboard.press('Escape'); await sleep(400); });

if (process.env.PERF_DEBUG) {
    const stacks = await page.evaluate(() => window.__drawStacks);
    const counts = new Map();
    for (const stack of stacks) counts.set(stack, (counts.get(stack) || 0) + 1);
    const cancels = await page.evaluate(() => window.__cancels || []);
    const cc = new Map(); for (const c of cancels) cc.set(c, (cc.get(c) || 0) + 1);
    console.log(`throttle cancels: ${cancels.length}`); for (const [c, n] of [...cc].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${n}x ${c}`);
    console.log('full draws by trigger:');
    for (const [stack, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${n}x ${stack}`);
}

// ---- CPU profile, attributed to the source modules of the bundle
let profileSummary;
if (args.trace) {
    const done = new Promise(resolve => { traceDone = resolve; });
    await cdp.send('Tracing.end');
    await done;
    summarizeTrace(traceEvents, steps);
} else if (!args['no-profile']) {
    // one step profiled (--profile-steps): its profile; else the whole interaction
    const profile = args['profile-steps'] ? stepProfiles[0] : (await cdp.send('Profiler.stop')).profile;
    profileSummary = summarize(profile);
    fs.mkdirSync(path.join(here, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(here, 'reports', `${stamp()}-${args.label}.cpuprofile`), JSON.stringify(profile));
}

const report = { label: args.label, url: pageUrl, loadMs, scene, road: !!road, selected, dataLine: !!line, dataSelected, steps, profile: profileSummary, blocked: [...new Set(blocked)], errors };
fs.mkdirSync(path.join(here, 'reports'), { recursive: true });
const out = path.join(here, 'reports', `${stamp()}-${args.label}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
print(report);
console.log(`\nwrote ${path.relative(root, out)}`);

await browser.close();
server?.close();


function stamp() {
    return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

/** Line ranges of the bundle → source module, from esbuild's `// modules/...` comments */
function moduleRanges() {
    const lines = fs.readFileSync(path.join(root, 'dist/perf/iD.js'), 'utf8').split('\n');
    const ranges = [];
    lines.forEach((text, i) => {
        const m = /^ {2}\/\/ ((?:modules|node_modules|config)\/\S+)$/.exec(text);
        if (m) ranges.push({ line: i, module: m[1].startsWith('node_modules/') ? m[1].split('/').slice(0, m[1].includes('/@') ? 3 : 2).join('/') : m[1] });
    });
    return ranges;
}

function forkFiles() {
    try {
        const base = execSync('git merge-base HEAD upstream/develop', { cwd: root }).toString().trim();
        return new Set(execSync(`git diff --name-only ${base} HEAD -- modules`, { cwd: root }).toString().trim().split('\n'));
    } catch {
        return new Set();
    }
}

function summarize(profile) {
    const ranges = moduleRanges();
    const fork = forkFiles();
    const moduleOf = line => {
        let lo = 0, hi = ranges.length - 1, found = '(other)';
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (ranges[mid].line <= line) { found = ranges[mid].module; lo = mid + 1; } else hi = mid - 1;
        }
        return found;
    };
    const nodes = new Map(profile.nodes.map(n => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const child of n.children || []) parent.set(child, n.id);
    const self = new Map();
    profile.samples.forEach((s, i) => self.set(s, (self.get(s) || 0) + profile.timeDeltas[i]));

    const isBundle = n => n.callFrame.url.includes('/dist/perf/iD.js');
    const label = n => {
        const f = n.callFrame;
        if (!f.url) return f.functionName || '(program)';
        if (!isBundle(n)) return `${f.functionName || '(anon)'} [${f.url.split('/').pop()}]`;
        return `${f.functionName || '(anon)'} ${moduleOf(f.lineNumber)}`;
    };
    const bySelfModule = new Map(), bySelfFn = new Map(), byTotalFn = new Map(), byTotalModule = new Map();
    let total = 0, idle = 0;
    for (const [id, t] of self) {
        const n = nodes.get(id);
        total += t;
        if (n.callFrame.functionName === '(idle)') { idle += t; continue; }
        const mod = isBundle(n) ? moduleOf(n.callFrame.lineNumber) : (n.callFrame.url ? 'other script' : n.callFrame.functionName || '(native)');
        bySelfModule.set(mod, (bySelfModule.get(mod) || 0) + t);
        bySelfFn.set(label(n), (bySelfFn.get(label(n)) || 0) + t);
        // total time: once per function and per module on the stack
        const seenFn = new Set(), seenMod = new Set();
        for (let cur = id; cur; cur = parent.get(cur)) {
            const c = nodes.get(cur);
            const fnKey = label(c);
            if (!seenFn.has(fnKey)) { seenFn.add(fnKey); byTotalFn.set(fnKey, (byTotalFn.get(fnKey) || 0) + t); }
            if (isBundle(c)) {
                const m = moduleOf(c.callFrame.lineNumber);
                if (!seenMod.has(m)) { seenMod.add(m); byTotalModule.set(m, (byTotalModule.get(m) || 0) + t); }
            }
        }
    }
    const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([key, t]) => ({ key, ms: Math.round(t / 1000), fork: fork.has(key.split(' ').pop()) || fork.has(key) }));
    return {
        busyMs: Math.round((total - idle) / 1000),
        idleMs: Math.round(idle / 1000),
        selfByModule: top(bySelfModule, 25),
        totalByModule: top(byTotalModule, 30),
        selfByFunction: top(bySelfFn, 30),
        totalByFunction: top(byTotalFn, 40)
    };
}

/** Per step: time of the renderer main thread by event (only events that are not inside another) */
function summarizeTrace(events, stepStats) {
    const main = events.find(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
    const marks = events.filter(e => e.cat?.includes('blink.user_timing') && /^step-(start|end):/.test(e.name));
    const onMain = events.filter(e => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur);
    for (const name of Object.keys(stepStats)) {
        const startMark = marks.find(m => m.name === `step-start:${name}`), endMark = marks.find(m => m.name === `step-end:${name}`);
        if (!startMark || !endMark) continue;
        const inStep = onMain.filter(e => e.ts >= startMark.ts && e.ts <= endMark.ts);
        const byName = new Map();
        for (const e of inStep) {
            if (['RunTask', 'ThreadControllerImpl::RunTask'].includes(e.name)) continue;
            byName.set(e.name, (byName.get(e.name) || 0) + e.dur / 1000);
        }
        stepStats[name].mainThread = Object.fromEntries([...byName].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)]));
    }
}

function print(r) {
    console.log(`${r.label}: load ${r.loadMs} ms, ${r.scene.inView} entities in view, ${r.scene.svgElements} svg elements, ${r.scene.dataLayerPaths} data layer paths`);
    console.log(`road selected: ${JSON.stringify(r.selected)}, data line: ${r.dataSelected}`);
    console.log('step               fps  p95  max  >50ms  long-task-ms  longest   ms  slowEvents eventMs handlerMs');
    for (const [name, s] of Object.entries(r.steps)) {
        console.log(`${name.padEnd(18)} ${String(s.fps).padStart(4)} ${String(s.p95Frame).padStart(4)} ${String(s.maxFrame).padStart(4)} ${String(s.framesOver50).padStart(6)} ${String(s.longTaskMs).padStart(13)} ${String(s.longestTask).padStart(8)} ${String(s.ms).padStart(6)} ${String(s.slowEvents).padStart(5)} ${String(s.eventMs).padStart(7)} ${String(s.handlerMs).padStart(7)}`);
        console.log(`${''.padEnd(19)}mode ${s.mode}, ${s.vertices} vertices, edits ${s.edits}, map moved ~${s.movedM} m, draws ${s.fullDraws} full / ${s.partialDraws} partial`);
        if (s.mainThread) console.log(`${''.padEnd(19)}${Object.entries(s.mainThread).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
    if (r.profile) {
        console.log(`\nCPU busy ${r.profile.busyMs} ms (idle ${r.profile.idleMs} ms). Self time by module (* = changed in this fork):`);
        for (const m of r.profile.selfByModule.slice(0, 15)) console.log(`  ${String(m.ms).padStart(6)} ms  ${m.fork ? '*' : ' '} ${m.key}`);
        console.log('Total time by module:');
        for (const m of r.profile.totalByModule.slice(0, 20)) console.log(`  ${String(m.ms).padStart(6)} ms  ${m.fork ? '*' : ' '} ${m.key}`);
    }
    if (r.blocked.length) console.log(`\nblocked outside requests (${r.blocked.length}): ${r.blocked.slice(0, 6).join(', ')}`);
    if (r.errors.length) console.log(`page errors: ${r.errors.slice(0, 4).join(' | ')}`);
}
