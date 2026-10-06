/**
 * The design system's components, as markup (design system, "Components").
 *
 * None of these is a custom element: each is a function that returns a
 * string of escaped markup for an element's `render()`, styled by the shared
 * sheet (`styles/base.css`). Keeping them strings keeps them free — no
 * registration, no lifecycle, no second shadow root inside the first — and
 * keeps the one rule of this package intact: every value that came from a
 * response goes through `html`, and only markup these functions built is
 * marked {@link trusted}.
 */

import { html, trusted } from './html.ts';
import { clock } from './format.ts';
import type { KjError } from './errors.ts';
import { t, type Lang } from './i18n.ts';

// ---------------------------------------------------------------------------
// Signs
// ---------------------------------------------------------------------------

/**
 * A sign's icon: a placeholder that `core/signs.ts` draws into (design
 * decision 29), in the theme the element or the page chose. `size` is `l`
 * for the horoscope's picker, `m` beside a value in a tile or a heading, and
 * nothing for the compact inline form in tables. The icon is decoration
 * next to the name, never instead of it, so it is `aria-hidden`; `''` for no
 * sign.
 */
export function signIcon(id: string | null | undefined, size?: 'l' | 'm'): string {
  return id
    ? html`<span
        class="kj-zi${size ? ` kj-zi-${size}` : ''}"
        data-zi="${id}"
        part="sign-icon${size ? ` sign-icon-${size}` : ''}"
        aria-hidden="true"
      ></span>`
    : '';
}

/** The icon and the name. */
export function signHtml(id: string | null | undefined, name: string, size?: 'l' | 'm'): string {
  return html`${trusted(signIcon(id, size))}${name}`;
}

// ---------------------------------------------------------------------------
// Tiles, badges, buttons
// ---------------------------------------------------------------------------

/** One tile: a label, the value, and an optional line under it. */
export interface Tile {
  /** Goes into `part="tile tile-<key>"`. */
  key: string;
  label: string;
  /** Already-built markup (escape before passing). */
  value: string;
  /** Already-built markup. */
  sub?: string;
  tone?: 'good' | 'bad';
}

/** A responsive grid of tiles. */
export function tilesHtml(tiles: readonly Tile[], part = 'tiles'): string {
  const items = tiles
    .map(
      (tile) =>
        html`<div
          class="kj-tile${tile.tone ? ` kj-tone-${tile.tone}` : ''}"
          part="tile tile-${tile.key}"
        >
          <div class="kj-tile-label" part="label ${tile.key}-label">${tile.label}</div>
          <div class="kj-tile-value" part="value ${tile.key}-value">${trusted(tile.value)}</div>
          ${tile.sub ? trusted(html`<div class="kj-tile-sub">${trusted(tile.sub)}</div>`) : ''}
        </div>`,
    )
    .join('');
  return items ? html`<div class="kj-tiles" part="${part}">${trusted(items)}</div>` : '';
}

/** The kinds of badge the sheet colours. */
export type BadgeKind =
  | 'retro'
  | 'vargottama'
  | 'dignity-good'
  | 'dignity-bad'
  | 'dignity'
  | 'current'
  | 'good'
  | 'bad'
  | 'care'
  | 'muted';

/** A small pill with a word in it — never a number standing in for a judgement. */
export function badgeHtml(text: string, kind: BadgeKind, title?: string): string {
  return html`<span
    class="kj-badge kj-badge-${kind}"
    part="badge badge-${kind}"
    ${title ? trusted(html`title="${title}"`) : ''}
    >${text}</span
  >`;
}

// ---------------------------------------------------------------------------
// Tabs and segmented controls
// ---------------------------------------------------------------------------

/** One tab or one segment. */
export interface Choice {
  id: string;
  label: string;
}

/**
 * A `role=tablist` with roving `tabindex`: only the selected tab is in the tab
 * order, and ←/→/Home/End move between them ({@link wireTabs}). `group` ties
 * the tabs to their panels (`kj-<group>-panel-<id>`), which the caller draws
 * with {@link tabPanelHtml}.
 */
export function tabsHtml(
  group: string,
  label: string,
  tabs: readonly Choice[],
  active: string,
): string {
  const items = tabs
    .map((tab) => {
      const selected = tab.id === active;
      return html`<button
        type="button"
        role="tab"
        class="kj-tab"
        part="tab tab-${tab.id}"
        id="kj-${group}-tab-${tab.id}"
        aria-controls="kj-${group}-panel-${tab.id}"
        aria-selected="${String(selected)}"
        tabindex="${selected ? '0' : '-1'}"
        data-tab-group="${group}"
        data-tab="${tab.id}"
      >
        ${tab.label}
      </button>`;
    })
    .join('');
  return html`<div class="kj-tabs" role="tablist" aria-label="${label}" part="tabs">
    ${trusted(items)}
  </div>`;
}

/** The panel for the selected tab. Only the selected one is ever drawn. */
export function tabPanelHtml(group: string, id: string, body: string): string {
  return html`<div
    class="kj-panel"
    role="tabpanel"
    id="kj-${group}-panel-${id}"
    aria-labelledby="kj-${group}-tab-${id}"
    tabindex="0"
    part="panel panel-${id}"
  >
    ${trusted(body)}
  </div>`;
}

/** A row of `aria-pressed` buttons for a small exclusive choice. */
export function segmentedHtml(
  group: string,
  label: string,
  options: readonly Choice[],
  active: string,
): string {
  const items = options
    .map(
      (option) =>
        html`<button
          type="button"
          class="kj-seg-btn"
          part="segment segment-${option.id}"
          aria-pressed="${String(option.id === active)}"
          data-seg-group="${group}"
          data-seg="${option.id}"
        >
          ${option.label}
        </button>`,
    )
    .join('');
  return html`<div class="kj-seg" role="group" aria-label="${label}" part="segmented ${group}">
    ${trusted(items)}
  </div>`;
}

/**
 * Clicks and keys for every tablist and segmented control in `root`.
 *
 * Delegated, like the forms' listeners, because a repaint replaces the
 * buttons. After `select` (which is expected to repaint synchronously) the
 * selected tab of a keyboard-driven tablist is focused again, so arrowing
 * through tabs does not drop the focus on the floor.
 */
export function wireChoices(
  root: ShadowRoot,
  select: (group: string, id: string, kind: 'tab' | 'segment') => void,
): void {
  const refocus = (group: string) => {
    root
      .querySelector<HTMLElement>(`[data-tab-group="${group}"][aria-selected="true"]`)
      ?.focus({ preventScroll: true });
  };

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>(
      '[data-tab-group],[data-seg-group]',
    );
    if (!button) return;
    const { tabGroup, tab, segGroup, seg } = button.dataset;
    if (tabGroup && tab) select(tabGroup, tab, 'tab');
    else if (segGroup && seg) select(segGroup, seg, 'segment');
  });

  root.addEventListener('keydown', (event) => {
    const tab = event.target as HTMLElement;
    const group = tab?.dataset?.tabGroup;
    if (!group) return;
    const key = (event as KeyboardEvent).key;
    const tabs = [...root.querySelectorAll<HTMLElement>(`[data-tab-group="${group}"][data-tab]`)];
    const at = tabs.indexOf(tab);
    let next = -1;
    if (key === 'ArrowRight' || key === 'ArrowDown') next = (at + 1) % tabs.length;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (at - 1 + tabs.length) % tabs.length;
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = tabs.length - 1;
    if (next < 0 || at < 0) return;
    event.preventDefault();
    const id = tabs[next]?.dataset.tab;
    if (!id) return;
    select(group, id, 'tab');
    refocus(group);
  });
}

// ---------------------------------------------------------------------------
// Loading, empty, error and plan-required states
// ---------------------------------------------------------------------------

/** The rough shape of what is loading, so the page does not jump when it lands. */
export type SkeletonShape = 'tiles' | 'lines' | 'chart' | 'table' | 'report';

/**
 * Shimmer blocks in the widget's shape, with the translated "Loading…" in a
 * status region for screen readers (and for the tests, which read it).
 */
export function skeletonHtml(shape: SkeletonShape, label: string): string {
  const bar = (width: number) => `<span class="kj-sk kj-sk-line" style="width:${width}%"></span>`;
  let blocks: string;
  if (shape === 'tiles') {
    blocks = `<div class="kj-sk-tiles">${'<span class="kj-sk kj-sk-tile"></span>'.repeat(6)}</div>${bar(92)}`;
  } else if (shape === 'chart') {
    blocks = `<span class="kj-sk kj-sk-chart"></span>`;
  } else if (shape === 'table') {
    blocks = [100, 94, 97, 91, 95, 88].map(bar).join('');
  } else if (shape === 'report') {
    blocks = `<div class="kj-sk-tiles">${'<span class="kj-sk kj-sk-tile"></span>'.repeat(3)}</div>${[96, 90, 93, 70].map(bar).join('')}`;
  } else {
    blocks = [96, 90, 93, 70].map(bar).join('');
  }
  return html`<div class="kj-skeleton" part="loading" role="status" aria-live="polite">
    <span class="kj-sr">${label}</span>
    <div aria-hidden="true">${trusted(blocks)}</div>
  </div>`;
}

const ICONS = {
  lock: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 3 2.5 20h19L12 3zm0 6v5m0 3v.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 11v6m0-9v.5"/></svg>',
} as const;

/** What a state block says. */
export interface StateOptions {
  kind: 'empty' | 'error' | 'plan';
  title?: string;
  body?: string;
  /** `data-code`, for a page (and a test) that wants the reason. */
  code?: string;
  /** Already-built markup under the body: the site owner's line. */
  extra?: string;
  /** `part` names; `error` keeps 0.1.0's name for the error line. */
  part?: string;
}

/** A small centred block with an icon: empty, error or plan-required. */
export function stateHtml(options: StateOptions): string {
  const icon =
    options.kind === 'plan' ? ICONS.lock : options.kind === 'error' ? ICONS.alert : ICONS.info;
  return html`<div
    class="kj-state kj-state-${options.kind}"
    part="${options.part ?? options.kind}"
    ${options.code ? trusted(html`data-code="${options.code}"`) : ''}
    role="status"
  >
    <span class="kj-state-icon">${trusted(icon)}</span>
    ${options.title ? trusted(html`<p class="kj-state-title">${options.title}</p>`) : ''}
    ${options.body ? trusted(html`<p class="kj-state-body">${options.body}</p>`) : ''}
    ${trusted(options.extra ?? '')}
  </div>`;
}

/**
 * The plan a refusal names, out of the API's own message.
 *
 * No plan gates a route any more, so the one refusal that still names a plan
 * is a PDF's own `branding`: "per-request branding is available on the
 * Enterprise plan; you are on …". The plan named is the one to ask for.
 * Anything else — the Free plan's PDF refusal ({@link needsPaidPlan}), and
 * the publishable-key refusal, which no plan lifts — names none.
 */
export function requiredPlan(message: string | null | undefined): string | null {
  const found = /available (?:from|on) the ([A-Z][A-Za-z]+)/.exec(message ?? '');
  return found?.[1] ?? null;
}

/**
 * Whether a refusal is the Free plan's: "PDFs are available on every paid
 * plan; you are on Free" (`accessDenial`, apps/api/src/lib/plans.ts). Any
 * paid plan lifts it, so there is no one plan to name.
 */
export function needsPaidPlan(message: string | null | undefined): boolean {
  return /available on every paid plan/i.test(message ?? '');
}

/** Whether a failure is one a plan (or a month's credits) decides, not a fault. */
export function isPlanFailure(error: KjError | null | undefined): boolean {
  return error?.code === 'plan_required' || error?.code === 'quota_exceeded';
}

/**
 * The plan-required (or monthly-limit) card: polite for the reader, with one
 * small line for the site owner that links the pricing page.
 */
export function planStateHtml(error: KjError, lang: Lang, pricingUrl: string): string {
  const owner = html`<p class="kj-state-owner" part="plan-owner">
    ${t(lang, 'plan_owner')}
    <a href="${pricingUrl}" target="_blank" rel="noopener"
      >${pricingUrl.replace(/^https?:\/\//, '')}</a
    >
  </p>`;
  if (error.code === 'quota_exceeded') {
    return stateHtml({
      kind: 'plan',
      part: 'plan-required quota',
      code: error.code,
      title: t(lang, 'quota_title'),
      body: t(lang, 'quota_exceeded'),
      // Credits run out on every plan: a pack is as good an answer as a plan.
      extra: html`<p class="kj-state-owner" part="plan-owner">
        ${t(lang, 'quota_owner')}
        <a href="${pricingUrl}" target="_blank" rel="noopener"
          >${pricingUrl.replace(/^https?:\/\//, '')}</a
        >
      </p>`,
    });
  }
  if (/publishable keys cannot/i.test(error.message)) {
    return stateHtml({
      kind: 'plan',
      part: 'plan-required',
      code: error.code,
      title: t(lang, 'plan_title_generic'),
      body: t(lang, 'plan_browser'),
    });
  }
  if (needsPaidPlan(error.message)) {
    return stateHtml({
      kind: 'plan',
      part: 'plan-required',
      code: error.code,
      title: t(lang, 'plan_title_paid'),
      body: t(lang, 'plan_body_paid'),
      extra: owner,
    });
  }
  const plan = requiredPlan(error.message);
  return stateHtml({
    kind: 'plan',
    part: 'plan-required',
    code: error.code,
    title: plan ? t(lang, 'plan_title', { plan }) : t(lang, 'plan_title_generic'),
    body: plan ? t(lang, 'plan_body', { plan }) : t(lang, 'plan_body_generic'),
    extra: owner,
  });
}

/**
 * A widget on a route closed to publishable keys, on a page with no proxy
 * (decision 23): a polite line for the reader, and one for the site owner
 * with the docs link. Nothing was sent.
 */
export function proxyStateHtml(lang: Lang, docsUrl: string): string {
  return stateHtml({
    kind: 'plan',
    part: 'proxy-required',
    code: 'proxy_required',
    title: t(lang, 'proxy_title'),
    body: t(lang, 'proxy_body'),
    extra: html`<p class="kj-state-owner" part="proxy-owner">
      ${t(lang, 'proxy_owner')}
      <a href="${docsUrl}" target="_blank" rel="noopener">${t(lang, 'proxy_docs')}</a>
    </p>`,
  });
}

// ---------------------------------------------------------------------------
// The day timeline
// ---------------------------------------------------------------------------

/** Minutes since the epoch of a wall clock's own components — no zone involved. */
export function wallMinutes(wall: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as number[];
  return Date.UTC(y!, mo! - 1, d!, h!, mi!) / 60_000;
}

/** A wall clock `minutes` later, as `YYYY-MM-DDTHH:MM`. */
export function addMinutes(wall: string, minutes: number): string {
  const at = wallMinutes(wall);
  if (at === null) return wall;
  return new Date((at + minutes) * 60_000).toISOString().slice(0, 16);
}

/** One stretch of the day. */
export interface Segment {
  start: string | null | undefined;
  end: string | null | undefined;
  tone: 'good' | 'bad' | 'neutral';
  label: string;
}

/** What {@link timelineHtml} draws. */
export interface TimelineOptions {
  sunrise: string;
  sunset?: string | null;
  /** Where the bar ends; `sunrise + 24 h` when the answer has no next sunrise. */
  nextSunrise?: string | null;
  /** Each lane is one row of the bar. */
  lanes: readonly (readonly Segment[])[];
  /** The place's wall clock now, when the day shown is today there. */
  now?: string | null;
  lang: Lang;
}

/**
 * A bar from sunrise through sunset to the next sunrise, the stretches of
 * the day positioned on it by their wall clocks, sunset and "now" ticked,
 * and a legend. The bar is decoration for sighted readers (`aria-hidden`):
 * the same windows are always listed as text beside it by the caller.
 */
export function timelineHtml(options: TimelineOptions): string {
  const { lang } = options;
  const from = wallMinutes(options.sunrise);
  const endWall = options.nextSunrise ?? addMinutes(options.sunrise, 24 * 60);
  const to = wallMinutes(endWall);
  if (from === null || to === null || to <= from) return '';
  const span = to - from;
  const pct = (wall: string | null | undefined) => {
    const at = wallMinutes(wall);
    if (at === null) return null;
    return Math.max(0, Math.min(100, ((at - from) / span) * 100));
  };
  const fix = (n: number) => n.toFixed(2);

  const sunset = pct(options.sunset);
  const night =
    sunset !== null ? `<span class="kj-tl-night" style="left:${fix(sunset)}%;right:0"></span>` : '';

  const lanes = options.lanes
    .map((lane) => {
      const segments = lane
        .map((segment) => {
          const left = pct(segment.start);
          const right = pct(segment.end);
          if (left === null || right === null || right - left <= 0) return '';
          return html`<span
            class="kj-tl-seg kj-tl-${segment.tone}"
            style="left:${fix(left)}%;width:${fix(right - left)}%"
            title="${segment.label} ${clock(segment.start, lang)}–${clock(segment.end, lang)}"
          ></span>`;
        })
        .join('');
      return `<div class="kj-tl-lane">${night}${segments}</div>`;
    })
    .join('');

  const now = pct(options.now);
  const nowTick =
    now !== null && now > 0 && now < 100
      ? html`<span class="kj-tl-now" style="left:${fix(now)}%"
          ><span class="kj-tl-now-label">${t(lang, 'now')}</span></span
        >`
      : '';
  const sunsetTick =
    sunset !== null ? `<span class="kj-tl-tick" style="left:${fix(sunset)}%"></span>` : '';

  const scale = html`<div class="kj-tl-scale">
    <span class="kj-tl-at kj-tl-start">☀︎ ${clock(options.sunrise, lang)}</span>
    ${
      sunset !== null
        ? trusted(
            html`<span class="kj-tl-at kj-tl-mid" style="left:${fix(sunset)}%"
              >☾ ${clock(options.sunset, lang)}</span
            >`,
          )
        : ''
    }
    <span class="kj-tl-at kj-tl-end">
      ${options.nextSunrise ? `☀︎ ${clock(options.nextSunrise, lang)}` : t(lang, 'next_sunrise')}
    </span>
  </div>`;

  const legend = html`<p class="kj-legend" part="legend">
    <span class="kj-key kj-key-good">${t(lang, 'good_time')}</span>
    <span class="kj-key kj-key-bad">${t(lang, 'bad_time')}</span>
    <span class="kj-key kj-key-night">${t(lang, 'night_part')}</span>
  </p>`;

  return html`<figure class="kj-timeline" part="timeline">
    <div class="kj-tl-bar" aria-hidden="true">
      ${trusted(lanes)}${trusted(sunsetTick)}${trusted(nowTick)}
    </div>
    <div aria-hidden="true">${trusted(scale)}</div>
    <figcaption>${trusted(legend)}</figcaption>
  </figure>`;
}

// ---------------------------------------------------------------------------
// The ring gauge
// ---------------------------------------------------------------------------

/**
 * A score as a ring: the track, the filled arc in the verdict's tone, the
 * number in the middle. `role=meter` carries the value for screen readers.
 */
export function ringHtml(
  value: number,
  max: number,
  tone: string,
  label: string,
  caption: string,
): string {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const shown = String(Math.round(value * 100) / 100);
  return html`<div
    class="kj-ring ${tone}"
    part="gauge"
    role="meter"
    aria-label="${label}"
    aria-valuemin="0"
    aria-valuemax="${max}"
    aria-valuenow="${value}"
  >
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle class="kj-ring-track" cx="60" cy="60" r="${radius}" />
      <circle
        class="kj-ring-fill"
        cx="60"
        cy="60"
        r="${radius}"
        stroke-dasharray="${length.toFixed(2)}"
        stroke-dashoffset="${(length * (1 - fraction)).toFixed(2)}"
        transform="rotate(-90 60 60)"
      />
    </svg>
    <span class="kj-ring-text"
      ><strong part="total">${shown}</strong><small>${caption}</small></span
    >
  </div>`;
}
