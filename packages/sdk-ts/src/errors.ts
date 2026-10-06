/**
 * One error type for every failure, API-side or not.
 *
 * The docs' rule for callers is "branch on `code`, never on `message`"
 * (design decision 5), and that rule is only keepable if every failure has a
 * code — including the ones that never reached the API, where `fetch` throws
 * a `TypeError` whose message differs between Node, Deno and every browser.
 * So a DNS failure is `network_error`, an expired deadline is `timeout`, and
 * a proxy's HTML error page is `bad_response`; all of them arrive as the same
 * class with the same fields as a `validation_error` from the gateway.
 *
 * Nothing here ever carries the API key: a `KaaljyotiError` is the object an
 * application logs, and a logged key is a leaked key.
 */

/**
 * Codes this package invents, for failures with no envelope behind them.
 *
 * They share the namespace with the API's own codes (`validation_error`,
 * `invalid_key`, `key_revoked`, `quota_exceeded`, `pdf_quota_exceeded`,
 * `forbidden_origin`, `plan_required`, `not_found`, `not_computable`, `rate_limited`,
 * `engine_error`, `service_disabled`) so a caller has one `switch`.
 *
 * `invalid_key` is deliberately the API's own code rather than a new one: an
 * empty key is refused here instead of a round trip away, and the caller
 * should not have to handle two codes for the same mistake.
 */
export const CLIENT_ERROR_CODES = {
  /** `fetch` itself rejected — offline, DNS, a refused connection. */
  network: 'network_error',
  /** `timeoutMs` elapsed before the answer did. */
  timeout: 'timeout',
  /** An answer arrived, but it was not an envelope we can read. */
  badResponse: 'bad_response',
  /** No key was configured; nothing was sent. */
  invalidKey: 'invalid_key',
} as const;

/**
 * Codes worth trying again, and the only ones.
 *
 * `rate_limited` and `engine_error` say "later"; `network_error` and
 * `timeout` say "the question never got an answer". Everything else —
 * `validation_error`, `invalid_key`, `quota_exceeded`, `plan_required`,
 * `not_computable` — will refuse the identical request identically, so a
 * retry only spends the caller's time.
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'rate_limited',
  'engine_error',
  CLIENT_ERROR_CODES.network,
  CLIENT_ERROR_CODES.timeout,
]);

/** Everything a {@link KaaljyotiError} may carry beyond its message. */
export interface KaaljyotiErrorDetail {
  /** HTTP status, or 0 when the request never got an answer. */
  status?: number;
  /** Dotted path of the offending request field, e.g. `options.language`. */
  field?: string;
  /** Link to the errors page for this code. */
  docs?: string;
  /** `X-KJ-Request-Id` — the one thing support asks for. */
  requestId?: string;
  /** Seconds from `Retry-After`, on a 429. */
  retryAfter?: number;
}

/** A failure, with a `code` that is part of the API's contract. */
export class KaaljyotiError extends Error {
  override readonly name = 'KaaljyotiError';
  /** The contract. Branch on this. @see CLIENT_ERROR_CODES */
  readonly code: string;
  /** HTTP status, or 0 for a failure that never got an answer. */
  readonly status: number;
  readonly field?: string;
  readonly docs?: string;
  readonly requestId?: string;
  /**
   * Seconds the gateway asked us to wait. Exposed rather than only obeyed,
   * because a caller who set `maxRetries: 0` is doing the waiting themselves
   * (design decision 4).
   */
  readonly retryAfter?: number;

  constructor(code: string, message: string, detail: KaaljyotiErrorDetail = {}) {
    super(message);
    this.code = code;
    this.status = detail.status ?? 0;
    this.field = detail.field;
    this.docs = detail.docs;
    this.requestId = detail.requestId;
    this.retryAfter = detail.retryAfter;
  }
}

/**
 * Whether something thrown is one of ours.
 *
 * Checks the shape rather than `instanceof`, because a bundler that ends up
 * with two copies of this module — a dependency pinning one version, the
 * application another — would make `instanceof` false for an error the user
 * can plainly see is a `KaaljyotiError`.
 */
export function isKaaljyotiError(value: unknown): value is KaaljyotiError {
  return (
    value instanceof Error &&
    value.name === 'KaaljyotiError' &&
    typeof (value as KaaljyotiError).code === 'string'
  );
}

/**
 * Whether the identical request is worth sending again.
 *
 * The SDK already retries these within its own budget, so a `true` here means
 * the budget ran out, not that nothing was tried. Every endpoint is a pure
 * calculation, which is why a retried POST is safe at all.
 */
export function isRetryable(error: unknown): boolean {
  return isKaaljyotiError(error) && RETRYABLE_CODES.has(error.code);
}
