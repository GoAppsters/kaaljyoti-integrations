/**
 * The CDN loader (integrations revamp §5): `v1.js` is this and a table of
 * chunk files, and each element's code is a chunk fetched the first time the
 * page has one of its tags.
 *
 * Twenty widgets will not fit in one file a site owner puts on every page, so
 * the script tag stays exactly what it was — same URL, same `data-*` — and
 * what it loads is a few hundred bytes that watch the page for `<kj-…>` tags.
 * A page with a panchang downloads the panchang's chunk and the shared core,
 * and nothing of the kundli report.
 *
 * Chunks are ES modules (esbuild's code splitting only writes ESM) imported
 * with `import()`, which a classic script may call. Their URLs are resolved
 * against the loader's own directory — `document.currentScript.src`, or a
 * `data-chunks` base when a caching plugin has moved the script — so the CDN,
 * a WordPress plugin's `assets/widgets/` and any other host's copy all work
 * unchanged. Module scripts are fetched with CORS, so a host that
 * serves the chunks from another origin must send
 * `Access-Control-Allow-Origin`.
 *
 * This module imports nothing, so the loader stays small: the `data-*`
 * values go to the first chunk as they are, and the chunk parses them with
 * the rules in `config.ts`.
 */

/** What every chunk exports (`src/lazy/*.ts`). */
export interface ChunkModule {
  /** `readDatasetConfig` + `configure`, in the chunk's copy of the core. */
  configureFromDataset(dataset: Record<string, string | undefined>): void;
  configure(partial: Record<string, unknown>): void;
  /** The element class; it knows its own tag. */
  element: CustomElementConstructor & { readonly tag: string };
}

/** What {@link createLoader} needs. */
export interface LoaderOptions {
  /** The directory the chunks are in, ending in `/`. */
  base: string;
  /** Tag → chunk file, written into the loader by the build. */
  chunks: Readonly<Record<string, string>>;
  /** The script tag's `data-*`, copied. */
  dataset: Record<string, string | undefined>;
  /** `import()` by default; tests pass their own. */
  importer?: (url: string) => Promise<ChunkModule>;
  /** The document to watch. */
  doc?: Document;
}

/** The loader's public face, also left on `window.KJWidgets`. */
export interface Loader {
  /** Load one element's chunk, once. */
  load(tag: string): Promise<void>;
  /** Load every chunk the page has a tag for. */
  scan(): void;
  /** Scan now and whenever the page changes. */
  start(): void;
  /** Configure every chunk loaded so far and every one loaded later. */
  configure(partial: Record<string, unknown>): void;
  /** Load and register every element, like 0.1.0's `define()`. */
  define(): Promise<void>;
}

/**
 * Where the chunks are: `data-chunks` when the tag has it, else the
 * directory of the script's own URL, else the document's.
 */
export function loaderBase(
  script: { src?: string; dataset?: Record<string, string | undefined> } | null,
  documentUrl: string,
): string {
  const given = script?.dataset?.chunks?.trim();
  if (given) return new URL(given.endsWith('/') ? given : `${given}/`, documentUrl).href;
  if (script?.src) return new URL('.', script.src).href;
  return new URL('.', documentUrl).href;
}

/** A chunk's URL: relative to the base, never to the page. */
export function chunkUrl(base: string, file: string): string {
  return new URL(file, base).href;
}

/** @see Loader */
export function createLoader(options: LoaderOptions): Loader {
  const doc = options.doc ?? document;
  const importer =
    options.importer ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<ChunkModule>);
  const loading = new Map<string, Promise<void>>();
  const modules: ChunkModule[] = [];
  const overrides: Record<string, unknown>[] = [];
  let observer: MutationObserver | null = null;
  let warned = false;

  const load = (tag: string): Promise<void> => {
    const name = tag.toLowerCase();
    const existing = loading.get(name);
    if (existing) return existing;
    const file = options.chunks[name];
    if (!file) return Promise.resolve();
    const started = importer(chunkUrl(options.base, file)).then(
      (module) => {
        // Every chunk shares one copy of the core, so configuring the first
        // is enough; doing it for each is harmless and survives a page that
        // loaded two copies of the loader.
        module.configureFromDataset(options.dataset);
        for (const partial of overrides) module.configure(partial);
        modules.push(module);
        const element = module.element;
        if (!customElements.get(element.tag)) customElements.define(element.tag, element);
      },
      (error: unknown) => {
        loading.delete(name);
        if (!warned) {
          warned = true;
          console.warn('Kaal Jyoti widgets: could not load', file, error);
        }
      },
    );
    loading.set(name, started);
    return started;
  };

  const scan = () => {
    let pending = 0;
    for (const tag of Object.keys(options.chunks)) {
      if (loading.has(tag)) continue;
      pending++;
      if (doc.getElementsByTagName(tag).length) void load(tag);
    }
    // Everything asked for: nothing left to watch the page for.
    if (!pending && observer) {
      observer.disconnect();
      observer = null;
    }
  };

  return {
    load,
    scan,
    start() {
      scan();
      if (typeof MutationObserver === 'function' && !observer) {
        observer = new MutationObserver(scan);
        observer.observe(doc.documentElement, { childList: true, subtree: true });
      }
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', scan);
    },
    configure(partial) {
      overrides.push(partial);
      for (const module of modules) module.configure(partial);
    },
    async define() {
      await Promise.all(Object.keys(options.chunks).map(load));
    },
  };
}
