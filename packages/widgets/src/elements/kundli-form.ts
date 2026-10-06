/**
 * `<kj-kundli-form>` — a birth form, and a tabbed mini-report for the birth
 * it is given (integrations revamp §3).
 *
 * The form is the element's ready state and makes no request; a submit
 * starts a report under it. The report is tabs — Overview, Charts, Planets,
 * Dasha, Life areas, and Readings when `readings` asks for them — and each
 * tab asks for its own answers the first time it is opened, except Overview,
 * which opens first. So a visitor who only reads the overview costs the site
 * three calls, not a dozen. `kundli-report.ts` draws each tab.
 *
 * A tab whose request is refused (the Life areas report costs 5 credits, and
 * the month's may have run out) shows the monthly-limit state in its own
 * panel; the rest of the report is untouched. Nothing is ever a raw error.
 *
 * The report is repainted on its own when an answer lands, not with the
 * form: a visitor who starts typing a second birth while the first loads
 * keeps their caret.
 *
 * `show="summary chart"` from 0.1.0 still works: `summary` is the Overview
 * and Planets tabs, `chart` the Charts tab. `tabs` is the new spelling.
 */

import { cacheKey, memo } from '../core/cache.ts';
import { request } from '../core/client.ts';
import { getConfig, isOff, parseTimeFormat, type TimeFormat } from '../core/config.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { asKjError, type KjError } from '../core/errors.ts';
import type { Lang, MessageKey } from '../core/i18n.ts';
import { wirePlaceSearch } from '../core/place-search.ts';
import {
  DISCLAIMER_ATTRIBUTES,
  LANGUAGES,
  disclaimerHtml,
  reportOptions,
} from '../core/reports.ts';
import { forget, recall, remember } from '../core/storage.ts';
import {
  isPlanFailure,
  segmentedHtml,
  skeletonHtml,
  stateHtml,
  tabPanelHtml,
  tabsHtml,
  wireChoices,
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
import { KjChart, type KjBirth } from './chart.ts';
import {
  birthLine,
  chalitHtml,
  dashaHtml,
  lagnaAboutHtml,
  lifeAreasHtml,
  overviewTilesHtml,
  planetsTableHtml,
  yogaChipsHtml,
  type ChalitDoc,
  type DashaDoc,
  type Kundli,
  type PaceDoc,
  type ReportDoc,
  type Slice,
  type VargasDoc,
} from './kundli-report.ts';
import { KjReading } from './reading.ts';
import {
  loadPdfKit,
  pdfEditions,
  pdfName,
  pdfTemplate,
  requestPdf,
  type PdfKit,
} from '../core/pdf-offer.ts';
import type { PdfState } from '../core/pdf.ts';
import reportCss from '../styles/report.css';

/** The tabs, in the order they are drawn. */
const TABS = ['overview', 'charts', 'planets', 'dasha', 'life', 'readings'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, MessageKey> = {
  overview: 'tab_overview',
  charts: 'tab_charts',
  planets: 'tab_planets',
  dasha: 'tab_dasha',
  life: 'tab_life',
  readings: 'tab_readings',
};

/** What a word in `tabs` (or 0.1.0's `show`) turns on. */
const TAB_WORDS: Record<string, Tab[]> = {
  overview: ['overview'],
  summary: ['overview', 'planets'],
  chart: ['charts'],
  charts: ['charts'],
  planets: ['planets'],
  dasha: ['dasha'],
  dashas: ['dasha'],
  life: ['life'],
  lifeareas: ['life'],
  areas: ['life'],
  readings: ['readings'],
};

/** The charts the Charts tab switches between. */
const CHARTS = ['d1', 'd9', 'moon', 'chalit'] as const;
type ChartId = (typeof CHARTS)[number];

const CHART_LABELS: Record<ChartId, MessageKey> = {
  d1: 'chart_d1',
  d9: 'chart_d9',
  moon: 'chart_moon',
  chalit: 'chart_chalit',
};

/** The readings `readings` can ask for, in the order they are drawn. */
const READINGS = [
  'lagna',
  'nakshatra',
  'house_lords',
  'grahas',
  'yogas',
  'vimshottari',
  'varshphal',
  'life_areas',
] as const;

/** What a bare `readings` draws. */
const DEFAULT_READINGS = ['lagna', 'nakshatra'] as const;

/** The answers a report is made of, and the route and body of each. */
type SliceName = 'kundli' | 'dasha' | 'lagna' | 'pace' | 'vargas' | 'chalit' | 'life';

/** Answers that only add badges: a failure is not worth an event or a state. */
const QUIET: ReadonlySet<SliceName> = new Set(['pace', 'vargas']);

/** Where the remembered entry lives. */
const SLOT = 'kundli';

/** @see KjElement */
export class KjKundliForm extends KjElement {
  static readonly tag = 'kj-kundli-form';

  static override styles = reportCss;

  /**
   * `style` is deliberately not observed: on this element it is the host's
   * own CSS as often as it is the chart's drawing. `chart-style` is the
   * observed spelling; a `style="north"` is still read at submit time.
   */
  static readonly observedAttributes = [
    'tabs',
    'show',
    'city',
    'chart-style',
    'size',
    'readings',
    'time-format',
    ...DISCLAIMER_ATTRIBUTES,
    'lang',
    'powered-by',
  ];

  /** Survives a repaint, so a language switch does not empty the fields. */
  private values: BirthValues = emptyBirthValues();

  private errors = new Set<BirthError>();

  /** The birth of the last accepted submit, and the name given with it. */
  private birth: KjBirth | null = null;
  private personName = '';

  private tab: Tab = 'overview';
  private chartId: ChartId = 'd1';

  /** This birth's answers, by name; cleared by each submit. */
  private slices = new Map<SliceName, Slice<unknown>>();

  /** Whether the form is folded into its one-line summary (after a submit). */
  private collapsed = false;

  /** Whether the fields were filled from this device's last entry. */
  private restored = false;
  private prepared = false;

  /** Kept across repaints so a chart is not re-requested on every render. */
  private chart: KjChart | null = null;
  private readonly readingElements = new Map<string, KjReading>();

  /** Which submit's answers are current, so a slow one cannot overwrite a fast one. */
  private submitRun = 0;

  /** Whether the tables module has been asked for. */
  private tablesLoaded = false;

  /** The "Download PDF" bar's state, per birth. */
  private pdfState: PdfState = { status: 'idle' };

  /** `pdf.ts`, once a bar has been asked for (decision 27). */
  private pdfKit: PdfKit | null = null;

  private listening = false;

  override connectedCallback(): void {
    // One set of listeners on the shadow root, not on the markup: `render()`
    // replaces the form on every repaint, and delegated listeners outlive it.
    if (!this.listening) {
      this.listening = true;
      // First, so a typed coordinate has dropped the picked zone before the
      // fields are read.
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
      wireChoices(this.root, (group, id) => this.onChoice(group, id));
    }
    if (!this.prepared) {
      this.prepared = true;
      this.prepareValues();
    }
    super.connectedCallback();
  }

  /** The form's time fields: its attribute, else the page's. */
  private get timeFormat(): TimeFormat {
    return parseTimeFormat(this.getAttribute('time-format')) ?? getConfig().timeFormat;
  }

  /** Whether the last entry is remembered on this device. */
  private get remembers(): boolean {
    return getConfig().remember && !isOff(this.getAttribute('remember'));
  }

  /** The last entry on this device, else the `city` attribute's place. */
  private prepareValues(): void {
    if (this.remembers) {
      const stored = recall(SLOT);
      if (stored) {
        restoreValues(this.values, stored, this.timeFormat);
        this.restored = true;
        return;
      }
    } else {
      forget(SLOT);
    }
    presetPlace(this.values, this.getAttribute('city'), this.activeLang);
  }

  /** Nothing to ask for until a visitor submits. Never called: see {@link load}. */
  protected override fetchData(): Promise<unknown> {
    return Promise.resolve(null);
  }

  /**
   * Straight to the ready state, with no `kj-ready`: `kj-ready` here means
   * the kundli arrived, and the form alone is not an answer.
   */
  protected override load(): Promise<void> {
    this.state = 'ready';
    this.paint();
    return Promise.resolve();
  }

  protected override heading(): { title: string; subtitle?: string } {
    return { title: this.t('title_kundli'), subtitle: this.t('form_intro') };
  }

  protected override footerNote(): string {
    const lang = this.activeLang;
    for (const name of ['lagna', 'life'] as const) {
      const doc = this.slices.get(name)?.data as ReportDoc | undefined;
      if (doc?.disclaimer) return disclaimerHtml(doc.disclaimer, lang);
    }
    return '';
  }

  protected override render(): string {
    return html`${trusted(this.formHtml())}
      <div data-result>${trusted(this.resultHtml())}</div>`;
  }

  /**
   * The DOM the markup cannot carry: the field values a visitor typed, the
   * validation marks, and the inner `<kj-chart>` and `<kj-reading>`s, which
   * are objects and not strings.
   */
  protected override paint(): void {
    super.paint();
    if (this.state !== 'ready') return;
    const form = this.root.querySelector('form');
    if (form) {
      applyBirthValues(form, this.values, this.activeLang);
      showErrors(form, this.errors, this.activeLang);
    }
    this.mountInner();
  }

  /** Only the report, and the footer that carries its disclaimer. */
  private refreshResult(): void {
    const slot = this.root.querySelector('[data-result]');
    if (!slot) {
      this.paint();
      return;
    }
    // An answer landing must not take the focus off the tab bar under a
    // keyboard user: whatever had it (by id) gets it back.
    let focused: string | undefined;
    try {
      focused = (this.root.activeElement as HTMLElement | null)?.id;
    } catch {
      // A detached element has no focus to keep.
    }
    slot.innerHTML = this.resultHtml();
    this.repaintFooter();
    this.mountInner();
    if (focused)
      this.root.querySelector<HTMLElement>(`[id="${focused}"]`)?.focus({ preventScroll: true });
  }

  /** The tabs this page asked for, in their drawing order. */
  private get tabs(): Tab[] {
    const raw = (this.getAttribute('tabs') ?? this.getAttribute('show') ?? '').toLowerCase();
    const asked = new Set<Tab>();
    for (const word of raw.split(/[\s,]+/)) {
      for (const tab of TAB_WORDS[word.replace(/[-_]/g, '')] ?? []) asked.add(tab);
    }
    if (this.readings.length) asked.add('readings');
    const chosen = TABS.filter((tab) => asked.has(tab) && tab !== 'readings');
    const base = chosen.length ? chosen : TABS.filter((tab) => tab !== 'readings');
    return asked.has('readings') ? [...base, 'readings'] : base;
  }

  /**
   * Nothing without the attribute; `readings` alone is the lagna and the
   * nakshatra; a list (spaces or commas) keeps the types it names, in the
   * order they are drawn, and one that names none of them is the two again.
   */
  private get readings(): string[] {
    const raw = this.getAttribute('readings');
    if (raw === null || isOff(raw)) return [];
    const asked = raw
      .toLowerCase()
      .replace(/-/g, '_')
      .split(/[\s,]+/);
    const kept = READINGS.filter((type) => asked.includes(type));
    return kept.length ? kept : [...DEFAULT_READINGS];
  }

  private formHtml(): string {
    const lang = this.activeLang;
    const remembered = this.restored
      ? html`<p class="kj-remembered kj-span" part="remembered">
          ${this.t('remembered')}
          <button type="button" class="kj-link-btn" data-action="clear">
            ${this.t('clear_form')}
          </button>
        </p>`
      : '';
    const summary =
      this.collapsed && this.birth
        ? collapsedHtml([birthSummary(this.personName, this.birth, lang)], lang)
        : '';
    return html`${trusted(summary)}
      <form
        class="kj-form kj-form-grid"
        part="form"
        novalidate
        ${trusted(this.collapsed ? 'hidden' : '')}
      >
        ${trusted(birthFieldsHtml('kj', lang, this.timeFormat))} ${trusted(remembered)}
        <div class="kj-actions kj-span">
          <button class="kj-btn" type="submit" part="submit">${this.t('submit')}</button>
        </div>
      </form>`;
  }

  // -------------------------------------------------------------------------
  // The report
  // -------------------------------------------------------------------------

  private resultHtml(): string {
    const birth = this.birth;
    if (!birth) return '';
    const lang = this.activeLang;
    const tabs = this.tabs;
    if (!tabs.includes(this.tab)) this.tab = tabs[0] ?? 'overview';
    const kundli = this.slices.get('kundli')?.data as Kundli | undefined;

    const head = html`<div class="kj-result-head" part="result-head">
      <p class="kj-result-name" part="name">${this.personName || this.t('title_kundli')}</p>
      <p class="kj-sub" part="birth">${birthLine(birth, lang, kundli?.birth?.place_name)}</p>
    </div>`;

    const bar =
      tabs.length > 1
        ? tabsHtml(
            'kundli',
            this.t('report_tabs'),
            tabs.map((tab) => ({ id: tab, label: this.t(TAB_LABELS[tab]) })),
            this.tab,
          )
        : '';

    const pdf = this.pdfBar('kundli');

    return html`<section class="kj-result" part="result" aria-live="polite">
      ${trusted(head)} ${trusted(pdf)} ${trusted(bar)}
      ${trusted(tabs.length > 1 ? tabPanelHtml('kundli', this.tab, this.tabHtml(this.tab)) : this.tabHtml(this.tab))}
    </section>`;
  }

  /** A slice's state as markup: skeleton, error, plan-required, or `ready`. */
  private sliceState(
    name: SliceName,
    shape: 'report' | 'table' | 'lines' | 'chart',
  ): string | null {
    const slice = this.slices.get(name);
    if (!slice || slice.state === 'loading') return skeletonHtml(shape, this.t('loading'));
    if (slice.state === 'error') return this.errorHtml(slice.error as KjError);
    return null;
  }

  private tabHtml(tab: Tab): string {
    const lang = this.activeLang;
    switch (tab) {
      case 'overview': {
        const pending = this.sliceState('kundli', 'report');
        if (pending) return pending;
        const kundli = this.slices.get('kundli')?.data as Kundli;
        const lagna = this.slices.get('lagna');
        const about =
          lagna?.state === 'ready'
            ? lagnaAboutHtml(lagna.data as ReportDoc, lang)
            : lagna?.state === 'error'
              ? html`<section class="kj-section">
                  ${trusted(this.errorHtml(lagna.error as KjError))}
                </section>`
              : html`<section class="kj-section">
                  ${trusted(skeletonHtml('lines', this.t('loading')))}
                </section>`;
        return (
          overviewTilesHtml(kundli, this.slices.get('dasha') as Slice<DashaDoc>, lang) +
          yogaChipsHtml(kundli, lang) +
          about
        );
      }
      case 'charts': {
        const which = segmentedHtml(
          'kundli-chart',
          this.t('chart_which'),
          CHARTS.map((id) => ({ id, label: this.t(CHART_LABELS[id]) })),
          this.chartId,
        );
        const body =
          this.chartId === 'chalit'
            ? (this.sliceState('chalit', 'table') ??
              chalitHtml(this.slices.get('chalit')?.data as ChalitDoc, lang))
            : '<div class="kj-slot" data-chart-slot></div>';
        return html`<div class="kj-controls">${trusted(which)}</div>
          ${trusted(body)}`;
      }
      case 'planets': {
        const pending = this.sliceState('kundli', 'table');
        if (pending) return pending;
        return planetsTableHtml(
          this.slices.get('kundli')?.data as Kundli,
          this.slices.get('pace')?.data as PaceDoc | undefined,
          this.slices.get('vargas')?.data as VargasDoc | undefined,
          lang,
        );
      }
      case 'dasha': {
        const pending = this.sliceState('dasha', 'table');
        if (pending) return pending;
        return (
          dashaHtml(this.slices.get('dasha') as Slice<DashaDoc>, lang) ||
          stateHtml({ kind: 'empty', body: this.t('nothing_here') })
        );
      }
      case 'life': {
        const pending = this.sliceState('life', 'report');
        if (pending) return pending;
        return lifeAreasHtml(this.slices.get('life')?.data as ReportDoc, lang);
      }
      case 'readings':
        return '<div class="kj-slot kj-readings" data-readings-slot></div>';
    }
  }

  /** The answers a tab is drawn from; each asked for once per birth. */
  private openTab(tab: Tab): void {
    const needs: Record<Tab, SliceName[]> = {
      overview: ['kundli', 'dasha', 'lagna'],
      charts: this.chartId === 'chalit' ? ['chalit'] : [],
      planets: ['kundli', 'pace', 'vargas'],
      dasha: ['dasha'],
      life: ['life'],
      readings: [],
    };
    for (const name of needs[tab]) this.need(name);
  }

  /** The route and body of one answer. */
  private requestFor(name: SliceName, birth: KjBirth): { path: string; body: unknown } {
    const options = { language: LANGUAGES };
    switch (name) {
      case 'kundli':
        // The same body 0.1.0 sent, so a page memo shared with it still hits.
        return { path: '/kundli', body: { birth, options: { language: ['en', 'hi'] } } };
      case 'dasha':
        return {
          path: '/kundli/dasha',
          body: { birth, system: 'vimshottari', levels: 2, options },
        };
      case 'lagna':
        return { path: '/reports/lagna', body: { birth, options: reportOptions(this) } };
      case 'pace':
        return { path: '/kundli/pace', body: { birth, options } };
      case 'vargas':
        return { path: '/kundli/vargas', body: { birth, vargas: ['d1', 'd9'], options } };
      case 'chalit':
        return { path: '/kundli/chalit', body: { birth, system: 'sripati', options } };
      case 'life':
        return { path: '/reports/life-areas', body: { birth, options: reportOptions(this) } };
    }
  }

  /** Start one answer for the current birth, unless it is already asked for. */
  private need(name: SliceName): void {
    const birth = this.birth;
    if (!birth || this.slices.has(name)) return;
    this.slices.set(name, { state: 'loading' });
    const run = this.submitRun;
    const { path, body } = this.requestFor(name, birth);
    memo(cacheKey(path, body), () => request<unknown>(path, body)).then(
      (answer) => {
        if (run !== this.submitRun) return;
        const zone = (answer.meta as { timezone?: Slice<unknown>['zone'] } | null)?.timezone;
        this.slices.set(name, { state: 'ready', data: answer.data, zone: zone ?? null });
        this.refreshResult();
        if (name === 'kundli') this.emitEvent('kj-ready', answer.data);
      },
      (thrown: unknown) => {
        if (run !== this.submitRun) return;
        const error = asKjError(thrown);
        this.slices.set(name, { state: 'error', error });
        this.refreshResult();
        if (!QUIET.has(name)) this.emitEvent('kj-error', error);
      },
    );
  }

  private emitEvent(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  /** Keep {@link values} current, the resolved place line, and clear a fixed error. */
  private onInput(event: Event): void {
    const form = this.root.querySelector('form');
    if (!form) return;
    readBirthValues(form, this.values);
    showResolved(form, this.values, this.activeLang);
    const group = (event.target as Element | null)?.closest?.<HTMLElement>('[data-group]')?.dataset
      .group as BirthError | undefined;
    if (group && this.errors.delete(group)) showErrors(form, this.errors, this.activeLang);
  }

  /** A tab, or the chart switch inside the Charts tab. */
  private onChoice(group: string, id: string): void {
    if (group === 'kundli' && (TABS as readonly string[]).includes(id)) {
      this.tab = id as Tab;
      this.openTab(this.tab);
      this.refreshResult();
    } else if (group === 'kundli-chart' && (CHARTS as readonly string[]).includes(id)) {
      this.chartId = id as ChartId;
      this.openTab('charts');
      this.refreshResult();
    }
  }

  /** "Edit details": the form again, with the focus in its first field. */
  private expandForm(): void {
    this.collapsed = false;
    this.paint();
    this.root.querySelector<HTMLElement>('form [data-field]')?.focus();
  }

  /** "Clear": empty fields, and forget this device's copy. */
  private clearForm(): void {
    this.values = emptyBirthValues();
    this.errors.clear();
    this.restored = false;
    forget(SLOT);
    this.paint();
  }

  private async onSubmit(): Promise<void> {
    const form = this.root.querySelector('form');
    if (form) readBirthValues(form, this.values);
    const built = buildBirth(this.values, this.timeFormat);
    if (!built.birth) {
      this.errors = built.errors;
      if (form) {
        showErrors(form, this.errors, this.activeLang);
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }
      return;
    }

    this.errors.clear();
    this.birth = built.birth;
    this.personName = this.values.name.trim();
    if (this.remembers) remember(SLOT, storedValues(this.values, this.timeFormat));
    this.emitEvent('kj-submit', built.birth);

    this.submitRun++;
    // The report's tables fit their card (core/tables.ts): loaded once, on
    // the first submit, so a page with only the form does not carry it.
    if (!this.tablesLoaded) {
      this.tablesLoaded = true;
      void import('../core/tables.ts').then((tables) => tables.attachTables(this.root));
    }
    this.slices = new Map();
    this.pdfState = { status: 'idle' };
    this.failure = null;
    this.tab = this.tabs[0] ?? 'overview';
    this.openTab(this.tab);
    // The form folds into one line and the report comes up under it: on a
    // phone it would otherwise open off the screen, under a long form.
    this.collapsed = true;
    this.paint();
    revealResult(this.root);
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
   * "Download PDF": the birth, the edition and language chosen on the bar,
   * the name for the cover, the preset as the PDF's template, through the
   * site's proxy (decision 27).
   */
  private async onPdf(): Promise<void> {
    const birth = this.birth;
    const editions = pdfEditions(this);
    if (!birth || !editions.length || this.pdfState.status === 'loading') return;
    const kit = this.pdfKit;
    if (!kit) return;
    const choice = kit.readPdfChoice(this.root, editions, this.activeLang);
    const run = this.submitRun;
    this.pdfState = { status: 'loading', choice };
    this.refreshResult();

    const name = pdfName(this.personName);
    const template = pdfTemplate(this);
    // A PDF prints north or south charts; the circular one is the page's alone.
    const style = (this.getAttribute('chart-style') ?? '').trim().toLowerCase();
    const chartStyle = style === 'north' || style === 'south' ? style : undefined;
    const body = {
      birth,
      options: { language: choice.lang },
      edition: choice.edition,
      ...(name ? { name } : {}),
      ...(template ? { template } : {}),
      ...(chartStyle ? { chart_style: chartStyle } : {}),
    };
    try {
      const file = await requestPdf(this, kit, '/pdf/kundli', body, 'kundli.pdf');
      if (run !== this.submitRun) return;
      kit.savePdf(file.blob, file.filename);
      this.pdfState = { status: 'saved', choice };
    } catch (thrown) {
      if (run !== this.submitRun) return;
      const error = asKjError(thrown);
      this.pdfState = { status: 'error', error, choice };
      this.emitEvent('kj-error', error);
    }
    this.refreshResult();
  }

  // -------------------------------------------------------------------------
  // Inner elements
  // -------------------------------------------------------------------------

  private mountInner(): void {
    this.mountChart();
    this.mountReadings();
  }

  /**
   * Put the `<kj-chart>` in the slot the last paint made, creating it once.
   * It keeps its own style switch; the chart picked here sets its varga and
   * its first house.
   */
  private mountChart(): void {
    const slot = this.root.querySelector('[data-chart-slot]');
    if (!slot || !this.birth) return;
    if (!this.chart) {
      define(KjChart);
      this.chart = document.createElement(KjChart.tag) as KjChart;
      const style = this.getAttribute('chart-style') ?? this.getAttribute('style');
      if (style) this.chart.setAttribute('chart-style', style);
      const size = this.getAttribute('size');
      if (size) this.chart.setAttribute('size', size);
    }
    const chart = this.chart;
    chart.setAttribute('varga', this.chartId === 'd9' ? 'd9' : 'd1');
    if (this.chartId === 'moon') chart.setAttribute('first-house', 'moon');
    else chart.removeAttribute('first-house');
    this.applySharedAttributes(chart);
    // Set before connecting: the base ignores attribute changes while a
    // widget is disconnected, so the chart makes exactly one request.
    chart.birth = this.birth;
    slot.append(chart);
  }

  /**
   * The readings in the slot the last paint made, one `<kj-reading>` per
   * type, created once and re-pointed on each submit like the chart. Only
   * the last one carries the disclaimer.
   */
  private mountReadings(): void {
    const slot = this.root.querySelector('[data-readings-slot]');
    if (!slot || !this.birth) return;
    const types = this.readings;
    types.forEach((type, index) => {
      let reading = this.readingElements.get(type);
      if (!reading) {
        define(KjReading);
        reading = document.createElement(KjReading.tag) as KjReading;
        reading.setAttribute('type', type);
        this.readingElements.set(type, reading);
      }
      const last = index === types.length - 1;
      for (const name of DISCLAIMER_ATTRIBUTES) {
        const value = last ? this.getAttribute(name) : name === 'disclaimer' ? 'off' : null;
        if (value) reading.setAttribute(name, value);
        else reading.removeAttribute(name);
      }
      this.applySharedAttributes(reading);
      reading.birth = this.birth;
      slot.append(reading);
    });
  }

  /** `lang`, `theme`, `preset` and `powered-by`, which every inner element follows. */
  private applySharedAttributes(element: HTMLElement): void {
    element.setAttribute('frame', 'none');
    const poweredBy = this.getAttribute('powered-by');
    if (poweredBy) element.setAttribute('powered-by', poweredBy);
    element.setAttribute('lang', this.activeLang satisfies Lang);
    // The inner elements are in this element's shadow root, where the page's
    // `theme` cannot reach them; they follow the form's.
    for (const name of ['theme', 'preset', 'pricing-url']) {
      const value = this.getAttribute(name);
      if (value) element.setAttribute(name, value);
      else element.removeAttribute(name);
    }
  }
}

/**
 * Make sure an inner element is a custom element before one is created.
 *
 * A page may have loaded only this module (a bundler tree-shaking an import,
 * or the CDN loader, which loads this element's chunk alone), and `define()`
 * in `index.ts` may never have run. The guard is what keeps a second bundle
 * on the same page from throwing on a name this one took.
 */
function define(element: CustomElementConstructor & { readonly tag: string }): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(element.tag)) customElements.define(element.tag, element);
}
