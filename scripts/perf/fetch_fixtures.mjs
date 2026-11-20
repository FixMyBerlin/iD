// Downloads the TILDA data layer files of the test link once, for local runs (a person runs this;
// the benchmark itself never goes online). Usage: npm run perf:fixtures
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_FILES } from './config.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
fs.mkdirSync(dir, { recursive: true });

for (const [name, url] of Object.entries(FIXTURE_FILES)) {
    const response = await fetch(url, { headers: { 'User-Agent': 'radnetz-mapping-perf-fixtures' } });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(dir, name), buffer);
    console.log(`${name}: ${(buffer.length / 1e6).toFixed(1)} MB`);
}
