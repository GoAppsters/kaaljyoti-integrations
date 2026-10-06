/**
 * Three outputs, all published:
 *
 *   dist/index.js         ESM, for bundlers and modern Node
 *   dist/index.cjs        CJS, for the Node projects that still `require()`
 *   dist/types/*.d.ts     the types, from tsc
 *
 * `platform: 'neutral'` is the point of the exercise: the package runs in
 * Node, in a browser and on an edge runtime (design decision 8), so esbuild
 * must not reach for a Node built-in or a browser global on its own. Nothing
 * is minified — an SDK is read in stack traces and stepped through in a
 * debugger, and it is not on anybody's critical rendering path.
 */

import { execFileSync } from 'node:child_process';
import { copyFile, readFile, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(packageDir, 'dist');
const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));

/** Shared, so the two formats cannot disagree about the version they send. */
const common = {
  entryPoints: [join(packageDir, 'src/index.ts')],
  bundle: true,
  platform: 'neutral',
  target: 'es2020',
  charset: 'utf8',
  minify: false,
  sourcemap: 'linked',
  define: { __KJ_SDK_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'warning',
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await esbuild.build({ ...common, outfile: join(dist, 'index.js'), format: 'esm' });
await esbuild.build({ ...common, outfile: join(dist, 'index.cjs'), format: 'cjs' });

// Declarations come from tsc, which esbuild does not emit. The separate
// tsconfig keeps `test/` and `scripts/` out of the published types.
execFileSync(join(packageDir, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.build.json'], {
  cwd: packageDir,
  stdio: 'inherit',
});

// tsc emits nothing for a `.d.ts` input, and `types.d.ts` imports the
// generated one by path — so without this copy the published types resolve to
// a file that is not in the tarball.
await mkdir(join(dist, 'types/generated'), { recursive: true });
await copyFile(
  join(packageDir, 'src/generated/openapi.d.ts'),
  join(dist, 'types/generated/openapi.d.ts'),
);

for (const name of ['index.js', 'index.cjs']) {
  const bytes = await readFile(join(dist, name));
  console.log(`dist/${name.padEnd(9)} ${(bytes.length / 1024).toFixed(1).padStart(6)} KB`);
}
