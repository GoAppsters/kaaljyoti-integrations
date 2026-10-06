/**
 * `<kj-vargas>` — the divisional charts viewer, D1 to D60 (revamp §4, 15).
 *
 * A select of the sixteen vargas the API computes; for the one chosen, its
 * chart (an inner `<kj-chart varga="d…">`, with its own North / South /
 * Circular switch) and a table of each graha's sign in it beside its D1
 * sign, vargottama marked where the two agree.
 *
 * Calls: `POST /v1/kundli/vargas` once per birth (all sixteen placements and
 * lagnas in one answer), and `POST /v1/kundli/chart` once per varga and
 * style drawn (the page memo answers one drawn before). `varga="d10"` picks
 * the first one shown (default D9).
 */

import { html, trusted } from '../core/element.ts';
import { GRAHA_ORDER, msg, type Dict } from '../core/extra.ts';
import { t, type Lang } from '../core/i18n.ts';
import { GRAHAS, SIGNS, tableName } from '../core/reports.ts';
import { badgeHtml, signHtml } from '../core/ui.ts';
import { CALC_ATTRIBUTES, KjBirthCalc, defineOnce } from './birth-calc.ts';
import { KjChart, type KjBirth } from './chart.ts';
import { attachTables } from '../core/tables.ts';

/** The sixteen vargas: id, English and Hindi names, what each is read for. */
const VARGAS: readonly (readonly [string, string, string, string, string])[] = [
  ['d1', 'Rashi', 'राशि', 'the body and the whole life', 'शरीर और संपूर्ण जीवन'],
  ['d2', 'Hora', 'होरा', 'wealth', 'धन'],
  ['d3', 'Drekkana', 'द्रेष्काण', 'siblings and courage', 'भाई-बहन और पराक्रम'],
  ['d4', 'Chaturthamsha', 'चतुर्थांश', 'home and property', 'घर और संपत्ति'],
  ['d7', 'Saptamsha', 'सप्तमांश', 'children', 'संतान'],
  ['d9', 'Navamsha', 'नवांश', 'marriage and dharma', 'विवाह और धर्म'],
  ['d10', 'Dashamsha', 'दशमांश', 'career', 'कर्म और व्यवसाय'],
  ['d12', 'Dwadashamsha', 'द्वादशांश', 'parents', 'माता-पिता'],
  ['d16', 'Shodashamsha', 'षोडशांश', 'vehicles and comforts', 'वाहन और सुख'],
  ['d20', 'Vimshamsha', 'विंशांश', 'spiritual practice', 'उपासना'],
  ['d24', 'Chaturvimshamsha', 'चतुर्विंशांश', 'learning', 'विद्या'],
  ['d27', 'Bhamsha', 'भांश', 'strengths and weaknesses', 'बल और दुर्बलता'],
  ['d30', 'Trimshamsha', 'त्रिंशांश', 'misfortunes', 'अरिष्ट'],
  ['d40', 'Khavedamsha', 'खवेदांश', 'the maternal line', 'मातृ पक्ष'],
  ['d45', 'Akshavedamsha', 'अक्षवेदांश', 'the paternal line', 'पितृ पक्ष'],
  [
    'd60',
    'Shashtiamsha',
    'षष्ट्यंश',
    'past karma, and the whole chart',
    'पूर्व कर्म और समग्र कुंडली',
  ],
];

const M: Dict<'title' | 'submit' | 'choose' | 'read_for' | 'in_varga' | 'in_d1' | 'grahas'> = {
  en: {
    title: 'Divisional charts',
    submit: 'Show my vargas',
    choose: 'Divisional chart',
    read_for: 'Read for {what}.',
    in_varga: 'Sign in {varga}',
    in_d1: 'Sign in D1',
    grahas: 'The grahas in {varga}',
  },
  hi: {
    title: 'वर्ग कुंडलियाँ',
    submit: 'मेरी वर्ग कुंडलियाँ',
    choose: 'वर्ग कुंडली',
    read_for: '{what} के लिए देखी जाती है।',
    in_varga: '{varga} में राशि',
    in_d1: 'D1 में राशि',
    grahas: '{varga} में ग्रह',
  },
};

/** `data` of `POST /v1/kundli/vargas`: each varga's lagna sign and sign → grahas. */
export interface VargasDocument {
  lagna?: Record<string, string | undefined> | null;
  placements?: Record<string, Record<string, string[] | undefined> | undefined> | null;
}

/** The sign a graha is in, in one varga's placements. */
function signIn(doc: VargasDocument | undefined, varga: string, graha: string): string {
  const placements = doc?.placements?.[varga] ?? {};
  return Object.entries(placements).find(([, grahas]) => grahas?.includes(graha))?.[0] ?? '';
}

/** @see KjBirthCalc */
export class KjVargas extends KjBirthCalc {
  static readonly tag = 'kj-vargas';

  static readonly observedAttributes = [...CALC_ATTRIBUTES, 'varga', 'chart-style', 'size'];

  constructor() {
    super();
    attachTables(this.root);
  }

  protected override primary = 'vargas';

  private varga = 'd9';

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override reset(): void {
    const asked = (this.getAttribute('varga') ?? '').trim().toLowerCase();
    this.varga = VARGAS.some(([id]) => id === asked) ? asked : 'd9';
  }

  protected override start(birth: KjBirth): void {
    this.need('vargas', '/kundli/vargas', { birth, options: { language: ['en', 'hi'] } });
  }

  protected override onPick(name: string, value: string): void {
    if (name !== 'varga' || !VARGAS.some(([id]) => id === value)) return;
    this.varga = value;
    this.refreshResult();
  }

  /** `D9 · Navamsha` / `D9 · नवांश`. */
  private vargaLabel(id: string, lang: Lang): string {
    const row = VARGAS.find(([vid]) => vid === id);
    return `${id.toUpperCase()} · ${row ? row[lang === 'hi' ? 2 : 1] : ''}`;
  }

  protected override resultBody(lang: Lang): string {
    const options = VARGAS.map(
      ([id]) => html`<option value="${id}">${this.vargaLabel(id, lang)}</option>`,
    ).join('');
    const row = VARGAS.find(([id]) => id === this.varga);
    const picker = html`<div class="kj-controls">
      <label class="kj-label" for="kj-varga">${msg(M, lang, 'choose')}</label>
      <select class="kj-select kj-select-inline" id="kj-varga" data-pick="varga">
        ${trusted(options)}
      </select>
    </div>`;
    const about = row
      ? html`<p class="kj-note" part="read-for">
          ${msg(M, lang, 'read_for', { what: row[lang === 'hi' ? 4 : 3] })}
        </p>`
      : '';
    const table = this.pending('vargas', 'table') ?? this.tableHtml(lang);
    return html`${trusted(picker)}
      <div class="kj-slot" data-chart-slot></div>
      ${trusted(about)}
      <section class="kj-section" part="varga-table">${trusted(table)}</section>`;
  }

  /** Each graha's sign in the varga, beside its D1 sign; vargottama where they agree. */
  private tableHtml(lang: Lang): string {
    const doc = this.ready<VargasDocument>('vargas');
    const varga = this.varga;
    const label = this.vargaLabel(varga, lang);
    const lagnaIn = doc?.lagna?.[varga] ?? '';
    const lagnaD1 = doc?.lagna?.d1 ?? '';
    const row = (key: string, name: string, here: string, d1: string) =>
      html`<tr part="varga-row varga-row-${key}">
        <th scope="row" style="color:var(--kj-planet-${key === 'lagna' ? 'moon' : key})">
          ${name}
        </th>
        <td>${trusted(here ? signHtml(here, tableName(SIGNS, here, lang)) : '—')}</td>
        <td>${trusted(d1 ? signHtml(d1, tableName(SIGNS, d1, lang)) : '—')}</td>
        <td>
          ${
            varga !== 'd1' && here && here === d1
              ? trusted(badgeHtml(t(lang, 'vargottama'), 'vargottama'))
              : ''
          }
        </td>
      </tr>`;
    const rows = [
      row('lagna', t(lang, 'lagna'), lagnaIn, lagnaD1),
      ...GRAHA_ORDER.map((id) =>
        row(id, tableName(GRAHAS, id, lang), signIn(doc, varga, id), signIn(doc, 'd1', id)),
      ),
    ].join('');
    return html`<h3 class="kj-h3">${msg(M, lang, 'grahas', { varga: label })}</h3>
      <div class="kj-table-wrap">
        <table class="kj-table kj-stack-28" part="vargas">
          <thead>
            <tr>
              <th scope="col">${t(lang, 'planet')}</th>
              <th scope="col">${msg(M, lang, 'in_varga', { varga: varga.toUpperCase() })}</th>
              <th scope="col">${msg(M, lang, 'in_d1')}</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            ${trusted(rows)}
          </tbody>
        </table>
      </div>`;
  }

  /** The chosen varga's chart, and the select showing it. */
  protected override mountInner(): void {
    const select = this.root.querySelector<HTMLSelectElement>('[data-pick="varga"]');
    if (select) select.value = this.varga;
    const slot = this.root.querySelector('[data-chart-slot]');
    if (!slot || !this.current) return;
    const chart = this.innerElement('chart', () => {
      defineOnce(KjChart);
      const element = document.createElement(KjChart.tag) as KjChart;
      const style = this.getAttribute('chart-style');
      if (style) element.setAttribute('chart-style', style);
      const size = this.getAttribute('size');
      if (size) element.setAttribute('size', size);
      return element;
    });
    chart.setAttribute('varga', this.varga);
    chart.birth = this.current;
    slot.append(chart);
  }
}
