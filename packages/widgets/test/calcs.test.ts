/**
 * The stage-2 birth calculators and reports: the compact form and its fold,
 * each widget's calls and drawing, the monthly-limit card, and Hindi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { KjDasha } from '../src/elements/dasha.ts';
import { KjKp } from '../src/elements/kp.ts';
import { KjLagna } from '../src/elements/lagna.ts';
import { KjLifeAreas } from '../src/elements/life-areas.ts';
import { KjManglik } from '../src/elements/manglik.ts';
import { KjMoonSign } from '../src/elements/moon-sign.ts';
import { KjSadeSati } from '../src/elements/sade-sati.ts';
import { KjStrength } from '../src/elements/strength.ts';
import { KjVargas } from '../src/elements/vargas.ts';
import { KjVarshphal, wallWithSeconds } from '../src/elements/varshphal.ts';
import { KjVimshottariReading } from '../src/elements/vimshottari-reading.ts';
import {
  BIRTH_ATTRS,
  OUT_OF_CREDITS,
  fillBirth,
  hangingFetch,
  json,
  mount,
  settle,
  stubFetch,
  submitForm,
  text,
} from './support.ts';

beforeEach(() => {
  resetConfig();
  clearCache();
  localStorage.clear();
  configure({ key: 'kj_pub_test', baseUrl: 'https://api-staging.kaaljyoti.com', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The inner element a calculator draws (a reading or a chart), and its shadow root. */
function inner(el: HTMLElement, tag: string): ShadowRoot {
  const found = el.shadowRoot!.querySelector(tag);
  if (!found?.shadowRoot) throw new Error(`no ${tag}`);
  return found.shadowRoot;
}

describe('the compact birth form and its fold', () => {
  it('draws the one-person form without gender, and asks nothing until a submit', async () => {
    const { fetchMock } = stubFetch();
    const el = mount<KjMoonSign>(KjMoonSign, {});
    await settle();
    const root = el.shadowRoot!;
    expect(root.querySelector('[data-field="name"]')).not.toBeNull();
    expect(root.querySelector('[data-field="gender"]')).toBeNull();
    expect(root.querySelector('[data-field="q"]')).not.toBeNull();
    expect(text(root.querySelector('[part="submit"]'))).toBe('Find my moon sign');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('folds into one line after a submit, and "Edit details" opens it again', async () => {
    const { calls } = stubFetch();
    const el = mount<KjMoonSign>(KjMoonSign, {});
    await settle();
    const root = el.shadowRoot!;
    fillBirth(root);
    const submitted = vi.fn();
    el.addEventListener('kj-submit', submitted);
    submitForm(root);
    await settle();
    expect(submitted).toHaveBeenCalledOnce();
    expect(root.querySelector('form')?.hasAttribute('hidden')).toBe(true);
    const line = root.querySelector('[part~="collapsed"]');
    expect(text(line)).toContain('Asha · 14 May 1990, 10:30 · Varanasi');
    expect(text(line)).toContain('Edit details');
    expect(calls[0]!.path).toBe('/kundli');
    expect(calls[0]!.body.birth).toEqual({
      datetime: '1990-05-14T10:30:00',
      latitude: 25.3176,
      longitude: 82.9739,
      timezone: 'Asia/Kolkata',
      place: 'Varanasi',
    });
    root.querySelector<HTMLElement>('[data-action="edit"]')!.click();
    expect(root.querySelector('form')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[part~="collapsed"]')).toBeNull();
    // What was typed is still there, and the result stays under the form.
    expect(root.querySelector<HTMLInputElement>('[data-field="name"]')!.value).toBe('Asha');
    expect(root.querySelector('[part~="result"]')).not.toBeNull();
  });

  it('keeps the form open and marks what is missing', async () => {
    const { fetchMock } = stubFetch();
    const el = mount<KjManglik>(KjManglik, {});
    await settle();
    submitForm(el.shadowRoot!);
    await settle();
    expect(el.shadowRoot!.querySelector('form')?.hasAttribute('hidden')).toBe(false);
    expect(el.shadowRoot!.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('remembers the entry under the kundli form’s slot, for the next calculator', async () => {
    stubFetch();
    const first = mount<KjMoonSign>(KjMoonSign, {});
    await settle();
    fillBirth(first.shadowRoot!);
    submitForm(first.shadowRoot!);
    await settle();
    expect(localStorage.getItem('kj:birth:v2:kundli')).toContain('Varanasi');
    const next = mount<KjLagna>(KjLagna, {});
    await settle();
    expect(next.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).toBe(
      'Asha',
    );
    expect(text(next.shadowRoot!.querySelector('[part~="remembered"]'))).toContain('Clear');
  });

  it('takes the birth from attributes: no form, the result at once', async () => {
    const { calls } = stubFetch();
    const el = mount<KjMoonSign>(KjMoonSign, { ...BIRTH_ATTRS, name: 'Asha', reading: 'off' });
    await settle();
    expect(el.shadowRoot!.querySelector('form')).toBeNull();
    expect(text(el.shadowRoot!.querySelector('.kj-sub'))).toBe(
      'Asha · 14 May 1990, 10:30 · New Delhi',
    );
    expect(calls.map((call) => call.path)).toEqual(['/kundli']);
  });

  it('draws the skeleton while the answer is on its way', async () => {
    hangingFetch();
    const el = mount<KjManglik>(KjManglik, BIRTH_ATTRS);
    await settle();
    expect(el.shadowRoot!.querySelector('[part~="result"] .kj-skeleton')).not.toBeNull();
  });
});

describe('<kj-moon-sign> and <kj-lagna>', () => {
  it('moon sign: the rashi, the nakshatra and pada, and the nakshatra reading — two calls', async () => {
    const { calls } = stubFetch();
    const el = mount<KjMoonSign>(KjMoonSign, BIRTH_ATTRS);
    const ready = vi.fn();
    el.addEventListener('kj-ready', ready);
    await settle(10);
    expect(calls.map((call) => call.path).sort()).toEqual(['/kundli', '/reports/nakshatra']);
    const root = el.shadowRoot!;
    expect(text(root.querySelector('[part~="tile-rashi"]'))).toContain('Sagittarius');
    expect(text(root.querySelector('[part~="tile-nakshatra"]'))).toContain('Pada');
    expect(text(inner(el, 'kj-reading'))).toContain('Nakshatra');
    expect(ready).toHaveBeenCalled();
  });

  it('lagna: the sign and the degree in it, and the lagna reading', async () => {
    const { calls } = stubFetch();
    const el = mount<KjLagna>(KjLagna, BIRTH_ATTRS);
    await settle(10);
    expect(calls.map((call) => call.path).sort()).toEqual(['/kundli', '/reports/lagna']);
    expect(text(el.shadowRoot!.querySelector('[part~="tile-lagna"]'))).toMatch(
      /Cancer.*Ascendant at \d+°\d\d′ in the sign/,
    );
    expect(inner(el, 'kj-reading').querySelector('.kj-prose')).not.toBeNull();
  });

  it('shares /v1/kundli with a neighbour through the page memo', async () => {
    const { calls } = stubFetch();
    mount(KjMoonSign, { ...BIRTH_ATTRS, reading: 'off' });
    mount(KjLagna, { ...BIRTH_ATTRS, reading: 'off' });
    await settle();
    expect(calls.filter((call) => call.path === '/kundli')).toHaveLength(1);
  });

  it('draws in Hindi', async () => {
    stubFetch();
    const el = mount<KjLagna>(KjLagna, { ...BIRTH_ATTRS, lang: 'hi', reading: 'off' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="tile-lagna"]'))).toContain('कर्क');
    expect(text(el.shadowRoot!.querySelector('.kj-heading'))).toBe('लग्न');
  });
});

describe('<kj-manglik>', () => {
  it('says manglik, with the house, from /v1/kundli/yogas — one call', async () => {
    const { calls } = stubFetch();
    const el = mount<KjManglik>(KjManglik, BIRTH_ATTRS);
    await settle();
    expect(calls.map((call) => call.path)).toEqual(['/kundli/yogas']);
    const verdict = el.shadowRoot!.querySelector('[part~="mangal"]');
    expect(verdict?.getAttribute('data-manglik')).toBe('yes');
    expect(text(verdict)).toContain('Mars is in the 8th house from the lagna.');
    expect(text(el.shadowRoot!.querySelector('[part~="no-doshas"]'))).toContain('No other dosha');
  });

  it('names the engine’s mitigation, and lists the other doshas with their grahas', async () => {
    stubFetch({
      '/kundli/yogas': () =>
        json({
          status: 'ok',
          data: {
            yogas: [
              {
                category: 'Dosha',
                code: 'mangal_dosha',
                detail: 'Mars in house 7 from lagna — mitigated (Mars in own/exalted sign)',
                name: 'Mangal Dosha',
                participants: [{ id: 'mars', name: 'Mars', names: { en: 'Mars', hi: 'मंगल' } }],
              },
              {
                category: 'Dosha',
                code: 'kaal_sarp',
                detail: 'All planets between Rahu and Ketu',
                name: 'Kaal Sarp Dosha',
                participants: [{ id: 'rahu', name: 'Rahu', names: { en: 'Rahu', hi: 'राहु' } }],
              },
              {
                category: 'Raj',
                code: 'raj_yoga',
                detail: 'x',
                name: 'Raj Yoga',
                participants: [],
              },
            ],
          },
        }),
    });
    const el = mount<KjManglik>(KjManglik, { ...BIRTH_ATTRS, lang: 'hi' });
    await settle();
    const root = el.shadowRoot!;
    expect(text(root.querySelector('[part~="mangal"]'))).toContain('सप्तम भाव');
    expect(text(root.querySelector('[part~="mangal"]'))).toContain('परिहार');
    const others = text(root.querySelector('[part~="doshas"]'));
    expect(others).toContain('काल सर्प दोष');
    expect(others).toContain('राहु');
    expect(others).not.toContain('Raj');
  });

  it('says not manglik when the engine finds no Mangal dosha', async () => {
    stubFetch({ '/kundli/yogas': () => json({ status: 'ok', data: { yogas: [] } }) });
    const el = mount<KjManglik>(KjManglik, BIRTH_ATTRS);
    await settle();
    expect(el.shadowRoot!.querySelector('[part~="mangal"]')?.getAttribute('data-manglik')).toBe(
      'no',
    );
  });

  it('shows the monthly-limit card in place of a refused answer', async () => {
    stubFetch({ '/kundli/yogas': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjManglik>(KjManglik, BIRTH_ATTRS);
    await settle();
    expect(el.shadowRoot!.querySelector('[part~="plan-required"]')).not.toBeNull();
  });
});

describe('<kj-sade-sati>', () => {
  it('asks this calendar year’s window and says what is running now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const { calls } = stubFetch();
    const el = mount<KjSadeSati>(KjSadeSati, BIRTH_ATTRS);
    await settle();
    expect(calls[0]!.path).toBe('/kundli/sade-sati');
    expect(calls[0]!.body).toMatchObject({
      from: '2026-01-01T00:00:00Z',
      to: '2027-01-01T00:00:00Z',
    });
    const root = el.shadowRoot!;
    expect(root.querySelector('[part~="verdict"]')?.getAttribute('data-running')).toBe(
      'small_panoti',
    );
    expect(text(root.querySelector('[part~="verdict"]'))).toContain('continues into 2027');
    const row = text(root.querySelector('[part~="phase-small_panoti"]'));
    expect(row).toContain('Dhaiya (small panoti)');
    expect(row).toContain('before 1 Jan 2026');
  });

  it('steps a year: one call per year shown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const { calls } = stubFetch();
    const el = mount<KjSadeSati>(KjSadeSati, BIRTH_ATTRS);
    await settle();
    el.shadowRoot!.querySelector<HTMLElement>('[data-step="1"]')!.click();
    await settle();
    expect(calls.map((call) => call.body.from)).toEqual([
      '2026-01-01T00:00:00Z',
      '2027-01-01T00:00:00Z',
    ]);
    expect(text(el.shadowRoot!.querySelector('.kj-step-label'))).toBe('2027');
  });

  it('says so when nothing runs in a year', async () => {
    stubFetch({
      '/kundli/sade-sati': () =>
        json({ status: 'ok', data: { phases: [], arc_spans: [], degree_windows: [] } }),
    });
    const el = mount<KjSadeSati>(KjSadeSati, { ...BIRTH_ATTRS, lang: 'hi' });
    await settle();
    expect(el.shadowRoot!.querySelector('[part~="verdict"]')?.getAttribute('data-running')).toBe(
      'no',
    );
    expect(text(el.shadowRoot!.querySelector('[part~="no-phases"]'))).toContain(
      'साढ़े साती या ढैया नहीं',
    );
  });
});

describe('<kj-dasha>', () => {
  it('asks Vimshottari to three levels, once, and marks the running chain', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const { calls } = stubFetch();
    const el = mount<KjDasha>(KjDasha, BIRTH_ATTRS);
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ system: 'vimshottari', levels: 3 });
    const root = el.shadowRoot!;
    expect(text(root.querySelector('[part~="running"]'))).toContain('Mars / Moon / Ketu');
    expect(root.querySelectorAll('[part~="period"]')).toHaveLength(9);
    expect(root.querySelector('.kj-now-row [part~="badge-current"]')).not.toBeNull();
  });

  it('drills from a mahadasha to its antardashas and pratyantardashas, and back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const { calls } = stubFetch();
    const el = mount<KjDasha>(KjDasha, BIRTH_ATTRS);
    await settle();
    const root = el.shadowRoot!;
    root.querySelector<HTMLElement>('[data-action="open"][data-index="3"]')!.click();
    expect(text(root.querySelector('thead th'))).toBe('Antardasha');
    expect(text(root.querySelector('[part~="crumbs"]'))).toContain('Mars');
    root.querySelector<HTMLElement>('[data-action="open"][data-index="6"]')!.click();
    expect(text(root.querySelector('thead th'))).toBe('Pratyantardasha');
    expect(root.querySelector('[data-action="open"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-action="crumb"][data-depth="0"]')!.click();
    expect(text(root.querySelector('thead th'))).toBe('Mahadasha');
    expect(calls).toHaveLength(1);
  });

  it('switches to Yogini: one more call, levels 2, the yoginis named', async () => {
    const { calls } = stubFetch();
    const el = mount<KjDasha>(KjDasha, { ...BIRTH_ATTRS, lang: 'hi' });
    await settle();
    el.shadowRoot!.querySelector<HTMLElement>('[data-seg="yogini"]')!.click();
    await settle();
    expect(calls[1]!.body).toMatchObject({ system: 'yogini', levels: 2 });
    expect(text(el.shadowRoot!.querySelector('[part~="periods"]'))).toContain('सिद्धा (शुक्र)');
  });

  it('hides the switch with yogini="off"', async () => {
    stubFetch();
    const el = mount<KjDasha>(KjDasha, { ...BIRTH_ATTRS, yogini: 'off' });
    await settle();
    expect(el.shadowRoot!.querySelector('[data-seg="yogini"]')).toBeNull();
  });
});

describe('<kj-vargas>', () => {
  it('asks all vargas once, draws D9 by default with its chart, and switches without a new vargas call', async () => {
    const { calls } = stubFetch();
    const el = mount<KjVargas>(KjVargas, BIRTH_ATTRS);
    await settle(10);
    const root = el.shadowRoot!;
    expect(calls.filter((call) => call.path === '/kundli/vargas')).toHaveLength(1);
    const chart = root.querySelector('kj-chart');
    expect(chart?.getAttribute('varga')).toBe('d9');
    expect(calls.find((call) => call.path === '/kundli/chart')?.body.varga).toBe('d9');
    expect(text(root.querySelector('[part~="varga-row-moon"]'))).toContain('Virgo');
    // The Moon is in Sagittarius in D1 and Virgo in D9: no vargottama.
    expect(root.querySelector('[part~="varga-row-moon"] .kj-badge')).toBeNull();
    const select = root.querySelector<HTMLSelectElement>('[data-pick="varga"]')!;
    select.value = 'd10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(10);
    expect(root.querySelector('kj-chart')?.getAttribute('varga')).toBe('d10');
    expect(calls.filter((call) => call.path === '/kundli/vargas')).toHaveLength(1);
    expect(text(root.querySelector('[part~="read-for"]'))).toContain('career');
  });

  it('marks vargottama where the D1 and varga signs agree', async () => {
    stubFetch();
    const el = mount<KjVargas>(KjVargas, { ...BIRTH_ATTRS, varga: 'd9' });
    await settle(10);
    // Saturn is in Capricorn in both D1 and D9 in this chart.
    expect(text(el.shadowRoot!.querySelector('[part~="varga-row-saturn"]'))).toContain(
      'Vargottama',
    );
  });
});

describe('<kj-kp>', () => {
  it('draws cusps, planets, significators and ruling planets from one call', async () => {
    const { calls } = stubFetch();
    const el = mount<KjKp>(KjKp, BIRTH_ATTRS);
    await settle();
    expect(calls.map((call) => call.path)).toEqual(['/kp/chart']);
    const root = el.shadowRoot!;
    const first = text(root.querySelector('[part~="cusps-row-1"]'));
    expect(first).toContain('Cancer 9°08′');
    expect(first).toContain('Pushya');
    expect(first).toContain('Saturn');
    root.querySelector<HTMLElement>('[data-tab="planets"]')!.click();
    expect(root.querySelectorAll('[part~="planets-row"]')).toHaveLength(9);
    root.querySelector<HTMLElement>('[data-tab="significators"]')!.click();
    expect(text(root.querySelector('[part~="house-row-1"]'))).toContain('Ketu');
    root.querySelector<HTMLElement>('[data-tab="ruling"]')!.click();
    expect(text(root.querySelector('[part~="ruling-day_lord"]'))).toContain('Moon');
    expect(calls).toHaveLength(1);
  });

  it('draws in Hindi', async () => {
    stubFetch();
    const el = mount<KjKp>(KjKp, { ...BIRTH_ATTRS, lang: 'hi' });
    await settle();
    expect(text(el.shadowRoot!.querySelector('[part~="cusps-row-1"]'))).toContain('पुष्य');
  });
});

describe('<kj-strength>', () => {
  it('draws Shadbala against the minimum; Ashtakavarga on its first opening', async () => {
    const { calls } = stubFetch();
    const el = mount<KjStrength>(KjStrength, BIRTH_ATTRS);
    await settle();
    expect(calls.map((call) => call.path)).toEqual(['/kundli/shadbala']);
    const root = el.shadowRoot!;
    expect(text(root.querySelector('[part~="shadbala-mercury"]'))).toContain('Below minimum');
    expect(text(root.querySelector('[part~="shadbala-sun"]'))).toContain('10.00 rupas');
    root.querySelector<HTMLElement>('[data-tab="ashtakavarga"]')!.click();
    await settle();
    expect(calls.map((call) => call.path)).toEqual(['/kundli/shadbala', '/kundli/ashtakavarga']);
    expect(text(root.querySelector('[part~="sign-aries"]'))).toContain('31');
    expect(text(root.querySelector('[part~="sign-grid-caption"]'))).toContain('Total 337');
    expect(root.querySelectorAll('[part~="bav-row"]')).toHaveLength(8);
  });

  it('shows the monthly-limit card in the tab whose request was refused', async () => {
    stubFetch({ '/kundli/ashtakavarga': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjStrength>(KjStrength, { ...BIRTH_ATTRS, tab: 'ashtakavarga' });
    await settle();
    expect(
      el.shadowRoot!.querySelector('[role="tabpanel"] [part~="plan-required"]'),
    ).not.toBeNull();
  });
});

describe('the reports: <kj-life-areas>, <kj-vimshottari-reading>, <kj-varshphal>', () => {
  it('life areas: the report, one call', async () => {
    const { calls } = stubFetch();
    const el = mount<KjLifeAreas>(KjLifeAreas, BIRTH_ATTRS);
    await settle(10);
    expect(calls.map((call) => call.path)).toEqual(['/reports/life-areas']);
    expect(inner(el, 'kj-reading').querySelectorAll('[part~="area"]').length).toBeGreaterThan(5);
  });

  it('life areas with no credits left: the monthly-limit card, never a raw error', async () => {
    stubFetch({ '/reports/life-areas': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjLifeAreas>(KjLifeAreas, BIRTH_ATTRS);
    await settle(10);
    const card = inner(el, 'kj-reading').querySelector('[part~="plan-required"]');
    expect(text(card)).toContain('Monthly limit reached');
  });

  it('Vimshottari reading: the mahadashas read, one call', async () => {
    const { calls } = stubFetch();
    const el = mount<KjVimshottariReading>(KjVimshottariReading, BIRTH_ATTRS);
    await settle(10);
    expect(calls.map((call) => call.path)).toEqual(['/reports/vimshottari']);
    expect(inner(el, 'kj-reading').querySelector('[part~="dasha-current"]')).not.toBeNull();
  });

  it('varshphal: the year’s figures, the chart of the return, and the reading — three calls', async () => {
    const { calls } = stubFetch();
    const el = mount<KjVarshphal>(KjVarshphal, { ...BIRTH_ATTRS, year: '2026' });
    await settle(12);
    expect(calls.map((call) => call.path).sort()).toEqual([
      '/kundli/chart',
      '/reports/varshphal',
      '/varshphal',
    ]);
    expect(calls.find((call) => call.path === '/varshphal')!.body.year).toBe(2026);
    const root = el.shadowRoot!;
    expect(text(root.querySelector('[part~="tile-begins"]'))).toContain('14 May 2026');
    expect(text(root.querySelector('[part~="tile-begins"]'))).toContain('16:03');
    expect(text(root.querySelector('[part~="tile-muntha"]'))).toContain('in the 11th house');
    expect(text(root.querySelector('[part~="tile-year-lord"]'))).toContain('Moon');
    // The varsha kundli is the chart of the return, at the birthplace.
    const chart = root.querySelector('kj-chart')!;
    expect(chart.getAttribute('datetime')).toBe('2026-05-14T16:03:33');
    expect(chart.getAttribute('lat')).toBe('28.6139');
    expect(root.querySelector('kj-reading')?.getAttribute('year')).toBe('2026');
  });

  it('varshphal with too few credits left: the figures stand, the reading is the card', async () => {
    stubFetch({ '/reports/varshphal': () => json(OUT_OF_CREDITS, 402) });
    const el = mount<KjVarshphal>(KjVarshphal, { ...BIRTH_ATTRS, year: '2026' });
    await settle(12);
    expect(el.shadowRoot!.querySelector('[part~="tile-muntha"]')).not.toBeNull();
    expect(inner(el, 'kj-reading').querySelector('[part~="plan-required"]')).not.toBeNull();
  });

  it('varshphal steps a year: the next year’s calls', async () => {
    const { calls } = stubFetch();
    const el = mount<KjVarshphal>(KjVarshphal, { ...BIRTH_ATTRS, year: '2026', reading: 'off' });
    await settle(12);
    el.shadowRoot!.querySelector<HTMLElement>('[data-step="1"]')!.click();
    await settle(12);
    expect(
      calls.filter((call) => call.path === '/varshphal').map((call) => call.body.year),
    ).toEqual([2026, 2027]);
  });

  it('reads the return in the birth’s zone, with seconds', () => {
    expect(wallWithSeconds('2026-05-14T10:33:33.967Z', { name: 'Asia/Kolkata' })).toBe(
      '2026-05-14T16:03:33',
    );
    expect(wallWithSeconds('2026-05-14T10:33:33.967Z', { utc_offset: '+05:30' })).toBe(
      '2026-05-14T16:03:33',
    );
  });
});
