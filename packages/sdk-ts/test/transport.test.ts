/**
 * The transport is the only place that touches the network, so it is the only
 * place a mistake about keys, headers or retries can be made — and every one
 * of those mistakes is invisible in normal use. A key in the wrong place
 * works until it leaks; a retry on a `400` works until the bill arrives.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { createTransport, filenameOf, normaliseBaseUrl, VERSION } from '../src/transport.ts';
import { isKaaljyotiError, isRetryable, KaaljyotiError } from '../src/errors.ts';
import errorFixture from './fixtures/error.json';
import kundliFixture from './fixtures/kundli.json';

const LIVE_KEY = 'kj_live_0123456789abcdef';
const PUB_KEY = 'kj_pub_0123456789abcdef';
const TEST_KEY = 'kj_test_0123456789abcdef';

/** One recorded answer, with the headers the gateway would have set. */
function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

/** A `fetch` that answers from a queue and records what it was asked. */
function stubFetch(...answers: (Response | (() => Response | Promise<Response>))[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;
    if (answer === undefined) throw new Error('stub fetch ran out of answers');
    return typeof answer === 'function' ? await answer() : answer.clone();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('key placement', () => {
  it('sends a live key as Bearer and never in the URL', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    await transport.post('/v1/kundli', { birth: {} });

    const call = stub.calls[0]!;
    expect(call.url).toBe('https://api.kaaljyoti.com/v1/kundli');
    expect(call.url).not.toContain(LIVE_KEY);
    expect(headersOf(call.init)['Authorization']).toBe(`Bearer ${LIVE_KEY}`);
  });

  it('sends a test key as Bearer too', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({ apiKey: TEST_KEY, fetch: stub.fetch });
    await transport.post('/v1/kundli', {});

    expect(headersOf(stub.calls[0]!.init)['Authorization']).toBe(`Bearer ${TEST_KEY}`);
    expect(stub.calls[0]!.url).not.toContain(TEST_KEY);
  });

  it('sends a publishable key as ?key= and never as Authorization', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({ apiKey: PUB_KEY, fetch: stub.fetch });
    await transport.post('/v1/panchang', {});

    const call = stub.calls[0]!;
    expect(call.url).toBe(`https://api.kaaljyoti.com/v1/panchang?key=${PUB_KEY}`);
    expect(headersOf(call.init)['Authorization']).toBeUndefined();
  });

  it('keeps the key out of the query on a GET with a key already in it', async () => {
    const stub = stubFetch(json({ status: 'ok', data: [], meta: {} }));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    await transport.get('/v1/reference/planets', { language: 'hi' });

    const call = stub.calls[0]!;
    expect(call.url).toBe('https://api.kaaljyoti.com/v1/reference/planets?language=hi');
    expect(headersOf(call.init)['Authorization']).toBe(`Bearer ${LIVE_KEY}`);
  });

  it('refuses an empty key before the network', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({ apiKey: '', fetch: stub.fetch });

    expect(() => transport.post('/v1/kundli', {})).toThrow(KaaljyotiError);
    try {
      transport.post('/v1/kundli', {});
    } catch (error) {
      expect(isKaaljyotiError(error) && error.code).toBe('invalid_key');
    }
    expect(stub.fetch).not.toHaveBeenCalled();
  });
});

describe('headers and query', () => {
  it('sends X-KJ-Client, Accept and Content-Type by default', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    await transport.post('/v1/kundli', {});

    const headers = headersOf(stub.calls[0]!.init);
    expect(headers['X-KJ-Client']).toBe(`sdk-ts/${VERSION}`);
    expect(headers['Accept']).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('lets a shell claim the usage with its own client tag', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({
      apiKey: LIVE_KEY,
      fetch: stub.fetch,
      client: 'wordpress/1.0.0',
    });
    await transport.post('/v1/kundli', {});

    expect(headersOf(stub.calls[0]!.init)['X-KJ-Client']).toBe('wordpress/1.0.0');
  });

  it('adds the caller headers but lets none of them displace the key', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({
      apiKey: LIVE_KEY,
      fetch: stub.fetch,
      headers: { 'X-Trace': 'abc', Authorization: 'Bearer nope', 'X-KJ-Client': 'nope/9' },
    });
    await transport.post('/v1/kundli', {});

    const headers = headersOf(stub.calls[0]!.init);
    expect(headers['X-Trace']).toBe('abc');
    expect(headers['Authorization']).toBe(`Bearer ${LIVE_KEY}`);
    expect(headers['X-KJ-Client']).toBe(`sdk-ts/${VERSION}`);
  });

  it('omits Content-Type on a GET, which would only buy a preflight', async () => {
    const stub = stubFetch(json({ status: 'ok', data: [], meta: {} }));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    await transport.get('/v1/reference/signs');

    expect(headersOf(stub.calls[0]!.init)['Content-Type']).toBeUndefined();
  });

  it('leaves undefined query parameters out entirely', async () => {
    const stub = stubFetch(json({ status: 'ok', data: {}, meta: {} }));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    await transport.get('/v1/timezone', { lat: 28.6139, lon: 77.209, datetime: undefined });

    expect(stub.calls[0]!.url).toBe('https://api.kaaljyoti.com/v1/timezone?lat=28.6139&lon=77.209');
  });
});

describe('baseUrl', () => {
  it.each([
    ['https://api.kaaljyoti.com', 'https://api.kaaljyoti.com'],
    ['https://api.kaaljyoti.com/', 'https://api.kaaljyoti.com'],
    ['https://api.kaaljyoti.com///', 'https://api.kaaljyoti.com'],
    ['https://api.kaaljyoti.com/v1', 'https://api.kaaljyoti.com'],
    ['https://api.kaaljyoti.com/v1/', 'https://api.kaaljyoti.com'],
    ['  https://api-staging.kaaljyoti.com/v1/  ', 'https://api-staging.kaaljyoti.com'],
    ['http://localhost:8787', 'http://localhost:8787'],
    [undefined, 'https://api.kaaljyoti.com'],
    ['', 'https://api.kaaljyoti.com'],
  ])('normalises %s', (input, expected) => {
    expect(normaliseBaseUrl(input)).toBe(expected);
  });

  it('builds the request URL from the normalised base', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({
      apiKey: LIVE_KEY,
      baseUrl: 'https://api-staging.kaaljyoti.com/v1/',
      fetch: stub.fetch,
    });
    await transport.post('/v1/kundli', {});

    expect(stub.calls[0]!.url).toBe('https://api-staging.kaaljyoti.com/v1/kundli');
  });
});

describe('the envelope', () => {
  it('returns data, meta and the header facts', async () => {
    const stub = stubFetch(
      json(kundliFixture, {
        headers: {
          'X-KJ-Request-Id': '97f48252-8b54-4a7e-9e81-eb06d5a3ce02',
          'X-KJ-Plan': 'growth',
          'X-KJ-Cache': 'miss',
          'X-KJ-Credits': '1',
          'X-KJ-Credits-Remaining': '199412',
          'X-RateLimit-Limit': '120',
          'X-RateLimit-Remaining': '118',
          'X-RateLimit-Reset': '1789504694',
        },
      }),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    const result = await transport.post<{ ascendant: number }>('/v1/kundli', {});

    expect(result.data.ascendant).toBeCloseTo(99.0467, 3);
    expect(result.meta?.engine).toBe('0.2.0');
    expect(result.meta?.timezone.utc_offset).toBe('+05:30');
    expect(result.requestId).toBe('97f48252-8b54-4a7e-9e81-eb06d5a3ce02');
    expect(result.plan).toBe('growth');
    expect(result.cached).toBe(false);
    expect(result.credits).toBe(1);
    expect(result.creditsRemaining).toBe(199412);
    expect(result.rateLimit).toEqual({ limit: 120, remaining: 118, reset: 1789504694 });
  });

  it('leaves the credits null when the headers are absent or junk', async () => {
    // A free route sends neither; a publishable key never gets the second.
    const free = createTransport({
      apiKey: LIVE_KEY,
      fetch: stubFetch(json({ status: 'ok', data: [], meta: {} })).fetch,
    });
    expect(await free.get('/v1/reference/credits')).toMatchObject({
      credits: null,
      creditsRemaining: null,
    });

    const publishable = createTransport({
      apiKey: 'kj_pub_test',
      fetch: stubFetch(
        json(kundliFixture, { headers: { 'X-KJ-Credits': '1', 'X-KJ-Credits-Remaining': 'n/a' } }),
      ).fetch,
    });
    expect(await publishable.post('/v1/kundli', {})).toMatchObject({
      credits: 1,
      creditsRemaining: null,
    });
  });

  it('reports a cache hit from either meta or the header', async () => {
    const fromMeta = createTransport({
      apiKey: LIVE_KEY,
      fetch: stubFetch(json({ status: 'ok', data: {}, meta: { cached: true } })).fetch,
    });
    expect((await fromMeta.post('/v1/kundli', {})).cached).toBe(true);

    const fromHeader = createTransport({
      apiKey: LIVE_KEY,
      fetch: stubFetch(
        json({ status: 'ok', data: {}, meta: {} }, { headers: { 'X-KJ-Cache': 'hit' } }),
      ).fetch,
    });
    expect((await fromHeader.post('/v1/kundli', {})).cached).toBe(true);
  });

  it('leaves the rate limit null when the headers are absent or junk', async () => {
    const stub = stubFetch(json(kundliFixture, { headers: { 'X-RateLimit-Limit': 'lots' } }));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    const result = await transport.post('/v1/kundli', {});

    expect(result.rateLimit).toEqual({ limit: null, remaining: null, reset: null });
  });

  it('is a bad_response when the body is JSON but not an envelope', async () => {
    const stub = stubFetch(json({ hello: 'world' }));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    await expect(transport.post('/v1/kundli', {})).rejects.toMatchObject({
      code: 'bad_response',
    });
  });

  it('is a bad_response when the body is not JSON at all', async () => {
    const stub = stubFetch(
      new Response('<html>502 Bad Gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html', 'X-KJ-Request-Id': 'req-1' },
      }),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    await expect(transport.post('/v1/kundli', {})).rejects.toMatchObject({
      code: 'bad_response',
      requestId: 'req-1',
    });
  });
});

describe('errors', () => {
  it('turns the error envelope into a KaaljyotiError with the headers folded in', async () => {
    const stub = stubFetch(
      json(errorFixture, {
        status: 400,
        headers: { 'X-KJ-Request-Id': 'req-42' },
      }),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const thrown = await transport.post('/v1/kundli', {}).catch((error: unknown) => error);
    expect(isKaaljyotiError(thrown)).toBe(true);
    const error = thrown as KaaljyotiError;
    expect(error.code).toBe('validation_error');
    expect(error.message).toBe('Invalid input');
    expect(error.status).toBe(400);
    expect(error.field).toBe('options.language');
    expect(error.docs).toBe('https://kaaljyoti.com/api/docs/errors#validation_error');
    expect(error.requestId).toBe('req-42');
    expect(error.retryAfter).toBeUndefined();
    expect(isRetryable(error)).toBe(false);
    expect(stub.fetch).toHaveBeenCalledTimes(1);
  });

  it('never retries a 402, 403 or 422', async () => {
    for (const [status, code] of [
      [402, 'quota_exceeded'],
      [403, 'plan_required'],
      [422, 'not_computable'],
    ] as const) {
      const stub = stubFetch(
        json({ status: 'error', error: { code, message: 'no', docs: 'd' } }, { status }),
      );
      const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
      await expect(transport.post('/v1/kundli', {})).rejects.toMatchObject({ code });
      expect(stub.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('exposes retryAfter on a 429 the caller chose to handle themselves', async () => {
    const stub = stubFetch(
      json(
        { status: 'error', error: { code: 'rate_limited', message: 'too fast', docs: 'd' } },
        { status: 429, headers: { 'Retry-After': '7' } },
      ),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch, maxRetries: 0 });

    const error = (await transport
      .post('/v1/kundli', {})
      .catch((thrown: unknown) => thrown)) as KaaljyotiError;
    expect(error.code).toBe('rate_limited');
    expect(error.retryAfter).toBe(7);
    expect(isRetryable(error)).toBe(true);
    expect(stub.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('retries', () => {
  it('waits what Retry-After says and then succeeds', async () => {
    vi.useFakeTimers();
    const stub = stubFetch(
      json(
        { status: 'error', error: { code: 'rate_limited', message: 'too fast', docs: 'd' } },
        { status: 429, headers: { 'Retry-After': '3' } },
      ),
      json(kundliFixture),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const pending = transport.post('/v1/kundli', {});
    await vi.advanceTimersByTimeAsync(2_999);
    expect(stub.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await expect(pending).resolves.toMatchObject({ plan: null });
    expect(stub.fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries 429s', async () => {
    vi.useFakeTimers();
    const stub = stubFetch(
      json(
        { status: 'error', error: { code: 'rate_limited', message: 'too fast', docs: 'd' } },
        { status: 429, headers: { 'Retry-After': '1' } },
      ),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch, maxRetries: 2 });

    const pending = transport.post('/v1/kundli', {}).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(((await pending) as KaaljyotiError).code).toBe('rate_limited');
    // The first attempt plus two retries, and not a fourth.
    expect(stub.fetch).toHaveBeenCalledTimes(3);
  });

  it('caps an absurd Retry-After at 30 seconds', async () => {
    vi.useFakeTimers();
    const stub = stubFetch(
      json(
        { status: 'error', error: { code: 'rate_limited', message: 'too fast', docs: 'd' } },
        { status: 429, headers: { 'Retry-After': '86400' } },
      ),
      json(kundliFixture),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const pending = transport.post('/v1/kundli', {});
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toMatchObject({ cached: false });
  });

  it('falls back to 2 seconds when Retry-After is missing or junk', async () => {
    vi.useFakeTimers();
    const stub = stubFetch(
      json(
        { status: 'error', error: { code: 'rate_limited', message: 'too fast', docs: 'd' } },
        { status: 429 },
      ),
      json(kundliFixture),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const pending = transport.post('/v1/kundli', {});
    await vi.advanceTimersByTimeAsync(1_999);
    expect(stub.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await expect(pending).resolves.toBeTruthy();
  });

  it('retries an engine_error exactly once', async () => {
    const stub = stubFetch(
      json(
        { status: 'error', error: { code: 'engine_error', message: 'our fault', docs: 'd' } },
        { status: 500 },
      ),
      json(
        { status: 'error', error: { code: 'engine_error', message: 'our fault', docs: 'd' } },
        { status: 500 },
      ),
      json(kundliFixture),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const error = (await transport
      .post('/v1/kundli', {})
      .catch((thrown: unknown) => thrown)) as KaaljyotiError;
    expect(error.code).toBe('engine_error');
    expect(error.status).toBe(500);
    expect(isRetryable(error)).toBe(true);
    expect(stub.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a network failure once, then throws network_error', async () => {
    const stub = stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const error = (await transport
      .post('/v1/kundli', {})
      .catch((thrown: unknown) => thrown)) as KaaljyotiError;
    expect(error.code).toBe('network_error');
    expect(error.message).toBe('fetch failed');
    expect(error.status).toBe(0);
    expect(isRetryable(error)).toBe(true);
    expect(stub.fetch).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retried network call succeeds', async () => {
    let first = true;
    const stub = stubFetch(() => {
      if (first) {
        first = false;
        throw new TypeError('fetch failed');
      }
      return json(kundliFixture);
    });
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    await expect(transport.post('/v1/kundli', {})).resolves.toMatchObject({
      meta: expect.any(Object),
    });
    expect(stub.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries nothing at all when maxRetries is 0', async () => {
    const stub = stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch, maxRetries: 0 });

    await expect(transport.post('/v1/kundli', {})).rejects.toMatchObject({
      code: 'network_error',
    });
    expect(stub.fetch).toHaveBeenCalledTimes(1);
  });
});

/** A `fetch` that never answers but honours its signal, as the real one does. */
const hangingFetch = ((_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  })) as unknown as typeof fetch;

describe('timeout and cancellation', () => {
  it('gives up after timeoutMs with a timeout code', async () => {
    vi.useFakeTimers();
    const transport = createTransport({
      apiKey: LIVE_KEY,
      fetch: hangingFetch,
      timeoutMs: 5_000,
      maxRetries: 0,
    });

    const pending = transport.post('/v1/kundli', {}).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_001);
    const error = (await pending) as KaaljyotiError;
    expect(error.code).toBe('timeout');
    expect(isRetryable(error)).toBe(true);
  });

  it("rethrows the caller's own abort rather than calling it a failure", async () => {
    const controller = new AbortController();
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: hangingFetch });

    const pending = transport
      .post('/v1/kundli', {}, { signal: controller.signal })
      .catch((error: unknown) => error);
    controller.abort();
    const error = await pending;

    expect(isKaaljyotiError(error)).toBe(false);
    expect((error as Error).name).toBe('AbortError');
  });
});

describe('the answers that are not envelopes', () => {
  it('returns the health object bare, with no meta', async () => {
    const health = {
      status: 'ok',
      engine: '0.14.2',
      ephemeris: 'kaaljyoti-ephemeris 0.1.1',
      ops: 42,
      uptime_s: 900,
    };
    const stub = stubFetch(json(health));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const result = await transport.get<typeof health>('/v1/health');
    expect(result.data).toEqual(health);
    expect(result.meta).toBeNull();
  });

  it('returns an SVG as text when one was asked for', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const stub = stubFetch(
      new Response(svg, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml', 'X-KJ-Credits': '1' },
      }),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const result = await transport.post<string>(
      '/v1/kundli/chart',
      {},
      { accept: 'image/svg+xml' },
    );
    expect(result.data).toBe(svg);
    expect(result.meta).toBeNull();
    // No `meta` on markup: the header is the only place the cost is.
    expect(result.credits).toBe(1);
    expect(headersOf(stub.calls[0]!.init)['Accept']).toBe('image/svg+xml');
  });

  it('still reads an envelope when an SVG request fails', async () => {
    const stub = stubFetch(json(errorFixture, { status: 400 }));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    await expect(
      transport.post('/v1/kundli/chart', {}, { accept: 'image/svg+xml' }),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('returns a PDF as bytes, never as text', async () => {
    // Every byte value, so a UTF-8 decode anywhere on the way would show.
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const stub = stubFetch(
      new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="panchang-2026-10.pdf"',
          'X-KJ-Credits': '500',
        },
      }),
    );
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const result = await transport.post<{
      bytes: Uint8Array;
      filename: string | null;
      credits: number | null;
    }>('/v1/pdf/panchang/month', {}, { accept: 'application/pdf' });
    expect([...result.data.bytes]).toEqual([...bytes]);
    expect(result.data.filename).toBe('panchang-2026-10.pdf');
    expect(result.data.credits).toBe(500);
    expect(result.credits).toBe(500);
    expect(result.meta).toBeNull();
    expect(headersOf(stub.calls[0]!.init)['Accept']).toBe('application/pdf');
    expect(headersOf(stub.calls[0]!.init)['Content-Type']).toBe('application/json');
  });

  it('still reads an envelope when a PDF request fails, and retries it like any other', async () => {
    const stub = stubFetch(
      json(errorFixture, { status: 429, headers: { 'Retry-After': '0' } }),
      json(errorFixture, { status: 400 }),
    );
    vi.useFakeTimers();
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    const pending = transport.post('/v1/pdf/kundli', {}, { accept: 'application/pdf' });
    const settled = expect(pending).rejects.toMatchObject({ code: 'validation_error' });
    await vi.runAllTimersAsync();
    await settled;
    expect(stub.calls).toHaveLength(2);
  });
});

describe('filenameOf', () => {
  it('reads the quoted file name the gateway sends', () => {
    expect(filenameOf('attachment; filename="kundli-ravi-kumar.pdf"')).toBe(
      'kundli-ravi-kumar.pdf',
    );
  });

  it('reads an unquoted one', () => {
    expect(filenameOf('attachment; filename=match-2026.pdf')).toBe('match-2026.pdf');
  });

  it('prefers the RFC 6266 filename* form, which can carry Devanagari', () => {
    expect(
      filenameOf(
        'attachment; filename="kundli.pdf"; filename*=UTF-8\'\'kundli-%E0%A4%B0%E0%A4%B5%E0%A4%BF.pdf',
      ),
    ).toBe('kundli-रवि.pdf');
  });

  it('is null without a header or a file name in it', () => {
    expect(filenameOf(null)).toBeNull();
    expect(filenameOf('attachment')).toBeNull();
    expect(filenameOf('attachment; filename=""')).toBeNull();
  });
});

describe('fetch injection', () => {
  it('prefers the injected fetch over the global', async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });

    await transport.post('/v1/kundli', {});
    expect(globalFetch).not.toHaveBeenCalled();
    expect(stub.fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('sends the body as JSON', async () => {
    const stub = stubFetch(json(kundliFixture));
    const transport = createTransport({ apiKey: LIVE_KEY, fetch: stub.fetch });
    const body = { birth: { datetime: '1990-05-14T10:30:00', latitude: 28.6, longitude: 77.2 } };

    await transport.post('/v1/kundli', body);
    expect(JSON.parse(String(stub.calls[0]!.init.body))).toEqual(body);
    expect(stub.calls[0]!.init.method).toBe('POST');
  });
});
