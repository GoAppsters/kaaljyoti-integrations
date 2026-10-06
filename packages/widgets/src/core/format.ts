/**
 * Wall clocks are strings (design decision 7).
 *
 * Every `2026-09-22T06:13:13.728` in a response is a *local* clock at the
 * place the request asked about, with no zone on it. `new Date(…)` would read
 * it in the reader's own zone, so a Delhi sunrise shown to a reader in London
 * would move by five and a half hours and still look plausible. Nothing in
 * this file constructs a `Date`; it slices characters, which cannot be wrong
 * by a zone because it never knows about one.
 */

import type { Lang } from './i18n.ts';

/** What every formatter renders when the API sent `null`. */
const EMPTY = '—';

const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_HI = [
  'जनवरी',
  'फ़रवरी',
  'मार्च',
  'अप्रैल',
  'मई',
  'जून',
  'जुलाई',
  'अगस्त',
  'सितंबर',
  'अक्तूबर',
  'नवंबर',
  'दिसंबर',
];

/**
 * Month names for the birth form's month select: short in English, where
 * "September" does not fit a third of a phone, and the full Hindi names,
 * which are short already.
 */
export const MONTHS_LONG: Record<Lang, readonly string[]> = {
  en: MONTHS_EN,
  hi: MONTHS_HI,
};

/**
 * `HH:MM` out of a wall clock.
 *
 * `_lang` is taken and ignored: both languages use Western digits for clock
 * times today, and the parameter is here so that the day Devanagari digits
 * become an option, no call site has to change.
 */
export function clock(wall: string | null | undefined, _lang: Lang): string {
  if (!wall || wall.length < 16) return EMPTY;
  return wall.slice(11, 16);
}

/** `HH:MM–HH:MM` for the windows: rahu kaal, abhijit, brahma muhurta. */
export function window(
  w: { start?: string | null; end?: string | null } | null | undefined,
  lang: Lang,
): string {
  if (!w) return EMPTY;
  return `${clock(w.start, lang)}–${clock(w.end, lang)}`;
}

/**
 * Whether a string is a date the API will accept for `date`.
 *
 * Shape and range only: the API validates the calendar, and a widget that
 * tried to would need the `Date` this file exists to avoid.
 */
export function isoDate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * `22 Sep 2026` / `22 सितंबर 2026` from the date half of any wall clock.
 *
 * Takes the first ten characters, so `2026-09-22` and
 * `2026-09-22T06:13:13.728` both work and neither becomes a `Date`.
 */
export function dateLabel(iso: string | null | undefined, lang: Lang): string {
  if (!iso || iso.length < 10) return EMPTY;
  const year = iso.slice(0, 4);
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const names = lang === 'hi' ? MONTHS_HI : MONTHS_EN;
  const name = names[month - 1];
  if (!name || !Number.isFinite(day)) return EMPTY;
  return `${day} ${name} ${year}`;
}

/** `31 Oct` / `31 अक्तूबर`: {@link dateLabel} without the year. */
export function shortDate(iso: string | null | undefined, lang: Lang): string {
  const full = dateLabel(iso, lang);
  return full === EMPTY ? full : full.slice(0, full.lastIndexOf(' '));
}

/**
 * A `15°34'21.7"` string, as it came.
 *
 * A pass-through today, and a single call site for the day someone wants the
 * seconds dropped or the quote marks turned into primes.
 */
export function formatDegrees(dms: string | null | undefined): string {
  return dms ? dms.trim() : EMPTY;
}
