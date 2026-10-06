/**
 * `<kj-panchang-month>` — a month of panchang as a calendar (revamp §4, 3):
 * one cell per day with the tithi at sunrise and the nakshatra, Purnima,
 * Amavasya and the Ekadashis marked, and a day's full panchang under the
 * grid when it is picked.
 *
 * One call per month shown: `POST /v1/panchang/month`, with the publishable
 * key like every widget (open to it since 2 October 2026; heavy, so ten a
 * minute, and 20 credits). Through the
 * site's proxy when the page has one (`proxy`, `data-proxy`,
 * `configure({ proxyUrl })` — decision 23), which caches the month. Picking
 * a day, and the masa switch, ask for nothing.
 *
 * The API gives no festival list, so none is made up: the marks are the
 * tithis themselves (the tithi at sunrise is Purnima, Amavasya or an
 * Ekadashi), which is what a vrat is kept by. The month's masa is shown in
 * the purnimanta reckoning (north India) unless `masa="amanta"`, and the
 * switch flips it. Place: `city` / `lat`+`lon` as on `<kj-panchang>`,
 * New Delhi when there is none; `month="YYYY-MM"`, default this month there.
 */

import { call } from '../core/call.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { CLIENT_ERROR_CODES, KjError } from '../core/errors.ts';
import {
  EXTRA_CSS,
  addMonths,
  isMonth,
  monthLabel,
  msg,
  stepperHtml,
  todayAt,
  weekday,
  withDefaultPlace,
  type Dict,
} from '../core/extra.ts';
import { clock, dateLabel } from '../core/format.ts';
import { masaName, nameOf, type Labelled, type Lang } from '../core/i18n.ts';
import { panchangBody, placeLabel } from '../core/panchang-request.ts';
import { isPlanFailure, segmentedHtml, tilesHtml, wireChoices, type Tile } from '../core/ui.ts';
import monthCss from '../styles/panchang-month.css';
import { dt } from '../core/daily-words.ts';

const M: Dict<
  | 'title'
  | 'month'
  | 'prev'
  | 'next'
  | 'reckoning'
  | 'purnimanta'
  | 'amanta'
  | 'purnima'
  | 'amavasya'
  | 'ekadashi'
  | 'shukla'
  | 'krishna'
  | 'until'
  | 'masa'
  | 'pick'
  | 'marks'
  | 'yogas'
  | 'karanas'
  | 'nakshatras'
  | 'tithis'
> = {
  en: {
    title: 'Monthly panchang',
    month: 'Month',
    prev: 'Previous month',
    next: 'Next month',
    reckoning: 'Masa reckoning',
    purnimanta: 'Purnimanta',
    amanta: 'Amanta',
    purnima: 'Purnima',
    amavasya: 'Amavasya',
    ekadashi: 'Ekadashi',
    shukla: 'S',
    krishna: 'K',
    until: 'until {time}',
    masa: '{masa} · Vikram Samvat {year}',
    pick: 'Pick a day for its full panchang.',
    marks: 'Marked by the tithi at sunrise:',
    yogas: 'Yoga',
    karanas: 'Karana',
    nakshatras: 'Nakshatra',
    tithis: 'Tithi',
  },
  hi: {
    title: 'मासिक पंचांग',
    month: 'मास',
    prev: 'पिछला महीना',
    next: 'अगला महीना',
    reckoning: 'मास गणना',
    purnimanta: 'पूर्णिमांत',
    amanta: 'अमांत',
    purnima: 'पूर्णिमा',
    amavasya: 'अमावस्या',
    ekadashi: 'एकादशी',
    shukla: 'शु',
    krishna: 'कृ',
    until: '{time} तक',
    masa: '{masa} · विक्रम संवत {year}',
    pick: 'पूरे पंचांग के लिए कोई दिन चुनें।',
    marks: 'सूर्योदय की तिथि से चिह्नित:',
    yogas: 'योग',
    karanas: 'करण',
    nakshatras: 'नक्षत्र',
    tithis: 'तिथि',
  },
};

/** Sunday first, as a wall calendar in India prints the week. */
const WEEKDAYS: Record<Lang, readonly string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
};

/** A limb that touches the day, and when it ends. */
export interface MonthLimb {
  index: number;
  name?: Labelled | null;
  nakshatra?: Labelled | null;
  paksha?: Labelled | null;
  starts: string | null;
  ends: string;
}

/** One reckoning of the day's masa. */
export interface MonthMasa {
  is_adhik?: boolean;
  month_index?: number;
  month_name?: Labelled | null;
  samvat_year?: number;
}

/** One day of `POST /v1/panchang/month`. */
export interface MonthDay {
  date: string;
  sunrise: string | null;
  sunset: string | null;
  next_sunrise?: string | null;
  vara?: Labelled | null;
  tithis?: MonthLimb[] | null;
  nakshatras?: MonthLimb[] | null;
  yogas?: MonthLimb[] | null;
  karanas?: MonthLimb[] | null;
  masa?: { amanta?: MonthMasa | null; purnimanta?: MonthMasa | null } | null;
}

/** `data` of `POST /v1/panchang/month`. */
export interface MonthDocument {
  month?: string;
  days?: MonthDay[] | null;
}

type Reckoning = 'purnimanta' | 'amanta';

/**
 * What the tithi at sunrise marks: tithi indices run 0–29 from Shukla
 * Pratipada, so Purnima is 14, Amavasya 29 and the Ekadashis 10 and 25.
 */
function markOf(day: MonthDay): 'purnima' | 'amavasya' | 'ekadashi' | '' {
  const index = day.tithis?.[0]?.index;
  if (index === 14) return 'purnima';
  if (index === 29) return 'amavasya';
  if (index === 10 || index === 25) return 'ekadashi';
  return '';
}

/** @see KjElement */
export class KjPanchangMonth extends KjElement {
  static readonly tag = 'kj-panchang-month';

  static override styles = EXTRA_CSS + monthCss;

  static readonly observedAttributes = [
    'month',
    'masa',
    'city',
    'lat',
    'lon',
    'timezone',
    'place',
    'proxy',
    'lang',
    'powered-by',
  ];

  protected override skeleton = 'table' as const;

  private listening = false;

  /** The day picked for the detail panel. */
  private picked = '';

  private reckoning: Reckoning = 'purnimanta';

  override connectedCallback(): void {
    if (!this.listening) {
      this.listening = true;
      this.reckoning = this.getAttribute('masa') === 'amanta' ? 'amanta' : 'purnimanta';
      this.root.addEventListener('click', (event) => {
        const target = (event.target as Element | null)?.closest?.<HTMLElement>(
          '[data-day],[data-action="step"]',
        );
        if (!target) return;
        if (target.dataset.day) {
          this.picked = target.dataset.day;
          this.paint();
          this.root
            .querySelector<HTMLElement>(`[data-day="${this.picked}"]`)
            ?.focus({ preventScroll: true });
        } else {
          this.setAttribute('month', addMonths(this.month, Number(target.dataset.step)));
        }
      });
      wireChoices(this.root, (group, id) => {
        if (group === 'masa' && (id === 'amanta' || id === 'purnimanta')) {
          this.reckoning = id;
          this.paint();
        }
      });
    }
    super.connectedCallback();
  }

  /** The place's zone, when the element knows it, for "this month" and "today". */
  private get zone(): string | undefined {
    return panchangBody(withDefaultPlace(this))?.timezone;
  }

  /** `month`, or this month at the place. */
  private get month(): string {
    const given = this.getAttribute('month')?.trim();
    return isMonth(given) ? given : todayAt(this.zone).slice(0, 7);
  }

  protected override async fetchData(): Promise<MonthDocument> {
    const place = panchangBody(withDefaultPlace(this));
    if (!place) throw new KjError(CLIENT_ERROR_CODES.noPlace, 'No usable lat/lon');
    const { date: _date, ...where } = place;
    const body = { ...where, month: this.month };
    const answer = await call<MonthDocument>(this, '/panchang/month', body);
    this.notePlan(answer.plan);
    const today = todayAt(this.zone);
    const days = answer.data.days ?? [];
    // Today when it is in the month; else keep a pick from this month, else none.
    this.picked = days.some((day) => day.date === today)
      ? today
      : days.some((day) => day.date === this.picked)
        ? this.picked
        : '';
    return answer.data;
  }

  protected override heading(): { title: string; subtitle?: string } {
    const lang = this.activeLang;
    return {
      title: msg(M, lang, 'title'),
      subtitle: [placeLabel(withDefaultPlace(this), lang), monthLabel(this.month, lang)]
        .filter(Boolean)
        .join(' · '),
    };
  }

  /** The month stepper and the reckoning switch: drawn in every state. */
  private controlsHtml(lang: Lang): string {
    return html`<div class="kj-controls">
      ${trusted(
        stepperHtml(
          msg(M, lang, 'month'),
          monthLabel(this.month, lang),
          msg(M, lang, 'prev'),
          msg(M, lang, 'next'),
        ),
      )}
      ${trusted(
        segmentedHtml(
          'masa',
          msg(M, lang, 'reckoning'),
          [
            { id: 'purnimanta', label: msg(M, lang, 'purnimanta') },
            { id: 'amanta', label: msg(M, lang, 'amanta') },
          ],
          this.reckoning,
        ),
      )}
    </div>`;
  }

  protected override loadingHtml(): string {
    return this.controlsHtml(this.activeLang) + super.loadingHtml();
  }

  protected override errorHtml(failure = this.failure): string {
    // A plan or monthly-limit refusal is the same for every month: nothing to step through.
    const controls = isPlanFailure(failure) ? '' : this.controlsHtml(this.activeLang);
    return controls + super.errorHtml(failure);
  }

  /** The masa (or two, when it changes mid-month) and the Samvat year. */
  private masaLine(days: MonthDay[], lang: Lang): string {
    const seen: string[] = [];
    let year: number | undefined;
    for (const day of days) {
      const masa = day.masa?.[this.reckoning];
      const name = masaName(masa?.month_name, masa?.is_adhik, lang);
      if (name && !seen.includes(name)) seen.push(name);
      year ??= masa?.samvat_year;
    }
    if (!seen.length) return '';
    return html`<p class="kj-lead kj-center" part="month-masa">
      ${msg(M, lang, 'masa', { masa: seen.join(' – '), year: year ?? '—' })}
    </p>`;
  }

  protected override render(): string {
    const doc = this.data as MonthDocument | null;
    const lang = this.activeLang;
    const days = doc?.days ?? [];
    if (!days.length) return this.controlsHtml(lang);
    const today = todayAt(this.zone);
    const lead = weekday(days[0]!.date);
    const heads = WEEKDAYS[lang]
      .map((name) => html`<li class="kj-cal-dow" aria-hidden="true">${name}</li>`)
      .join('');
    const blanks = '<li class="kj-cal-blank" aria-hidden="true"></li>'.repeat(lead);
    const cells = days
      .map((day) => {
        const tithi = day.tithis?.[0];
        const nakshatra = day.nakshatras?.[0];
        const krishna = (tithi?.index ?? 0) >= 15;
        const number = tithi ? (tithi.index % 15) + 1 : 0;
        const mark = markOf(day);
        const tithiName = nameOf(tithi?.name, lang);
        const short = tithi ? `${msg(M, lang, krishna ? 'krishna' : 'shukla')} ${number}` : '';
        const label = [
          dateLabel(day.date, lang),
          nameOf(day.vara, lang),
          `${nameOf(tithi?.paksha, lang)} ${tithiName}`.trim(),
          nameOf(nakshatra?.nakshatra, lang),
        ]
          .filter(Boolean)
          .join(', ');
        return html`<li>
          <button
            type="button"
            class="kj-cal-day"
            part="day"
            data-day="${day.date}"
            data-mark="${mark}"
            aria-pressed="${String(day.date === this.picked)}"
            aria-label="${label}"
            ${trusted(day.date === today ? 'data-today' : '')}
          >
            <span class="kj-cal-num">${Number(day.date.slice(8, 10))}</span>
            <span class="kj-cal-tithi kj-cal-short">${short}</span>
            <span class="kj-cal-tithi kj-cal-long">${tithiName}</span>
            <span class="kj-cal-nak">${nameOf(nakshatra?.nakshatra, lang)}</span>
            ${trusted(mark ? html`<span class="kj-cal-mark">${msg(M, lang, mark)}</span>` : '')}
          </button>
        </li>`;
      })
      .join('');
    const detail = days.find((day) => day.date === this.picked);
    return html`${trusted(this.controlsHtml(lang))} ${trusted(this.masaLine(days, lang))}
      <ol class="kj-cal" part="calendar" aria-label="${monthLabel(this.month, lang)}">
        ${trusted(heads)}${trusted(blanks)}${trusted(cells)}
      </ol>
      <p class="kj-note" part="marks">
        ${msg(M, lang, 'marks')}
        ${trusted(
          (['ekadashi', 'purnima', 'amavasya'] as const)
            .map(
              (mark) =>
                html`<span class="kj-cal-key" data-mark="${mark}" aria-hidden="true"></span
                  >${msg(M, lang, mark)}`,
            )
            .join(' '),
        )}
      </p>
      ${trusted(detail ? this.dayHtml(detail, lang) : html`<p class="kj-note">${msg(M, lang, 'pick')}</p>`)}`;
  }

  /** A day's entries of one limb: `Shashthi until 10:15, Saptami`. */
  private limbsText(
    names: readonly (readonly [string, string | null | undefined])[],
    day: MonthDay,
    lang: Lang,
  ): string {
    return names
      .map(([name, ends], index) => {
        if (index === names.length - 1 && names.length > 1) return name;
        const nextDay = Boolean(ends) && ends?.slice(0, 10) !== day.date;
        const time = `${nextDay ? `${dt(lang, 'tomorrow')} ` : ''}${clock(ends, lang)}`;
        return `${name} ${msg(M, lang, 'until', { time })}`;
      })
      .join(', ');
  }

  /** The picked day's panchang. */
  private dayHtml(day: MonthDay, lang: Lang): string {
    const named = (limbs: MonthLimb[] | null | undefined, field: 'name' | 'nakshatra') =>
      (limbs ?? []).map((limb) => [nameOf(limb[field], lang), limb.ends] as const);
    const tithis = (day.tithis ?? []).map(
      (limb) =>
        [`${nameOf(limb.paksha, lang)} ${nameOf(limb.name, lang)}`.trim(), limb.ends] as const,
    );
    const masa = day.masa?.[this.reckoning];
    const tiles: Tile[] = [
      {
        key: 'tithi',
        label: msg(M, lang, 'tithis'),
        value: html`${this.limbsText(tithis, day, lang) || '—'}`,
      },
      {
        key: 'nakshatra',
        label: msg(M, lang, 'nakshatras'),
        value: html`${this.limbsText(named(day.nakshatras, 'nakshatra'), day, lang) || '—'}`,
      },
      {
        key: 'yoga',
        label: msg(M, lang, 'yogas'),
        value: html`${this.limbsText(named(day.yogas, 'name'), day, lang) || '—'}`,
      },
      {
        key: 'karana',
        label: msg(M, lang, 'karanas'),
        value: html`${this.limbsText(named(day.karanas, 'name'), day, lang) || '—'}`,
      },
      {
        key: 'sun',
        label: `${dt(lang, 'sunrise')} / ${dt(lang, 'sunset')}`,
        value: html`<span class="kj-time"
          >${clock(day.sunrise, lang)} / ${clock(day.sunset, lang)}</span
        >`,
      },
      {
        key: 'masa',
        label: dt(lang, 'masa'),
        value: html`${masaName(masa?.month_name, masa?.is_adhik, lang) || '—'}`,
        sub: masa?.samvat_year ? html`${dt(lang, 'vikram_samvat')} ${masa.samvat_year}` : undefined,
      },
    ];
    return html`<section class="kj-day-detail" part="day-detail" aria-live="polite">
      <p class="kj-day-title">${nameOf(day.vara, lang)}, ${dateLabel(day.date, lang)}</p>
      ${trusted(tilesHtml(tiles, 'day'))}
    </section>`;
  }
}
