/**
 * `<kj-dasha>` — the Vimshottari dasha calculator (revamp §4, 14): the
 * mahadashas as a proportional band and a table, and a drill-down from a
 * mahadasha to its antardashas and on to their pratyantardashas, the running
 * period marked at every level.
 *
 * One call per birth: `POST /v1/kundli/dasha` with `system: vimshottari` and
 * `levels: 3` — the three levels the API serves without a window, about
 * 12 KB gzipped — so drilling down asks for nothing. The Yogini dasha is a
 * switch (`yogini="off"` hides it): `system: yogini`, `levels: 2`, one more
 * call the first time it is chosen. Every date is an instant, read in the
 * birth's zone (`meta.timezone`).
 */

import { html, trusted } from '../core/element.ts';
import { EXTRA_CSS, grahaShort, msg, type Dict } from '../core/extra.ts';
import { dateLabel } from '../core/format.ts';
import { isOff } from '../core/config.ts';
import type { Lang } from '../core/i18n.ts';
import { GRAHAS, labelled, localWall, type AnswerZone } from '../core/reports.ts';
import { badgeHtml, segmentedHtml, stateHtml } from '../core/ui.ts';
import { CALC_ATTRIBUTES, KjBirthCalc, type CalcSlice } from './birth-calc.ts';
import type { KjBirth } from './chart.ts';
import type { DashaNode } from './kundli-report.ts';
import dashaCss from '../styles/dasha.css';
import { attachTables } from '../core/tables.ts';

type System = 'vimshottari' | 'yogini';

const M: Dict<
  | 'title'
  | 'submit'
  | 'system'
  | 'vimshottari'
  | 'yogini'
  | 'running'
  | 'until'
  | 'level1'
  | 'level2'
  | 'level3'
  | 'all'
  | 'starts'
  | 'ends'
  | 'now'
  | 'open'
  | 'of'
  | 'band'
> = {
  en: {
    title: 'Dasha calculator',
    submit: 'Show my dashas',
    system: 'Dasha system',
    vimshottari: 'Vimshottari',
    yogini: 'Yogini',
    running: 'Running now',
    until: 'until {date}',
    level1: 'Mahadasha',
    level2: 'Antardasha',
    level3: 'Pratyantardasha',
    all: 'All mahadashas',
    starts: 'Starts',
    ends: 'Ends',
    now: 'Now',
    open: 'Open the periods of {name}',
    of: '{level}s of {name}',
    band: 'The mahadashas of a life',
  },
  hi: {
    title: 'दशा गणना',
    submit: 'मेरी दशाएँ दिखाएँ',
    system: 'दशा पद्धति',
    vimshottari: 'विंशोत्तरी',
    yogini: 'योगिनी',
    running: 'अभी चल रही',
    until: '{date} तक',
    level1: 'महादशा',
    level2: 'अंतर्दशा',
    level3: 'प्रत्यंतर दशा',
    all: 'सभी महादशाएँ',
    starts: 'आरंभ',
    ends: 'समाप्ति',
    now: 'अभी',
    open: '{name} की दशाएँ खोलें',
    of: '{name} की {level}',
    band: 'जीवन की महादशाएँ',
  },
};

/** The eight yoginis, as the engine names them in `lord_label`, and in Hindi. */
const YOGINIS: Record<string, string> = {
  Mangala: 'मंगला',
  Pingala: 'पिंगला',
  Dhanya: 'धान्या',
  Bhramari: 'भ्रामरी',
  Bhadrika: 'भद्रिका',
  Ulka: 'उल्का',
  Siddha: 'सिद्धा',
  Sankata: 'संकटा',
};

/** `data` of `POST /v1/kundli/dasha` for one system. */
export interface DashaAnswer {
  at?: string;
  systems?: Partial<Record<System, { chain?: DashaNode[] | null; periods?: DashaNode[] | null }>>;
}

/** Whether `at` falls in a node. */
function isNow(node: DashaNode, at: number): boolean {
  return Date.parse(node.start) <= at && at < Date.parse(node.end);
}

/** @see KjBirthCalc */
export class KjDasha extends KjBirthCalc {
  static readonly tag = 'kj-dasha';

  static override styles = EXTRA_CSS + dashaCss;

  constructor() {
    super();
    attachTables(this.root);
  }

  static readonly observedAttributes = [...CALC_ATTRIBUTES, 'yogini', 'system'];

  protected override primary = 'vimshottari';

  private system: System = 'vimshottari';

  /** The drill-down: indices into the tree, from the mahadashas down. */
  private path: number[] = [];

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override reset(): void {
    this.system =
      this.getAttribute('system') === 'yogini' && this.yoginiOn ? 'yogini' : 'vimshottari';
    this.path = [];
  }

  private get yoginiOn(): boolean {
    return !isOff(this.getAttribute('yogini'));
  }

  protected override start(birth: KjBirth): void {
    this.needSystem(birth, this.system);
  }

  private needSystem(birth: KjBirth, system: System): void {
    this.need(system, '/kundli/dasha', {
      birth,
      system,
      levels: system === 'vimshottari' ? 3 : 2,
      options: { language: ['en', 'hi'] },
    });
  }

  protected override onChoice(group: string, id: string): void {
    if (group !== 'dasha-system' || !this.current) return;
    if (id !== 'vimshottari' && id !== 'yogini') return;
    this.system = id;
    this.path = [];
    this.needSystem(this.current, id);
    this.refreshResult();
  }

  protected override onAction(action: string, target: HTMLElement): void {
    if (action === 'open') {
      const index = Number(target.dataset.index);
      if (Number.isInteger(index)) this.path = [...this.path, index];
    } else if (action === 'crumb') {
      const depth = Number(target.dataset.depth);
      if (Number.isInteger(depth)) this.path = this.path.slice(0, depth);
    } else {
      return;
    }
    this.refreshResult();
    this.root.querySelector<HTMLElement>('[data-drill] table')?.focus?.();
  }

  protected override resultBody(lang: Lang): string {
    const controls = this.yoginiOn
      ? html`<div class="kj-controls">
          ${trusted(
            segmentedHtml(
              'dasha-system',
              msg(M, lang, 'system'),
              [
                { id: 'vimshottari', label: msg(M, lang, 'vimshottari') },
                { id: 'yogini', label: msg(M, lang, 'yogini') },
              ],
              this.system,
            ),
          )}
        </div>`
      : '';
    const pending = this.pending(this.system, 'table');
    if (pending) return controls + pending;
    const slice = this.slices.get(this.system) as CalcSlice<DashaAnswer>;
    const tree = slice.data?.systems?.[this.system];
    const periods = tree?.periods ?? [];
    if (!periods.length)
      return controls + stateHtml({ kind: 'empty', body: this.t('nothing_here') });
    return (
      controls +
      this.runningHtml(tree?.chain ?? [], slice.zone ?? null, lang) +
      this.bandHtml(periods, lang) +
      this.drillHtml(periods, slice.zone ?? null, lang)
    );
  }

  /** A node's name: the graha, or for a yogini "Siddha (Venus)". */
  private periodName(node: DashaNode, lang: Lang): string {
    const id = node.planet?.id ?? '';
    const graha = node.planet ? labelled(node.planet, GRAHAS, lang) : id;
    if (this.system !== 'yogini') return graha || node.lord_label || '—';
    const yogini = (node.lord_label ?? '').split(' (')[0] ?? '';
    const shown = lang === 'hi' ? (YOGINIS[yogini] ?? yogini) : yogini;
    return graha ? `${shown} (${graha})` : shown || '—';
  }

  private day(instant: string, zone: AnswerZone | null, lang: Lang): string {
    return dateLabel(localWall(instant, zone), lang);
  }

  /** "Running now: Mars / Moon / Ketu, until 8 Oct 2026". */
  private runningHtml(chain: DashaNode[], zone: AnswerZone | null, lang: Lang): string {
    if (!chain.length) return '';
    const names = chain.map((node) => this.periodName(node, lang)).join(' / ');
    const last = chain[chain.length - 1]!;
    return html`<p class="kj-lead" part="running">
      <strong>${msg(M, lang, 'running')}:</strong> ${names}
      <span class="kj-muted"
        >(${msg(M, lang, 'until', { date: this.day(last.end, zone, lang) })})</span
      >
    </p>`;
  }

  /** The mahadashas in proportion, the running one ringed. */
  private bandHtml(periods: DashaNode[], lang: Lang): string {
    const first = Date.parse(periods[0]!.start);
    const span = Date.parse(periods[periods.length - 1]!.end) - first || 1;
    const at = Date.now();
    const segments = periods
      .map((node) => {
        const id = node.planet?.id ?? '';
        const width = ((Date.parse(node.end) - Date.parse(node.start)) / span) * 100;
        const short = id ? grahaShort(id, lang) : '';
        return html`<span
          class="${isNow(node, at) ? 'kj-is-current' : ''}"
          style="width:${width.toFixed(2)}%;--kj-seg-c:${id === 'moon' ? '#8a8f99' : `var(--kj-planet-${id})`}"
          title="${this.periodName(node, lang)}"
          >${short}</span
        >`;
      })
      .join('');
    return html`<section class="kj-section" part="band">
      <h3 class="kj-h3">${msg(M, lang, 'band')}</h3>
      <div class="kj-dasha-bar" aria-hidden="true">${trusted(segments)}</div>
    </section>`;
  }

  /** The breadcrumb, and the table of the periods at the current depth. */
  private drillHtml(periods: DashaNode[], zone: AnswerZone | null, lang: Lang): string {
    // Walk the path; a path that no longer fits the tree is cut back.
    let nodes = periods;
    const trail: DashaNode[] = [];
    for (const [depth, index] of this.path.entries()) {
      const node = nodes[index];
      if (!node?.children?.length) {
        this.path = this.path.slice(0, depth);
        break;
      }
      trail.push(node);
      nodes = node.children;
    }
    const depth = trail.length;
    const levelKey = (['level1', 'level2', 'level3'] as const)[Math.min(depth, 2)]!;
    const level = msg(M, lang, levelKey);
    const at = Date.now();

    const crumbs = [
      depth
        ? html`<li>
            <button type="button" class="kj-link-btn" data-action="crumb" data-depth="0">
              ${msg(M, lang, 'all')}
            </button>
          </li>`
        : html`<li><span aria-current="true">${msg(M, lang, 'all')}</span></li>`,
      ...trail.map((node, i) =>
        i === trail.length - 1
          ? html`<li><span aria-current="true">${this.periodName(node, lang)}</span></li>`
          : html`<li>
              <button type="button" class="kj-link-btn" data-action="crumb" data-depth="${i + 1}">
                ${this.periodName(node, lang)}
              </button>
            </li>`,
      ),
    ].join('');

    const rows = nodes
      .map((node, index) => {
        const current = isNow(node, at);
        const name = this.periodName(node, lang);
        const id = node.planet?.id ?? '';
        const cell = node.children?.length
          ? html`<button
              type="button"
              class="kj-row-btn"
              data-action="open"
              data-index="${index}"
              aria-label="${msg(M, lang, 'open', { name })}"
            >
              ${name}
            </button>`
          : html`${name}`;
        return html`<tr class="${current ? 'kj-now-row' : ''}" part="period period-${id}">
          <th scope="row" style="color:var(--kj-planet-${id || 'moon'})">
            ${trusted(cell)} ${current ? trusted(badgeHtml(msg(M, lang, 'now'), 'current')) : ''}
          </th>
          <td class="kj-num">${this.day(node.start, zone, lang)}</td>
          <td class="kj-num">${this.day(node.end, zone, lang)}</td>
        </tr>`;
      })
      .join('');

    const caption = depth
      ? msg(M, lang, 'of', { level, name: this.periodName(trail[depth - 1]!, lang) })
      : msg(M, lang, 'level1');
    return html`<section class="kj-section" part="drill" data-drill>
      <ol class="kj-crumbs" part="crumbs">
        ${trusted(crumbs)}
      </ol>
      <div class="kj-table-wrap">
        <table class="kj-table kj-stack-24" part="periods" aria-label="${caption}" tabindex="-1">
          <thead>
            <tr>
              <th scope="col">${level}</th>
              <th scope="col" class="kj-num">${msg(M, lang, 'starts')}</th>
              <th scope="col" class="kj-num">${msg(M, lang, 'ends')}</th>
            </tr>
          </thead>
          <tbody>
            ${trusted(rows)}
          </tbody>
        </table>
      </div>
    </section>`;
  }
}
