/**
 * The zodiac sign icons (owner request, 5 October 2026; design decision 29).
 *
 * A sign is printed as a placeholder — `<span class="kj-zi" data-zi="leo">`,
 * from `signIcon()` in `ui.ts` — and this module draws into it. It is a chunk
 * of its own, fetched with `import()` the first time a shadow root holds a
 * placeholder (`element.ts`), so a panchang page never downloads it and the
 * kundli report's page pays for it only once a report is drawn. The
 * horoscope, whose picker is its first paint, imports it statically.
 *
 * It imports nothing at run time, for the reason `tables.ts` gives: a module
 * the element chunks share, imported from a new entry too, would be split
 * into a chunk of its own and cost every page a file. The configuration is
 * handed in by the caller.
 *
 * Four themes, by `sign-icons` on the element (or any ancestor, across shadow
 * roots), else `data-sign-icons` / `configure({ signIcons })`:
 *
 *   - `element` (default): the symbol on a rounded tile, in its element's
 *     colours (fire, earth, air, water);
 *   - `glyph`: the symbol in a thin ring, one colour (`--kj-sign-glyph`);
 *   - `devanagari`: the Hindi name in a double-ring seal;
 *   - `custom`: the site's own images — a URL template with `{sign}`, or a
 *     map of sign → URL (with an optional `theme` for the page's default) —
 *     drawn as `<img>`, never inlined, so a site's SVG
 *     cannot put markup in the widget. Only `https:` and same-origin
 *     relative URLs; a sign without one, or whose image fails, falls back to
 *     `element`.
 *
 * Inline (table) icons are compact: the symbol alone, in its element's ink
 * (`glyph`: the glyph colour; `devanagari`: the element's, since a seal at
 * text size is unreadable; `custom`: the image).
 */

import signsCss from '../styles/signs.css';

/** The ids, Aries to Pisces; the element is the index modulo four. */
export const SIGN_IDS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

/** Fire, earth, air, water, in the zodiac's own rotation. */
const ELEMENTS = ['fire', 'earth', 'air', 'water'] as const;

/** The built-in themes and `custom`. */
export type SignTheme = 'element' | 'glyph' | 'devanagari' | 'custom';

/**
 * What `signIcons` may be: a theme, a URL template with `{sign}`, or a map of
 * sign → URL, which may also name the default `theme` (the images are then
 * used only where an element asks for `custom`).
 */
export type SignIcons = string | Readonly<Record<string, string>>;

/**
 * The symbols, on a 24-unit square, stroked (1.9 units, round caps and
 * joins). Circles are written as two arcs so each sign is one path.
 */
const PATHS = [
  // Aries: the ram's horns over one stem.
  'M12 20V11C12 6 9.2 4 6.6 4.6 4.2 5.2 3.6 8.2 5.2 9.8M12 11C12 6 14.8 4 17.4 4.6 19.8 5.2 20.4 8.2 18.8 9.8',
  // Taurus: a circle and the horns.
  'M7 15a5 5 0 1 0 10 0a5 5 0 1 0-10 0M4.5 4C5.5 8.5 8.5 10 12 10S18.5 8.5 19.5 4',
  // Gemini: two pillars, bowed lintels.
  'M5.5 5C9 6.2 15 6.2 18.5 5M5.5 19C9 17.8 15 17.8 18.5 19M9.2 5.8V18.2M14.8 5.8V18.2',
  // Cancer: two dots with their claws.
  'M4.4 9.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M7 6.9C11 4.4 16.5 5 20 8M14.4 14.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M17 17.1C13 19.6 7.5 19 4 16',
  // Leo: the mane's loop and its tail.
  'M4.8 14.5a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0M10 13.2C9.6 9 11.6 5 15 5S19.2 8 17.6 11C16.2 13.6 15 15.2 15.6 17.6 16.2 19.6 18.8 20 20.2 18.4',
  // Virgo: three arches, the last closing in a loop that crosses its stem.
  'M3.6 6.4C4.6 6.4 5.4 7.2 5.4 8.4V18M5.4 9C5.4 7.4 6.5 6.2 8 6.2S10.6 7.4 10.6 9V18M10.6 9C10.6 7.4 11.7 6.2 13.2 6.2S15.8 7.4 15.8 9V15.6C15.8 17.6 16.8 18.6 18.2 18.6 19.8 18.6 20.8 17.2 20.8 15.6 20.8 13.8 19.4 12.8 18 13 16.4 13.2 15.4 14.6 14.6 16.2L13 19.6',
  // Libra: the setting sun over the horizon.
  'M4 19.5H20M4 15.5H8.6C7.6 14.4 7 13 7 11.6 7 8.6 9.2 6.4 12 6.4S17 8.6 17 11.6C17 13 16.4 14.4 15.4 15.5H20',
  // Scorpio: three arches, the last ending in the sting.
  'M3.6 6.4C4.6 6.4 5.4 7.2 5.4 8.4V18M5.4 9C5.4 7.4 6.5 6.2 8 6.2S10.6 7.4 10.6 9V18M10.6 9C10.6 7.4 11.7 6.2 13.2 6.2S15.8 7.4 15.8 9V16C15.8 17.8 16.8 18.8 18.6 18.8H20.6M18.6 16.6L20.8 18.8 18.6 21',
  // Sagittarius: the arrow and its crossbar.
  'M5 19L19 5M12.4 5H19V11.6M7.6 11.4L12.6 16.4',
  // Capricorn: the V, then the stem curling into the fish's tail.
  'M4.2 5.6L8 16.2 11.4 6.6V15.4C11.4 18.2 13.2 19.8 15.6 19.8 18 19.8 19.8 18.2 19.8 16.2 19.8 14.2 18.2 12.8 16.4 12.8 14.2 12.8 13.2 14.6 13.2 16.6 13.2 18.6 12.2 20.2 10.2 20.6',
  // Aquarius: two waves.
  'M3 10.2L6 7.6 9 10.2 12 7.6 15 10.2 18 7.6 21 10.2M3 16.6L6 14 9 16.6 12 14 15 16.6 18 14 21 16.6',
  // Pisces: two fish joined by a cord.
  'M6.2 4C10.2 8 10.2 16 6.2 20M17.8 4C13.8 8 13.8 16 17.8 20M5 12H19',
];

/** The seal's names, in the owner's spelling (short forms, to fit the ring). */
const HINDI = [
  'मेष',
  'वृष',
  'मिथुन',
  'कर्क',
  'सिंह',
  'कन्या',
  'तुला',
  'वृश्चिक',
  'धनु',
  'मकर',
  'कुम्भ',
  'मीन',
];

/** For a custom image's `alt`, on an English page. */
const ENGLISH = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

/**
 * The configured value as a theme, a template or a map: a `data-sign-icons`
 * that holds a JSON object (the WordPress plugin writes one) becomes the map.
 */
export function readSignIcons(raw: unknown): SignIcons | undefined {
  if (typeof raw === 'string') {
    const value = raw.trim();
    if (!value.startsWith('{')) return value || undefined;
    try {
      raw = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const map: Record<string, string> = {};
  for (const id of SIGN_IDS) {
    const url = (raw as Record<string, unknown>)[id];
    if (typeof url === 'string') map[id] = url;
  }
  // `theme`: the page's default when it is not the images themselves, so an
  // element can still ask for `sign-icons="custom"` (the WordPress plugin's
  // per-block choice).
  const theme = parseSignTheme((raw as { theme?: string }).theme);
  if (theme) map.theme = theme;
  return map;
}

const THEMES: readonly string[] = ['element', 'glyph', 'devanagari', 'custom'];

/** A theme name out of an attribute, or nothing. */
export function parseSignTheme(raw: string | null | undefined): SignTheme | undefined {
  const value = raw?.trim().toLowerCase();
  return value && THEMES.includes(value) ? (value as SignTheme) : undefined;
}

/**
 * An image URL a widget may load: `https:`, or relative to this page (a path,
 * not `//host`). Nothing that could break out of an attribute either — the
 * `<img>` is built with the DOM, but the rule is the same everywhere.
 */
export function safeImageUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value || /[\s"'<>\\]/.test(value)) return undefined;
  if (/^https:\/\/[^/]/i.test(value)) return value;
  // A scheme of any kind (`http:`, `data:`, `javascript:`) or `//host`: no.
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) return undefined;
  return value;
}

/** The image for one sign out of the configured template or map, if any. */
export function customImage(icons: SignIcons | undefined, id: string): string | undefined {
  if (!icons) return undefined;
  if (typeof icons === 'string') {
    return icons.includes('{sign}') ? safeImageUrl(icons.split('{sign}').join(id)) : undefined;
  }
  return Object.prototype.hasOwnProperty.call(icons, id) ? safeImageUrl(icons[id]) : undefined;
}

/**
 * The theme an element draws in: `sign-icons` on it or the nearest ancestor
 * that has one (through shadow roots, so a reading inside the kundli report
 * follows the report), else the configured one, else `element`. A template
 * or a map configured is `custom`.
 */
export function signTheme(host: Element | null, icons: SignIcons | undefined): SignTheme {
  for (let node: Element | null = host; node;) {
    const own = parseSignTheme(node.getAttribute('sign-icons'));
    if (own) return own;
    node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host || null);
  }
  if (typeof icons === 'string') {
    return parseSignTheme(icons) ?? (icons.includes('{sign}') ? 'custom' : 'element');
  }
  return icons && typeof icons === 'object' ? (parseSignTheme(icons.theme) ?? 'custom') : 'element';
}

const svg = (box: number, inner: string): string =>
  `<svg viewBox="0 0 ${box} ${box}" fill="none" stroke-linecap="round" stroke-linejoin="round" focusable="false">${inner}</svg>`;

/** The symbol on the 36-unit tile, its 24 units centred. */
const symbol = (index: number, cls: string, width: number): string =>
  `<path class="${cls}" stroke-width="${width}" transform="translate(6 6)" d="${PATHS[index]}"/>`;

/**
 * The markup for one sign in a built-in theme. `small` is the compact
 * (inline) form. Every string here is this module's own.
 */
export function iconSvg(index: number, theme: SignTheme, small: boolean): string {
  if (small) {
    return svg(
      24,
      `<path class="${theme === 'glyph' ? 'zg' : 'zk'}" stroke-width="2.1" d="${PATHS[index]}"/>`,
    );
  }
  if (theme === 'glyph') {
    return svg(
      36,
      `<circle class="zr" cx="18" cy="18" r="16.8" stroke-width="1"/>${symbol(index, 'zg', 1.8)}`,
    );
  }
  if (theme === 'devanagari') {
    const name = HINDI[index] ?? '';
    // Two aksharas at 14, three at 11.5 (वृश्चिक, the widest, at 10).
    const size = name.length > 5 ? 10 : name.length > 3 ? 11.5 : 14;
    return svg(
      48,
      `<circle class="zb zo" cx="24" cy="24" r="22.6" stroke-width="1.6"/><circle class="zo" cx="24" cy="24" r="18.8" stroke-width=".9"/><text class="zt" x="24" y="24" dy=".34em" text-anchor="middle" font-size="${size}">${name}</text>`,
    );
  }
  return svg(
    36,
    `<rect class="zb" width="36" height="36" rx="9"/><circle class="zf" cx="18" cy="18" r="13.2"/>${symbol(index, 'zk', 1.9)}`,
  );
}

let sheet: CSSStyleSheet | null = null;

/** Put the icons' rules in a shadow root, once. */
function adopt(root: ShadowRoot): void {
  try {
    sheet ??= new CSSStyleSheet();
    if (!sheet.cssRules.length) sheet.replaceSync(signsCss);
    if (!root.adoptedStyleSheets.includes(sheet)) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }
  } catch {
    // No constructable sheets: a <style> of its own, outside the painted body.
    if (!root.querySelector('style[data-kj-signs]')) {
      const style = document.createElement('style');
      style.setAttribute('data-kj-signs', '');
      style.textContent = signsCss;
      root.prepend(style);
    }
  }
}

/** Draw one placeholder. */
function draw(span: HTMLElement, theme: SignTheme, icons: SignIcons | undefined): void {
  const id = span.getAttribute('data-zi') ?? '';
  const index = (SIGN_IDS as readonly string[]).indexOf(id);
  if (index < 0) {
    span.setAttribute('data-el', '');
    return;
  }
  span.setAttribute('data-el', ELEMENTS[index % 4] as string);
  const small = !span.classList.contains('kj-zi-l') && !span.classList.contains('kj-zi-m');
  const url = theme === 'custom' ? customImage(icons, id) : undefined;
  const fallback = () => {
    span.setAttribute('data-theme', 'element');
    span.innerHTML = iconSvg(index, 'element', small);
  };
  if (!url) {
    if (theme === 'custom') fallback();
    else {
      span.setAttribute('data-theme', theme);
      span.innerHTML = iconSvg(index, theme, small);
    }
    return;
  }
  const image = document.createElement('img');
  const hindi = span.closest('[lang]')?.getAttribute('lang') === 'hi';
  image.alt = (hindi ? HINDI : ENGLISH)[index] ?? id;
  image.decoding = 'async';
  image.addEventListener('error', fallback, { once: true });
  image.src = url;
  span.setAttribute('data-theme', 'custom');
  span.replaceChildren(image);
}

/**
 * Icons in this shadow root: the rules adopted, every placeholder drawn now
 * and after every repaint, and all of them redrawn when `sign-icons`
 * changes on the element. `icons` is the configured `signIcons`, read by
 * the caller (this module imports no configuration of its own).
 */
export function attachSigns(root: ShadowRoot, host: Element, icons: () => unknown): void {
  adopt(root);
  const run = (all = false): void => {
    const spans = root.querySelectorAll<HTMLElement>(all ? '.kj-zi' : '.kj-zi:not([data-el])');
    if (!spans.length) return;
    const configured = readSignIcons(icons());
    const theme = signTheme(host, configured);
    for (const span of spans) draw(span, theme, configured);
  };
  run();
  // Drawing changes children of the placeholders only, which `run` skips.
  new MutationObserver(() => run()).observe(root, { childList: true, subtree: true });
  new MutationObserver(() => run(true)).observe(host, {
    attributes: true,
    attributeFilter: ['sign-icons'],
  });
}
