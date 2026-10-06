import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KjHoroscope } from '../src/elements/horoscope.ts';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { dayIn, localWall } from '../src/core/reports.ts';
import horoscopeFixture from './fixtures/horoscope.json';
import weeklyFixture from './fixtures/horoscope-weekly.json';

if (!customElements.get(KjHoroscope.tag)) customElements.define(KjHoroscope.tag, KjHoroscope);

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A `fetch` that answers with a recorded horoscope: Aries, 28 Sep 2026, IST. */
function stubFetch(fixture: unknown = horoscopeFixture) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(fixture)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(attrs: Record<string, string> = {}): Promise<KjHoroscope> {
  const element = document.createElement(KjHoroscope.tag) as KjHoroscope;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  await settle();
  return element;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

const text = (element: Element) => element.shadowRoot?.textContent?.replace(/\s+/g, ' ') ?? '';
const part = (element: Element, name: string) =>
  element.shadowRoot?.querySelector(`[part~="${name}"]`)?.textContent?.replace(/\s+/g, ' ') ?? '';

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<kj-horoscope> picker', () => {
  it('shows twelve signs and four periods and asks for nothing without a sign', async () => {
    const fetchMock = stubFetch();
    const ready = vi.fn();
    document.addEventListener('kj-ready', ready);
    const element = await mount();
    document.removeEventListener('kj-ready', ready);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
    expect(element.getAttribute('data-state')).toBe('ready');
    const signs = element.shadowRoot?.querySelectorAll('[data-sign]') ?? [];
    expect(signs).toHaveLength(12);
    expect(signs[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Aries');
    const icon = signs[0]?.querySelector('.kj-zi-l');
    expect(icon?.getAttribute('data-zi')).toBe('aries');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    // Drawn at once: the horoscope carries the icons' module itself.
    expect(icon?.querySelector('svg')).not.toBeNull();
    // The periods come with a sign: without one there is nothing to read.
    expect(element.shadowRoot?.querySelectorAll('[data-tab-group="period"]')).toHaveLength(0);
    expect(text(element)).toContain('Choose your sign');
  });

  it('names the signs and periods in Hindi', async () => {
    stubFetch();
    const element = await mount({ lang: 'hi', sign: 'aries' });
    expect(text(element)).toContain('मेष');
    expect(text(element)).toContain('वृश्चिक');
    expect(text(element)).toContain('साप्ताहिक');
    expect(element.shadowRoot?.querySelector('[part="signs"]')?.getAttribute('aria-label')).toBe(
      'अपनी राशि चुनें',
    );
  });

  it('asks for the sign a reader picks, and marks it pressed', async () => {
    const fetchMock = stubFetch();
    const element = await mount();

    element.shadowRoot?.querySelector<HTMLButtonElement>('[data-sign="aries"]')?.click();
    await settle();
    await settle();

    expect(element.getAttribute('sign')).toBe('aries');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/horoscope?key=');
    expect(bodyOf(fetchMock)).toEqual({
      sign: 'aries',
      period: 'daily',
      options: { language: ['en', 'hi'] },
    });
    const pressed = element.shadowRoot?.querySelector('[data-sign="aries"]');
    expect(pressed?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the page still when a sign is picked: no scrolling focus, no shrinking card', async () => {
    stubFetch();
    const element = await mount();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');

    element.shadowRoot?.querySelector<HTMLButtonElement>('[data-sign="aries"]')?.click();
    await settle();
    await settle();

    expect(focus).toHaveBeenCalled();
    for (const call of focus.mock.calls) expect(call[0]).toEqual({ preventScroll: true });
    focus.mockRestore();
  });

  it('puts the page back if a repaint after a click scrolled it, and only then', async () => {
    stubFetch();
    const element = await mount();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(800);
    const hold = (before: number) =>
      (element as unknown as { holdPlace(before: number): void }).holdPlace(before);

    hold(500);
    expect(scrollTo).not.toHaveBeenCalled();

    element.shadowRoot?.dispatchEvent(new Event('pointerdown'));
    hold(500);
    expect(scrollTo).toHaveBeenCalledWith(window.scrollX, 500);

    scrollTo.mockRestore();
    scrollY.mockRestore();
  });

  it('switches period from a tab', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ sign: 'leo' });

    const tabs = element.shadowRoot?.querySelectorAll('[role="tab"][data-tab-group="period"]');
    expect(tabs).toHaveLength(4);
    expect(element.shadowRoot?.querySelector('[role="tablist"]')).not.toBeNull();
    element.shadowRoot?.querySelector<HTMLButtonElement>('[data-tab="monthly"]')?.click();
    await settle();
    await settle();

    expect(element.getAttribute('period')).toBe('monthly');
    expect(bodyOf(fetchMock, 1).period).toBe('monthly');
  });

  it('shows the day tabs only for a day, and moves the date with them', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ sign: 'aries', timezone: 'Asia/Kolkata' });

    expect(element.shadowRoot?.querySelectorAll('[data-seg-group="day"]')).toHaveLength(3);
    element.shadowRoot?.querySelector<HTMLButtonElement>('[data-seg="1"]')?.click();
    await settle();
    await settle();

    const tomorrow = dayIn('Asia/Kolkata', 1);
    expect(element.getAttribute('date')).toBe(tomorrow);
    expect(bodyOf(fetchMock, 1).date).toBe(tomorrow);
    expect(bodyOf(fetchMock, 1).timezone).toBe('Asia/Kolkata');

    element.setAttribute('period', 'weekly');
    await settle();
    await settle();
    expect(element.shadowRoot?.querySelectorAll('[data-seg-group="day"]')).toHaveLength(0);
  });
});

describe('<kj-horoscope> rendering', () => {
  it('leads with the summary and its level, then five area cards', async () => {
    stubFetch();
    const element = await mount({ sign: 'aries', date: '2026-09-28' });

    expect(part(element, 'heading')).toContain('Aries · Daily');
    expect(part(element, 'heading')).toContain('28 Sep 2026');

    const summary = element.shadowRoot?.querySelector('[part~="summary"]');
    expect(summary?.querySelector('[part~="level"]')?.textContent).toBe('Needs care');
    expect(summary?.querySelector('[part~="text"]')?.textContent).toMatch(/^Today, small setbacks/);
    // The summary comes before the areas in the card.
    const card = element.shadowRoot?.querySelector('.kj-card')?.innerHTML ?? '';
    expect(card.indexOf('part="summary"')).toBeLessThan(card.indexOf('part="areas"'));

    const areas = [...(element.shadowRoot?.querySelectorAll('[part~="area"]') ?? [])];
    expect(areas.map((li) => li.querySelector('strong')?.textContent)).toEqual([
      'Work',
      'Money',
      'Relationships',
      'Health',
      'Education',
    ]);
    expect(areas.map((li) => li.querySelector('[part~="level"]')?.textContent)).toEqual([
      'Mixed',
      'Needs care',
      'Needs care',
      'Mixed',
      'Needs care',
    ]);
    expect(areas[0]?.querySelector('.kj-level-mixed')).not.toBeNull();
    expect(areas[0]?.querySelector('[part~="text"]')?.textContent?.length).toBeGreaterThan(20);
  });

  it('names the areas and levels in Hindi, from the same answer', async () => {
    stubFetch();
    const element = await mount({ sign: 'aries', lang: 'hi' });
    expect(part(element, 'area-work')).toContain('कार्य');
    expect(part(element, 'area-work')).toContain('मिश्रित');
    expect(part(element, 'area-education')).toContain('शिक्षा');
    expect(part(element, 'summary')).toContain('सावधानी');
    expect(part(element, 'summary')).toContain('आज');
  });

  it('keeps the transits hidden unless the page asks for them', async () => {
    stubFetch();
    const plain = await mount({ sign: 'aries' });
    expect(plain.shadowRoot?.querySelector('[part~="basis"]')).toBeNull();
    expect(text(plain)).not.toContain('Saturn');

    const off = await mount({ sign: 'aries', 'show-basis': 'false' });
    expect(off.shadowRoot?.querySelector('[part~="basis"]')).toBeNull();

    const shown = await mount({ sign: 'aries', 'show-basis': '' });
    const basis = shown.shadowRoot?.querySelector('details[part~="basis"]');
    expect(basis?.querySelector('summary')?.textContent).toBe('Transits behind this');
    expect(basis?.querySelectorAll('[part~="transit"]')).toHaveLength(10);
    const sun = basis?.querySelector('[part~="transit-sun"]')?.textContent?.replace(/\s+/g, ' ');
    expect(sun).toContain('Sun in your 6th house · Virgo · favourable');
  });

  it('dates a sign change in the transits, in IST, and marks a retrograde graha', async () => {
    stubFetch();
    const element = await mount({ sign: 'aries', 'show-basis': '' });
    const moons = element.shadowRoot?.querySelectorAll('[part~="transit-moon"]') ?? [];
    // The recorded Moon leaves Pisces at 04:46:38Z, which is 10:16 in Delhi.
    expect(moons[0]?.querySelector('[part~="when"]')?.textContent).toBe('until 10:16');
    expect(moons[1]?.querySelector('[part~="when"]')?.textContent).toBe('from 10:16');
    expect(element.shadowRoot?.querySelector('[part~="transit-saturn"] .kj-rx')).not.toBeNull();
    expect(element.shadowRoot?.querySelector('[part~="transit-sun"] .kj-rx')).toBeNull();

    element.setAttribute('lang', 'hi');
    await settle();
    const hindi = element.shadowRoot?.querySelectorAll('[part~="transit-moon"]') ?? [];
    expect(hindi[0]?.querySelector('[part~="when"]')?.textContent).toBe('10:16 तक');
  });

  it('shows no percentages, scores or numbers of its own', async () => {
    stubFetch();
    const element = await mount({ sign: 'aries' });
    expect(text(element)).not.toMatch(/%|lucky|\/\s*\d/i);
    expect(element.shadowRoot?.querySelector('.kj-meter, meter, progress')).toBeNull();
  });

  it('ends with the disclaimer, small', async () => {
    stubFetch();
    const element = await mount({ sign: 'aries' });
    const line = element.shadowRoot?.querySelector('.kj-disclaimer');
    expect(line?.textContent).toBe(
      'These predictions are indicative. For a reading of your own chart, consult an astrologer.',
    );
    const hindi = await mount({ sign: 'aries', lang: 'hi' });
    expect(hindi.shadowRoot?.querySelector('.kj-disclaimer')?.textContent).toContain('ज्योतिषी');
  });

  it('spans a week in the heading', async () => {
    stubFetch(weeklyFixture);
    const element = await mount({ sign: 'aries', period: 'weekly', date: '2026-09-28' });

    expect(part(element, 'heading')).toContain('Aries · Weekly');
    expect(part(element, 'span')).toBe('28 Sep – 4 Oct 2026');
    expect(part(element, 'summary')).toContain('This week');
  });

  it('repaints a lang flip from the answer it already has', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ sign: 'aries' });
    element.setAttribute('lang', 'hi');
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text(element)).toContain('मेष');
  });

  it('escapes what the answer says', async () => {
    const hostile = structuredClone(horoscopeFixture) as {
      data: { areas: { text: { en: string } }[] };
    };
    hostile.data.areas[0]!.text.en = '<img src=x onerror=alert(1)>';
    stubFetch(hostile);
    const element = await mount({ sign: 'aries' });
    expect(element.shadowRoot?.innerHTML).toContain('&lt;img');
    expect(element.shadowRoot?.innerHTML).not.toContain('<img');
  });
});

describe('<kj-horoscope> request', () => {
  it('sends a date, a zone and a period, and ignores a sign it does not know', async () => {
    const fetchMock = stubFetch();
    await mount({ sign: 'Leo', period: 'yearly', date: '2026-06-01', timezone: 'Europe/London' });
    expect(bodyOf(fetchMock)).toEqual({
      sign: 'leo',
      period: 'yearly',
      date: '2026-06-01',
      timezone: 'Europe/London',
      options: { language: ['en', 'hi'] },
    });

    fetchMock.mockClear();
    await mount({ sign: 'ophiuchus' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns the disclaimer off, or names the site’s astrologer', async () => {
    const fetchMock = stubFetch();
    await mount({ sign: 'aries', disclaimer: 'off' });
    expect((bodyOf(fetchMock).options as Record<string, unknown>).disclaimer).toBe('off');

    await mount({
      sign: 'aries',
      'disclaimer-name': 'Acharya Amit Verma',
      'disclaimer-url': 'https://kaaljyoti.com',
    });
    expect((bodyOf(fetchMock, 1).options as Record<string, unknown>).disclaimer).toEqual({
      name: 'Acharya Amit Verma',
      url: 'https://kaaljyoti.com',
    });

    await mount({ sign: 'leo', 'disclaimer-name': 'Pandit Ji', 'disclaimer-url': 'javascript:x' });
    expect((bodyOf(fetchMock, 2).options as Record<string, unknown>).disclaimer).toEqual({
      name: 'Pandit Ji',
    });
  });

  it('renders no disclaimer when the answer has none', async () => {
    const off = structuredClone(horoscopeFixture) as { data: { disclaimer?: unknown } };
    delete off.data.disclaimer;
    stubFetch(off);
    const element = await mount({ sign: 'aries', disclaimer: 'off' });
    expect(element.shadowRoot?.querySelector('.kj-disclaimer')).toBeNull();
  });
});

describe('localWall', () => {
  it('reads an instant in the answer’s zone, by name or by offset', () => {
    expect(localWall('2026-09-28T04:46:38.438Z', { name: 'Asia/Kolkata' })).toBe(
      '2026-09-28T10:16',
    );
    expect(localWall('2026-09-28T04:46:38.438Z', { utc_offset: '-03:30' })).toBe(
      '2026-09-28T01:16',
    );
    expect(localWall('2026-09-28T04:46:38.438Z', { name: 'Not/AZone', utc_offset: '+05:30' })).toBe(
      '2026-09-28T10:16',
    );
    expect(localWall(null, null)).toBe('');
  });
});
