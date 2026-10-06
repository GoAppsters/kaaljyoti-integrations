/**
 * One error type for everything a widget can fail at.
 *
 * The API answers a failure with an envelope (`{ status: 'error', error: {
 * code, message, docs, field } }`) and the browser answers one with a thrown
 * `TypeError` that says nothing useful. Both become a `KjError` with a `code`,
 * because `code` is what the widget renders: design decision 6 says an error
 * is a translated line inside the element, never an exception thrown at the
 * page, and a translation is chosen by a stable code and not by a message
 * whose wording may change.
 */

/**
 * Codes this package invents for failures that never reached the API, or that
 * came back without an envelope. They live alongside the API's own codes
 * (`invalid_key`, `forbidden_origin`, `rate_limited`, `quota_exceeded`,
 * `plan_required`, …) in the same namespace, so a renderer has one lookup.
 */
export const CLIENT_ERROR_CODES = {
  /** No publishable key: nothing was sent, and nothing can be. */
  noKey: 'no_key',
  /**
   * The page's key is a secret one (`kj_live_…`, `kj_test_…`). Nothing was
   * sent: a secret key in a page is already public, and the widget must not
   * also put it in a request URL.
   */
  secretKey: 'secret_key',
  /** Neither a known city nor a usable lat/lon on the element. */
  noPlace: 'no_place',
  /** `fetch` itself rejected — offline, DNS, a blocked request. */
  network: 'network_error',
  /** A response arrived but was not the envelope we can read. */
  badResponse: 'bad_response',
  /**
   * A route closed to publishable keys, and no proxy to send it through
   * (decision 23). Nothing was sent.
   */
  proxyRequired: 'proxy_required',
} as const;

/** Everything else a `KjError` may carry, all of it optional. */
export interface KjErrorDetail {
  /** HTTP status, or 0 when the request never got an answer. */
  status?: number;
  /** The offending request field, e.g. `options.language`. */
  field?: string;
  /** Link to the errors page for this code. */
  docs?: string;
  /** Seconds from `Retry-After`, on a 429. */
  retryAfter?: number;
  /** `X-KJ-Request-Id`, the one thing support asks for. */
  requestId?: string;
}

/** A failure a widget can render. @see CLIENT_ERROR_CODES */
export class KjError extends Error {
  override readonly name = 'KjError';
  readonly code: string;
  readonly status: number;
  readonly field?: string;
  readonly docs?: string;
  readonly retryAfter?: number;
  readonly requestId?: string;

  constructor(code: string, message: string, detail: KjErrorDetail = {}) {
    super(message);
    this.code = code;
    this.status = detail.status ?? 0;
    this.field = detail.field;
    this.docs = detail.docs;
    this.retryAfter = detail.retryAfter;
    this.requestId = detail.requestId;
  }
}

/**
 * Anything thrown, as a `KjError`.
 *
 * `load()` catches whatever a subclass's `fetchData()` threw, and a subclass
 * may throw a plain `Error` (or a string, from code we did not write). The
 * widget still has to render something with a code on it.
 */
export function asKjError(thrown: unknown): KjError {
  if (thrown instanceof KjError) return thrown;
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return new KjError(CLIENT_ERROR_CODES.badResponse, message);
}
