#!/usr/bin/env node
/**
 * Publishes the widget bundle to https://cdn.kaaljyoti.com/widgets/ — the R2
 * bucket `kaaljyoti-cdn`, served on that custom domain (owner, 2026-10-05).
 *
 *   pnpm --filter @kaaljyoti/widgets build
 *   pnpm cdn:publish            # or: node scripts/publish-cdn.mjs --dry-run
 *
 * What goes up, from `packages/widgets/dist/cdn-files.json`:
 *
 *   - every chunk (`kj-*.js`, content-hashed names): cached for a year,
 *     `immutable`. A chunk already on the CDN is skipped — same name, same
 *     bytes.
 *   - the pinned loader (`v<semver>.js`): also immutable. If that version is
 *     already published with different bytes the run stops: bump the widgets
 *     version instead of rewriting a published file.
 *   - the rolling loader (`v1.js`): five minutes, so a fix reaches every site
 *     within minutes. It goes up **last**, after every chunk it names exists.
 *
 * Nothing is ever deleted: a page holding an older loader (cached, or pinned)
 * keeps finding the chunks it asks for. The bucket's CORS rule lets any origin
 * GET, which module scripts need (they are fetched with CORS).
 *
 * Needs `CLOUDFLARE_API_TOKEN` (Workers R2 Storage: Edit) in the environment.
 * Wrangler is pinned (`WRANGLER`), so a release never runs whatever `npx`
 * resolves on the day.
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNT_ID = '2a79455bed8507c355218bf2530cdfff';
const BUCKET = 'kaaljyoti-cdn';
const PREFIX = 'widgets';
const ORIGIN = 'https://cdn.kaaljyoti.com';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const ROLLING = 'public, max-age=300';
const TYPE = 'text/javascript; charset=utf-8';
const WRANGLER = 'wrangler@4.132.0';

const dryRun = process.argv.includes('--dry-run');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'packages/widgets/dist');

if (!process.env.CLOUDFLARE_API_TOKEN && !dryRun) {
  console.error('publish-cdn: CLOUDFLARE_API_TOKEN is not set.');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(dist, 'cdn-files.json'), 'utf8'));

/** The published bytes of a file, or null when it is not there. */
async function published(name) {
  const res = await fetch(`${ORIGIN}/${PREFIX}/${name}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${name}: the CDN answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function put(name, cacheControl) {
  const args = [
    '--yes',
    WRANGLER,
    'r2',
    'object',
    'put',
    `${BUCKET}/${PREFIX}/${name}`,
    '--file',
    join(dist, name),
    '--content-type',
    TYPE,
    '--cache-control',
    cacheControl,
    '--remote',
  ];
  if (dryRun) {
    console.log(`would upload ${name} (${cacheControl})`);
    return;
  }
  execFileSync('npx', args, {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  });
  console.log(`uploaded ${name}`);
}

let uploaded = 0;
let skipped = 0;

for (const chunk of manifest.chunks) {
  if (await published(chunk)) {
    skipped += 1;
    continue;
  }
  put(chunk, IMMUTABLE);
  uploaded += 1;
}

const pinnedBytes = await readFile(join(dist, manifest.pinned));
const pinnedLive = await published(manifest.pinned);
if (pinnedLive === null) {
  put(manifest.pinned, IMMUTABLE);
  uploaded += 1;
} else if (!pinnedLive.equals(pinnedBytes)) {
  console.error(
    `publish-cdn: ${manifest.pinned} is already published with different bytes. ` +
      'Bump the widgets version; a published pinned file never changes.',
  );
  process.exit(1);
} else {
  skipped += 1;
}

put(manifest.loader, ROLLING);
uploaded += 1;

console.log(
  `${dryRun ? 'dry run: ' : ''}${uploaded} uploaded, ${skipped} already there — ` +
    `${ORIGIN}/${PREFIX}/${manifest.loader}`,
);
