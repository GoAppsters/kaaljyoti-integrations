/**
 * What every element has in common: a shadow root, four states, and the
 * promise that nothing escapes to the page (design decisions 1, 6, 9, 10).
 *
 * The shadow root is open — a site owner should be able to read what we put
 * in their page — but it is a shadow root, so a host theme's `dl { display:
 * flex }` cannot take a widget apart. Theming crosses the boundary the one
 * way that is meant to: through the `--kj-*` custom properties on `:host`.
 */

import { getConfig, isOff, parseLang, safeUrl } from './config.ts';
import { asKjError, type KjError } from './errors.ts';
import { html, trusted } from './html.ts';
import { t, type Lang, type MessageKey } from './i18n.ts';
import {
  isPlanFailure,
  planStateHtml,
  proxyStateHtml,
  skeletonHtml,
  stateHtml,
  type SkeletonShape,
} from './ui.ts';
import baseCss from '../styles/base.css';
import type * as Signs from './signs.ts';

export { esc, html, trusted } from './html.ts';

/**
 * An SSR-safe base class.
 *
 * `dist/index.js` is an ordinary ESM module, and a bundler running a Next.js
 * page on the server will evaluate it. `class X extends HTMLElement` throws
 * there at *definition* time, before any of our code can decide not to
 * register anything, so the base is swapped for a stub that is never
 * instantiated off a browser.
 */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** Where a widget is in its one load. */
export type KjState = 'idle' | 'loading' | 'ready' | 'error';

/** Attributes that change only how an answer is drawn, never what is asked. */
const REPAINT_ONLY = new Set([
  'lang',
  'powered-by',
  'heading',
  'pricing-url',
  'preset',
  'frame',
  'controls',
  'font',
  'proxy-docs',
]);

/** Plans that may switch the footer off (design decision 9). */
const PAID_PLANS = new Set(['growth', 'scale', 'enterprise']);

/** The error codes we have a translated line for; everything else is generic. */
const ERROR_MESSAGES = new Set<string>([
  'no_key',
  'secret_key',
  'no_place',
  'no_birth',
  'forbidden_origin',
  'rate_limited',
  'quota_exceeded',
  'plan_required',
  'invalid_key',
  'network_error',
]);

/** One constructed sheet per stylesheet text, shared by every widget on the page. */
const sheets = new Map<string, CSSStyleSheet>();

/**
 * Put the shared stylesheet — and an element's own, when it has one — in a
 * shadow root.
 *
 * One constructed sheet shared by every widget on the page costs one parse;
 * the `<style>` fallback is per element and is only for engines without
 * constructable stylesheets. The later widgets bring their extra rules in
 * their own chunk (`static styles`), so a page without them does not
 * download them.
 */
function adoptStyles(root: ShadowRoot, extra: string): void {
  const texts = extra ? [baseCss, extra] : [baseCss];
  try {
    if (typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
      const adopted = texts.map((text) => {
        let sheet = sheets.get(text);
        if (!sheet) {
          sheet = new CSSStyleSheet();
          sheet.replaceSync(text);
          sheets.set(text, sheet);
        }
        return sheet;
      });
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...adopted];
      return;
    }
  } catch {
    // Fall through: an engine that has the constructor but refuses the
    // assignment still gets a working widget from the <style> tag.
  }
  for (const text of texts) {
    const style = document.createElement('style');
    style.textContent = text;
    root.append(style);
  }
}

/**
 * The sign icons' chunk (`signs.ts`, decision 29): the module once loaded,
 * the promise while it loads. Fetched the first time any shadow root holds a
 * sign's placeholder; the horoscope hands it over at once with
 * {@link useSigns}, since its picker is its first paint.
 */
let signs: typeof Signs | Promise<typeof Signs> | undefined;

/** Give the base the icons' module that a chunk imported statically. */
export function useSigns(module: typeof Signs): void {
  signs = module;
}

/**
 * Watch a shadow root for its first sign placeholder, then let `signs.ts`
 * draw it and every later one. Until then the cost is one selector per
 * repaint.
 */
function watchSigns(root: ShadowRoot, host: Element): void {
  const watch = new MutationObserver(() => {
    if (!root.querySelector('.kj-zi')) return;
    watch.disconnect();
    const attach = (module: typeof Signs) => {
      signs = module;
      module.attachSigns(root, host, () => getConfig().signIcons);
    };
    if (signs && 'attachSigns' in signs) return attach(signs);
    void ((signs ??= import('./signs.ts')) as Promise<typeof Signs>).then(attach, () => {
      // Asked again on the next repaint, like a chunk that failed to load.
      signs = undefined;
      watch.observe(root, { childList: true, subtree: true });
    });
  });
  watch.observe(root, { childList: true, subtree: true });
}

/**
 * The Devanagari faces a Hindi card falls back to behind an inherited page
 * font, which rarely has Devanagari glyphs of its own.
 */
const DEVANAGARI_FALLBACK =
  "'Noto Sans Devanagari', 'Mukta', 'Kohinoor Devanagari', 'Nirmala UI', 'Mangal', sans-serif";

/** The base every `<kj-…>` element extends. */
export abstract class KjElement extends ElementBase {
  /** Rules this element adds to the shared sheet; its own chunk carries them. */
  static styles = '';

  /** The shadow root; subclasses read it in tests and in `render()`. */
  protected readonly root: ShadowRoot;

  /** Everything but the stylesheet lives in here, so a repaint keeps the CSS. */
  private readonly body: HTMLDivElement;

  protected state: KjState = 'idle';

  /** Whatever `fetchData()` resolved with; `render()` reads it. */
  protected data: unknown = null;

  protected failure: KjError | null = null;

  /** `X-KJ-Plan` from the last answer — the input to the footer rule. */
  private plan: string | null = null;

  private connected = false;
  private loadQueued = false;
  private renderQueued = false;

  /** Which load is current, so a slow answer cannot overwrite a fast one. */
  private run = 0;

  /** When the reader last clicked or typed in this widget (ms since epoch). */
  private touchedAt = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    adoptStyles(this.root, (this.constructor as typeof KjElement).styles);
    this.body = document.createElement('div');
    this.root.append(this.body);
    watchSigns(this.root, this);
    const touched = () => {
      this.touchedAt = Date.now();
    };
    this.root.addEventListener('pointerdown', touched);
    this.root.addEventListener('keydown', touched);
  }

  /** The language this element renders in: its attribute, else the page's. */
  protected get activeLang(): Lang {
    return parseLang(this.getAttribute('lang')) ?? getConfig().lang;
  }

  /** A chrome label in {@link activeLang}. */
  protected t(key: MessageKey, vars?: Record<string, string>): string {
    return t(this.activeLang, key, vars);
  }

  connectedCallback(): void {
    this.applyThemeDefault();
    this.connected = true;
    void this.load();
  }

  /**
   * Put a configured non-`auto` theme on an element that has none.
   *
   * The stylesheet selects on the `theme` attribute, so the configured
   * default has to be one. `auto` is what no attribute already means, which
   * keeps the page's markup untouched by default; an attribute the page wrote
   * is never replaced. `theme` is not observed: a change is pure CSS and asks
   * for nothing.
   */
  private applyThemeDefault(): void {
    const config = getConfig();
    if (!this.hasAttribute('theme') && config.theme !== 'auto') {
      this.setAttribute('theme', config.theme);
    }
    // The same for the preset: `classic` is what no attribute means.
    if (!this.hasAttribute('preset') && config.preset !== 'classic') {
      this.setAttribute('preset', config.preset);
    }
    this.noteScheme();
    // And the font: `system` is what no attribute means.
    if (!this.hasAttribute('font') && config.font !== 'system') {
      this.setAttribute('font', config.font);
    }
  }

  /**
   * `data-scheme="dark|light"` from the text colour the element inherits:
   * light text is a dark page. The `auto` theme's hues follow it (see
   * `base.css`), so a transparent widget on a dark site is readable whatever
   * the visitor's OS prefers. A colour that cannot be read leaves it unset.
   */
  private noteScheme(): void {
    let color: string;
    try {
      color = getComputedStyle(this).color;
    } catch {
      return;
    }
    const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color);
    if (!rgb) return;
    const [r, g, b] = rgb.slice(1, 4).map((v) => Number(v) / 255) as [number, number, number];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    this.setAttribute('data-scheme', luminance > 0.5 ? 'dark' : 'light');
  }

  /**
   * `font="inherit"`: the page's own font on the card, and for Hindi the
   * same stack with the Devanagari faces behind it — a custom property
   * cannot append to an inherited value, so the page's stack is read here.
   */
  private fontStyle(): string {
    if (this.getAttribute('font')?.trim().toLowerCase() !== 'inherit') return '';
    let family = '';
    try {
      family = getComputedStyle(this).fontFamily;
    } catch {
      // No computed style (a detached element): the plain `inherit` rule applies.
    }
    if (!family || /[;{}<>]/.test(family)) return '';
    return `--kj-font-inherited: ${family}; --kj-font-inherited-hi: ${family}, ${DEVANAGARI_FALLBACK};`;
  }

  disconnectedCallback(): void {
    this.connected = false;
  }

  /**
   * Re-load on a change, but only one load per turn.
   *
   * `el.setAttribute('city', …)` three times in a row is one intent, and
   * without the microtask it would be three requests — the cache would
   * collapse the identical ones, but not the two intermediate states. A
   * language change is different: decision 10 says both languages are already
   * in the response, so it repaints and asks for nothing.
   */
  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (!this.connected || previous === next) return;
    if (REPAINT_ONLY.has(name)) this.queueRender();
    else this.queueLoad();
  }

  private queueLoad(): void {
    if (this.loadQueued) return;
    this.loadQueued = true;
    queueMicrotask(() => {
      this.loadQueued = false;
      if (this.connected) void this.load();
    });
  }

  private queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      // A queued load repaints anyway, and it may change what there is to
      // paint, so it wins.
      if (!this.loadQueued && this.state !== 'idle') this.paint();
    });
  }

  /**
   * Loading → the subclass's request → ready or error, and an event either
   * way. The only method that changes `state`.
   */
  protected async load(): Promise<void> {
    const run = ++this.run;
    this.state = 'loading';
    this.failure = null;
    this.paint();

    try {
      const data = await this.fetchData();
      if (run !== this.run) return;
      this.data = data;
      this.state = 'ready';
      this.paint();
      this.emit('kj-ready', data);
    } catch (thrown) {
      if (run !== this.run) return;
      this.failure = asKjError(thrown);
      this.state = 'error';
      this.paint();
      this.emit('kj-error', this.failure);
    }
  }

  /** The request this element makes. Its result becomes `this.data`. */
  protected abstract fetchData(): Promise<unknown>;

  /** The ready-state markup. Loading and error states are the base's. */
  protected abstract render(): string;

  /** Remember the plan the gateway reported, for the footer rule. */
  protected notePlan(plan: string | null): void {
    if (plan) this.plan = plan;
  }

  /**
   * Whether the footer is rendered.
   *
   * `powered-by="hidden"` is honoured only once an answer has said the
   * account is on a paid plan — decision 9. Before the first answer the link
   * shows, which is also the honest default for a widget that never loads.
   */
  protected get showsPoweredBy(): boolean {
    const asked = this.getAttribute('powered-by') ?? getConfig().poweredBy;
    // Opt-in mode (the WordPress plugin): only an explicit "shown" shows it.
    if (getConfig().creditOptIn) return asked === 'shown';
    if (asked !== 'hidden') return true;
    return !PAID_PLANS.has(this.plan ?? '');
  }

  /** The powered-by link, or nothing. @see showsPoweredBy */
  protected poweredByHtml(): string {
    if (!this.showsPoweredBy) return '';
    return html`<div class="kj-powered" part="powered-by-row">
      <a
        part="powered-by"
        href="https://kaaljyoti.com/api?utm_source=widgets"
        rel="noopener"
        target="_blank"
        >${this.t('powered_by')}</a
      >
    </div>`;
  }

  /**
   * The card's title and the line under it (place, date), or `null` for a
   * widget without a header. `heading="…"` on the element replaces the
   * title; `heading="off"` drops the header.
   */
  protected heading(): { title: string; subtitle?: string } | null {
    return null;
  }

  /** Markup for the footer above the powered-by line: a report's disclaimer. */
  protected footerNote(): string {
    return '';
  }

  /** Whether this element is drawn inside another widget's card. */
  protected get framed(): boolean {
    return this.getAttribute('frame') !== 'none';
  }

  /** The pricing page the plan-required state links for the site owner. */
  protected get pricingUrl(): string {
    return safeUrl(this.getAttribute('pricing-url')) ?? getConfig().pricingUrl;
  }

  /** The header band, or `''`. */
  private headerHtml(): string {
    const own = this.getAttribute('heading');
    if (isOff(own) || !this.framed) return '';
    const heading = this.heading();
    const title = own?.trim() || heading?.title;
    if (!title) return '';
    return html`<header class="kj-head" part="header">
      <h2 class="kj-heading" part="title">${title}</h2>
      ${heading?.subtitle ? trusted(html`<p class="kj-sub" part="subtitle">${heading.subtitle}</p>`) : ''}
    </header>`;
  }

  /** The footer: the note, then the powered-by line; `''` when both are empty. */
  private footHtml(): string {
    const note = this.state === 'ready' ? this.footerNote() : '';
    // Inside another widget's card, that card's footer carries the link.
    const powered = this.framed ? this.poweredByHtml() : '';
    if (!note && !powered) return '';
    return html`<footer class="kj-foot" part="footer">${trusted(note)}${trusted(powered)}</footer>`;
  }

  /**
   * The error state: a plan-required card for a refusal a plan decides, the
   * translated line (decision 6) for everything else.
   */
  protected errorHtml(failure: KjError | null = this.failure): string {
    if (failure && isPlanFailure(failure)) {
      return planStateHtml(failure, this.activeLang, this.pricingUrl);
    }
    if (failure?.code === 'proxy_required') {
      const docs = safeUrl(this.getAttribute('proxy-docs')) ?? getConfig().proxyDocsUrl;
      return proxyStateHtml(this.activeLang, docs);
    }
    const code = failure?.code ?? 'generic_error';
    const key: MessageKey = ERROR_MESSAGES.has(code) ? (code as MessageKey) : 'generic_error';
    // `forbidden_origin` is the one error the page owner can fix, and only if
    // we tell them which origin to add. A failed fetch with a publishable key
    // and no proxy is most often the same mistake seen through a browser
    // that would not show us the answer (an API that withholds CORS from an
    // unlisted origin, or an embed on someone else's host — a Wix Embed HTML
    // element runs on `https://<id>.filesusr.com`), so it names the origin as
    // well.
    const config = getConfig();
    const direct = code === 'network_error' && Boolean(config.key) && !config.proxyAll;
    const message: MessageKey = direct ? 'network_error_origin' : key;
    const vars =
      message === 'forbidden_origin' || message === 'network_error_origin'
        ? { origin: location.origin }
        : undefined;
    return stateHtml({ kind: 'error', part: 'error', code, body: this.t(message, vars) });
  }

  /** The shape the loading skeleton takes. */
  protected skeleton: SkeletonShape = 'tiles';

  protected loadingHtml(shape: SkeletonShape = this.skeleton): string {
    return skeletonHtml(shape, this.t('loading'));
  }

  /** Put the current state in the shadow root. Never throws at the page. */
  protected paint(): void {
    const inner =
      this.state === 'ready'
        ? this.render()
        : this.state === 'error'
          ? this.errorHtml()
          : this.loadingHtml();
    const lang = this.activeLang;
    const font = this.fontStyle();
    // A reload (a new sign, period or tab) must not shrink the card while it
    // waits: the page would jump, and the browser then scrolls to keep the
    // clicked button in view. Hold the last height until the answer paints.
    const held = this.body.getBoundingClientRect().height;
    this.body.style.minHeight = this.state === 'loading' && held > 0 ? `${held}px` : '';
    // A repaint must never scroll the page. Browsers do it on their own when
    // the markup under the viewport is replaced (scroll anchoring re-picks an
    // anchor inside the new markup) or when focus lands; put the page back.
    const before = typeof window === 'undefined' ? Number.NaN : window.scrollY;
    this.body.innerHTML = html`<article
      class="kj-card"
      part="card"
      lang="${lang}"
      ${font ? trusted(html`style="${font}"`) : ''}
    >
      ${trusted(this.headerHtml())}
      <div class="kj-body" part="body">${trusted(inner)}</div>
      <div class="kj-foot-slot" data-foot>${trusted(this.footHtml())}</div>
    </article>`;
    this.setAttribute('data-state', this.state);
    this.holdPlace(before);
  }

  /** Undo a page scroll the repaint caused; see {@link paint}. */
  private holdPlace(before: number): void {
    // Only after the reader acted in this widget: a repaint they caused.
    // Otherwise an answer arriving mid-scroll would tug the page back.
    if (!Number.isFinite(before) || Date.now() - this.touchedAt > 15_000) return;
    const restore = () => {
      if (Math.abs(window.scrollY - before) > 1) window.scrollTo(window.scrollX, before);
    };
    restore();
    // Anchoring can also settle on the next frame.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
  }

  /** Redraw only the footer: a report whose disclaimer arrived after the rest. */
  protected repaintFooter(): void {
    const slot = this.body.querySelector('[data-foot]');
    if (slot) slot.innerHTML = this.footHtml();
  }

  /** A bubbling, composed event, so a listener on `document` hears it. */
  private emit(type: 'kj-ready' | 'kj-error', detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}
