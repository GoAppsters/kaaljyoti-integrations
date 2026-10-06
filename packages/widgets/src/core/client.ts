/**
 * The one `fetch` in the package.
 *
 * Everything the embed recipes do by hand — `?key=`, the envelope check, the
 * `Retry-After` — happens once, here, so that four elements cannot drift
 * apart on it. Three rules are not negotiable:
 *
 *   1. **The key travels in the query string, never in `Authorization`.** The
 *      API refuses a secret key as `?key=…` outright, and a browser cannot
 *      keep a secret anyway; sending `Authorization` from a page would also
 *      cost a CORS preflight the gateway deliberately does not grant it.
 *   2. **The browser sends `Origin` itself.** That is the whole of a
 *      publishable key's safety, and it is why nothing here tries to set it.
 *   3. **An error is a value.** Nothing escapes as a raw `TypeError` or a
 *      half-parsed body; a caller gets data or a `KjError` with a code.
 *
 * A request can also go through the site's own proxy (`init.proxy`, design
 * decision 23): then it is `POST {proxy}` with `{ path, body }`, no key, and
 * the proxy answers with the API's envelope, which is read exactly as a
 * direct answer is.
 */

import { getConfig, CLIENT_TAG } from './config.ts';
import { CLIENT_ERROR_CODES, KjError } from './errors.ts';

/** Header names the gateway sets on every answer, error ones included. */
const REQUEST_ID_HEADER = 'X-KJ-Request-Id';
const PLAN_HEADER = 'X-KJ-Plan';

/** A 429 without a usable `Retry-After`; the gateway always sends one. */
const DEFAULT_RETRY_SECONDS = 2;

/**
 * Longest we will hold a widget in its loading state for a retry. Past this
 * the honest answer is the rendered `rate_limited` line, which at least says
 * what happened (design decision 6).
 */
const MAX_RETRY_SECONDS = 10;

/** What a successful call gives back, envelope and all. */
export interface KjResponse<T> {
  /** `data` from the envelope, or the raw SVG when `accept` asked for one. */
  data: T;
  /** `meta`: ayanamsa, timezone, engine version, `compute_ms`. */
  meta: unknown;
  /** `X-KJ-Plan` — the input to the powered-by rule (decision 9). */
  plan: string | null;
  /** Whether the gateway served this from its own cache. */
  cached: boolean;
  /** `X-KJ-Request-Id`, worth putting in a `kj-error` event. */
  requestId: string | null;
}

/** Per-call knobs; everything else comes from {@link getConfig}. */
export interface KjRequestInit {
  /** `image/svg+xml` to get a chart as markup instead of an envelope. */
  accept?: string;
  signal?: AbortSignal;
  /**
   * Makes the call a `GET` with these as its query, and `body` is ignored.
   * Only `/v1/places` wants one: a search is read from the query string.
   */
  query?: Record<string, string>;
  /**
   * The site's proxy endpoint (decision 23). The request becomes `POST
   * {proxy}` with `{ "path": "/panchang/month", "body": {…} }` and carries no
   * key; the answer is the API's envelope, relayed.
   */
  proxy?: string;
}

let fetchOverride: typeof fetch | null = null;

/**
 * Replace `fetch` for tests that cannot stub the global.
 *
 * The global is read at call time rather than captured at module load, so
 * `vi.stubGlobal('fetch', …)` works on its own and this hook is only for the
 * cases where it does not.
 */
export function setFetch(fn: typeof fetch | null): void {
  fetchOverride = fn;
}

/** The envelope, as far as this client needs to understand it. */
export interface Envelope {
  status?: string;
  data?: unknown;
  meta?: { cached?: boolean } | null;
  error?: { code?: string; message?: string; docs?: string; field?: string };
}

/** Seconds to wait before the one retry a 429 gets. */
function retryDelay(header: string | null): number {
  const seconds = header ? Number.parseInt(header, 10) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_SECONDS;
  return Math.min(seconds, MAX_RETRY_SECONDS);
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/** The envelope's error as a `KjError`, with what the headers added to it. */
export function errorFromEnvelope(body: Envelope, response: Response): KjError {
  const error = body.error ?? {};
  const retryAfter = response.headers.get('Retry-After');
  return new KjError(
    error.code ?? CLIENT_ERROR_CODES.badResponse,
    error.message ?? 'Request failed',
    {
      status: response.status,
      field: error.field,
      docs: error.docs,
      retryAfter: retryAfter ? retryDelay(retryAfter) : undefined,
      requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
    },
  );
}

/** The only key kind meant for a web page (`apps/api/src/lib/keys.ts`). */
const PUBLISHABLE_PREFIX = 'kj_pub_';

/**
 * Throws, before the network, unless `key` is a publishable key.
 *
 * Only `kj_pub_…` belongs in a page. A secret key pasted into a theme setting
 * or a `data-key` is refused here rather than sent as `?key=…`, where it would
 * also land in logs and the browser's history; anything else is not a key.
 */
function refuseUnpublishable(key: string): void {
  if (key.startsWith(PUBLISHABLE_PREFIX)) return;
  if (key.startsWith('kj_live_') || key.startsWith('kj_test_')) {
    throw new KjError(
      CLIENT_ERROR_CODES.secretKey,
      'A secret key is not for a web page: use a publishable key (kj_pub_…)',
    );
  }
  throw new KjError('invalid_key', 'A publishable key starts with kj_pub_');
}

/**
 * `POST {baseUrl}/v1{path}?key=…` (or a `GET`, with `init.query`), once, with
 * one retry on a 429.
 *
 * @throws KjError for every failure, including the ones that never left the
 * browser (`no_key`, `secret_key`, `invalid_key`, `network_error`).
 */
export async function request<T>(
  path: string,
  body: unknown,
  init: KjRequestInit = {},
): Promise<KjResponse<T>> {
  const config = getConfig();
  // `proxyAll`: a site with no key in the page sends everything through it.
  if (!init.proxy && config.proxyAll && config.proxyUrl) init = { ...init, proxy: config.proxyUrl };
  if (!config.key && !init.proxy) {
    // Nothing to send and nothing to wait for: fail before the network so the
    // widget paints its `no_key` line immediately.
    throw new KjError(CLIENT_ERROR_CODES.noKey, 'No publishable key configured');
  }
  if (!init.proxy) refuseUnpublishable(config.key ?? '');

  const accept = init.accept ?? 'application/json';
  const headers: Record<string, string> = { Accept: accept, 'X-KJ-Client': CLIENT_TAG };
  let url: string;
  let options: RequestInit;
  if (init.proxy) {
    // The key stays on the site's server; a GET's query travels in the body.
    url = new URL(init.proxy, document.baseURI).href;
    const relayed = init.query ? { path, query: init.query } : { path, body };
    options = {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(relayed),
      credentials: 'same-origin',
      signal: init.signal,
    };
  } else {
    const query = init.query ? `&${new URLSearchParams(init.query).toString()}` : '';
    url = `${config.baseUrl}/v1${path}?key=${encodeURIComponent(config.key ?? '')}${query}`;
    options = init.query
      ? { headers, signal: init.signal }
      : {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: init.signal,
        };
  }

  for (let attempt = 0; ; attempt++) {
    const doFetch = fetchOverride ?? globalThis.fetch;
    let response: Response;
    try {
      response = await doFetch(url, options);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new KjError(CLIENT_ERROR_CODES.network, message);
    }

    // The one retry (decision 6). A second 429 is the page's answer.
    if (response.status === 429 && attempt === 0) {
      await sleep(retryDelay(response.headers.get('Retry-After')));
      continue;
    }

    const plan = response.headers.get(PLAN_HEADER);
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    // A chart asked for as SVG comes back as the document itself, but only
    // when it succeeded; a failure is an envelope whatever `Accept` said.
    if (response.ok && accept !== 'application/json') {
      const svg = await response.text();
      return { data: svg as T, meta: null, plan, cached: false, requestId };
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      // An HTML error page from a proxy, or an empty body: not ours to read.
      throw new KjError(CLIENT_ERROR_CODES.badResponse, 'Response was not JSON', {
        status: response.status,
        requestId: requestId ?? undefined,
      });
    }

    const envelope = parsed as Envelope;
    if (envelope.status === 'error') throw errorFromEnvelope(envelope, response);
    if (envelope.status !== 'ok') {
      throw new KjError(CLIENT_ERROR_CODES.badResponse, 'Response was not a Kaal Jyoti envelope', {
        status: response.status,
        requestId: requestId ?? undefined,
      });
    }

    return {
      data: envelope.data as T,
      meta: envelope.meta ?? null,
      plan,
      cached: envelope.meta?.cached === true,
      requestId,
    };
  }
}
