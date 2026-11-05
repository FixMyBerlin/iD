/* eslint-disable no-console */
// Radnetz Berlin: copy TILDA's German labels for the bike infrastructure dataset
// from a local tilda-geo checkout into `data/tilda_labels.de.json`.
// Source: the processed topic docs, `app/src/data/generated/topicDocs/inspectorTranslations.gen.ts`
// (keys like `atlas_bikelanes--category=cycleway_adjoining`).
// Usage: npm run update:tilda-labels [-- path/to/tilda-geo]   (default ~/Development/FMC/tilda-geo)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PREFIX = 'atlas_bikelanes--';
const tildaGeo = process.argv[2] || path.join(os.homedir(), 'Development/FMC/tilda-geo');
const source = path.join(tildaGeo, 'app/src/data/generated/topicDocs/inspectorTranslations.gen.ts');
const target = 'data/tilda_labels.de.json';

// Node strips the TypeScript types itself
const { default: data } = await import(pathToFileURL(source).href);

const labels = Object.fromEntries(Object.entries(data)
  .filter(([key]) => key.startsWith(PREFIX))
  .map(([key, value]) => [key.slice(PREFIX.length), value])
  .sort(([a], [b]) => a.localeCompare(b)));

fs.writeFileSync(target, JSON.stringify(labels, null, 2) + '\n');
console.log(`${Object.keys(labels).length} labels from ${source} → ${target}`);
