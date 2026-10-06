import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import baseCss from '../src/styles/base.css';
import matchCss from '../src/styles/match.css';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { KjMatchForm } from '../src/elements/match-form.ts';
import ashtakootFixture from './fixtures/ashtakoot.json';
import kundliFixture from './fixtures/kundli-0142.json';

if (!customElements.get(KjMatchForm.tag)) {
  customElements.define(KjMatchForm.tag, KjMatchForm);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** `/v1/match/ashtakoot` answers `match`; `/v1/kundli` the people's kundli. */
function stubFetch(match: unknown = ashtakootFixture, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/v1/match') ? json(match, status) : json(kundliFixture),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The fixture with some fields replaced, for the branches it does not reach. */
function variant(patch: Record<string, unknown>): unknown {
  const fixture = ashtakootFixture as { data: Record<string, unknown> };
  return { ...fixture, data: { ...fixture.data, ...patch } };
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function mount(attrs: Record<string, string> = {}): KjMatchForm {
  const element = document.createElement(KjMatchForm.tag) as KjMatchForm;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

type Side = 'bride' | 'groom';

function field(element: KjMatchForm, side: Side, name: string) {
  const node = element.shadowRoot?.querySelector(`[data-side="${side}"] [data-field="${name}"]`);
  if (!node) throw new Error(`no ${side} field ${name}`);
  return node as HTMLInputElement | HTMLSelectElement;
}

function fill(element: KjMatchForm, side: Side, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    const input = field(element, side, name);
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

const MUMBAI = { lat: '19.076', lon: '72.8777', tz: 'Asia/Kolkata', label: 'Mumbai' };
const DELHI = { lat: '28.6139', lon: '77.209', tz: 'Asia/Kolkata', label: 'New Delhi' };

/** Both sides filled. */
function fillBoth(element: KjMatchForm): void {
  fill(element, 'bride', {
    name: 'Asha',
    day: '20',
    month: '8',
    year: '1992',
    hour: '6',
    minute: '15',
    ampm: 'am',
    ...MUMBAI,
  });
  fill(element, 'groom', {
    name: 'Ravi',
    day: '14',
    month: '5',
    year: '1990',
    hour: '10',
    minute: '30',
    ampm: 'am',
    ...DELHI,
  });
}

/** @see kundli-form.test.ts — happy-dom does not submit on a button click. */
function submit(element: KjMatchForm): void {
  const form = element.shadowRoot?.querySelector('form');
  form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

function matchBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/v1/match'));
  return JSON.parse((call as [string, RequestInit])[1].body as string) as Record<string, unknown>;
}

const calls = (fetchMock: ReturnType<typeof vi.fn>, path: string) =>
  fetchMock.mock.calls.filter((c) => new URL(String(c[0])).pathname === `/v1${path}`).length;

function part(element: KjMatchForm, name: string): string {
  return element.shadowRoot?.querySelector(`[part~="${name}"]`)?.textContent ?? '';
}

let listeners: Array<[string, EventListener]> = [];

function listen(type: string): unknown[] {
  const seen: unknown[] = [];
  const listener = (event: Event) => seen.push((event as CustomEvent).detail);
  document.addEventListener(type, listener);
  listeners.push([type, listener]);
  return seen;
}

beforeEach(() => {
  resetConfig();
  clearCache();
  localStorage.clear();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  for (const [type, listener] of listeners) document.removeEventListener(type, listener);
  listeners = [];
  document.body.innerHTML = '';
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('test stylesheet', () => {
  it('imports base.css as its text, so elements run with the real rules', () => {
    expect(typeof baseCss).toBe('string');
    expect(baseCss).toContain(':host');
    expect(matchCss).toContain('.kj-pair');
  });
});

describe('<kj-match-form> markup', () => {
  it('renders two fieldsets of birth fields and makes no request', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    const sides = element.shadowRoot?.querySelectorAll('fieldset[data-side]') ?? [];
    expect([...sides].map((side) => side.querySelector('legend')?.textContent)).toEqual([
      'Bride',
      'Groom',
    ]);
    // Ids are unique across the two sets, so each label points at its own field.
    expect(field(element, 'bride', 'day').id).toBe('kj-bride-day');
    expect(field(element, 'groom', 'day').id).toBe('kj-groom-day');
    expect(element.shadowRoot?.querySelector('[part="title"]')?.textContent).toBe('Kundli milan');
  });

  it('renders the chrome in Hindi', async () => {
    stubFetch();
    const element = mount({ lang: 'hi' });
    await settle();
    const text = element.shadowRoot?.textContent ?? '';
    expect(text).toContain('वधू');
    expect(text).toContain('वर');
    expect(text).toContain('मिलान देखें');
  });

  it('fills the place of both sides from city="…"', async () => {
    stubFetch();
    const element = mount({ city: 'mumbai' });
    await settle();
    expect(field(element, 'bride', 'q').value).toBe('Mumbai');
    expect(field(element, 'groom', 'lat').value).toBe('19.076');
  });
});

describe('<kj-match-form> submit', () => {
  it('says what is missing on the side that lacks it and sends nothing', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    fill(element, 'bride', {
      day: '20',
      month: '8',
      year: '1992',
      hour: '6',
      minute: '15',
      ampm: 'am',
      ...MUMBAI,
    });
    submit(element);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    const shown = (side: Side) =>
      [
        ...(element.shadowRoot?.querySelectorAll(
          `[data-side="${side}"] [data-error]:not([hidden])`,
        ) ?? []),
      ].map((node) => node.getAttribute('data-error'));
    expect(shown('bride')).toEqual([]);
    expect(shown('groom')).toEqual(['date', 'time', 'place']);
  });

  it('posts both births, fires kj-submit once, and asks each person’s kundli alongside', async () => {
    const fetchMock = stubFetch();
    const submits = listen('kj-submit');
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();

    expect(submits).toHaveLength(1);
    expect(matchBody(fetchMock)).toEqual({
      bride: {
        datetime: '1992-08-20T06:15:00',
        latitude: 19.076,
        longitude: 72.8777,
        timezone: 'Asia/Kolkata',
        place: 'Mumbai',
      },
      groom: {
        datetime: '1990-05-14T10:30:00',
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 'Asia/Kolkata',
        place: 'New Delhi',
      },
      options: { language: ['en', 'hi'] },
    });
    expect(calls(fetchMock, '/match/ashtakoot')).toBe(1);
    expect(calls(fetchMock, '/kundli')).toBe(2);
  });

  it('folds both forms into a summary after a submit; "Edit details" opens them', async () => {
    stubFetch();
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();
    const root = element.shadowRoot!;
    expect(root.querySelector('form')?.hasAttribute('hidden')).toBe(true);
    const lines = [...root.querySelectorAll('[part~="birth-summary"]')].map((line) =>
      (line.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('20 Aug 1992, 06:15 · Mumbai');
    expect(lines[1]).toContain('14 May 1990, 10:30 · New Delhi');
    root.querySelector<HTMLElement>('[data-action="edit"]')!.click();
    expect(root.querySelector('form')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.kj-result')).not.toBeNull();
  });

  it('draws the ring, the verdict, the people, eight kootas with meanings and the doshas', async () => {
    stubFetch();
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();

    const gauge = element.shadowRoot?.querySelector('[role="meter"]');
    expect(gauge?.getAttribute('aria-valuenow')).toBe('19');
    expect(gauge?.getAttribute('aria-valuemax')).toBe('36');
    expect(part(element, 'total')).toBe('19');
    expect(part(element, 'verdict')).toBe('Average');
    expect(part(element, 'names')).toBe('Asha · Ravi');
    expect(element.shadowRoot?.querySelectorAll('[part~="koota"]')).toHaveLength(8);
    const yoni = part(element, 'koota-yoni').replace(/\s+/g, ' ');
    expect(yoni).toContain('0 / 4');
    expect(yoni).toContain('Physical compatibility');
    expect(yoni).toContain('(Sheep · Monkey)');
    const people = element.shadowRoot?.querySelectorAll('[part~="tile"]') ?? [];
    expect(people).toHaveLength(2);
    expect(people[0]?.textContent).toContain('Asha');
    expect(people[0]?.textContent).toContain('Sagittarius');
    expect(people[0]?.textContent).toContain('Purva Ashadha');
    expect(part(element, 'mangal-bride')).toContain('Manglik');
    expect(element.shadowRoot?.querySelector('[part="mangal-warning"]')).toBeNull();
  });

  it('switches to Hindi without asking again', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();
    const before = fetchMock.mock.calls.length;
    element.setAttribute('lang', 'hi');
    await settle();
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(part(element, 'verdict')).toBe('मध्यम');
    expect(part(element, 'koota-nadi')).toContain('नाड़ी');
    // The fields kept what was typed.
    expect(field(element, 'bride', 'name').value).toBe('Asha');
  });

  it('memoises an identical resubmit', async () => {
    const fetchMock = stubFetch();
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();
    submit(element);
    await settle();
    expect(calls(fetchMock, '/match/ashtakoot')).toBe(1);
  });

  it('warns on a mangal mismatch and colours a low score bad', async () => {
    stubFetch(variant({ total: 12, mangal_dosha_mismatch: true, bride_mangal_dosha: false }));
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();
    expect(part(element, 'mangal-warning')).toContain('Only one of the two');
    expect(element.shadowRoot?.querySelector('[role="meter"]')?.classList.contains('kj-bad')).toBe(
      true,
    );
    expect(part(element, 'mangal-bride')).toContain('Not manglik');
  });

  it('passes an unknown verdict through and escapes the note', async () => {
    const fixture = ashtakootFixture as { data: { kootas: object[] } };
    const kootas = structuredClone(fixture.data.kootas) as { note: string | null }[];
    kootas[0]!.note = '<img src=x onerror=alert(1)>';
    stubFetch(variant({ verdict: 'auspicious', kootas }));
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();
    expect(part(element, 'verdict')).toBe('auspicious');
    expect(element.shadowRoot?.innerHTML).not.toContain('<img');
  });

  it('keeps the form and shows the monthly-limit state when the credits run out', async () => {
    stubFetch(
      {
        status: 'error',
        error: {
          code: 'quota_exceeded',
          message:
            'you have used all 1,000 credits for this month (1,000 included in the Free plan)',
        },
      },
      402,
    );
    const errors = listen('kj-error');
    const element = mount();
    await settle();
    fillBoth(element);
    submit(element);
    await settle();
    expect(element.shadowRoot?.querySelector('form')).toBeTruthy();
    const state = element.shadowRoot?.querySelector('[data-code="quota_exceeded"]');
    expect(state?.textContent).toContain('Monthly limit reached');
    expect(state?.querySelector('[part="plan-owner"]')?.textContent).toContain('add credits');
    expect(state?.querySelector('[part="plan-owner"] a')).not.toBeNull();
    expect(errors).toHaveLength(1);
  });

  it('remembers each side separately', async () => {
    stubFetch();
    const first = mount();
    await settle();
    fillBoth(first);
    submit(first);
    await settle();
    first.remove();

    const next = mount();
    await settle();
    expect(field(next, 'bride', 'name').value).toBe('Asha');
    expect(field(next, 'groom', 'name').value).toBe('Ravi');
    expect(field(next, 'groom', 'year').value).toBe('1990');
    expect(Object.keys(localStorage).sort()).toEqual([
      'kj:birth:v2:match-bride',
      'kj:birth:v2:match-groom',
    ]);
  });
});

describe('<kj-match-form> theme', () => {
  it('keeps the theme the page wrote and asks for nothing when it changes', async () => {
    const fetchMock = stubFetch();
    configure({ theme: 'light' });
    const element = mount({ theme: 'dark' });
    await settle();
    expect(element.getAttribute('theme')).toBe('dark');

    element.setAttribute('theme', 'light');
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.shadowRoot?.querySelector('form')).toBeTruthy();
  });

  it('takes the configured theme when it has none', async () => {
    stubFetch();
    configure({ theme: 'dark' });
    expect(mount().getAttribute('theme')).toBe('dark');
  });
});
