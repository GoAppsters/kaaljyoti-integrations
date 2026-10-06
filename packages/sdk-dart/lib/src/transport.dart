/// The one HTTP call in the package.
///
/// Every method on [Kaaljyoti] is a path, a body and a document type; all the
/// behaviour a caller would otherwise have to reimplement — where the key
/// goes, which failures are worth retrying, what a `Retry-After` means, which
/// headers carry the answer's provenance — happens once, here.
///
/// Four rules are not negotiable:
///
///   1. **The key's prefix decides where it travels.** `kj_pub_…` goes in
///      `?key=`, because a browser cannot set `Authorization` cross-origin
///      without a preflight the gateway does not grant; everything else goes
///      in `Authorization: Bearer`, because the gateway refuses a secret key
///      in a URL outright and a URL ends up in logs, history and referrers.
///   2. **The envelope is not hidden.** `meta` is how a user answers "why is
///      this number what it is", so it comes back with the data.
///   3. **Retries are bounded and honest.** A 429 waits what it was told to
///      wait; an `engine_error` and a dead socket each get one more try; a
///      `400` gets none, because the identical body will be refused
///      identically.
///   4. **Nothing escapes as a raw `ClientException` or `TypeError`.** A
///      caller gets a [KjResult] or a [KaaljyotiException] with a `code`.
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'errors.dart';
import 'generated/version.dart';
import 'result.dart';

/// Where the API lives when nobody says otherwise.
const String defaultBaseUrl = 'https://api.kaaljyoti.com';

/// `GET /v1/health` answers bare, not in the envelope.
const String healthPath = '/v1/health';

/// `Accept` for every endpoint but the SVG variant of a chart.
const String acceptJson = 'application/json';

/// `Accept` that asks `POST /v1/kundli/chart` for the markup itself.
const String acceptSvg = 'image/svg+xml';

/// `Accept` for the `/v1/pdf/*` routes, which answer the file's bytes.
const String acceptPdf = 'application/pdf';

/// Publishable keys, and only these, may travel in a query string.
const String _publishablePrefix = 'kj_pub_';

/// Headers the gateway sets on every answer, failures included.
const String _requestIdHeader = 'x-kj-request-id';
const String _planHeader = 'x-kj-plan';
const String _cacheHeader = 'x-kj-cache';

/// What the request cost: the one place an SVG or a PDF, with no `meta`, says
/// so.
const String _creditsHeader = 'x-kj-credits';

/// What is left of the month and the credit packs. Secret keys only.
const String _creditsRemainingHeader = 'x-kj-credits-remaining';
const String _limitHeader = 'x-ratelimit-limit';
const String _remainingHeader = 'x-ratelimit-remaining';
const String _resetHeader = 'x-ratelimit-reset';

/// A 429 without a usable `Retry-After`; the gateway always sends one.
const Duration _defaultRetry = Duration(seconds: 2);

/// Longest we will sit on a retry. Past this, the caller should decide.
const Duration _maxRetry = Duration(seconds: 30);

/// How the transport waits between attempts.
///
/// Injectable so that the tests can assert *what* was waited for without
/// waiting for it; the default is [Future.delayed].
typedef SleepFunction = Future<void> Function(Duration duration);

Future<void> _realSleep(Duration duration) => Future<void>.delayed(duration);

/// `https://api.kaaljyoti.com/v1/` and `https://api.kaaljyoti.com` mean the
/// same thing to a person, so they mean the same thing here. The `/v1` is
/// trimmed too: paths carry their own version prefix, and a base URL that
/// already had one would otherwise produce `/v1/v1/kundli`.
String normaliseBaseUrl(String? raw) {
  var value = (raw ?? defaultBaseUrl).trim();
  if (value.isEmpty) return defaultBaseUrl;
  while (value.endsWith('/')) {
    value = value.substring(0, value.length - 1);
  }
  if (value.endsWith('/v1')) value = value.substring(0, value.length - 3);
  while (value.endsWith('/')) {
    value = value.substring(0, value.length - 1);
  }
  return value;
}

/// The file name in a `Content-Disposition`, or `null`.
///
/// The RFC 6266 `filename*=UTF-8''…` form wins over the plain one when both
/// are there, because it is the one that can carry a name in Devanagari.
String? filenameOf(String? header) {
  if (header == null) return null;
  final extended =
      RegExp(r"filename\*\s*=\s*utf-8''([^;]+)", caseSensitive: false)
          .firstMatch(header);
  if (extended != null) {
    try {
      return Uri.decodeComponent(extended.group(1)!.trim());
    } on ArgumentError {
      // A malformed escape: fall through to the plain parameter.
    } on FormatException {
      // Escapes that are not UTF-8: the same.
    }
  }
  final plain =
      RegExp(r'filename\s*=\s*(?:"([^"]*)"|([^;\s]+))').firstMatch(header);
  final name = plain?.group(1) ?? plain?.group(2);
  return name == null || name.isEmpty ? null : name;
}

/// The fetch, the retries and the envelope — once, for every method.
///
/// Built by [Kaaljyoti] from its own options; there is no reason to construct
/// one directly outside a test.
class Transport {
  /// Builds the transport. [apiKey] is the only required option.
  ///
  /// Passing [client] hands ownership to the caller: [close] will not close a
  /// client it did not create, because a Flutter app that shares one
  /// `http.Client` between services would lose the others' connections.
  Transport({
    required String apiKey,
    String? baseUrl,
    http.Client? client,
    this.timeout = const Duration(seconds: 30),
    int maxRetries = 2,
    this.clientTag = 'sdk-dart/$sdkVersion',
    this.headers = const <String, String>{},
    SleepFunction sleep = _realSleep,
  })  : _apiKey = apiKey,
        baseUrl = normaliseBaseUrl(baseUrl),
        _client = client ?? http.Client(),
        _ownsClient = client == null,
        maxRetries = maxRetries < 0 ? 0 : maxRetries,
        _sleep = sleep,
        // Read once: a key that is not publishable is a secret key, whatever
        // its prefix, and a secret key is never put in a URL.
        _publishable = apiKey.startsWith(_publishablePrefix);

  /// The origin every path is appended to, already normalised.
  final String baseUrl;

  /// The deadline for one attempt, not for the whole call.
  final Duration timeout;

  /// How many extra attempts the retry policy may spend. `0` turns it off.
  final int maxRetries;

  /// The `X-KJ-Client` tag. A shell built on this SDK sets its own.
  final String clientTag;

  /// Extra headers on every request. Cannot override the key or the tag.
  final Map<String, String> headers;

  final String _apiKey;
  final bool _publishable;
  final http.Client _client;
  final bool _ownsClient;
  final SleepFunction _sleep;

  /// Closes the underlying client, but only if this transport created it.
  void close() {
    if (_ownsClient) _client.close();
  }

  /// Sends a JSON body and reads the envelope back.
  ///
  /// [decode] is handed `data` from the envelope — or, when [accept] is
  /// [acceptSvg] and the call succeeded, the response body as text, and when
  /// it is [acceptPdf], a [PdfFile] of the body's bytes. [decodeMeta] is
  /// handed `meta`, which is `null` on the answers that carry none.
  ///
  /// `async`, deliberately: an empty key is refused before the network, and a
  /// method that returns a `Future` must never *also* throw synchronously — a
  /// caller who wrote `.catchError(…)` would not catch it and a caller who
  /// wrote `await` would. Every failure on this surface arrives as a rejected
  /// future.
  Future<KjResult<T, M>> post<T, M>(
    String path,
    Map<String, dynamic> body, {
    required T Function(Object? json) decode,
    required M Function(Object? json) decodeMeta,
    String accept = acceptJson,
  }) async {
    _requireKey();
    return _send<T, M>(
      path: path,
      method: 'POST',
      url: _url(path),
      body: jsonEncode(body),
      accept: accept,
      decode: decode,
      decodeMeta: decodeMeta,
    );
  }

  /// Reads an endpoint that takes its arguments in the query string.
  ///
  /// A `null` value in [query] leaves the parameter out entirely, which is not
  /// the same as sending it empty.
  ///
  /// `async` for the same reason as [post].
  Future<KjResult<T, M>> get<T, M>(
    String path, {
    Map<String, String?> query = const <String, String?>{},
    required T Function(Object? json) decode,
    required M Function(Object? json) decodeMeta,
  }) async {
    _requireKey();
    return _send<T, M>(
      path: path,
      method: 'GET',
      url: _url(path, query),
      accept: acceptJson,
      decode: decode,
      decodeMeta: decodeMeta,
    );
  }

  /// Fails before the network so an unset key is a stack trace in the
  /// caller's own code rather than a 401 a round trip away.
  void _requireKey() {
    if (_apiKey.isEmpty) {
      throw const KaaljyotiException(
        code: KjErrorCode.invalidKey,
        message: 'No API key configured',
        docs: 'https://kaaljyoti.com/api/docs/errors#invalid_key',
      );
    }
  }

  Uri _url(String path,
      [Map<String, String?> query = const <String, String?>{}]) {
    final parameters = <String, String>{};
    for (final entry in query.entries) {
      final value = entry.value;
      if (value != null) parameters[entry.key] = value;
    }
    if (_publishable) parameters['key'] = _apiKey;
    final url = Uri.parse('$baseUrl$path');
    return parameters.isEmpty ? url : url.replace(queryParameters: parameters);
  }

  Map<String, String> _headersFor(String accept, {required bool hasBody}) {
    // The caller's headers go on first so that nothing they pass can replace
    // the key, the client tag or the `Accept` this call depends on.
    final result = <String, String>{...headers};
    // Only on a body: a `Content-Type` on a GET buys a CORS preflight in a
    // browser and says nothing true about the request.
    if (hasBody) result['Content-Type'] = acceptJson;
    result['Accept'] = accept;
    result['X-KJ-Client'] = clientTag;
    if (!_publishable) result['Authorization'] = 'Bearer $_apiKey';
    return result;
  }

  Future<KjResult<T, M>> _send<T, M>({
    required String path,
    required String method,
    required Uri url,
    required String accept,
    required T Function(Object? json) decode,
    required M Function(Object? json) decodeMeta,
    String? body,
  }) async {
    final requestHeaders = _headersFor(accept, hasBody: body != null);
    // Each reason has its own budget: a 429 is the gateway pacing us and is
    // worth obeying repeatedly, while an `engine_error` or a dead socket is
    // worth exactly one more try before the caller hears about it.
    var rateLimitBudget = maxRetries;
    var engineBudget = maxRetries < 1 ? 0 : 1;
    var networkBudget = maxRetries < 1 ? 0 : 1;

    while (true) {
      http.Response response;
      try {
        final pending = body == null
            ? _client.get(url, headers: requestHeaders)
            : _client.post(url, headers: requestHeaders, body: body);
        response = await pending.timeout(timeout);
      } on TimeoutException {
        if (networkBudget > 0) {
          networkBudget -= 1;
          continue;
        }
        throw KaaljyotiException(
          code: KjErrorCode.timeout,
          message: 'No answer within ${timeout.inMilliseconds} ms',
        );
      } on Exception catch (error) {
        if (networkBudget > 0) {
          networkBudget -= 1;
          continue;
        }
        throw KaaljyotiException(
          code: KjErrorCode.networkError,
          // `ClientException` prints the URL, which for a publishable key
          // holds the key; only the reason is kept.
          message: error is http.ClientException ? error.message : '$error',
        );
      }

      final requestId = response.headers[_requestIdHeader];
      if (response.statusCode == 429 && rateLimitBudget > 0) {
        rateLimitBudget -= 1;
        await _sleep(_retryDelay(response.headers['retry-after']));
        continue;
      }

      final rateLimit = RateLimit(
        limit: _headerInt(response, _limitHeader),
        remaining: _headerInt(response, _remainingHeader),
        reset: _headerInt(response, _resetHeader),
      );
      final plan = response.headers[_planHeader];
      final cachedHeader = response.headers[_cacheHeader] == 'hit';
      final credits = _headerInt(response, _creditsHeader);
      final creditsRemaining = _headerInt(response, _creditsRemainingHeader);
      final ok = response.statusCode >= 200 && response.statusCode < 300;

      // A PDF is bytes, not text: decoding it as UTF-8 would corrupt it. Like
      // the SVG below, only a success is a file; a failure is an envelope.
      if (ok && accept == acceptPdf) {
        final file = PdfFile(
          // `bodyBytes`, never `body`: the bytes exactly as they arrived.
          bytes: response.bodyBytes,
          contentType: response.headers['content-type'] ?? acceptPdf,
          filename: filenameOf(response.headers['content-disposition']),
          credits: credits,
        );
        return KjResult<T, M>(
          data: _decode(decode, file, response, requestId),
          meta: _decode(decodeMeta, null, response, requestId),
          requestId: requestId,
          plan: plan,
          cached: cachedHeader,
          credits: credits,
          creditsRemaining: creditsRemaining,
          rateLimit: rateLimit,
        );
      }

      // A chart asked for as SVG comes back as the document itself — but only
      // when it succeeded. A failure is an envelope whatever `Accept` said.
      if (ok && accept != acceptJson) {
        return KjResult<T, M>(
          data: _decode(decode, _text(response), response, requestId),
          meta: _decode(decodeMeta, null, response, requestId),
          requestId: requestId,
          plan: plan,
          cached: cachedHeader,
          credits: credits,
          creditsRemaining: creditsRemaining,
          rateLimit: rateLimit,
        );
      }

      Object? parsed;
      try {
        parsed = jsonDecode(_text(response));
      } on FormatException {
        // An HTML error page from a proxy, a truncated body, an empty 502.
        throw KaaljyotiException(
          code: KjErrorCode.badResponse,
          message: 'Response was not JSON',
          status: response.statusCode,
          requestId: requestId,
        );
      }

      final envelope = parsed is Map<String, dynamic> ? parsed : null;

      if (envelope?['status'] == 'error' || !ok) {
        final error = _errorFrom(envelope, response, requestId);
        // One more try for our own fault, none for the caller's.
        if (error.code == kEngineError && engineBudget > 0) {
          engineBudget -= 1;
          continue;
        }
        throw error;
      }

      // Health is the one answer with no envelope around it: it must keep
      // working while the service is disabled, so it carries no `meta` and no
      // key was needed to ask.
      if (path == healthPath) {
        return KjResult<T, M>(
          data: _decode(decode, parsed, response, requestId),
          meta: _decode(decodeMeta, null, response, requestId),
          requestId: requestId,
          plan: plan,
          cached: cachedHeader,
          credits: credits,
          creditsRemaining: creditsRemaining,
          rateLimit: rateLimit,
        );
      }

      if (envelope == null ||
          envelope['status'] != 'ok' ||
          !envelope.containsKey('data')) {
        throw KaaljyotiException(
          code: KjErrorCode.badResponse,
          message: 'Response was not a Kaal Jyoti envelope',
          status: response.statusCode,
          requestId: requestId,
        );
      }

      final meta = envelope['meta'];
      return KjResult<T, M>(
        data: _decode(decode, envelope['data'], response, requestId),
        meta: _decode(decodeMeta, meta, response, requestId),
        requestId: requestId,
        plan: plan,
        // `meta.cached` is the gateway's own word for it; the header is the
        // only signal on the answers that carry no meta.
        cached: (meta is Map<String, dynamic> && meta['cached'] == true) ||
            cachedHeader,
        credits: credits,
        creditsRemaining: creditsRemaining,
        rateLimit: rateLimit,
      );
    }
  }

  /// `package:http` decodes a body with no `charset` as latin-1, which turns
  /// every Devanagari name into mojibake. The API is UTF-8 throughout.
  String _text(http.Response response) => utf8.decode(response.bodyBytes);

  /// Runs a generated `fromJson` and turns its complaint into a `bad_response`.
  ///
  /// A payload the schema did not promise is the API's problem or ours, never
  /// a `TypeError` the caller has to interpret.
  R _decode<R>(
    R Function(Object? json) decoder,
    Object? json,
    http.Response response,
    String? requestId,
  ) {
    try {
      return decoder(json);
    } on Object catch (error) {
      throw KaaljyotiException(
        code: KjErrorCode.badResponse,
        message: 'Response did not match the schema: $error',
        status: response.statusCode,
        requestId: requestId,
      );
    }
  }

  int? _headerInt(http.Response response, String name) {
    final raw = response.headers[name];
    return raw == null ? null : int.tryParse(raw);
  }

  /// Seconds to wait, from a `Retry-After` header that may be anything.
  static Duration _retryDelay(String? header) {
    final seconds = header == null ? null : int.tryParse(header.trim());
    if (seconds == null || seconds <= 0) return _defaultRetry;
    return seconds > _maxRetry.inSeconds
        ? _maxRetry
        : Duration(seconds: seconds);
  }

  /// The gateway's own error, with what the headers add to it.
  KaaljyotiException _errorFrom(
    Map<String, dynamic>? envelope,
    http.Response response,
    String? requestId,
  ) {
    final error = envelope?['error'];
    final body =
        error is Map<String, dynamic> ? error : const <String, dynamic>{};
    final retryAfter = response.headers['retry-after'];
    return KaaljyotiException(
      code: body['code'] is String
          ? body['code'] as String
          : KjErrorCode.badResponse,
      message: body['message'] is String
          ? body['message'] as String
          : 'Request failed',
      status: response.statusCode,
      field: body['field'] is String ? body['field'] as String : null,
      docs: body['docs'] is String ? body['docs'] as String : null,
      requestId: requestId,
      retryAfter: retryAfter == null ? null : _retryDelay(retryAfter),
    );
  }
}
