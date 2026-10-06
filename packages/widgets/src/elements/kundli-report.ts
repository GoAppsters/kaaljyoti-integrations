/**
 * The tabs of `<kj-kundli-form>`'s result, as pure renderers: each takes the
 * answers it reads and a language and returns markup. The element owns the
 * requests, the tab state and the painting; this module only draws, which
 * keeps the element readable and each tab testable on its own.
 *
 * What each tab asks for (one call per route per birth, memoised):
 *
 *   Overview    /v1/kundli, /v1/kundli/dasha, /v1/reports/lagna
 *   Charts      /v1/kundli/chart per chart and style shown; /v1/kundli/chalit
 *   Planets     /v1/kundli (shared), /v1/kundli/pace, /v1/kundli/vargas
 *   Dasha       /v1/kundli/dasha (shared)
 *   Life areas  /v1/reports/life-areas — a written report, 5 credits
 */

import { html, trusted } from '../core/html.ts';
import { clock, dateLabel, formatDegrees } from '../core/format.ts';
import { nameOf, pick, t, type Labelled, type Lang } from '../core/i18n.ts';
import {
  GRAHAS,
  SIGNS,
  areasHtml,
  labelled,
  localWall,
  summaryHtml,
  tableName,
  textOf,
  type AnswerZone,
  type ReportText,
  type Summary,
} from '../core/reports.ts';
import { badgeHtml, signHtml, tilesHtml, type Tile } from '../core/ui.ts';
import { msg, type Dict } from '../core/dict.ts';
import type { KjBirth } from './chart.ts';

/** Sun to Ketu, the order a Hindi panchang prints them in. */
export const PLANET_ORDER = [
  'sun',
  'moon',
  'mars',
  'mercury',
  'jupiter',
  'venus',
  'saturn',
  'rahu',
  'ketu',
] as const;

/** Two-letter graha abbreviations for the dasha band. */
const SHORT: Record<string, [string, string]> = {
  sun: ['Su', 'सू'],
  moon: ['Mo', 'चं'],
  mars: ['Ma', 'मं'],
  mercury: ['Me', 'बु'],
  jupiter: ['Ju', 'गु'],
  venus: ['Ve', 'शु'],
  saturn: ['Sa', 'श'],
  rahu: ['Ra', 'रा'],
  ketu: ['Ke', 'के'],
};

/** As much of `POST /v1/kundli` as the report reads. */
export interface Kundli {
  /** Sidereal longitude of the ascendant, 0–360. */
  ascendant?: number | null;
  ascendant_dms?: string | null;
  lagna_sign?: Labelled | null;
  moon_sign?: Labelled | null;
  moon_nakshatra?: Labelled | null;
  birth?: { place_name?: string | null } | null;
  panchang?: {
    tithi_name?: Labelled | null;
    paksha?: Labelled | null;
    vara?: Labelled | null;
    pada?: number | null;
  } | null;
  positions?: Record<string, Position | undefined> | null;
  houses?: Record<string, number | undefined> | null;
  yogas?: Yoga[] | null;
}

export interface Position {
  planet?: Labelled | null;
  sign?: Labelled | null;
  nakshatra?: Labelled | null;
  pada?: number | null;
  degrees_in_sign_dms?: string | null;
  is_retrograde?: boolean | null;
}

export interface Yoga {
  name?: string | null;
  category?: string | null;
  /** English only — the engine writes it, and it is not a closed set. */
  detail?: string | null;
}

/** One node of the Vimshottari tree. */
export interface DashaNode {
  planet?: Labelled | null;
  lord_label?: string | null;
  start: string;
  end: string;
  level?: number;
  children?: DashaNode[] | null;
}

/** `POST /v1/kundli/dasha` with `system: vimshottari`. */
export interface DashaDoc {
  at?: string;
  systems?: { vimshottari?: { chain?: DashaNode[] | null; periods?: DashaNode[] | null } };
}

/** `POST /v1/kundli/pace`, as far as the planets table reads it. */
export interface PaceDoc {
  entries?: { graha?: Labelled | null; position?: { dignity?: string | null } | null }[] | null;
}

/** `POST /v1/kundli/vargas` with `vargas: ["d1","d9"]`. */
export interface VargasDoc {
  placements?: Record<string, Record<string, string[] | undefined> | undefined> | null;
}

/** `POST /v1/kundli/chalit` with `system: sripati`. */
export interface ChalitDoc {
  sripati?: {
    madhya?: number[] | null;
    planets_in_house?: Labelled[][] | null;
    sign_of_house?: string[] | null;
  } | null;
}

/** `POST /v1/reports/lagna` and `/v1/reports/life-areas`, as far as read here. */
export interface ReportDoc {
  lagna?: { sign?: Labelled; entry?: { text?: ReportText } };
  summary?: Summary;
  areas?: Summary[];
  disclaimer?: ReportText;
}

/** A section that may still be loading, or may have failed. */
export interface Slice<T> {
  state: 'loading' | 'ready' | 'error';
  data?: T;
  zone?: AnswerZone | null;
  error?: unknown;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** `14 May 1990, 10:30 · New Delhi`. */
export function birthLine(birth: KjBirth | null, lang: Lang, place?: string | null): string {
  if (!birth) return '';
  const parts = [`${dateLabel(birth.datetime, lang)}, ${clock(birth.datetime, lang)}`];
  const where = birth.place ?? place;
  if (where) parts.push(where);
  return parts.join(' · ');
}

/** A graha's name: the answer's label, else the bundled one. */
function grahaName(value: Labelled | null | undefined, id: string, lang: Lang): string {
  return value ? labelled(value, GRAHAS, lang) : tableName(GRAHAS, id, lang);
}

/** The running mahadasha and antardasha, from the chain. */
export function runningDasha(doc: DashaDoc | undefined): {
  maha?: DashaNode;
  antar?: DashaNode;
} {
  const chain = doc?.systems?.vimshottari?.chain ?? [];
  return { maha: chain.find((n) => n.level === 1), antar: chain.find((n) => n.level === 2) };
}

/** A dasha lord's id, from the node. */
function lordId(node: DashaNode | undefined): string {
  return node?.planet?.id ?? (node?.lord_label ?? '').toLowerCase();
}

/** `23 Nov 2026`, read in the answer's zone. */
function dayIn(instant: string | undefined, zone: AnswerZone | null | undefined, lang: Lang) {
  return dateLabel(localWall(instant, zone ?? null), lang);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** The tiles: lagna, rashi, nakshatra, the running dashas, the tithi. */
export function overviewTilesHtml(
  kundli: Kundli,
  dasha: Slice<DashaDoc> | undefined,
  lang: Lang,
): string {
  const lagna = kundli.lagna_sign;
  const moon = kundli.moon_sign;
  const nakshatra = kundli.moon_nakshatra;
  const panchang = kundli.panchang ?? {};
  const pada = panchang.pada ?? kundli.positions?.moon?.pada ?? null;

  const tiles: Tile[] = [
    {
      key: 'lagna',
      label: t(lang, 'lagna'),
      value: signHtml(lagna?.id, pick(lagna?.names, lagna?.name ?? '—', lang), 'm'),
      sub: html`${ascendantInSign(kundli)}`,
    },
    {
      key: 'rashi',
      label: t(lang, 'moonsign'),
      value: signHtml(moon?.id, pick(moon?.names, moon?.name ?? '—', lang), 'm'),
    },
    {
      key: 'nakshatra',
      label: t(lang, 'nakshatra'),
      value: html`${pick(nakshatra?.names, nakshatra?.name ?? '—', lang)}`,
      sub: pada ? html`${t(lang, 'pada')} ${pada}` : undefined,
    },
  ];

  const { maha, antar } = runningDasha(dasha?.data);
  const pending = !dasha || dasha.state === 'loading';
  if (maha || pending) {
    tiles.push({
      key: 'mahadasha',
      label: t(lang, 'mahadasha_label'),
      value: maha ? html`${grahaName(maha.planet, lordId(maha), lang)}` : '…',
      sub: maha ? html`${t(lang, 'ends')} ${dayIn(maha.end, dasha?.zone, lang)}` : undefined,
    });
  }
  if (antar || pending) {
    tiles.push({
      key: 'antardasha',
      label: t(lang, 'antardasha'),
      value: antar ? html`${grahaName(antar.planet, lordId(antar), lang)}` : '…',
      sub: antar ? html`${t(lang, 'ends')} ${dayIn(antar.end, dasha?.zone, lang)}` : undefined,
    });
  }

  const tithi = [nameOf(panchang.paksha, lang), nameOf(panchang.tithi_name, lang)]
    .filter(Boolean)
    .join(' ');
  tiles.push({
    key: 'tithi',
    label: t(lang, 'tithi'),
    value: html`${tithi || '—'}`,
    sub: panchang.vara ? html`${nameOf(panchang.vara, lang)}` : undefined,
  });
  return tilesHtml(tiles, 'overview');
}

/** The yogas the chart forms, as chips. */
export function yogaChipsHtml(kundli: Kundli, lang: Lang): string {
  const yogas = kundli.yogas ?? [];
  if (!yogas.length) return '';
  const chips = yogas
    .map(
      (yoga) =>
        html`<li class="kj-chip" part="yoga" title="${yoga.detail ?? ''}">
          ${yoga.name ?? ''}${yoga.category ? trusted(html` <small>${yoga.category}</small>`) : ''}
        </li>`,
    )
    .join('');
  return html`<section class="kj-section" part="yogas">
    <h3 class="kj-h3">${t(lang, 'key_yogas')}</h3>
    <ul class="kj-chips">
      ${trusted(chips)}
    </ul>
  </section>`;
}

/** What the lagna says: the reading's text, set as prose. */
export function lagnaAboutHtml(doc: ReportDoc | undefined, lang: Lang): string {
  const text = textOf(doc?.lagna?.entry?.text, lang);
  if (!text) return '';
  const sign = doc?.lagna?.sign;
  return html`<section class="kj-section" part="about-lagna">
    <h3 class="kj-h3">
      ${t(lang, 'about_lagna')} ·
      ${trusted(signHtml(sign?.id, labelled(sign ?? null, SIGNS, lang)))}
    </h3>
    <div class="kj-prose">
      ${trusted(
        text
          .split(/\n{2,}/)
          .map((paragraph) => html`<p>${paragraph}</p>`)
          .join(''),
      )}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Planets
// ---------------------------------------------------------------------------

/** The dignity words, in the kundli report's chunk (decision 24). */
const DIGNITIES: Dict<
  | 'dignity_exalted'
  | 'dignity_debilitated'
  | 'dignity_own_sign'
  | 'dignity_moolatrikona'
  | 'dignity_friendly'
  | 'dignity_great_friend'
  | 'dignity_enemy'
  | 'dignity_great_enemy'
  | 'dignity_neutral'
> = {
  en: {
    dignity_exalted: 'Exalted',
    dignity_debilitated: 'Debilitated',
    dignity_own_sign: 'Own sign',
    dignity_moolatrikona: 'Moolatrikona',
    dignity_friendly: 'Friendly sign',
    dignity_great_friend: 'Great friend',
    dignity_enemy: 'Enemy sign',
    dignity_great_enemy: 'Great enemy',
    dignity_neutral: 'Neutral sign',
  },
  hi: {
    dignity_exalted: 'उच्च',
    dignity_debilitated: 'नीच',
    dignity_own_sign: 'स्वराशि',
    dignity_moolatrikona: 'मूलत्रिकोण',
    dignity_friendly: 'मित्र राशि',
    dignity_great_friend: 'अधिमित्र राशि',
    dignity_enemy: 'शत्रु राशि',
    dignity_great_enemy: 'अधिशत्रु राशि',
    dignity_neutral: 'सम राशि',
  },
};

type DignityKey = keyof (typeof DIGNITIES)['en'];

/** Dignities the engine names, and whether each is a strength or a weakness. */
const DIGNITY: Record<string, ['good' | 'bad' | '', DignityKey]> = {
  exalted: ['good', 'dignity_exalted'],
  moolatrikona: ['good', 'dignity_moolatrikona'],
  own_sign: ['good', 'dignity_own_sign'],
  great_friend: ['good', 'dignity_great_friend'],
  friendly: ['', 'dignity_friendly'],
  friend: ['', 'dignity_friendly'],
  neutral: ['', 'dignity_neutral'],
  enemy: ['', 'dignity_enemy'],
  great_enemy: ['bad', 'dignity_great_enemy'],
  debilitated: ['bad', 'dignity_debilitated'],
};

/** The graha's D1 and D9 signs are the same: vargottama. */
function vargottama(vargas: VargasDoc | undefined, graha: string): boolean {
  const signOf = (varga: string) =>
    Object.entries(vargas?.placements?.[varga] ?? {}).find(([, grahas]) =>
      grahas?.includes(graha),
    )?.[0];
  const d1 = signOf('d1');
  return Boolean(d1) && d1 === signOf('d9');
}

/**
 * Sign, degree, nakshatra and pada, house, and what the graha carries: ℞,
 * its dignity (from `/v1/kundli/pace`) and vargottama (from the D1 and D9
 * placements). The badges arrive with their answers; the table is complete
 * without them.
 */
export function planetsTableHtml(
  kundli: Kundli,
  pace: PaceDoc | undefined,
  vargas: VargasDoc | undefined,
  lang: Lang,
): string {
  const positions = kundli.positions ?? {};
  const houses = kundli.houses ?? {};
  const dignityOf = (id: string) =>
    pace?.entries?.find((entry) => entry.graha?.id === id)?.position?.dignity ?? '';

  const lagna = kundli.lagna_sign;
  const lagnaRow = html`<tr part="planet-row planet-lagna">
    <th scope="row" style="color:var(--kj-accent)">${t(lang, 'lagna')}</th>
    <td>${trusted(signHtml(lagna?.id, pick(lagna?.names, lagna?.name ?? '—', lang)))}</td>
    <td class="kj-num">${ascendantInSign(kundli)}</td>
    <td>—</td>
    <td class="kj-num">1</td>
    <td></td>
  </tr>`;

  const rows = PLANET_ORDER.map((id) => {
    const position = positions[id];
    if (!position) return '';
    const sign = position.sign;
    const nakshatra = position.nakshatra;
    const badges: string[] = [];
    if (position.is_retrograde) {
      badges.push(badgeHtml(`℞ ${t(lang, 'retrograde')}`, 'retro'));
    }
    const dignity = DIGNITY[dignityOf(id)];
    if (dignity) {
      badges.push(
        badgeHtml(
          msg(DIGNITIES, lang, dignity[1]),
          dignity[0] ? `dignity-${dignity[0]}` : 'dignity',
        ),
      );
    }
    if (vargottama(vargas, id)) badges.push(badgeHtml(t(lang, 'vargottama'), 'vargottama'));
    return html`<tr part="planet-row planet-${id}">
      <th scope="row" style="color:var(--kj-planet-${id})">
        ${grahaName(position.planet, id, lang)}
      </th>
      <td>${trusted(signHtml(sign?.id, pick(sign?.names, sign?.name ?? '—', lang)))}</td>
      <td class="kj-num">${formatDegrees(position.degrees_in_sign_dms)}</td>
      <td>
        ${pick(nakshatra?.names, nakshatra?.name ?? '—', lang)}${
          position.pada ? ` · ${position.pada}` : ''
        }
      </td>
      <td class="kj-num">${houses[id] ?? '—'}</td>
      <td>${trusted(badges.join(' '))}</td>
    </tr>`;
  }).join('');

  return html`<div class="kj-table-wrap">
    <table class="kj-table kj-stack-50" part="planets">
      <thead>
        <tr>
          <th scope="col">${t(lang, 'planet')}</th>
          <th scope="col">${t(lang, 'sign')}</th>
          <th scope="col" class="kj-num">${t(lang, 'degrees')}</th>
          <th scope="col">${t(lang, 'nakshatra')} · ${t(lang, 'pada')}</th>
          <th scope="col" class="kj-num">${t(lang, 'house')}</th>
          <th scope="col">${t(lang, 'dignity')}</th>
        </tr>
      </thead>
      <tbody>
        ${trusted(lagnaRow)}${trusted(rows)}
      </tbody>
    </table>
  </div>`;
}

// ---------------------------------------------------------------------------
// Charts: chalit
// ---------------------------------------------------------------------------

/** `99.0467` → `9°02'` within its sign. */
function inSign(longitude: number): string {
  const within = ((longitude % 30) + 30) % 30;
  const degrees = Math.floor(within);
  const minutes = Math.floor((within - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, '0')}′`;
}

/**
 * The ascendant within its sign (`9°02′`): `ascendant_dms` is the whole
 * longitude, which reads as nonsense next to a sign name.
 */
function ascendantInSign(kundli: Kundli): string {
  return typeof kundli.ascendant === 'number'
    ? inSign(kundli.ascendant)
    : formatDegrees(kundli.ascendant_dms);
}

/** Bhava chalit as a table: each house's madhya, its sign, and its grahas. */
export function chalitHtml(doc: ChalitDoc | undefined, lang: Lang): string {
  const system = doc?.sripati;
  const madhya = system?.madhya ?? [];
  if (!madhya.length) return '';
  const rows = madhya
    .map((longitude, index) => {
      const sign = system?.sign_of_house?.[index] ?? '';
      const grahas = (system?.planets_in_house?.[index] ?? [])
        .map(
          (graha) =>
            html`<span style="color:var(--kj-planet-${graha.id})"
              >${grahaName(graha, graha.id, lang)}</span
            >`,
        )
        .join(', ');
      return html`<tr part="bhava bhava-${index + 1}">
        <th scope="row" class="kj-num">${index + 1}</th>
        <td>${trusted(signHtml(sign, tableName(SIGNS, sign, lang)))}</td>
        <td class="kj-num">${inSign(longitude)}</td>
        <td class="kj-wrap">${trusted(grahas || '—')}</td>
      </tr>`;
    })
    .join('');
  return html`<p class="kj-help kj-section">${t(lang, 'chalit_note')}</p>
    <div class="kj-table-wrap">
      <table class="kj-table" part="chalit">
        <thead>
          <tr>
            <th scope="col" class="kj-num">${t(lang, 'bhava')}</th>
            <th scope="col">${t(lang, 'sign')}</th>
            <th scope="col" class="kj-num">${t(lang, 'madhya')}</th>
            <th scope="col">${t(lang, 'grahas')}</th>
          </tr>
        </thead>
        <tbody>
          ${trusted(rows)}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------------
// Dasha
// ---------------------------------------------------------------------------

/** Whether `now` (an instant) falls in a node. */
function isNow(node: DashaNode, now: number): boolean {
  return Date.parse(node.start) <= now && now < Date.parse(node.end);
}

/**
 * The Vimshottari timeline: a band of the mahadashas in proportion, the
 * running one ringed; the mahadashas as a table; the running one's
 * antardashas under it, the running antardasha marked.
 */
export function dashaHtml(slice: Slice<DashaDoc>, lang: Lang, now = Date.now()): string {
  const periods = slice.data?.systems?.vimshottari?.periods ?? [];
  if (!periods.length) return '';
  const zone = slice.zone;
  const first = Date.parse(periods[0]!.start);
  const last = Date.parse(periods.at(-1)!.end);
  const span = last - first || 1;

  const band = periods
    .map((node) => {
      const id = lordId(node);
      const width = ((Date.parse(node.end) - Date.parse(node.start)) / span) * 100;
      const short = SHORT[id]?.[lang === 'hi' ? 1 : 0] ?? id.slice(0, 2);
      return html`<span
        class="${isNow(node, now) ? 'kj-is-current' : ''}"
        style="width:${width.toFixed(2)}%;--kj-seg-c:${id === 'moon' ? '#8a8f99' : `var(--kj-planet-${id})`}"
        title="${grahaName(node.planet, id, lang)}"
        >${short}</span
      >`;
    })
    .join('');

  const row = (node: DashaNode, part: string) => {
    const current = isNow(node, now);
    const id = lordId(node);
    return html`<tr class="${current ? 'kj-now-row' : ''}" part="${part} ${part}-${id}">
      <th scope="row" style="color:var(--kj-planet-${id})">
        ${grahaName(node.planet, id, lang)}
        ${current ? trusted(badgeHtml(t(lang, 'current'), 'current')) : ''}
      </th>
      <td class="kj-num">${dayIn(node.start, zone, lang)}</td>
      <td class="kj-num">${dayIn(node.end, zone, lang)}</td>
    </tr>`;
  };

  const table = (label: string, nodes: DashaNode[], part: string) =>
    html`<div class="kj-table-wrap">
      <table class="kj-table kj-stack-24" part="${part}s" aria-label="${label}">
        <thead>
          <tr>
            <th scope="col">${label}</th>
            <th scope="col" class="kj-num">${t(lang, 'starts')}</th>
            <th scope="col" class="kj-num">${t(lang, 'ends')}</th>
          </tr>
        </thead>
        <tbody>
          ${trusted(nodes.map((node) => row(node, part)).join(''))}
        </tbody>
      </table>
    </div>`;

  const running = periods.find((node) => isNow(node, now));
  const antar = running?.children ?? [];
  const runningLine = runningDasha(slice.data);
  const summary = runningLine.maha
    ? html`<p class="kj-lead" part="running">
        <strong>${t(lang, 'current_dasha')}:</strong>
        ${grahaName(runningLine.maha.planet, lordId(runningLine.maha), lang)}${
          runningLine.antar
            ? ` / ${grahaName(runningLine.antar.planet, lordId(runningLine.antar), lang)}`
            : ''
        }
        <span class="kj-muted"
          >(${t(lang, 'ends')}
          ${dayIn(runningLine.antar?.end ?? runningLine.maha.end, zone, lang)})</span
        >
      </p>`
    : '';

  return html`${trusted(summary)}
    <section class="kj-section" part="dasha-timeline">
      <h3 class="kj-h3">${t(lang, 'dasha_timeline')}</h3>
      <div class="kj-dasha-bar" aria-hidden="true">${trusted(band)}</div>
    </section>
    <section class="kj-section">
      ${trusted(table(t(lang, 'mahadasha_label'), periods, 'mahadasha'))}
    </section>
    ${trusted(
      antar.length && running
        ? html`<section class="kj-section" part="antardashas">
            <h3 class="kj-h3">
              ${t(lang, 'antardashas_of', { lord: grahaName(running.planet, lordId(running), lang) })}
            </h3>
            ${trusted(table(t(lang, 'antardasha'), antar, 'antardasha'))}
          </section>`
        : '',
    )}`;
}

// ---------------------------------------------------------------------------
// Life areas
// ---------------------------------------------------------------------------

/** The summary line and one card per area of life. */
export function lifeAreasHtml(doc: ReportDoc | undefined, lang: Lang): string {
  if (!doc) return '';
  return summaryHtml(doc.summary, lang) + areasHtml(doc.areas, lang);
}
