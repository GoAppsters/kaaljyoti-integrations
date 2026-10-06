/**
 * The client against the real staging gateway.
 *
 * Every other test here runs on recorded fixtures and a stubbed `fetch`,
 * which is right for CI and wrong for the one question a fixture cannot
 * answer: whether the gateway still speaks the shape the fixtures were
 * recorded in. This file asks staging directly, and only when told to:
 *
 *     KJ_SMOKE=1 KJ_API_KEY=kj_pub_… pnpm --filter @kaaljyoti/sdk smoke
 *
 * `KJ_BASE_URL` overrides the staging origin and `KJ_ORIGIN` the browser
 * origin a publishable key is checked against. Without `KJ_SMOKE=1` and a
 * key, every test below is skipped, so `pnpm test` never needs the network.
 *
 * Each run spends 44 credits of the staging quota: 1 each for the panchang,
 * the kundli, the chart and the place search, 5 each for the three readings,
 * the two personal reports and the horoscope, and 10 for a two-part kundli
 * report. Health, the reference tables and the timezone lookup are free, and
 * the refusal at the end is refunded.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { Kaaljyoti } from '../src/client.ts';
import { isKaaljyotiError, type KaaljyotiError } from '../src/errors.ts';

const apiKey = process.env.KJ_API_KEY;
const enabled = process.env.KJ_SMOKE === '1' && Boolean(apiKey);
const baseUrl = process.env.KJ_BASE_URL ?? 'https://api-staging.kaaljyoti.com';
const origin = process.env.KJ_ORIGIN ?? 'http://localhost:3000';
const publishable = apiKey?.startsWith('kj_pub_') ?? false;

const DELHI = { latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' };
const BIRTH = { datetime: '1990-05-14T10:30:00', ...DELHI, place: 'New Delhi' };

/**
 * A publishable key is only accepted from an origin it lists, and a browser
 * sets `Origin` itself. Node does not, so the header is added here — which is
 * possible at all only because this is Node; a page cannot forge it, which is
 * exactly why the gateway trusts it.
 */
function originFetch(): typeof fetch {
  return ((url: string | URL | Request, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Origin: origin },
    })) as typeof fetch;
}

describe.skipIf(!enabled)('staging smoke', () => {
  let kj: Kaaljyoti;

  beforeAll(() => {
    kj = new Kaaljyoti({
      apiKey: apiKey!,
      baseUrl,
      ...(publishable ? { fetch: originFetch() } : {}),
    });
  });

  it('is alive, and says which engine and ephemeris it is running', async () => {
    const { data, meta } = await kj.health();

    expect(data.status).toBe('ok');
    expect(data.engine).toMatch(/^\d+\.\d+\.\d+$/);
    expect(data.ephemeris).not.toBe('');
    expect(data.ops).toBeGreaterThan(0);
    // Health is answered bare, outside the envelope.
    expect(meta).toBeNull();
  });

  it('returns a reference table in both languages', async () => {
    const { data } = await kj.reference('signs', { language: ['en', 'hi'] });

    expect(data).toHaveLength(12);
    const first = data[0] as { id?: string; name?: string; names?: Record<string, string> };
    expect(first.id).toBe('aries');
    expect(first.names?.hi).toMatch(/[ऀ-ॿ]/);
  });

  it('lists what every route costs, for free', async () => {
    const answer = await kj.reference('credits');
    const rows = answer.data as { route?: string; credits?: number; per?: string }[];

    expect(rows.find((row) => row.route === '/v1/kundli')?.credits).toBeGreaterThan(0);
    expect(rows.find((row) => row.route === '/v1/match/batch')?.per).toBe('pair');
    expect(rows.find((row) => row.route === '/v1/reports/kundli')?.per).toBe('part');
    // A free route is not metered, so there is no cost header on it.
    expect(answer.credits).toBeNull();
  });

  // Runs on every key kind: the gateway drops a publishable key's `?key=`
  // before its strict query parse, so the lookup a browser makes is the same
  // lookup a server makes.
  it('derives the zone from a coordinate', async () => {
    const { data } = await kj.timezone({ lat: 28.6139, lon: 77.209, datetime: BIRTH.datetime });

    expect(data.name).toBe('Asia/Kolkata');
    expect(data.utc_offset).toBe('+05:30');
    expect(data.source).toBe('derived');
  });

  it('answers a panchang, with the meta that explains it', async () => {
    const answer = await kj.panchang.daily({ ...DELHI, options: { language: ['en', 'hi'] } });

    expect(answer.data.sunrise).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(answer.meta?.timezone.name).toBe('Asia/Kolkata');
    expect(answer.meta?.timezone.source).toBe('given');
    expect(answer.requestId).toBeTruthy();
    expect(answer.plan).toBeTruthy();
    expect(answer.rateLimit.limit).toBeGreaterThan(0);
    // The cost twice over: `meta.credits` and `X-KJ-Credits`.
    expect(answer.meta?.credits).toBeGreaterThan(0);
    expect(answer.credits).toBe(answer.meta?.credits);
    // The balance goes to secret keys only, never to a page's key.
    if (publishable) expect(answer.creditsRemaining).toBeNull();
    else expect(answer.creditsRemaining).toBeGreaterThanOrEqual(0);
  });

  it('answers a kundli with labelled ids', async () => {
    const { data, meta } = await kj.kundli.get({
      birth: BIRTH,
      options: { language: ['en', 'hi'] },
    });

    // The snapshot still types these as strings; see the README's known gap.
    const lagna = data.lagna_sign as unknown as { id: string; names: Record<string, string> };
    expect(lagna.id).toBe('cancer');
    expect(lagna.names.hi).toMatch(/[ऀ-ॿ]/);
    expect(meta?.engine).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('returns a chart as markup when the svg format is asked for', async () => {
    const { data, meta, credits } = await kj.kundli.chart(
      { birth: BIRTH, style: 'north', size: 300 },
      { format: 'svg' },
    );

    expect(typeof data).toBe('string');
    expect(data.startsWith('<svg')).toBe(true);
    expect(data).toContain('--kj-bg');
    expect(meta).toBeNull();
    expect(credits).toBeGreaterThan(0);
  });

  it('finds a place, with the zone a birth wants', async () => {
    const { data, meta } = await kj.places({ q: 'New Delhi', country: 'IN', limit: 3 });

    expect(meta?.credits).toBeGreaterThan(0);
    expect(data.places.length).toBeGreaterThan(0);
    expect(data.places[0]?.timezone).toBe('Asia/Kolkata');
  });

  it('reads a lagna and a nakshatra, with and without the disclaimer', async () => {
    const lagna = await kj.reports.lagna({
      sign: 'leo',
      options: { language: ['en', 'hi'] },
    });
    expect(lagna.data.lagna?.sign.id).toBe('leo');
    expect(Object.keys(lagna.data.lagna?.entry.text ?? {})).toEqual(['en', 'hi']);
    expect(lagna.data.disclaimer?.en).toContain('indicative');

    const nakshatra = await kj.reports.nakshatra({
      birth: BIRTH,
      options: { disclaimer: 'off' },
    });
    expect(nakshatra.data.nakshatra?.nakshatra.id).toBeTruthy();
    expect(nakshatra.data.disclaimer).toBeUndefined();
  });

  it('reads the twelve house lords of a birth', async () => {
    const { data } = await kj.reports.houseLords({
      birth: BIRTH,
      options: { language: ['en', 'hi'] },
    });

    expect(data.house_lords?.map((l) => l.house)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Object.keys(data.house_lords?.[0]?.entry.text ?? {})).toEqual(['en', 'hi']);
    expect(data.disclaimer?.en).toContain('indicative');
  });

  it('answers the personal reports: the dashas and the year', async () => {
    const { data: dashas } = await kj.reports.vimshottari({ birth: BIRTH });
    expect(dashas.periods.filter((period) => period.current)).toHaveLength(1);

    const { data: year } = await kj.reports.varshphal({ birth: BIRTH, year: 2026 });
    expect(year.year).toBe(2026);
    expect(year.areas).toHaveLength(7);
  }, 20_000);

  it('answers a kundli report of two parts, priced as two', async () => {
    const { data, meta } = await kj.reports.kundli({ birth: BIRTH, parts: ['lagna', 'yogas'] });
    expect(data.parts).toEqual(['lagna', 'yogas']);
    expect(data.yogas?.[0]?.name?.en).toBeTruthy();
    // Two parts at 5 credits each, unless the price list has been changed.
    expect(meta?.credits).toBe(10);
  }, 20_000);

  it('answers a daily horoscope as a summary and five areas', async () => {
    const { data } = await kj.horoscope({
      sign: 'aries',
      date: '2026-09-28',
      timezone: 'Asia/Kolkata',
    });

    expect(data.sign.id).toBe('aries');
    expect(data.from).toBe('2026-09-27T18:30:00.000Z');
    expect(['favourable', 'mixed', 'care']).toContain(data.summary.level);
    expect(data.areas.map((area) => area.area)).toEqual([
      'work',
      'money',
      'relationships',
      'health',
      'education',
    ]);
  });

  it('maps a refusal to a KaaljyotiError with a code and a link', async () => {
    const failure = await kj.panchang
      .daily({ ...DELHI, latitude: 999 })
      .catch((error: unknown) => error);

    expect(isKaaljyotiError(failure)).toBe(true);
    const error = failure as KaaljyotiError;
    expect(error.code).toBe('validation_error');
    expect(error.status).toBe(400);
    expect(error.field).toBeTruthy();
    expect(error.docs).toContain('#validation_error');
    // A refused request costs no credits, and the key is never in the message.
    expect(error.message).not.toContain(apiKey!);
  });
});
