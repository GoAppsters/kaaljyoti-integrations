/**
 * `<kj-strength>` — Shadbala and Ashtakavarga, for astrologers (revamp §4,
 * 17).
 *
 * Two tabs, two calls per birth, each made when its tab is first opened:
 *
 *   * **Shadbala** (`POST /v1/kundli/shadbala`): each of the seven grahas'
 *     total strength in rupas as a bar against its required minimum (the
 *     marker), the ratio, and whether it clears the minimum; the six
 *     components in virupas under it.
 *   * **Ashtakavarga** (`POST /v1/kundli/ashtakavarga`): the
 *     Sarvashtakavarga as a south Indian square of the twelve signs, shaded
 *     above and below the chart's own average; and each graha's
 *     Bhinnashtakavarga as a table.
 *
 * Numbers are the API's; the only arithmetic is sums and the average of
 * the twelve SAV points, both shown.
 */

import { html, trusted } from '../core/element.ts';
import {
  EXTRA_CSS,
  GRAHA_ORDER,
  SIGN_IDS,
  meterHtml,
  msg,
  signGridHtml,
  type Dict,
} from '../core/extra.ts';
import { nameOf, type Labelled, type Lang } from '../core/i18n.ts';
import { GRAHAS, SIGNS, tableName } from '../core/reports.ts';
import { badgeHtml, signIcon, tabPanelHtml, tabsHtml } from '../core/ui.ts';
import { CALC_ATTRIBUTES, KjBirthCalc } from './birth-calc.ts';
import type { KjBirth } from './chart.ts';
import strengthCss from '../styles/strength.css';
import { attachTables, scrollHintHtml } from '../core/tables.ts';

const TABS = ['shadbala', 'ashtakavarga'] as const;
type Tab = (typeof TABS)[number];

const M: Dict<
  | 'title'
  | 'submit'
  | 'tabs'
  | Tab
  | 'graha'
  | 'strength'
  | 'rupas'
  | 'of_min'
  | 'ratio'
  | 'above'
  | 'below'
  | 'components'
  | 'sthana'
  | 'dig'
  | 'kala'
  | 'cheshta'
  | 'naisargika'
  | 'drik'
  | 'total'
  | 'virupas'
  | 'sav'
  | 'sav_total'
  | 'sav_avg'
  | 'bav'
  | 'sign'
  | 'legend'
> = {
  en: {
    title: 'Planetary strength',
    submit: 'Show strengths',
    tabs: 'Strength',
    shadbala: 'Shadbala',
    ashtakavarga: 'Ashtakavarga',
    graha: 'Graha',
    strength: 'Strength',
    rupas: '{n} rupas',
    of_min: 'minimum {n}',
    ratio: '× {n}',
    above: 'Above minimum',
    below: 'Below minimum',
    components: 'The six strengths, in virupas',
    sthana: 'Sthana',
    dig: 'Dig',
    kala: 'Kala',
    cheshta: 'Cheshta',
    naisargika: 'Naisargika',
    drik: 'Drik',
    total: 'Total',
    virupas: 'virupas',
    sav: 'Sarvashtakavarga',
    sav_total: 'Total {n}',
    sav_avg: 'average {n} a sign',
    bav: 'Bhinnashtakavarga',
    sign: 'Sign',
    legend: 'Shaded: signs above (green) and below (red) this chart’s average.',
  },
  hi: {
    title: 'ग्रह बल',
    submit: 'ग्रह बल देखें',
    tabs: 'बल',
    shadbala: 'षड्बल',
    ashtakavarga: 'अष्टकवर्ग',
    graha: 'ग्रह',
    strength: 'बल',
    rupas: '{n} रूप',
    of_min: 'न्यूनतम {n}',
    ratio: '× {n}',
    above: 'न्यूनतम से अधिक',
    below: 'न्यूनतम से कम',
    components: 'छह बल, विरूप में',
    sthana: 'स्थान',
    dig: 'दिक्',
    kala: 'काल',
    cheshta: 'चेष्टा',
    naisargika: 'नैसर्गिक',
    drik: 'दृक्',
    total: 'कुल',
    virupas: 'विरूप',
    sav: 'सर्वाष्टकवर्ग',
    sav_total: 'कुल {n}',
    sav_avg: 'औसत {n} प्रति राशि',
    bav: 'भिन्नाष्टकवर्ग',
    sign: 'राशि',
    legend: 'छायांकित: इस कुंडली के औसत से अधिक (हरा) और कम (लाल) राशियाँ।',
  },
};

/** One graha of `POST /v1/kundli/shadbala`; strengths in virupas. */
export interface ShadbalaRow {
  planet?: Labelled | null;
  sthana: number;
  dig: number;
  kala: number;
  cheshta: number;
  naisargika: number;
  drik: number;
  total: number;
  rupas: number;
  required_minimum: number;
  ratio: number;
}

/** `data` of `POST /v1/kundli/ashtakavarga`: SAV and each graha's BAV, Aries first. */
export interface AshtakavargaDocument {
  sav?: number[] | null;
  bav?: Record<string, number[] | undefined> | null;
}

const COMPONENTS = ['sthana', 'dig', 'kala', 'cheshta', 'naisargika', 'drik'] as const;

const fixed = (n: number, digits: number) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

/** @see KjBirthCalc */
export class KjStrength extends KjBirthCalc {
  static readonly tag = 'kj-strength';

  static override styles = EXTRA_CSS + strengthCss;

  constructor() {
    super();
    attachTables(this.root);
  }

  static readonly observedAttributes = [...CALC_ATTRIBUTES, 'tab'];

  protected override primary = 'shadbala';

  private tab: Tab = 'shadbala';

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override reset(): void {
    this.tab = this.getAttribute('tab') === 'ashtakavarga' ? 'ashtakavarga' : 'shadbala';
    this.primary = this.tab;
  }

  protected override start(birth: KjBirth): void {
    this.needTab(birth, this.tab);
  }

  private needTab(birth: KjBirth, tab: Tab): void {
    const path = tab === 'shadbala' ? '/kundli/shadbala' : '/kundli/ashtakavarga';
    this.need(tab, path, { birth, options: { language: ['en', 'hi'] } });
  }

  protected override onChoice(group: string, id: string): void {
    if (group !== 'strength' || (id !== 'shadbala' && id !== 'ashtakavarga') || !this.current) {
      return;
    }
    this.tab = id;
    this.needTab(this.current, id);
    this.refreshResult();
  }

  protected override resultBody(lang: Lang): string {
    const bar = tabsHtml(
      'strength',
      msg(M, lang, 'tabs'),
      TABS.map((id) => ({ id, label: msg(M, lang, id) })),
      this.tab,
    );
    const body =
      this.pending(this.tab, 'table') ??
      (this.tab === 'shadbala' ? this.shadbalaHtml(lang) : this.ashtakavargaHtml(lang));
    return bar + tabPanelHtml('strength', this.tab, body);
  }

  private shadbalaHtml(lang: Lang): string {
    const rows = this.ready<{ planets?: ShadbalaRow[] }>('shadbala')?.planets ?? [];
    const max = Math.max(...rows.map((row) => Math.max(row.rupas, row.required_minimum / 60)), 1);
    const bars = rows
      .map((row) => {
        const id = row.planet?.id ?? '';
        const minimum = row.required_minimum / 60;
        const clears = row.rupas >= minimum;
        return html`<tr part="shadbala-row shadbala-${id}">
          <th scope="row" style="color:var(--kj-planet-${id})">${nameOf(row.planet, lang)}</th>
          <td style="width:40%">
            ${trusted(meterHtml(row.rupas, max, minimum, clears ? 'kj-good' : 'kj-bad'))}
          </td>
          <td class="kj-num">
            ${msg(M, lang, 'rupas', { n: fixed(row.rupas, 2) })}
            <span class="kj-muted">(${msg(M, lang, 'of_min', { n: fixed(minimum, 2) })})</span>
          </td>
          <td class="kj-num">${msg(M, lang, 'ratio', { n: fixed(row.ratio, 2) })}</td>
          <td>
            ${trusted(badgeHtml(msg(M, lang, clears ? 'above' : 'below'), clears ? 'good' : 'care'))}
          </td>
        </tr>`;
      })
      .join('');
    const parts = rows
      .map((row) => {
        const id = row.planet?.id ?? '';
        return html`<tr part="shadbala-parts shadbala-parts-${id}">
          <th scope="row" style="color:var(--kj-planet-${id})">${nameOf(row.planet, lang)}</th>
          ${trusted(COMPONENTS.map((key) => html`<td class="kj-num">${fixed(row[key], 1)}</td>`).join(''))}
          <td class="kj-num"><strong>${fixed(row.total, 1)}</strong></td>
        </tr>`;
      })
      .join('');
    return html`<div class="kj-table-wrap">
        <table class="kj-table kj-stack-56" part="shadbala">
          <thead>
            <tr>
              <th scope="col">${msg(M, lang, 'graha')}</th>
              <th scope="col">${msg(M, lang, 'strength')}</th>
              <th scope="col" class="kj-num"></th>
              <th scope="col" class="kj-num"></th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            ${trusted(bars)}
          </tbody>
        </table>
      </div>
      <section class="kj-section" part="shadbala-components">
        <h3 class="kj-h3">${msg(M, lang, 'components')}</h3>
        <div class="kj-table-wrap">
          <table class="kj-table kj-table-compact kj-table-sticky kj-stack-36">
            <thead>
              <tr>
                <th scope="col">${msg(M, lang, 'graha')}</th>
                ${trusted(
                  COMPONENTS.map(
                    (key) => html`<th scope="col" class="kj-num">${msg(M, lang, key)}</th>`,
                  ).join(''),
                )}
                <th scope="col" class="kj-num">${msg(M, lang, 'total')}</th>
              </tr>
            </thead>
            <tbody>
              ${trusted(parts)}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  private ashtakavargaHtml(lang: Lang): string {
    const doc = this.ready<AshtakavargaDocument>('ashtakavarga') ?? {};
    const sav = doc.sav ?? [];
    const total = sav.reduce((sum, n) => sum + n, 0);
    const average = sav.length ? total / sav.length : 0;
    const grid = signGridHtml(
      (sign) => {
        const index = SIGN_IDS.indexOf(sign as (typeof SIGN_IDS)[number]);
        const value = sav[index];
        const tone =
          value === undefined
            ? ''
            : value > average + 1
              ? 'strong'
              : value < average - 1
                ? 'weak'
                : '';
        return {
          tone,
          body: html`<span class="kj-sg-sign"
              >${trusted(signIcon(sign))}${tableName(SIGNS, sign, lang)}</span
            ><span class="kj-sg-value">${value ?? '—'}</span>`,
        };
      },
      html`<strong>${msg(M, lang, 'sav')}</strong
        ><br />${msg(M, lang, 'sav_total', { n: total })}<br /><span class="kj-muted"
          >${msg(M, lang, 'sav_avg', { n: average.toFixed(1) })}</span
        >`,
      msg(M, lang, 'sav'),
      'sav',
    );
    const bav = doc.bav ?? {};
    const grahas = GRAHA_ORDER.filter((id) => Array.isArray(bav[id]));
    const rows = grahas
      .map((id) => {
        const points = bav[id] ?? [];
        return html`<tr part="bav-row bav-${id}">
          <th scope="row" style="color:var(--kj-planet-${id})">${tableName(GRAHAS, id, lang)}</th>
          ${trusted(points.map((n) => html`<td class="kj-num">${n}</td>`).join(''))}
          <td class="kj-num"><strong>${points.reduce((sum, n) => sum + n, 0)}</strong></td>
        </tr>`;
      })
      .join('');
    const savRow = html`<tr part="bav-row bav-sav">
      <th scope="row">${msg(M, lang, 'sav')}</th>
      ${trusted(sav.map((n) => html`<td class="kj-num"><strong>${n}</strong></td>`).join(''))}
      <td class="kj-num"><strong>${total}</strong></td>
    </tr>`;
    return html`${trusted(grid)}
      <p class="kj-note kj-center">${msg(M, lang, 'legend')}</p>
      <section class="kj-section" part="bav">
        <h3 class="kj-h3">${msg(M, lang, 'bav')}</h3>
        <div class="kj-table-wrap kj-scroll">
          <table class="kj-table kj-table-compact kj-table-sticky kj-compact-44">
            <thead>
              <tr>
                <th scope="col">${msg(M, lang, 'graha')}</th>
                ${trusted(
                  SIGN_IDS.map(
                    (sign) =>
                      html`<th scope="col" class="kj-num" title="${tableName(SIGNS, sign, lang)}">
                        ${trusted(signIcon(sign))}<span class="kj-sr"
                          >${tableName(SIGNS, sign, lang)}</span
                        >
                      </th>`,
                  ).join(''),
                )}
                <th scope="col" class="kj-num">${msg(M, lang, 'total')}</th>
              </tr>
            </thead>
            <tbody>
              ${trusted(rows)}${trusted(savRow)}
            </tbody>
          </table>
        </div>
        ${trusted(scrollHintHtml(lang, 44))}
      </section>`;
  }
}
