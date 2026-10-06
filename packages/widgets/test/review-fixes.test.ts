/**
 * The owner's review of stage 3: tables that fit their card, the varshphal's
 * age, the WordPress wording of the no-proxy note, and the manglik line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/core/cache.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import tablesCss from '../src/styles/tables.css';
import { KjEphemeris } from '../src/elements/ephemeris.ts';
import { KjKp } from '../src/elements/kp.ts';
import { KjManglik } from '../src/elements/manglik.ts';
import { KjSadeSati } from '../src/elements/sade-sati.ts';
import { KjStrength } from '../src/elements/strength.ts';
import { KjVarshphal } from '../src/elements/varshphal.ts';
import { houseOrdinal } from '../src/core/reports.ts';
import { BIRTH_ATTRS, mount, settle, stubFetch, text } from './support.ts';

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', baseUrl: 'https://api-staging.kaaljyoti.com', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('tables that fit their card', () => {
  it('the stylesheet stacks each table below its own card width, by container query', () => {
    for (const n of [24, 28, 36, 44, 50, 56]) {
      expect(tablesCss).toContain(`@container (max-width: ${n}em)`);
      expect(tablesCss).toContain(`table.kj-stack-${n}`);
    }
    expect(tablesCss).toContain('content: attr(data-label)');
  });

  it('labels every KP cell with its column, and keeps labelling after a repaint', async () => {
    stubFetch();
    const el = mount<KjKp>(KjKp, BIRTH_ATTRS);
    await settle(10);
    const root = el.shadowRoot!;
    const table = root.querySelector('table.kj-stack-44')!;
    expect(table).not.toBeNull();
    const cells = [...table.querySelectorAll('tbody tr:first-child > *')];
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Cusp',
      'Sign and degree',
      'Nakshatra',
      'Sign lord',
      'Star lord',
      'Sub lord',
      'Sub-sub lord',
    ]);

    [...root.querySelectorAll<HTMLElement>('[role=tab]')]
      .find((tab) => tab.textContent?.trim() === 'Planets')!
      .click();
    await settle(4);
    const planets = root.querySelector('table.kj-stack-50')!;
    expect(planets.querySelector('tbody td')?.getAttribute('data-label')).toBe('House');
  });

  it('stacks the shadbala and the sade sati tables; the ashtakavarga tightens, then scrolls with a cue', async () => {
    stubFetch();
    const strength = mount<KjStrength>(KjStrength, BIRTH_ATTRS);
    const sadeSati = mount<KjSadeSati>(KjSadeSati, BIRTH_ATTRS);
    await settle(10);
    expect(strength.shadowRoot!.querySelector('table.kj-stack-56[part="shadbala"]')).not.toBeNull();
    expect(strength.shadowRoot!.querySelector('table.kj-stack-36')).not.toBeNull();
    expect(sadeSati.shadowRoot!.querySelector('table.kj-stack-44[part="phases"]')).not.toBeNull();
    expect(
      sadeSati.shadowRoot!.querySelector('[part="phases"] tbody td')?.getAttribute('data-label'),
    ).toBe('Saturn in');

    [...strength.shadowRoot!.querySelectorAll<HTMLElement>('[role=tab]')].at(-1)!.click();
    await settle(6);
    const root = strength.shadowRoot!;
    expect(root.querySelector('.kj-table-wrap.kj-scroll table.kj-compact-44')).not.toBeNull();
    expect(text(root.querySelector('[part="scroll-hint"]'))).toContain('Scroll the table sideways');
  });

  it('the ephemeris keeps its grid and says it scrolls', async () => {
    stubFetch();
    configure({ proxyUrl: '/proxy' });
    const el = mount<KjEphemeris>(KjEphemeris, { city: 'delhi', month: '2026-10' });
    await settle(8);
    expect(el.shadowRoot!.querySelector('.kj-table-wrap.kj-scroll')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('.kj-hint-56')).not.toBeNull();
  });
});

describe('the varshphal year', () => {
  it('counts completed years: the 36th return begins the 37th year', async () => {
    stubFetch();
    const el = mount<KjVarshphal>(KjVarshphal, { ...BIRTH_ATTRS, year: '2026' });
    await settle(12);
    const tile = text(el.shadowRoot!.querySelector('[part~="tile-begins"]'));
    expect(tile).toContain('Age 36 · 37th year');
    expect(tile).not.toContain('Year 36');

    el.setAttribute('lang', 'hi');
    await settle(4);
    expect(text(el.shadowRoot!.querySelector('[part~="tile-begins"]'))).toContain(
      'आयु 36 · 37वाँ वर्ष',
    );
  });

  it('writes English ordinals', () => {
    expect(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 37, 101, 111, 112].map((n) => houseOrdinal(n, 'en')),
    ).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '37th',
      '101st',
      '111th',
      '112th',
    ]);
  });
});

describe('the manglik line', () => {
  it('says plainly that no other dosha was found', async () => {
    stubFetch({
      '/kundli/yogas': () =>
        new Response(
          JSON.stringify({
            status: 'ok',
            data: { yogas: [], doshas: [] },
            meta: {},
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    });
    const el = mount<KjManglik>(KjManglik, BIRTH_ATTRS);
    await settle(8);
    const none = el.shadowRoot!.querySelector('[part~="no-doshas"]');
    expect(text(none)).toBe('No other doshas found in this chart.');
    el.setAttribute('lang', 'hi');
    await settle(4);
    expect(text(el.shadowRoot!.querySelector('[part~="no-doshas"]'))).toBe(
      'इस कुंडली में कोई अन्य दोष नहीं मिला।',
    );
  });
});
