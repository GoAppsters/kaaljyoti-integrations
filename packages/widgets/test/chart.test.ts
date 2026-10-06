import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { KjChart } from '../src/elements/chart.ts';
import chartFixture from './fixtures/chart.json';

/** The recorded document; the element asks for it as `image/svg+xml`. */
const SVG = (chartFixture as { data: { svg: string } }).data.svg;

const BIRTH = {
  datetime: '1990-05-14T10:30:00',
  timezone: 'Asia/Kolkata',
  lat: '28.6139',
  lon: '77.209',
  place: 'New Delhi',
};

if (!customElements.get(KjChart.tag)) customElements.define(KjChart.tag, KjChart);

function svgResponse(): Response {
  return new Response(SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
}

/** A fetch that answers every chart request with the fixture. */
function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(svgResponse()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Let the queued load and its settled promises run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(attrs: Record<string, string> = BIRTH): KjChart {
  const element = document.createElement(KjChart.tag) as KjChart;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

/** The parsed body of one recorded call. */
function bodyOf(fetchMock: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, index = 0): Record<string, string> {
  const [, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return init.headers as Record<string, string>;
}

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<kj-chart> request', () => {
  it('asks for the SVG document and posts the birth the attributes describe', async () => {
    const fetchMock = stubFetch();
    mount();
    await settle();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/kundli/chart?key=');
    expect(headersOf(fetchMock).Accept).toBe('image/svg+xml');
    expect(bodyOf(fetchMock)).toEqual({
      birth: {
        datetime: '1990-05-14T10:30:00',
        timezone: 'Asia/Kolkata',
        latitude: 28.6139,
        longitude: 77.209,
        place: 'New Delhi',
      },
      style: 'north',
      size: 360,
      varga: 'd1',
      show_degrees: true,
      options: { language: 'en' },
    });
  });

  it('never sends embed_font, which a publishable key is refused', async () => {
    const fetchMock = stubFetch();
    mount();
    await settle();
    expect(Object.keys(bodyOf(fetchMock))).not.toContain('embed_font');
  });

  it('honours style, size and varga, and clamps a size the API would refuse', async () => {
    const fetchMock = stubFetch();
    mount({ ...BIRTH, 'chart-style': 'south', size: '900', varga: 'd9' });
    await settle();
    expect(bodyOf(fetchMock)).toMatchObject({ style: 'south', size: 900, varga: 'd9' });

    clearCache();
    mount({ ...BIRTH, size: '50' });
    await settle();
    expect(bodyOf(fetchMock, 1)).toMatchObject({ size: 200 });
  });

  it('reads the public style="south" attribute, and ignores real CSS there', async () => {
    const fetchMock = stubFetch();
    mount({ ...BIRTH, style: 'south' });
    await settle();
    expect(bodyOf(fetchMock)).toMatchObject({ style: 'south' });

    // CSS in `style` on a chart that never drew from it is not a new chart.
    const plain = mount({ ...BIRTH, size: '420' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    plain.setAttribute('style', 'border: 1px solid red');
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns show-degrees="false" into show_degrees: false', async () => {
    const fetchMock = stubFetch();
    mount({ ...BIRTH, 'show-degrees': 'false' });
    await settle();
    expect(bodyOf(fetchMock)).toMatchObject({ show_degrees: false });
  });

  it('resolves a bundled city, so lat/lon are optional', async () => {
    const fetchMock = stubFetch();
    mount({ datetime: '1990-05-14T10:30:00', city: 'delhi' });
    await settle();
    expect(bodyOf(fetchMock).birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      timezone: 'Asia/Kolkata',
      latitude: 28.6139,
      longitude: 77.209,
      place: 'New Delhi',
    });
  });

  it('makes one call for two identical charts on a page', async () => {
    const fetchMock = stubFetch();
    mount();
    mount();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const element of document.body.children) {
      expect(element.shadowRoot?.querySelector('svg')).toBeTruthy();
    }
  });
});

describe('<kj-chart> rendering', () => {
  it('injects the SVG into the shadow root under a titled header', async () => {
    stubFetch();
    const element = mount();
    await settle();

    const figure = element.shadowRoot?.querySelector('figure');
    expect(figure?.getAttribute('part')).toBe('chart');
    expect(figure?.querySelector('svg')).toBeTruthy();
    expect(element.shadowRoot?.querySelector('[part="title"]')?.textContent).toBe('Birth chart');
    expect(element.shadowRoot?.querySelector('[part="subtitle"]')?.textContent).toContain(
      'New Delhi · 14 May 1990, 10:30',
    );
    expect(element.getAttribute('data-state')).toBe('ready');
  });

  it('switches style from its own control, one call per style', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    const south = element.shadowRoot?.querySelector<HTMLElement>('[data-seg="south"]');
    expect(
      element.shadowRoot?.querySelector('[data-seg="north"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    south?.click();
    await settle();
    expect(element.getAttribute('chart-style')).toBe('south');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1)).toMatchObject({ style: 'south' });
  });

  it('hides the switch with controls="off" and sends first-house', async () => {
    const fetchMock = stubFetch();
    const element = mount({ ...BIRTH, controls: 'off', 'first-house': 'moon' });
    await settle();
    expect(element.shadowRoot?.querySelector('[data-seg]')).toBeNull();
    expect(bodyOf(fetchMock)).toMatchObject({ first_house: 'moon' });
  });

  it('sends no first_house for the lagna or a value the API does not take', async () => {
    const fetchMock = stubFetch();
    mount({ ...BIRTH, 'first-house': 'pluto' });
    await settle();
    expect(bodyOf(fetchMock)).not.toHaveProperty('first_house');
  });

  it('renders no_birth without touching the network when the birth is missing', async () => {
    const fetchMock = stubFetch();
    const element = mount({ size: '400' });
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    const line = element.shadowRoot?.querySelector('[data-code]');
    expect(line?.getAttribute('part')).toBe('error');
    expect(line?.getAttribute('data-code')).toBe('no_birth');
    expect(line?.textContent).toContain('No birth');
    expect(element.getAttribute('data-state')).toBe('error');
  });

  it('takes a birth object and sets the attributes from it', async () => {
    const fetchMock = stubFetch();
    const element = mount({});
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    element.birth = {
      datetime: '1990-05-14T10:30:00',
      latitude: 12.9716,
      longitude: 77.5946,
    };
    await settle();

    expect(element.getAttribute('lat')).toBe('12.9716');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Manual coordinates carry no zone: the API derives it (decision 8).
    expect(bodyOf(fetchMock).birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 12.9716,
      longitude: 77.5946,
    });
  });
});

describe('<kj-chart> language', () => {
  it('re-requests the chart in the new language — the exception to decision 10', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    element.setAttribute('lang', 'hi');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1)).toMatchObject({ options: { language: 'hi' } });
  });
});
