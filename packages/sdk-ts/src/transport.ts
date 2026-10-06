/**
 * The one `fetch` in the package.
 *
 * Every method on the client is a path, a body and a document type; all the
 * behaviour a caller would otherwise have to reimplement — where the key
 * goes, which failures are worth retrying, what a `Retry-After` means, which
 * headers carry the answer's provenance — happens once, here.
 *
 * Four rules are not negotiable:
 *
 *   1. **The key's prefix decides where it travels** (design decision 3).
 *      `kj_pub_…` goes in `?key=`, because a browser cannot set
 *      `Authorization` cross-origin without a preflight the gateway does not
 *      grant; everything else goes in `Authorization: Bearer`, because the
 *      gateway refuses a secret key in a URL outright and a URL ends up in
 *      logs, history and referrers.
 *   2. **The envelope is not hidden** (decision 2). `meta` is how a user
 *      answers "why is this number what it is", so it comes back with the
 *      data rather than a second call away.
 *   3. **Retries are bounded and honest** (decision 4). A 429 waits what it
 *      was told to wait; an `engine_error` and a dead socket each get one
 *      more try; a `400` gets none, because the identical body will be
 *      refused identically.
 *   4. **Nothing escapes as a raw `TypeError`.** A caller gets a `Result` or
 *      a {@link KaaljyotiError} with a `code` — the one exception being the
 *      caller's own `AbortSignal`, which is not a failure at all.
 */

import { CLIENT_ERROR_CODES, KaaljyotiError } from './errors.ts';
import type { ErrorEnvelope, Meta } from './types.ts';

/**
 * `sdk-ts/0.1.0`. The version is substituted by `scripts/build.mjs` (and by
 * vitest) so the shipped bundle has no `package.json` read in it; the
 * fallback is for anyone compiling `src/` straight through `tsc`.
 */
export const VERSION: string =
  typeof __KJ_SDK_VERSION__ === 'string' ? __KJ_SDK_VERSION__ : '0.0.0-dev';

/** Where the API lives when nobody says otherwise. */
export const DEFAULT_BASE_URL = 'https://api.kaaljyoti.com';

/** Publishable keys, and only these, may travel in a query string. */
const PUBLISHABLE_PREFIX = 'kj_pub_';

/** Headers the gateway sets on every answer, failures included. */
const REQUEST_ID_HEADER = 'X-KJ-Request-Id';
const PLAN_HEADER = 'X-KJ-Plan';
const CACHE_HEADER = 'X-KJ-Cache';
/** What the request cost: the one place an SVG or a PDF, with no `meta`, says so. */
const CREDITS_HEADER = 'X-KJ-Credits';
/** What is left of the month and the credit packs. Secret keys only. */
const CREDITS_REMAINING_HEADER = 'X-KJ-Credits-Remaining';
const RATE_LIMIT_HEADERS = {
  limit: 'X-RateLimit-Limit',
  remaining: 'X-RateLimit-Remaining',
  reset: 'X-RateLimit-Reset',
} as const;

/** A 429 without a usable `Retry-After`; the gateway always sends one. */
const DEFAULT_RETRY_SECONDS = 2;

/** Longest we will sit on a retry. Past this, the caller should decide. */
const MAX_RETRY_SECONDS = 30;

/** `GET /v1/health` answers bare, not in the envelope. */
export const HEALTH_PATH = '/v1/health';

/** What a caller passes to `new Kaaljyoti(…)`. */
export interface ClientOptions {
  /** `kj_live_…`, `kj_test_…` or `kj_pub_…`. Required, never logged. */
  apiKey: string;
  /** Default {@link DEFAULT_BASE_URL}. A trailing `/` or `/v1` is trimmed. */
  baseUrl?: string;
  /** For tests, for a custom agent, for a runtime with no global. */
  fetch?: typeof fetch;
  /** Deadline per attempt, in milliseconds. Default 30 000. */
  timeoutMs?: number;
  /** Default 2. `0` turns retrying off entirely. */
  maxRetries?: number;
  /**
   * `X-KJ-Client`, default `sdk-ts/<version>`. A shell built on this SDK —
   * the MCP server, the WordPress plugin — sets its own so that usage
   * attributes to it rather than to the SDK (design decision 7).
   */
  client?: string;
  /** Extra headers on every request. Cannot override the key. */
  headers?: Record<string, string>;
}

/** The rate-limit bucket, as the last answer left it. */
export interface RateLimit {
  /** `X-RateLimit-Limit`: requests a minute for this key. */
  limit: number | null;
  /** `X-RateLimit-Remaining`: tokens left in the bucket. */
  remaining: number | null;
  /** `X-RateLimit-Reset`: unix seconds at which it refills. */
  reset: number | null;
}

/**
 * A successful call: the envelope, flattened by one level.
 *
 * `M` exists for `match.batch`, whose `meta` is a `BatchMeta` and not a
 * `Meta`; `Result<T>` on its own is the envelope every other endpoint
 * answers with.
 */
export interface Result<T, M = Meta> {
  /** `data` from the envelope — or the SVG or the PDF itself, when one was asked for. */
  data: T;
  /** `meta`, or `null` for the answers that carry none (health, SVG, PDF). */
  meta: M | null;
  /** `X-KJ-Request-Id`. Quote it to support and they can find the call. */
  requestId: string | null;
  /** `X-KJ-Plan`: the plan this answer was served under, not the one billed. */
  plan: string | null;
  /** Whether the gateway served this from its 24-hour cache. Costs the same credits. */
  cached: boolean;
  /**
   * `X-KJ-Credits`: what this request cost — the same number as
   * `meta.credits`, and the only one on an SVG or a PDF. `null` on the
   * answers that are free (health, time zone, reference tables).
   */
  credits: number | null;
  /**
   * `X-KJ-Credits-Remaining`: credits left this month, credit packs included.
   * Sent to secret keys only, so always `null` on a publishable key.
   */
  creditsRemaining: number | null;
  rateLimit: RateLimit;
}

/**
 * A PDF, as the `/v1/pdf/*` routes answer one: the bytes and what the
 * headers say about them.
 */
export interface PdfFile {
  /** The file itself, ready for `fs.writeFile` or a `Blob`. */
  bytes: Uint8Array;
  /** `Content-Type`: `application/pdf`. */
  contentType: string;
  /**
   * From `Content-Disposition`: `kundli-ravi-kumar.pdf`, or after the date,
   * year or month when the body had no `name`. `null` without the header.
   */
  filename: string | null;
  /** `X-KJ-Credits`: what the PDF cost (1,000 for a kundli, 500 for the others), or `null` without the header. */
  credits: number | null;
}

/** Per-call knobs. Everything else comes from {@link ClientOptions}. */
export interface RequestInitLike {
  /**
   * `image/svg+xml` to get a chart as markup instead of an envelope;
   * `application/pdf` for the bytes of a PDF route, as a {@link PdfFile}.
   */
  accept?: 'application/json' | 'image/svg+xml' | 'application/pdf';
  /** The caller's own cancellation, combined with the timeout. */
  signal?: AbortSignal;
}

/** Query values; `undefined` means "leave the parameter out". */
export type Query = Record<string, string | number | undefined>;

/** What the client is built on. @see createTransport */
export interface Transport {
  post<T, M = Meta>(path: string, body: unknown, init?: RequestInitLike): Promise<Result<T, M>>;
  get<T, M = Meta>(path: string, query?: Query): Promise<Result<T, M>>;
}

/** The envelope, as far as the transport needs to understand it. */
interface Envelope {
  status?: string;
  data?: unknown;
  meta?: unknown;
  error?: ErrorEnvelope['error'];
}

/**
 * `https://api.kaaljyoti.com/v1/` and `https://api.kaaljyoti.com` mean the
 * same thing to a person, so they must mean the same thing here. The `/v1`
 * is trimmed too: paths carry their own version prefix, and a base URL that
 * already had one would otherwise produce `/v1/v1/kundli`.
 */
export function normaliseBaseUrl(raw: string | undefined): string {
  const value = (raw ?? DEFAULT_BASE_URL).trim();
  if (value === '') return DEFAULT_BASE_URL;
  const trimmed = value.replace(/\/+$/, '');
  const withoutVersion = trimmed.endsWith('/v1') ? trimmed.slice(0, -'/v1'.length) : trimmed;
  return withoutVersion.replace(/\/+$/, '');
}

/** Seconds to wait, from a `Retry-After` header that may be anything. */
function retryDelaySeconds(header: string | null): number {
  const seconds = header === null ? Number.NaN : Number.parseInt(header, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_SECONDS;
  return Math.min(seconds, MAX_RETRY_SECONDS);
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function rateLimitOf(headers: Headers): RateLimit {
  return {
    limit: headerNumber(headers, RATE_LIMIT_HEADERS.limit),
    remaining: headerNumber(headers, RATE_LIMIT_HEADERS.remaining),
    reset: headerNumber(headers, RATE_LIMIT_HEADERS.reset),
  };
}

/**
 * The file name in a `Content-Disposition`, or `null`.
 *
 * The RFC 6266 `filename*=UTF-8''…` form wins over the plain one when both
 * are there, because it is the one that can carry a name in Devanagari.
 */
export function filenameOf(header: string | null): string | null {
  if (header === null) return null;
  const extended = /filename\*\s*=\s*utf-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]!.trim());
    } catch {
      // A malformed escape: fall through to the plain parameter.
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/.exec(header);
  const name = plain?.[1] ?? plain?.[2];
  return name === undefined || name === '' ? null : name;
}

/** The gateway's own error, with what the headers add to it. */
function errorFromEnvelope(body: Envelope, response: Response): KaaljyotiError {
  const error = body.error;
  const retryAfter = response.headers.get('Retry-After');
  return new KaaljyotiError(
    error?.code ?? CLIENT_ERROR_CODES.badResponse,
    error?.message ?? 'Request failed',
    {
      status: response.status,
      field: error?.field,
      docs: error?.docs,
      requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
      retryAfter: retryAfter === null ? undefined : retryDelaySeconds(retryAfter),
    },
  );
}

/**
 * One attempt's deadline, combined with the caller's own signal.
 *
 * `AbortSignal.any` would be two lines instead of ten, but it only landed in
 * Node 20.3 and the package supports Node 18 (design decision 8). The
 * returned `timedOut` box is how the caller tells our deadline apart from the
 * caller's cancellation: both arrive as the same `AbortError`.
 */
function deadline(timeoutMs: number, external: AbortSignal | undefined) {
  const controller = new AbortController();
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    state,
    release() {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/**
 * The fetch, the retries and the envelope — once, for every method.
 *
 * @throws KaaljyotiError for every failure, including the ones that never
 * left the process (`invalid_key`, `network_error`, `timeout`).
 */
export function createTransport(options: ClientOptions): Transport {
  const baseUrl = normaliseBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = Math.max(0, options.maxRetries ?? 2);
  const clientTag = options.client ?? `sdk-ts/${VERSION}`;
  const apiKey = options.apiKey ?? '';
  // The prefix is read once: a key that is not publishable is a secret key,
  // whatever its prefix, and a secret key is never put in a URL.
  const publishable = apiKey.startsWith(PUBLISHABLE_PREFIX);

  function url(path: string, query?: Query): string {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.set(name, String(value));
    }
    if (publishable) params.set('key', apiKey);
    const search = params.toString();
    return search === '' ? `${baseUrl}${path}` : `${baseUrl}${path}?${search}`;
  }

  function headersFor(accept: string, hasBody: boolean): Record<string, string> {
    // The caller's headers go on first so that nothing they pass can replace
    // the key, the client tag or the `Accept` this call depends on.
    const headers: Record<string, string> = { ...options.headers };
    // Only on a body: a `Content-Type` on a GET buys a CORS preflight in a
    // browser and says nothing true about the request.
    if (hasBody) headers['Content-Type'] = 'application/json';
    headers['Accept'] = accept;
    headers['X-KJ-Client'] = clientTag;
    if (!publishable) headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
  }

  async function send<T, M>(
    path: string,
    requestUrl: string,
    init: RequestInit,
    accept: string,
    signal: AbortSignal | undefined,
  ): Promise<Result<T, M>> {
    const doFetch = options.fetch ?? globalThis.fetch;
    // Each reason has its own budget: a 429 is the gateway pacing us and is
    // worth obeying repeatedly, while an `engine_error` or a dead socket is
    // worth exactly one more try before the caller hears about it.
    let rateLimitBudget = maxRetries;
    let engineBudget = Math.min(1, maxRetries);
    let networkBudget = Math.min(1, maxRetries);

    for (;;) {
      const attempt = deadline(timeoutMs, signal);
      let response: Response;
      try {
        response = await doFetch(requestUrl, { ...init, signal: attempt.signal });
      } catch (cause) {
        // A cancellation the caller asked for is not an API failure, and
        // turning it into one would make "I cancelled" indistinguishable
        // from "the network died" — so it is rethrown as it came.
        if (signal?.aborted) {
          attempt.release();
          throw signal.reason instanceof Error
            ? signal.reason
            : new KaaljyotiError(CLIENT_ERROR_CODES.network, 'The request was aborted');
        }
        const timedOut = attempt.state.timedOut;
        attempt.release();
        if (networkBudget > 0) {
          networkBudget -= 1;
          continue;
        }
        throw timedOut
          ? new KaaljyotiError(CLIENT_ERROR_CODES.timeout, `No answer within ${timeoutMs} ms`)
          : new KaaljyotiError(
              CLIENT_ERROR_CODES.network,
              cause instanceof Error ? cause.message : String(cause),
            );
      }
      attempt.release();

      if (response.status === 429 && rateLimitBudget > 0) {
        rateLimitBudget -= 1;
        await sleep(retryDelaySeconds(response.headers.get('Retry-After')));
        continue;
      }

      const headers = response.headers;
      const requestId = headers.get(REQUEST_ID_HEADER);
      const plan = headers.get(PLAN_HEADER);
      const rateLimit = rateLimitOf(headers);
      const cachedHeader = headers.get(CACHE_HEADER) === 'hit';
      const credits = headerNumber(headers, CREDITS_HEADER);
      const creditsRemaining = headerNumber(headers, CREDITS_REMAINING_HEADER);

      // A PDF is bytes, not text: decoding it as UTF-8 would corrupt it. Like
      // the SVG below, only a success is a file; a failure is an envelope.
      if (response.ok && accept === 'application/pdf') {
        const file: PdfFile = {
          bytes: new Uint8Array(await response.arrayBuffer()),
          contentType: headers.get('Content-Type') ?? accept,
          filename: filenameOf(headers.get('Content-Disposition')),
          credits,
        };
        return {
          data: file as T,
          meta: null,
          requestId,
          plan,
          cached: cachedHeader,
          credits,
          creditsRemaining,
          rateLimit,
        };
      }

      // A chart asked for as SVG comes back as the document itself — but only
      // when it succeeded. A failure is an envelope whatever `Accept` said.
      if (response.ok && accept !== 'application/json') {
        const svg = await response.text();
        return {
          data: svg as T,
          meta: null,
          requestId,
          plan,
          cached: cachedHeader,
          credits,
          creditsRemaining,
          rateLimit,
        };
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        // An HTML error page from a proxy, a truncated body, an empty 502.
        throw new KaaljyotiError(CLIENT_ERROR_CODES.badResponse, 'Response was not JSON', {
          status: response.status,
          requestId: requestId ?? undefined,
        });
      }

      const envelope = parsed as Envelope;

      if (envelope.status === 'error' || !response.ok) {
        const error = errorFromEnvelope(envelope, response);
        // Decision 4: one more try for our own fault, none for the caller's.
        if (error.code === 'engine_error' && engineBudget > 0) {
          engineBudget -= 1;
          continue;
        }
        throw error;
      }

      // Health is the one answer with no envelope around it: it must keep
      // working while the service is disabled, so it carries no `meta` and
      // no key was needed to ask.
      if (path === HEALTH_PATH) {
        return {
          data: parsed as T,
          meta: null,
          requestId,
          plan,
          cached: cachedHeader,
          credits,
          creditsRemaining,
          rateLimit,
        };
      }

      if (envelope.status !== 'ok' || !('data' in envelope)) {
        throw new KaaljyotiError(
          CLIENT_ERROR_CODES.badResponse,
          'Response was not a Kaal Jyoti envelope',
          { status: response.status, requestId: requestId ?? undefined },
        );
      }

      const meta = (envelope.meta ?? null) as M | null;
      return {
        data: envelope.data as T,
        meta,
        requestId,
        plan,
        // `meta.cached` is the gateway's own word for it; the header is the
        // only signal on the answers that carry no meta.
        cached: (meta as { cached?: boolean } | null)?.cached === true || cachedHeader,
        credits,
        creditsRemaining,
        rateLimit,
      };
    }
  }

  function requireKey(): void {
    if (apiKey === '') {
      // Nothing to send and nothing to wait for: fail before the network so
      // the mistake is a stack trace in the caller's own code.
      throw new KaaljyotiError(CLIENT_ERROR_CODES.invalidKey, 'No API key configured', {
        docs: 'https://kaaljyoti.com/api/docs/errors#invalid_key',
      });
    }
  }

  return {
    post<T, M = Meta>(path: string, body: unknown, init: RequestInitLike = {}) {
      requireKey();
      const accept = init.accept ?? 'application/json';
      return send<T, M>(
        path,
        url(path),
        {
          method: 'POST',
          headers: headersFor(accept, true),
          body: JSON.stringify(body ?? {}),
        },
        accept,
        init.signal,
      );
    },

    get<T, M = Meta>(path: string, query?: Query) {
      requireKey();
      const accept = 'application/json';
      return send<T, M>(
        path,
        url(path, query),
        { method: 'GET', headers: headersFor(accept, false) },
        accept,
        undefined,
      );
    },
  };
}
