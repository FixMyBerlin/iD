// Local server of the performance harness: the host page, dist/, presets from node_modules and the
// data layer fixtures (with HTTP ranges, which PMTiles needs). Usage: npm run perf:serve
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, ORIGIN, PORT } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const MOUNTS = [
    ['/cdn/id-tagging-schema/', path.join(root, 'node_modules/@openstreetmap/id-tagging-schema/')],
    ['/cdn/osm-community-index/', path.join(root, 'node_modules/osm-community-index/')],
    ['/fixtures/', path.join(here, 'fixtures/')],
    ['/dist/', path.join(root, 'dist/')]
];
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json',
    '.pmtiles': 'application/octet-stream', '.geojson': 'application/geo+json', '.woff2': 'font/woff2'
};

function fileFor(urlPath) {
    if (urlPath === '/' || urlPath === '/perf.html') return path.join(here, 'index.html');
    for (const [prefix, dir] of MOUNTS) {
        if (!urlPath.startsWith(prefix)) continue;
        const file = path.resolve(dir, decodeURIComponent(urlPath.slice(prefix.length)));
        return file.startsWith(dir) ? file : undefined;
    }
    return undefined;
}

export function startServer() {
    const server = http.createServer((req, res) => {
        const urlPath = new URL(req.url, ORIGIN).pathname;
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
        if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
        // services the editor must not reach: answer at once, like an empty service
        if (urlPath.startsWith('/blackhole/')) { res.writeHead(404, headers); res.end(); return; }

        const file = fileFor(urlPath);
        if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, headers); res.end(); return; }
        const size = fs.statSync(file).size;
        headers['Content-Type'] = TYPES[path.extname(file)] || 'application/octet-stream';
        headers['Accept-Ranges'] = 'bytes';

        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (range) {
            const start = range[1] ? Number(range[1]) : size - Number(range[2]);
            const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
            res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
            fs.createReadStream(file, { start, end }).pipe(res);
            return;
        }
        res.writeHead(200, { ...headers, 'Content-Length': size });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(PORT, HOST, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await startServer();
    console.log(`perf harness on ${ORIGIN}/perf.html`);
}
