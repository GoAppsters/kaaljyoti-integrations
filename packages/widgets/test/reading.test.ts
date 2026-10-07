import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KjReading } from '../src/elements/reading.ts';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import lagnaFixture from './fixtures/reading-lagna-leo.json';
import nakshatraFixture from './fixtures/reading-nakshatra.json';
import houseLordsFixture from './fixtures/reading-house-lords.json';
import grahasFixture from './fixtures/reading-grahas.json';
import yogasFixture from './fixtures/reading-yogas.json';
import vimshottariFixture from './fixtures/reading-vimshottari.json';
import varshphalFixture from './fixtures/reading-varshphal.json';
import lifeAreasFixture from './fixtures/reading-life-areas.json';
import kundliFixture from './fixtures/reading-kundli.json';

if (!customElements.get(KjReading.tag)) customElements.define(KjReading.tag, KjReading);

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The personal reports, recorded from staging for 1990-05-14 10:30, New Delhi. */
const PERSONAL: Record<string, unknown> = {
  '/reports/grahas': grahasFixture,
  '/reports/yogas': yogasFixture,
  '/reports/vimshottari': vimshottariFixture,
  '/reports/varshphal': varshphalFixture,
  '/reports/life-areas': lifeAreasFixture,
  '/reports/kundli': kundliFixture,
};

/**
 * Lagna answers from the recorded Leo reading, nakshatra ones from Purva
 * Ashadha, house lords from a Gemini-rising birth (1987-03-18 12:06, Delhi).
 */
function stubFetch() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const path = String(url);
    if (path.includes('/reports/house-lords')) return Promise.resolve(json(houseLordsFixture));
    const personal = Object.keys(PERSONAL).find((route) => path.includes(`${route}?`));
    if (personal) return Promise.resolve(json(PERSONAL[personal]));
    return Promise.resolve(
      json(path.includes('/reports/nakshatra') ? nakshatraFixture : lagnaFixture),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(attrs: Record<string, string> = {}): Promise<KjReading> {
  const element = document.createElement(KjReading.tag) as KjReading;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  await settle();
  return element;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

/** The heading's words; the sign icon is decoration and is checked on its own. */
const heading = (element: Element) =>
  element.shadowRoot?.querySelector('[part~="heading"]')?.textContent?.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<kj-reading type="lagna">', () => {
  it('reads a preset sign with no picker, and ends with the disclaimer', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ sign: 'leo' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/reports/lagna?key=');
    expect(bodyOf(fetchMock)).toEqual({ sign: 'leo', options: { language: ['en', 'hi'] } });
    expect(element.shadowRoot?.querySelector('select')).toBeNull();
    expect(heading(element)).toBe('Lagna · Leo');
    expect(
      element.shadowRoot?.querySelector('[part~="heading"] .kj-zi')?.getAttribute('data-zi'),
    ).toBe('leo');
    expect(element.shadowRoot?.querySelector('[part="title"]')?.textContent).toBe('Lagna');
    expect(element.shadowRoot?.querySelector('[part~="text"]')?.textContent).toMatch(
      /^With Leo rising/,
    );
    expect(element.shadowRoot?.querySelector('.kj-disclaimer')?.textContent).toContain(
      'consult an astrologer',
    );
  });

  it('repaints in Hindi from the same answer', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ sign: 'leo' });
    element.setAttribute('lang', 'hi');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(heading(element)).toBe('लग्न · सिंह');
    expect(element.shadowRoot?.querySelector('[part~="text"]')?.textContent).toContain('सिंह लग्न');
    expect(element.shadowRoot?.querySelector('.kj-card')?.getAttribute('lang')).toBe('hi');
  });

  it('shows a picker without a sign, and reads the one picked', async () => {
    const fetchMock = stubFetch();
    const ready = vi.fn();
    document.addEventListener('kj-ready', ready);
    const element = await mount();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
    const select = element.shadowRoot?.querySelector('select');
    expect(select?.querySelectorAll('option:not([disabled])')).toHaveLength(12);

    select!.value = 'leo';
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await settle();
    document.removeEventListener('kj-ready', ready);

    expect(element.getAttribute('sign')).toBe('leo');
    expect(bodyOf(fetchMock).sign).toBe('leo');
    expect(ready).toHaveBeenCalledTimes(1);
    // The picker stays, so the reader can pick again.
    expect(element.shadowRoot?.querySelector('select')?.value).toBe('leo');
    expect(heading(element)).toBe('Lagna · Leo');
  });

  it('reads the lagna of a birth', async () => {
    const fetchMock = stubFetch();
    await mount({ datetime: '1990-05-14T10:30:00', city: 'delhi' });
    expect(bodyOf(fetchMock)).toEqual({
      birth: {
        datetime: '1990-05-14T10:30:00',
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 'Asia/Kolkata',
        place: 'New Delhi',
      },
      options: { language: ['en', 'hi'] },
    });
  });

  it('sends the disclaimer attributes', async () => {
    const fetchMock = stubFetch();
    await mount({ sign: 'leo', disclaimer: 'OFF' });
    await mount({ sign: 'aries', 'disclaimer-name': 'Acharya Amit Verma' });
    expect((bodyOf(fetchMock, 0).options as Record<string, unknown>).disclaimer).toBe('off');
    expect((bodyOf(fetchMock, 1).options as Record<string, unknown>).disclaimer).toEqual({
      name: 'Acharya Amit Verma',
    });
  });
});

describe('<kj-reading type="nakshatra">', () => {
  it('lists the twenty-seven nakshatras, in Hindi too', async () => {
    stubFetch();
    const element = await mount({ type: 'nakshatra', lang: 'hi' });
    const options = element.shadowRoot?.querySelectorAll('option:not([disabled])') ?? [];
    expect(options).toHaveLength(27);
    expect(options[10]?.textContent).toBe('पूर्वा फाल्गुनी');
    expect(element.shadowRoot?.textContent).toContain('अपना नक्षत्र चुनें');
  });

  it('reads a preset nakshatra', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ type: 'nakshatra', nakshatra: 'purva_ashadha' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/reports/nakshatra?key=');
    expect(bodyOf(fetchMock)).toEqual({
      nakshatra: 'purva_ashadha',
      options: { language: ['en', 'hi'] },
    });
    expect(heading(element)).toBe('Nakshatra · Purva Ashadha');
    expect(element.shadowRoot?.querySelector('[part~="text"]')?.textContent).toMatch(
      /^Your Moon is in Purva Ashadha/,
    );
  });

  it('ignores a nakshatra id it does not know and offers the picker', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ type: 'nakshatra', nakshatra: 'abhijit' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.shadowRoot?.querySelector('select')).not.toBeNull();
  });
});

describe('<kj-reading type="house_lords">', () => {
  const BIRTH_ATTRS = {
    type: 'house_lords',
    datetime: '1987-03-18T12:06:00',
    lat: '28.6139',
    lon: '77.209',
    timezone: 'Asia/Kolkata',
  };

  const headings = (element: Element) =>
    [...(element.shadowRoot?.querySelectorAll('[part~="heading"]') ?? [])].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim(),
    );

  it('reads the birth once and draws twelve houses in order', async () => {
    const fetchMock = stubFetch();
    const element = await mount(BIRTH_ATTRS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/reports/house-lords?key=');
    expect(bodyOf(fetchMock)).toEqual({
      birth: {
        datetime: '1987-03-18T12:06:00',
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 'Asia/Kolkata',
      },
      options: { language: ['en', 'hi'] },
    });
    expect(element.shadowRoot?.querySelector('select')).toBeNull();

    const items = element.shadowRoot?.querySelectorAll('[part~="house"]') ?? [];
    expect(items).toHaveLength(12);
    const all = headings(element);
    expect(all[0]).toBe('1st house · Gemini · lord Mercury in the 9th');
    expect(all[1]).toBe('2nd house · Cancer · lord Moon in the 5th');
    expect(all[10]).toBe('11th house · Aries · lord Mars in the 11th');
    expect(items[0]?.querySelector('[part~="text"]')?.textContent).toMatch(
      /^Your lagna lord in the 9th/,
    );
    // The disclaimer once, after the twelfth house.
    const disclaimers = element.shadowRoot?.querySelectorAll('.kj-disclaimer') ?? [];
    expect(disclaimers).toHaveLength(1);
    expect(disclaimers[0]?.textContent).toContain('consult an astrologer');
    expect(
      items[11]!.compareDocumentPosition(disclaimers[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('repaints in Hindi from the same answer, with the API’s names', async () => {
    const fetchMock = stubFetch();
    const element = await mount(BIRTH_ATTRS);
    element.setAttribute('lang', 'hi');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const all = headings(element);
    expect(all[0]).toBe('प्रथम भाव · मिथुन · भावेश बुध नवम भाव में');
    expect(all[6]).toBe('सप्तम भाव · धनु · भावेश गुरु दशम भाव में');
    expect(element.shadowRoot?.querySelector('[part~="text"]')?.textContent).toMatch(/[ऀ-ॿ]/);
    expect(element.shadowRoot?.querySelector('.kj-disclaimer')?.textContent).toContain('सांकेतिक');
  });

  it('wants a birth: no picker, no call, the no-birth line', async () => {
    const fetchMock = stubFetch();
    const errors = vi.fn();
    document.addEventListener('kj-error', errors);
    const element = await mount({ type: 'house_lords', sign: 'leo' });
    document.removeEventListener('kj-error', errors);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.shadowRoot?.querySelector('select')).toBeNull();
    expect(element.shadowRoot?.querySelector('[data-code]')?.getAttribute('data-code')).toBe(
      'no_birth',
    );
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('takes a birth set from script, and the disclaimer attributes', async () => {
    const fetchMock = stubFetch();
    const element = await mount({ type: 'house-lords', disclaimer: 'off' });
    element.birth = {
      datetime: '1987-03-18T12:06:00',
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
    };
    await settle();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/reports/house-lords?key=');
    expect((bodyOf(fetchMock).options as Record<string, unknown>).disclaimer).toBe('off');
    expect(element.shadowRoot?.querySelectorAll('[part~="house"]')).toHaveLength(12);
  });
});

describe('the personal reports', () => {
  const BIRTH = {
    datetime: '1990-05-14T10:30:00',
    lat: '28.6139',
    lon: '77.209',
    timezone: 'Asia/Kolkata',
  };
  const BIRTH_BODY = {
    datetime: '1990-05-14T10:30:00',
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
  };

  const headings = (element: Element) =>
    [...(element.shadowRoot?.querySelectorAll('[part~="heading"]') ?? [])].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim(),
    );
  const partText = (element: Element, name: string) =>
    element.shadowRoot
      ?.querySelector(`[part~="${name}"]`)
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';

  it.each([
    ['grahas', '/v1/reports/grahas?key='],
    ['yogas', '/v1/reports/yogas?key='],
    ['vimshottari', '/v1/reports/vimshottari?key='],
    ['life-areas', '/v1/reports/life-areas?key='],
    ['Life Areas', '/v1/reports/life-areas?key='],
    ['life_areas', '/v1/reports/life-areas?key='],
  ])('type="%s" asks %s with the birth', async (type, route) => {
    const fetchMock = stubFetch();
    const element = await mount({ type, ...BIRTH });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(route);
    expect(bodyOf(fetchMock)).toEqual({
      birth: BIRTH_BODY,
      options: { language: ['en', 'hi'] },
    });
    expect(element.shadowRoot?.querySelector('select')).toBeNull();
    expect(element.shadowRoot?.querySelectorAll('.kj-disclaimer')).toHaveLength(1);
  });

  it.each(['grahas', 'yogas', 'vimshottari', 'varshphal', 'life_areas'])(
    'type="%s" wants a birth: no picker, no call, the no-birth line',
    async (type) => {
      const fetchMock = stubFetch();
      const element = await mount({ type, sign: 'leo' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(element.shadowRoot?.querySelector('select')).toBeNull();
      expect(element.shadowRoot?.querySelector('[data-code]')?.getAttribute('data-code')).toBe(
        'no_birth',
      );
    },
  );

  it('grahas: nine items, sign and house, and both readings', async () => {
    stubFetch();
    const element = await mount({ type: 'grahas', ...BIRTH });
    const items = element.shadowRoot?.querySelectorAll('[part~="graha"]') ?? [];
    expect(items).toHaveLength(9);
    expect(headings(element)[0]).toBe('Sun · Aries · 10th house');
    expect(headings(element)[1]).toBe('Moon · Sagittarius · 6th house');
    const texts = items[0]?.querySelectorAll('[part~="text"]') ?? [];
    expect(texts[0]?.textContent).toMatch(/^Your Sun is in Aries/);
    expect(texts[1]?.textContent).toMatch(/^The Sun in the tenth house/);

    element.setAttribute('lang', 'hi');
    await settle();
    expect(headings(element)[0]).toBe('सूर्य · मेष · दशम भाव');
  });

  it('yogas: each by name, with the grahas in it', async () => {
    stubFetch();
    const element = await mount({ type: 'yogas', ...BIRTH });
    expect(element.shadowRoot?.querySelectorAll('[part~="yoga"]')).toHaveLength(9);
    expect(headings(element)[0]).toBe('Gaja-Kesari Yoga Jupiter, Moon');
    expect(partText(element, 'participants')).toBe('Jupiter, Moon');
    expect(partText(element, 'yoga-gaja_kesari')).toContain('forms because Jupiter');

    element.setAttribute('lang', 'hi');
    await settle();
    expect(headings(element)[0]).toBe('गजकेसरी योग गुरु, चंद्र');
  });

  it('yogas: says so when none form', async () => {
    const none = structuredClone(yogasFixture) as { data: { yogas: unknown[] } };
    none.data.yogas = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(none)));
    const element = await mount({ type: 'yogas', ...BIRTH });
    expect(element.shadowRoot?.textContent).toContain('No yogas of this list form in this chart.');
  });

  it('vimshottari: a heading, dates and level per mahadasha; the running one marked; no antardashas', async () => {
    stubFetch();
    const element = await mount({ type: 'vimshottari', ...BIRTH });
    const items = [...(element.shadowRoot?.querySelectorAll('[part~="dasha"]') ?? [])];
    expect(items).toHaveLength(7);
    expect(items[0]?.textContent?.replace(/\s+/g, ' ')).toContain('Venus mahadasha');
    expect(items[0]?.querySelector('[part~="when"]')?.textContent?.trim()).toBe(
      '14 May 1990 – 23 Nov 2003',
    );
    expect(items[0]?.querySelector('[part~="level"]')?.textContent).toBe('Favourable');

    const current = element.shadowRoot?.querySelectorAll('.kj-current') ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute('part')).toContain('dasha-mars');
    expect(current[0]?.querySelector('[part~="badge-current"]')?.textContent).toBe('Running now');
    expect(current[0]?.querySelector('[part~="level"]')?.textContent).toBe('Mixed');

    // Seven mahadashas, and nothing from the antardashas the answer also has.
    expect(element.shadowRoot?.textContent).not.toContain('Antardasha');
    expect(element.shadowRoot?.querySelectorAll('li')).toHaveLength(7);

    element.setAttribute('lang', 'hi');
    await settle();
    expect(headings(element)[0]).toContain('शुक्र महादशा');
    expect(partText(element, 'badge-current')).toBe('वर्तमान');
  });

  it('varshphal: the running year by default, the summary, seven areas and the periods', async () => {
    const fetchMock = stubFetch();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    const element = await mount({ type: 'varshphal', ...BIRTH });
    vi.useRealTimers();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/reports/varshphal?key=');
    expect(bodyOf(fetchMock)).toEqual({
      birth: BIRTH_BODY,
      options: { language: ['en', 'hi'] },
      year: 2026,
    });

    expect(headings(element)[0]).toBe('Varshphal 2026 14 May 2026 – 14 May 2027');
    expect(partText(element, 'summary')).toMatch(/^Mixed This year, gains and hurdles/);
    const areas = [...(element.shadowRoot?.querySelectorAll('[part~="area"]') ?? [])];
    expect(areas.map((area) => area.querySelector('strong')?.textContent)).toEqual([
      'Work',
      'Money',
      'Relationships',
      'Health',
      'Education',
      'Home and property',
      'Travel',
    ]);
    const months = element.shadowRoot?.querySelectorAll('[part~="month"]') ?? [];
    expect(months).toHaveLength(10);
    expect(months[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Venus 14 May 2026 – 24 Jun 2026',
    );
    expect(months[0]?.classList.contains('kj-level-favourable')).toBe(true);
  });

  it('varshphal: sends any four-digit year the page names (the API decides the range), and ignores a malformed one', async () => {
    const fetchMock = stubFetch();
    await mount({ type: 'varshphal', year: '2027', ...BIRTH });
    await mount({ type: 'varshphal', year: '1700', ...BIRTH });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    await mount({ type: 'varshphal', year: 'next', ...BIRTH });
    vi.useRealTimers();
    expect(bodyOf(fetchMock, 0).year).toBe(2027);
    expect(bodyOf(fetchMock, 1).year).toBe(1700);
    expect(bodyOf(fetchMock, 2).year).toBe(2026);
  });

  it("varshphal: before this year's birthday the running year is last year, never before birth", async () => {
    const fetchMock = stubFetch();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 4, 13, 12));
    await mount({ type: 'varshphal', ...BIRTH });
    vi.setSystemTime(new Date(2026, 4, 14, 12));
    await mount({ type: 'varshphal', ...BIRTH, datetime: '1990-05-14T23:00:00' });
    vi.setSystemTime(new Date(1990, 2, 1, 12));
    await mount({ type: 'varshphal', ...BIRTH });
    vi.useRealTimers();
    expect(bodyOf(fetchMock, 0).year).toBe(2025);
    expect(bodyOf(fetchMock, 1).year).toBe(2026);
    expect(bodyOf(fetchMock, 2).year).toBe(1990);
  });

  it('kundli: one call for the parts named, each drawn in order, one disclaimer', async () => {
    const fetchMock = stubFetch();
    const element = await mount({
      type: 'kundli',
      parts: 'varshphal, lagna yogas vimshottari palmistry',
      ...BIRTH,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/reports/kundli?key=');
    // The API's order, the unknown dropped, and no year: the API reads the running one.
    expect(bodyOf(fetchMock)).toEqual({
      birth: BIRTH_BODY,
      options: { language: ['en', 'hi'] },
      parts: ['lagna', 'yogas', 'vimshottari', 'varshphal'],
    });

    const sections = [...(element.shadowRoot?.querySelectorAll('[part~="section"]') ?? [])];
    expect(sections.map((section) => section.getAttribute('part'))).toEqual([
      'section section-lagna',
      'section section-yogas',
      'section section-vimshottari',
      'section section-varshphal',
    ]);
    const text = (node: Element | undefined, name: string) =>
      node?.querySelector(`[part~="${name}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(text(sections[0], 'heading')).toBe('Lagna · Cancer');
    expect(sections[1]?.querySelector('[part~="section-heading"]')?.textContent).toBe('Yogas');
    expect(sections[1]?.querySelectorAll('[part~="yoga"]')).toHaveLength(9);
    expect(sections[2]?.querySelectorAll('.kj-current')).toHaveLength(1);
    expect(text(sections[3], 'heading')).toMatch(/^Varshphal 2026/);
    expect(element.shadowRoot?.querySelectorAll('.kj-disclaimer')).toHaveLength(1);

    element.setAttribute('lang', 'hi');
    await settle();
    expect(partText(element, 'section-lagna')).toContain('लग्न · कर्क');
  });

  it('kundli: every part when none is named, and a year only when given', async () => {
    const fetchMock = stubFetch();
    await mount({ type: 'kundli', year: '2027', ...BIRTH });
    expect(bodyOf(fetchMock)).toEqual({
      birth: BIRTH_BODY,
      options: { language: ['en', 'hi'] },
      year: 2027,
    });
  });

  it('life areas: the summary line, then one card per area, no basis', async () => {
    stubFetch();
    const element = await mount({ type: 'life_areas', ...BIRTH });
    expect(partText(element, 'summary')).toMatch(/^Your chart shows its greatest strength/);
    // The life areas' summary has no level of its own.
    expect(element.shadowRoot?.querySelector('[part~="summary"] [part~="level"]')).toBeNull();
    const areas = [...(element.shadowRoot?.querySelectorAll('[part~="area"]') ?? [])];
    expect(areas).toHaveLength(11);
    expect(areas[0]?.querySelector('strong')?.textContent).toBe('Personality');
    expect(areas[0]?.querySelector('[part~="level"]')?.textContent).toBe('Favourable');
    expect(partText(element, 'area-children')).toContain('Needs care');
    expect(element.shadowRoot?.textContent).not.toMatch(/baseline|functional|jha_/);

    element.setAttribute('lang', 'hi');
    await settle();
    expect(partText(element, 'area-marriage')).toContain('विवाह और साझेदारी');
    expect(partText(element, 'area-marriage')).toContain('अनुकूल');
  });

  it('says the month is used up, on a 402 quota_exceeded', async () => {
    const refusal = {
      status: 'error',
      error: {
        code: 'quota_exceeded',
        message:
          "this request costs 5 credits, more than is left of this month's 1,000 (1,000 included in the Free plan)",
        docs: 'https://kaaljyoti.com/api/docs/errors#quota_exceeded',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(refusal), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const errors = vi.fn();
    document.addEventListener('kj-error', errors);
    const element = await mount({ type: 'life_areas', ...BIRTH });
    document.removeEventListener('kj-error', errors);

    const state = element.shadowRoot?.querySelector('[data-code="quota_exceeded"]');
    expect(state?.getAttribute('part')).toBe('plan-required quota');
    expect(state?.querySelector('.kj-state-title')?.textContent).toBe('Monthly limit reached');
    expect(state?.textContent).toContain('used up its credits');
    const owner = state?.querySelector('[part="plan-owner"]');
    expect(owner?.textContent).toContain('Site owner: add credits or upgrade at');
    expect(owner?.querySelector('a')?.getAttribute('href')).toBe(
      'https://kaaljyoti.com/api/pricing',
    );
    expect(errors).toHaveBeenCalledTimes(1);

    element.setAttribute('lang', 'hi');
    await settle();
    expect(
      element.shadowRoot?.querySelector('[data-code="quota_exceeded"]')?.textContent,
    ).toContain('मासिक सीमा पूरी');
  });

  it('links the pricing page a site configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'quota_exceeded',
                message: 'you have used all 50,000 credits for this month',
                docs: 'x',
              },
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );
    configure({ pricingUrl: 'https://example.com/plans' });
    const element = await mount({ type: 'grahas', ...BIRTH });
    expect(element.shadowRoot?.querySelector('[part="plan-owner"] a')?.getAttribute('href')).toBe(
      'https://example.com/plans',
    );
    configure({ pricingUrl: 'javascript:alert(1)' });
    const other = await mount({ type: 'yogas', ...BIRTH, 'pricing-url': 'javascript:x' });
    expect(other.shadowRoot?.querySelector('[part="plan-owner"] a')?.getAttribute('href')).toBe(
      'https://kaaljyoti.com/api/pricing',
    );
  });

  it("links nowhere with pricing-url off, keeping the reader's line", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'error',
              error: { code: 'quota_exceeded', message: 'credits used up', docs: 'x' },
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );
    configure({ pricingUrl: 'off' });
    const element = await mount({ type: 'grahas', ...BIRTH });
    const root = element.shadowRoot!;
    expect(root.querySelector('[part~="quota"]')).not.toBeNull();
    expect(root.querySelector('[part="plan-owner"]')).toBeNull();
    expect(root.querySelector('a')).toBeNull();
    expect(root.innerHTML).not.toContain('kaaljyoti.com');
  });
});
