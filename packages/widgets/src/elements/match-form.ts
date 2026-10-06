/**
 * `<kj-match-form>` — two birth forms and the Ashtakoot guna milan between them.
 *
 * The same shape as `<kj-kundli-form>`: no request until a visitor submits,
 * the form is the ready state, and a failed request is a state under a form
 * that stays. The two fieldsets are drawn by `birth-fields.ts`, so both forms
 * validate and build a birth the same way, and each side is remembered on the
 * device separately.
 *
 * The result: the total as a ring out of 36 with the verdict, each person's
 * Moon sign and nakshatra, the eight kootas with what each looks at, and the
 * Mangal dosha of each side. `POST /v1/match/ashtakoot` answers the match;
 * the two people's rashi and nakshatra come from `POST /v1/kundli` for each
 * birth — three calls a submit, all memoised, so an identical resubmit (or a
 * language switch, which only repaints) asks for nothing.
 */

import { cacheKey, memo } from '../core/cache.ts';
import { request } from '../core/client.ts';
import { getConfig, isOff, parseTimeFormat, type TimeFormat } from '../core/config.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { asKjError } from '../core/errors.ts';
import { msg, type Dict } from '../core/dict.ts';
import { pick } from '../core/i18n.ts';
import { wirePlaceSearch } from '../core/place-search.ts';
import { forget, recall, remember } from '../core/storage.ts';
import {
  badgeHtml,
  isPlanFailure,
  ringHtml,
  signHtml,
  skeletonHtml,
  tilesHtml,
  type Tile,
} from '../core/ui.ts';
import {
  applyBirthValues,
  birthFieldsHtml,
  birthSummary,
  buildBirth,
  collapsedHtml,
  emptyBirthValues,
  presetPlace,
  readBirthValues,
  restoreValues,
  revealResult,
  showErrors,
  showResolved,
  storedValues,
  type BirthError,
  type BirthValues,
} from './birth-fields.ts';
import type { KjBirth } from './chart.ts';
import type { Kundli } from './kundli-report.ts';
import matchCss from '../styles/match.css';
import {
  loadPdfKit,
  pdfEditions,
  pdfName,
  pdfTemplate,
  requestPdf,
  type PdfKit,
} from '../core/pdf-offer.ts';
import type { PdfState } from '../core/pdf.ts';

const MATCH_PATH = '/match/ashtakoot';
const KUNDLI_PATH = '/kundli';

/** The two sides, in the order the request and the markup put them. */
const SIDES = ['bride', 'groom'] as const;
type Side = (typeof SIDES)[number];

/** The most any Ashtakoot total can be. */
const MAX_TOTAL = 36;

/** An id with its names, as every entity in a response carries them. */
interface Named {
  id: string;
  name: string;
  names?: { en?: string; hi?: string };
}

/** As much of `POST /v1/match/ashtakoot` as the result reads. */
interface Ashtakoot {
  total?: number | null;
  /** An id (`average`); tolerated as an entity in case the API grows names. */
  verdict?: string | Named | null;
  kootas?: Koota[] | null;
  bride_mangal_dosha?: boolean | null;
  groom_mangal_dosha?: boolean | null;
  mangal_dosha_mismatch?: boolean | null;
}

interface Koota {
  koota?: Named | null;
  points?: number | null;
  max_points?: number | null;
  /** English only, and often null (`Sheep · Monkey`). */
  note?: string | null;
}

/** What `kj-submit` carries. */
export interface KjMatchPair {
  bride: KjBirth;
  groom: KjBirth;
}

/** `<kj-match-form>`'s own words (decision 24): the sides, the kootas, the verdicts. */
const MATCH: Dict<
  | 'bride'
  | 'groom'
  | 'ashtakoot'
  | 'total'
  | 'koota'
  | 'points'
  | 'mangal_dosha'
  | 'mangal_dosha_mismatch'
  | 'match_submit'
  | 'score_of'
  | 'guna_milan'
  | 'doshas'
  | 'manglik'
  | 'not_manglik'
  | 'meaning'
  | 'match_intro'
  | 'title_match'
  | 'koota_varna'
  | 'koota_vashya'
  | 'koota_tara'
  | 'koota_yoni'
  | 'koota_graha_maitri'
  | 'koota_gana'
  | 'koota_bhakoot'
  | 'koota_nadi'
  | 'verdict_excellent'
  | 'verdict_good'
  | 'verdict_average'
  | 'verdict_poor'
  | 'verdict_not_recommended'
> = {
  en: {
    bride: 'Bride',
    groom: 'Groom',
    ashtakoot: 'Ashtakoot',
    total: 'Total',
    koota: 'Koota',
    points: 'Points',
    mangal_dosha: 'Mangal dosha',
    mangal_dosha_mismatch: 'Only one of the two has Mangal dosha.',
    match_submit: 'Check compatibility',
    score_of: '{n} of 36',
    guna_milan: 'Guna milan',
    doshas: 'Doshas',
    manglik: 'Manglik',
    not_manglik: 'Not manglik',
    meaning: 'What it looks at',
    match_intro: 'Enter the birth details of both',
    title_match: 'Kundli milan',
    koota_varna: 'Temperament and outlook',
    koota_vashya: 'Mutual attraction and influence',
    koota_tara: 'Birth stars and wellbeing',
    koota_yoni: 'Physical compatibility',
    koota_graha_maitri: 'Friendship of the Moon-sign lords',
    koota_gana: 'Nature: deva, manushya or rakshasa',
    koota_bhakoot: 'Moon signs: family and prosperity',
    koota_nadi: 'Nadi: health and progeny',
    verdict_excellent: 'Excellent',
    verdict_good: 'Good',
    verdict_average: 'Average',
    verdict_poor: 'Poor',
    verdict_not_recommended: 'Not recommended',
  },
  hi: {
    bride: 'वधू',
    groom: 'वर',
    ashtakoot: 'अष्टकूट',
    total: 'कुल',
    koota: 'कूट',
    points: 'गुण',
    mangal_dosha: 'मांगलिक दोष',
    mangal_dosha_mismatch: 'दोनों में से केवल एक में मांगलिक दोष है।',
    match_submit: 'मिलान देखें',
    score_of: '36 में से {n}',
    guna_milan: 'गुण मिलान',
    doshas: 'दोष',
    manglik: 'मांगलिक',
    not_manglik: 'मांगलिक नहीं',
    meaning: 'क्या देखता है',
    match_intro: 'दोनों के जन्म विवरण भरें',
    title_match: 'कुंडली मिलान',
    koota_varna: 'स्वभाव और दृष्टिकोण',
    koota_vashya: 'परस्पर आकर्षण और प्रभाव',
    koota_tara: 'जन्म नक्षत्र और कल्याण',
    koota_yoni: 'शारीरिक अनुकूलता',
    koota_graha_maitri: 'राशि स्वामियों की मैत्री',
    koota_gana: 'गण: देव, मनुष्य या राक्षस',
    koota_bhakoot: 'राशि: परिवार और समृद्धि',
    koota_nadi: 'नाड़ी: स्वास्थ्य और संतान',
    verdict_excellent: 'उत्तम',
    verdict_good: 'अच्छा',
    verdict_average: 'मध्यम',
    verdict_poor: 'कमज़ोर',
    verdict_not_recommended: 'अनुशंसित नहीं',
  },
};

type MatchKey = keyof (typeof MATCH)['en'];

/**
 * A guna milan verdict id (`average`, `not_recommended`) in `lang`; an
 * unknown id passes through as it came, so a new verdict shows in English
 * rather than vanishing.
 */
function translateVerdict(raw: string | null | undefined, lang: 'en' | 'hi'): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const key = `verdict_${trimmed.toLowerCase().replace(/[\s_-]+/g, '_')}` as MatchKey;
  return key in MATCH.en ? msg(MATCH, lang, key) : trimmed;
}

/** The eight kootas' short meanings, ours to write. */
const KOOTA_MEANINGS = new Set([
  'varna',
  'vashya',
  'tara',
  'yoni',
  'graha_maitri',
  'gana',
  'bhakoot',
  'nadi',
]);

/** @see KjElement */
export class KjMatchForm extends KjElement {
  static readonly tag = 'kj-match-form';

  static override styles = matchCss;

  /** A word from this widget's own dictionary. */
  private m(key: MatchKey, vars?: Record<string, string>): string {
    return msg(MATCH, this.activeLang, key, vars);
  }

  static readonly observedAttributes = ['city', 'time-format', 'lang', 'powered-by'];

  /** Survives a repaint, so a language switch does not empty the fields. */
  private values: Record<Side, BirthValues> = {
    bride: emptyBirthValues(),
    groom: emptyBirthValues(),
  };

  private errors: Record<Side, Set<BirthError>> = { bride: new Set(), groom: new Set() };

  private result: Ashtakoot | null = null;
  private resultState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  /** Each side's `/v1/kundli`, for its rashi and nakshatra; absent until it lands. */
  private people: Partial<Record<Side, Kundli>> = {};

  /** The names as they were at the last accepted submit. */
  private names: Record<Side, string> = { bride: '', groom: '' };

  /** The births of the last accepted submit, for the collapsed summary. */
  private pair: KjMatchPair | null = null;

  /** Whether the form is folded into its summary (after a submit). */
  private collapsed = false;

  private restored = false;
  private prepared = false;

  /** Which run's answer is current, so a slow submit cannot overwrite a fast one. */
  private submitRun = 0;

  /** The "Download PDF" bar's state, per pair. */
  private pdfState: PdfState = { status: 'idle' };

  /** `pdf.ts`, once a bar has been asked for (decision 27). */
  private pdfKit: PdfKit | null = null;

  private listening = false;

  override connectedCallback(): void {
    // Delegated, as in the kundli form: `render()` replaces the markup on
    // every repaint and these outlive it.
    if (!this.listening) {
      this.listening = true;
      wirePlaceSearch(this.root, this, () => this.activeLang);
      this.root.addEventListener('submit', (event) => {
        event.preventDefault();
        void this.onSubmit();
      });
      this.root.addEventListener('input', (event) => this.onInput(event));
      this.root.addEventListener('change', (event) => this.onInput(event));
      this.root.addEventListener('click', (event) => {
        const action = (event.target as Element | null)?.closest?.<HTMLElement>('[data-action]');
        if (action?.dataset.action === 'clear') this.clearForm();
        else if (action?.dataset.action === 'edit') this.expandForm();
        else if (action?.dataset.action === 'pdf') void this.onPdf();
      });
    }
    if (!this.prepared) {
      this.prepared = true;
      this.prepareValues();
    }
    super.connectedCallback();
  }

  private get timeFormat(): TimeFormat {
    return parseTimeFormat(this.getAttribute('time-format')) ?? getConfig().timeFormat;
  }

  private get remembers(): boolean {
    return getConfig().remember && !isOff(this.getAttribute('remember'));
  }

  /** Each side's last entry on this device, else the `city` attribute's place. */
  private prepareValues(): void {
    for (const side of SIDES) {
      const slot = `match-${side}`;
      const stored = this.remembers ? recall(slot) : null;
      if (!this.remembers) forget(slot);
      if (stored) {
        restoreValues(this.values[side], stored, this.timeFormat);
        this.restored = true;
      } else {
        presetPlace(this.values[side], this.getAttribute('city'), this.activeLang);
      }
    }
  }

  /** Never called: {@link load} is overridden. @see KjKundliForm */
  protected override fetchData(): Promise<unknown> {
    return Promise.resolve(null);
  }

  /** Straight to the ready state, with no `kj-ready`. */
  protected override load(): Promise<void> {
    this.state = 'ready';
    this.paint();
    return Promise.resolve();
  }

  protected override heading(): { title: string; subtitle?: string } {
    return { title: this.m('title_match'), subtitle: this.m('match_intro') };
  }

  protected override render(): string {
    return html`${trusted(this.formHtml())}
      <div data-result>${trusted(this.resultHtml())}</div>`;
  }

  protected override paint(): void {
    super.paint();
    if (this.state !== 'ready') return;
    for (const side of SIDES) {
      const scope = this.scope(side);
      if (scope) {
        applyBirthValues(scope, this.values[side], this.activeLang);
        showErrors(scope, this.errors[side], this.activeLang);
      }
    }
  }

  /** Only the result: an answer landing does not repaint the fields under a caret. */
  private refreshResult(): void {
    const slot = this.root.querySelector('[data-result]');
    if (slot) slot.innerHTML = this.resultHtml();
    else this.paint();
  }

  private scope(side: Side): Element | null {
    return this.root.querySelector(`[data-side="${side}"]`);
  }

  private formHtml(): string {
    const lang = this.activeLang;
    const fieldsets = SIDES.map(
      (side) =>
        html`<fieldset class="kj-side" data-side="${side}" part="${side}">
          <legend>${this.m(side)}</legend>
          <div class="kj-form kj-form-grid">
            ${trusted(birthFieldsHtml(`kj-${side}`, lang, this.timeFormat))}
          </div>
        </fieldset>`,
    ).join('');
    const remembered = this.restored
      ? html`<p class="kj-remembered" part="remembered">
          ${this.t('remembered')}
          <button type="button" class="kj-link-btn" data-action="clear">
            ${this.t('clear_form')}
          </button>
        </p>`
      : '';
    const pair = this.pair;
    const summary =
      this.collapsed && pair
        ? collapsedHtml(
            SIDES.map(
              (side) => `${this.m(side)}: ${birthSummary(this.names[side], pair[side], lang)}`,
            ),
            lang,
          )
        : '';
    return html`${trusted(summary)}
      <form class="kj-form" part="form" novalidate ${trusted(this.collapsed ? 'hidden' : '')}>
        <div class="kj-pair">${trusted(fieldsets)}</div>
        ${trusted(remembered)}
        <div class="kj-actions">
          <button class="kj-btn" type="submit" part="submit">${this.m('match_submit')}</button>
        </div>
      </form>`;
  }

  private resultHtml(): string {
    if (this.resultState === 'idle') return '';
    let body: string;
    if (this.resultState === 'loading') body = skeletonHtml('report', this.t('loading'));
    else if (this.resultState === 'error') body = this.errorHtml();
    else body = this.result ? this.matchHtml(this.result) : '';
    return html`<section class="kj-result" part="result" aria-live="polite">
      ${trusted(body)}
    </section>`;
  }

  private matchHtml(match: Ashtakoot): string {
    const lang = this.activeLang;
    const total = typeof match.total === 'number' ? match.total : 0;
    const tone = total >= 25 ? 'kj-good' : total >= 18 ? 'kj-mid' : 'kj-bad';
    const verdictId = typeof match.verdict === 'string' ? match.verdict : match.verdict?.id;
    const verdict = translateVerdict(verdictId, lang);
    const names = SIDES.map((side) => this.names[side] || this.m(side)).join(' · ');

    const score = html`<div class="kj-score" part="score">
      ${trusted(
        ringHtml(total, MAX_TOTAL, tone, this.m('total'), this.m('score_of', { n: '' }).trim()),
      )}
      <div class="kj-score-text">
        <p class="kj-muted" part="names">${names}</p>
        ${verdict ? trusted(html`<p class="kj-verdict ${tone}" part="verdict">${verdict}</p>`) : ''}
        <p part="heading">
          ${this.m('guna_milan')} (${this.m('ashtakoot')}):
          <strong>${this.m('score_of', { n: points(total) })}</strong>
        </p>
      </div>
    </div>`;

    const pdf = this.pdfBar('match');

    return score + pdf + this.peopleHtml() + this.kootasHtml(match) + this.doshasHtml(match);
  }

  /** Each person's Moon sign and nakshatra, once their kundli has landed. */
  private peopleHtml(): string {
    const lang = this.activeLang;
    const tiles: Tile[] = SIDES.flatMap((side): Tile[] => {
      const kundli = this.people[side];
      if (!kundli) return [];
      const moon = kundli.moon_sign;
      const nakshatra = kundli.moon_nakshatra;
      const pada = kundli.panchang?.pada ?? kundli.positions?.moon?.pada;
      return [
        {
          key: side,
          label: this.names[side] || this.m(side),
          value: signHtml(moon?.id, pick(moon?.names, moon?.name ?? '—', lang), 'm'),
          sub: html`${pick(nakshatra?.names, nakshatra?.name ?? '—', lang)}${
            pada ? ` · ${this.t('pada')} ${pada}` : ''
          }`,
        },
      ];
    });
    if (!tiles.length) return '';
    return html`<section class="kj-section" part="people">
      <h3 class="kj-h3">${this.t('moonsign')} · ${this.t('nakshatra')}</h3>
      ${trusted(tilesHtml(tiles, 'people'))}
    </section>`;
  }

  private kootasHtml(match: Ashtakoot): string {
    const lang = this.activeLang;
    const rows = (match.kootas ?? [])
      .map((row) => {
        const koota = row.koota;
        const id = koota?.id ?? '';
        const max = row.max_points ?? 0;
        const got = row.points ?? 0;
        const share = max > 0 ? Math.max(0, Math.min(100, (got / max) * 100)) : 0;
        const tone = share >= 75 ? 'kj-good' : share >= 34 ? 'kj-mid' : 'kj-bad';
        const meaning = KOOTA_MEANINGS.has(id) ? this.m(`koota_${id}` as MatchKey) : '';
        return html`<tr part="koota koota-${id}">
          <th scope="row">${pick(koota?.names, koota?.name ?? (id || '—'), lang)}</th>
          <td class="kj-num">
            <span class="kj-row">
              <span class="kj-bar ${tone}" aria-hidden="true"
                ><span style="width:${share.toFixed(0)}%"></span
              ></span>
              <span>${points(row.points)} / ${points(row.max_points)}</span>
            </span>
          </td>
          <td class="kj-wrap">
            ${meaning}${row.note ? trusted(html` <span class="kj-muted">(${row.note})</span>`) : ''}
          </td>
        </tr>`;
      })
      .join('');
    if (!rows) return '';
    return html`<section class="kj-section">
      <div class="kj-table-wrap">
        <table class="kj-table" part="kootas">
          <thead>
            <tr>
              <th scope="col">${this.m('koota')}</th>
              <th scope="col" class="kj-num">${this.m('points')}</th>
              <th scope="col">${this.m('meaning')}</th>
            </tr>
          </thead>
          <tbody>
            ${trusted(rows)}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  private doshasHtml(match: Ashtakoot): string {
    const side = (who: Side, value: boolean | null | undefined) =>
      html`<li class="kj-chip" part="mangal-${who}">
        <strong>${this.names[who] || this.m(who)}</strong>
        ${trusted(
          value ? badgeHtml(this.m('manglik'), 'care') : badgeHtml(this.m('not_manglik'), 'good'),
        )}
      </li>`;
    const warning = match.mangal_dosha_mismatch
      ? html`<p class="kj-notice" part="mangal-warning" role="note">
          ${this.m('mangal_dosha_mismatch')}
        </p>`
      : '';
    return html`<section class="kj-section" part="mangal">
      <h3 class="kj-h3">${this.m('doshas')} · ${this.m('mangal_dosha')}</h3>
      <ul class="kj-chips">
        ${trusted(side('bride', match.bride_mangal_dosha))}
        ${trusted(side('groom', match.groom_mangal_dosha))}
      </ul>
      ${trusted(warning)}
    </section>`;
  }

  /** Keep {@link values} current, the resolved place lines, and clear a fixed error. */
  private onInput(event: Event): void {
    for (const side of SIDES) {
      const scope = this.scope(side);
      if (!scope) continue;
      readBirthValues(scope, this.values[side]);
      showResolved(scope, this.values[side], this.activeLang);
    }
    const target = event.target as Element | null;
    const side = target?.closest?.<HTMLElement>('[data-side]')?.dataset.side as Side | undefined;
    const group = target?.closest?.<HTMLElement>('[data-group]')?.dataset.group as
      BirthError | undefined;
    if (side && group && this.errors[side]?.delete(group)) {
      const scope = this.scope(side);
      if (scope) showErrors(scope, this.errors[side], this.activeLang);
    }
  }

  /** "Edit details": both forms again, the focus in the first field. */
  private expandForm(): void {
    this.collapsed = false;
    this.paint();
    this.root.querySelector<HTMLElement>('form [data-field]')?.focus();
  }

  private clearForm(): void {
    for (const side of SIDES) {
      this.values[side] = emptyBirthValues();
      this.errors[side].clear();
      forget(`match-${side}`);
    }
    this.restored = false;
    this.paint();
  }

  private async onSubmit(): Promise<void> {
    const format = this.timeFormat;
    const built: Partial<Record<Side, KjBirth>> = {};
    for (const side of SIDES) {
      const scope = this.scope(side);
      if (scope) readBirthValues(scope, this.values[side]);
      const result = buildBirth(this.values[side], format);
      this.errors[side] = result.errors ?? new Set();
      if (result.birth) built[side] = result.birth;
      if (scope) showErrors(scope, this.errors[side], this.activeLang);
    }
    const bride = built.bride;
    const groom = built.groom;
    if (!bride || !groom) {
      this.root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    this.names = { bride: this.values.bride.name.trim(), groom: this.values.groom.name.trim() };
    if (this.remembers) {
      for (const side of SIDES) {
        remember(`match-${side}`, storedValues(this.values[side], format));
      }
    }
    const pair: KjMatchPair = { bride, groom };
    this.dispatchEvent(
      new CustomEvent('kj-submit', { detail: pair, bubbles: true, composed: true }),
    );

    const run = ++this.submitRun;
    this.pdfState = { status: 'idle' };
    this.resultState = 'loading';
    this.failure = null;
    this.people = {};
    this.pair = pair;
    this.collapsed = true;
    this.paint();
    revealResult(this.root);

    // The people's signs, alongside and never in the way: a failure there
    // leaves the match as it is.
    for (const side of SIDES) {
      const body = { birth: pair[side], options: { language: ['en', 'hi'] } };
      memo(cacheKey(KUNDLI_PATH, body), () => request<Kundli>(KUNDLI_PATH, body)).then(
        (answer) => {
          if (run !== this.submitRun) return;
          this.people[side] = answer.data;
          if (this.resultState === 'ready') this.refreshResult();
        },
        () => undefined,
      );
    }

    const body = { bride, groom, options: { language: ['en', 'hi'] } };
    try {
      const answer = await memo(cacheKey(MATCH_PATH, body), () =>
        request<Ashtakoot>(MATCH_PATH, body),
      );
      if (run !== this.submitRun) return;
      this.result = answer.data;
      this.resultState = 'ready';
      this.refreshResult();
      this.repaintFooter();
      this.dispatchEvent(
        new CustomEvent('kj-ready', { detail: answer.data, bubbles: true, composed: true }),
      );
    } catch (thrown) {
      if (run !== this.submitRun) return;
      this.result = null;
      this.failure = asKjError(thrown);
      this.resultState = 'error';
      this.refreshResult();
      this.dispatchEvent(
        new CustomEvent('kj-error', { detail: this.failure, bubbles: true, composed: true }),
      );
    }
  }

  /**
   * The PDF bar, when this page's proxy relays PDFs; the first time, the
   * module that draws it is loaded and the result repainted when it lands.
   */
  private pdfBar(kind: 'kundli' | 'match'): string {
    const editions = pdfEditions(this);
    if (!editions.length) return '';
    if (this.pdfKit) {
      const error = this.pdfState.error;
      const planCard = error && isPlanFailure(error) ? this.errorHtml(error) : '';
      return this.pdfKit.pdfBarHtml(kind, editions, this.pdfState, this.activeLang, planCard);
    }
    void loadPdfKit().then((kit) => {
      if (this.pdfKit) return;
      this.pdfKit = kit;
      this.refreshResult();
    });
    return '';
  }

  /**
   * "Download PDF": both births, the names for the cover, the language chosen
   * on the bar, through the site's proxy (decision 27). The match PDF has no
   * edition.
   */
  private async onPdf(): Promise<void> {
    const pair = this.pair;
    if (!pair || this.resultState !== 'ready' || this.pdfState.status === 'loading') return;
    const editions = pdfEditions(this);
    if (!editions.length) return;
    const kit = this.pdfKit;
    if (!kit) return;
    const choice = kit.readPdfChoice(this.root, editions, this.activeLang);
    const run = this.submitRun;
    this.pdfState = { status: 'loading', choice };
    this.refreshResult();

    const name = pdfName(this.names.bride);
    const partner = pdfName(this.names.groom);
    const template = pdfTemplate(this);
    const body = {
      bride: pair.bride,
      groom: pair.groom,
      options: { language: choice.lang },
      ...(name ? { name } : {}),
      ...(partner ? { partner_name: partner } : {}),
      ...(template ? { template } : {}),
    };
    try {
      const file = await requestPdf(this, kit, '/pdf/match', body, 'match.pdf');
      if (run !== this.submitRun) return;
      kit.savePdf(file.blob, file.filename);
      this.pdfState = { status: 'saved', choice };
    } catch (thrown) {
      if (run !== this.submitRun) return;
      const error = asKjError(thrown);
      this.pdfState = { status: 'error', error, choice };
      this.dispatchEvent(
        new CustomEvent('kj-error', { detail: error, bubbles: true, composed: true }),
      );
    }
    this.refreshResult();
  }
}

/** `19`, `1.5`: a guna count as the engine scored it, without float noise. */
function points(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return String(Math.round(value * 100) / 100);
}
