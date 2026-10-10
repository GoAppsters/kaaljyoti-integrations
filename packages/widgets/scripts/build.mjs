/**
 * The outputs (design decision 12, and the loader of the integrations revamp):
 *
 *   dist/v1.js            the CDN loader — IIFE, minified, a few hundred bytes
 *   dist/v<semver>.js     the same bytes, pinned, for a page that wants them
 *   dist/kj-*.js          the element chunks and their shared core — ESM with
 *                         code splitting, content-hashed names, loaded by
 *                         v1.js from its own directory on first use
 *   dist/cdn-files.json   the list of the above, for whatever copies them
 *                         (the WordPress build, the CDN upload)
 *   dist/index.js         the npm file — ESM, every element, readable,
 *                         sourcemapped
 *   dist/types/*.d.ts     the npm types
 *
 * The CDN files carry no sourcemap comment on purpose: the map would be a
 * second file on the CDN that nothing fetches, and a `//# sourceMappingURL`
 * for a file that is not there is a 404 in every visitor's devtools. The ESM
 * build is the one a developer steps through, so that one gets a linked map.
 *
 * Every CDN file sits flat in one directory, so a host that copies them can
 * keep them in one folder: a chunk's imports of its siblings are `./kj-…js`.
 */

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';
import ts from 'typescript';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(packageDir, 'dist');

const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));

/**
 * The shadow stylesheet, minified on its way in as text.
 *
 * The text loader inlines a file as it is, and `base.css` is written to be
 * read — most of its bytes are the comments that say why a rule exists. They
 * cost every visitor a download and count against the 24 KB budget, so the
 * CSS goes through esbuild's own CSS minifier first and ships as rules only.
 */
const minifiedCss = {
  name: 'minified-css',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const { code } = await esbuild.transform(source, { loader: 'css', minify: true });
      return { contents: code.trim(), loader: 'text' };
    });
  },
};

/**
 * The markup in `html\`…\`` templates, without its indentation.
 *
 * esbuild keeps a template literal's text as written, so every line of a
 * form or a card shipped with the indentation that makes the source readable.
 * A run of whitespace with a line break in it renders exactly like one space
 * (no element here is `white-space: pre`), so each such run becomes one, and
 * HTML comments go. Only the literal text of templates tagged `html` is
 * touched — found by TypeScript's own parser, not a regex, so a backtick in a
 * comment or a regex cannot fool it — and the `${…}` expressions are left
 * alone.
 */
const compactHtml = {
  name: 'compact-html',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/].*\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
      const ranges = [];
      const visit = (node) => {
        if (ts.isTaggedTemplateExpression(node) && node.tag.getText(file) === 'html') {
          const template = node.template;
          const parts = ts.isNoSubstitutionTemplateLiteral(template)
            ? [template]
            : [template.head, ...template.templateSpans.map((span) => span.literal)];
          for (const part of parts) {
            // Past the opening backtick or brace; before the `${` or backtick.
            const closes = ts.isTemplateHead(part) || ts.isTemplateMiddle(part) ? 2 : 1;
            ranges.push([part.getStart(file) + 1, part.getEnd() - closes]);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      let contents = source;
      for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
        const text = contents
          .slice(start, end)
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\s*\n\s*/g, ' ');
        contents = contents.slice(0, start) + text + contents.slice(end);
      }
      return { contents, loader: 'ts' };
    });
  },
};

/** Shared by both builds, so the two cannot disagree about the version. */
const common = {
  bundle: true,
  target: 'es2020',
  charset: 'utf8',
  define: { __KJ_VERSION__: JSON.stringify(pkg.version) },
  plugins: [minifiedCss, compactHtml],
  logLevel: 'warning',
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

/** The elements, by tag, and the chunk entry of each (`src/lazy/*.ts`). */
const ELEMENTS = [
  'panchang',
  'muhurta',
  'chart',
  'kundli-form',
  'match-form',
  'horoscope',
  'reading',
  // Stage 2 (decision 24).
  'panchang-month',
  'calendar',
  'transits',
  'ephemeris',
  'moon-sign',
  'lagna',
  'manglik',
  'sade-sati',
  'dasha',
  'vargas',
  'kp',
  'strength',
  'life-areas',
  'varshphal',
  'vimshottari-reading',
];

/**
 * The first line of every minified file: where its readable source is. The
 * WordPress.org guidelines (4, human-readable code) ask that the source of
 * shipped minified code be easy to find; `/*!` survives minification.
 */
const SOURCE_BANNER = {
  js:
    `/*! Kaal Jyoti widgets ${pkg.version} (MIT, GoAppsters). Minified; the human-readable ` +
    'source is in widgets-src/ in the WordPress plugin, and at ' +
    'https://github.com/goappsters/kaaljyoti-integrations/tree/main/packages/widgets */',
};

// The chunks first: the loader is built with the names they came out with.
const chunks = await esbuild.build({
  ...common,
  entryPoints: Object.fromEntries(
    ELEMENTS.map((name) => [`kj-${name}`, join(packageDir, `src/lazy/${name}.ts`)]),
  ),
  outdir: dist,
  format: 'esm',
  splitting: true,
  minify: true,
  banner: SOURCE_BANNER,
  sourcemap: false,
  entryNames: '[name]-[hash]',
  chunkNames: 'kj-core-[hash]',
  metafile: true,
});

/** Tag → the file its entry was written to. */
const chunkTable = {};
const chunkFiles = [];
for (const [file, output] of Object.entries(chunks.metafile.outputs)) {
  const name = file.split('/').pop();
  chunkFiles.push(name);
  if (!output.entryPoint) continue;
  const element = ELEMENTS.find((candidate) => output.entryPoint.endsWith(`lazy/${candidate}.ts`));
  if (element) chunkTable[`kj-${element}`] = name;
}
chunkFiles.sort();

await esbuild.build({
  ...common,
  define: { ...common.define, __KJ_CHUNKS__: JSON.stringify(chunkTable) },
  entryPoints: [join(packageDir, 'src/cdn.ts')],
  outfile: join(dist, 'v1.js'),
  format: 'iife',
  minify: true,
  banner: SOURCE_BANNER,
  sourcemap: false,
});

const cdnFile = await readFile(join(dist, 'v1.js'));
await writeFile(join(dist, `v${pkg.version}.js`), cdnFile);
await writeFile(
  join(dist, 'cdn-files.json'),
  `${JSON.stringify({ loader: 'v1.js', pinned: `v${pkg.version}.js`, elements: chunkTable, chunks: chunkFiles }, null, 2)}\n`,
);

await esbuild.build({
  ...common,
  entryPoints: [join(packageDir, 'src/index.ts')],
  outfile: join(dist, 'index.js'),
  format: 'esm',
  minify: false,
  sourcemap: 'linked',
});

// Declarations come from tsc, not esbuild, which does not emit them. The
// separate tsconfig keeps `test/` and `scripts/` out of the published types.
execFileSync(join(packageDir, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.build.json'], {
  cwd: packageDir,
  stdio: 'inherit',
});

const esmFile = await readFile(join(dist, 'index.js'));
const report = [
  ['v1.js', cdnFile],
  ...(await Promise.all(chunkFiles.map(async (name) => [name, await readFile(join(dist, name))]))),
  ['index.js', esmFile],
];
for (const [name, contents] of report) {
  const raw = (contents.length / 1024).toFixed(1);
  const gzip = (gzipSync(contents).length / 1024).toFixed(1);
  console.log(`dist/${name.padEnd(28)} ${raw.padStart(6)} KB  ${gzip.padStart(6)} KB gzipped`);
}
