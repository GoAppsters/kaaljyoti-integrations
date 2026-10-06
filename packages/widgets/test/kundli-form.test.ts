import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { KjChart } from '../src/elements/chart.ts';
import { KjKundliForm } from '../src/elements/kundli-form.ts';
import { KjReading } from '../src/elements/reading.ts';
import chartFixture from './fixtures/chart.json';
import kundliFixture from './fixtures/kundli-0142.json';
import dashaFixture from './fixtures/dasha.json';
import paceFixture from './fixtures/pace.json';
import vargasFixture from './fixtures/vargas.json';
import chalitFixture from './fixtures/chalit.json';
import lagnaFixture from './fixtures/reading-lagna.json';
import nakshatraFixture from './fixtures/reading-nakshatra.json';
import lifeAreasFixture from './fixtures/reading-life-areas.json';

const SVG = (chartFixture as { data: { svg: string } }).data.svg;

if (!customElements.get(KjKundliForm.tag)) {
  customElements.define(KjKundliForm.tag, KjKundliForm);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const OUT_OF_CREDITS = {
  status: 'error',
  error: {
    code: 'quota_exceeded',
    message:
      "this request costs 5 credits, more than is left of this month's 1,000 (1,000 included in the Free plan)",
    docs: 'https://kaaljyoti.com/api/docs/errors#quota_exceeded',
  },
};

/** Every route the report asks, routed by path; `overrides` wins by substring. */
function stubFetch(overrides: Record<string, () => Response> = {}): ReturnType<typeof vi.fn> {
  const routes: [string, () => Response][] = [
    ...Object.entries(overrides),
    [
      '/v1/kundli/chart',
      () => new Response(SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }),
    ],
    ['/v1/kundli/dasha', () => json(dashaFixture)],
    ['/v1/kundli/pace', () => json(paceFixture)],
    ['/v1/kundli/vargas', () => json(vargasFixture)],
    ['/v1/kundli/chalit', () => json(chalitFixture)],
    ['/v1/reports/lagna', () => json(lagnaFixture)],
    ['/v1/reports/nakshatra', () => json(nakshatraFixture)],
    ['/v1/reports/life-areas', () => json(lifeAreasFixture)],
    ['/v1/kundli?', () => json(kundliFixture)],
  ];
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const hit = routes.find(([path]) => String(url).includes(path));
    return Promise.resolve(hit ? hit[1]() : json({ status: 'error', error: {} }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function mount(attrs: Record<string, string> = {}): KjKundliForm {
  const element = document.createElement(KjKundliForm.tag) as KjKundliForm;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

const root = (element: KjKundliForm) => element.shadowRoot!;

function field(element: KjKundliForm, name: string): HTMLInputElement | HTMLSelectElement {
  const node = root(element).querySelector(`[data-field="${name}"]`);
  if (!node) throw new Error(`no field ${name}`);
  return node as HTMLInputElement | HTMLSelectElement;
}

function fill(element: KjKundliForm, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    const input = field(element, name);
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** 14 May 1990, 10:30 AM. */
const WHEN = { day: '14', month: '5', year: '1990', hour: '10', minute: '30', ampm: 'am' };

/** happy-dom does not submit a form from a button click; dispatch it as a browser would. */
function submit(element: KjKundliForm): void {
  root(element)
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

function urls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => new URL(String((call as [string])[0])).pathname);
}

function bodyFor(fetchMock: ReturnType<typeof vi.fn>, path: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    (c) => new URL(String((c as [string])[0])).pathname === `/v1${path}`,
  );
  if (!call) throw new Error(`no call to ${path}`);
  return JSON.parse((call as [string, RequestInit])[1].body as string) as Record<string, unknown>;
}

/** A submitted form, answers landed. */
async function submitted(attrs: Record<string, string> = {}): Promise<KjKundliForm> {
  const element = mount({ city: 'delhi', ...attrs });
  await settle();
  fill(element, WHEN);
  submit(element);
  await settle();
  return element;
}

function openTab(element: KjKundliForm, id: string): void {
  root(element).querySelector<HTMLElement>(`[role="tab"][data-tab="${id}"]`)?.click();
}

const BIRTH = {
  datetime: '1990-05-14T10:30:00',
  latitude: 28.6139,
  longitude: 77.209,
  timezone: 'Asia/Kolkata',
  place: 'New Delhi',
};

beforeEach(() => {
  resetConfig();
  clearCache();
  localStorage.clear();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('<kj-kundli-form> the form', () => {
  it('draws name, gender, date and time selects and one place search — no city list', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    for (const name of ['name', 'gender', 'day', 'month', 'year', 'hour', 'minute', 'ampm', 'q']) {
      expect(root(element).querySelector(`[data-field="${name}"]`), name).not.toBeNull();
    }
    expect(root(element).querySelector('[data-field="place"]')).toBeNull();
    expect(root(element).querySelector('input[type="date"], input[type="time"]')).toBeNull();
    expect(field(element, 'q').getAttribute('role')).toBe('combobox');
    expect(root(element).querySelectorAll('[data-field="month"] option')).toHaveLength(13);
    expect(root(element).querySelectorAll('[data-field="hour"] option')).toHaveLength(13);
    expect(root(element).querySelector('[part="title"]')?.textContent).toBe('Janam kundli');
  });

  it('gives every field an accessible name', async () => {
    stubFetch();
    const element = mount();
    await settle();
    const fields = [
      ...root(element).querySelectorAll<HTMLElement>('input:not([type="hidden"]), select'),
    ];
    expect(fields.length).toBeGreaterThan(8);
    for (const input of fields) {
      const labelled =
        input.hasAttribute('aria-label') ||
        (input.id && root(element).querySelector(`label[for="${input.id}"]`));
      expect(labelled, input.dataset.field).toBeTruthy();
    }
    // The date and time groups are fieldsets with a legend.
    const legends = [...root(element).querySelectorAll('fieldset > legend')].map(
      (legend) => legend.textContent,
    );
    expect(legends).toEqual(['Date of birth', 'Time of birth']);
  });

  it('takes a 24-hour clock with time-format="24"', async () => {
    const fetchMock = stubFetch();
    const element = mount({ 'time-format': '24', city: 'delhi' });
    await settle();
    expect(root(element).querySelector('[data-field="ampm"]')).toBeNull();
    expect(root(element).querySelectorAll('[data-field="hour"] option')).toHaveLength(25);
    fill(element, { day: '14', month: '5', year: '1990', hour: '22', minute: '5' });
    submit(element);
    await settle();
    expect((bodyFor(fetchMock, '/kundli').birth as { datetime: string }).datetime).toBe(
      '1990-05-14T22:05:00',
    );
  });

  it('reads 12 AM as midnight and 12 PM as noon', async () => {
    for (const [hour, ampm, expected] of [
      ['12', 'am', '00:15'],
      ['12', 'pm', '12:15'],
      ['3', 'pm', '15:15'],
    ]) {
      clearCache();
      const fetchMock = stubFetch();
      const element = mount({ city: 'delhi', remember: 'off' });
      await settle();
      fill(element, { ...WHEN, hour: hour!, minute: '15', ampm: ampm! });
      submit(element);
      await settle();
      expect((bodyFor(fetchMock, '/kundli').birth as { datetime: string }).datetime).toBe(
        `1990-05-14T${expected}:00`,
      );
      element.remove();
    }
  });

  it('draws the chrome and the month names in Hindi', async () => {
    stubFetch();
    const element = mount({ lang: 'hi' });
    await settle();
    const text = root(element).textContent ?? '';
    expect(text).toContain('जन्म तिथि');
    expect(text).toContain('जन्म स्थान');
    expect(text).toContain('मई');
    expect(text).toContain('कुंडली देखें');
  });

  it('fills the place from city="…" and shows it resolved', async () => {
    stubFetch();
    const element = mount({ city: 'jaipur' });
    await settle();
    expect(field(element, 'q').value).toBe('Jaipur');
    expect(field(element, 'lat').value).toBe('26.9124');
    const resolved = root(element).querySelector('[data-resolved]');
    expect(resolved?.hasAttribute('hidden')).toBe(false);
    expect(resolved?.textContent).toContain('26.9124° N, 75.7873° E');
    expect(resolved?.textContent).toContain('Asia/Kolkata');
  });

  it('says what is missing, next to each field, in the page language, and sends nothing', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    submit(element);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    const errors = [...root(element).querySelectorAll('[data-error]:not([hidden])')];
    expect(errors.map((error) => error.getAttribute('data-error'))).toEqual([
      'date',
      'time',
      'place',
    ]);
    expect(errors[0]?.textContent).toBe('Choose a valid date of birth.');
    expect(field(element, 'day').getAttribute('aria-invalid')).toBe('true');
    expect(field(element, 'q').getAttribute('aria-invalid')).toBe('true');
    expect(field(element, 'q').getAttribute('aria-errormessage')).toBe('kj-place-error');

    // Fixing a group clears its message and no other.
    fill(element, WHEN);
    expect(root(element).querySelector('[data-error="date"]')?.hasAttribute('hidden')).toBe(true);
    expect(root(element).querySelector('[data-error="place"]')?.hasAttribute('hidden')).toBe(false);

    element.setAttribute('lang', 'hi');
    await settle();
    expect(root(element).querySelector('[data-error="place"]')?.textContent).toContain(
      'जन्म स्थान',
    );
  });

  it('refuses a date that is not in the calendar', async () => {
    const fetchMock = stubFetch();
    const element = mount({ city: 'delhi' });
    await settle();
    fill(element, { ...WHEN, day: '31', month: '2' });
    submit(element);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(root(element).querySelector('[data-error="date"]')?.hasAttribute('hidden')).toBe(false);
  });

  it('sends typed coordinates without a zone, so the API derives it', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    fill(element, { ...WHEN, lat: '12.9716', lon: '77.5946' });
    submit(element);
    await settle();
    expect(bodyFor(fetchMock, '/kundli').birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 12.9716,
      longitude: 77.5946,
    });
  });
});

describe('<kj-kundli-form> remembering the last entry', () => {
  it('remembers a submitted entry on the device and fills it in next time', async () => {
    stubFetch();
    const first = await submitted({});
    fill(first, { name: 'Asha' });
    submit(first);
    await settle();
    first.remove();

    const next = mount();
    await settle();
    expect(field(next, 'name').value).toBe('Asha');
    expect(field(next, 'day').value).toBe('14');
    expect(field(next, 'hour').value).toBe('10');
    expect(field(next, 'ampm').value).toBe('am');
    expect(field(next, 'lat').value).toBe('28.6139');
    expect(root(next).querySelector('[part="remembered"]')?.textContent).toContain(
      'last entry on this device',
    );
  });

  it('keeps the time when the next form is on a 24-hour clock', async () => {
    stubFetch();
    const first = await submitted({});
    fill(first, { hour: '3', ampm: 'pm' });
    submit(first);
    await settle();
    first.remove();

    const next = mount({ 'time-format': '24' });
    await settle();
    expect(field(next, 'hour').value).toBe('15');
    expect(field(next, 'minute').value).toBe('30');
  });

  it('forgets on "Clear"', async () => {
    stubFetch();
    (await submitted({})).remove();
    const next = mount();
    await settle();
    root(next).querySelector<HTMLElement>('[data-action="clear"]')?.click();
    await settle();
    expect(field(next, 'day').value).toBe('');
    expect(localStorage.length).toBe(0);
  });

  it('stores nothing, and forgets an earlier entry, with remember="off"', async () => {
    stubFetch();
    (await submitted({})).remove();
    expect(localStorage.length).toBe(1);
    const off = await submitted({ remember: 'off' });
    expect(localStorage.length).toBe(0);
    off.remove();
    const next = mount();
    await settle();
    expect(field(next, 'day').value).toBe('');
  });

  it('stores nothing with configure({ remember: false })', async () => {
    configure({ remember: false });
    stubFetch();
    await submitted({});
    expect(localStorage.length).toBe(0);
  });

  it('works when storage throws', async () => {
    const fetchMock = stubFetch();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      const element = await submitted({});
      expect(urls(fetchMock)).toContain('/v1/kundli');
      expect(root(element).querySelector('[part="result"]')).not.toBeNull();
    } finally {
      spy.mockRestore();
      get.mockRestore();
    }
  });
});

describe('<kj-kundli-form> the report', () => {
  it('opens on the overview: three calls, and kj-submit and kj-ready once', async () => {
    const fetchMock = stubFetch();
    const events: string[] = [];
    for (const type of ['kj-submit', 'kj-ready', 'kj-error']) {
      document.addEventListener(type, () => events.push(type));
    }
    await submitted({});

    expect(urls(fetchMock).sort()).toEqual(['/v1/kundli', '/v1/kundli/dasha', '/v1/reports/lagna']);
    expect(bodyFor(fetchMock, '/kundli')).toEqual({
      birth: BIRTH,
      options: { language: ['en', 'hi'] },
    });
    expect(bodyFor(fetchMock, '/kundli/dasha')).toEqual({
      birth: BIRTH,
      system: 'vimshottari',
      levels: 2,
      options: { language: ['en', 'hi'] },
    });
    expect(events.filter((type) => type === 'kj-submit')).toHaveLength(1);
    expect(events.filter((type) => type === 'kj-ready')).toHaveLength(1);
    expect(events).not.toContain('kj-error');
  });

  it('draws the overview: lagna, rashi, nakshatra, the running dashas, yogas, the lagna reading', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    stubFetch();
    const element = await submitted({});
    const tile = (key: string) =>
      root(element)
        .querySelector(`[part~="tile-${key}"]`)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim();

    expect(tile('lagna')).toContain('Cancer');
    expect(tile('lagna')).toContain('9°02′');
    expect(tile('rashi')).toContain('Sagittarius');
    expect(tile('nakshatra')).toContain('Purva Ashadha');
    expect(tile('nakshatra')).toContain('Pada 2');
    expect(tile('mahadasha')).toContain('Mars');
    expect(tile('mahadasha')).toContain('Ends 23 Nov 2026');
    expect(tile('antardasha')).toContain('Moon');
    expect(root(element).querySelectorAll('[part~="yoga"]')).toHaveLength(9);
    expect(root(element).querySelector('[part="about-lagna"]')?.textContent).toContain(
      'With Cancer rising',
    );
    // The reading's disclaimer is in the card's footer.
    expect(root(element).querySelector('footer .kj-disclaimer')?.textContent).toContain(
      'indicative',
    );
  });

  it('is a tablist with roving tabindex, and arrow keys move and open tabs', async () => {
    const fetchMock = stubFetch();
    const element = await submitted({});
    const tabs = [...root(element).querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.dataset.tab)).toEqual([
      'overview',
      'charts',
      'planets',
      'dasha',
      'life',
    ]);
    expect(root(element).querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Kundli report',
    );
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('tabindex')).toBe('0');
    expect(tabs[1]?.getAttribute('tabindex')).toBe('-1');
    const panel = root(element).querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);

    tabs[0]?.focus();
    const press = (key: string) =>
      root(element).activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
    press('ArrowRight');
    // The repaint replaced the tabs; the selected one has the focus again.
    press('ArrowRight');
    await settle();
    const selected = root(element).querySelector('[role="tab"][aria-selected="true"]');
    expect(selected?.getAttribute('data-tab')).toBe('planets');
    expect(root(element).activeElement).toBe(selected);
    // Lazy: the planets tab asked for its two answers only now.
    expect(urls(fetchMock)).toContain('/v1/kundli/pace');
    expect(urls(fetchMock)).toContain('/v1/kundli/vargas');
    expect(urls(fetchMock)).not.toContain('/v1/reports/life-areas');

    selected?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await settle();
    expect(
      root(element).querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-tab'),
    ).toBe('life');
  });

  it('draws the planets with retro, dignity and vargottama badges', async () => {
    stubFetch();
    const element = await submitted({});
    openTab(element, 'planets');
    await settle();
    const rows = root(element).querySelectorAll('[part~="planet-row"]');
    expect(rows).toHaveLength(10);
    const row = (id: string) =>
      root(element).querySelector(`[part~="planet-${id}"]`)?.textContent?.replace(/\s+/g, ' ');
    expect(row('sun')).toContain('Aries');
    expect(row('sun')).toContain('Krittika · 1');
    expect(row('sun')).toContain('Exalted');
    expect(row('mercury')).toContain('Retrograde');
    expect(row('saturn')).toContain('Own sign');
    expect(row('saturn')).toContain('Vargottama');
    expect(row('moon')).not.toContain('Vargottama');
  });

  it('draws the Vimshottari timeline with the running periods marked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const fetchMock = stubFetch();
    const element = await submitted({});
    const calls = fetchMock.mock.calls.length;
    openTab(element, 'dasha');
    await settle();
    // The overview already has the dasha: the tab asks for nothing.
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(root(element).querySelectorAll('[part~="mahadasha"]')).toHaveLength(9);
    const current = root(element).querySelectorAll('.kj-now-row');
    expect(current).toHaveLength(2);
    expect(current[0]?.textContent).toContain('Mars');
    expect(current[1]?.textContent).toContain('Moon');
    expect(root(element).querySelector('[part="antardashas"]')?.textContent).toContain(
      'Antardashas of Mars',
    );
    expect(root(element).querySelectorAll('.kj-dasha-bar span')).toHaveLength(9);
  });

  it('shows the monthly-limit state in the life-areas tab only', async () => {
    const fetchMock = stubFetch({ '/v1/reports/life-areas': () => json(OUT_OF_CREDITS, 402) });
    const errors: unknown[] = [];
    document.addEventListener('kj-error', (event) => errors.push((event as CustomEvent).detail));
    const element = await submitted({});
    openTab(element, 'life');
    await settle();

    expect(urls(fetchMock)).toContain('/v1/reports/life-areas');
    const state = root(element).querySelector('[role="tabpanel"] [data-code="quota_exceeded"]');
    expect(state?.textContent).toContain('Monthly limit reached');
    expect(state?.querySelector('a')?.getAttribute('href')).toBe(
      'https://kaaljyoti.com/api/pricing',
    );
    expect(errors).toHaveLength(1);
    // The form and the other tabs are untouched.
    expect(root(element).querySelector('form')).not.toBeNull();
    openTab(element, 'overview');
    await settle();
    expect(root(element).querySelector('[part~="tile-lagna"]')).not.toBeNull();
  });

  it('draws the life areas on a plan that has them', async () => {
    stubFetch();
    const element = await submitted({});
    openTab(element, 'life');
    await settle();
    expect(root(element).querySelectorAll('[part~="area"]')).toHaveLength(11);
    expect(root(element).querySelector('.kj-summary')).not.toBeNull();
  });

  it('draws the charts: a <kj-chart> inside, switched to D9, the Moon chart and chalit', async () => {
    const fetchMock = stubFetch();
    const element = await submitted({});
    openTab(element, 'charts');
    await settle();

    const chart = root(element).querySelector<KjChart>(KjChart.tag);
    expect(chart?.getAttribute('frame')).toBe('none');
    expect(chart?.getAttribute('varga')).toBe('d1');
    expect(chart?.shadowRoot?.querySelector('svg')).toBeTruthy();

    root(element).querySelector<HTMLElement>('[data-seg="d9"]')?.click();
    await settle();
    expect(root(element).querySelector(KjChart.tag)?.getAttribute('varga')).toBe('d9');
    root(element).querySelector<HTMLElement>('[data-seg="moon"]')?.click();
    await settle();
    expect(root(element).querySelector(KjChart.tag)?.getAttribute('first-house')).toBe('moon');
    const chartBodies = fetchMock.mock.calls
      .filter((c) => String(c[0]).includes('/v1/kundli/chart'))
      .map((c) => JSON.parse((c as [string, RequestInit])[1].body as string));
    expect(chartBodies.map((body) => [body.varga, body.first_house])).toEqual([
      ['d1', undefined],
      ['d9', undefined],
      ['d1', 'moon'],
    ]);

    root(element).querySelector<HTMLElement>('[data-seg="chalit"]')?.click();
    await settle();
    expect(bodyFor(fetchMock, '/kundli/chalit')).toMatchObject({ system: 'sripati' });
    expect(root(element).querySelectorAll('[part~="bhava"]')).toHaveLength(12);
    expect(root(element).querySelector(KjChart.tag)).toBeNull();
  });

  it('folds the form into one line after a submit; "Edit details" opens it again', async () => {
    stubFetch();
    const element = await submitted({});
    const form = root(element).querySelector('form')!;
    expect(form.hasAttribute('hidden')).toBe(true);
    const line = root(element).querySelector('[part~="collapsed"]');
    expect(line?.textContent?.replace(/\s+/g, ' ')).toContain('14 May 1990, 10:30 · New Delhi');
    root(element).querySelector<HTMLElement>('[data-action="edit"]')!.click();
    expect(root(element).querySelector('form')!.hasAttribute('hidden')).toBe(false);
    expect(root(element).querySelector('[part~="collapsed"]')).toBeNull();
    expect(root(element).querySelector('.kj-result')).not.toBeNull();
    expect(field(element, 'day').value).toBe('14');
  });

  it('keeps the form and draws the error in the overview when the kundli fails', async () => {
    stubFetch({
      '/v1/kundli?': () =>
        json({ status: 'error', error: { code: 'rate_limited', message: 'slow' } }, 400),
    });
    const element = await submitted({});
    expect(root(element).querySelector('form')).not.toBeNull();
    expect(
      root(element).querySelector('[role="tabpanel"] [data-code]')?.getAttribute('data-code'),
    ).toBe('rate_limited');
  });

  it('repaints in Hindi without a new call', async () => {
    const fetchMock = stubFetch();
    const element = await submitted({});
    const calls = fetchMock.mock.calls.length;
    element.setAttribute('lang', 'hi');
    await settle();
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(root(element).querySelector('[part~="tile-lagna"]')?.textContent).toContain('कर्क');
    expect(root(element).querySelector('[role="tab"]')?.textContent?.trim()).toBe('सारांश');
  });
});

describe('<kj-kundli-form> tabs and show', () => {
  const tabIds = (element: KjKundliForm) =>
    [...root(element).querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => tab.dataset.tab);

  it('keeps 0.1.0’s show="summary": the overview and the planets', async () => {
    stubFetch();
    const element = await submitted({ show: 'summary' });
    expect(tabIds(element)).toEqual(['overview', 'planets']);
  });

  it('show="chart" is the charts alone, with no /v1/kundli call and no tab bar', async () => {
    const fetchMock = stubFetch();
    const element = await submitted({ show: 'chart' });
    expect(root(element).querySelector('[role="tablist"]')).toBeNull();
    expect(root(element).querySelector(KjChart.tag)).not.toBeNull();
    expect(urls(fetchMock)).toEqual(['/v1/kundli/chart']);
  });

  it('tabs="…" picks tabs in the drawing order, and a typo means all', async () => {
    stubFetch();
    expect(tabIds(await submitted({ tabs: 'dasha life-areas overview' }))).toEqual([
      'overview',
      'dasha',
      'life',
    ]);
    document.body.innerHTML = '';
    expect(tabIds(await submitted({ tabs: 'horoscope' }))).toHaveLength(5);
  });
});

describe('<kj-kundli-form> readings', () => {
  it('adds a Readings tab with the lagna and nakshatra readings, the disclaimer last', async () => {
    const fetchMock = stubFetch();
    const element = await submitted({ readings: '' });
    openTab(element, 'readings');
    await settle();

    const readings = [...root(element).querySelectorAll(KjReading.tag)];
    expect(readings.map((reading) => reading.getAttribute('type'))).toEqual(['lagna', 'nakshatra']);
    expect(readings.every((reading) => reading.getAttribute('frame') === 'none')).toBe(true);
    expect(bodyFor(fetchMock, '/reports/nakshatra')).toEqual({
      birth: BIRTH,
      options: { language: ['en', 'hi'] },
    });
    expect(readings[0]?.getAttribute('disclaimer')).toBe('off');
    expect(readings[1]?.hasAttribute('disclaimer')).toBe(false);
  });

  it('draws only the readings it names, in their order', async () => {
    stubFetch();
    const element = await submitted({ readings: 'life-areas, nakshatra, palmistry' });
    openTab(element, 'readings');
    await settle();
    expect(
      [...root(element).querySelectorAll(KjReading.tag)].map((r) => r.getAttribute('type')),
    ).toEqual(['nakshatra', 'life_areas']);
  });

  it('has no Readings tab without the attribute, or with readings="off"', async () => {
    stubFetch();
    const plain = await submitted({});
    expect(root(plain).querySelector('[data-tab="readings"]')).toBeNull();
    document.body.innerHTML = '';
    const off = await submitted({ readings: 'off' });
    expect(root(off).querySelector('[data-tab="readings"]')).toBeNull();
  });
});
