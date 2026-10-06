/**
 * The size budgets, enforced in CI (design decision 12 and the loader of the
 * integrations revamp, §5).
 *
 * Gzipped, because that is what a visitor downloads. Four budgets:
 *
 *   - the loader, `v1.js`, which every page with a widget pays: 6 KB;
 *   - each element's own chunk: 10 KB;
 *   - each shared chunk (`kj-core-*`): 24 KB;
 *   - each element's whole page — the loader, its chunk and every shared
 *     chunk it imports, followed transitively: 40 KB. This is the number a
 *     site owner feels, and what the single 24 KB bundle used to be; the
 *     kundli report (five tabs, the charts, the planets table, the dasha
 *     timeline and the new form) is the one near it, and a panchang page
 *     is about 25 KB.
 *
 * The numbers are not arbitrary: a widget that costs more than a small hero
 * image is one a site owner will think twice about putting on every page,
 * and thinking twice is the thing this package exists to avoid.
 */

import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KB = 1024;
const BUDGETS = { loader: 6 * KB, element: 10 * KB, shared: 24 * KB, page: 40 * KB };

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(packageDir, 'dist');
const manifest = JSON.parse(await readFile(join(dist, 'cdn-files.json'), 'utf8'));

const sizes = new Map();
const imports = new Map();
async function load(name) {
  if (sizes.has(name)) return;
  const contents = await readFile(join(dist, name));
  sizes.set(name, gzipSync(contents).length);
  const text = contents.toString('utf8');
  // Static imports only: `import{…}from"./kj-core-X.js"` and `import"./…"`.
  const found = [...text.matchAll(/(?:from|import)\s*"\.\/(kj-[\w-]+\.js)"/g)].map((m) => m[1]);
  imports.set(name, found);
  for (const next of found) await load(next);
}

await load(manifest.loader);
for (const name of manifest.chunks) await load(name);

/** Every file a page with this entry downloads, loader included. */
function closure(name, seen = new Set()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  for (const next of imports.get(name) ?? []) closure(next, seen);
  return seen;
}

const rows = [];
let over = false;
const check = (label, bytes, budget) => {
  const fails = bytes > budget;
  over ||= fails;
  rows.push(
    `${label.padEnd(34)} ${(bytes / KB).toFixed(1).padStart(6)} KB gz   budget ${(budget / KB).toFixed(0).padStart(2)} KB${fails ? '   OVER' : ''}`,
  );
};

check(manifest.loader, sizes.get(manifest.loader), BUDGETS.loader);
const entries = new Set(Object.values(manifest.elements));
for (const name of manifest.chunks) {
  check(name, sizes.get(name), entries.has(name) ? BUDGETS.element : BUDGETS.shared);
}
rows.push('');
for (const [tag, entry] of Object.entries(manifest.elements)) {
  const files = closure(entry, new Set([manifest.loader]));
  const total = [...files].reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0);
  check(`page with <${tag}>`, total, BUDGETS.page);
}

console.log(rows.join('\n'));
if (over) process.exit(1);
