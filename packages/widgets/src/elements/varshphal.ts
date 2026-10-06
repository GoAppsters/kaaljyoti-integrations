/**
 * `<kj-varshphal>` — the annual chart and its reading (revamp §4, 19).
 *
 * For one year of a life (a year selector; the one running now by default,
 * from the last birthday): when the year begins (the Sun's return to its
 * natal longitude), the varsha lagna, the muntha and its house, and the year
 * lord; the annual chart; and the year read — summary, areas and the mudda
 * periods.
 *
 * Calls per year shown: `POST /v1/varshphal` (the year's figures), `POST
 * /v1/kundli/chart` for the moment of the return at the birthplace (the
 * varsha kundli is the chart of that moment, drawn by an inner
 * `<kj-chart>`), and `POST /v1/reports/varshphal` (a written report at 5
 * credits, drawn by an inner `<kj-reading type="varshphal">`;
 * `reading="off"` drops it). If it is refused the reading's place shows the
 * card and the rest stands.
 */

import { html, trusted } from '../core/element.ts';
import { isOff } from '../core/config.ts';
import { msg, stepperHtml, type Dict } from '../core/extra.ts';
import { clock, dateLabel } from '../core/format.ts';
import { nameOf, type Labelled, type Lang } from '../core/i18n.ts';
import { SIGNS, houseOrdinal, labelled, type AnswerZone } from '../core/reports.ts';
import { signHtml, tilesHtml, type Tile } from '../core/ui.ts';
import { defineOnce } from './birth-calc.ts';
import { KjChart, type KjBirth } from './chart.ts';
import { KjMoonSign, mountReading } from './moon-sign.ts';

const M: Dict<
  | 'title'
  | 'submit'
  | 'year'
  | 'prev'
  | 'next'
  | 'nth'
  | 'begins'
  | 'lagna'
  | 'muntha'
  | 'muntha_house'
  | 'year_lord'
  | 'chart'
> = {
  en: {
    title: 'Varshphal',
    submit: 'Show my year',
    year: 'Year',
    prev: 'Previous year',
    next: 'Next year',
    // `varsha_year` counts completed years: the 36th return begins the 37th year.
    nth: 'Age {n} · {next} year',
    begins: 'The year begins',
    lagna: 'Varsha lagna',
    muntha: 'Muntha',
    muntha_house: 'in the {house} house',
    year_lord: 'Year lord',
    chart: 'Varsha kundli {year}',
  },
  hi: {
    title: 'वर्षफल',
    submit: 'मेरा वर्ष देखें',
    year: 'वर्ष',
    prev: 'पिछला वर्ष',
    next: 'अगला वर्ष',
    nth: 'आयु {n} · {n1}वाँ वर्ष',
    begins: 'वर्ष प्रवेश',
    lagna: 'वर्ष लग्न',
    muntha: 'मुंथा',
    muntha_house: '{house} भाव में',
    year_lord: 'वर्षेश',
    chart: 'वर्ष कुंडली {year}',
  },
};

/** `data` of `POST /v1/varshphal`, as far as read here. */
export interface VarshphalDocument {
  varsha_year?: number;
  /** The Sun's return, a UTC instant. */
  return_utc?: string;
  varsha?: { lagna_sign?: Labelled | null; ascendant_dms?: string } | null;
  muntha?: Labelled | null;
  muntha_house?: number;
  year_lord?: { year_lord?: Labelled | null } | null;
}

/**
 * `2026-05-14T10:33:33.967Z` → `2026-05-14T16:03:33` in `zone`: the wall
 * clock, with seconds, that a chart request's `datetime` takes.
 */
export function wallWithSeconds(instant: string, zone: AnswerZone | null): string | null {
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  if (zone?.name) {
    try {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: zone.name,
        // Swedish writes ISO: `2026-05-14 16:03:33`.
        dateStyle: 'short',
        timeStyle: 'medium',
        hourCycle: 'h23',
      })
        .format(ms)
        .replace(' ', 'T');
    } catch {
      // Fall through to the offset.
    }
  }
  const offset = /^([+-])(\d{2}):(\d{2})$/.exec(zone?.utc_offset ?? '');
  const minutes = offset ? (offset[1] === '-' ? -1 : 1) * (+offset[2]! * 60 + +offset[3]!) : 0;
  return new Date(ms + minutes * 60_000).toISOString().slice(0, 19);
}

/** @see KjBirthCalc */
export class KjVarshphal extends KjMoonSign {
  static override readonly tag: string = 'kj-varshphal';

  static override readonly observedAttributes = [
    ...KjMoonSign.observedAttributes,
    'year',
    'chart-style',
    'size',
  ];

  protected override primary = '';

  private year = 0;

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  /** `year`, or the varsha year running now: this year from the birthday on. */
  protected override reset(): void {
    const birth = this.current;
    const given = Number(this.getAttribute('year'));
    const born = Number(birth?.datetime.slice(0, 4)) || 0;
    if (Number.isInteger(given) && given >= born && given <= 2400) {
      this.year = given;
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const monthDay = birth?.datetime.slice(5, 10) ?? '';
    this.year = Math.max(born, now.getFullYear() - (monthDay && today < monthDay ? 1 : 0));
  }

  protected override start(birth: KjBirth): void {
    this.needYear(birth, this.year);
  }

  private needYear(birth: KjBirth, year: number): void {
    this.primary = `vp-${year}`;
    this.need(`vp-${year}`, '/varshphal', {
      birth,
      year,
      options: { language: ['en', 'hi'] },
    });
  }

  protected override onAction(action: string, target: HTMLElement): void {
    if (action !== 'step' || !this.current) return;
    const next = this.year + Number(target.dataset.step);
    const born = Number(this.current.datetime.slice(0, 4));
    if (!Number.isFinite(next) || next < born || next > 2400) return;
    this.year = next;
    this.needYear(this.current, next);
    this.refreshResult();
  }

  protected override resultBody(lang: Lang): string {
    const stepper = stepperHtml(
      msg(M, lang, 'year'),
      String(this.year),
      msg(M, lang, 'prev'),
      msg(M, lang, 'next'),
    );
    const name = `vp-${this.year}`;
    const figures = this.pending(name, 'tiles') ?? this.figuresHtml(name, lang);
    const reading = isOff(this.getAttribute('reading'))
      ? ''
      : '<div class="kj-slot kj-section" data-reading-slot="varshphal"></div>';
    const chartHead =
      this.slices.get(name)?.state === 'ready'
        ? html`<h3 class="kj-h3 kj-section">${msg(M, lang, 'chart', { year: this.year })}</h3>`
        : '';
    return html`<div class="kj-controls">${trusted(stepper)}</div>
      ${trusted(figures)} ${trusted(chartHead)}
      <div class="kj-slot" data-chart-slot></div>
      ${trusted(reading)}`;
  }

  /** When the year begins, its lagna, the muntha and the year lord. */
  private figuresHtml(name: string, lang: Lang): string {
    const slice = this.slices.get(name);
    const doc = (slice?.data ?? {}) as VarshphalDocument;
    const begins = doc.return_utc ? wallWithSeconds(doc.return_utc, slice?.zone ?? null) : null;
    const lagna = doc.varsha?.lagna_sign;
    const tiles: Tile[] = [
      {
        key: 'begins',
        label: msg(M, lang, 'begins'),
        value: html`${begins ? dateLabel(begins, lang) : '—'}`,
        sub: begins
          ? html`${clock(begins, lang)}${
              doc.varsha_year
                ? ` · ${msg(M, lang, 'nth', {
                    n: doc.varsha_year,
                    n1: doc.varsha_year + 1,
                    next: houseOrdinal(doc.varsha_year + 1, 'en'),
                  })}`
                : ''
            }`
          : undefined,
      },
      {
        key: 'varsha-lagna',
        label: msg(M, lang, 'lagna'),
        value: signHtml(lagna?.id, labelled(lagna ?? null, SIGNS, lang) || '—', 'm'),
      },
      {
        key: 'muntha',
        label: msg(M, lang, 'muntha'),
        value: signHtml(doc.muntha?.id, labelled(doc.muntha ?? null, SIGNS, lang) || '—', 'm'),
        sub: doc.muntha_house
          ? html`${msg(M, lang, 'muntha_house', { house: houseOrdinal(doc.muntha_house, lang) })}`
          : undefined,
      },
      {
        key: 'year-lord',
        label: msg(M, lang, 'year_lord'),
        value: html`${nameOf(doc.year_lord?.year_lord, lang) || '—'}`,
      },
    ];
    return tilesHtml(tiles, 'varshphal');
  }

  /** The varsha kundli (the chart of the return), and the year's reading. */
  protected override mountInner(): void {
    const birth = this.current;
    if (!birth) return;
    const slice = this.slices.get(`vp-${this.year}`);
    const doc = slice?.state === 'ready' ? (slice.data as VarshphalDocument) : undefined;
    const slot = this.root.querySelector('[data-chart-slot]');
    const begins = doc?.return_utc ? wallWithSeconds(doc.return_utc, slice?.zone ?? null) : null;
    if (slot && begins) {
      const chart = this.innerElement('chart', () => {
        defineOnce(KjChart);
        const element = document.createElement(KjChart.tag) as KjChart;
        const style = this.getAttribute('chart-style');
        if (style) element.setAttribute('chart-style', style);
        const size = this.getAttribute('size');
        if (size) element.setAttribute('size', size);
        return element;
      });
      // The birthplace, at the moment of the return, in the birth's zone.
      const zone = birth.timezone ?? slice?.zone?.name ?? undefined;
      chart.birth = {
        datetime: begins,
        latitude: birth.latitude,
        longitude: birth.longitude,
        ...(zone ? { timezone: zone } : {}),
        ...(birth.place ? { place: birth.place } : {}),
      };
      slot.append(chart);
    }
    if (!isOff(this.getAttribute('reading'))) {
      mountReading(this, this.root, 'varshphal', { year: String(this.year) });
    }
  }
}
