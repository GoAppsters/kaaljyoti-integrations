/**
 * The CDN entry: one `<script>` tag, and the page's `<kj-…>` elements load
 * their own code as they appear (integrations revamp §5; `core/loader.ts`).
 *
 * `document.currentScript` is only itself while the script is evaluating,
 * which is why the read happens at the top level and not inside a listener.
 * With `defer` the document is parsed by then, so the first scan finds every
 * element already in the markup.
 */

import { createLoader, loaderBase, type Loader } from './core/loader.ts';

/** Injected by `scripts/build.mjs`: tag → chunk file. */
declare const __KJ_CHUNKS__: Record<string, string>;

/** What the loader leaves on `window` for a page that wants to re-configure. */
interface KjWidgetsGlobal {
  configure: Loader['configure'];
  define: Loader['define'];
  load: Loader['load'];
  VERSION: string;
}

const script = document.currentScript as HTMLScriptElement | null;
const loader = createLoader({
  base: loaderBase(script, document.baseURI),
  chunks: __KJ_CHUNKS__,
  dataset: { ...(script?.dataset ?? {}) },
});
loader.start();

(globalThis as unknown as { KJWidgets?: KjWidgetsGlobal }).KJWidgets = {
  configure: loader.configure,
  define: loader.define,
  load: loader.load,
  VERSION: __KJ_VERSION__,
};
