import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../src/core/client.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { KjError } from '../src/core/errors.ts';
import { clearCache } from '../src/core/cache.ts';
import errorFixture from './fixtures/error.json';
import panchangFixture from './fixtures/panchang.json';

const KEY = 'kj_pub_test/key';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: KEY, baseUrl: 'https://api-staging.kaaljyoti.com/v1/' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('request', () => {
  it('posts to {base}/v1{path} with the key in the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(panchangFixture));
    vi.stubGlobal('fetch', fetchMock);

    await request('/panchang', { latitude: 28.6139 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // `data-base` was given with a trailing `/v1/`; the client must not
    // double it.
    expect(url).toBe(
      `https://api-staging.kaaljyoti.com/v1/panchang?key=${encodeURIComponent(KEY)}`,
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ latitude: 28.6139 }));
  });

  it('sends X-KJ-Client and never an Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(panchangFixture));
    vi.stubGlobal('fetch', fetchMock);

    await request('/panchang', {});

    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    const tag = headers['X-KJ-Client'] ?? '';
    expect(tag).toMatch(/^widgets\/\d/);
    expect(tag.length).toBeLessThanOrEqual(64);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
    expect(Object.keys(headers)).not.toContain('Authorization');
  });

  it('unwraps an ok envelope with plan, cached and request id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(panchangFixture, {
          headers: { 'X-KJ-Plan': 'growth', 'X-KJ-Request-Id': 'req_abc' },
        }),
      ),
    );

    const answer = await request<{ sunrise: string }>('/panchang', {});

    expect(answer.data.sunrise).toBe('2026-09-22T06:13:13.728');
    expect(answer.plan).toBe('growth');
    expect(answer.cached).toBe(false);
    expect(answer.requestId).toBe('req_abc');
  });

  it('never carries the account’s credit balance', async () => {
    // The gateway keeps `X-KJ-Credits-Remaining` from a publishable key, and
    // a widget must not depend on it: nothing here reads it even when sent.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(panchangFixture, {
          headers: { 'X-KJ-Credits': '1', 'X-KJ-Credits-Remaining': '199412' },
        }),
      ),
    );

    const answer = await request<{ sunrise: string }>('/panchang', {});

    expect(Object.keys(answer).sort()).toEqual(['cached', 'data', 'meta', 'plan', 'requestId']);
    expect(JSON.stringify(answer)).not.toContain('199412');
  });

  it('turns an error envelope into a KjError carrying code, field and docs', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json(errorFixture, { status: 400, headers: { 'X-KJ-Request-Id': 'req_bad' } }),
        ),
    );

    const failure = await request('/panchang', {}).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(KjError);
    const error = failure as KjError;
    expect(error.code).toBe('validation_error');
    expect(error.status).toBe(400);
    expect(error.field).toBe('options.language');
    expect(error.docs).toBe('https://kaaljyoti.com/api/docs/errors#validation_error');
    expect(error.requestId).toBe('req_bad');
  });

  it('retries a 429 once after Retry-After, then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          { status: 'error', error: { code: 'rate_limited', message: 'Too many requests' } },
          { status: 429, headers: { 'Retry-After': '3' } },
        ),
      )
      .mockResolvedValueOnce(json(panchangFixture));
    vi.stubGlobal('fetch', fetchMock);

    const pending = request('/panchang', {});
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ plan: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second 429', async () => {
    vi.useFakeTimers();
    const limited = () =>
      json(
        { status: 'error', error: { code: 'rate_limited', message: 'Too many' } },
        {
          status: 429,
          headers: { 'Retry-After': '1' },
        },
      );
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(limited()));
    vi.stubGlobal('fetch', fetchMock);

    const pending = request('/panchang', {}).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);

    const error = (await pending) as KjError;
    expect(error.code).toBe('rate_limited');
    expect(error.retryAfter).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails with no_key before it touches the network', async () => {
    resetConfig();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const error = (await request('/panchang', {}).catch((e: unknown) => e)) as KjError;

    expect(error.code).toBe('no_key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['kj_live_abc123', 'secret_key'],
    ['kj_test_abc123', 'secret_key'],
    ['sk_live_abc123', 'invalid_key'],
    ['KJ_PUB_abc123', 'invalid_key'],
  ])('refuses %s before it touches the network (%s)', async (key, code) => {
    configure({ key });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const error = (await request('/panchang', {}).catch((e: unknown) => e)) as KjError;

    expect(error).toBeInstanceOf(KjError);
    expect(error.code).toBe(code);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still relays through a proxy when the page key is not publishable', async () => {
    configure({ key: 'kj_live_abc123', proxyUrl: '/wp-json/kaal-jyoti/v1/proxy' });
    const fetchMock = vi.fn().mockResolvedValue(json(panchangFixture));
    vi.stubGlobal('fetch', fetchMock);

    await request('/panchang', {}, { proxy: '/wp-json/kaal-jyoti/v1/proxy' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('kj_live_');
  });

  it('reports a thrown fetch as network_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = (await request('/panchang', {}).catch((e: unknown) => e)) as KjError;

    expect(error.code).toBe('network_error');
    expect(error.message).toBe('Failed to fetch');
  });

  it('reports a non-JSON body as bad_response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>502</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const error = (await request('/panchang', {}).catch((e: unknown) => e)) as KjError;

    expect(error.code).toBe('bad_response');
    expect(error.status).toBe(502);
  });

  it('returns the document itself when Accept asks for SVG', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const answer = await request<string>('/kundli/chart', {}, { accept: 'image/svg+xml' });

    expect(answer.data).toBe(svg);
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers.Accept).toBe('image/svg+xml');
  });
});
