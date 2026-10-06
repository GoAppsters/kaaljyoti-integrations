/**
 * The client against the document, operation by operation.
 *
 * `client.ts` is a list of paths written by hand, and a path written by hand
 * is a typo waiting to be shipped: `/v1/kundli/sade_sati` compiles, passes
 * every unit test that stubs `fetch`, and fails only against the real
 * gateway. So this file reads `openapi/openapi.json` and checks the two
 * things a type cannot:
 *
 *   1. **The table below covers the document exactly** — every operation
 *      once, and nothing that is not an operation. A new endpoint added to
 *      the API fails this test until a method exists for it, which is the
 *      whole point of committing the snapshot.
 *   2. **Each method sends what its name promises** — the right verb, the
 *      right path, no query parameters the document does not declare, and a
 *      body that survives the round trip through `JSON.stringify`.
 *
 * The table is deliberately hand-written rather than derived from the
 * document: a table generated from the same file it is checked against would
 * agree with itself no matter what `client.ts` does.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Kaaljyoti } from '../src/client.ts';

/** A `kj_test_…` key: secret, so it travels as Bearer and not in the URL. */
const TEST_KEY = 'kj_test_0123456789abcdef';

const BIRTH = {
  datetime: '1990-05-14T10:30:00',
  timezone: 'Asia/Kolkata',
  latitude: 28.6139,
  longitude: 77.209,
  place: 'New Delhi',
};

/** The body eighteen of the nineteen kundli endpoints take, unchanged. */
const BIRTH_BODY = { birth: BIRTH };

/** A place and a zone: what the endpoints with no birth need. */
const PLACE = { latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' };

const YEAR_BODY = { birth: BIRTH, year: 2026 };
const DASHA_BODY = { birth: BIRTH, system: 'vimshottari' as const };
const WINDOW_BODY = { birth: BIRTH, from: '2026-01-01T00:00:00Z', to: '2026-06-30T00:00:00Z' };
const MONTH_BODY = { ...PLACE, month: '2026-09' };
const EPHEMERIS_BODY = { ...PLACE, month: '2026-09', system: 'sidereal' as const };
const SAMVAT_BODY = { ...PLACE, datetime: '2026-09-22T06:00:00' };
const PAIR_BODY = { bride: BIRTH, groom: BIRTH };
const COMPARE_BODY = { birth: BIRTH, partner: BIRTH };
const BATCH_BODY = { pairs: [PAIR_BODY] };
const CHART_BODY = { birth: BIRTH, style: 'north' as const, size: 360 };
const LAGNA_BODY = { sign: 'leo' as const, options: { disclaimer: 'off' as const } };
const NAKSHATRA_BODY = {
  birth: BIRTH,
  options: { disclaimer: { name: 'Acharya Amit Verma', url: 'https://kaaljyoti.com' } },
};
const HOUSE_LORDS_BODY = { birth: BIRTH, options: { language: ['en' as const, 'hi' as const] } };
const PERSONAL_BODY = { birth: BIRTH, options: { disclaimer: 'off' as const } };
const VARSHPHAL_READING_BODY = { birth: BIRTH, year: 2026, options: { language: 'hi' as const } };
const KUNDLI_REPORT_BODY = { birth: BIRTH, parts: ['lagna' as const, 'yogas' as const] };
const PDF_KUNDLI_BODY = {
  birth: BIRTH,
  name: 'Ravi Kumar',
  edition: 'professional' as const,
  template: 'modern' as const,
  vargas: ['d1' as const, 'd9' as const],
  options: { language: ['en' as const, 'hi' as const], house_system: 'kp' as const },
};
const PDF_MATCH_BODY = { ...PAIR_BODY, name: 'Sita', partner_name: 'Ram' };
const PDF_VARSHPHAL_BODY = { ...YEAR_BODY, name: 'Ravi Kumar', chart_style: 'south' as const };
const PDF_MONTH_BODY = { ...MONTH_BODY, template: 'minimal' as const };
const HOROSCOPE_BODY = {
  sign: 'aries' as const,
  period: 'daily' as const,
  date: '2026-09-28',
  timezone: 'Asia/Kolkata',
};

/** One row: the operation, and the call that must produce it. */
interface Operation {
  method: 'GET' | 'POST';
  /** The templated path as `openapi.json` spells it. */
  path: string;
  /** The body the call sends, so the round trip can be compared exactly. */
  body?: unknown;
  call: (kj: Kaaljyoti) => Promise<unknown>;
}

const OPERATIONS: Operation[] = [
  // Service and reference — the three that cost no call, and the place search.
  { method: 'GET', path: '/v1/health', call: (kj) => kj.health() },
  {
    method: 'GET',
    path: '/v1/reference/{list}',
    call: (kj) => kj.reference('signs', { language: ['en', 'hi'] }),
  },
  {
    method: 'GET',
    path: '/v1/timezone',
    call: (kj) => kj.timezone({ lat: 28.6139, lon: 77.209, datetime: '1990-05-14T10:30:00' }),
  },
  {
    method: 'GET',
    path: '/v1/places',
    call: (kj) => kj.places({ q: 'Delhi', country: 'IN', limit: 5, language: ['en', 'hi'] }),
  },

  // Kundli
  { method: 'POST', path: '/v1/kundli', body: BIRTH_BODY, call: (kj) => kj.kundli.get(BIRTH_BODY) },
  {
    method: 'POST',
    path: '/v1/kundli/chart',
    body: CHART_BODY,
    call: (kj) => kj.kundli.chart(CHART_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/dasha',
    body: DASHA_BODY,
    call: (kj) => kj.kundli.dasha(DASHA_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/vargas',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.vargas(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/chalit',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.chalit(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/yogas',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.yogas(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/shadbala',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.shadbala(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/bhava-bala',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.bhavaBala(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/ashtakavarga',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.ashtakavarga(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/graha-drishti',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.grahaDrishti(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/maitri',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.maitri(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/pace',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.pace(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/special-lagnas',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.specialLagnas(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/tripataki',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.tripataki(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/sarvatobhadra',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.sarvatobhadra(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/nakshatra28',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.nakshatra28(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/sade-sati',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.sadeSati(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/events',
    body: WINDOW_BODY,
    call: (kj) => kj.kundli.events(WINDOW_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kundli/kota-chakra',
    body: BIRTH_BODY,
    call: (kj) => kj.kundli.kotaChakra(BIRTH_BODY),
  },

  // Panchang and calendar
  { method: 'POST', path: '/v1/panchang', body: PLACE, call: (kj) => kj.panchang.daily(PLACE) },
  {
    method: 'POST',
    path: '/v1/panchang/muhurta',
    body: BIRTH_BODY,
    call: (kj) => kj.panchang.muhurta(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/panchang/month',
    body: MONTH_BODY,
    call: (kj) => kj.panchang.month(MONTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/ephemeris/month',
    body: EPHEMERIS_BODY,
    call: (kj) => kj.ephemeris.month(EPHEMERIS_BODY),
  },
  {
    method: 'POST',
    path: '/v1/calendar/vikram-samvat',
    body: SAMVAT_BODY,
    call: (kj) => kj.calendar.vikramSamvat(SAMVAT_BODY),
  },

  // Jaimini and KP
  {
    method: 'POST',
    path: '/v1/jaimini/karakas',
    body: BIRTH_BODY,
    call: (kj) => kj.jaimini.karakas(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/jaimini/arudha-padas',
    body: BIRTH_BODY,
    call: (kj) => kj.jaimini.arudhaPadas(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/jaimini/aspects',
    body: BIRTH_BODY,
    call: (kj) => kj.jaimini.aspects(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/jaimini/karakamsha',
    body: BIRTH_BODY,
    call: (kj) => kj.jaimini.karakamsha(BIRTH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/kp/chart',
    body: BIRTH_BODY,
    call: (kj) => kj.kp.chart(BIRTH_BODY),
  },

  // Varshphal
  {
    method: 'POST',
    path: '/v1/varshphal',
    body: YEAR_BODY,
    call: (kj) => kj.varshphal.get(YEAR_BODY),
  },
  {
    method: 'POST',
    path: '/v1/varshphal/bala',
    body: YEAR_BODY,
    call: (kj) => kj.varshphal.bala(YEAR_BODY),
  },
  {
    method: 'POST',
    path: '/v1/varshphal/sahams',
    body: YEAR_BODY,
    call: (kj) => kj.varshphal.sahams(YEAR_BODY),
  },
  {
    method: 'POST',
    path: '/v1/varshphal/yogas',
    body: YEAR_BODY,
    call: (kj) => kj.varshphal.yogas(YEAR_BODY),
  },
  {
    method: 'POST',
    path: '/v1/varshphal/dasha',
    body: YEAR_BODY,
    call: (kj) => kj.varshphal.dasha(YEAR_BODY),
  },

  // Transit
  { method: 'POST', path: '/v1/transit/now', body: PLACE, call: (kj) => kj.transit.now(PLACE) },
  {
    method: 'POST',
    path: '/v1/transit/scan',
    body: WINDOW_BODY,
    call: (kj) => kj.transit.scan(WINDOW_BODY),
  },
  {
    method: 'POST',
    path: '/v1/transit/events',
    body: { year: 2026 },
    call: (kj) => kj.transit.events({ year: 2026 }),
  },

  // Match
  {
    method: 'POST',
    path: '/v1/match/ashtakoot',
    body: PAIR_BODY,
    call: (kj) => kj.match.ashtakoot(PAIR_BODY),
  },
  {
    method: 'POST',
    path: '/v1/match/compare',
    body: COMPARE_BODY,
    call: (kj) => kj.match.compare(COMPARE_BODY),
  },
  {
    method: 'POST',
    path: '/v1/match/batch',
    body: BATCH_BODY,
    call: (kj) => kj.match.batch(BATCH_BODY),
  },

  // Reports and horoscope
  {
    method: 'POST',
    path: '/v1/reports/lagna',
    body: LAGNA_BODY,
    call: (kj) => kj.reports.lagna(LAGNA_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/nakshatra',
    body: NAKSHATRA_BODY,
    call: (kj) => kj.reports.nakshatra(NAKSHATRA_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/house-lords',
    body: HOUSE_LORDS_BODY,
    call: (kj) => kj.reports.houseLords(HOUSE_LORDS_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/grahas',
    body: PERSONAL_BODY,
    call: (kj) => kj.reports.grahas(PERSONAL_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/yogas',
    body: PERSONAL_BODY,
    call: (kj) => kj.reports.yogas(PERSONAL_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/vimshottari',
    body: PERSONAL_BODY,
    call: (kj) => kj.reports.vimshottari(PERSONAL_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/varshphal',
    body: VARSHPHAL_READING_BODY,
    call: (kj) => kj.reports.varshphal(VARSHPHAL_READING_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/life-areas',
    body: PERSONAL_BODY,
    call: (kj) => kj.reports.lifeAreas(PERSONAL_BODY),
  },
  {
    method: 'POST',
    path: '/v1/reports/kundli',
    body: KUNDLI_REPORT_BODY,
    call: (kj) => kj.reports.kundli(KUNDLI_REPORT_BODY),
  },
  {
    method: 'POST',
    path: '/v1/horoscope',
    body: HOROSCOPE_BODY,
    call: (kj) => kj.horoscope(HOROSCOPE_BODY),
  },

  // PDFs — the bytes, not an envelope.
  {
    method: 'POST',
    path: '/v1/pdf/kundli',
    body: PDF_KUNDLI_BODY,
    call: (kj) => kj.pdf.kundli(PDF_KUNDLI_BODY),
  },
  {
    method: 'POST',
    path: '/v1/pdf/match',
    body: PDF_MATCH_BODY,
    call: (kj) => kj.pdf.match(PDF_MATCH_BODY),
  },
  {
    method: 'POST',
    path: '/v1/pdf/varshphal',
    body: PDF_VARSHPHAL_BODY,
    call: (kj) => kj.pdf.varshphal(PDF_VARSHPHAL_BODY),
  },
  {
    method: 'POST',
    path: '/v1/pdf/panchang/month',
    body: PDF_MONTH_BODY,
    call: (kj) => kj.pdf.panchangMonth(PDF_MONTH_BODY),
  },
];

/** The snapshot, read as data rather than imported as a type. */
interface Document {
  info: { version: string };
  paths: Record<
    string,
    Record<string, { parameters?: { name: string; in: string }[] } | undefined>
  >;
}

const document = JSON.parse(
  readFileSync(new URL('../../../openapi/openapi.json', import.meta.url), 'utf8'),
) as Document;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Every `METHOD path` the document declares. */
function documentOperations(): string[] {
  const found: string[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.includes(method)) found.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return found.sort();
}

/** Query parameter names the document declares for one operation. */
function declaredQuery(method: string, path: string): Set<string> {
  const operation = document.paths[path]?.[method.toLowerCase()];
  const names = (operation?.parameters ?? [])
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => parameter.name);
  return new Set(names);
}

/** `/v1/reference/{list}` matches `/v1/reference/signs`, and nothing else. */
function pathMatches(template: string, actual: string): boolean {
  const pattern = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{[^}]+\\\}/g, '[^/]+');
  return new RegExp(`^${pattern}$`).test(actual);
}

/** A `fetch` that answers everything the same way and records the request. */
function recorder() {
  const calls: { method: string; url: URL; body: string | null }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? 'GET',
      url: new URL(String(url)),
      body: typeof init.body === 'string' ? init.body : null,
    });
    // `status: 'ok'` with a `data` member is all the transport asks for, and
    // `/v1/health` is answered bare — both are satisfied by this one body.
    return new Response(JSON.stringify({ status: 'ok', data: {}, meta: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function client(apiKey: string, fetchImpl: typeof fetch): Kaaljyoti {
  return new Kaaljyoti({ apiKey, fetch: fetchImpl, maxRetries: 0 });
}

describe('the table covers openapi.json', () => {
  it('is the document version the README names', () => {
    expect(document.info.version).toBe('0.15.2');
  });

  it('has one entry per operation, and no entry without one', () => {
    const table = OPERATIONS.map((operation) => `${operation.method} ${operation.path}`).sort();
    expect(table).toEqual(documentOperations());
  });

  it('lists all 58 operations exactly once', () => {
    const table = OPERATIONS.map((operation) => `${operation.method} ${operation.path}`);
    expect(OPERATIONS).toHaveLength(58);
    expect(new Set(table).size).toBe(58);
  });

  it('reaches every namespace the design doc names', () => {
    const kj = client(TEST_KEY, recorder().fetch);
    for (const namespace of [
      kj.kundli,
      kj.panchang,
      kj.ephemeris,
      kj.calendar,
      kj.jaimini,
      kj.kp,
      kj.varshphal,
      kj.transit,
      kj.match,
      kj.reports,
      kj.pdf,
    ]) {
      expect(typeof namespace).toBe('object');
    }
    expect(Object.keys(kj.kundli)).toHaveLength(19);
  });
});

describe.each(OPERATIONS)('$method $path', (operation) => {
  it('sends the method and the path its name promises', async () => {
    const stub = recorder();
    await operation.call(client(TEST_KEY, stub.fetch));

    expect(stub.calls).toHaveLength(1);
    const call = stub.calls[0]!;
    expect(call.method).toBe(operation.method);
    expect(pathMatches(operation.path, call.url.pathname)).toBe(true);
    expect(call.url.origin).toBe('https://api.kaaljyoti.com');
  });

  it('adds no query parameter the document does not declare', async () => {
    const stub = recorder();
    await operation.call(client(TEST_KEY, stub.fetch));

    // A secret key is a Bearer header, so nothing at all should be in the
    // query but the parameters this operation declares — a stray `?key=` here
    // would mean a secret key had just been written into a URL.
    const declared = declaredQuery(operation.method, operation.path);
    const sent = [...stub.calls[0]!.url.searchParams.keys()];
    expect(sent.filter((name) => !declared.has(name))).toEqual([]);
    expect(sent).not.toContain('key');
  });

  it('puts a publishable key in the query and nothing else', async () => {
    const stub = recorder();
    await operation.call(client('kj_pub_0123456789abcdef', stub.fetch));

    const declared = declaredQuery(operation.method, operation.path);
    const sent = [...stub.calls[0]!.url.searchParams.keys()];
    expect(sent).toContain('key');
    expect(sent.filter((name) => name !== 'key' && !declared.has(name))).toEqual([]);
  });

  it('round-trips the body as JSON, or sends none on a GET', async () => {
    const stub = recorder();
    await operation.call(client(TEST_KEY, stub.fetch));
    const call = stub.calls[0]!;

    if (operation.method === 'GET') {
      expect(call.body).toBeNull();
      return;
    }
    expect(call.body).not.toBeNull();
    expect(JSON.parse(call.body!)).toEqual(operation.body);
  });
});
