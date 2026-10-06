/**
 * `<kj-chart>` — a drawn kundli for a birth.
 *
 * The element asks for `image/svg+xml` and injects the document it gets back
 * rather than making a blob URL for an `<img>`: an SVG inside an `<img>` is
 * isolated and cannot see the page's custom properties, and the whole theming
 * story (decision 1) depends on the markup being inline. The SVG scopes its
 * own `--kj-*` defaults to `:root`, which does not match inside a shadow
 * tree, so the ones on `:host` in `base.css` are the ones it finds.
 *
 * This is also the one element where a `lang` change is a new request. The
 * API draws the chart in a single language — the labels are baked into the
 * document — so decision 10's "both languages are already in the response"
 * cannot hold here, and `lang` reloads instead of repainting.
 */

import { cacheKey, memo } from '../core/cache.ts';
import { request } from '../core/client.ts';
import { isOff } from '../core/config.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { KjError } from '../core/errors.ts';
import { clock, dateLabel } from '../core/format.ts';
import { t } from '../core/i18n.ts';
import { resolvePlace } from '../core/places.ts';
import { segmentedHtml, wireChoices } from '../core/ui.ts';

/** A birth, as `<kj-chart>.birth` takes it and as the API's `birth` wants it. */
export interface KjBirth {
  /** Wall clock at the place, `YYYY-MM-DDTHH:MM:SS` (decision 7). */
  datetime: string;
  /** Omitted for manual coordinates, so the API derives it (decision 8). */
  timezone?: string;
  latitude: number;
  longitude: number;
  /** A label only; the computation does not use it. */
  place?: string;
}

const CHART_PATH = '/kundli/chart';

/** The three the API draws; anything else falls back to `north`. */
const STYLES = new Set(['north', 'south', 'circular']);

/**
 * What the chart's first house may be drawn from (`first_house`): the lagna,
 * a graha (`moon` is the Chandra kundli), or a house (bhavat bhavam).
 */
const FIRST_HOUSE =
  /^(lagna|sun|moon|mars|mercury|jupiter|venus|saturn|rahu|ketu|house_([2-9]|1[0-2]))$/;

/** The API's range for `size`. Out-of-range values are clamped, not refused. */
const MIN_SIZE = 200;
const MAX_SIZE = 2000;

/** Smaller than the API's own 600: a widget usually sits in a column. */
const DEFAULT_SIZE = 360;

/**
 * Nothing to draw with — no `datetime`, or no place.
 *
 * Its own code rather than `no_place`, because a chart needs both halves and
 * the line has to say so. `element.ts` has the translation.
 */
const NO_BIRTH = 'no_birth';

/** @see KjElement */
export class KjChart extends KjElement {
  static readonly tag = 'kj-chart';

  /**
   * `style` is in the list because the public attribute is `style="north"`
   * (the design doc's snippet). It is also a global HTML attribute, so
   * `attributeChangedCallback` filters the CSS that a page may put there.
   */
  static readonly observedAttributes = [
    'datetime',
    'timezone',
    'lat',
    'lon',
    'city',
    'place',
    'style',
    'chart-style',
    'size',
    'varga',
    'first-house',
    'show-degrees',
    'controls',
    'lang',
    'powered-by',
  ];

  private reloadQueued = false;

  private listening = false;

  protected override skeleton = 'chart' as const;

  override connectedCallback(): void {
    // The style switch: a pick writes `chart-style`, which reloads (one call
    // per style, and a style already drawn is answered by the page memo).
    if (!this.listening) {
      this.listening = true;
      wireChoices(this.root, (group, id) => {
        if (group === 'chart-style') this.setAttribute('chart-style', id);
      });
    }
    super.connectedCallback();
  }

  /**
   * The birth as attributes, or `null` when the element has not got one.
   * @see readBirth
   */
  get birth(): KjBirth | null {
    return readBirth(this);
  }

  /**
   * Set the birth in one go; `<kj-kundli-form>` uses it.
   *
   * It writes the attributes rather than keeping a second copy of the state,
   * so the element has exactly one source of truth and the page can read back
   * what it set. The base coalesces the five changes into one load.
   */
  set birth(value: KjBirth | null) {
    writeBirth(this, value);
  }

  override attributeChangedCallback(
    name: string,
    previous: string | null,
    next: string | null,
  ): void {
    if (previous === next) return;

    // A page that writes `el.style.color` would otherwise re-request the
    // chart. Only a value that is (or was) a chart style counts.
    if (name === 'style' && !isChartStyle(previous) && !isChartStyle(next)) return;

    if (name === 'lang') {
      // The exception to decision 10: the labels are drawn into the document.
      this.queueReload();
      return;
    }
    super.attributeChangedCallback(name, previous, next);
  }

  protected override async fetchData(): Promise<string> {
    const birth = this.birth;
    if (!birth) throw new KjError(NO_BIRTH, 'No birth on <kj-chart>');

    const body = {
      birth,
      style: this.chartStyle,
      size: this.size,
      varga: this.varga,
      show_degrees: this.showDegrees,
      ...(this.firstHouse ? { first_house: this.firstHouse } : {}),
      // A single language, not the `['en','hi']` the JSON endpoints get: the
      // SVG carries one set of labels. `embed_font` is never sent — the API
      // refuses it for a publishable key.
      options: { language: this.activeLang },
    };

    // Decision 4: two identical charts on a page are one call. The `#svg`
    // keeps the key apart from a JSON request for the same chart.
    const answer = await memo(cacheKey(`${CHART_PATH}#svg`, body), () =>
      request<string>(CHART_PATH, body, { accept: 'image/svg+xml' }),
    );
    return answer.data;
  }

  protected override heading(): { title: string; subtitle?: string } {
    return { title: this.t('title_chart'), subtitle: this.caption() };
  }

  /** The drawing, and the style switch above it unless `controls="off"`. */
  protected override render(): string {
    const lang = this.activeLang;
    const controls = isOff(this.getAttribute('controls'))
      ? ''
      : html`<div class="kj-controls">
          ${trusted(
            segmentedHtml(
              'chart-style',
              t(lang, 'chart_style'),
              [
                { id: 'north', label: t(lang, 'style_north') },
                { id: 'south', label: t(lang, 'style_south') },
                { id: 'circular', label: t(lang, 'style_circular') },
              ],
              this.chartStyle,
            ),
          )}
        </div>`;
    return html`${trusted(controls)}
      <figure part="chart" class="kj-chartbox">
        <div class="kj-svg" data-svg></div>
      </figure>`;
  }

  /**
   * The SVG goes in by itself, after the rest of the widget is in the DOM.
   *
   * It carries its own `<style>`, and an HTML parser switches to raw-text
   * mode inside one. Pasting the document into the middle of a larger
   * `innerHTML` string therefore puts the caption and the powered-by footer
   * at the mercy of how a runtime resumes from that — happy-dom drops
   * everything after it today. Its own container keeps the blast radius to
   * the chart. `trusted` still applies: this markup is the API's, and the
   * only markup in this package that is not escaped.
   */
  protected override paint(): void {
    super.paint();
    if (this.state !== 'ready') return;
    const host = this.root.querySelector('[data-svg]');
    if (host) host.innerHTML = typeof this.data === 'string' ? this.data : '';
  }

  /** One reload per turn, however many attributes a page changed. */
  private queueReload(): void {
    if (this.reloadQueued) return;
    this.reloadQueued = true;
    queueMicrotask(() => {
      this.reloadQueued = false;
      if (this.isConnected) void this.load();
    });
  }

  /** `chart-style` for a page that cannot spare the `style` attribute. */
  get chartStyle(): string {
    const raw = this.getAttribute('chart-style') ?? this.getAttribute('style');
    return isChartStyle(raw) ? raw.trim().toLowerCase() : 'north';
  }

  private get size(): number {
    const raw = Number.parseInt(this.getAttribute('size') ?? '', 10);
    if (!Number.isFinite(raw)) return DEFAULT_SIZE;
    return Math.min(Math.max(raw, MIN_SIZE), MAX_SIZE);
  }

  /** `d1`…`d99`; anything else is the rashi chart. */
  private get varga(): string {
    const raw = (this.getAttribute('varga') ?? '').trim().toLowerCase();
    return /^d\d{1,2}$/.test(raw) ? raw : 'd1';
  }

  /** `first-house`, when it is one the API draws from; the lagna otherwise. */
  private get firstHouse(): string | null {
    const raw = (this.getAttribute('first-house') ?? '').trim().toLowerCase();
    return FIRST_HOUSE.test(raw) && raw !== 'lagna' ? raw : null;
  }

  /** Degrees are on unless a page says otherwise, as in the API's default. */
  private get showDegrees(): boolean {
    return this.getAttribute('show-degrees') !== 'false';
  }

  /** `New Delhi · 14 May 1990, 10:30`, out of whatever the element has. */
  private caption(): string {
    const parts: string[] = [];
    const place = this.getAttribute('place')?.trim() || this.birth?.place;
    if (place) parts.push(place);

    const datetime = this.getAttribute('datetime')?.trim();
    if (datetime) {
      const lang = this.activeLang;
      const date = dateLabel(datetime, lang);
      const time = clock(datetime, lang);
      parts.push(time === '—' ? date : `${date}, ${time}`);
    }
    return parts.join(' · ');
  }
}

/** Whether an attribute value names one of the three drawings. */
function isChartStyle(raw: string | null | undefined): raw is string {
  return !!raw && STYLES.has(raw.trim().toLowerCase());
}

/**
 * A birth out of `datetime` and the place attributes, or `null`.
 *
 * `resolvePlace` means a `city="delhi"` is as good as a `lat`/`lon` pair
 * here, which costs nothing and saves a page owner looking coordinates up.
 * `<kj-reading>` reads its birth the same way.
 */
export function readBirth(el: Element): KjBirth | null {
  const datetime = el.getAttribute('datetime')?.trim();
  if (!datetime) return null;

  const place = resolvePlace({
    city: el.getAttribute('city'),
    lat: el.getAttribute('lat'),
    lon: el.getAttribute('lon'),
    timezone: el.getAttribute('timezone'),
  });
  if (!place) return null;

  const birth: KjBirth = {
    datetime,
    latitude: place.latitude,
    longitude: place.longitude,
  };
  if (place.timezone) birth.timezone = place.timezone;
  const label = el.getAttribute('place')?.trim() || place.name;
  if (label) birth.place = label;
  return birth;
}

/** A birth into the attributes {@link readBirth} reads; `null` clears them. */
export function writeBirth(el: Element, value: KjBirth | null): void {
  if (!value) {
    for (const name of ['datetime', 'timezone', 'lat', 'lon', 'place']) {
      el.removeAttribute(name);
    }
    return;
  }
  el.setAttribute('datetime', value.datetime);
  el.setAttribute('lat', String(value.latitude));
  el.setAttribute('lon', String(value.longitude));
  if (value.timezone) el.setAttribute('timezone', value.timezone);
  else el.removeAttribute('timezone');
  if (value.place) el.setAttribute('place', value.place);
  else el.removeAttribute('place');
}
