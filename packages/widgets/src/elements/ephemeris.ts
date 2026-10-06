/**
 * `<kj-ephemeris>` — a month of daily graha longitudes (revamp §4, 6): one
 * row per day at 00:00 UT, one column per graha (and the ascendant at the
 * place), each cell the degree in the sign, the sign's glyph where it
 * changes, ℞ while a graha is retrograde; and the month's ingresses and
 * stations as a list under the table.
 *
 * One call per month and system shown: `POST /v1/ephemeris/month`, with the
 * publishable key (open to it since 2 October 2026; heavy, so ten a minute,
 * and 20 credits), or through the site's proxy when the page has one (decision 23).
 * `system="tropical"` (or the switch) gives
 * sayana longitudes; sidereal (Lahiri) is the default. `month="YYYY-MM"`,
 * default this month at the place (New Delhi when none is given).
 */

import { call } from '../core/call.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { CLIENT_ERROR_CODES, KjError } from '../core/errors.ts';
import {
  EXTRA_CSS,
  GRAHA_ORDER,
  addMonths,
  grahaShort,
  inSign,
  isMonth,
  monthLabel,
  msg,
  signOf,
  stepperHtml,
  todayAt,
  withDefaultPlace,
  type Dict,
} from '../core/extra.ts';
import { shortDate } from '../core/format.ts';
import { nameOf, type Labelled, type Lang } from '../core/i18n.ts';
import { panchangBody, placeLabel } from '../core/panchang-request.ts';
import { GRAHAS, SIGNS, tableName } from '../core/reports.ts';
import { isPlanFailure, segmentedHtml, signIcon, wireChoices } from '../core/ui.ts';
import ephemerisCss from '../styles/ephemeris.css';
import { attachTables, scrollHintHtml } from '../core/tables.ts';

type System = 'sidereal' | 'tropical';

const M: Dict<
  | 'title'
  | 'month'
  | 'prev'
  | 'next'
  | 'system'
  | 'sidereal'
  | 'tropical'
  | 'day'
  | 'asc'
  | 'events'
  | 'ingress'
  | 'station_retrograde'
  | 'station_direct'
  | 'note'
  | 'none'
> = {
  en: {
    title: 'Ephemeris',
    month: 'Month',
    prev: 'Previous month',
    next: 'Next month',
    system: 'Zodiac',
    sidereal: 'Sidereal',
    tropical: 'Tropical',
    day: 'Day',
    asc: 'Asc',
    events: 'Changes this month',
    ingress: '{graha} enters {sign}',
    station_retrograde: '{graha} turns retrograde',
    station_direct: '{graha} turns direct',
    note: 'Longitudes at 00:00 UT, in degrees and minutes within the sign; ℞ retrograde. The ascendant is for the place.',
    none: 'No ingress or station this month.',
  },
  hi: {
    title: 'ग्रह स्पष्ट (एफ़ेमेरिस)',
    month: 'मास',
    prev: 'पिछला महीना',
    next: 'अगला महीना',
    system: 'राशिचक्र',
    sidereal: 'निरयन',
    tropical: 'सायन',
    day: 'दिन',
    asc: 'लग्न',
    events: 'इस महीने के परिवर्तन',
    ingress: '{graha} का {sign} में प्रवेश',
    station_retrograde: '{graha} वक्री',
    station_direct: '{graha} मार्गी',
    note: '00:00 UT पर भोगांश, राशि में अंश और कला; ℞ वक्री। लग्न स्थान के लिए है।',
    none: 'इस महीने कोई राशि परिवर्तन या वक्र-मार्ग नहीं।',
  },
};

/** One graha on one day. */
export interface EphemerisPosition {
  longitude: number;
  speed?: number;
}

/** One row. */
export interface EphemerisDay {
  day: number;
  ascendant?: number | null;
  positions?: Record<string, EphemerisPosition | undefined> | null;
}

/** One footer line. */
export interface EphemerisEvent {
  day: number;
  kind: string;
  planet?: Labelled | null;
  sign?: Labelled | null;
}

/** One reckoning of `POST /v1/ephemeris/month`. */
export interface EphemerisTable {
  year?: number;
  month?: number;
  days?: EphemerisDay[] | null;
  events?: EphemerisEvent[] | null;
}

/** `data` of `POST /v1/ephemeris/month`: `nirayan`, `sayan`, or both. */
export interface EphemerisDocument {
  nirayan?: EphemerisTable | null;
  sayan?: EphemerisTable | null;
}

/** Rahu and Ketu move backwards always; ℞ is news only for the five. */
const STATIONS = new Set(['mars', 'mercury', 'jupiter', 'venus', 'saturn']);

/** @see KjElement */
export class KjEphemeris extends KjElement {
  static readonly tag = 'kj-ephemeris';

  static override styles = EXTRA_CSS + ephemerisCss;

  constructor() {
    super();
    attachTables(this.root);
  }

  static readonly observedAttributes = [
    'month',
    'system',
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

  override connectedCallback(): void {
    if (!this.listening) {
      this.listening = true;
      this.root.addEventListener('click', (event) => {
        const step = (event.target as Element | null)?.closest?.<HTMLElement>(
          '[data-action="step"]',
        );
        if (step) this.setAttribute('month', addMonths(this.month, Number(step.dataset.step)));
      });
      wireChoices(this.root, (group, id) => {
        if (group === 'zodiac' && (id === 'sidereal' || id === 'tropical')) {
          this.setAttribute('system', id);
        }
      });
    }
    super.connectedCallback();
  }

  private get system(): System {
    return this.getAttribute('system') === 'tropical' ? 'tropical' : 'sidereal';
  }

  private get month(): string {
    const given = this.getAttribute('month')?.trim();
    const zone = panchangBody(withDefaultPlace(this))?.timezone;
    return isMonth(given) ? given : todayAt(zone).slice(0, 7);
  }

  protected override async fetchData(): Promise<EphemerisTable> {
    const place = panchangBody(withDefaultPlace(this));
    if (!place) throw new KjError(CLIENT_ERROR_CODES.noPlace, 'No usable lat/lon');
    const { date: _date, ...where } = place;
    const body = { ...where, month: this.month, system: this.system };
    const answer = await call<EphemerisDocument>(this, '/ephemeris/month', body);
    this.notePlan(answer.plan);
    const doc = answer.data;
    return (this.system === 'tropical' ? doc.sayan : doc.nirayan) ?? doc.nirayan ?? doc.sayan ?? {};
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
          'zodiac',
          msg(M, lang, 'system'),
          [
            { id: 'sidereal', label: msg(M, lang, 'sidereal') },
            { id: 'tropical', label: msg(M, lang, 'tropical') },
          ],
          this.system,
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

  protected override render(): string {
    const table = this.data as EphemerisTable | null;
    const lang = this.activeLang;
    const days = table?.days ?? [];
    const columns: string[] = GRAHA_ORDER.filter((id) => days[0]?.positions?.[id]);
    const withAsc = days.some((day) => typeof day.ascendant === 'number');
    const previous = new Map<string, string>();

    const cell = (key: string, longitude: number | null | undefined, retro: boolean) => {
      if (typeof longitude !== 'number') return '<td class="kj-num">—</td>';
      const sign = signOf(longitude);
      const changed = previous.get(key) !== sign;
      previous.set(key, sign);
      const glyph = changed
        ? html`<span class="kj-change" title="${tableName(SIGNS, sign, lang)}"
            >${trusted(signIcon(sign))}</span
          > `
        : '';
      return html`<td class="kj-num${retro ? ' kj-cell-retro' : ''}">
        ${trusted(glyph)}${inSign(longitude)}${retro ? ' ℞' : ''}
      </td>`;
    };

    const rows = days
      .map((day) => {
        const cells = columns
          .map((id) => {
            const position = day.positions?.[id];
            const retro = STATIONS.has(id) && (position?.speed ?? 0) < 0;
            return cell(id, position?.longitude, retro);
          })
          .join('');
        const asc = withAsc ? cell('ascendant', day.ascendant, false) : '';
        return html`<tr part="ephemeris-row">
          <th scope="row" class="kj-num">${day.day}</th>
          ${trusted(cells)}${trusted(asc)}
        </tr>`;
      })
      .join('');

    const heads = columns
      .map(
        (id) =>
          html`<th
            scope="col"
            class="kj-num"
            title="${tableName(GRAHAS, id, lang)}"
            style="color:var(--kj-planet-${id})"
          >
            ${grahaShort(id, lang)}
          </th>`,
      )
      .join('');

    const events = (table?.events ?? [])
      .map((event) => {
        const graha = nameOf(event.planet, lang);
        const key =
          event.kind === 'ingress' ||
          event.kind === 'station_retrograde' ||
          event.kind === 'station_direct'
            ? event.kind
            : null;
        if (!key) return '';
        const text = msg(M, lang, key, { graha, sign: nameOf(event.sign, lang) });
        const date = shortDate(`${this.month}-${String(event.day).padStart(2, '0')}`, lang);
        return html`<li part="event event-${event.kind}">
          <span class="kj-time">${date}</span>
          <span>${text}</span>
        </li>`;
      })
      .filter(Boolean)
      .join('');

    return html`${trusted(this.controlsHtml(lang))}
      <div class="kj-table-wrap kj-scroll">
        <table class="kj-table kj-table-compact kj-table-sticky" part="ephemeris">
          <thead>
            <tr>
              <th scope="col" class="kj-num">${msg(M, lang, 'day')}</th>
              ${trusted(heads)}
              ${trusted(withAsc ? html`<th scope="col" class="kj-num">${msg(M, lang, 'asc')}</th>` : '')}
            </tr>
          </thead>
          <tbody>
            ${trusted(rows)}
          </tbody>
        </table>
      </div>
      ${trusted(scrollHintHtml(lang, 56))}
      <p class="kj-note">${msg(M, lang, 'note')}</p>
      <section class="kj-section" part="events">
        <h3 class="kj-h3">${msg(M, lang, 'events')}</h3>
        ${trusted(
          events
            ? html`<ul class="kj-events">
                ${trusted(events)}
              </ul>`
            : html`<p class="kj-muted">${msg(M, lang, 'none')}</p>`,
        )}
      </section>`;
  }
}
