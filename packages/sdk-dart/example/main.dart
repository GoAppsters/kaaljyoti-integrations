/// The README's quick start, runnable.
///
/// ```sh
/// export KAALJYOTI_API_KEY="kj_live_…"   # or kj_test_… / kj_pub_…
/// dart run example/main.dart
/// ```
///
/// The SDK does not read the environment for you — a process with two keys in
/// it should not be able to pick the wrong one by accident — so the key is
/// read here and passed in explicitly.
library;

import 'dart:io';

import 'package:kaaljyoti/kaaljyoti.dart';

Future<void> main() async {
  final apiKey = Platform.environment['KAALJYOTI_API_KEY'];
  if (apiKey == null || apiKey.isEmpty) {
    stderr.writeln('Set KAALJYOTI_API_KEY first: '
        'https://kaaljyoti.com/api/dashboard/keys');
    exitCode = 64; // EX_USAGE
    return;
  }

  final kj = Kaaljyoti(apiKey: apiKey);

  try {
    final answer = await kj.kundli.get(
      KundliRequest(
        birth: Birth(
          // A wall clock: the time on the clock where the birth happened, not
          // UTC and not this machine's zone. `wallClock(dateTime)` writes one.
          datetime: '1990-05-14T10:30:00',
          // `timezone` or `utcOffset` or neither — never both.
          timezone: 'Asia/Kolkata',
          latitude: 28.6139,
          longitude: 77.209,
          place: 'New Delhi',
        ),
        options: CalculationOptions(ayanamsa: 'lahiri', language: ['en']),
      ),
    );

    final data = answer.data;
    stdout.writeln('Lagna     ${data.lagnaSign.name} (${data.ascendantDms})');
    stdout.writeln('Moon      ${data.moonSign.name}, '
        '${data.moonNakshatra.name}');
    stdout.writeln('Zone      ${answer.meta.timezone.name} '
        '${answer.meta.timezone.utcOffset} '
        '(${answer.meta.timezone.source})');
    stdout.writeln('Ayanamsa  ${answer.meta.ayanamsa.id}');
    stdout.writeln('Cached    ${answer.cached}  ·  '
        'request ${answer.requestId}');
    stdout.writeln('Remaining ${answer.rateLimit.remaining}'
        '/${answer.rateLimit.limit} this minute');
  } on KaaljyotiException catch (error) {
    // Branch on `code`, never on `message`.
    stderr.writeln('${error.code}: ${error.message}');
    if (error.field != null) stderr.writeln('  field: ${error.field}');
    if (error.docs != null) stderr.writeln('  docs:  ${error.docs}');
    if (error.isRetryable) {
      stderr.writeln('  worth trying again in '
          '${error.retryAfter?.inSeconds ?? 60}s');
    }
    exitCode = 1;
  } finally {
    // Releases the HTTP client the SDK created for itself.
    kj.close();
  }
}
