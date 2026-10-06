/**
 * What `<kj-horoscope>` and `<kj-reading>` share: the ids a reader picks
 * from, the grahas and house ordinals they name, the text shape, the
 * disclaimer, and the instants a horoscope answers in.
 *
 * Three things here differ from the panchang side of the package:
 *
 *   * **Text is keyed by language.** A reading is `{ en: '…', hi: '…' }`,
 *     holding exactly the languages the request asked for. The widgets ask
 *     for both (decision 10), so a `lang` flip still costs nothing.
 *   * **The pickers need names before any answer exists.** The twelve signs
 *     and twenty-seven nakshatras are therefore bundled here, in the engine's
 *     own spelling, rather than read from a response the way every other
 *     entity name is. The API's label wins wherever an answer carries one.
 *   * **A horoscope's times are instants, not wall clocks.** `from`, `to`,
 *     `entered` and `leaves` end in `Z`; {@link localWall} turns one into the
 *     wall clock of the zone the answer names, and from there the ordinary
 *     formatters in `format.ts` slice it as they slice everything else.
 */

import { html, trusted } from './html.ts';
import { dateLabel } from './format.ts';
import { pick, t, type Labelled, type Lang, type MessageKey } from './i18n.ts';

/** Both languages, in this order, on every request (decision 10). */
export const LANGUAGES: readonly ['en', 'hi'] = ['en', 'hi'];

/** `[id, English, Hindi]`, in zodiac order. */
export const SIGNS: readonly (readonly [string, string, string])[] = [
  ['aries', 'Aries', 'मेष'],
  ['taurus', 'Taurus', 'वृषभ'],
  ['gemini', 'Gemini', 'मिथुन'],
  ['cancer', 'Cancer', 'कर्क'],
  ['leo', 'Leo', 'सिंह'],
  ['virgo', 'Virgo', 'कन्या'],
  ['libra', 'Libra', 'तुला'],
  ['scorpio', 'Scorpio', 'वृश्चिक'],
  ['sagittarius', 'Sagittarius', 'धनु'],
  ['capricorn', 'Capricorn', 'मकर'],
  ['aquarius', 'Aquarius', 'कुंभ'],
  ['pisces', 'Pisces', 'मीन'],
];

/** `[id, English, Hindi]`, Ashwini to Revati. */
export const NAKSHATRAS: readonly (readonly [string, string, string])[] = [
  ['ashwini', 'Ashwini', 'अश्विनी'],
  ['bharani', 'Bharani', 'भरणी'],
  ['krittika', 'Krittika', 'कृत्तिका'],
  ['rohini', 'Rohini', 'रोहिणी'],
  ['mrigashira', 'Mrigashira', 'मृगशिरा'],
  ['ardra', 'Ardra', 'आर्द्रा'],
  ['punarvasu', 'Punarvasu', 'पुनर्वसु'],
  ['pushya', 'Pushya', 'पुष्य'],
  ['ashlesha', 'Ashlesha', 'आश्लेषा'],
  ['magha', 'Magha', 'मघा'],
  ['purva_phalguni', 'Purva Phalguni', 'पूर्वा फाल्गुनी'],
  ['uttara_phalguni', 'Uttara Phalguni', 'उत्तरा फाल्गुनी'],
  ['hasta', 'Hasta', 'हस्त'],
  ['chitra', 'Chitra', 'चित्रा'],
  ['swati', 'Swati', 'स्वाति'],
  ['vishakha', 'Vishakha', 'विशाखा'],
  ['anuradha', 'Anuradha', 'अनुराधा'],
  ['jyeshtha', 'Jyeshtha', 'ज्येष्ठा'],
  ['mula', 'Mula', 'मूल'],
  ['purva_ashadha', 'Purva Ashadha', 'पूर्वाषाढ़ा'],
  ['uttara_ashadha', 'Uttara Ashadha', 'उत्तराषाढ़ा'],
  ['shravana', 'Shravana', 'श्रवण'],
  ['dhanishta', 'Dhanishta', 'धनिष्ठा'],
  ['shatabhisha', 'Shatabhisha', 'शतभिषा'],
  ['purva_bhadrapada', 'Purva Bhadrapada', 'पूर्वा भाद्रपद'],
  ['uttara_bhadrapada', 'Uttara Bhadrapada', 'उत्तरा भाद्रपद'],
  ['revati', 'Revati', 'रेवती'],
];

/**
 * `[id, English, Hindi]`, Sun to Ketu. A horoscope keys its grahas by id and
 * labels nothing else about them, so their names are ours to supply; the
 * house lords' `lord` is labelled, and this is only its fallback.
 */
export const GRAHAS: readonly (readonly [string, string, string])[] = [
  ['sun', 'Sun', 'सूर्य'],
  ['moon', 'Moon', 'चंद्र'],
  ['mars', 'Mars', 'मंगल'],
  ['mercury', 'Mercury', 'बुध'],
  ['jupiter', 'Jupiter', 'गुरु'],
  ['venus', 'Venus', 'शुक्र'],
  ['saturn', 'Saturn', 'शनि'],
  ['rahu', 'Rahu', 'राहु'],
  ['ketu', 'Ketu', 'केतु'],
];

/** Hindi ordinals for the twelve houses: `षष्ठ भाव`. */
const HOUSES_HI = [
  'प्रथम',
  'द्वितीय',
  'तृतीय',
  'चतुर्थ',
  'पंचम',
  'षष्ठ',
  'सप्तम',
  'अष्टम',
  'नवम',
  'दशम',
  'एकादश',
  'द्वादश',
];

/** `6th` / `षष्ठ`: a house number as the horoscope and the house lords say it. */
export function houseOrdinal(n: number, lang: Lang): string {
  if (lang === 'hi') return HOUSES_HI[n - 1] ?? String(n);
  const unit = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : unit === 1 ? 'st' : unit === 2 ? 'nd' : unit === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** The id of a table row that names `raw`, or `null`. */
export function known(
  table: readonly (readonly [string, string, string])[],
  raw: string | null | undefined,
): string | null {
  const id = raw?.trim().toLowerCase();
  return table.some((row) => row[0] === id) ? (id as string) : null;
}

/** A bundled name in `lang`, or the id itself for one the table lacks. */
export function tableName(
  table: readonly (readonly [string, string, string])[],
  id: string,
  lang: Lang,
): string {
  const row = table.find((entry) => entry[0] === id);
  return row ? row[lang === 'hi' ? 2 : 1] : id;
}

/** A label from an answer, falling back to the bundled table. */
export function labelled(
  value: Labelled | null | undefined,
  table: readonly (readonly [string, string, string])[],
  lang: Lang,
): string {
  if (!value) return '';
  return pick(value.names, tableName(table, value.id, lang), lang);
}

/** One piece of report text: `{ en?, hi? }`. */
export type ReportText = Partial<Record<Lang, string>>;

/** The text in `lang`, or whatever language the answer does have. */
export function textOf(text: ReportText | null | undefined, lang: Lang): string {
  return text?.[lang] ?? Object.values(text ?? {})[0] ?? '';
}

/** `options.disclaimer`, when the element asks for anything but the default. */
export type DisclaimerOption = 'off' | { name: string; url?: string };

/**
 * `disclaimer="off"`, or `disclaimer-name` (and `disclaimer-url`) naming the
 * site's own astrologer, or nothing — which is the API's default line, and
 * keeps the cache key the same as a neighbour that wrote nothing.
 *
 * The API caps a name at 80 characters and a URL at 200; past that the
 * request would be refused, so an over-long value is dropped here instead.
 */
export function disclaimerOption(el: Element): DisclaimerOption | undefined {
  if (el.getAttribute('disclaimer')?.trim().toLowerCase() === 'off') return 'off';
  const name = el.getAttribute('disclaimer-name')?.trim();
  if (!name || name.length > 80) return undefined;
  const url = el.getAttribute('disclaimer-url')?.trim();
  return url && /^https?:\/\/\S+$/i.test(url) && url.length <= 200 ? { name, url } : { name };
}

/** The request `options` every report element sends. */
export function reportOptions(el: Element): {
  language: readonly ['en', 'hi'];
  disclaimer?: DisclaimerOption;
} {
  const disclaimer = disclaimerOption(el);
  return disclaimer ? { language: LANGUAGES, disclaimer } : { language: LANGUAGES };
}

/** The closing line, for the card's footer, or nothing when the answer has none. */
export function disclaimerHtml(text: ReportText | null | undefined, lang: Lang): string {
  const line = textOf(text, lang);
  return line ? html`<p class="kj-disclaimer" part="disclaimer">${line}</p>` : '';
}

/**
 * The attributes the report elements pass on to one another, so a
 * `<kj-kundli-form>` can hand its disclaimer to the readings it draws.
 */
export const DISCLAIMER_ATTRIBUTES = ['disclaimer', 'disclaimer-name', 'disclaimer-url'] as const;

/** The zone an answer says it was computed in: `meta.timezone`. */
export interface AnswerZone {
  name?: string | null;
  utc_offset?: string | null;
}

/**
 * `2026-09-28T04:46:38.438Z` → `2026-09-28T10:16` in the answer's zone.
 *
 * The zone's name goes to `Intl`, which knows its daylight-saving rules; the
 * fixed `utc_offset` is the fallback for an answer computed from an offset
 * (or an engine without the zone). Either way the reader's own zone plays no
 * part, which is the whole of decision 7.
 */
export function localWall(instant: string | null | undefined, zone: AnswerZone | null): string {
  const ms = instant ? Date.parse(instant) : Number.NaN;
  if (!Number.isFinite(ms)) return '';
  if (zone?.name) {
    try {
      // `sv-SE` formats as `2026-09-28 10:16`, which is ISO but for the space.
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: zone.name,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .format(ms)
        .replace(' ', 'T');
    } catch {
      // An unknown zone name: fall through to the offset.
    }
  }
  const offset = /^([+-])(\d{2}):(\d{2})$/.exec(zone?.utc_offset ?? '');
  const minutes = offset ? (offset[1] === '-' ? -1 : 1) * (+offset[2]! * 60 + +offset[3]!) : 0;
  return new Date(ms + minutes * 60_000).toISOString().slice(0, 16);
}

/** `YYYY-MM-DD` today in `zone`, moved by `days`: the day tabs' dates. */
export function dayIn(zone: string, days: number): string {
  const today = localWall(new Date().toISOString(), { name: zone }).slice(0, 10);
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * The tone of a summary: `favourable`, `mixed` or `care`. A badge, never a
 * number — the API gives none, and a widget that made one up would be
 * claiming a precision the reading does not have.
 */
export type Level = 'favourable' | 'mixed' | 'care';

/** One summary line or life area: `{ area?, level, text }`. */
export interface Summary {
  area?: string;
  level?: string;
  text?: ReportText;
}

/** The badge for a level; an unknown level shows nothing rather than a raw id. */
export function levelHtml(level: string | null | undefined, lang: Lang): string {
  if (level !== 'favourable' && level !== 'mixed' && level !== 'care') return '';
  return html`<span class="kj-level kj-level-${level}" part="level level-${level}"
    >${t(lang, `level_${level}`)}</span
  >`;
}

/** The area ids the chrome names: the horoscope's, the varshphal's and the life areas'. */
const NAMED_AREAS =
  'work money relationships health education home travel self wealth siblings children marriage fortune career foreign'.split(
    ' ',
  );

/** An area id as a label: `area_work`, or the id itself for one we lack. */
export function areaName(area: string, lang: Lang): string {
  return NAMED_AREAS.includes(area) ? t(lang, `area_${area}` as MessageKey) : area;
}

/** The overall line, with its badge, above the areas. */
export function summaryHtml(summary: Summary | null | undefined, lang: Lang): string {
  const text = textOf(summary?.text, lang);
  if (!text) return '';
  return html`<div class="kj-summary" part="summary">
    ${trusted(levelHtml(summary?.level, lang))}
    <p part="text">${text}</p>
  </div>`;
}

/** One card per area — its name, its badge, its text — in the answer's order. */
export function areasHtml(areas: readonly Summary[] | null | undefined, lang: Lang): string {
  const items = (areas ?? [])
    .map(
      (area) =>
        html`<li
          class="kj-area"
          part="area area-${area.area ?? ''}"
          data-level="${area.level ?? ''}"
        >
          <p class="kj-area-head" part="area-head">
            <strong>${areaName(area.area ?? '', lang)}</strong>
            ${trusted(levelHtml(area.level, lang))}
          </p>
          <p part="text">${textOf(area.text, lang)}</p>
        </li>`,
    )
    .join('');
  return items
    ? html`<ul class="kj-areas" part="areas">
        ${trusted(items)}
      </ul>`
    : '';
}

/** `14 May 1990 – 23 Nov 2003`, each end read in the answer's zone. */
export function rangeText(
  from: string | null | undefined,
  to: string | null | undefined,
  zone: AnswerZone | null,
  lang: Lang,
): string {
  return `${dateLabel(localWall(from, zone), lang)} – ${dateLabel(localWall(to, zone), lang)}`;
}
