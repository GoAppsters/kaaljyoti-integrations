/**
 * `<kj-horoscope>` — a sign's horoscope for a day, a week, a month or a year.
 *
 * One `POST /v1/horoscope` per sign, period and day. The reader picks a sign
 * from the twelve and a period from the tabs; both write the element's own
 * attributes, so the base's one-load-per-change rule does the rest and a page
 * can read back what the reader chose. Until a sign is chosen nothing is
 * asked for.
 *
 * What it renders is the answer's summaries: the overall line first, then one
 * card for each of five life areas, each with a level badge — favourable,
 * mixed or needs care. There are no scores or percentages in the answer, and
 * none are made up here. The transits the API read them from (`basis`) are
 * for the site, not the reader, and stay hidden unless the page sets
 * `show-basis`, which adds them folded away under the areas.
 */

import { cacheKey, memo } from '../core/cache.ts';
import { request } from '../core/client.ts';
import { KjElement, html, trusted, useSigns } from '../core/element.ts';
import * as signs from '../core/signs.ts';
import type { KjError } from '../core/errors.ts';
import {
  segmentedHtml,
  signHtml,
  signIcon,
  skeletonHtml,
  tabPanelHtml,
  tabsHtml,
  wireChoices,
} from '../core/ui.ts';
import { clock, dateLabel, isoDate, shortDate } from '../core/format.ts';
import { t, type Labelled, type Lang } from '../core/i18n.ts';
import { msg, type Dict } from '../core/dict.ts';
import {
  GRAHAS,
  SIGNS,
  areasHtml,
  dayIn,
  disclaimerHtml,
  houseOrdinal,
  known,
  labelled,
  localWall,
  reportOptions,
  summaryHtml,
  tableName,
  type AnswerZone,
  type ReportText,
  type Summary,
} from '../core/reports.ts';
import horoscopeCss from '../styles/horoscope.css';

const PATH = '/horoscope';

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
type Period = (typeof PERIODS)[number];

/** The day tabs under `daily`: offset from today, and its label. */
/** The horoscope's own words (decision 24): only its chunk carries them. */
export const HOROSCOPE_WORDS: Dict<
  | 'horoscope'
  | `period_${'daily' | 'weekly' | 'monthly' | 'yearly'}`
  | 'yesterday'
  | 'next_day'
  | 'in_house'
  | 'unfavourable'
  | 'choose_period'
  | 'choose_day'
> = {
  en: {
    horoscope: 'Horoscope',
    period_daily: 'Daily',
    period_weekly: 'Weekly',
    period_monthly: 'Monthly',
    period_yearly: 'Yearly',
    yesterday: 'Yesterday',
    next_day: 'Tomorrow',
    in_house: 'in your {n} house',
    unfavourable: 'unfavourable',
    choose_period: 'Period',
    choose_day: 'Day',
  },
  hi: {
    horoscope: 'राशिफल',
    period_daily: 'दैनिक',
    period_weekly: 'साप्ताहिक',
    period_monthly: 'मासिक',
    period_yearly: 'वार्षिक',
    yesterday: 'गत दिवस',
    next_day: 'आगामी दिवस',
    in_house: 'आपके {n} भाव में',
    unfavourable: 'अशुभ',
    choose_period: 'अवधि',
    choose_day: 'दिन',
  },
};

const M = HOROSCOPE_WORDS;

const DAYS: readonly [number, 'yesterday' | 'today' | 'next_day'][] = [
  [-1, 'yesterday'],
  [0, 'today'],
  [1, 'next_day'],
];

/** The API's default zone, and so the zone "today" is counted in. */
const DEFAULT_ZONE = 'Asia/Kolkata';

/**
 * One transit behind the summaries: a graha in one sign, inside the period.
 * Shown only with `show-basis`.
 */
export interface HoroscopeBasis {
  graha: Labelled;
  sign: Labelled;
  house: number;
  nature: string;
  from: string;
  to: string;
  entered: string | null;
  leaves: string | null;
  retrograde: boolean;
}

/** `data` of `POST /v1/horoscope`. */
export interface HoroscopeDocument {
  sign: Labelled;
  period: string;
  from: string;
  to: string;
  summary: Summary;
  /** Work, money, relationships, health and education, in that order. */
  areas: Summary[];
  basis?: HoroscopeBasis[];
  disclaimer?: ReportText;
}

/** What `fetchData` keeps: the document and the zone its instants are read in. */
interface Answer {
  doc: HoroscopeDocument;
  zone: AnswerZone | null;
  period: Period;
}

/** @see KjElement */
export class KjHoroscope extends KjElement {
  static readonly tag = 'kj-horoscope';

  static override styles = horoscopeCss;

  static readonly observedAttributes = [
    'sign',
    'period',
    'date',
    'timezone',
    'show-basis',
    'disclaimer',
    'disclaimer-name',
    'disclaimer-url',
    'lang',
    'powered-by',
  ];

  private listening = false;

  constructor() {
    super();
    // The picker is the first paint: the icons must not wait for a fetch.
    useSigns(signs);
  }

  /** The control a pick came from, focused again once the repaint has replaced it. */
  private refocus: string | null = null;

  override connectedCallback(): void {
    // Delegated, on the shadow root: every repaint replaces the buttons.
    if (!this.listening) {
      this.listening = true;
      this.root.addEventListener('click', (event) => this.onClick(event));
      wireChoices(this.root, (group, id) => {
        if (group === 'period') {
          this.refocus = `[data-tab-group="period"][data-tab="${id}"]`;
          this.setAttribute('period', id);
        } else if (group === 'day') {
          this.refocus = `[data-seg-group="day"][data-seg="${id}"]`;
          const offset = Number(id);
          if (offset === 0) this.removeAttribute('date');
          else this.setAttribute('date', dayIn(this.zone, offset));
        }
      });
    }
    super.connectedCallback();
  }

  /** The chosen sign, or `null` until there is one. */
  private get sign(): string | null {
    return known(SIGNS, this.getAttribute('sign'));
  }

  private get period(): Period {
    const raw = this.getAttribute('period')?.trim().toLowerCase();
    return PERIODS.find((period) => period === raw) ?? 'daily';
  }

  private get zone(): string {
    return this.getAttribute('timezone')?.trim() || DEFAULT_ZONE;
  }

  /** `show-basis`, present and not `false` — the WordPress wrapper writes `true`/`false`. */
  private get showsBasis(): boolean {
    const raw = this.getAttribute('show-basis');
    return raw !== null && raw.trim().toLowerCase() !== 'false';
  }

  /** `YYYY-MM-DD`, or `null` for today (sent as no `date` at all). */
  private get date(): string | null {
    const raw = this.getAttribute('date')?.trim();
    return raw && raw !== 'today' && isoDate(raw) ? raw : null;
  }

  /**
   * No sign, no call: the picker is the ready state, and no `kj-ready`
   * announces a render that carries no answer.
   */
  protected override load(): Promise<void> {
    if (this.sign) return super.load();
    this.data = null;
    this.state = 'ready';
    this.paint();
    return Promise.resolve();
  }

  protected override async fetchData(): Promise<Answer> {
    const period = this.period;
    const body: Record<string, unknown> = { sign: this.sign, period };
    const date = this.date;
    if (date) body.date = date;
    const zone = this.getAttribute('timezone')?.trim();
    if (zone) body.timezone = zone;
    body.options = reportOptions(this);

    const answer = await memo(cacheKey(PATH, body), () => request<HoroscopeDocument>(PATH, body));
    const meta = answer.meta as { timezone?: AnswerZone } | null;
    return { doc: answer.data, zone: meta?.timezone ?? { name: zone || DEFAULT_ZONE }, period };
  }

  /** A sign: an attribute on the host. Periods and days go through {@link wireChoices}. */
  private onClick(event: Event): void {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>('[data-sign]');
    const sign = button?.dataset.sign;
    if (!sign) return;
    this.refocus = `[data-sign="${sign}"]`;
    this.setAttribute('sign', sign);
  }

  protected override heading(): { title: string; subtitle?: string } {
    return {
      title: msg(M, this.activeLang, 'horoscope'),
      subtitle: this.sign ? undefined : this.t('choose_sign'),
    };
  }

  protected override footerNote(): string {
    const answer = this.data as Answer | null;
    return answer ? disclaimerHtml(answer.doc.disclaimer, this.activeLang) : '';
  }

  /** The pickers stay while a reading loads, so the page does not jump. */
  protected override loadingHtml(): string {
    return this.pickerHtml(this.activeLang, skeletonHtml('lines', this.t('loading')));
  }

  /** …and when it fails; a plan refusal is the plan-required state under them. */
  protected override errorHtml(failure: KjError | null = this.failure): string {
    return this.pickerHtml(this.activeLang, super.errorHtml(failure));
  }

  protected override render(): string {
    const lang = this.activeLang;
    const answer = this.data as Answer | null;
    return this.pickerHtml(lang, answer ? this.answerHtml(answer, lang) : '');
  }

  protected override paint(): void {
    super.paint();
    if (this.refocus) {
      this.root.querySelector<HTMLElement>(this.refocus)?.focus({ preventScroll: true });
      if (this.state !== 'loading') this.refocus = null;
    }
  }

  /**
   * The twelve signs as a grid of icon cards (decision 29), then the four periods as tabs
   * whose panel is the reading, and for a day the three days.
   */
  private pickerHtml(lang: Lang, reading: string): string {
    const chosen = this.sign;
    const signs = SIGNS.map(
      ([id]) =>
        html`<button
          type="button"
          class="kj-sign-btn"
          part="sign sign-${id}"
          data-sign="${id}"
          aria-pressed="${String(id === chosen)}"
        >
          ${trusted(signIcon(id, 'l'))}
          <span class="kj-sign-name">${tableName(SIGNS, id, lang)}</span>
        </button>`,
    ).join('');
    const grid = html`<div
      class="kj-signs"
      part="signs"
      role="group"
      aria-label="${t(lang, 'choose_sign')}"
    >
      ${trusted(signs)}
    </div>`;
    if (!chosen) return grid;

    const current = this.period;
    const periods = tabsHtml(
      'period',
      msg(M, lang, 'choose_period'),
      PERIODS.map((period) => ({ id: period, label: msg(M, lang, `period_${period}`) })),
      current,
    );

    let days = '';
    if (current === 'daily') {
      const date = this.date;
      const active = DAYS.find(([offset]) =>
        offset === 0 ? !date : date === dayIn(this.zone, offset),
      );
      days = html`<div class="kj-controls">
        ${trusted(
          segmentedHtml(
            'day',
            msg(M, lang, 'choose_day'),
            DAYS.map(([offset, key]) => ({
              id: String(offset),
              label: key === 'today' ? t(lang, key) : msg(M, lang, key),
            })),
            active ? String(active[0]) : '',
          ),
        )}
      </div>`;
    }

    return html`${trusted(grid)} ${trusted(periods)}
    ${trusted(tabPanelHtml('period', current, days + reading))}`;
  }

  private answerHtml({ doc, zone, period }: Answer, lang: Lang): string {
    return html`<div class="kj-reading-head" part="heading">
        <p class="kj-reading-title">
          ${trusted(signHtml(doc.sign?.id, labelled(doc.sign, SIGNS, lang), 'm'))} ·
          ${msg(M, lang, `period_${period}`)}
        </p>
        <span class="kj-muted" part="span">${this.periodSpan(doc, zone, period, lang)}</span>
      </div>
      ${trusted(summaryHtml(doc.summary, lang))} ${trusted(areasHtml(doc.areas, lang))}
      ${trusted(this.showsBasis ? this.basisHtml(doc, zone, period, lang) : '')}`;
  }

  /** `28 Sep 2026`, or `28 Sep – 4 Oct` for a longer period. */
  private periodSpan(
    doc: HoroscopeDocument,
    zone: AnswerZone | null,
    period: Period,
    lang: Lang,
  ): string {
    const start = localWall(doc.from, zone);
    if (period === 'daily') return dateLabel(start, lang);
    // `to` is the next period's first midnight; the last day is the one before.
    const last = localWall(new Date(Date.parse(doc.to) - 60_000).toISOString(), zone);
    return `${shortDate(start, lang)} – ${dateLabel(last, lang)}`;
  }

  /**
   * `show-basis`: the transits, one line each — "Sun · in your 6th house ·
   * Virgo · favourable", the ℞ and any sign change — folded under the areas.
   */
  private basisHtml(
    doc: HoroscopeDocument,
    zone: AnswerZone | null,
    period: Period,
    lang: Lang,
  ): string {
    const items = (doc.basis ?? [])
      .map((transit) => {
        const id = transit.graha?.id ?? '';
        const span = this.spanText(transit, zone, period, lang);
        const nature =
          transit.nature === 'favourable'
            ? t(lang, 'favourable')
            : transit.nature === 'unfavourable'
              ? msg(M, lang, 'unfavourable')
              : '';
        return html`<li part="transit transit-${id}">
          <strong style="color:var(--kj-planet-${id})"
            >${labelled(transit.graha, GRAHAS, lang)}</strong
          >
          ${msg(M, lang, 'in_house', { n: houseOrdinal(transit.house, lang) })} ·
          ${labelled(transit.sign, SIGNS, lang)}${nature ? ` · ${nature}` : ''}
          ${transit.retrograde ? trusted(html`<span class="kj-rx" title="${t(lang, 'retrograde')}">℞</span>`) : ''}
          ${span ? trusted(html`<span class="kj-muted" part="when">${span}</span>`) : ''}
        </li>`;
      })
      .join('');
    if (!items) return '';
    return html`<details class="kj-fold" part="basis">
      <summary>${t(lang, 'basis')}</summary>
      <ul class="kj-list">
        ${trusted(items)}
      </ul>
    </details>`;
  }

  /**
   * `until 10:16`, `from 31 Oct`, `from 30 Sep, 13:14 until 2 Oct, 15:40`.
   *
   * Only a graha that changes sign inside the period gets one — the rest are
   * in their sign for all of it, which the heading already says. A day needs
   * only the clock; a week the day and the clock, since the Moon moves every
   * two days or so; a month or a year only the day. Hindi puts `से` and `तक`
   * after the time, as the panchang does with `तक`.
   */
  private spanText(
    segment: HoroscopeBasis,
    zone: AnswerZone | null,
    period: Period,
    lang: Lang,
  ): string {
    const at = (instant: string | null) => {
      if (!instant) return '';
      const wall = localWall(instant, zone);
      if (period === 'daily') return clock(wall, lang);
      if (period === 'weekly') return `${shortDate(wall, lang)}, ${clock(wall, lang)}`;
      return shortDate(wall, lang);
    };
    const from = at(segment.entered);
    const until = at(segment.leaves);
    if (!from && !until) return '';
    if (lang === 'hi') {
      return [from && `${from} ${t(lang, 'from')}`, until && `${until} ${t(lang, 'until')}`]
        .filter(Boolean)
        .join(' ');
    }
    return [from && `${t(lang, 'from')} ${from}`, until && `${t(lang, 'until')} ${until}`]
      .filter(Boolean)
      .join(' ');
  }
}
