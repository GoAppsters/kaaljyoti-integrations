/**
 * The client against recorded answers.
 *
 * `contract.test.ts` proves every method goes to the right place; this file
 * proves the answer comes back in the shape the README promises — the
 * envelope flattened by one level, `meta` beside `data`, an SVG as a string,
 * a batch's per-pair failures as values rather than as a thrown error, and a
 * refusal as a `KaaljyotiError` with a code on it.
 *
 * Everything here is a fixture the gateway really sent (`test/fixtures/`),
 * apart from the batch envelope, which is crafted because a batch with one
 * good pair and one bad one is exactly the case no recording happened to
 * contain.
 */

import { describe, expect, it, vi } from 'vitest';
import { createClient, Kaaljyoti } from '../src/client.ts';
import { isKaaljyotiError, KaaljyotiError } from '../src/errors.ts';
import chartFixture from './fixtures/chart.json';
import errorFixture from './fixtures/error.json';
import horoscopeFixture from './fixtures/horoscope.json';
import kundliFixture from './fixtures/kundli.json';
import houseLordsFixture from './fixtures/reading-house-lords.json';
import lagnaFixture from './fixtures/reading-lagna.json';
import nakshatraFixture from './fixtures/reading-nakshatra.json';
import grahasFixture from './fixtures/reading-grahas.json';
import yogasFixture from './fixtures/reading-yogas.json';
import vimshottariFixture from './fixtures/reading-vimshottari.json';
import varshphalFixture from './fixtures/reading-varshphal.json';
import lifeAreasFixture from './fixtures/reading-life-areas.json';
import kundliReportFixture from './fixtures/reading-kundli.json';

const TEST_KEY = 'kj_test_0123456789abcdef';

const BIRTH = {
  datetime: '1990-05-14T10:30:00',
  timezone: 'Asia/Kolkata',
  latitude: 28.6139,
  longitude: 77.209,
  place: 'New Delhi',
};

/** The gateway's `/v1/health`: bare, with no envelope around it. */
const HEALTH = {
  status: 'ok',
  engine: '0.14.2',
  ephemeris: 'kaaljyoti-ephemeris 0.1.1',
  ops: 42,
  uptime_s: 98_214,
};

/**
 * A batch of two pairs, the second of which could not be computed.
 *
 * Design decision 6 in one object: the first pair was calculated and charged,
 * so the second pair's failure is a value in `results`, not something thrown
 * over the top of an answer the caller has already paid for.
 */
const BATCH = {
  status: 'ok',
  data: {
    results: [
      { index: 0, data: { total: 28, maximum: 36 } },
      {
        index: 1,
        error: {
          code: 'not_computable',
          message: 'no moonrise at this latitude on this day',
          field: 'pairs.1.groom',
        },
      },
    ],
  },
  meta: {
    cached: false,
    ayanamsa: { id: 'lahiri' },
    engine: '0.2.0',
    compute_ms: 41,
    credits: 2,
    language_fallback: [],
  },
};

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

/** A `fetch` that answers from a queue and records what it was asked. */
function stubFetch(...answers: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;
    if (answer === undefined) throw new Error('stub fetch ran out of answers');
    return answer.clone();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function clientWith(...answers: Response[]) {
  const stub = stubFetch(...answers);
  return { kj: new Kaaljyoti({ apiKey: TEST_KEY, fetch: stub.fetch, maxRetries: 0 }), stub };
}

describe('kundli.get', () => {
  it('returns the data and the meta from one answer', async () => {
    const { kj } = clientWith(json(kundliFixture));
    const { data, meta, requestId, cached } = await kj.kundli.get({ birth: BIRTH });

    // The snapshot types `lagna_sign` as a string while the gateway labels it
    // (see the README's "Known gap"), so the assertion reads it as the answer
    // really is rather than as the type claims.
    const labelled = data.lagna_sign as unknown as { id: string; name: string };
    expect(labelled.id).toBe('cancer');
    expect(labelled.name).toBe('Cancer');

    expect(meta?.timezone.source).toBe('given');
    expect(meta?.timezone.name).toBe('Asia/Kolkata');
    expect(meta?.engine).toBe('0.2.0');
    expect(cached).toBe(false);
    expect(requestId).toBeNull();
  });

  it('reads the request id, plan and rate limit off the headers', async () => {
    const { kj } = clientWith(
      json(kundliFixture, {
        headers: {
          'X-KJ-Request-Id': '97f48252-8b54-4a7e-9e81-eb06d5a3ce02',
          'X-KJ-Plan': 'growth',
          'X-KJ-Credits': '1',
          'X-KJ-Credits-Remaining': '199412',
          'X-RateLimit-Limit': '120',
          'X-RateLimit-Remaining': '118',
          'X-RateLimit-Reset': '1789504694',
        },
      }),
    );
    const answer = await kj.kundli.get({ birth: BIRTH });

    expect(answer.requestId).toBe('97f48252-8b54-4a7e-9e81-eb06d5a3ce02');
    expect(answer.plan).toBe('growth');
    expect(answer.credits).toBe(1);
    expect(answer.creditsRemaining).toBe(199_412);
    expect(answer.meta?.credits).toBe(1);
    expect(answer.rateLimit).toEqual({ limit: 120, remaining: 118, reset: 1_789_504_694 });
  });

  it('has no credits left to report on a publishable key', async () => {
    // The gateway never sends `X-KJ-Credits-Remaining` to a `kj_pub_…` key.
    const stub = stubFetch(json(kundliFixture, { headers: { 'X-KJ-Credits': '1' } }));
    const kj = new Kaaljyoti({ apiKey: 'kj_pub_test', fetch: stub.fetch, maxRetries: 0 });
    const answer = await kj.kundli.get({ birth: BIRTH });

    expect(answer.credits).toBe(1);
    expect(answer.creditsRemaining).toBeNull();
  });
});

describe('kundli.chart', () => {
  it('returns the chart document by default', async () => {
    const { kj, stub } = clientWith(json(chartFixture));
    const answer = await kj.kundli.chart({ birth: BIRTH, style: 'north', size: 360 });

    expect(answer.data.style).toBe('north');
    expect(answer.data.svg.startsWith('<svg')).toBe(true);
    expect(answer.meta).not.toBeNull();
    const headers = stub.calls[0]!.init.headers as Record<string, string>;
    expect(headers['Accept']).toBe('application/json');
  });

  it('sends first_house and reads back what the chart was drawn as', async () => {
    const { kj, stub } = clientWith(json(chartFixture));
    const answer = await kj.kundli.chart({ birth: BIRTH, first_house: 'lagna' });

    expect(JSON.parse(String(stub.calls[0]!.init.body)).first_house).toBe('lagna');
    expect(answer.data.first_house).toBe('lagna');
    expect(answer.data.first_house_sign.id).toBe('cancer');
    expect(answer.data.title).toBe('Lagna chart');
  });

  it('returns the markup itself, and no meta, when asked for svg', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360"></svg>';
    const { kj, stub } = clientWith(
      new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }),
    );
    const answer = await kj.kundli.chart({ birth: BIRTH }, { format: 'svg' });

    // The overload is the point: `answer.data` is a `string` here and a
    // `ChartDocument` above, and neither needs a cast at the call site.
    expect(answer.data.startsWith('<svg')).toBe(true);
    expect(answer.meta).toBeNull();
    const headers = stub.calls[0]!.init.headers as Record<string, string>;
    expect(headers['Accept']).toBe('image/svg+xml');
  });

  it('asks for JSON when the format says so explicitly', async () => {
    const { kj, stub } = clientWith(json(chartFixture));
    const answer = await kj.kundli.chart({ birth: BIRTH }, { format: 'json' });

    expect(answer.data.size).toBe(360);
    const headers = stub.calls[0]!.init.headers as Record<string, string>;
    expect(headers['Accept']).toBe('application/json');
  });
});

describe('reference', () => {
  it('joins an array of languages with commas', async () => {
    const { kj, stub } = clientWith(json({ status: 'ok', data: [], meta: { language: ['en'] } }));
    await kj.reference('signs', { language: ['en', 'hi'] });

    const url = new URL(stub.calls[0]!.url);
    expect(url.pathname).toBe('/v1/reference/signs');
    expect(url.searchParams.get('language')).toBe('en,hi');
  });

  it('passes a single language through unchanged', async () => {
    const { kj, stub } = clientWith(json({ status: 'ok', data: [], meta: {} }));
    await kj.reference('nakshatras', { language: 'hi' });

    expect(new URL(stub.calls[0]!.url).searchParams.get('language')).toBe('hi');
  });

  it('sends no language parameter when none was asked for', async () => {
    const { kj, stub } = clientWith(json({ status: 'ok', data: [], meta: {} }));
    const answer = await kj.reference('dasha-systems');

    expect(new URL(stub.calls[0]!.url).search).toBe('');
    expect(answer.data).toEqual([]);
  });
});

describe('timezone', () => {
  it('encodes the coordinates and the instant as query parameters', async () => {
    const { kj, stub } = clientWith(
      json({
        status: 'ok',
        data: { name: 'Asia/Kolkata', utc_offset: '+05:30', source: 'derived' },
        meta: { datetime: '1990-05-14T10:30:00' },
      }),
    );
    const answer = await kj.timezone({
      lat: 28.6139,
      lon: 77.209,
      datetime: '1990-05-14T10:30:00',
    });

    const url = new URL(stub.calls[0]!.url);
    expect(url.pathname).toBe('/v1/timezone');
    expect(url.searchParams.get('lat')).toBe('28.6139');
    expect(url.searchParams.get('lon')).toBe('77.209');
    expect(url.searchParams.get('datetime')).toBe('1990-05-14T10:30:00');
    expect(answer.data.name).toBe('Asia/Kolkata');
  });

  it('leaves the instant out when none was given', async () => {
    const { kj, stub } = clientWith(
      json({ status: 'ok', data: { name: 'UTC', utc_offset: '+00:00', source: 'derived' } }),
    );
    await kj.timezone({ lat: 0, lon: 0 });

    const url = new URL(stub.calls[0]!.url);
    expect(url.searchParams.has('datetime')).toBe(false);
    expect(url.searchParams.get('lat')).toBe('0');
  });
});

describe('places', () => {
  it('sends the search as query parameters, languages joined with commas', async () => {
    const { kj, stub } = clientWith(
      json({
        status: 'ok',
        data: {
          places: [
            {
              id: 1261481,
              name: 'New Delhi',
              region: 'Delhi',
              country: 'IN',
              country_name: 'India',
              latitude: 28.63576,
              longitude: 77.22445,
              timezone: 'Asia/Kolkata',
              population: 317797,
            },
          ],
        },
        meta: { query: 'new delhi', language: ['en'], count: 1 },
      }),
    );
    const answer = await kj.places({ q: 'new delhi', country: 'IN', limit: 5, language: ['en'] });

    const url = new URL(stub.calls[0]!.url);
    expect(url.pathname).toBe('/v1/places');
    expect(url.searchParams.get('q')).toBe('new delhi');
    expect(url.searchParams.get('country')).toBe('IN');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('language')).toBe('en');
    expect(stub.calls[0]!.init.body).toBeUndefined();
    expect(answer.data.places[0]?.timezone).toBe('Asia/Kolkata');
    expect(answer.meta?.count).toBe(1);
  });

  it('sends only the query when nothing else was asked for', async () => {
    const { kj, stub } = clientWith(json({ status: 'ok', data: { places: [] }, meta: {} }));
    await kj.places({ q: 'Ujjain' });

    expect(new URL(stub.calls[0]!.url).search).toBe('?q=Ujjain');
  });
});

describe('reports', () => {
  it('lagna posts the body and returns the reading with its disclaimer', async () => {
    const { kj, stub } = clientWith(json(lagnaFixture));
    const body = { sign: 'leo' as const, options: { language: ['en' as const, 'hi' as const] } };
    const { data, meta } = await kj.reports.lagna(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/lagna');
    expect(stub.calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(stub.calls[0]!.init.body as string)).toEqual(body);

    expect(data.lagna?.sign.id).toBe('leo');
    expect(data.lagna?.sign.names?.['hi']).toBe('सिंह');
    // Keyed by language, in the order asked for.
    expect(Object.keys(data.lagna?.entry.text ?? {})).toEqual(['en', 'hi']);
    expect(data.lagna?.entry.text.en).toContain('Leo rising');
    expect(data.disclaimer?.en).toBe(
      'These predictions are indicative. For a reading of your own chart, consult an astrologer.',
    );
    expect(meta?.engine).toBe('0.3.0');
  });

  it('nakshatra names the astrologer given in options.disclaimer', async () => {
    const { kj, stub } = clientWith(json(nakshatraFixture));
    const body = {
      nakshatra: 'purva_phalguni' as const,
      options: { disclaimer: { name: 'Acharya Amit Verma', url: 'https://kaaljyoti.com' } },
    };
    const { data } = await kj.reports.nakshatra(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/nakshatra');
    expect(JSON.parse(stub.calls[0]!.init.body as string)).toEqual(body);

    expect(data.nakshatra?.nakshatra.id).toBe('purva_phalguni');
    expect(data.nakshatra?.nakshatra.name).toBe('Purva Phalguni');
    expect(Object.keys(data.nakshatra?.entry.text ?? {})).toEqual(['en']);
    expect(data.disclaimer?.en).toBe(
      'These predictions are indicative. For a reading of your own chart, consult Acharya Amit Verma (https://kaaljyoti.com).',
    );
  });
});

describe('reports.houseLords', () => {
  it('posts the birth and returns the twelve houses in order, each with its lord', async () => {
    const { kj, stub } = clientWith(json(houseLordsFixture));
    const body = {
      birth: {
        datetime: '1987-03-18T12:06:00',
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 'Asia/Kolkata',
      },
      options: { language: ['en' as const, 'hi' as const] },
    };
    const { data, meta } = await kj.reports.houseLords(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/house-lords');
    expect(stub.calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(stub.calls[0]!.init.body as string)).toEqual(body);

    const lords = data.house_lords ?? [];
    expect(lords.map((l) => l.house)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // Gemini rising: Mercury rules the 1st and sits in the 9th.
    const first = lords[0];
    expect(first?.sign.id).toBe('gemini');
    expect(first?.lord.id).toBe('mercury');
    expect(first?.lord.names?.['hi']).toBe('बुध');
    expect(first?.in_house).toBe(9);
    for (const lord of lords) expect(Object.keys(lord.entry.text)).toEqual(['en', 'hi']);
    expect(data.disclaimer?.hi).toContain('सांकेतिक');
    expect(meta?.engine).toBe('0.5.0');
  });

  it('keeps working when destructured off the namespace', async () => {
    const { kj } = clientWith(json(houseLordsFixture));
    const { houseLords } = kj.reports;

    const { data } = await houseLords({
      birth: { datetime: '1987-03-18T12:06:00', latitude: 28.6139, longitude: 77.209 },
    });
    expect(data.house_lords).toHaveLength(12);
  });
});

describe('the personal reports', () => {
  const body = { birth: BIRTH, options: { language: ['en' as const, 'hi' as const] } };

  it('grahas: nine, Sun to Ketu, each with its sign, house and two readings', async () => {
    const { kj, stub } = clientWith(json(grahasFixture));
    const { data, meta } = await kj.reports.grahas(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/grahas');
    expect(JSON.parse(stub.calls[0]!.init.body as string)).toEqual(body);
    const grahas = data.grahas ?? [];
    expect(grahas.map((g) => g.graha.id)).toEqual([
      'sun',
      'moon',
      'mars',
      'mercury',
      'jupiter',
      'venus',
      'saturn',
      'rahu',
      'ketu',
    ]);
    expect(grahas[0]?.sign.id).toBe('aries');
    expect(grahas[0]?.house).toBe(10);
    expect(grahas[0]?.in_sign.text.en).toMatch(/^Your Sun is in Aries/);
    expect(grahas[0]?.in_house.text.hi).toMatch(/[ऀ-ॿ]/);
    expect(meta?.engine).toBe('0.10.1');
  });

  it('yogas: each by code and category, with the grahas in it', async () => {
    const { kj, stub } = clientWith(json(yogasFixture));
    const { data } = await kj.reports.yogas(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/yogas');
    const first = data.yogas?.[0];
    expect(first?.code).toBe('gaja_kesari');
    expect(first?.category).toBe('Chandra');
    expect(first?.participants.map((p) => p.id)).toEqual(['jupiter', 'moon']);
    expect(first?.name?.en).toBe('Gaja-Kesari Yoga');
    expect(first?.name?.hi).toBe('गजकेसरी योग');
    expect(first?.entry.text.en).toContain('Gaja-Kesari');
  });

  it('kundli: the parts asked for, each as its own route answers it', async () => {
    const { kj, stub } = clientWith(json(kundliReportFixture));
    const request = {
      ...body,
      parts: ['lagna' as const, 'yogas' as const, 'vimshottari' as const, 'varshphal' as const],
    };
    const { data, meta } = await kj.reports.kundli(request);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/kundli');
    expect(JSON.parse(stub.calls[0]!.init.body as string)).toEqual(request);
    expect(data.parts).toEqual(['lagna', 'yogas', 'vimshottari', 'varshphal']);
    expect(data.lagna?.sign.id).toBe('cancer');
    expect(data.yogas?.[0]?.name?.en).toBe('Gaja-Kesari Yoga');
    expect(data.vimshottari?.periods.filter((p) => p.current)).toHaveLength(1);
    // No year was sent: the API reads the one running now.
    expect(data.varshphal?.year).toBe(2026);
    expect(data.disclaimer?.en).toContain('indicative');
    // Four parts at 5 credits each.
    expect(meta?.credits).toBe(20);
  });

  it('vimshottari: every mahadasha with its level, one of them current', async () => {
    const { kj, stub } = clientWith(json(vimshottariFixture));
    const { data } = await kj.reports.vimshottari(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/vimshottari');
    expect(data.periods.map((p) => p.lord.id)).toEqual([
      'venus',
      'sun',
      'moon',
      'mars',
      'rahu',
      'jupiter',
      'saturn',
    ]);
    const current = data.periods.filter((p) => p.current);
    expect(current.map((p) => [p.lord.id, p.level])).toEqual([['mars', 'mixed']]);
    expect(data.periods[0]?.antardashas.length).toBeGreaterThan(0);
    expect(Object.keys(data.periods[0]?.text ?? {})).toEqual(['en', 'hi']);
  });

  it('varshphal: the year, a summary, seven areas and its periods', async () => {
    const { kj, stub } = clientWith(json(varshphalFixture));
    const { data } = await kj.reports.varshphal({ ...body, year: 2026 });

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/varshphal');
    expect(JSON.parse(stub.calls[0]!.init.body as string).year).toBe(2026);
    expect(data.year).toBe(2026);
    expect(data.summary.level).toBe('mixed');
    expect(data.areas.map((a) => a.area)).toEqual([
      'work',
      'money',
      'relationships',
      'health',
      'education',
      'home',
      'travel',
    ]);
    expect(data.months).toHaveLength(10);
    expect(data.months[0]?.lord.id).toBe('venus');
  });

  it('life areas: a summary naming the strongest and weakest, and eleven areas', async () => {
    const { kj, stub } = clientWith(json(lifeAreasFixture));
    const { data } = await kj.reports.lifeAreas(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/reports/life-areas');
    expect(data.summary.strongest).toEqual(['foreign', 'marriage']);
    expect(data.summary.needs_care).toEqual(['children', 'fortune']);
    expect(data.areas).toHaveLength(11);
    expect(data.areas[0]?.area).toBe('self');
    expect(data.areas[0]?.level).toBe('favourable');
  });

  it('a month with no credits left gets a KaaljyotiError quota_exceeded', async () => {
    const refusal = {
      status: 'error',
      error: {
        code: 'quota_exceeded',
        message: 'you have used all 1,000 credits for this month (1,000 included in the Free plan)',
        docs: 'https://kaaljyoti.com/api/docs/errors#quota_exceeded',
      },
    };
    const { kj } = clientWith(json(refusal, { status: 402 }));
    const failure = await kj.reports.lifeAreas(body).catch((error: unknown) => error);

    expect(isKaaljyotiError(failure)).toBe(true);
    expect((failure as KaaljyotiError).code).toBe('quota_exceeded');
    expect((failure as KaaljyotiError).status).toBe(402);
  });

  it('keeps working when destructured off the namespace', async () => {
    const { kj } = clientWith(json(grahasFixture));
    const { grahas } = kj.reports;
    expect((await grahas(body)).data.grahas).toHaveLength(9);
  });
});

describe('horoscope', () => {
  it('posts the sign and period and returns a summary and five areas', async () => {
    const { kj, stub } = clientWith(json(horoscopeFixture));
    const body = {
      sign: 'aries' as const,
      period: 'daily' as const,
      date: '2026-09-28',
      timezone: 'Asia/Kolkata',
      options: { language: ['en' as const, 'hi' as const] },
    };
    const { data, meta } = await kj.horoscope(body);

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/horoscope');
    expect(stub.calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(stub.calls[0]!.init.body as string)).toEqual(body);

    expect(data.sign.id).toBe('aries');
    expect(data.from).toBe('2026-09-27T18:30:00.000Z');
    expect(data.to).toBe('2026-09-28T18:30:00.000Z');
    expect(data.summary.level).toBe('care');
    expect(Object.keys(data.summary.text)).toEqual(['en', 'hi']);
    expect(data.areas.map((area) => [area.area, area.level])).toEqual([
      ['work', 'mixed'],
      ['money', 'care'],
      ['relationships', 'care'],
      ['health', 'mixed'],
      ['education', 'care'],
    ]);

    // The transits behind it: the Moon changes sign inside the day, so it
    // comes back twice, meeting at the same instant.
    const moons = data.basis.filter((transit) => transit.graha.id === 'moon');
    expect(moons.map((m) => [m.sign.id, m.house, m.nature])).toEqual([
      ['pisces', 12, 'unfavourable'],
      ['aries', 1, 'favourable'],
    ]);
    expect(moons[1]?.entered).toBe(moons[0]?.leaves);
    expect(data.basis.find((t) => t.graha.id === 'saturn')?.retrograde).toBe(true);

    expect(data.disclaimer?.en).toBe(
      'These predictions are indicative. For a reading of your own chart, consult an astrologer.',
    );
    expect(meta?.timezone.name).toBe('Asia/Kolkata');
  });

  it('keeps working when destructured off the client', async () => {
    const { kj } = clientWith(json(horoscopeFixture));
    const { horoscope } = kj;

    expect((await horoscope({ sign: 'aries' })).data.sign.id).toBe('aries');
  });
});

describe('health', () => {
  it('returns the bare document, with no meta around it', async () => {
    const { kj, stub } = clientWith(json(HEALTH));
    const answer = await kj.health();

    expect(answer.data.engine).toBe('0.14.2');
    expect(answer.data.ephemeris).toBe('kaaljyoti-ephemeris 0.1.1');
    expect(answer.data.ops).toBe(42);
    expect(answer.meta).toBeNull();
    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/health');
  });
});

describe('match.batch', () => {
  it('keeps a pair that failed as a value, not as a thrown error', async () => {
    const { kj } = clientWith(json(BATCH));
    const answer = await kj.match.batch({ pairs: [{ bride: BIRTH, groom: BIRTH }] });

    expect(answer.data.results).toHaveLength(2);
    expect(answer.data.results[0]?.data).toBeDefined();
    expect(answer.data.results[0]?.error).toBeUndefined();

    const failed = answer.data.results[1];
    expect(failed?.error?.code).toBe('not_computable');
    expect(failed?.error?.field).toBe('pairs.1.groom');
    expect(failed?.data).toBeUndefined();

    // `meta` is a `BatchMeta`: no single timezone, and the credits the
    // request actually cost, one per pair.
    expect(answer.meta?.credits).toBe(2);
  });
});

describe('pdf', () => {
  /** The first bytes of every PDF, and enough of one to prove nothing re-encodes it. */
  const PDF_BYTES = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0xe2, 0xe3, 0xcf, 0xd3,
  ]);

  function pdf(headers: Record<string, string> = {}) {
    return new Response(PDF_BYTES, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="kundli-ravi-kumar.pdf"',
        'X-KJ-Credits': '1000',
        'X-KJ-Credits-Remaining': '49000',
        'X-KJ-Cache': 'miss',
        'X-KJ-Request-Id': '97f48252-8b54-4a7e-9e81-eb06d5a3ce02',
        ...headers,
      },
    });
  }

  it('returns the bytes untouched, with the file name and the cost', async () => {
    const { kj, stub } = clientWith(pdf());
    const answer = await kj.pdf.kundli({ birth: BIRTH, name: 'Ravi Kumar', edition: 'basic' });

    expect(answer.data.bytes).toBeInstanceOf(Uint8Array);
    expect([...answer.data.bytes]).toEqual([...PDF_BYTES]);
    expect(answer.data.contentType).toBe('application/pdf');
    expect(answer.data.filename).toBe('kundli-ravi-kumar.pdf');
    expect(answer.data.credits).toBe(1000);
    expect(answer.credits).toBe(1000);
    expect(answer.creditsRemaining).toBe(49_000);
    expect(answer.meta).toBeNull();
    expect(answer.cached).toBe(false);
    expect(answer.requestId).toBe('97f48252-8b54-4a7e-9e81-eb06d5a3ce02');

    const call = stub.calls[0]!;
    expect(call.url).toBe('https://api.kaaljyoti.com/v1/pdf/kundli');
    expect((call.init.headers as Record<string, string>)['Accept']).toBe('application/pdf');
  });

  it('reports a cache hit from the header, the only place it can be', async () => {
    const { kj } = clientWith(pdf({ 'X-KJ-Cache': 'hit' }));
    const answer = await kj.pdf.match({ bride: BIRTH, groom: BIRTH, name: 'Sita' });
    expect(answer.cached).toBe(true);
  });

  it('answers null for the headers a proxy stripped', async () => {
    const { kj } = clientWith(
      new Response(PDF_BYTES, { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    );
    const answer = await kj.pdf.varshphal({ birth: BIRTH, year: 2026 });
    expect(answer.data.filename).toBeNull();
    expect(answer.data.credits).toBeNull();
    expect(answer.credits).toBeNull();
    expect(answer.creditsRemaining).toBeNull();
  });

  it('throws the JSON error a refused PDF answers with', async () => {
    const { kj } = clientWith(
      json(
        {
          status: 'error',
          error: {
            code: 'pdf_quota_exceeded',
            message: "This month's PDFs are used up.",
            docs: 'https://kaaljyoti.com/api/docs/errors#pdf_quota_exceeded',
          },
        },
        { status: 402 },
      ),
    );
    const failure = await kj.pdf
      .panchangMonth({ latitude: 25.3176, longitude: 82.9739, month: '2026-10' })
      .catch((error: unknown) => error);

    expect(isKaaljyotiError(failure)).toBe(true);
    expect((failure as KaaljyotiError).code).toBe('pdf_quota_exceeded');
    expect((failure as KaaljyotiError).status).toBe(402);
  });
});

describe('failures', () => {
  it('throws a KaaljyotiError with the code, status and field', async () => {
    const { kj } = clientWith(json(errorFixture, { status: 400 }));
    const failure = await kj.kundli.get({ birth: BIRTH }).catch((error: unknown) => error);

    expect(isKaaljyotiError(failure)).toBe(true);
    const error = failure as KaaljyotiError;
    expect(error.code).toBe('validation_error');
    expect(error.status).toBe(400);
    expect(error.field).toBe('options.language');
    expect(error.docs).toContain('#validation_error');
  });

  it('throws from a namespace method just as it does from a bare one', async () => {
    const { kj } = clientWith(json(errorFixture, { status: 400 }));
    await expect(kj.panchang.daily({ latitude: 0, longitude: 0 })).rejects.toBeInstanceOf(
      KaaljyotiError,
    );
  });

  it('refuses before the network when no key was configured', async () => {
    const kj = new Kaaljyoti({ apiKey: '', fetch: stubFetch(json(kundliFixture)).fetch });
    const failure = await kj.kundli.get({ birth: BIRTH }).catch((error: unknown) => error);

    expect((failure as KaaljyotiError).code).toBe('invalid_key');
  });
});

describe('cancellation', () => {
  it('gives fetch a signal that follows the caller’s own', async () => {
    const controller = new AbortController();
    const seen: { isSignal: boolean; before: boolean; after: boolean } = {
      isSignal: false,
      before: true,
      after: false,
    };
    // The check happens inside the call, because the transport stops
    // listening to the caller's signal the moment the answer arrives — an
    // abort after that is no longer anybody's business.
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init: RequestInit = {}) => {
      seen.isSignal = init.signal instanceof AbortSignal;
      seen.before = init.signal?.aborted ?? true;
      controller.abort();
      seen.after = init.signal?.aborted ?? false;
      return json(kundliFixture);
    }) as unknown as typeof fetch;

    const kj = new Kaaljyoti({ apiKey: TEST_KEY, fetch: fetchImpl });
    await kj.kundli.get({ birth: BIRTH }, { signal: controller.signal });

    // Not the caller's signal object — the transport combines it with the
    // per-attempt deadline — but one that aborts when the caller's does.
    expect(seen).toEqual({ isSignal: true, before: false, after: true });
  });

  it('rejects with the caller’s reason when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init: RequestInit = {}) => {
      if (init.signal?.aborted) throw init.signal.reason;
      return json(kundliFixture);
    }) as unknown as typeof fetch;

    const kj = new Kaaljyoti({ apiKey: TEST_KEY, fetch: fetchImpl, maxRetries: 0 });
    await expect(
      kj.kundli.get({ birth: BIRTH }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('the shape of the client', () => {
  it('keeps working when a namespace is destructured off it', async () => {
    const { kj } = clientWith(json(kundliFixture));
    const { kundli } = kj;
    const answer = await kundli.get({ birth: BIRTH });

    expect(answer.data).toBeDefined();
  });

  it('keeps working when a bare method is destructured off it', async () => {
    const { kj } = clientWith(json(HEALTH));
    const { health } = kj;

    expect((await health()).data.status).toBe('ok');
  });

  it('builds the same client through createClient as through new', async () => {
    const stub = stubFetch(json(kundliFixture));
    const kj = createClient({ apiKey: TEST_KEY, fetch: stub.fetch });

    expect(kj).toBeInstanceOf(Kaaljyoti);
    await kj.kundli.get({ birth: BIRTH });
    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/kundli');
  });

  it('sends the client tag and the key the way the transport decided', async () => {
    const { kj, stub } = clientWith(json(kundliFixture));
    await kj.jaimini.karakas({ birth: BIRTH });

    const headers = stub.calls[0]!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TEST_KEY}`);
    expect(headers['X-KJ-Client']).toMatch(/^sdk-ts\/\d+\.\d+\.\d+$/);
    expect(stub.calls[0]!.url).not.toContain(TEST_KEY);
  });
});
