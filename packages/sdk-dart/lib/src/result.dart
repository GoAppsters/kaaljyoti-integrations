/// What a successful call resolves to: the envelope, flattened by one level.
library;

import 'dart:typed_data';

/// The rate-limit bucket, as the last answer left it.
///
/// Every field is nullable because a proxy in front of the gateway may strip
/// the headers, and a missing number must not read as `0`.
class RateLimit {
  /// Builds a bucket. [unknown] is the one to use when no headers arrived.
  const RateLimit({this.limit, this.remaining, this.reset});

  /// No headers, therefore nothing known. Not "no requests left".
  static const RateLimit unknown = RateLimit();

  /// `X-RateLimit-Limit`: requests a minute for this key.
  final int? limit;

  /// `X-RateLimit-Remaining`: tokens left in the bucket.
  final int? remaining;

  /// `X-RateLimit-Reset`: unix seconds at which it refills.
  final int? reset;

  @override
  String toString() => 'RateLimit($remaining/$limit, resets $reset)';
}

/// A successful answer: `data` and `meta` together, plus the headers.
///
/// `meta` comes back with the data rather than a call away because it is how
/// an application answers "why is this number what it is" — which ayanamsa,
/// which zone, which engine version.
///
/// `M` is [Meta] for almost everything, `BatchMeta` for `match.batch`, a loose
/// `Map<String, dynamic>` for the reference tables, and `Null` for the answers
/// that carry no meta at all: `health()`, a chart asked for as SVG, and a PDF.
class KjResult<T, M> {
  /// Builds a result. Only [data] and [meta] are always present.
  const KjResult({
    required this.data,
    required this.meta,
    this.requestId,
    this.plan,
    this.cached = false,
    this.credits,
    this.creditsRemaining,
    this.rateLimit = RateLimit.unknown,
  });

  /// `data` from the envelope — or the SVG or the PDF itself, when one was
  /// asked for.
  final T data;

  /// `meta` from the envelope, or `null` on the answers that carry none.
  final M meta;

  /// `X-KJ-Request-Id`. Quote it to support and they can find the call.
  final String? requestId;

  /// `X-KJ-Plan`: the plan this answer was served under.
  final String? plan;

  /// Whether the gateway served this from its 24-hour cache. Costs the same
  /// credits.
  final bool cached;

  /// `X-KJ-Credits`: what this request cost — the same number as
  /// `meta.credits`, and the only one on an SVG or a PDF. `null` on the
  /// answers that are free (health, time zone, reference tables).
  final int? credits;

  /// `X-KJ-Credits-Remaining`: credits left this month, credit packs included.
  /// Sent to secret keys only, so always `null` on a publishable key.
  final int? creditsRemaining;

  /// The bucket as this answer left it. [RateLimit.unknown] when unreported.
  final RateLimit rateLimit;

  @override
  String toString() => 'KjResult<$T>(cached: $cached, requestId: $requestId)';
}

/// A PDF, as the `/v1/pdf/*` routes answer one: the bytes and what the
/// headers say about them.
class PdfFile {
  /// Builds a file. Only [bytes] and [contentType] are always present.
  const PdfFile({
    required this.bytes,
    required this.contentType,
    this.filename,
    this.credits,
  });

  /// The file itself, exactly as it arrived — ready for `File.writeAsBytes`.
  final Uint8List bytes;

  /// `Content-Type`: `application/pdf`.
  final String contentType;

  /// From `Content-Disposition`: `kundli-ravi-kumar.pdf`, or after the date,
  /// year or month when the body had no `name`. `null` without the header.
  final String? filename;

  /// `X-KJ-Credits`: what the PDF cost (1,000 for a kundli, 500 for the
  /// others), or `null` without the header.
  final int? credits;

  @override
  String toString() => 'PdfFile($filename, ${bytes.length} bytes)';
}
