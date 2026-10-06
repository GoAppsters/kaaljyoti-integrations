/**
 * Markup as strings, escaped by default.
 *
 * Its own module so that `element.ts` and the components in `ui.ts` can both
 * use it without importing each other.
 */

/** HTML-escape anything on its way into markup. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Markup that is already trusted and must not be escaped again. */
export class Trusted {
  constructor(readonly value: string) {}
}

/**
 * Mark a string as markup.
 *
 * Two things in this package earn it: markup this package's own helpers
 * built (and escaped as they built it), and the SVG document from
 * `POST /v1/kundli/chart`, which the API generated and which is the whole
 * point of the chart element. Response *text* — a place name, a yoga's
 * `detail` — never goes through here unescaped.
 */
export function trusted(markup: string): Trusted {
  return new Trusted(markup);
}

/** Tagged template that escapes every interpolation but {@link trusted} ones. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    out += value instanceof Trusted ? value.value : esc(value);
    out += strings[i + 1] ?? '';
  }
  return out;
}
