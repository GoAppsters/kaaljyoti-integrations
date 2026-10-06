/**
 * What the birth-based calculators share (integrations revamp §4, 10–20):
 * the birth form in its compact, one-person mode, the fold into a one-line
 * summary after a submit, the answers a result is made of, and the inner
 * `<kj-chart>` / `<kj-reading>` some of them draw.
 *
 * A calculator is `<kj-moon-sign>`, `<kj-lagna>`, `<kj-dasha>` and the rest:
 * each names its requests ({@link KjBirthCalc.start}) and draws its result
 * ({@link KjBirthCalc.resultBody}); this class does the form, the
 * remembering, the requests and the states.
 *
 * Two ways in:
 *
 *   * **The form.** The ready state is the form, and nothing is asked until
 *     a visitor submits. A valid submit folds the form into "Asha · 14 May
 *     1990, 10:30 · Varanasi — Edit details" and brings the result into
 *     view. The entry is remembered on the device under the kundli form's
 *     slot, so a visitor who used one calculator finds their details filled
 *     in on the next (`remember="off"` opts out, as on the forms).
 *   * **Attributes.** `datetime` and `lat`/`lon` (or `city`), as on
 *     `<kj-chart>`, or `.birth` set in one go: no form, the result at once —
 *     for a page that already knows the birth.
 *
 * Each answer is a *slice* with its own state, so one refused request (a
 * 5-credit reading the month's credits no longer cover) shows the
 * monthly-limit card in its place and the rest of the result stands.
 */

import { call } from '../core/call.ts';
import type { KjRequestInit } from '../core/client.ts';
import { getConfig, isOff, parseTimeFormat, type TimeFormat } from '../core/config.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { asKjError, type KjError } from '../core/errors.ts';
import { EXTRA_CSS } from '../core/extra.ts';
import type { Lang } from '../core/i18n.ts';
import { wirePlaceSearch } from '../core/place-search.ts';
import {
  DISCLAIMER_ATTRIBUTES,
  disclaimerHtml,
  type AnswerZone,
  type ReportText,
} from '../core/reports.ts';
import { forget, recall, remember } from '../core/storage.ts';
import { skeletonHtml, wireChoices, type SkeletonShape } from '../core/ui.ts';
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
import { readBirth, writeBirth, type KjBirth } from './chart.ts';

/** One answer a result is drawn from. */
export interface CalcSlice<T = unknown> {
  state: 'loading' | 'ready' | 'error';
  data?: T;
  /** `meta.timezone`: the zone the answer's instants are read in. */
  zone?: AnswerZone | null;
  error?: KjError;
}

/** The remembered entry: the same slot as the kundli form's, one person. */
const SLOT = 'kundli';

/** Attributes every calculator observes; a subclass adds its own. */
export const CALC_ATTRIBUTES = [
  'datetime',
  'timezone',
  'lat',
  'lon',
  'city',
  'place',
  'name',
  'time-format',
  'remember',
  'proxy',
  ...DISCLAIMER_ATTRIBUTES,
  'lang',
  'powered-by',
] as const;

/** The same birth, by value. */
function sameBirth(a: KjBirth | null, b: KjBirth | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export { defineOnce } from '../core/define.ts';

/** @see KjElement */
export abstract class KjBirthCalc extends KjElement {
  static override styles = EXTRA_CSS;

  /** The birth the result is for: the last accepted submit, or the attributes'. */
  protected current: KjBirth | null = null;

  /** The name given with it, for the summary line and the result's head. */
  protected personName = '';

  /** This birth's answers, by name; each submit starts a new map. */
  protected slices = new Map<string, CalcSlice>();

  /** Which birth's answers are current, so a slow one cannot land on the next. */
  protected calcRun = 0;

  /** The slice whose arrival is `kj-ready`. */
  protected primary = '';

  private values: BirthValues = emptyBirthValues();
  private errors = new Set<BirthError>();
  private collapsed = false;
  private restored = false;
  private prepared = false;
  private listening = false;

  /** Inner elements, created once and re-pointed at each birth. */
  private readonly inner = new Map<string, HTMLElement>();

  // -------------------------------------------------------------------------
  // What a calculator says
  // -------------------------------------------------------------------------

  /** The card's title. */
  protected abstract cardTitle(): string;

  /** The submit button's words. */
  protected abstract submitLabel(): string;

  /** Ask for the answers the first view needs: `this.need(…)` for each. */
  protected abstract start(birth: KjBirth): void;

  /** The result, drawn from {@link slices}. */
  protected abstract resultBody(lang: Lang): string;

  /** A click on a `[data-action]` in the result; the form's own are handled here. */
  protected onAction(_action: string, _target: HTMLElement): void {}

  /** A tab or a segment in the result. */
  protected onChoice(_group: string, _id: string): void {}

  /** A `<select data-pick>` in the result changed. */
  protected onPick(_name: string, _value: string): void {}

  /** Put inner elements into the slots the last paint made. */
  protected mountInner(): void {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  override connectedCallback(): void {
    if (!this.listening) {
      this.listening = true;
      wirePlaceSearch(this.root, this, () => this.activeLang);
      this.root.addEventListener('submit', (event) => {
        event.preventDefault();
        this.onSubmit();
      });
      this.root.addEventListener('input', (event) => this.onInput(event));
      this.root.addEventListener('change', (event) => {
        const pick = (event.target as HTMLElement | null)?.closest?.<HTMLSelectElement>(
          '[data-pick]',
        );
        if (pick?.dataset.pick) this.onPick(pick.dataset.pick, pick.value);
        else this.onInput(event);
      });
      this.root.addEventListener('click', (event) => {
        const target = (event.target as Element | null)?.closest?.<HTMLElement>('[data-action]');
        const action = target?.dataset.action;
        if (!target || !action) return;
        if (action === 'clear') this.clearForm();
        else if (action === 'edit') this.expandForm();
        else this.onAction(action, target);
      });
      wireChoices(this.root, (group, id) => this.onChoice(group, id));
    }
    if (!this.prepared) {
      this.prepared = true;
      this.prepareValues();
    }
    super.connectedCallback();
  }

  /** The birth in the attributes, as `<kj-chart>` reads it. */
  get birth(): KjBirth | null {
    return readBirth(this);
  }

  /** Set the birth in one go: the attributes, so there is one source of truth. */
  set birth(value: KjBirth | null) {
    writeBirth(this, value);
  }

  /** Whether the page gave the birth, so there is no form. */
  protected get fixed(): boolean {
    return readBirth(this) !== null;
  }

  private get timeFormat(): TimeFormat {
    return parseTimeFormat(this.getAttribute('time-format')) ?? getConfig().timeFormat;
  }

  private get remembers(): boolean {
    return getConfig().remember && !isOff(this.getAttribute('remember'));
  }

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

  /** Never called: {@link load} is overridden. */
  protected override fetchData(): Promise<unknown> {
    return Promise.resolve(null);
  }

  /**
   * The form is the ready state; a birth in the attributes starts its
   * result straight away (once per distinct birth).
   */
  protected override load(): Promise<void> {
    this.state = 'ready';
    const given = readBirth(this);
    if (given && !sameBirth(given, this.current)) {
      this.begin(given, this.getAttribute('name')?.trim() ?? '');
    }
    this.paint();
    return Promise.resolve();
  }

  /** A new birth: a new run, no answers yet, the first view's requests. */
  protected begin(birth: KjBirth, name: string): void {
    this.current = birth;
    this.personName = name;
    this.calcRun++;
    this.slices = new Map();
    this.reset();
    this.start(birth);
  }

  /** A subclass's own per-birth state (a selected tab, a drill-down) goes back here. */
  protected reset(): void {}

  protected override heading(): { title: string; subtitle?: string } {
    const lang = this.activeLang;
    const subtitle =
      this.fixed && this.current
        ? birthSummary(this.personName, this.current, lang)
        : this.t('form_intro');
    return { title: this.cardTitle(), subtitle };
  }

  protected override footerNote(): string {
    for (const slice of this.slices.values()) {
      const text = (slice.data as { disclaimer?: ReportText } | undefined)?.disclaimer;
      if (slice.state === 'ready' && text) return disclaimerHtml(text, this.activeLang);
    }
    return '';
  }

  protected override render(): string {
    return html`${trusted(this.fixed ? '' : this.formHtml())}
      <div data-result>${trusted(this.resultHtml())}</div>`;
  }

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

  /** Only the result (and the footer): an answer landing leaves the form alone. */
  protected refreshResult(): void {
    const slot = this.root.querySelector('[data-result]');
    if (!slot) {
      this.paint();
      return;
    }
    let focused: string | undefined;
    try {
      focused = (this.root.activeElement as HTMLElement | null)?.id;
    } catch {
      // Nothing focused, or a detached element.
    }
    slot.innerHTML = this.resultHtml();
    this.repaintFooter();
    this.mountInner();
    if (focused)
      this.root.querySelector<HTMLElement>(`[id="${focused}"]`)?.focus({ preventScroll: true });
  }

  private resultHtml(): string {
    if (!this.current) return '';
    return html`<section class="kj-result" part="result" aria-live="polite">
      ${trusted(this.resultBody(this.activeLang))}
    </section>`;
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
      this.collapsed && this.current
        ? collapsedHtml([birthSummary(this.personName, this.current, lang)], lang)
        : '';
    return html`${trusted(summary)}
      <form
        class="kj-form kj-form-grid"
        part="form"
        novalidate
        ${trusted(this.collapsed ? 'hidden' : '')}
      >
        ${trusted(birthFieldsHtml('kj', lang, this.timeFormat, true))} ${trusted(remembered)}
        <div class="kj-actions kj-span">
          <button class="kj-btn" type="submit" part="submit">${this.submitLabel()}</button>
        </div>
      </form>`;
  }

  // -------------------------------------------------------------------------
  // Answers
  // -------------------------------------------------------------------------

  /**
   * Ask for one answer for the current birth, unless it is already asked
   * for. `quiet` answers (badges, extras) fire no `kj-error`.
   */
  protected need(
    name: string,
    path: string,
    body: unknown,
    options: { quiet?: boolean; init?: KjRequestInit } = {},
  ): void {
    if (!this.current || this.slices.has(name)) return;
    this.slices.set(name, { state: 'loading' });
    const run = this.calcRun;
    call<unknown>(this, path, body, options.init).then(
      (answer) => {
        if (run !== this.calcRun) return;
        this.notePlan(answer.plan);
        const zone = (answer.meta as { timezone?: AnswerZone } | null)?.timezone ?? null;
        this.slices.set(name, { state: 'ready', data: answer.data, zone });
        this.refreshResult();
        if (name === this.primary) this.emitEvent('kj-ready', answer.data);
      },
      (thrown: unknown) => {
        if (run !== this.calcRun) return;
        const error = asKjError(thrown);
        this.slices.set(name, { state: 'error', error });
        this.refreshResult();
        if (!options.quiet) this.emitEvent('kj-error', error);
      },
    );
  }

  /** A slice's data once it is ready. */
  protected ready<T>(name: string): T | undefined {
    const slice = this.slices.get(name);
    return slice?.state === 'ready' ? (slice.data as T) : undefined;
  }

  /** The skeleton, the error or the plan-required card for a slice not ready; `null` when ready. */
  protected pending(name: string, shape: SkeletonShape = 'report'): string | null {
    const slice = this.slices.get(name);
    if (!slice || slice.state === 'loading') return skeletonHtml(shape, this.t('loading'));
    if (slice.state === 'error') return this.errorHtml(slice.error ?? null);
    return null;
  }

  protected emitEvent(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  // -------------------------------------------------------------------------
  // Inner elements
  // -------------------------------------------------------------------------

  /**
   * The inner element under `key`, created once with `create`; `lang`,
   * `theme`, `preset`, `font`, `pricing-url` and `powered-by` follow this
   * element's, and it is drawn without a card of its own.
   */
  protected innerElement<T extends HTMLElement>(key: string, create: () => T): T {
    let element = this.inner.get(key) as T | undefined;
    if (!element) {
      element = create();
      this.inner.set(key, element);
    }
    element.setAttribute('frame', 'none');
    element.setAttribute('lang', this.activeLang);
    for (const name of ['theme', 'preset', 'font', 'pricing-url', 'powered-by']) {
      const value = this.getAttribute(name);
      if (value) element.setAttribute(name, value);
      else element.removeAttribute(name);
    }
    return element;
  }

  // -------------------------------------------------------------------------
  // The form
  // -------------------------------------------------------------------------

  private onInput(event: Event): void {
    const form = this.root.querySelector('form');
    if (!form || !form.contains(event.target as Node)) return;
    readBirthValues(form, this.values);
    showResolved(form, this.values, this.activeLang);
    const group = (event.target as Element | null)?.closest?.<HTMLElement>('[data-group]')?.dataset
      .group as BirthError | undefined;
    if (group && this.errors.delete(group)) showErrors(form, this.errors, this.activeLang);
  }

  private expandForm(): void {
    this.collapsed = false;
    this.paint();
    this.root.querySelector<HTMLElement>('form [data-field]')?.focus();
  }

  private clearForm(): void {
    this.values = emptyBirthValues();
    this.errors.clear();
    this.restored = false;
    forget(SLOT);
    this.paint();
  }

  private onSubmit(): void {
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
    if (this.remembers) remember(SLOT, storedValues(this.values, this.timeFormat));
    this.emitEvent('kj-submit', built.birth);
    this.failure = null;
    this.begin(built.birth, this.values.name.trim());
    this.collapsed = true;
    this.paint();
    revealResult(this.root);
  }
}
