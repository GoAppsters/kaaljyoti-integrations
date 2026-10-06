/**
 * What the stage-2 widget tests share: a routed `fetch` over the recorded
 * fixtures, mounting, settling, filling the one-person birth form.
 */
import { vi } from 'vitest';
import chartFixture from './fixtures/chart.json';
import kundli from './fixtures/kundli-0142.json';
import panchangMonth from './fixtures/panchang-month.json';
import ephemerisMonth from './fixtures/ephemeris-month.json';
import vikramSamvat from './fixtures/vikram-samvat.json';
import panchangDay from './fixtures/panchang-2026-10-02.json';
import transitNow from './fixtures/transit-now.json';
import kundliYogas from './fixtures/kundli-yogas.json';
import sadeSati from './fixtures/sade-sati-2026.json';
import dasha3 from './fixtures/dasha-vimshottari-3.json';
import yogini from './fixtures/dasha-yogini.json';
import vargasAll from './fixtures/vargas-all.json';
import kp from './fixtures/kp.json';
import shadbala from './fixtures/shadbala.json';
import ashtakavarga from './fixtures/ashtakavarga.json';
import varshphal from './fixtures/varshphal.json';
import readingVarshphal from './fixtures/reading-varshphal.json';
import readingLifeAreas from './fixtures/reading-life-areas.json';
import readingVimshottari from './fixtures/reading-vimshottari.json';
import readingNakshatra from './fixtures/reading-nakshatra.json';
import readingLagna from './fixtures/reading-lagna.json';
import pubClosed from './fixtures/error-pub-closed.json';

export const SVG = (chartFixture as { data: { svg: string } }).data.svg;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-KJ-Plan': 'growth' },
  });
}

/**
 * A request the month's credits no longer cover, as the gateway words it
 * (402). No plan gates a route, so this is the refusal a widget can meet.
 */
export const OUT_OF_CREDITS = {
  status: 'error',
  error: {
    code: 'quota_exceeded',
    message:
      "this request costs 5 credits, more than is left of this month's 1,000 (1,000 included in the Free plan)",
    docs: 'https://kaaljyoti.com/api/docs/errors#quota_exceeded',
  },
};

/** The refusal a publishable key gets on a server-only route (recorded on staging). */
export const PUB_CLOSED = pubClosed;

/** Route → fixture, by the path after `/v1`. */
const ROUTES: Record<string, unknown> = {
  '/panchang/month': panchangMonth,
  '/ephemeris/month': ephemerisMonth,
  '/calendar/vikram-samvat': vikramSamvat,
  '/panchang': panchangDay,
  '/transit/now': transitNow,
  '/kundli/yogas': kundliYogas,
  '/kundli/sade-sati': sadeSati,
  '/kundli/vargas': vargasAll,
  '/kp/chart': kp,
  '/kundli/shadbala': shadbala,
  '/kundli/ashtakavarga': ashtakavarga,
  '/varshphal': varshphal,
  '/reports/varshphal': readingVarshphal,
  '/reports/life-areas': readingLifeAreas,
  '/reports/vimshottari': readingVimshottari,
  '/reports/nakshatra': readingNakshatra,
  '/reports/lagna': readingLagna,
  '/kundli': kundli,
};

/** One recorded call: where it went, and what it carried. */
export interface Call {
  url: string;
  /** The API path (`/kundli/dasha`), for a direct call and a proxied one alike. */
  path: string;
  body: Record<string, unknown>;
  proxied: boolean;
}

/**
 * A `fetch` that answers every route from its fixture; `overrides` (by API
 * path) win. A proxied request (`POST /proxy` with `{path, body}`) is
 * answered the same way.
 */
export function stubFetch(overrides: Record<string, () => Response> = {}) {
  const calls: Call[] = [];
  const answer = (path: string, body: Record<string, unknown>): Response => {
    const override = overrides[path];
    if (override) return override();
    if (path === '/kundli/chart') {
      return new Response(SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    }
    if (path === '/kundli/dasha') return json(body.system === 'yogini' ? yogini : dasha3);
    const fixture = ROUTES[path];
    return fixture ? json(fixture) : json({ status: 'error', error: { code: 'not_found' } }, 404);
  };
  const fetchMock = vi.fn().mockImplementation((input: string, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost/');
    const sent = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (url.pathname.startsWith('/v1/')) {
      const path = url.pathname.slice(3);
      calls.push({ url: url.href, path, body: sent, proxied: false });
      return Promise.resolve(answer(path, sent));
    }
    const path = String(sent.path);
    const body = (sent.body ?? {}) as Record<string, unknown>;
    calls.push({ url: url.href, path, body, proxied: true });
    return Promise.resolve(answer(path, body));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls, paths: () => calls.map((call) => call.path) };
}

/** A `fetch` that never answers: the loading state stays. */
export function hangingFetch() {
  const fetchMock = vi.fn().mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Register (once) and put an element in the page. */
export function mount<T extends HTMLElement>(
  element: CustomElementConstructor & { readonly tag: string },
  attrs: Record<string, string> = {},
): T {
  if (!customElements.get(element.tag)) customElements.define(element.tag, element);
  const node = document.createElement(element.tag) as T;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  document.body.append(node);
  return node;
}

/** The fixtures' birth, as attributes. */
export const BIRTH_ATTRS = {
  datetime: '1990-05-14T10:30:00',
  lat: '28.6139',
  lon: '77.209',
  timezone: 'Asia/Kolkata',
  place: 'New Delhi',
};

/** 14 May 1990, 10:30 AM at Varanasi, into a form's fields. */
export function fillBirth(scope: ParentNode): void {
  const values: Record<string, string> = {
    name: 'Asha',
    day: '14',
    month: '5',
    year: '1990',
    hour: '10',
    minute: '30',
    ampm: 'am',
    lat: '25.3176',
    lon: '82.9739',
    tz: 'Asia/Kolkata',
    label: 'Varanasi',
  };
  for (const [name, value] of Object.entries(values)) {
    const input = scope.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-field="${name}"]`,
    );
    if (!input) continue;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** happy-dom does not submit from a button; dispatch the event a browser would. */
export function submitForm(root: ParentNode): void {
  root
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

/** Text of a shadow root, whitespace collapsed. */
export function text(node: Element | ShadowRoot | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
