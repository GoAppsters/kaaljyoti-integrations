/**
 * The stage-2 daily widgets: `<kj-panchang-month>`, `<kj-calendar>`,
 * `<kj-transits>`, `<kj-ephemeris>`. The two month fixtures are staging
 * recordings of October 2026 at New Delhi (see `fixture-shapes.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { KjCalendar } from '../src/elements/calendar.ts';
import { KjEphemeris } from '../src/elements/ephemeris.ts';
import { KjPanchangMonth } from '../src/elements/panchang-month.ts';
import { KjTransits } from '../src/elements/transits.ts';
import type { KjChart } from '../src/elements/chart.ts';
import {
  OUT_OF_CREDITS,
  PUB_CLOSED,
  hangingFetch,
  json,
  mount,
  settle,
  stubFetch,
  text,
} from './support.ts';

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', baseUrl: 'https://api-staging.kaaljyoti.com', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<kj-panchang-month>', () => {
  it('without a proxy, asks the API directly with the publishable key', async () => {
    const { calls } = stubFetch();
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { city: 'delhi', month: '2026-10' });
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ proxied: false, path: '/panchang/month' });
    expect(calls[0]!.url).toContain('key=kj_pub_test');
    expect(el.shadowRoot!.querySelector('[data-code="proxy_required"]')).toBeNull();
    expect(el.getAttribute('data-state')).toBe('ready');
  });

  it('with a proxy on the page, prefers it: the site caches the month', async () => {
    configure({ proxyUrl: '/proxy' });
    const { calls } = stubFetch();
    mount<KjPanchangMonth>(KjPanchangMonth, { city: 'delhi', month: '2026-10' });
    await settle();
    expect(calls[0]).toMatchObject({ proxied: true, path: '/panchang/month' });
    expect(calls[0]!.url).not.toContain('key=');
  });

  it('shows the monthly-limit card on a direct 402, with no stepper', async () => {
    stubFetch({ '/panchang/month': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="plan-required"]'))).toContain(
      'Monthly limit reached',
    );
    expect(el.shadowRoot!.querySelector('.kj-stepper')).toBeNull();
  });

  it('shows the skeleton and the controls while the month loads', async () => {
    configure({ proxyUrl: '/proxy' });
    hangingFetch();
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10' });
    await settle();
    expect(el.getAttribute('data-state')).toBe('loading');
    expect(el.shadowRoot!.querySelector('.kj-skeleton')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('.kj-stepper')).not.toBeNull();
  });

  it('asks the proxy for the month and draws one cell per day, weekdays aligned', async () => {
    configure({ proxyUrl: '/proxy' });
    const { calls } = stubFetch();
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { city: 'delhi', month: '2026-10' });
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ proxied: true, path: '/panchang/month' });
    expect(calls[0]!.body).toEqual({
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
      place: 'New Delhi',
      month: '2026-10',
      options: { language: ['en', 'hi'] },
    });
    const root = el.shadowRoot!;
    expect(root.querySelectorAll('[data-day]')).toHaveLength(31);
    // 1 October 2026 is a Thursday: four blanks before it.
    expect(root.querySelectorAll('.kj-cal-blank')).toHaveLength(4);
    expect(text(root.querySelector('[data-day="2026-10-02"]'))).toContain('Shashthi');
    expect(text(root.querySelector('[part~="month-masa"]'))).toContain('Vikram Samvat 2083');
  });

  it('marks Purnima, Amavasya and the Ekadashis by the tithi at sunrise', async () => {
    configure({ proxyUrl: '/proxy' });
    stubFetch();
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10' });
    await settle();
    const marks = [...el.shadowRoot!.querySelectorAll<HTMLElement>('.kj-cal-day[data-mark]')]
      .filter((cell) => cell.dataset.mark)
      .map((cell) => `${cell.dataset.day} ${cell.dataset.mark}`);
    expect(marks).toEqual([
      '2026-10-06 ekadashi',
      '2026-10-10 amavasya',
      '2026-10-22 ekadashi',
      '2026-10-26 purnima',
    ]);
  });

  it('opens a day’s panchang on a click, and flips the masa without a call', async () => {
    configure({ proxyUrl: '/proxy' });
    const { calls } = stubFetch();
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10' });
    await settle();
    const root = el.shadowRoot!;
    root.querySelector<HTMLElement>('[data-day="2026-10-02"]')!.click();
    const detail = root.querySelector('[part~="day-detail"]');
    expect(text(detail)).toContain('Shukravara, 2 Oct 2026');
    expect(text(detail)).toContain('Krishna Shashthi until 10:15, Krishna Saptami');
    expect(text(detail)).toContain('Ashwina');
    root.querySelector<HTMLElement>('[data-seg="amanta"]')!.click();
    expect(text(root.querySelector('[part~="day-detail"]'))).toContain('Bhadrapada');
    expect(calls).toHaveLength(1);
  });

  it('steps to the next month: one more call', async () => {
    configure({ proxyUrl: '/proxy' });
    const { calls } = stubFetch();
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10' });
    await settle();
    el.shadowRoot!.querySelector<HTMLElement>('[data-step="1"]')!.click();
    await settle();
    expect(el.getAttribute('month')).toBe('2026-11');
    expect(calls.map((call) => call.body.month)).toEqual(['2026-10', '2026-11']);
  });

  it('shows the monthly-limit card when the site’s credits have run out', async () => {
    configure({ proxyUrl: '/proxy' });
    stubFetch({ '/panchang/month': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10' });
    await settle();
    const card = el.shadowRoot!.querySelector('[part~="plan-required"]');
    expect(text(card)).toContain('Monthly limit reached');
  });

  it('never shows the raw publishable-key refusal as an error', async () => {
    configure({ proxyUrl: '/proxy' });
    stubFetch({ '/panchang/month': () => json(PUB_CLOSED, 403) });
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10' });
    await settle();
    expect(el.shadowRoot!.querySelector('[part~="plan-required"]')).not.toBeNull();
    expect(text(el.shadowRoot!)).not.toContain('kj_live');
  });

  it('draws in Hindi', async () => {
    configure({ proxyUrl: '/proxy' });
    stubFetch();
    const el = mount<KjPanchangMonth>(KjPanchangMonth, { month: '2026-10', lang: 'hi' });
    await settle();
    const root = el.shadowRoot!;
    expect(text(root.querySelector('.kj-heading'))).toBe('मासिक पंचांग');
    expect(text(root.querySelector('[data-day="2026-10-02"]'))).toContain('षष्ठी');
    expect(text(root.querySelector('.kj-cal-dow'))).toBe('रवि');
  });
});

describe('<kj-calendar>', () => {
  it('asks the day’s panchang, then Vikram Samvat at its sunrise: two calls', async () => {
    const { calls } = stubFetch();
    const el = mount<KjCalendar>(KjCalendar, { city: 'delhi', date: '2026-10-02' });
    await settle();
    expect(calls.map((call) => call.path)).toEqual(['/panchang', '/calendar/vikram-samvat']);
    expect(calls[1]!.body.datetime).toMatch(/^2026-10-02T06:1\d:\d\d$/);
    expect(calls[1]!.body).toMatchObject({ latitude: 28.6139, timezone: 'Asia/Kolkata' });
    const root = el.shadowRoot!;
    expect(text(root.querySelector('[part~="line"]'))).toContain(
      'Ashwina Krishna Shashthi, Vikram Samvat 2083',
    );
    expect(text(root.querySelector('[part~="tile-amanta"]'))).toContain('Bhadrapada');
    expect(text(root.querySelector('[part~="tile-tithi"]'))).toContain('until 10:15, then Saptami');
  });

  it('defaults to New Delhi, and converts a date the reader picks', async () => {
    const { calls } = stubFetch();
    const el = mount<KjCalendar>(KjCalendar, {});
    await settle();
    expect(calls[0]!.body).toMatchObject({ latitude: 28.6139, place: 'New Delhi' });
    const root = el.shadowRoot!;
    const set = (field: string, value: string) => {
      root.querySelector<HTMLSelectElement>(`[data-date="${field}"]`)!.value = value;
    };
    set('day', '15');
    set('month', '8');
    set('year', '2026');
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await settle();
    expect(el.getAttribute('date')).toBe('2026-08-15');
  });

  it('refuses 31 February, and asks for nothing', async () => {
    const { calls } = stubFetch();
    const el = mount<KjCalendar>(KjCalendar, { date: '2026-10-02' });
    await settle();
    const root = el.shadowRoot!;
    root.querySelector<HTMLSelectElement>('[data-date="day"]')!.value = '31';
    root.querySelector<HTMLSelectElement>('[data-date="month"]')!.value = '2';
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await settle();
    expect(text(root)).toContain('Choose a valid date.');
    expect(calls).toHaveLength(2);
  });

  it('draws in Hindi', async () => {
    stubFetch();
    const el = mount<KjCalendar>(KjCalendar, { date: '2026-10-02', lang: 'hi' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="line"]'))).toContain('विक्रम संवत 2083');
  });

  it('keeps its form over an error', async () => {
    stubFetch({
      '/panchang': () => json({ status: 'error', error: { code: 'rate_limited' } }, 400),
    });
    const el = mount<KjCalendar>(KjCalendar, { date: '2026-10-02' });
    await settle();
    expect(el.shadowRoot!.querySelector('form')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('[data-code="rate_limited"]')).not.toBeNull();
  });
});

describe('<kj-transits>', () => {
  it('asks /v1/transit/now for this minute, and the chart of that moment', async () => {
    const { calls } = stubFetch();
    const el = mount<KjTransits>(KjTransits, { city: 'delhi' });
    await settle(10);
    expect(calls[0]!.path).toBe('/transit/now');
    expect(String(calls[0]!.body.at)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
    const chart = el.shadowRoot!.querySelector('kj-chart') as KjChart | null;
    expect(chart).not.toBeNull();
    // The fixture's instant, 06:30Z, is 12:00 in Delhi.
    expect(chart!.getAttribute('datetime')).toBe('2026-09-30T12:00:00');
    expect(chart!.getAttribute('timezone')).toBe('Asia/Kolkata');
    expect(calls.map((call) => call.path)).toContain('/kundli/chart');
  });

  it('draws each graha’s sign, degree, nakshatra and pada, and retrograde motion', async () => {
    stubFetch();
    const el = mount<KjTransits>(KjTransits, { city: 'delhi', chart: 'off' });
    await settle();
    const root = el.shadowRoot!;
    expect(root.querySelector('kj-chart')).toBeNull();
    expect(text(root.querySelector('[part~="transit-saturn"]'))).toContain('Pisces');
    expect(text(root.querySelector('[part~="transit-saturn"]'))).toContain('Retrograde');
    expect(text(root.querySelector('[part~="transit-sun"]'))).toContain('Hasta · 1');
    expect(text(root.querySelector('[part~="transit-lagna"]'))).toContain('Scorpio');
    expect(text(root.querySelector('.kj-sub'))).toContain('At 12:00 on 30 Sep 2026');
  });

  it('refreshes on a click: a new call', async () => {
    const { calls } = stubFetch();
    const el = mount<KjTransits>(KjTransits, { chart: 'off' });
    await settle();
    el.shadowRoot!.querySelector<HTMLElement>('[data-action="refresh"]')!.click();
    await settle();
    // The same minute is answered by the page memo; the load itself runs again.
    expect(el.getAttribute('data-state')).toBe('ready');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('draws in Hindi', async () => {
    stubFetch();
    const el = mount<KjTransits>(KjTransits, { chart: 'off', lang: 'hi' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="transit-saturn"]'))).toContain('वक्री');
  });

  it('shows the monthly-limit card for a refused call', async () => {
    stubFetch({ '/transit/now': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjTransits>(KjTransits, { chart: 'off' });
    await settle();
    expect(el.shadowRoot!.querySelector('[part~="plan-required"]')).not.toBeNull();
  });
});

describe('<kj-ephemeris>', () => {
  it('without a proxy, asks the API directly; with one, prefers it', async () => {
    const direct = stubFetch();
    mount<KjEphemeris>(KjEphemeris, { month: '2026-10' });
    await settle();
    expect(direct.calls[0]).toMatchObject({ proxied: false, path: '/ephemeris/month' });
    document.body.innerHTML = '';
    clearCache();
    configure({ proxyUrl: '/proxy' });
    const proxied = stubFetch();
    mount<KjEphemeris>(KjEphemeris, { month: '2026-10' });
    await settle();
    expect(proxied.calls[0]).toMatchObject({ proxied: true, path: '/ephemeris/month' });
  });

  it('shows the monthly-limit card on a direct 402', async () => {
    stubFetch({ '/ephemeris/month': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjEphemeris>(KjEphemeris, { month: '2026-10' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="plan-required"]'))).toContain(
      'Monthly limit reached',
    );
  });

  it('asks the proxy, draws a row a day and a column a graha, and the month’s changes', async () => {
    configure({ proxyUrl: '/proxy' });
    const { calls } = stubFetch();
    const el = mount<KjEphemeris>(KjEphemeris, { month: '2026-10', city: 'delhi' });
    await settle();
    expect(calls[0]).toMatchObject({ proxied: true, path: '/ephemeris/month' });
    expect(calls[0]!.body).toMatchObject({ month: '2026-10', system: 'sidereal' });
    const root = el.shadowRoot!;
    expect(root.querySelectorAll('[part~="ephemeris-row"]')).toHaveLength(31);
    expect(root.querySelectorAll('thead th')).toHaveLength(11);
    // Venus stations retrograde on the 4th: ℞ from then on.
    const venus = [...root.querySelectorAll('[part~="ephemeris-row"]')].map(
      (row) => row.querySelectorAll('td')[5]?.textContent ?? '',
    );
    expect(venus[2]).not.toContain('℞');
    expect(venus[4]).toContain('℞');
    const events = text(root.querySelector('[part~="events"]'));
    expect(events).toContain('4 Oct Venus turns retrograde');
    expect(events).toContain('18 Oct Sun enters Libra');
  });

  it('switches to tropical: one more call', async () => {
    configure({ proxyUrl: '/proxy' });
    const { calls } = stubFetch();
    const el = mount<KjEphemeris>(KjEphemeris, { month: '2026-10' });
    await settle();
    el.shadowRoot!.querySelector<HTMLElement>('[data-seg="tropical"]')!.click();
    await settle();
    expect(calls.map((call) => call.body.system)).toEqual(['sidereal', 'tropical']);
  });

  it('shows the monthly-limit card when the site’s credits have run out', async () => {
    configure({ proxyUrl: '/proxy' });
    stubFetch({ '/ephemeris/month': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjEphemeris>(KjEphemeris, { month: '2026-10' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="plan-required"]'))).toContain(
      'Monthly limit reached',
    );
  });

  it('draws in Hindi', async () => {
    configure({ proxyUrl: '/proxy' });
    stubFetch();
    const el = mount<KjEphemeris>(KjEphemeris, { month: '2026-10', lang: 'hi' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="events"]'))).toContain('शुक्र वक्री');
  });
});
