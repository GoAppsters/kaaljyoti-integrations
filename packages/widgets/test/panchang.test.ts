import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KjPanchang } from '../src/elements/panchang.ts';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import panchangFixture from './fixtures/panchang.json';

// Registered here rather than through `define()`, so this file depends on the
// two elements it is about and not on all four.
if (!customElements.get(KjPanchang.tag)) customElements.define(KjPanchang.tag, KjPanchang);

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

/** A `fetch` that always answers with the recorded staging panchang. */
function stubFetch() {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(panchangFixture)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Let the queued microtasks and the settled promises run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(attrs: Record<string, string> = {}): Promise<KjPanchang> {
  const element = document.createElement('kj-panchang') as KjPanchang;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  await settle();
  return element;
}

const markup = (element: Element) => element.shadowRoot?.innerHTML ?? '';

/** The body of call `index`, parsed. */
function bodyOf(fetchMock: ReturnType<typeof stubFetch>, index = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
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

describe('<kj-panchang> rendering', () => {
  it('renders the place, the day and the five limbs in English', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });

    expect(element.getAttribute('data-state')).toBe('ready');
    const text = element.shadowRoot?.textContent ?? '';
    expect(text).toContain('New Delhi');
    expect(text).toContain('22 Sep 2026');
    expect(text).toContain('Mangalavara');
    expect(text).toContain('Shukla Ekadashi');
    expect(text).toContain('Shravana');
    expect(text).toContain('Atiganda');
    expect(text).toContain('Vishti');
    expect(text).toContain('Bhadrapada');
    expect(text).toContain('Vikram Samvat 2083');
  });

  it('renders the same document in Hindi, with lang on the wrapper', async () => {
    stubFetch();
    const element = await mount({ city: 'varanasi', lang: 'hi' });

    const text = element.shadowRoot?.textContent ?? '';
    expect(text).toContain('वाराणसी');
    expect(text).toContain('एकादशी');
    expect(text).toContain('श्रवण');
    expect(text).toContain('अतिगण्ड');
    expect(text).toContain('भाद्रपद');
    // Devanagari needs the language on the element the text is in.
    expect(element.shadowRoot?.querySelector('.kj-card')?.getAttribute('lang')).toBe('hi');
  });

  it('prefixes an adhik month in either language', async () => {
    const adhik = structuredClone(panchangFixture) as { data: { masa: { is_adhik: boolean } } };
    adhik.data.masa.is_adhik = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(json(adhik))),
    );

    const english = await mount({ city: 'delhi' });
    expect(english.shadowRoot?.querySelector('[part~="masa-value"]')?.textContent).toContain(
      'Adhik Bhadrapada',
    );
    const hindi = await mount({ city: 'delhi', lang: 'hi' });
    expect(hindi.shadowRoot?.querySelector('[part~="masa-value"]')?.textContent).toContain(
      'अधिक भाद्रपद',
    );
  });

  it('slices the wall clocks rather than parsing them', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });

    const text = element.shadowRoot?.textContent ?? '';
    expect(text).toContain('until 21:44'); // tithi_ends 21:44:09.978
    expect(text).toContain('until 16:29'); // yoga_ends
    expect(text).toContain('06:13'); // sunrise
    expect(text).toContain('18:14'); // sunset
  });

  it('says tomorrow for a limb that ends after midnight', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });

    // `at` is the 22nd and `nakshatra_ends` is 09:09 on the 23rd: a bare
    // `09:09` would read as this morning, which has already gone.
    const nakshatra = element.shadowRoot?.querySelector('[part~="tile-nakshatra"]');
    expect(nakshatra?.querySelector('[part~="nakshatra-value"]')?.textContent).toContain(
      'Shravana',
    );
    expect(nakshatra?.textContent).toContain('until tomorrow 09:09');
  });

  it('keeps the Hindi word order when it says tomorrow', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi', lang: 'hi' });

    const nakshatra = element.shadowRoot?.querySelector('[part~="tile-nakshatra"]');
    expect(nakshatra?.textContent).toContain('कल 09:09 तक');
  });

  it('says nothing extra for a limb that ends on the day itself', async () => {
    const sameDay = structuredClone(panchangFixture) as { data: { nakshatra_ends: string } };
    sameDay.data.nakshatra_ends = '2026-09-22T09:09:22.500';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(sameDay)));

    const element = await mount({ city: 'delhi' });
    const nakshatra = element.shadowRoot?.querySelector('[part~="tile-nakshatra"]');
    expect(nakshatra?.textContent).toContain('until 09:09');
    expect(nakshatra?.textContent).not.toContain('tomorrow');
  });

  it('names both tithis on a day that holds two', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });

    const tile = element.shadowRoot?.querySelector('[part~="tile-tithi"]');
    expect(tile?.querySelector('[part~="tithi-value"]')?.textContent).toContain('Shukla Ekadashi');
    const tithi = tile?.textContent ?? '';
    expect(tithi).toContain('until 21:44, then Dwadashi');
    // One paksha for both: it only changes at Purnima and Amavasya.
    expect(tithi.match(/Shukla/g)).toHaveLength(1);
  });

  it('puts the Hindi postposition after the clock', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi', lang: 'hi' });

    const tithi = element.shadowRoot?.querySelector('[part~="tile-tithi"]')?.textContent ?? '';
    expect(tithi).toContain('एकादशी');
    expect(tithi).toContain('21:44 तक, फिर द्वादशी');
  });

  it('renders the pada and the translated disha shool', async () => {
    stubFetch();
    const english = await mount({ city: 'delhi' });
    expect(english.shadowRoot?.textContent).toContain('Pada 1');
    expect(english.shadowRoot?.textContent).toContain('North');

    const hindi = await mount({ city: 'delhi', lang: 'hi' });
    expect(hindi.shadowRoot?.textContent).toContain('उत्तर');
  });
});

describe('<kj-panchang> windows', () => {
  it('lists the five windows, marked by what they are, beside the day timeline', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });
    const root = element.shadowRoot;

    expect(root?.querySelectorAll('[part~="window"]')).toHaveLength(5);
    expect(root?.querySelectorAll('[part~="window"] .kj-dot-good')).toHaveLength(2);
    expect(root?.querySelectorAll('[part~="window"] .kj-dot-bad')).toHaveLength(3);

    const rahu = root?.querySelector('[part~="rahu_kaal"]')?.textContent ?? '';
    expect(rahu).toContain('Rahu kaal');
    expect(rahu).toContain('15:14–16:44');

    const brahma = root?.querySelector('[part~="brahma_muhurta"]');
    expect(brahma?.querySelector('.kj-dot-good')).not.toBeNull();
    expect(brahma?.textContent).toContain('04:37–05:25');
  });

  it('draws the timeline: abhijit on one lane, the three to avoid on the other', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });
    const root = element.shadowRoot;
    const lanes = root?.querySelectorAll('.kj-tl-lane') ?? [];
    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.querySelectorAll('.kj-tl-good')).toHaveLength(1);
    expect(lanes[1]?.querySelectorAll('.kj-tl-bad')).toHaveLength(3);
    // The bar is decoration; the list carries the times for screen readers.
    expect(root?.querySelector('.kj-tl-bar')?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.querySelector('[part="legend"]')?.textContent).toContain('Auspicious');
  });

  it('draws tiles for the limbs, with a title and a subtitle for the day', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi' });
    const root = element.shadowRoot;
    expect(root?.querySelector('[part="title"]')?.textContent).toBe('Panchang');
    expect(root?.querySelector('[part="subtitle"]')?.textContent).toContain(
      'New Delhi · 22 Sep 2026',
    );
    for (const key of ['tithi', 'nakshatra', 'yoga', 'karana', 'vara', 'masa', 'sunrise']) {
      expect(root?.querySelector(`[part~="tile-${key}"]`), key).not.toBeNull();
    }
  });
});

describe('<kj-panchang> show', () => {
  it('renders only the blocks it names', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi', show: 'tithi masa' });
    const text = element.shadowRoot?.textContent ?? '';

    expect(text).toContain('Ekadashi');
    expect(text).toContain('Bhadrapada');
    expect(text).not.toContain('Shravana');
    expect(text).not.toContain('New Delhi');
    expect(element.shadowRoot?.querySelectorAll('[part~="window"]')).toHaveLength(0);
  });

  it('falls back to everything when show names nothing we know', async () => {
    stubFetch();
    const element = await mount({ city: 'delhi', show: 'moonphase' });
    expect(element.shadowRoot?.textContent).toContain('Shravana');
  });
});

describe('<kj-panchang> request', () => {
  it('sends the place, the zone and both languages, and no date for today', async () => {
    const fetchMock = stubFetch();
    await mount({ city: 'delhi', date: 'today' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchMock);
    expect(body).toEqual({
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
      place: 'New Delhi',
      options: { language: ['en', 'hi'] },
    });
  });

  it('sends an explicit date', async () => {
    const fetchMock = stubFetch();
    await mount({ city: 'delhi', date: '2026-09-22' });
    expect(bodyOf(fetchMock).date).toBe('2026-09-22');
  });

  it('drops a date that is not YYYY-MM-DD, which means today', async () => {
    const fetchMock = stubFetch();
    await mount({ city: 'delhi', date: 'tomorrow' });
    expect(bodyOf(fetchMock).date).toBeUndefined();
  });

  it('lets lat/lon override the city, keeping the city as the label', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ city: 'delhi', lat: '19.076', lon: '72.8777' });

    const body = bodyOf(fetchMock);
    expect(body.latitude).toBe(19.076);
    expect(body.longitude).toBe(72.8777);
    expect(body.timezone).toBeUndefined();
    expect(markup(element)).toContain('New Delhi');
  });

  it('labels bare coordinates with themselves', async () => {
    stubFetch();
    const element = await mount({ lat: '51.5072', lon: '-0.1276', timezone: 'Europe/London' });
    expect(element.shadowRoot?.textContent).toContain('51.5072, -0.1276');
  });

  it('shows no_place without spending a call when there is no place', async () => {
    const fetchMock = stubFetch();
    const element = await mount({});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.getAttribute('data-state')).toBe('error');
    expect(element.shadowRoot?.querySelector('[data-code]')?.getAttribute('data-code')).toBe(
      'no_place',
    );
  });

  it('re-renders a lang flip from the answer it already has', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ city: 'delhi' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    element.setAttribute('lang', 'hi');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot?.textContent).toContain('एकादशी');
  });

  it('escapes what the response says', async () => {
    const hostile = structuredClone(panchangFixture) as { data: { disha_shool: string } };
    hostile.data.disha_shool = '<img src=x onerror=alert(1)>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(hostile)));

    const element = await mount({ city: 'delhi' });
    expect(markup(element)).toContain('&lt;img');
    expect(markup(element)).not.toContain('<img');
  });
});

describe('<kj-panchang> with a key that is not publishable', () => {
  it('paints the secret-key line and sends nothing', async () => {
    configure({ key: 'kj_live_abc123' });
    const fetchMock = stubFetch();
    const element = await mount({ city: 'delhi' });

    expect(element.getAttribute('data-state')).toBe('error');
    expect(element.shadowRoot?.textContent ?? '').toContain('secret Kaal Jyoti key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('<kj-panchang> when the API cannot be reached', () => {
  const failing = () =>
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  const settled = async () => {
    for (let i = 0; i < 20; i++) await settle();
  };

  it('names the page origin, since an unlisted origin is the usual cause with a publishable key', async () => {
    failing();
    const element = await mount({ city: 'delhi' });
    await settled();
    expect(markup(element)).toContain('Could not reach Kaal Jyoti.');
    expect(markup(element)).toContain(location.origin);
  });

  it('says so in Hindi too', async () => {
    failing();
    const element = await mount({ city: 'delhi', lang: 'hi' });
    await settled();
    expect(markup(element)).toContain(location.origin);
    expect(markup(element)).toContain('काल ज्योति तक नहीं पहुँच सके।');
  });

  it('keeps the plain line when every request goes through the site proxy', async () => {
    resetConfig();
    configure({ proxyUrl: '/wp-json/kaaljyoti/v1/proxy', proxyAll: true, lang: 'en' });
    failing();
    const element = await mount({ city: 'delhi' });
    await settled();
    expect(markup(element)).toContain('Could not reach Kaal Jyoti.');
    expect(markup(element)).not.toContain('allowed origins');
  });
});
