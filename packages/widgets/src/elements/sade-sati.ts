/**
 * `<kj-sade-sati>` — whether Saturn's sade sati (or a dhaiya) is running for
 * a birth, and its phases and dates year by year (revamp §4, 13).
 *
 * `POST /v1/kundli/sade-sati` scans a window of at most 366 days, so the
 * widget asks for one calendar year at a time: the current year on submit
 * (1 call), and each other year the reader steps to (1 call each, memoised).
 * The phases come back clipped to the window; a phase that runs on past the
 * year says so ("continues into 2028") rather than inventing its end.
 *
 * Phases are the engine's: `rising`, `peak` and `setting` — Saturn in the
 * 12th, the 1st and the 2nd sign from the natal Moon — and `small_panoti`,
 * the dhaiya of the 4th and the 8th. Dates are read in the birth's zone.
 */

import { html, trusted } from '../core/element.ts';
import { msg, stepperHtml, type Dict } from '../core/extra.ts';
import { dateLabel } from '../core/format.ts';
import type { Labelled, Lang } from '../core/i18n.ts';
import { SIGNS, labelled, localWall, type AnswerZone } from '../core/reports.ts';
import { badgeHtml, signHtml, stateHtml } from '../core/ui.ts';
import { CALC_ATTRIBUTES, KjBirthCalc } from './birth-calc.ts';
import type { KjBirth } from './chart.ts';
import { attachTables } from '../core/tables.ts';

const M: Dict<
  | 'title'
  | 'submit'
  | 'year'
  | 'prev'
  | 'next'
  | 'running'
  | 'running_dhaiya'
  | 'not_running'
  | 'not_running_year'
  | 'until'
  | 'into'
  | 'phases'
  | 'phase'
  | 'saturn_in'
  | 'from'
  | 'to'
  | 'before'
  | 'rising'
  | 'peak'
  | 'setting'
  | 'small_panoti'
  | 'about'
  | 'now'
> = {
  en: {
    title: 'Sade sati',
    submit: 'Check sade sati',
    year: 'Year',
    prev: 'Previous year',
    next: 'Next year',
    running: 'Sade sati is running: {phase}',
    running_dhaiya: 'A dhaiya of Saturn is running',
    not_running: 'Sade sati is not running now',
    not_running_year: 'No sade sati or dhaiya in {year}',
    until: 'until {date}',
    into: 'continues into {year}',
    phases: 'Saturn’s phases in {year}',
    phase: 'Phase',
    saturn_in: 'Saturn in',
    from: 'From',
    to: 'To',
    before: 'before {date}',
    rising: 'Rising phase (first)',
    peak: 'Peak phase (second)',
    setting: 'Setting phase (third)',
    small_panoti: 'Dhaiya (small panoti)',
    about:
      'Sade sati is Saturn’s passage through the sign before the natal Moon, the Moon’s sign and the sign after it; a dhaiya is its stay in the 4th or the 8th sign from the Moon.',
    now: 'Now',
  },
  hi: {
    title: 'साढ़े साती',
    submit: 'साढ़े साती देखें',
    year: 'वर्ष',
    prev: 'पिछला वर्ष',
    next: 'अगला वर्ष',
    running: 'साढ़े साती चल रही है: {phase}',
    running_dhaiya: 'शनि की ढैया चल रही है',
    not_running: 'अभी साढ़े साती नहीं चल रही',
    not_running_year: '{year} में साढ़े साती या ढैया नहीं',
    until: '{date} तक',
    into: '{year} में भी जारी',
    phases: '{year} में शनि के चरण',
    phase: 'चरण',
    saturn_in: 'शनि राशि',
    from: 'से',
    to: 'तक',
    before: '{date} से पहले से',
    rising: 'उदय चरण (प्रथम)',
    peak: 'शिखर चरण (द्वितीय)',
    setting: 'अस्त चरण (तृतीय)',
    small_panoti: 'ढैया (लघु पनौती)',
    about:
      'साढ़े साती जन्म राशि से पहली, जन्म राशि और अगली राशि में शनि का गोचर है; ढैया चंद्र से चौथी या आठवीं राशि में शनि का वास है।',
    now: 'अभी',
  },
};

/** One phase of `POST /v1/kundli/sade-sati`. */
export interface SadeSatiPhase {
  kind: string;
  sign?: Labelled | null;
  start: string;
  end: string;
}

/** `data` of `POST /v1/kundli/sade-sati`, as far as read here. */
export interface SadeSatiDocument {
  phases?: SadeSatiPhase[] | null;
}

const KINDS = new Set(['rising', 'peak', 'setting', 'small_panoti']);

/** The window of one calendar year, as the route's UTC instants. */
function yearWindow(year: number): { from: string; to: string } {
  return { from: `${year}-01-01T00:00:00Z`, to: `${year + 1}-01-01T00:00:00Z` };
}

/** @see KjBirthCalc */
export class KjSadeSati extends KjBirthCalc {
  static readonly tag = 'kj-sade-sati';

  static readonly observedAttributes = [...CALC_ATTRIBUTES];

  constructor() {
    super();
    attachTables(this.root);
  }

  /** The year on show; the current one until the reader steps. */
  private year = new Date().getUTCFullYear();

  private readonly thisYear = new Date().getUTCFullYear();

  protected override primary = `year-${new Date().getUTCFullYear()}`;

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override reset(): void {
    this.year = this.thisYear;
  }

  protected override start(birth: KjBirth): void {
    this.needYear(birth, this.thisYear);
  }

  private needYear(birth: KjBirth, year: number): void {
    this.need(`year-${year}`, '/kundli/sade-sati', {
      birth,
      ...yearWindow(year),
      options: { language: ['en', 'hi'] },
    });
  }

  /** The year stepper: one call per year shown, the page memo for a year seen before. */
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
    const now = this.statusHtml(lang);
    const stepper = stepperHtml(
      msg(M, lang, 'year'),
      String(this.year),
      msg(M, lang, 'prev'),
      msg(M, lang, 'next'),
    );
    const name = `year-${this.year}`;
    const body = this.pending(name, 'table') ?? this.phasesHtml(name, lang);
    return html`${trusted(now)}
      <section class="kj-section" part="year">
        <div class="kj-controls">${trusted(stepper)}</div>
        ${trusted(body)}
      </section>
      <p class="kj-note" part="about">${msg(M, lang, 'about')}</p>`;
  }

  /** "Sade sati is running: peak phase, until 3 Jun 2027", from this year's answer. */
  private statusHtml(lang: Lang): string {
    const name = `year-${this.thisYear}`;
    const slice = this.slices.get(name);
    if (!slice || slice.state !== 'ready') return '';
    const phases = (slice.data as SadeSatiDocument).phases ?? [];
    const at = Date.now();
    const running = phases.find(
      (phase) =>
        KINDS.has(phase.kind) && Date.parse(phase.start) <= at && at < Date.parse(phase.end),
    );
    if (!running) {
      return html`<div class="kj-verdict-box" part="verdict" data-tone="good" data-running="no">
        <p class="kj-verdict-title">${msg(M, lang, 'not_running')}</p>
      </div>`;
    }
    const dhaiya = running.kind === 'small_panoti';
    const title = dhaiya
      ? msg(M, lang, 'running_dhaiya')
      : msg(M, lang, 'running', { phase: msg(M, lang, running.kind as 'peak') });
    const clipped = Date.parse(running.end) >= Date.parse(yearWindow(this.thisYear).to);
    const ends = clipped
      ? msg(M, lang, 'into', { year: this.thisYear + 1 })
      : msg(M, lang, 'until', { date: this.day(running.end, slice.zone ?? null, lang) });
    return html`<div
      class="kj-verdict-box"
      part="verdict"
      data-tone="care"
      data-running="${running.kind}"
    >
      <p class="kj-verdict-title">${title}</p>
      <p>
        ${msg(M, lang, 'saturn_in')}
        ${trusted(signHtml(running.sign?.id, labelled(running.sign ?? null, SIGNS, lang), 'm'))} ·
        ${ends}
      </p>
    </div>`;
  }

  /** The year's phases as a table: phase, Saturn's sign, from, to. */
  private phasesHtml(name: string, lang: Lang): string {
    const slice = this.slices.get(name);
    const phases = ((slice?.data as SadeSatiDocument | undefined)?.phases ?? []).filter((p) =>
      KINDS.has(p.kind),
    );
    const year = Number(name.slice(5));
    if (!phases.length) {
      return stateHtml({
        kind: 'empty',
        part: 'no-phases',
        body: msg(M, lang, 'not_running_year', { year }),
      });
    }
    const window = yearWindow(year);
    const zone = slice?.zone ?? null;
    const at = Date.now();
    const rows = phases
      .map((phase) => {
        const startsBefore = Date.parse(phase.start) <= Date.parse(window.from);
        const endsAfter = Date.parse(phase.end) >= Date.parse(window.to);
        const current = Date.parse(phase.start) <= at && at < Date.parse(phase.end);
        return html`<tr part="phase phase-${phase.kind}" class="${current ? 'kj-now-row' : ''}">
          <th scope="row">
            ${msg(M, lang, phase.kind as 'peak')}
            ${current ? trusted(badgeHtml(msg(M, lang, 'now'), 'current')) : ''}
          </th>
          <td>${trusted(signHtml(phase.sign?.id, labelled(phase.sign ?? null, SIGNS, lang)))}</td>
          <td class="kj-num">
            ${
              startsBefore
                ? msg(M, lang, 'before', { date: this.day(window.from, zone, lang) })
                : this.day(phase.start, zone, lang)
            }
          </td>
          <td class="kj-num">
            ${endsAfter ? msg(M, lang, 'into', { year: year + 1 }) : this.day(phase.end, zone, lang)}
          </td>
        </tr>`;
      })
      .join('');
    return html`<h3 class="kj-h3">${msg(M, lang, 'phases', { year })}</h3>
      <div class="kj-table-wrap">
        <table class="kj-table kj-stack-44" part="phases">
          <thead>
            <tr>
              <th scope="col">${msg(M, lang, 'phase')}</th>
              <th scope="col">${msg(M, lang, 'saturn_in')}</th>
              <th scope="col" class="kj-num">${msg(M, lang, 'from')}</th>
              <th scope="col" class="kj-num">${msg(M, lang, 'to')}</th>
            </tr>
          </thead>
          <tbody>
            ${trusted(rows)}
          </tbody>
        </table>
      </div>`;
  }

  /** An instant as a date in the answer's zone. */
  private day(instant: string, zone: AnswerZone | null, lang: Lang): string {
    return dateLabel(localWall(instant, zone), lang);
  }
}
