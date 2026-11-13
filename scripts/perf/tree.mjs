// Call tree of one function in a saved CPU profile, merged over all its calls, with the source
// module of each frame. Usage: node scripts/perf/tree.mjs <file.cpuprofile> <functionName> [depth] [minMs]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [file, fn, depthArg, minArg] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
const maxDepth = Number(depthArg) || 5, min = (Number(minArg) || 10) * 1000;

const ranges = [];
fs.readFileSync(path.join(root, 'dist/perf/iD.js'), 'utf8').split('\n').forEach((text, i) => {
    const m = /^ {2}\/\/ ((?:modules|node_modules|config)\/\S+)$/.exec(text);
    if (m) ranges.push([i, m[1]]);
});
const moduleOf = line => { let found = ''; for (const [l, m] of ranges) { if (l > line) break; found = m; } return found; };

const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map();
profile.samples.forEach((s, i) => self.set(s, (self.get(s) || 0) + profile.timeDeltas[i]));
const totals = new Map();
const total = id => {
    if (totals.has(id)) return totals.get(id);
    const n = nodes.get(id);
    const t = (self.get(id) || 0) + (n.children || []).reduce((sum, c) => sum + total(c), 0);
    totals.set(id, t);
    return t;
};
const name = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.includes('iD.js') ? moduleOf(n.callFrame.lineNumber).replace(/^modules\//, '') : ''}`.trim();

function merge(ids, depth, indent) {
    const groups = new Map();
    for (const id of ids) for (const c of nodes.get(id).children || []) {
        const k = name(nodes.get(c));
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
    }
    const rows = [...groups].map(([k, cs]) => [k, cs, cs.reduce((s, c) => s + total(c), 0)]).sort((a, b) => b[2] - a[2]);
    for (const [k, cs, t] of rows) {
        if (t < min) continue;
        console.log(`${indent}${(t / 1000).toFixed(0).padStart(5)} ms ${k}`);
        if (depth < maxDepth) merge(cs, depth + 1, indent + '  ');
    }
}

const roots = profile.nodes.filter(n => (n.callFrame.functionName || '(anon)') === fn || name(n) === fn).map(n => n.id);
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const rootSet = new Set(roots);
const outer = roots.filter(id => { for (let c = parent.get(id); c; c = parent.get(c)) if (rootSet.has(c)) return false; return true; });
console.log(`${fn}: ${(outer.reduce((s, id) => s + total(id), 0) / 1000).toFixed(0)} ms`);
merge(outer, 1, '  ');
