// Fetch the gateway's OpenAPI document into openapi/openapi.json.
//
// The document is built by the gateway at boot from the same schemas it
// validates against, so the copy here is a snapshot of a deployment, not a
// hand-maintained file. Staging is the default because that is where an API
// change lands first; `--prod` asks production instead, and `--file <path>`
// reads a document already on disk (a gateway branch's own build, before it
// is deployed).
//
// The recorded 200 response examples are dropped on the way in. They are a
// docs feature (the API reference shows them), no generator reads them, and
// they are most of the document's size: keeping them would more than double
// the snapshot and turn every engine change into a long, noisy diff here,
// when this file's diff is meant to be the list of API changes. Request
// examples are small and kept.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
let document;
let source;
if (fileIndex !== -1) {
  source = resolve(args[fileIndex + 1] ?? '');
  document = JSON.parse(await readFile(source, 'utf8'));
} else {
  const prod = args.includes('--prod');
  source = prod ? 'https://api.kaaljyoti.com' : 'https://api-staging.kaaljyoti.com';
  const response = await fetch(`${source}/v1/openapi.json`);
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  document = await response.json();
}

let stripped = 0;
for (const item of Object.values(document.paths ?? {})) {
  for (const operation of Object.values(item)) {
    for (const response of Object.values(operation?.responses ?? {})) {
      for (const media of Object.values(response?.content ?? {})) {
        for (const key of ['example', 'examples']) {
          if (key in media) {
            delete media[key];
            stripped += 1;
          }
        }
      }
    }
  }
}

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'openapi', 'openapi.json');
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
// `pnpm lint` checks the snapshot with prettier, whose JSON layout differs
// from JSON.stringify's in places; format it here so a refresh is lint-clean.
execFileSync('pnpm', ['exec', 'prettier', '--write', target], { cwd: root, stdio: 'ignore' });
const paths = Object.keys(document.paths ?? {}).length;
console.log(
  `${target}: ${document.info?.version} from ${source}, ${paths} paths, ` +
    `${stripped} response examples dropped`,
);
