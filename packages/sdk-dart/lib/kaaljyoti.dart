/// Typed Dart client for the [Kaal Jyoti API](https://kaaljyoti.com/api).
///
/// ```dart
/// final kj = Kaaljyoti(apiKey: Platform.environment['KAALJYOTI_API_KEY']!);
///
/// final answer = await kj.kundli.get(KundliRequest(
///   birth: Birth(
///     datetime: '1990-05-14T10:30:00', // the clock on the wall at the place
///     timezone: 'Asia/Kolkata',
///     latitude: 28.6139,
///     longitude: 77.209,
///   ),
///   options: CalculationOptions(language: ['en', 'hi']),
/// ));
///
/// print('${answer.data.lagnaSign.name} · ${answer.meta.timezone.source}');
/// kj.close();
/// ```
///
/// The models are generated from `openapi/openapi.json` by
/// `pnpm --filter sdk-dart run gen`, so the classes and the API cannot drift
/// apart without CI saying so. The names match `@kaaljyoti/sdk`, the
/// TypeScript SDK, shape for shape.
///
/// Two rules the types cannot express:
///
/// - `Birth.datetime` is a **wall clock** — the time on the clock where the
///   birth happened, not UTC and not the device's zone. See [wallClock].
/// - `Birth` takes `timezone` **or** `utcOffset` **or** neither, never both.
///   With neither, the API derives the zone from the coordinates and
///   `Meta.timezone.source` answers `derived`.
library;

export 'src/client.dart';
export 'src/errors.dart';
// Only the exception: the `as…` cast helpers beside it are how the generated
// `fromJson` bodies read a payload, not something a caller should see.
export 'src/generated/_json.dart' show KaaljyotiFormatException;
export 'src/generated/labelled_id.dart';
export 'src/generated/models.dart';
export 'src/generated/version.dart';
export 'src/result.dart';
// `Transport` is exported for `Kaaljyoti.withTransport` — a custom retry sleep
// in a test, or a shell that wants the envelope handling without the
// namespaces. `src/generated/operations.dart` stays internal: it is the table
// the client and the contract test walk, not something a caller reaches for.
export 'src/transport.dart';
export 'src/wallclock.dart';
