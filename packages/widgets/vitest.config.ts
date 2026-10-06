import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * `import css from './base.css'` must be the stylesheet's text.
 *
 * That is what esbuild's `text` loader does in the real builds. Vitest, with
 * CSS processing off (its default), swaps every `.css` module for an empty
 * one before a `transform` hook sees it, so the text is read from disk in
 * `load` instead — ahead of Vite's own CSS handling (`enforce: 'pre'`) and
 * under an id without the `.css` suffix, so no later CSS plugin claims it.
 */
const CSS_TEXT_PREFIX = '\0kj-css-text:';

const cssAsText: Plugin = {
  name: 'kj-css-as-text',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!source.endsWith('.css')) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolved) return null;
    return `${CSS_TEXT_PREFIX}${resolved.id}.js`;
  },
  load(id) {
    if (!id.startsWith(CSS_TEXT_PREFIX)) return null;
    const file = id.slice(CSS_TEXT_PREFIX.length, -'.js'.length).replace(/\?.*$/, '');
    return { code: `export default ${JSON.stringify(readFileSync(file, 'utf8'))};`, map: null };
  },
};

export default defineConfig({
  plugins: [cssAsText],
  // The same substitution `scripts/build.mjs` makes, so `CLIENT_TAG` under
  // test is the tag the built bundle sends.
  define: { __KJ_VERSION__: JSON.stringify(pkg.version) },
  test: {
    name: 'widgets',
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
});
