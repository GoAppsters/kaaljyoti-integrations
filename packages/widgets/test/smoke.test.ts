/**
 * The live smoke test: the client against the real staging gateway.
 *
 * Everything else in `test/` runs against recorded fixtures and a stubbed
 * `fetch`, which is right for CI and wrong for the one question fixtures
 * cannot answer — whether the gateway still speaks the shape the fixtures
 * were recorded in. This file asks staging directly, and only when told to:
 *
 *     KJ_SMOKE=1 KJ_PUB_KEY=kj_pub_… pnpm --filter @kaaljyoti/widgets smoke
 *
 * Without both variables every test here is skipped, so `pnpm test` never
 * needs the network. A browser sends `Origin` on its own; Node does not, so
 * the test sets it to the origin the staging key lists (the examples server
 * on port 3000). Each run spends about 43 credits of the staging quota: 1 for
 * each calculation and 5 for each reading.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configure, resetConfig } from '../src/core/config.ts';
import { request, setFetch } from '../src/core/client.ts';
import { KjError } from '../src/core/errors.ts';
import { clearCache } from '../src/core/cache.ts';

const key = process.env.KJ_PUB_KEY;
const enabled = process.env.KJ_SMOKE === '1' && Boolean(key);
const baseUrl = process.env.KJ_BASE_URL ?? 'https://api-staging.kaaljyoti.com';
const origin = process.env.KJ_ORIGIN ?? 'http://localhost:3000';

const DELHI = { latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' };
const BIRTH = { datetime: '1990-05-14T10:30:00', ...DELHI };

describe.skipIf(!enabled)('staging smoke', () => {
  beforeAll(() => {
    configure({ key, baseUrl });
    // Node's fetch will send any header it is given; a browser would refuse
    // to let a page set `Origin`, which is exactly why the gateway trusts it.
    setFetch((url, init) =>
      fetch(url, {
        ...init,
        headers: { ...(init?.headers as Record<string, string>), Origin: origin },
      }),
    );
  });

  afterEach(() => clearCache());

  it('answers a panchang in both languages', async () => {
    const answer = await request<{
      panchang: {
        nakshatra: { names: { hi: string } };
        tithi_name: { id: string; names: { hi: string } };
      };
      rahu_kalam: { start: string; end: string } | null;
      sunrise: string | null;
    }>('/panchang', { ...DELHI, options: { language: ['en', 'hi'] } });
    expect(answer.data.panchang.tithi_name.id).toMatch(/^[A-Z]/);
    expect(answer.data.panchang.tithi_name.names.hi).toMatch(/[ऀ-ॿ]/);
    expect(answer.data.panchang.nakshatra.names.hi).toMatch(/[ऀ-ॿ]/);
    expect(answer.data.sunrise).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(answer.data.rahu_kalam).not.toBeNull();
    expect(answer.plan).toBeTruthy();
    expect(answer.requestId).toBeTruthy();
    // Every metered JSON answer says what it cost.
    expect((answer.meta as { credits?: number }).credits).toBeGreaterThan(0);
  });

  it('is told the cost of a request, and never the account’s balance', async () => {
    const response = await fetch(`${baseUrl}/v1/panchang?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(DELHI),
    });
    expect(response.status).toBe(200);
    expect(Number(response.headers.get('X-KJ-Credits'))).toBeGreaterThan(0);
    expect(response.headers.get('X-KJ-Calls')).toBeNull();
    // A publishable key sits in a page: the balance is not sent to it.
    expect(response.headers.get('X-KJ-Credits-Remaining')).toBeNull();
  });

  it('returns a chart as SVG when asked for one', async () => {
    const answer = await request<string>(
      '/kundli/chart',
      { birth: BIRTH, style: 'north', size: 300, options: { language: 'en' } },
      { accept: 'image/svg+xml' },
    );
    expect(answer.data.startsWith('<svg')).toBe(true);
    expect(answer.data).toContain('--kj-bg');
  });

  it('returns a kundli with named ids', async () => {
    const answer = await request<{ lagna_sign: { id: string; name: string } }>('/kundli', {
      birth: BIRTH,
      options: { language: ['en', 'hi'] },
    });
    expect(answer.data.lagna_sign.id).toBe('cancer');
  });

  it('answers a horoscope as a summary and five areas, keyed by language', async () => {
    const answer = await request<{
      sign: { id: string };
      summary: { level: string; text: { hi: string } };
      areas: { area: string; level: string }[];
      disclaimer: { en: string };
    }>('/horoscope', { sign: 'aries', options: { language: ['en', 'hi'] } });
    expect(answer.data.sign.id).toBe('aries');
    expect(['favourable', 'mixed', 'care']).toContain(answer.data.summary.level);
    expect(answer.data.summary.text.hi).toMatch(/[ऀ-ॿ]/);
    expect(answer.data.areas.map((area) => area.area)).toEqual([
      'work',
      'money',
      'relationships',
      'health',
      'education',
    ]);
    expect(answer.data.disclaimer.en).toMatch(/indicative/);
  });

  it('answers the personal reports, on every plan', async () => {
    const body = { birth: BIRTH, options: { language: ['en', 'hi'] } };
    const grahas = await request<{ grahas: unknown[] }>('/reports/grahas', body);
    expect(grahas.data.grahas).toHaveLength(9);
    const dashas = await request<{ periods: { current: boolean }[] }>('/reports/vimshottari', body);
    expect(dashas.data.periods.filter((period) => period.current)).toHaveLength(1);
    const year = await request<{ areas: unknown[] }>('/reports/varshphal', { ...body, year: 2026 });
    expect(year.data.areas).toHaveLength(7);
    const kundli = await request<{ parts: string[]; yogas: { name: { en: string } }[] }>(
      '/reports/kundli',
      { ...body, parts: ['yogas'] },
    );
    expect(kundli.data.parts).toEqual(['yogas']);
    expect(kundli.data.yogas[0]?.name.en).toMatch(/Yoga|Dosha|Parivartana|Yogakaraka/);
    // Three calls in a row: more than the default five seconds on a slow line.
  }, 20_000);

  it('reads a picked lagna and nakshatra', async () => {
    const lagna = await request<{
      lagna: { sign: { id: string }; entry: { text: { en: string } } };
    }>('/reports/lagna', { sign: 'leo', options: { language: 'en', disclaimer: 'off' } });
    expect(lagna.data.lagna.sign.id).toBe('leo');
    expect(lagna.data.lagna.entry.text.en).toMatch(/Leo/);

    const nakshatra = await request<{ nakshatra: { nakshatra: { id: string } } }>(
      '/reports/nakshatra',
      { birth: BIRTH, options: { language: ['en', 'hi'] } },
    );
    expect(nakshatra.data.nakshatra.nakshatra.id).toBeTruthy();
  });

  it('answers what the kundli report and the muhurta draw from', async () => {
    const options = { language: ['en', 'hi'] };
    const dasha = await request<{
      systems: { vimshottari: { chain: { level: number }[]; periods: { children: unknown[] }[] } };
    }>('/kundli/dasha', { birth: BIRTH, system: 'vimshottari', levels: 2, options });
    expect(dasha.data.systems.vimshottari.periods).toHaveLength(9);
    expect(dasha.data.systems.vimshottari.chain[0]?.level).toBe(1);

    const pace = await request<{ entries: { position: { dignity: string } }[] }>('/kundli/pace', {
      birth: BIRTH,
      options,
    });
    expect(pace.data.entries.length).toBeGreaterThan(0);
    expect(typeof pace.data.entries[0]?.position.dignity).toBe('string');

    const vargas = await request<{ placements: { d9: Record<string, string[]> } }>(
      '/kundli/vargas',
      { birth: BIRTH, vargas: ['d1', 'd9'], options },
    );
    expect(Object.keys(vargas.data.placements.d9)).toHaveLength(12);

    const chalit = await request<{ sripati: { madhya: number[]; sign_of_house: string[] } }>(
      '/kundli/chalit',
      { birth: BIRTH, system: 'sripati', options },
    );
    expect(chalit.data.sripati.madhya).toHaveLength(12);

    const muhurta = await request<{
      choghadiya: { day: { good: boolean }[]; night: unknown[] };
      next_sunrise: string;
    }>('/panchang/muhurta', { ...DELHI, options });
    expect(muhurta.data.choghadiya.day).toHaveLength(8);
    expect(muhurta.data.next_sunrise).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 30_000);

  it('maps a refusal to a KjError with the code and the field', async () => {
    const failure = await request('/panchang', { ...DELHI, options: { language: 'xx' } }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(KjError);
    const error = failure as KjError;
    expect(error.code).toBe('validation_error');
    expect(error.status).toBe(400);
    expect(error.field).toBe('options.language');
    expect(error.docs).toContain('#validation_error');
  });

  afterEach(() => {
    if (!enabled) resetConfig();
  });
});
