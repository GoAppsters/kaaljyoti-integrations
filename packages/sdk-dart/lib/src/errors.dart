/// One exception type for every failure, API-side or not.
///
/// The docs' rule for callers is "branch on `code`, never on `message`", and
/// that rule is only keepable if every failure has a code — including the ones
/// that never reached the API, where `package:http` throws a
/// `ClientException` whose message differs between platforms and a timeout
/// arrives as a `TimeoutException` with no code at all. So a dead socket is
/// `network_error`, an expired deadline is `timeout`, and a proxy's HTML error
/// page is `bad_response`; all of them arrive as the same class, with the same
/// fields, as a `validation_error` from the gateway.
///
/// Nothing here ever carries the API key: a [KaaljyotiException] is the object
/// an application logs, and a logged key is a leaked key.
library;

/// The codes this package invents, for failures with no envelope behind them.
///
/// They share the namespace with the API's own codes (`validation_error`,
/// `invalid_key`, `key_revoked`, `quota_exceeded`, `pdf_quota_exceeded`,
/// `forbidden_origin`, `plan_required`, `not_found`, `not_computable`,
/// `rate_limited`, `engine_error`, `service_disabled`) so that a caller writes
/// one `switch`.
///
/// [invalidKey] is deliberately the API's own code rather than a new one: an
/// empty key is refused here instead of a round trip away, and the caller
/// should not have to handle two codes for the same mistake.
abstract final class KjErrorCode {
  /// The socket never answered — offline, DNS, a refused connection.
  static const String networkError = 'network_error';

  /// The client's `timeout` elapsed before the answer did.
  static const String timeout = 'timeout';

  /// An answer arrived, but it was not an envelope this SDK can read.
  static const String badResponse = 'bad_response';

  /// No key was configured; nothing was sent.
  static const String invalidKey = 'invalid_key';
}

/// The gateway's code for "you are going too fast"; retried on `Retry-After`.
const String kRateLimited = 'rate_limited';

/// The gateway's code for a calculation that failed inside the engine.
const String kEngineError = 'engine_error';

/// Codes worth trying again, and the only ones.
///
/// `rate_limited` and `engine_error` say "later"; `network_error` and
/// `timeout` say "the question never got an answer". Everything else —
/// `validation_error`, `invalid_key`, `quota_exceeded`, `plan_required`,
/// `not_computable` — will refuse the identical request identically, so a
/// retry only spends the caller's time.
const Set<String> _retryableCodes = <String>{
  kRateLimited,
  kEngineError,
  KjErrorCode.networkError,
  KjErrorCode.timeout,
};

/// A failure, with a [code] that is part of the API's contract.
///
/// Every method on `Kaaljyoti` throws this and nothing else — except
/// `match.batch`, where a single unanswerable pair comes back as a value in
/// `data.results` rather than discarding the pairs that were computed.
class KaaljyotiException implements Exception {
  /// Builds a failure. Only [code] and [message] are always known.
  const KaaljyotiException({
    required this.code,
    required this.message,
    this.status = 0,
    this.field,
    this.docs,
    this.requestId,
    this.retryAfter,
  });

  /// The contract. Branch on this, never on [message].
  ///
  /// One of the API's own codes or one of [KjErrorCode]'s.
  final String code;

  /// The HTTP status, or `0` when the request never got an answer.
  final int status;

  /// Human-readable, and free to get clearer between versions.
  final String message;

  /// Dotted path of the offending request field, e.g. `birth.utc_offset`.
  final String? field;

  /// Link to the errors page for this code.
  final String? docs;

  /// `X-KJ-Request-Id` — the one thing support asks for.
  final String? requestId;

  /// What `Retry-After` asked for, on a `429`.
  ///
  /// Exposed rather than only obeyed, because a caller who set
  /// `maxRetries: 0` is doing the waiting themselves.
  final Duration? retryAfter;

  /// Whether sending the identical request again is worth anything.
  ///
  /// The SDK already retried these within its own budget, so `true` here means
  /// the budget ran out, not that nothing was tried. Every endpoint is a pure
  /// calculation, which is what makes retrying a POST safe at all.
  bool get isRetryable => _retryableCodes.contains(code);

  @override
  String toString() {
    final parts = <String>[code];
    if (status != 0) parts.add('HTTP $status');
    if (field != null) parts.add('field $field');
    if (requestId != null) parts.add('request $requestId');
    return 'KaaljyotiException(${parts.join(', ')}): $message';
  }
}
