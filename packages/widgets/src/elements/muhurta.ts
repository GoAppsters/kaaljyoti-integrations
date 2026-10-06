/**
 * `<kj-muhurta>` — the day's choghadiya and its windows, on a timeline.
 *
 * `POST /v1/panchang/muhurta` for a place (no birth): sunrise, sunset and the
 * next sunrise, the eight day and eight night choghadiyas each good or not,
 * Rahu kaal, Yamaganda, Gulika and Abhijit. The bar runs from sunrise through
 * sunset to the next sunrise with the choghadiyas on one lane and the windows
 * on the other; under it the windows as text and the choghadiyas as a table,
 * day or night.
 *
 * 0.1.0 drew five chips from the daily panchang so a muhurta beside a
 * panchang cost nothing. The revamp spends that one call on the choghadiya,
 * which is what a muhurta page is read for (design system, "Decisions").
 */

import { KjElement, html, trusted } from '../core/element.ts';
import { clock, dateLabel, window as windowRange } from '../core/format.ts';
import { msg, type Dict } from '../core/dict.ts';
import { t, type Lang } from '../core/i18n.ts';
import {
  fetchMuhurta,
  placeLabel,
  type KjWindow,
  type MuhurtaDocument,
  type MuhurtaSlot,
} from '../core/panchang-request.ts';
import {
  badgeHtml,
  segmentedHtml,
  timelineHtml,
  wireChoices,
  wallMinutes,
  type Segment,
} from '../core/ui.ts';
import { placeNow } from './panchang.ts';
import timelineCss from '../styles/timeline.css';
import { dt, type DailyKey } from '../core/daily-words.ts';

/** The seven choghadiya names, in this widget's chunk (decision 24). */
const CG: Dict<
  'cg_amrit' | 'cg_shubh' | 'cg_labh' | 'cg_char' | 'cg_udveg' | 'cg_kaal' | 'cg_rog'
> = {
  en: {
    cg_amrit: 'Amrit',
    cg_shubh: 'Shubh',
    cg_labh: 'Labh',
    cg_char: 'Char',
    cg_udveg: 'Udveg',
    cg_kaal: 'Kaal',
    cg_rog: 'Rog',
  },
  hi: {
    cg_amrit: 'अमृत',
    cg_shubh: 'शुभ',
    cg_labh: 'लाभ',
    cg_char: 'चर',
    cg_udveg: 'उद्वेग',
    cg_kaal: 'काल',
    cg_rog: 'रोग',
  },
};

/** The seven choghadiya names the engine uses, as chrome keys. */
const CHOGHADIYA = new Set(['amrit', 'shubh', 'labh', 'char', 'udveg', 'kaal', 'rog']);

/** The windows, their field and their tone. */
const WINDOWS: readonly [DailyKey, keyof MuhurtaDocument, 'good' | 'bad'][] = [
  ['abhijit', 'abhijit', 'good'],
  ['rahu_kaal', 'rahu_kaal', 'bad'],
  ['yamaganda', 'yamaganda', 'bad'],
  ['gulika_kaal', 'gulika_kaal', 'bad'],
];

/** @see KjElement */
export class KjMuhurta extends KjElement {
  static readonly tag = 'kj-muhurta';

  static override styles = timelineCss;

  static readonly observedAttributes = [
    'city',
    'lat',
    'lon',
    'place',
    'timezone',
    'date',
    'lang',
    'powered-by',
  ];

  /** Which half of the choghadiya table is shown. */
  private half: 'day' | 'night' = 'day';

  private now: string | null = null;

  private listening = false;

  override connectedCallback(): void {
    if (!this.listening) {
      this.listening = true;
      wireChoices(this.root, (group, id) => {
        if (group === 'muhurta-part' && (id === 'day' || id === 'night')) {
          this.half = id;
          this.paint();
        }
      });
    }
    super.connectedCallback();
  }

  protected override async fetchData(): Promise<MuhurtaDocument> {
    const response = await fetchMuhurta(this);
    this.notePlan(response.plan);
    this.now = placeNow(response.meta);
    // After sunset (and before the next sunrise) the night's table is the one
    // a visitor wants first.
    const now = wallMinutes(this.now);
    const sunset = wallMinutes(response.data.sunset);
    const next = wallMinutes(response.data.next_sunrise);
    if (now !== null && sunset !== null && next !== null && now >= sunset && now < next) {
      this.half = 'night';
    }
    return response.data;
  }

  protected override heading(): { title: string; subtitle?: string } {
    const lang = this.activeLang;
    const doc = this.data as MuhurtaDocument | null;
    const parts = [placeLabel(this, lang)];
    if (doc?.sunrise) parts.push(dateLabel(doc.sunrise, lang));
    return {
      title: dt(this.activeLang, 'title_muhurta'),
      subtitle: parts.filter(Boolean).join(' · '),
    };
  }

  /** `Amrit`, or the engine's own word for a name we do not have. */
  private slotName(slot: MuhurtaSlot, lang: Lang): string {
    const id = (slot.choghadiya ?? '').toLowerCase();
    return CHOGHADIYA.has(id)
      ? msg(CG, lang, `cg_${id}` as keyof (typeof CG)['en'])
      : (slot.choghadiya ?? '');
  }

  protected override render(): string {
    const doc = this.data as MuhurtaDocument | null;
    if (!doc) return '';
    const lang = this.activeLang;
    const day = doc.choghadiya?.day ?? [];
    const night = doc.choghadiya?.night ?? [];

    const windows = WINDOWS.filter(
      ([key]) => key !== 'abhijit' || doc.abhijit_applies !== false,
    ).map(([key, field, tone]): Segment & { key: DailyKey } => {
      const span = doc[field] as KjWindow | null | undefined;
      return { key, start: span?.start, end: span?.end, tone, label: dt(lang, key) };
    });

    const bar = doc.sunrise
      ? timelineHtml({
          sunrise: doc.sunrise,
          sunset: doc.sunset,
          nextSunrise: doc.next_sunrise,
          lanes: [
            [...day, ...night].map((slot) => ({
              start: slot.start,
              end: slot.end,
              tone: slot.good ? 'good' : 'bad',
              label: this.slotName(slot, lang),
            })),
            windows,
          ],
          now: this.now,
          lang,
        })
      : '';

    const list = windows
      .filter((window) => window.start && window.end)
      .map(
        (window) =>
          html`<li part="window ${window.key}">
            <span class="kj-dot kj-dot-${window.tone}">${window.label}</span>
            <span class="kj-time">${windowRange(window as KjWindow, lang)}</span>
          </li>`,
      )
      .join('');

    const slots = this.half === 'day' ? day : night;
    const nowAt = wallMinutes(this.now);
    const rows = slots
      .map((slot) => {
        const from = wallMinutes(slot.start);
        const to = wallMinutes(slot.end);
        const current =
          nowAt !== null && from !== null && to !== null && from <= nowAt && nowAt < to;
        return html`<tr class="${current ? 'kj-now-row' : ''}" part="choghadiya">
          <th scope="row">
            ${this.slotName(slot, lang)}
            ${current ? trusted(badgeHtml(t(lang, 'now'), 'current')) : ''}
          </th>
          <td class="kj-num">
            <span class="kj-time">${clock(slot.start, lang)}–${clock(slot.end, lang)}</span>
          </td>
          <td>
            ${trusted(
              slot.good
                ? badgeHtml(t(lang, 'good_time'), 'good')
                : badgeHtml(t(lang, 'bad_time'), 'bad'),
            )}
          </td>
        </tr>`;
      })
      .join('');

    const table = rows
      ? html`<section class="kj-section" part="choghadiya-table">
          <div class="kj-row">
            <h3 class="kj-h3">${dt(lang, 'choghadiya')}</h3>
            ${trusted(
              segmentedHtml(
                'muhurta-part',
                dt(lang, 'choghadiya'),
                [
                  { id: 'day', label: dt(lang, 'day_part') },
                  { id: 'night', label: t(lang, 'night_part') },
                ],
                this.half,
              ),
            )}
          </div>
          <div class="kj-table-wrap">
            <table class="kj-table">
              <tbody>
                ${trusted(rows)}
              </tbody>
            </table>
          </div>
        </section>`
      : '';

    return html`<section class="kj-section" part="day">
        ${trusted(bar)}
        ${
          list
            ? trusted(
                html`<ul class="kj-wlist" part="windows">
                  ${trusted(list)}
                </ul>`,
              )
            : ''
        }
      </section>
      ${trusted(table)}`;
  }
}
