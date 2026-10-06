/**
 * `<kj-transits>` — "Planets today" (revamp §4, 5): where the nine grahas
 * are now, as a sidereal chart and a table of sign, degree, nakshatra and
 * pada, and retrograde motion.
 *
 * Two calls: `POST /v1/transit/now` for the positions, and `POST
 * /v1/kundli/chart` for the chart of the same moment at the same place
 * (drawn by an inner `<kj-chart>`, with its own style switch;
 * `chart="off"` drops it and its call). The moment is the current minute,
 * sent as `at`, so the table and the chart agree to the second and two
 * widgets on a page share both answers. "Refresh" asks for the minute it is
 * clicked in. The place is the ascendant's; it defaults to New Delhi.
 */

import { call } from '../core/call.ts';
import { isOff } from '../core/config.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { EXTRA_CSS, GRAHA_ORDER, inSign, msg, withDefaultPlace, type Dict } from '../core/extra.ts';
import { CLIENT_ERROR_CODES, KjError } from '../core/errors.ts';
import { clock, dateLabel, formatDegrees } from '../core/format.ts';
import { nameOf, t, type Labelled } from '../core/i18n.ts';
import { panchangBody, placeLabel } from '../core/panchang-request.ts';
import { localWall, type AnswerZone } from '../core/reports.ts';
import { badgeHtml, signHtml } from '../core/ui.ts';
import { defineOnce } from '../core/define.ts';
import { KjChart } from './chart.ts';
import { attachTables } from '../core/tables.ts';

const M: Dict<'title' | 'at' | 'refresh' | 'motion' | 'direct' | 'retro' | 'note'> = {
  en: {
    title: 'Planets today',
    at: 'At {time} on {date}',
    refresh: 'Refresh',
    motion: 'Motion',
    direct: 'Direct',
    retro: 'Retrograde',
    note: 'Sidereal (Lahiri) positions; the lagna is the one rising at the place.',
  },
  hi: {
    title: 'आज के ग्रह',
    at: '{date}, {time} बजे',
    refresh: 'ताज़ा करें',
    motion: 'गति',
    direct: 'मार्गी',
    retro: 'वक्री',
    note: 'निरयन (लाहिड़ी) स्थिति; लग्न स्थान पर उदित राशि है।',
  },
};

/** One graha of `POST /v1/transit/now`. */
export interface TransitPosition {
  planet?: Labelled | null;
  sign?: Labelled | null;
  nakshatra?: Labelled | null;
  pada?: number | null;
  degrees_in_sign_dms?: string | null;
  is_retrograde?: boolean | null;
}

/** `data` of `POST /v1/transit/now`, as far as read here. */
export interface TransitDocument {
  at?: string;
  ascendant_dms?: string;
  ascendant?: number;
  lagna_sign?: Labelled | null;
  positions?: Record<string, TransitPosition | undefined> | null;
}

/** The current minute as a UTC instant: the `at` both calls share. */
function thisMinute(): string {
  return `${new Date().toISOString().slice(0, 16)}:00Z`;
}

/** @see KjElement */
export class KjTransits extends KjElement {
  static readonly tag = 'kj-transits';

  static override styles = EXTRA_CSS;

  constructor() {
    super();
    attachTables(this.root);
  }

  static readonly observedAttributes = [
    'city',
    'lat',
    'lon',
    'timezone',
    'place',
    'chart',
    'chart-style',
    'size',
    'lang',
    'powered-by',
  ];

  protected override skeleton = 'table' as const;

  private zone: AnswerZone | null = null;

  private listening = false;

  private chart: KjChart | null = null;

  override connectedCallback(): void {
    if (!this.listening) {
      this.listening = true;
      this.root.addEventListener('click', (event) => {
        const button = (event.target as Element | null)?.closest?.('[data-action="refresh"]');
        if (button) void this.load();
      });
    }
    super.connectedCallback();
  }

  protected override async fetchData(): Promise<TransitDocument> {
    const place = panchangBody(withDefaultPlace(this));
    if (!place) throw new KjError(CLIENT_ERROR_CODES.noPlace, 'No usable lat/lon');
    const { date: _date, ...where } = place;
    const answer = await call<TransitDocument>(this, '/transit/now', {
      ...where,
      at: thisMinute(),
    });
    this.notePlan(answer.plan);
    this.zone = (answer.meta as { timezone?: AnswerZone } | null)?.timezone ?? null;
    return answer.data;
  }

  /** The moment, as a wall clock at the place. */
  private wall(): string {
    const doc = this.data as TransitDocument | null;
    return doc?.at ? localWall(doc.at, this.zone) : '';
  }

  protected override heading(): { title: string; subtitle?: string } {
    const lang = this.activeLang;
    const wall = this.wall();
    const parts = [placeLabel(withDefaultPlace(this), lang)];
    if (wall)
      parts.push(msg(M, lang, 'at', { time: clock(wall, lang), date: dateLabel(wall, lang) }));
    return { title: msg(M, lang, 'title'), subtitle: parts.filter(Boolean).join(' · ') };
  }

  protected override render(): string {
    const doc = this.data as TransitDocument | null;
    if (!doc) return '';
    const lang = this.activeLang;
    const positions = doc.positions ?? {};
    const lagna = doc.lagna_sign;
    const lagnaRow = html`<tr part="transit-row transit-lagna">
      <th scope="row" style="color:var(--kj-accent)">${t(lang, 'lagna')}</th>
      <td>${trusted(signHtml(lagna?.id, nameOf(lagna, lang) || '—'))}</td>
      <td class="kj-num">
        ${typeof doc.ascendant === 'number' ? inSign(doc.ascendant) : formatDegrees(doc.ascendant_dms)}
      </td>
      <td>—</td>
      <td></td>
    </tr>`;
    const rows = GRAHA_ORDER.map((id) => {
      const position = positions[id];
      if (!position) return '';
      const retro = Boolean(position.is_retrograde);
      return html`<tr part="transit-row transit-${id}">
        <th scope="row" style="color:var(--kj-planet-${id})">${nameOf(position.planet, lang)}</th>
        <td>${trusted(signHtml(position.sign?.id, nameOf(position.sign, lang) || '—'))}</td>
        <td class="kj-num">${formatDegrees(position.degrees_in_sign_dms)}</td>
        <td>
          ${nameOf(position.nakshatra, lang) || '—'}${position.pada ? ` · ${position.pada}` : ''}
        </td>
        <td>
          ${
            retro
              ? trusted(badgeHtml(`℞ ${msg(M, lang, 'retro')}`, 'retro'))
              : trusted(html`<span class="kj-muted">${msg(M, lang, 'direct')}</span>`)
          }
        </td>
      </tr>`;
    }).join('');
    const chart = isOff(this.getAttribute('chart'))
      ? ''
      : '<div class="kj-slot kj-section" data-chart-slot></div>';
    return html`<div class="kj-controls">
        <button type="button" class="kj-btn kj-btn-quiet kj-btn-small" data-action="refresh">
          ${msg(M, lang, 'refresh')}
        </button>
      </div>
      ${trusted(chart)}
      <section class="kj-section" part="positions">
        <div class="kj-table-wrap">
          <table class="kj-table kj-stack-36" part="transits">
            <thead>
              <tr>
                <th scope="col">${t(lang, 'planet')}</th>
                <th scope="col">${t(lang, 'sign')}</th>
                <th scope="col" class="kj-num">${t(lang, 'degrees')}</th>
                <th scope="col">${t(lang, 'nakshatra')} · ${t(lang, 'pada')}</th>
                <th scope="col">${msg(M, lang, 'motion')}</th>
              </tr>
            </thead>
            <tbody>
              ${trusted(lagnaRow)}${trusted(rows)}
            </tbody>
          </table>
        </div>
      </section>
      <p class="kj-note">${msg(M, lang, 'note')}</p>`;
  }

  /** The chart of the same moment, drawn by an inner `<kj-chart>`. */
  protected override paint(): void {
    super.paint();
    if (this.state !== 'ready') return;
    const slot = this.root.querySelector('[data-chart-slot]');
    const wall = this.wall();
    const place = panchangBody(withDefaultPlace(this));
    if (!slot || !wall || !place) return;
    if (!this.chart) {
      defineOnce(KjChart);
      this.chart = document.createElement(KjChart.tag) as KjChart;
    }
    const chart = this.chart;
    chart.setAttribute('frame', 'none');
    chart.setAttribute('lang', this.activeLang);
    for (const name of ['theme', 'preset', 'font', 'chart-style', 'size', 'powered-by']) {
      const value = this.getAttribute(name);
      if (value) chart.setAttribute(name, value);
      else chart.removeAttribute(name);
    }
    const zone = place.timezone ?? this.zone?.name ?? undefined;
    chart.birth = {
      datetime: `${wall}:00`,
      latitude: place.latitude,
      longitude: place.longitude,
      ...(zone ? { timezone: zone } : {}),
      ...(place.place ? { place: place.place } : {}),
    };
    slot.append(chart);
  }
}
