/**
 * One place that knows the key, the origin, the language and the footer.
 *
 * Design decision 2: the CDN build reads this off its own `<script>` tag and
 * the ESM build takes it from `configure()`, and both end up here so that an
 * element never has to know which build it is running in. Module-level state
 * is right for it — a page has one key and one API, and a second copy of this
 * module would mean a second `define()` and duplicate custom elements, which
 * the registry refuses anyway.
 */

import type { Lang } from './i18n.ts';

/** Injected by esbuild (and by vitest) from `package.json`. */
export const VERSION = __KJ_VERSION__;

/**
 * `X-KJ-Client`, so a usage row can tell the widget bundle apart from an SDK
 * or a page's own `fetch`. The gateway parses `<name>/<semver>` and ignores
 * anything over 64 characters (`apps/api/src/lib/client.ts`).
 */
export const CLIENT_TAG = `widgets/${VERSION}`;

/** Production. `data-base` points a page at staging instead (decision 3). */
const DEFAULT_BASE_URL = 'https://api.kaaljyoti.com';

/**
 * How a widget is coloured. `auto` inherits the page's text colour and shows
 * the page's background through; `light` and `dark` are opaque cards.
 */
export type KjTheme = 'auto' | 'light' | 'dark';

/**
 * Where the forms' place search looks. `auto` is Google with a Google Maps
 * key, else Photon; `google`, `photon` and `kaaljyoti` pin one. Every one of
 * them falls back to `/v1/places` (`kaaljyoti`) when it fails.
 */
export type PlaceProvider = 'auto' | 'google' | 'photon' | 'kaaljyoti';

/**
 * The visual family, after the PDF templates (design system, "Presets"):
 * accent colours, heading face and header style. The theme still decides the
 * ground and the ink.
 */
export type KjPreset = 'classic' | 'modern' | 'minimal' | 'traditional';

/** How the birth forms ask for a time: `12` (with AM/PM, the default) or `24`. */
export type TimeFormat = '12' | '24';

/** The public Photon server, komoot's; `photon-url` points a form at another. */
export const PHOTON_URL = 'https://photon.komoot.io';

/** Where the plan-required state sends a site owner. */
export const PRICING_URL = 'https://kaaljyoti.com/api/pricing';

/** Where the "needs a server proxy" state sends a site owner (decision 23). */
export const PROXY_DOCS_URL = 'https://kaaljyoti.com/api/docs/widgets#proxy';

/**
 * The widget's type: `system`, the design system's own stacks, or
 * `inherit`, the host page's font (Hindi still falls back to a Devanagari
 * face behind it).
 */
export type KjFont = 'system' | 'inherit';

/**
 * The kundli PDF's editions (`POST /v1/pdf/kundli`). A site's proxy that
 * relays PDFs names the ones it offers (`data-pdf`); the match PDF has no
 * edition, so any one of them turns its button on.
 */
export type PdfEdition = 'basic' | 'professional';

/** Everything a widget needs before it can make its first request. */
export interface KjConfig {
  /**
   * A publishable key, `kj_pub_…`. Any other key is refused before a request
   * is made (`client.ts`), and the API refuses secret keys anyway.
   */
  key?: string;
  /** Origin only; the client adds `/v1`. */
  baseUrl: string;
  lang: Lang;
  /** `hidden` is a request, not a guarantee — see decision 9. */
  poweredBy: 'shown' | 'hidden';
  /**
   * The "Powered by" credit is opt-in: shown only when `poweredBy` (or an
   * element's `powered-by`) is `shown`, and hidden otherwise on every plan.
   * The WordPress plugin sets it (`data-credit="opt-in"`), because the
   * WordPress.org guidelines allow a credit link only with the site owner's
   * explicit permission, and no plan gate in plugin code.
   */
  creditOptIn?: boolean;
  /** The default for elements without a `theme` attribute. */
  theme: KjTheme;
  /**
   * The site's own Google Maps Platform key, for the forms' place search.
   * Without one the search is Photon's (see {@link placeProvider}). A `google-maps-key`
   * attribute on a form wins over this.
   */
  googleMapsKey?: string;
  /** A `place-provider` attribute on a form wins over this. */
  placeProvider: PlaceProvider;
  /**
   * Photon's origin: the public server, or a site's own. A `photon-url`
   * attribute on a form wins over this.
   */
  photonUrl: string;
  /** The default for elements without a `preset` attribute. */
  preset: KjPreset;
  /** Whether the birth forms remember the last entry on this device. */
  remember: boolean;
  /** The birth forms' time fields. */
  timeFormat: TimeFormat;
  /** The plan-required state's link for the site owner. */
  pricingUrl: string;
  /**
   * Where the CDN loader finds the element chunks: its own directory unless
   * the tag says otherwise (`data-chunks`). The ESM build never reads it.
   */
  chunkBase?: string;
  /**
   * The site's own endpoint that relays a request to the API with the site's
   * secret key (decision 23): `{ path, body }` in, the API's envelope out.
   * Absolute (`https://…`) or site-relative (`/wp-json/…`). A `proxy`
   * attribute on an element wins over this.
   */
  proxyUrl?: string;
  /**
   * Send every request through {@link proxyUrl}, not only the routes closed
   * to publishable keys — for a site that puts no key in the page at all.
   */
  proxyAll: boolean;
  /** The "needs a server proxy" state's link for the site owner. */
  proxyDocsUrl: string;
  /** The default for elements without a `font` attribute. */
  font: KjFont;
  /**
   * The PDF editions the site's proxy relays (`data-pdf`, decision 27):
   * `basic`, `professional`, or `on` for the basic one; empty, the default,
   * is no "Download PDF" button. A PDF always goes
   * through {@link proxyUrl}: the API refuses PDFs to publishable keys.
   */
  pdf: PdfEdition[];
  /**
   * The zodiac sign icons (decision 29): a theme — `element` (the default),
   * `glyph`, `devanagari`, `custom` — or the site's own images, as a URL
   * template with `{sign}` (`aries` … `pisces`) or a map of sign → URL. Kept
   * as given; the icons' chunk (`signs.ts`) reads it, so the rules do not
   * weigh on every page. A `sign-icons` attribute (a theme) wins over it.
   */
  signIcons?: string | Readonly<Record<string, string>>;
}

const DEFAULTS: KjConfig = {
  baseUrl: DEFAULT_BASE_URL,
  lang: 'en',
  poweredBy: 'shown',
  theme: 'auto',
  placeProvider: 'auto',
  photonUrl: PHOTON_URL,
  preset: 'classic',
  remember: true,
  timeFormat: '12',
  pricingUrl: PRICING_URL,
  proxyAll: false,
  proxyDocsUrl: PROXY_DOCS_URL,
  font: 'system',
  pdf: [],
};

let current: KjConfig = { ...DEFAULTS };

/**
 * An origin, whatever was passed.
 *
 * People copy the URL they already have, which is usually the one out of the
 * docs with `/v1` on the end. Appending `/v1` to that would ask for
 * `/v1/v1/panchang`, so both a trailing slash and a trailing `/v1` come off
 * here rather than being a support question later.
 */
export function normaliseBaseUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '');
  if (base.endsWith('/v1')) base = base.slice(0, -'/v1'.length);
  return base || DEFAULT_BASE_URL;
}

/** Merge into the live config, ignoring keys that were not supplied. */
export function configure(partial: Partial<KjConfig>): KjConfig {
  if (partial.key !== undefined) current.key = partial.key;
  if (partial.baseUrl !== undefined) current.baseUrl = normaliseBaseUrl(partial.baseUrl);
  if (partial.lang !== undefined) current.lang = partial.lang;
  if (partial.poweredBy !== undefined) current.poweredBy = partial.poweredBy;
  if (partial.creditOptIn !== undefined) current.creditOptIn = partial.creditOptIn;
  // A typo is not a reason to paint a dark card on a light page.
  if (partial.theme !== undefined) current.theme = parseTheme(partial.theme) ?? 'auto';
  if (partial.googleMapsKey !== undefined) current.googleMapsKey = partial.googleMapsKey;
  if (partial.placeProvider !== undefined) {
    current.placeProvider = parsePlaceProvider(partial.placeProvider) ?? 'auto';
  }
  if (partial.photonUrl !== undefined) current.photonUrl = partial.photonUrl || PHOTON_URL;
  if (partial.preset !== undefined) current.preset = parsePreset(partial.preset) ?? 'classic';
  if (partial.remember !== undefined) current.remember = partial.remember !== false;
  if (partial.timeFormat !== undefined) {
    current.timeFormat = parseTimeFormat(String(partial.timeFormat)) ?? '12';
  }
  if (partial.pricingUrl !== undefined) {
    current.pricingUrl = safeUrl(partial.pricingUrl) ?? PRICING_URL;
  }
  if (partial.chunkBase !== undefined) current.chunkBase = partial.chunkBase;
  if (partial.proxyUrl !== undefined) current.proxyUrl = safeProxyUrl(partial.proxyUrl);
  if (partial.proxyAll !== undefined) current.proxyAll = partial.proxyAll === true;
  if (partial.proxyDocsUrl !== undefined) {
    current.proxyDocsUrl = safeUrl(partial.proxyDocsUrl) ?? PROXY_DOCS_URL;
  }
  if (partial.font !== undefined) current.font = parseFont(partial.font) ?? 'system';
  if (partial.pdf !== undefined) {
    // Kept as words; `pdf-offer.ts` reads the editions out of them, so the
    // rule does not weigh on every page.
    const raw: unknown = partial.pdf;
    current.pdf = pdfWords(Array.isArray(raw) ? raw.join(' ') : String(raw));
  }
  if (partial.signIcons !== undefined) {
    const icons: unknown = partial.signIcons;
    current.signIcons =
      typeof icons === 'string'
        ? icons.trim()
        : icons && typeof icons === 'object'
          ? { ...(icons as Record<string, string>) }
          : undefined;
  }
  return getConfig();
}

/** The CDN loader's `data-*`, parsed and applied (`core/loader.ts`). */
export function configureFromDataset(dataset: Record<string, string | undefined>): KjConfig {
  return configure(readDatasetConfig(dataset));
}

/** A copy, so a caller cannot mutate the module's state by accident. */
export function getConfig(): KjConfig {
  return { ...current, pdf: [...current.pdf] };
}

/** Back to defaults. Tests use it; a page has no reason to. */
export function resetConfig(): void {
  current = { ...DEFAULTS };
}

/** `en` / `hi` out of an attribute, or nothing when it is neither. */
export function parseLang(raw: string | null | undefined): Lang | undefined {
  return raw === 'en' || raw === 'hi' ? raw : undefined;
}

/** `auto` / `light` / `dark` out of an attribute, or nothing when it is none. */
export function parseTheme(raw: string | null | undefined): KjTheme | undefined {
  return raw === 'auto' || raw === 'light' || raw === 'dark' ? raw : undefined;
}

/** A {@link PlaceProvider} out of an attribute, or nothing when it is none. */
export function parsePlaceProvider(raw: string | null | undefined): PlaceProvider | undefined {
  return raw === 'auto' || raw === 'google' || raw === 'photon' || raw === 'kaaljyoti'
    ? raw
    : undefined;
}

/** A {@link KjPreset} out of an attribute, or nothing when it is none. */
export function parsePreset(raw: string | null | undefined): KjPreset | undefined {
  const value = raw?.trim().toLowerCase();
  return value === 'classic' || value === 'modern' || value === 'minimal' || value === 'traditional'
    ? value
    : undefined;
}

/** `12` / `24` out of an attribute (`12h`, `24h` too), or nothing. */
export function parseTimeFormat(raw: string | null | undefined): TimeFormat | undefined {
  const value = raw?.trim().toLowerCase().replace(/h$/, '');
  return value === '12' || value === '24' ? value : undefined;
}

/** `system` / `inherit` out of an attribute, or nothing when it is neither. */
export function parseFont(raw: string | null | undefined): KjFont | undefined {
  const value = raw?.trim().toLowerCase();
  return value === 'system' || value === 'inherit' ? value : undefined;
}

/** `data-pdf`'s words, lower-cased; `pdf-offer.ts` knows which are editions. */
function pdfWords(raw: string): PdfEdition[] {
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean) as PdfEdition[];
}

/**
 * A proxy endpoint: an `http(s)` URL, or a path on this site (`/wp-json/…`,
 * `/wp-admin/admin-ajax.php?action=…`). Anything else — `javascript:`, a
 * protocol-relative `//host` — is no proxy at all.
 */
export function safeProxyUrl(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(value)) return value;
  return safeUrl(value);
}

/** `off`, `false` and `no` switch a feature off; anything else leaves it. */
export function isOff(raw: string | null | undefined): boolean {
  return /^(off|false|no|0)$/i.test(raw?.trim() ?? '');
}

/** An `http(s)` URL, or nothing: a pricing link must not be `javascript:`. */
export function safeUrl(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  return value && /^https?:\/\/[^\s"'<>]+$/i.test(value) ? value : undefined;
}

/**
 * The `data-*` attributes of the `<script>` that loaded the bundle.
 *
 * Unrecognised values are dropped rather than corrected: `data-lang="fr"`
 * should leave the page in English, not render a half-translated widget.
 */
export function readScriptConfig(script: HTMLScriptElement | null): Partial<KjConfig> {
  return script ? readDatasetConfig(script.dataset) : {};
}

/**
 * The same, from a plain copy of a `dataset`.
 *
 * The CDN loader is a separate, tiny script: it copies its tag's `dataset`
 * and hands it to the first element chunk it loads, which parses it here, so
 * the rules live in one place.
 */
export function readDatasetConfig(dataset: Record<string, string | undefined>): Partial<KjConfig> {
  const partial: Partial<KjConfig> = {};
  const script = { dataset };
  const key = script.dataset.key;
  if (key) partial.key = key;
  const base = script.dataset.base;
  if (base) partial.baseUrl = base;
  const lang = parseLang(script.dataset.lang);
  if (lang) partial.lang = lang;
  if (script.dataset.poweredBy === 'hidden') partial.poweredBy = 'hidden';
  if (script.dataset.poweredBy === 'shown') partial.poweredBy = 'shown';
  if (script.dataset.credit === 'opt-in') partial.creditOptIn = true;
  const theme = parseTheme(script.dataset.theme);
  if (theme) partial.theme = theme;
  const googleMapsKey = script.dataset.googleMapsKey;
  if (googleMapsKey) partial.googleMapsKey = googleMapsKey;
  const placeProvider = parsePlaceProvider(script.dataset.placeProvider);
  if (placeProvider) partial.placeProvider = placeProvider;
  const photonUrl = script.dataset.photonUrl;
  if (photonUrl) partial.photonUrl = photonUrl;
  const preset = parsePreset(script.dataset.preset);
  if (preset) partial.preset = preset;
  if (isOff(script.dataset.remember)) partial.remember = false;
  const timeFormat = parseTimeFormat(script.dataset.timeFormat);
  if (timeFormat) partial.timeFormat = timeFormat;
  const pricingUrl = safeUrl(script.dataset.pricingUrl);
  if (pricingUrl) partial.pricingUrl = pricingUrl;
  const chunks = script.dataset.chunks;
  if (chunks) partial.chunkBase = chunks;
  const proxy = safeProxyUrl(script.dataset.proxy);
  if (proxy) partial.proxyUrl = proxy;
  const proxyAll = script.dataset.proxyAll;
  if (proxyAll !== undefined && !isOff(proxyAll)) partial.proxyAll = true;
  const proxyDocs = safeUrl(script.dataset.proxyDocs);
  if (proxyDocs) partial.proxyDocsUrl = proxyDocs;
  const font = parseFont(script.dataset.font);
  if (font) partial.font = font;
  if (script.dataset.pdf) partial.pdf = pdfWords(script.dataset.pdf);
  const signIcons = script.dataset.signIcons?.trim();
  if (signIcons) partial.signIcons = signIcons;
  return partial;
}
