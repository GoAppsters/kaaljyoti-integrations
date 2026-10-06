import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/core/cache.ts';
import { configure, readScriptConfig, resetConfig } from '../src/core/config.ts';
import { resetGooglePlaces } from '../src/core/google-places.ts';
import { resetPhoton } from '../src/core/photon.ts';
import { KjKundliForm } from '../src/elements/kundli-form.ts';
import { KjMatchForm } from '../src/elements/match-form.ts';
import kundliFixture from './fixtures/kundli.json';

for (const element of [KjKundliForm, KjMatchForm]) {
  if (!customElements.get(element.tag)) customElements.define(element.tag, element);
}

const PLACES = {
  status: 'ok',
  data: {
    places: [
      {
        id: 1258338,
        name: 'Rampur',
        region: 'Uttar Pradesh',
        country: 'IN',
        country_name: 'India',
        latitude: 28.81014,
        longitude: 79.02699,
        timezone: 'Asia/Kolkata',
        population: 296418,
      },
    ],
  },
  meta: { query: 'Ram', count: 1 },
};

/** Photon's GeoJSON: two villages of one name, a city-state, a state. */
const PHOTON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [76.3812, 28.6109] },
      properties: {
        osm_key: 'place',
        osm_value: 'village',
        name: 'Kheri',
        county: 'Jhajjar',
        state: 'Haryana',
        country: 'India',
        countrycode: 'IN',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [76.9, 29.7] },
      properties: {
        osm_key: 'place',
        osm_value: 'village',
        name: 'Kheri',
        county: 'Karnal',
        state: 'Haryana',
        country: 'India',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [77.209, 28.6139] },
      properties: { osm_value: 'city', name: 'Delhi', state: 'Delhi', country: 'India' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [76.0, 29.0] },
      properties: { osm_value: 'state', name: 'Haryana', country: 'India' },
    },
  ],
};

const MATCH = {
  status: 'ok',
  data: { total: 20, verdict: 'average', kootas: [] },
  meta: {},
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const path = String(url);
    if (path.includes('/v1/places')) return Promise.resolve(json(PLACES));
    if (path.includes('/api/?')) return Promise.resolve(json(PHOTON));
    if (path.includes('/v1/match')) return Promise.resolve(json(MATCH));
    return Promise.resolve(json(kundliFixture));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A stand-in for `google.maps.importLibrary('places')`, the new Places API. */
function stubGoogle(options: { refuse?: boolean } = {}) {
  const fetchFields = vi.fn().mockResolvedValue({});
  const place = {
    location: { lat: () => 29.1234567, lng: () => 76.7654321 },
    displayName: 'Kheri Kalan',
    formattedAddress: 'Kheri Kalan, Haryana 124001, India',
    fetchFields,
  };
  const fetchAutocompleteSuggestions = vi.fn().mockImplementation(() =>
    options.refuse
      ? Promise.reject(new Error('REQUEST_DENIED'))
      : Promise.resolve({
          suggestions: [
            {
              placePrediction: {
                text: { text: 'Kheri Kalan, Haryana, India' },
                toPlace: () => place,
              },
            },
          ],
        }),
  );
  class AutocompleteSessionToken {}
  const importLibrary = vi.fn().mockResolvedValue({
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    AutocompleteSessionToken,
  });
  (window as unknown as { google?: unknown }).google = { maps: { importLibrary } };
  return { fetchAutocompleteSuggestions, fetchFields, importLibrary, AutocompleteSessionToken };
}

/** Past the search's debounce, and the promises behind it. */
const typed = () => new Promise((resolve) => setTimeout(resolve, 350));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount<T extends HTMLElement>(tag: string, attrs: Record<string, string> = {}): T {
  const element = document.createElement(tag) as T;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

function field(scope: ParentNode, name: string): HTMLInputElement {
  const node = scope.querySelector<HTMLInputElement>(`[data-field="${name}"]`);
  if (!node) throw new Error(`no field ${name}`);
  return node;
}

function fire(node: Element, type: string): void {
  node.dispatchEvent(new Event(type, { bubbles: true, composed: true, cancelable: true }));
}

/** A date and a time into one set's selects. */
function when(scope: ParentNode, date: string, time: string): void {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const set: Record<string, string> = {
    day: String(day),
    month: String(month),
    year: String(year),
    hour: String(hour! % 12 || 12),
    minute: String(minute),
    ampm: hour! < 12 ? 'am' : 'pm',
  };
  for (const [name, value] of Object.entries(set)) field(scope, name).value = value;
}

/** Date and time, and `text` typed into the search box. */
async function search(scope: ParentNode, text: string): Promise<void> {
  const set = { day: '14', month: '5', year: '1990', hour: '10', minute: '30', ampm: 'am' };
  for (const [name, value] of Object.entries(set)) {
    field(scope, name).value = value;
    fire(field(scope, name), 'change');
  }
  const q = field(scope, 'q');
  q.value = text;
  fire(q, 'input');
  await typed();
}

function suggestions(scope: ParentNode): string[] {
  return [...scope.querySelectorAll('[data-suggest] li')].map((li) => li.textContent ?? '');
}

async function choose(scope: ParentNode, index = 0): Promise<void> {
  const option = scope.querySelector(`[data-suggest] [data-i="${index}"]`);
  if (!option) throw new Error(`no suggestion ${index}`);
  fire(option, 'mousedown');
  await settle();
  await settle();
}

async function submitted(element: HTMLElement, fetchMock: ReturnType<typeof vi.fn>, path: string) {
  element.shadowRoot
    ?.querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await settle();
  const call = fetchMock.mock.calls.find((c) => String((c as [string])[0]).includes(path));
  if (!call) throw new Error(`no call to ${path}`);
  return JSON.parse((call as [string, RequestInit])[1].body as string) as Record<string, unknown>;
}

beforeEach(() => {
  resetConfig();
  clearCache();
  resetGooglePlaces();
  resetPhoton();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  const w = window as unknown as Record<string, unknown>;
  delete w.google;
  delete w.gm_authFailure;
  delete w.__kjGoogleMaps;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fetch for Photon that answers only when aborted, as a hung server would. */
function hangingPhoton(fetchMock: ReturnType<typeof vi.fn>): AbortSignal[] {
  const signals: AbortSignal[] = [];
  const answer = fetchMock.getMockImplementation() as (
    url: string,
    init?: RequestInit,
  ) => Promise<Response>;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (!String(url).includes('/api/?')) return answer(url, init);
    const signal = init!.signal!;
    signals.push(signal);
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  });
  return signals;
}

const photonCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/?'));

describe('place search with Photon, the default without a Google key', () => {
  it('asks the public Photon for populated places and credits OpenStreetMap', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjKundliForm>(KjKundliForm.tag, { show: 'summary' });
    await settle();
    const root = element.shadowRoot!;

    await search(root, 'Kheri');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const asked = new URL(url);
    expect(asked.origin + asked.pathname).toBe('https://photon.komoot.io/api/');
    expect(Object.fromEntries(asked.searchParams)).toEqual({
      q: 'Kheri',
      limit: '8',
      lang: 'en',
      osm_tag: 'place',
    });
    // Nothing of the site's goes to the third party: no key, no headers.
    expect(init).toEqual({ signal: expect.any(AbortSignal) });

    // The district tells the two villages apart; the state is not a birthplace.
    expect(suggestions(root)).toEqual([
      'Kheri, Jhajjar, Haryana, India',
      'Kheri, Karnal, Haryana, India',
      'Delhi, India',
      '© OpenStreetMap contributors',
    ]);
    const credit = root.querySelector<HTMLAnchorElement>('.kj-osm a');
    expect(credit?.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
    expect(credit?.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('.kj-gm')).toBeNull();

    await choose(root, 1);
    expect(field(root, 'lat').value).toBe('29.7');
    expect(field(root, 'lon').value).toBe('76.9');
    expect(field(root, 'q').value).toBe('Kheri, Haryana, India');

    const body = await submitted(element, fetchMock, '/v1/kundli');
    expect(body.birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 29.7,
      longitude: 76.9,
      place: 'Kheri, Haryana, India',
    });
    expect(body.birth).not.toHaveProperty('timezone');
  });

  it('credits OpenStreetMap in Hindi, and not under an empty list', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjKundliForm>(KjKundliForm.tag, { lang: 'hi' });
    await settle();
    const root = element.shadowRoot!;
    await search(root, 'Kheri');
    expect(root.querySelector('.kj-osm')?.textContent).toBe('© OpenStreetMap योगदानकर्ता');
    // Photon's own names, asked in English whatever the page's language.
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get('lang')).toBe('en');

    fetchMock.mockImplementation(() => Promise.resolve(json({ features: [] })));
    await search(root, 'Zzzz');
    expect(suggestions(root)).toEqual(['कोई स्थान नहीं मिला। अक्षांश और देशांतर भरें।']);
    expect(root.querySelector('.kj-osm')).toBeNull();
  });

  it('asks the same letters once', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjKundliForm>(KjKundliForm.tag);
    await settle();
    const root = element.shadowRoot!;
    await search(root, 'Kheri');
    await search(root, 'Kher');
    await search(root, 'Kheri');
    expect(
      photonCalls(fetchMock).map((call) => new URL(String(call[0])).searchParams.get('q')),
    ).toEqual(['Kheri', 'Kher']);
  });

  it('uses a photon-url, from the form, the script tag or configure()', async () => {
    const fetchMock = stubFetch();
    configure({ photonUrl: 'https://geo.example.org/' });
    const element = mount<KjKundliForm>(KjKundliForm.tag);
    await settle();
    await search(element.shadowRoot!, 'Kheri');
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/^https:\/\/geo\.example\.org\/api\/\?q=/);

    element.setAttribute('photon-url', 'https://photon.site.test');
    await settle();
    await search(element.shadowRoot!, 'Khera');
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toMatch(
      /^https:\/\/photon\.site\.test\/api\/\?/,
    );

    const script = document.createElement('script');
    script.dataset.photonUrl = 'https://photon.self.test';
    script.dataset.placeProvider = 'photon';
    expect(readScriptConfig(script)).toMatchObject({
      photonUrl: 'https://photon.self.test',
      placeProvider: 'photon',
    });
    script.dataset.placeProvider = 'nominatim';
    expect(readScriptConfig(script).placeProvider).toBeUndefined();
    expect(configure({ placeProvider: 'bogus' as never }).placeProvider).toBe('auto');
    expect(configure({ photonUrl: '' }).photonUrl).toBe('https://photon.komoot.io');
  });

  it('falls back to /v1/places when Photon errors, warns once and stops asking it', async () => {
    const fetchMock = stubFetch();
    const answer = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      String(url).includes('/api/?')
        ? Promise.resolve(new Response('busy', { status: 429 }))
        : answer(url, init),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const element = mount<KjKundliForm>(KjKundliForm.tag);
    await settle();
    const root = element.shadowRoot!;

    await search(root, 'Ram');
    expect(suggestions(root)).toEqual(['Rampur, Uttar Pradesh, India']);
    expect(root.querySelector('.kj-osm')).toBeNull();
    await search(root, 'Ramp');
    expect(photonCalls(fetchMock)).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('Photon unavailable (Error: HTTP 429)');
  });

  it('gives up on Photon after 4 seconds, and aborts a search the visitor typed past', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = stubFetch();
      const signals = hangingPhoton(fetchMock);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const element = mount<KjKundliForm>(KjKundliForm.tag);
      await vi.advanceTimersByTimeAsync(0);
      const root = element.shadowRoot!;
      const q = () => field(root, 'q');

      q().value = 'Ram';
      fire(q(), 'input');
      await vi.advanceTimersByTimeAsync(350);
      expect(signals).toHaveLength(1);

      // New letters: the request in flight goes, and no warning for it.
      q().value = 'Rampur';
      fire(q(), 'input');
      expect(signals[0]?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(signals).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(250);
      expect(signals).toHaveLength(2);
      expect(warn).not.toHaveBeenCalled();

      // Asked 300 ms after the last letter, 50 ms ago: 4 s from then.
      await vi.advanceTimersByTimeAsync(3949);
      expect(signals[1]?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signals[1]?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('/v1/places');
      expect(suggestions(root)).toEqual(['Rampur, Uttar Pradesh, India']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('Photon unavailable (timeout)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is not asked under place-provider="kaaljyoti", from the form or the config', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjKundliForm>(KjKundliForm.tag, { 'place-provider': 'kaaljyoti' });
    await settle();
    await search(element.shadowRoot!, 'Ram');
    expect(photonCalls(fetchMock)).toHaveLength(0);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/places');
  });

  it('is asked instead of Google under place-provider="photon", whatever the key', async () => {
    const fetchMock = stubFetch();
    const google = stubGoogle();
    const element = mount<KjKundliForm>(KjKundliForm.tag, {
      'google-maps-key': 'AIza-test',
      'place-provider': 'photon',
    });
    await settle();
    await search(element.shadowRoot!, 'Kheri');
    expect(google.importLibrary).not.toHaveBeenCalled();
    expect(photonCalls(fetchMock)).toHaveLength(1);
  });

  it('takes over from Google under "auto" when Google refuses the key', async () => {
    const fetchMock = stubFetch();
    stubGoogle({ refuse: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const element = mount<KjKundliForm>(KjKundliForm.tag, { 'google-maps-key': 'AIza-bad' });
    await settle();
    const root = element.shadowRoot!;
    await search(root, 'Kheri');
    expect(photonCalls(fetchMock)).toHaveLength(1);
    expect(root.querySelector('.kj-osm')).not.toBeNull();
    expect(root.querySelector('.kj-gm')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('Google Places');
  });

  it('searches each side of the match form on its own', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjMatchForm>(KjMatchForm.tag, { city: 'delhi' });
    await settle();
    const root = element.shadowRoot!;
    const bride = root.querySelector('[data-side="bride"]')!;
    const groom = root.querySelector('[data-side="groom"]')!;
    await search(bride, 'Kheri');
    expect(suggestions(groom)).toEqual([]);
    await choose(bride, 0);
    when(groom, '1991-01-02', '08:00');
    const body = await submitted(element, fetchMock, '/v1/match');
    expect(body.bride).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 28.6109,
      longitude: 76.3812,
      place: 'Kheri, Haryana, India',
    });
  });
});

describe('place search with place-provider="kaaljyoti"', () => {
  beforeEach(() => {
    configure({ placeProvider: 'kaaljyoti' });
  });

  it('searches /v1/places and sends the zone it gives', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjKundliForm>(KjKundliForm.tag, { show: 'summary' });
    await settle();
    const root = element.shadowRoot!;

    await search(root, 'Ram');
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/v1/places');
    expect(url.searchParams.get('key')).toBe('kj_pub_test');
    expect(url.searchParams.get('q')).toBe('Ram');
    expect(url.searchParams.get('language')).toBe('en');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBeUndefined();
    expect(suggestions(root)).toEqual(['Rampur, Uttar Pradesh, India']);
    // Our own index: no Google attribution.
    expect(root.querySelector('.kj-gm')).toBeNull();

    await choose(root);
    expect(field(root, 'lat').value).toBe('28.81014');
    expect(field(root, 'q').value).toBe('Rampur, Uttar Pradesh, India');

    const body = await submitted(element, fetchMock, '/v1/kundli');
    expect(body.birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 28.81014,
      longitude: 79.02699,
      timezone: 'Asia/Kolkata',
      place: 'Rampur, Uttar Pradesh, India',
    });
  });

  it('does not search before the third character', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjKundliForm>(KjKundliForm.tag);
    await settle();
    await search(element.shadowRoot!, 'Ra');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.shadowRoot!.querySelector('[data-suggest]')?.hasAttribute('hidden')).toBe(true);
  });

  it('drops the picked zone and name when the coordinates are typed over', async () => {
    const fetchMock = stubFetch();
    const element = mount<KjKundliForm>(KjKundliForm.tag, { show: 'summary' });
    await settle();
    const root = element.shadowRoot!;
    await search(root, 'Ram');
    await choose(root);

    const lat = field(root, 'lat');
    lat.value = '28.9';
    fire(lat, 'input');

    const body = await submitted(element, fetchMock, '/v1/kundli');
    expect(body.birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 28.9,
      longitude: 79.02699,
    });
  });

  it('says so when nothing is found, and the coordinates still work', async () => {
    stubFetch().mockImplementation(() =>
      Promise.resolve(json({ status: 'ok', data: { places: [] }, meta: {} })),
    );
    const element = mount<KjKundliForm>(KjKundliForm.tag);
    await settle();
    await search(element.shadowRoot!, 'Zzzz');
    expect(suggestions(element.shadowRoot!)).toEqual([
      'No place found. Enter its latitude and longitude.',
    ]);
  });

  it('treats a failed search as no match, in Hindi too', async () => {
    stubFetch().mockImplementation(() => Promise.reject(new TypeError('offline')));
    const element = mount<KjKundliForm>(KjKundliForm.tag, { lang: 'hi' });
    await settle();
    await search(element.shadowRoot!, 'राम');
    expect(suggestions(element.shadowRoot!)).toEqual([
      'कोई स्थान नहीं मिला। अक्षांश और देशांतर भरें।',
    ]);
  });
});

describe('place search with a Google key', () => {
  it('uses the new Places API, shows the attribution and sends no zone', async () => {
    const fetchMock = stubFetch();
    const google = stubGoogle();
    const element = mount<KjKundliForm>(KjKundliForm.tag, {
      show: 'summary',
      'google-maps-key': 'AIza-test',
    });
    await settle();
    const root = element.shadowRoot!;

    await search(root, 'Kheri');
    expect(google.importLibrary).toHaveBeenCalledWith('places');
    const request = google.fetchAutocompleteSuggestions.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(request).toMatchObject({ input: 'Kheri', language: 'en', region: 'in' });
    expect(request.sessionToken).toBeInstanceOf(google.AutocompleteSessionToken);
    expect(suggestions(root)).toEqual(['Kheri Kalan, Haryana, India', 'Google Maps']);
    expect(root.querySelector('.kj-gm')?.textContent).toBe('Google Maps');
    // Nothing of ours was asked.
    expect(fetchMock).not.toHaveBeenCalled();

    await choose(root);
    expect(google.fetchFields).toHaveBeenCalledWith({
      fields: ['location', 'displayName', 'formattedAddress'],
    });
    expect(field(root, 'q').value).toBe('Kheri Kalan, Haryana 124001, India');

    const body = await submitted(element, fetchMock, '/v1/kundli');
    expect(body.birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 29.1234567,
      longitude: 76.7654321,
      place: 'Kheri Kalan, Haryana 124001, India',
    });
    expect(body.birth).not.toHaveProperty('timezone');
  });

  it('keeps one session token until a pick, then starts another', async () => {
    stubFetch();
    const google = stubGoogle();
    configure({ googleMapsKey: 'AIza-config' });
    const element = mount<KjKundliForm>(KjKundliForm.tag, { lang: 'hi' });
    await settle();
    const root = element.shadowRoot!;

    await search(root, 'Khe');
    await search(root, 'Kheri');
    const tokens = google.fetchAutocompleteSuggestions.mock.calls.map(
      (call) => (call[0] as { sessionToken: object }).sessionToken,
    );
    expect(tokens[0]).toBe(tokens[1]);
    expect(google.fetchAutocompleteSuggestions.mock.calls[0]?.[0]).toMatchObject({
      language: 'hi',
    });

    await choose(root);
    await search(root, 'Kheri K');
    const after = (
      google.fetchAutocompleteSuggestions.mock.calls[2]?.[0] as { sessionToken: object }
    ).sessionToken;
    expect(after).not.toBe(tokens[0]);
  });

  it('falls back to /v1/places when Google refuses the key under "google", and warns once', async () => {
    const fetchMock = stubFetch();
    const google = stubGoogle({ refuse: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const element = mount<KjKundliForm>(KjKundliForm.tag, {
      'google-maps-key': 'AIza-bad',
      'place-provider': 'google',
    });
    await settle();
    const root = element.shadowRoot!;

    await search(root, 'Ram');
    expect(suggestions(root)).toEqual(['Rampur, Uttar Pradesh, India']);
    expect(root.querySelector('.kj-gm')).toBeNull();

    await search(root, 'Ramp');
    // Google is not asked again on this page.
    expect(google.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('Google Places');
  });

  it('loads the Maps script once, and falls back when it does not load', async () => {
    const fetchMock = stubFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // happy-dom does not run scripts, so the tag fails to load as a blocked
    // or offline one would.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = mount<KjKundliForm>(KjKundliForm.tag, {
      'google-maps-key': 'AIza k',
      'place-provider': 'google',
    });
    await settle();
    const root = element.shadowRoot!;

    await search(root, 'Ram');
    const scripts = [...document.head.querySelectorAll('script')];
    expect(scripts).toHaveLength(1);
    const src = new URL(scripts[0]!.src);
    expect(src.origin + src.pathname).toBe('https://maps.googleapis.com/maps/api/js');
    expect(src.searchParams.get('key')).toBe('AIza k');
    expect(src.searchParams.get('loading')).toBe('async');
    expect(src.searchParams.get('libraries')).toBe('places');
    expect(src.searchParams.get('language')).toBe('en');
    expect(src.searchParams.get('callback')).toBe('__kjGoogleMaps');

    expect(suggestions(root)).toEqual(['Rampur, Uttar Pradesh, India']);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/places');
    expect(warn).toHaveBeenCalledTimes(1);

    await search(root, 'Ramp');
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('searches each side of the match form on its own', async () => {
    const fetchMock = stubFetch();
    stubGoogle();
    const element = mount<KjMatchForm>(KjMatchForm.tag, {
      'google-maps-key': 'AIza-test',
      city: 'delhi',
    });
    await settle();
    const root = element.shadowRoot!;
    const bride = root.querySelector('[data-side="bride"]')!;
    const groom = root.querySelector('[data-side="groom"]')!;

    await search(groom, 'Kheri');
    expect(suggestions(bride)).toEqual([]);
    await choose(groom);
    when(bride, '1992-08-20', '06:15');

    const body = await submitted(element, fetchMock, '/v1/match');
    expect(body.groom).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 29.1234567,
      longitude: 76.7654321,
      place: 'Kheri Kalan, Haryana 124001, India',
    });
    // The bride kept the `city` attribute's place, which carries its zone.
    expect(body.bride).toMatchObject({ place: 'New Delhi', timezone: 'Asia/Kolkata' });
  });
});

describe('the Google Maps key in the config', () => {
  it('is read from the script tag', () => {
    const script = document.createElement('script');
    script.dataset.key = 'kj_pub_x';
    script.dataset.googleMapsKey = 'AIza-script';
    expect(readScriptConfig(script).googleMapsKey).toBe('AIza-script');
  });
});
