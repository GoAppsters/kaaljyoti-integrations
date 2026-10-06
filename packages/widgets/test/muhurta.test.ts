import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KjMuhurta } from '../src/elements/muhurta.ts';
import { KjPanchang } from '../src/elements/panchang.ts';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import panchangFixture from './fixtures/panchang.json';
import muhurtaFixture from './fixtures/muhurta-place.json';

for (const element of [KjMuhurta, KjPanchang]) {
  if (!customElements.get(element.tag)) customElements.define(element.tag, element);
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

/** `/v1/panchang/muhurta` answers the muhurta fixture, everything else the panchang. */
function stubFetch() {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        json(String(url).includes('/v1/panchang/muhurta') ? muhurtaFixture : panchangFixture),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function place(tag: string, attrs: Record<string, string> = {}): Element {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

async function mount(attrs: Record<string, string> = {}): Promise<Element> {
  const element = place('kj-muhurta', attrs);
  await settle();
  return element;
}

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', baseUrl: 'https://api-staging.kaaljyoti.com', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<kj-muhurta>', () => {
  it('asks /v1/panchang/muhurta for the place, with both languages', async () => {
    const fetchMock = stubFetch();
    await mount({ city: 'delhi', date: '2026-09-30' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/panchang/muhurta?');
    expect(JSON.parse(String(init.body))).toEqual({
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
      place: 'New Delhi',
      date: '2026-09-30',
      options: { language: ['en', 'hi'] },
    });
  });

  it('draws the day timeline: choghadiyas on one lane, the windows on the other', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });
    const root = element.shadowRoot;
    expect(element.getAttribute('data-state')).toBe('ready');
    expect(root?.querySelector('[part="title"]')?.textContent).toBe('Muhurta and choghadiya');
    expect(root?.querySelector('[part="subtitle"]')?.textContent).toContain(
      'New Delhi · 30 Sep 2026',
    );
    const lanes = root?.querySelectorAll('.kj-tl-lane') ?? [];
    expect(lanes).toHaveLength(2);
    // Eight by day and eight by night.
    expect(lanes[0]?.querySelectorAll('.kj-tl-seg')).toHaveLength(16);
    // Abhijit does not apply on this day (a Wednesday); the three to avoid do.
    expect(lanes[1]?.querySelectorAll('.kj-tl-bad')).toHaveLength(3);
    expect(lanes[1]?.querySelectorAll('.kj-tl-good')).toHaveLength(0);
    const scale = root?.querySelector('.kj-tl-scale')?.textContent ?? '';
    expect(scale).toContain('06:17');
    expect(scale).toContain('18:04');
  });

  it('lists the windows as text with their times', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });
    const items = [...(element.shadowRoot?.querySelectorAll('[part~="window"]') ?? [])].map(
      (item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(items).toEqual([
      'Rahu kaal 12:11–13:39',
      'Yamaganda 07:45–09:14',
      'Gulika kaal 10:42–12:11',
    ]);
  });

  it('shows the day choghadiyas as a table, and the night ones on a switch', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });
    const root = element.shadowRoot;
    // Pin the half regardless of the clock the test runs at.
    root?.querySelector<HTMLElement>('[data-seg="day"]')?.click();
    let rows = [...(root?.querySelectorAll('[part="choghadiya"]') ?? [])];
    expect(rows).toHaveLength(8);
    expect(rows[0]?.textContent).toContain('Labh');
    expect(rows[0]?.textContent).toContain('06:17–07:45');
    expect(rows[0]?.textContent).toContain('Auspicious');
    expect(rows[2]?.textContent).toContain('Avoid');

    root?.querySelector<HTMLElement>('[data-seg="night"]')?.click();
    rows = [...(root?.querySelectorAll('[part="choghadiya"]') ?? [])];
    expect(rows).toHaveLength(8);
    expect(root?.querySelector('[data-seg="night"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('translates without a second call', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ city: 'delhi' });
    element.setAttribute('lang', 'hi');
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot?.textContent).toContain('राहु काल');
    expect(element.shadowRoot?.textContent).toContain('चौघड़िया');
    expect(element.shadowRoot?.querySelector('.kj-card')?.getAttribute('lang')).toBe('hi');
  });

  it('makes its own call beside a <kj-panchang>, and one for two muhurtas', async () => {
    const fetchMock = stubFetch();
    place('kj-panchang', { city: 'delhi' });
    place('kj-muhurta', { city: 'delhi' });
    place('kj-muhurta', { city: 'delhi', lang: 'hi' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows no_place without spending a call', async () => {
    const fetchMock = stubFetch();
    const element = await mount({});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.shadowRoot?.querySelector('[data-code]')?.getAttribute('data-code')).toBe(
      'no_place',
    );
  });
});
