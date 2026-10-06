/**
 * `<kj-kp>` — the Krishnamurti Paddhati chart as tables (revamp §4, 16).
 *
 * One call per birth, `POST /v1/kp/chart` (the Krishnamurti ayanamsa is the
 * route's own default): four tabs drawn from the one answer.
 *
 *   * **Cusps** — the twelve Placidus cusps, each with its sign and degree,
 *     nakshatra, and sign, star, sub and sub-sub lords.
 *   * **Planets** — the same lords for each graha, and its house.
 *   * **Significators** — per house, the four levels of KP signification:
 *     A (in the star of an occupant), B (occupants), C (in the star of the
 *     owner), D (the owner); and per graha, the houses it signifies.
 *   * **Ruling planets** — of the moment the chart is cast for.
 *
 * Every lord is a labelled graha from the API; the widget computes nothing.
 */

import { html, trusted } from '../core/element.ts';
import { EXTRA_CSS, inSign, msg, signOf, type Dict } from '../core/extra.ts';
import { nameOf, type Labelled, type Lang } from '../core/i18n.ts';
import { SIGNS, tableName } from '../core/reports.ts';
import { signHtml, tabPanelHtml, tabsHtml } from '../core/ui.ts';
import { CALC_ATTRIBUTES, KjBirthCalc } from './birth-calc.ts';
import type { KjBirth } from './chart.ts';
import kpCss from '../styles/kp.css';
import { attachTables } from '../core/tables.ts';

const TABS = ['cusps', 'planets', 'significators', 'ruling'] as const;
type Tab = (typeof TABS)[number];

const M: Dict<
  | 'title'
  | 'submit'
  | 'tabs'
  | Tab
  | 'cusp'
  | 'planet'
  | 'degree'
  | 'nakshatra'
  | 'sign_lord'
  | 'star_lord'
  | 'sub_lord'
  | 'sub_sub'
  | 'house'
  | 'level_a'
  | 'level_b'
  | 'level_c'
  | 'level_d'
  | 'houses_of'
  | 'signifies'
  | 'day_lord'
  | 'lagna_sign_lord'
  | 'lagna_star_lord'
  | 'lagna_sub_lord'
  | 'moon_sign_lord'
  | 'moon_star_lord'
  | 'moon_sub_lord'
  | 'distinct'
  | 'ruling_note'
> = {
  en: {
    title: 'KP chart',
    submit: 'Show my KP chart',
    tabs: 'KP chart',
    cusps: 'Cusps',
    planets: 'Planets',
    significators: 'Significators',
    ruling: 'Ruling planets',
    cusp: 'Cusp',
    planet: 'Planet',
    degree: 'Sign and degree',
    nakshatra: 'Nakshatra',
    sign_lord: 'Sign lord',
    star_lord: 'Star lord',
    sub_lord: 'Sub lord',
    sub_sub: 'Sub-sub lord',
    house: 'House',
    level_a: 'A: in the star of an occupant',
    level_b: 'B: occupants',
    level_c: 'C: in the star of the owner',
    level_d: 'D: owner',
    houses_of: 'Houses each graha signifies',
    signifies: 'Signifies houses',
    day_lord: 'Day lord',
    lagna_sign_lord: 'Lagna sign lord',
    lagna_star_lord: 'Lagna star lord',
    lagna_sub_lord: 'Lagna sub lord',
    moon_sign_lord: 'Moon sign lord',
    moon_star_lord: 'Moon star lord',
    moon_sub_lord: 'Moon sub lord',
    distinct: 'The ruling planets',
    ruling_note: 'For the moment and place the chart is cast for.',
  },
  hi: {
    title: 'केपी कुंडली',
    submit: 'मेरी केपी कुंडली',
    tabs: 'केपी कुंडली',
    cusps: 'भाव संधि',
    planets: 'ग्रह',
    significators: 'कारक',
    ruling: 'शासक ग्रह',
    cusp: 'भाव',
    planet: 'ग्रह',
    degree: 'राशि और अंश',
    nakshatra: 'नक्षत्र',
    sign_lord: 'राशि स्वामी',
    star_lord: 'नक्षत्र स्वामी',
    sub_lord: 'उप स्वामी',
    sub_sub: 'उप-उप स्वामी',
    house: 'भाव',
    level_a: 'A: भावस्थ ग्रह के नक्षत्र में',
    level_b: 'B: भावस्थ ग्रह',
    level_c: 'C: भावेश के नक्षत्र में',
    level_d: 'D: भावेश',
    houses_of: 'प्रत्येक ग्रह किन भावों का कारक है',
    signifies: 'कारक भाव',
    day_lord: 'वार स्वामी',
    lagna_sign_lord: 'लग्न राशि स्वामी',
    lagna_star_lord: 'लग्न नक्षत्र स्वामी',
    lagna_sub_lord: 'लग्न उप स्वामी',
    moon_sign_lord: 'चंद्र राशि स्वामी',
    moon_star_lord: 'चंद्र नक्षत्र स्वामी',
    moon_sub_lord: 'चंद्र उप स्वामी',
    distinct: 'शासक ग्रह',
    ruling_note: 'कुंडली के समय और स्थान के लिए।',
  },
};

/** The lords of a cusp or a graha. */
export interface KpLords {
  nakshatra?: Labelled | null;
  sign_lord?: Labelled | null;
  star_lord?: Labelled | null;
  sub_lord?: Labelled | null;
  sub_sub_lord?: Labelled | null;
}

/** `data` of `POST /v1/kp/chart`, as far as read here. */
export interface KpDocument {
  cusps?: { house: number; longitude: number; lords?: KpLords | null }[] | null;
  planets?:
    | { planet?: Labelled | null; house?: number; longitude: number; lords?: KpLords | null }[]
    | null;
  significators?:
    | {
        house: number;
        occupants?: Labelled[] | null;
        owner?: Labelled | null;
        in_star_of_occupants?: Labelled[] | null;
        in_star_of_owner?: Labelled[] | null;
      }[]
    | null;
  planet_significators?: { planet?: Labelled | null; all?: number[] | null }[] | null;
  ruling?: Record<string, Labelled | Labelled[] | null | undefined> | null;
}

const RULING = [
  'day_lord',
  'lagna_sign_lord',
  'lagna_star_lord',
  'lagna_sub_lord',
  'moon_sign_lord',
  'moon_star_lord',
  'moon_sub_lord',
] as const;

/** @see KjBirthCalc */
export class KjKp extends KjBirthCalc {
  static readonly tag = 'kj-kp';

  static override styles = EXTRA_CSS + kpCss;

  constructor() {
    super();
    attachTables(this.root);
  }

  static readonly observedAttributes = [...CALC_ATTRIBUTES, 'tab'];

  protected override primary = 'kp';

  private tab: Tab = 'cusps';

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override reset(): void {
    const asked = this.getAttribute('tab') as Tab | null;
    this.tab = asked && TABS.includes(asked) ? asked : 'cusps';
  }

  protected override start(birth: KjBirth): void {
    this.need('kp', '/kp/chart', { birth, options: { language: ['en', 'hi'] } });
  }

  protected override onChoice(group: string, id: string): void {
    if (group !== 'kp' || !(TABS as readonly string[]).includes(id)) return;
    this.tab = id as Tab;
    this.refreshResult();
  }

  protected override resultBody(lang: Lang): string {
    const pending = this.pending('kp', 'table');
    if (pending) return pending;
    const doc = this.ready<KpDocument>('kp') ?? {};
    const bar = tabsHtml(
      'kp',
      msg(M, lang, 'tabs'),
      TABS.map((id) => ({ id, label: msg(M, lang, id) })),
      this.tab,
    );
    const body =
      this.tab === 'cusps'
        ? this.lordsTable(
            'cusps',
            msg(M, lang, 'cusp'),
            (doc.cusps ?? []).map((cusp) => ({
              key: String(cusp.house),
              head: String(cusp.house),
              longitude: cusp.longitude,
              lords: cusp.lords,
            })),
            lang,
          )
        : this.tab === 'planets'
          ? this.lordsTable(
              'planets',
              msg(M, lang, 'planet'),
              (doc.planets ?? []).map((planet) => ({
                key: planet.planet?.id ?? '',
                head: nameOf(planet.planet, lang),
                longitude: planet.longitude,
                lords: planet.lords,
                house: planet.house,
              })),
              lang,
            )
          : this.tab === 'significators'
            ? this.significatorsHtml(doc, lang)
            : this.rulingHtml(doc, lang);
    return bar + tabPanelHtml('kp', this.tab, body);
  }

  /** Cusps or grahas: sign and degree, nakshatra, the four lords (and the house). */
  private lordsTable(
    part: string,
    first: string,
    rows: {
      key: string;
      head: string;
      longitude: number;
      lords?: KpLords | null;
      house?: number;
    }[],
    lang: Lang,
  ): string {
    const withHouse = part === 'planets';
    const lord = (value: Labelled | null | undefined) =>
      value
        ? html`<span style="color:var(--kj-planet-${value.id})">${nameOf(value, lang)}</span>`
        : '—';
    const body = rows
      .map((row) => {
        const sign = signOf(row.longitude);
        return html`<tr part="${part}-row ${part}-row-${row.key}">
          <th
            scope="row"
            ${trusted(withHouse ? html` style="color:var(--kj-planet-${row.key})"` : '')}
          >
            ${row.head}
          </th>
          ${trusted(withHouse ? html`<td class="kj-num">${row.house ?? '—'}</td>` : '')}
          <td>
            ${trusted(signHtml(sign, tableName(SIGNS, sign, lang)))}
            <span class="kj-time">${inSign(row.longitude)}</span>
          </td>
          <td>${nameOf(row.lords?.nakshatra, lang) || '—'}</td>
          <td>${trusted(lord(row.lords?.sign_lord))}</td>
          <td>${trusted(lord(row.lords?.star_lord))}</td>
          <td>${trusted(lord(row.lords?.sub_lord))}</td>
          <td>${trusted(lord(row.lords?.sub_sub_lord))}</td>
        </tr>`;
      })
      .join('');
    return html`<div class="kj-table-wrap">
      <table
        class="kj-table kj-table-compact kj-table-sticky ${part === 'planets' ? 'kj-stack-50' : 'kj-stack-44'}"
        part="${part}"
      >
        <thead>
          <tr>
            <th scope="col">${first}</th>
            ${trusted(withHouse ? html`<th scope="col" class="kj-num">${msg(M, lang, 'house')}</th>` : '')}
            <th scope="col">${msg(M, lang, 'degree')}</th>
            <th scope="col">${msg(M, lang, 'nakshatra')}</th>
            <th scope="col">${msg(M, lang, 'sign_lord')}</th>
            <th scope="col">${msg(M, lang, 'star_lord')}</th>
            <th scope="col">${msg(M, lang, 'sub_lord')}</th>
            <th scope="col">${msg(M, lang, 'sub_sub')}</th>
          </tr>
        </thead>
        <tbody>
          ${trusted(body)}
        </tbody>
      </table>
    </div>`;
  }

  /** Per house the four levels, A to D; per graha the houses it signifies. */
  private significatorsHtml(doc: KpDocument, lang: Lang): string {
    const chips = (grahas: (Labelled | null | undefined)[]) => {
      const items = grahas
        .filter((graha): graha is Labelled => Boolean(graha))
        .map(
          (graha) =>
            html`<span class="kj-lord" style="color:var(--kj-planet-${graha.id})"
              >${nameOf(graha, lang)}</span
            >`,
        )
        .join('');
      return items ? html`<span class="kj-lords">${trusted(items)}</span>` : '—';
    };
    const houses = (doc.significators ?? [])
      .map(
        (row) =>
          html`<tr part="house-row house-row-${row.house}">
            <th scope="row" class="kj-num">${row.house}</th>
            <td>${trusted(chips(row.in_star_of_occupants ?? []))}</td>
            <td>${trusted(chips(row.occupants ?? []))}</td>
            <td>${trusted(chips(row.in_star_of_owner ?? []))}</td>
            <td>${trusted(chips([row.owner]))}</td>
          </tr>`,
      )
      .join('');
    const grahas = (doc.planet_significators ?? [])
      .map(
        (row) =>
          html`<tr part="graha-row graha-row-${row.planet?.id ?? ''}">
            <th scope="row" style="color:var(--kj-planet-${row.planet?.id ?? 'moon'})">
              ${nameOf(row.planet, lang)}
            </th>
            <td class="kj-wrap">${(row.all ?? []).join(', ') || '—'}</td>
          </tr>`,
      )
      .join('');
    return html`<div class="kj-table-wrap">
        <table class="kj-table kj-table-compact kj-table-sticky kj-stack-44" part="significators">
          <thead>
            <tr>
              <th scope="col" class="kj-num">${msg(M, lang, 'house')}</th>
              <th scope="col">${msg(M, lang, 'level_a')}</th>
              <th scope="col">${msg(M, lang, 'level_b')}</th>
              <th scope="col">${msg(M, lang, 'level_c')}</th>
              <th scope="col">${msg(M, lang, 'level_d')}</th>
            </tr>
          </thead>
          <tbody>
            ${trusted(houses)}
          </tbody>
        </table>
      </div>
      <section class="kj-section" part="planet-significators">
        <h3 class="kj-h3">${msg(M, lang, 'houses_of')}</h3>
        <div class="kj-table-wrap">
          <table class="kj-table kj-table-compact">
            <thead>
              <tr>
                <th scope="col">${msg(M, lang, 'planet')}</th>
                <th scope="col">${msg(M, lang, 'signifies')}</th>
              </tr>
            </thead>
            <tbody>
              ${trusted(grahas)}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  /** The seven ruling lords, and the distinct ruling planets. */
  private rulingHtml(doc: KpDocument, lang: Lang): string {
    const ruling = doc.ruling ?? {};
    const rows = RULING.map((key) => {
      const value = ruling[key] as Labelled | null | undefined;
      return html`<tr part="ruling-row ruling-${key}">
        <th scope="row">${msg(M, lang, key)}</th>
        <td style="color:var(--kj-planet-${value?.id ?? 'moon'})">${nameOf(value, lang) || '—'}</td>
      </tr>`;
    }).join('');
    const distinct = ((ruling.distinct as Labelled[] | undefined) ?? [])
      .map(
        (graha) =>
          html`<li class="kj-chip" style="color:var(--kj-planet-${graha.id})">
            ${nameOf(graha, lang)}
          </li>`,
      )
      .join('');
    return html`<div class="kj-table-wrap">
        <table class="kj-table" part="ruling">
          <tbody>
            ${trusted(rows)}
          </tbody>
        </table>
      </div>
      ${trusted(
        distinct
          ? html`<section class="kj-section" part="ruling-planets">
              <h3 class="kj-h3">${msg(M, lang, 'distinct')}</h3>
              <ul class="kj-chips">
                ${trusted(distinct)}
              </ul>
            </section>`
          : '',
      )}
      <p class="kj-note">${msg(M, lang, 'ruling_note')}</p>`;
  }
}
