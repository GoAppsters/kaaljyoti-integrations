/**
 * `<kj-panchang>` — the day's five limbs for a place.
 *
 * One call (decision 11), shared with any `<kj-muhurta>` beside it (decision
 * 4), rendered from a document that carries both languages so a `lang` flip
 * costs nothing (decision 10). Every wall clock is sliced, never parsed
 * (decision 7), and every response string is escaped on its way into markup.
 */

import { KjElement, html, trusted } from '../core/element.ts';
import { clock, dateLabel, window as windowRange } from '../core/format.ts';
import { localWall, type AnswerZone } from '../core/reports.ts';
import { tilesHtml, timelineHtml, type Segment, type Tile } from '../core/ui.ts';
import { masaName, nameOf, t, type Lang } from '../core/i18n.ts';
import {
  fetchPanchang,
  placeLabel,
  type KjWindow,
  type PanchangDocument,
} from '../core/panchang-request.ts';
import timelineCss from '../styles/timeline.css';
import { msg, type Dict } from '../core/dict.ts';
import { dt, type DailyKey } from '../core/daily-words.ts';

/** The eight directions `disha_shool` can name, in this widget's chunk (decision 24). */
const DIRECTIONS: Dict<
  | 'dir_north'
  | 'dir_north_east'
  | 'dir_east'
  | 'dir_south_east'
  | 'dir_south'
  | 'dir_south_west'
  | 'dir_west'
  | 'dir_north_west'
> = {
  en: {
    dir_north: 'North',
    dir_north_east: 'North-east',
    dir_east: 'East',
    dir_south_east: 'South-east',
    dir_south: 'South',
    dir_south_west: 'South-west',
    dir_west: 'West',
    dir_north_west: 'North-west',
  },
  hi: {
    dir_north: 'उत्तर',
    dir_north_east: 'उत्तर-पूर्व',
    dir_east: 'पूर्व',
    dir_south_east: 'दक्षिण-पूर्व',
    dir_south: 'दक्षिण',
    dir_south_west: 'दक्षिण-पश्चिम',
    dir_west: 'पश्चिम',
    dir_north_west: 'उत्तर-पश्चिम',
  },
};

/**
 * `north` → `North` / `उत्तर`, for `disha_shool`.
 *
 * Unlike the names above this one goes through the chrome dictionary, because
 * a direction is a word of ours rather than an entity the engine names: the
 * response carries a bare lower-case key with no `names` object. Spelling is
 * normalised (`North East`, `north_east`, `north-east` are one key) and an
 * unknown value passes through as it came.
 */
function translateDirection(raw: string | null | undefined, lang: Lang): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const key =
    `dir_${trimmed.toLowerCase().replace(/[\s_-]+/g, '_')}` as keyof (typeof DIRECTIONS)['en'];
  return key in DIRECTIONS.en ? msg(DIRECTIONS, lang, key) : trimmed;
}

/** What `show` can name, and the order the blocks render in regardless. */
const SECTIONS = [
  'header',
  'tithi',
  'nakshatra',
  'yoga',
  'karana',
  'sun',
  'windows',
  'masa',
] as const;

type Section = (typeof SECTIONS)[number];

/** The five day windows: label, where they live, and whether they are kind. */
const WINDOWS: readonly [DailyKey, keyof PanchangDocument, 'kj-good' | 'kj-bad'][] = [
  ['brahma_muhurta', 'brahma_muhurta', 'kj-good'],
  ['abhijit', 'abhijit_muhurta', 'kj-good'],
  ['rahu_kaal', 'rahu_kalam', 'kj-bad'],
  ['yamaganda', 'yamaganda', 'kj-bad'],
  ['gulika_kaal', 'gulika_kalam', 'kj-bad'],
];

/**
 * `Ekadashi until 21:44` / `एकादशी 21:44 तक`, and `until tomorrow 09:09` when
 * the limb runs past midnight.
 *
 * Two things this has to get right. `तक` is a postposition, so the two
 * languages do not put the clock in the same place; a single
 * `{name} {until} {time}` template would read as pidgin Hindi. And a limb
 * routinely ends on the *next* civil day — the fixture's nakshatra ends at
 * 09:09 on the 23rd while the card is the 22nd — where a bare `09:09` reads
 * as this morning, which is the one reading that is certainly wrong.
 *
 * `day` is `data.at`, the day the card is about. Only the date halves are
 * compared, character by character (decision 7: nothing here becomes a
 * `Date`). A limb is at most a day and a bit long, so a differing date is
 * always tomorrow.
 */
function untilText(
  name: string,
  wall: string | null | undefined,
  day: string | null | undefined,
  lang: Lang,
): string {
  if (!wall) return name;
  const overnight = Boolean(day) && wall.slice(0, 10) !== day?.slice(0, 10);
  const time = overnight ? `${dt(lang, 'tomorrow')} ${clock(wall, lang)}` : clock(wall, lang);
  const until = t(lang, 'until');
  return lang === 'hi' ? `${name} ${time} ${until}` : `${name} ${until} ${time}`;
}

/** The windows a panchang carries, in the order they are listed. */
export function windowListHtml(doc: PanchangDocument, lang: Lang): string {
  const items = WINDOWS.map(([key, field, tone]) => {
    const span = doc[field] as KjWindow | null | undefined;
    if (!span?.start || !span.end) return '';
    const dot = tone === 'kj-good' ? 'kj-dot-good' : 'kj-dot-bad';
    return html`<li class="kj-chip-row" part="window ${key}">
      <span class="kj-dot ${dot}">${dt(lang, key)}</span>
      <span class="kj-time">${windowRange(span, lang)}</span>
    </li>`;
  }).filter(Boolean);
  if (!items.length) return '';
  return html`<ul class="kj-wlist" part="windows">
    ${trusted(items.join(''))}
  </ul>`;
}

/**
 * The five windows as chips — 0.1.0's strip, kept for a page that wants it
 * small (`show="windows"` alone draws the list and the bar, not these).
 */
export function windowChipsHtml(doc: PanchangDocument, lang: Lang): string {
  const chips = WINDOWS.map(([key, field, tone]) => {
    const span = doc[field] as KjWindow | null | undefined;
    if (!span?.start || !span.end) return '';
    return html`<li class="kj-chip ${tone}" part="window ${key}">
      <span class="kj-chip-label">${dt(lang, key)}</span>
      <span class="kj-time">${windowRange(span, lang)}</span>
    </li>`;
  }).filter(Boolean);

  if (!chips.length) return '';
  return html`<ul class="kj-chips" part="windows">
    ${trusted(chips.join(''))}
  </ul>`;
}

/** The place's wall clock now, in the answer's zone, for the timeline's tick. */
export function placeNow(meta: unknown): string | null {
  const zone = (meta as { timezone?: AnswerZone } | null)?.timezone;
  return zone ? localWall(new Date().toISOString(), zone) : null;
}

/** @see KjElement */
export class KjPanchang extends KjElement {
  static readonly tag = 'kj-panchang';

  static override styles = timelineCss;

  /**
   * `lang`, `powered-by` and `show` repaint; the rest re-request (see
   * `attributeChangedCallback`). `show` does go through `load()`, but the
   * cache answers it without a second call.
   */
  static readonly observedAttributes = [
    'city',
    'lat',
    'lon',
    'place',
    'timezone',
    'date',
    'lang',
    'show',
    'powered-by',
  ];

  /** The place's wall clock at the answer, when the day shown is today there. */
  private now: string | null = null;

  protected override async fetchData(): Promise<PanchangDocument> {
    const response = await fetchPanchang(this);
    // The plan decides whether `powered-by="hidden"` is honoured (decision 9).
    this.now = placeNow(response.meta);
    return response.data;
  }

  /**
   * The blocks to render.
   *
   * A `show` naming nothing we recognise falls back to everything: a typo
   * should not blank the widget, and an empty card is the one outcome a page
   * owner cannot debug from the outside.
   */
  private sections(): Set<Section> {
    const raw = this.getAttribute('show');
    if (!raw) return new Set(SECTIONS);
    const asked = new Set(raw.split(/\s+/).filter(Boolean));
    const kept = SECTIONS.filter((section) => asked.has(section));
    return new Set(kept.length ? kept : SECTIONS);
  }

  protected override heading(): { title: string; subtitle?: string } | null {
    if (!this.sections().has('header')) return null;
    const lang = this.activeLang;
    const doc = this.data as PanchangDocument | null;
    const parts = [placeLabel(this, lang)];
    if (doc) {
      parts.push(dateLabel(doc.at, lang));
      const vara = nameOf(doc.panchang?.vara, lang);
      if (vara) parts.push(vara);
    }
    return {
      title: dt(this.activeLang, 'title_panchang'),
      subtitle: parts.filter(Boolean).join(' · '),
    };
  }

  /**
   * `Shukla Ekadashi` and, under it, `until 21:44, then Dwadashi`.
   *
   * A civil day runs from sunrise to sunrise and a tithi does not, so most
   * days hold one and a good many hold two; `tithis` is the engine's own list
   * and is the only honest source for the second one. The paksha is printed
   * once unless it changes, which it does only at Purnima and Amavasya.
   */
  private tithiTile(doc: PanchangDocument, lang: Lang): Tile {
    const entries = (doc.tithis ?? []).filter((entry) => entry?.name);
    const label = t(lang, 'tithi');
    if (entries.length > 1) {
      const first = entries[0]!;
      const name = `${nameOf(first.paksha, lang)} ${nameOf(first.name, lang)}`.trim();
      let previous = first.paksha?.id ?? '';
      const then = entries
        .slice(1)
        .map((entry) => {
          const paksha =
            entry.paksha && entry.paksha.id !== previous ? `${nameOf(entry.paksha, lang)} ` : '';
          previous = entry.paksha?.id || previous;
          return `${dt(lang, 'then')} ${paksha}${nameOf(entry.name, lang)}`;
        })
        .join(', ');
      return {
        key: 'tithi',
        label,
        value: html`${name}`,
        sub: html`${untilText('', first.ends, doc.at, lang).trim()}, ${then}`,
      };
    }
    const limbs = doc.panchang;
    const single = `${nameOf(limbs?.paksha, lang)} ${nameOf(limbs?.tithi_name, lang)}`.trim();
    return {
      key: 'tithi',
      label,
      value: html`${single || '—'}`,
      sub: html`${untilText('', entries[0]?.ends ?? doc.tithi_ends, doc.at, lang).trim()}`,
    };
  }

  /** `Shravana`, and `until tomorrow 09:09 · Pada 1` under it. */
  private nakshatraTile(doc: PanchangDocument, lang: Lang): Tile {
    const nakshatra = doc.panchang?.nakshatra;
    const pada = doc.panchang?.pada;
    const until = untilText('', doc.nakshatra_ends, doc.at, lang).trim();
    return {
      key: 'nakshatra',
      label: t(lang, 'nakshatra'),
      value: html`${nameOf(nakshatra, lang) || '—'}`,
      sub: html`${[until, pada ? `${t(lang, 'pada')} ${pada}` : ''].filter(Boolean).join(' · ')}`,
    };
  }

  /** `Bhadrapada`, and `Vikram Samvat 2083` under it, with `Adhik` on a leap month. */
  private masaTile(doc: PanchangDocument, lang: Lang): Tile | null {
    const masa = doc.masa;
    const month = masaName(masa?.month_name, masa?.is_adhik, lang);
    if (!masa || !month) return null;
    return {
      key: 'masa',
      label: dt(lang, 'masa'),
      value: html`${month}`,
      sub: masa.samvat_year ? html`${dt(lang, 'vikram_samvat')} ${masa.samvat_year}` : undefined,
    };
  }

  protected override render(): string {
    const doc = this.data as PanchangDocument | null;
    if (!doc) return '';

    const lang = this.activeLang;
    const show = this.sections();
    const limbs = doc.panchang;
    const tiles: Tile[] = [];

    if (show.has('tithi')) tiles.push(this.tithiTile(doc, lang));
    if (show.has('nakshatra')) tiles.push(this.nakshatraTile(doc, lang));
    if (show.has('yoga')) {
      tiles.push({
        key: 'yoga',
        label: t(lang, 'yoga'),
        value: html`${nameOf(limbs?.yoga_name, lang) || '—'}`,
        sub: html`${untilText('', doc.yoga_ends, doc.at, lang).trim()}`,
      });
    }
    if (show.has('karana')) {
      tiles.push({
        key: 'karana',
        label: dt(lang, 'karana'),
        value: html`${nameOf(limbs?.karana_name, lang) || '—'}`,
        sub: html`${untilText('', doc.karana_ends, doc.at, lang).trim()}`,
      });
    }
    if (show.has('tithi') || show.has('header')) {
      tiles.push({
        key: 'vara',
        label: dt(lang, 'vara'),
        value: html`${nameOf(limbs?.vara, lang) || '—'}`,
      });
    }
    if (show.has('masa')) {
      const masa = this.masaTile(doc, lang);
      if (masa) tiles.push(masa);
    }
    if (show.has('sun')) {
      tiles.push({
        key: 'sunrise',
        label: dt(lang, 'sunrise'),
        value: html`<span class="kj-time">${clock(doc.sunrise, lang)}</span>`,
      });
      tiles.push({
        key: 'sunset',
        label: dt(lang, 'sunset'),
        value: html`<span class="kj-time">${clock(doc.sunset, lang)}</span>`,
      });
    }

    const blocks: string[] = [];
    if (tiles.length) blocks.push(tilesHtml(tiles, 'rows'));

    if (show.has('windows')) {
      const bad = (field: keyof PanchangDocument, key: DailyKey): Segment => {
        const span = doc[field] as KjWindow | null | undefined;
        return { start: span?.start, end: span?.end, tone: 'bad', label: dt(lang, key) };
      };
      const bar = doc.sunrise
        ? timelineHtml({
            sunrise: doc.sunrise,
            sunset: doc.sunset,
            // Two lanes, because Abhijit and Rahu kaal can overlap and one
            // must not hide the other.
            lanes: [
              [
                {
                  start: doc.abhijit_muhurta?.start,
                  end: doc.abhijit_muhurta?.end,
                  tone: 'good',
                  label: dt(lang, 'abhijit'),
                },
              ],
              [
                bad('rahu_kalam', 'rahu_kaal'),
                bad('yamaganda', 'yamaganda'),
                bad('gulika_kalam', 'gulika_kaal'),
              ],
            ],
            now: this.now && this.now.slice(0, 10) === doc.at?.slice(0, 10) ? this.now : null,
            lang,
          })
        : '';
      const disha = doc.disha_shool
        ? html`<li part="disha-shool">
            <span class="kj-dot">${dt(lang, 'disha_shool')}</span>
            <span>${translateDirection(doc.disha_shool, lang)}</span>
          </li>`
        : '';
      const list = windowListHtml(doc, lang).replace('</ul>', `${disha}</ul>`);
      blocks.push(
        html`<section class="kj-section" part="day">
          <h3 class="kj-h3">${dt(lang, 'day_timeline')}</h3>
          ${trusted(bar)} ${trusted(list)}
        </section>`,
      );
    }

    return blocks.join('');
  }
}
