/**
 * What the stage-2 widgets share and the first seven do not (design decision
 * 24): their own words, a few drawing helpers, and their stylesheet.
 *
 * It is a module of its own so that esbuild puts it in a chunk only those
 * widgets load. The core chunk every page pays for — `i18n.ts`, `ui.ts`,
 * `base.css` — does not grow with them: each new widget keeps its words in
 * its own chunk, in a small `{ en, hi }` dictionary read with {@link msg}.
 */

import { html, trusted } from './html.ts';
import { MONTHS_LONG } from './format.ts';
import type { Lang } from './i18n.ts';
import { localWall } from './reports.ts';
import extraCss from '../styles/extra.css';

/** The rules the stage-2 widgets add to the shared sheet (`static styles`). */
export const EXTRA_CSS: string = extraCss;

export { msg, type Dict } from './dict.ts';

/** The twelve sign ids in zodiac order. */
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

/** Sun to Ketu, the order a Hindi panchang prints them in. */
export const GRAHA_ORDER = [
  'sun',
  'moon',
  'mars',
  'mercury',
  'jupiter',
  'venus',
  'saturn',
  'rahu',
  'ketu',
] as const;

/** Two-letter graha abbreviations, for narrow columns. */
const SHORT: Record<string, [string, string]> = {
  sun: ['Su', 'सू'],
  moon: ['Mo', 'चं'],
  mars: ['Ma', 'मं'],
  mercury: ['Me', 'बु'],
  jupiter: ['Ju', 'गु'],
  venus: ['Ve', 'शु'],
  saturn: ['Sa', 'श'],
  rahu: ['Ra', 'रा'],
  ketu: ['Ke', 'के'],
  ascendant: ['Asc', 'ल'],
};

/** `Su` / `सू`, or the id's first two letters. */
export function grahaShort(id: string, lang: Lang): string {
  return SHORT[id]?.[lang === 'hi' ? 1 : 0] ?? id.slice(0, 2);
}

/** `99.0467` → `9°02′` within its sign: formatting, not astronomy. */
export function inSign(longitude: number): string {
  const within = ((longitude % 30) + 30) % 30;
  const degrees = Math.floor(within);
  const minutes = Math.floor((within - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, '0')}′`;
}

/** The sign a sidereal longitude falls in. */
export function signOf(longitude: number): (typeof SIGN_IDS)[number] {
  const index = Math.floor((((longitude % 360) + 360) % 360) / 30);
  return SIGN_IDS[index] ?? 'aries';
}

/**
 * The south Indian square: the signs in fixed places round the edge, the
 * middle four cells one caption. Used where a widget draws a sign grid of
 * its own (the Sarvashtakavarga), never in place of the API's chart.
 */
const SOUTH: readonly (string | null)[] = [
  'pisces',
  'aries',
  'taurus',
  'gemini',
  'aquarius',
  null,
  null,
  'cancer',
  'capricorn',
  null,
  null,
  'leo',
  'sagittarius',
  'scorpio',
  'libra',
  'virgo',
];

/** One sign's cell: already-built markup, and an optional tone the sheet shades. */
export interface SignCell {
  body: string;
  tone?: string;
}

/**
 * A 4 × 4 grid of the signs, south Indian style: `cell(sign)` draws each,
 * `caption` fills the middle.
 */
export function signGridHtml(
  cell: (sign: string) => SignCell,
  caption: string,
  label: string,
  part = 'sign-grid',
): string {
  let captioned = false;
  const cells = SOUTH.map((sign) => {
    if (sign) {
      const { body, tone } = cell(sign);
      return html`<div class="kj-sg-cell" part="sign-cell sign-${sign}" data-tone="${tone ?? ''}">
        ${trusted(body)}
      </div>`;
    }
    if (captioned) return '';
    captioned = true;
    return html`<div class="kj-sg-mid" part="sign-grid-caption">${trusted(caption)}</div>`;
  }).join('');
  return html`<div class="kj-sg" role="group" aria-label="${label}" part="${part}">
    ${trusted(cells)}
  </div>`;
}

/**
 * A horizontal bar of `value` against `max`, with an optional marker (a
 * required minimum) — decoration beside the numbers, which are always
 * written out too.
 */
export function meterHtml(value: number, max: number, marker: number | null, tone: string): string {
  const pct = (n: number) => Math.max(0, Math.min(100, max > 0 ? (n / max) * 100 : 0)).toFixed(1);
  return html`<span class="kj-meter ${tone}" aria-hidden="true"
    ><span class="kj-meter-fill" style="width:${pct(value)}%"></span>${trusted(
      marker !== null ? `<span class="kj-meter-mark" style="left:${pct(marker)}%"></span>` : '',
    )}</span
  >`;
}

/** `2026-10` → `October 2026` / `अक्तूबर 2026`. */
export function monthLabel(month: string, lang: Lang): string {
  const [year, m] = month.split('-');
  const index = Number(m) - 1;
  const long = lang === 'hi' ? MONTHS_LONG.hi : MONTHS_FULL_EN;
  return `${long[index] ?? m} ${year}`;
}

const MONTHS_FULL_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `YYYY-MM` moved by `n` months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return at.toISOString().slice(0, 7);
}

/** A `YYYY-MM` the API will take, or `null`. */
export function isMonth(raw: string | null | undefined): raw is string {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return false;
  const month = Number(raw.slice(5, 7));
  const year = Number(raw.slice(0, 4));
  return month >= 1 && month <= 12 && year >= 1800 && year <= 2400;
}

/**
 * Today's date at a place, `YYYY-MM-DD`: in its zone when there is one,
 * else the reader's own calendar (a place without a zone is typed
 * coordinates, for which the API works the zone out itself).
 */
export function todayAt(zone: string | null | undefined): string {
  if (zone) {
    const wall = localWall(new Date().toISOString(), { name: zone });
    if (wall) return wall.slice(0, 10);
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Day of the week of a calendar date, 0 = Sunday; UTC arithmetic on the components. */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/**
 * A ‹ label › stepper: two buttons with `data-action="step"` and
 * `data-step="-1|1"`, and the label between.
 */
export function stepperHtml(
  label: string,
  current: string,
  prev: string,
  next: string,
  part = 'stepper',
): string {
  return html`<div class="kj-stepper" role="group" aria-label="${label}" part="${part}">
    <button type="button" class="kj-step" data-action="step" data-step="-1" aria-label="${prev}">
      <span aria-hidden="true">‹</span>
    </button>
    <span class="kj-step-label" aria-live="polite">${current}</span>
    <button type="button" class="kj-step" data-action="step" data-step="1" aria-label="${next}">
      <span aria-hidden="true">›</span>
    </button>
  </div>`;
}

/** Anything with attributes; `panchang-request.ts` reads a place off one. */
export interface Attributes {
  getAttribute(name: string): string | null;
}

/**
 * The element's place, with New Delhi when it names none (decision 24): a
 * "planets now" or a month calendar with no `city` should still draw, where
 * the day's panchang (decision 8) keeps its "no place" line.
 */
export function withDefaultPlace(el: Attributes, city = 'delhi'): Attributes {
  const named = ['city', 'lat', 'lon'].some((name) => el.getAttribute(name)?.trim());
  return {
    getAttribute: (name) => (name === 'city' && !named ? city : el.getAttribute(name)),
  };
}
