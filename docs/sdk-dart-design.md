# `kaaljyoti` (Dart) — design decisions

**Date:** 22 September 2026 · **Status:** settled before code · **Scope:** Tier 2, the Dart/Flutter SDK. The Kaal Jyoti app can dogfood it through a path dependency; pub.dev publication waits on the owner's go-ahead, like every other listing.

## What it is

```dart
import 'package:kaaljyoti/kaaljyoti.dart';

final kj = Kaaljyoti(apiKey: Platform.environment['KAALJYOTI_API_KEY']!);

final answer = await kj.kundli.get(KundliRequest(
  birth: Birth(datetime: '1990-05-14T10:30:00', timezone: 'Asia/Kolkata', latitude: 28.6139, longitude: 77.209),
));
print('${answer.data.lagnaSign.name} · ${answer.meta.timezone.source}');
```

The same shape as `@kaaljyoti/sdk`: one client, a namespace per tag, a method per operation, typed requests and documents, the envelope returned whole.

## Layout

```
packages/sdk-dart/
  pubspec.yaml                    name kaaljyoti, sdk >=3.6.0 <4.0.0, deps: http ^1.2; dev: lints, test
  package.json                    pnpm scripts only (gen, gen:check, test, analyze) so the workspace gates include Dart
  tool/gen.mjs                    Node: openapi/openapi.json → lib/src/generated/*.dart, then `dart format`
  lib/kaaljyoti.dart              the public library
  lib/src/generated/              models.dart (every request + document class), labelled_id.dart, paths.dart (operation table)
  lib/src/client.dart             class Kaaljyoti + namespaces
  lib/src/transport.dart          key placement, headers, timeout, retries, envelope → KjResult | KaaljyotiException
  lib/src/errors.dart
  lib/src/result.dart             KjResult<T, M>, RateLimit
  lib/src/wallclock.dart
  test/                           `dart test`: models round-trip fixtures, transport (MockClient), contract walk of openapi.json, opt-in smoke
  example/main.dart
  README.md
```

## Decisions

1. **Our own generator, not openapi-generator.** The Dart output of openapi-generator drags in `built_value` or `dio` and hundreds of files; `json_serializable` would force `build_runner` on every consumer. `tool/gen.mjs` reads the shared snapshot and emits plain Dart: immutable classes with `final` fields, a `fromJson(Map<String, dynamic>)` factory and `toJson()`, nested anonymous objects named by their path (`KundliDocumentBirth`, `KundliDocumentPositionsValue`), `additionalProperties` as `Map<String, T>`, nullable as `T?`, `anyOf [string, null]` as `String?`, `LabelledId` shared, and `additionalProperties: true` objects as `Map<String, dynamic>`. Generated files are committed; `gen:check` compares in CI. Field names are camelCase in Dart and snake_case on the wire, mapped inside `fromJson`/`toJson`.

2. **Requests are classes too.** `KundliRequest(birth: Birth(...), options: CalculationOptions(...))`. Only schema-required fields are required constructor parameters; nulls are omitted from `toJson()` so the gateway's `additionalProperties: false` and "either timezone or utc_offset" rules are not tripped by explicit nulls.

3. **Envelope returned whole.** `KjResult<T>` with `data`, `meta` (`Meta`, or `BatchMeta` for batch, `null` for health, SVG and PDF), `requestId`, `plan`, `cached`, `credits`, `creditsRemaining`, `rateLimit`. `credits` (`X-KJ-Credits`: what the request cost, the same number as `meta.credits`) and `creditsRemaining` (`X-KJ-Credits-Remaining`, which the API sends to secret keys only, so `null` on a publishable key) sit beside them, each `null` when its header is absent. The `kj.pdf.kundli / match / varshphal / panchangMonth` methods (`/v1/pdf/panchang/month` is `panchangMonth` because `kj.pdf.month` would not say a month of what) return `KjResult<PdfFile, Null>`: the bytes as a `Uint8List` read from `bodyBytes` (never decoded as text), with `filename` from `Content-Disposition` and `credits` from `X-KJ-Credits`; `cached` reads `X-KJ-Cache`. A failed PDF is the usual JSON error and throws. With `kj.transit.events` that makes 58 operations, and the contract test proves the count.

4. **Key placement by prefix**, retries and errors identical to the TypeScript design (decisions 3–6 there): Bearer for `kj_live_`/`kj_test_`, `?key=` for `kj_pub_`; one retry policy (429 on `Retry-After` up to `maxRetries`, `engine_error` and network failures once); `KaaljyotiException` with `code`, `status`, `field`, `docs`, `requestId`, `retryAfter`; batch pair errors stay values.

5. **`package:http`**, injectable `Client` for tests and for Flutter's platform clients. `X-KJ-Client: sdk-dart/<version>`; the version constant is written by the generator from `pubspec.yaml`. Timeout default 30 s.

6. **Wall clocks without a tz database.** Dart has no IANA zone data; `wallClock(DateTime)` formats a `DateTime`'s own fields as `YYYY-MM-DDTHH:MM:SS` (the caller passes a DateTime whose fields already are the wall clock), and `fromWallClock(wall, utcOffset)` returns a UTC `DateTime` using the offset the API reports in `meta.timezone`. Zone names are resolved by the API (`kj.timezone(...)`), never locally.

7. **Chart SVG** via `kj.kundli.chartSvg(request)` returning `KjResult<String>`; `kj.kundli.chart(request)` returns the JSON `ChartDocument`.

8. **Tests.** `dart test` with `MockClient`; the contract test reads `openapi/openapi.json` and asserts every operation is exercised by the client with the right verb and path; the models test round-trips every fixture through `fromJson`/`toJson`; a smoke test runs against staging only with `KJ_SMOKE=1` and `KJ_API_KEY` (publishable keys add an `Origin` header). `dart analyze` with `package:lints/recommended.yaml` plus `prefer_single_quotes` (the app's rule) must be clean.

9. **Versioning.** `0.1.0`, tag `sdk-dart-v0.1.0`. `pana`-style checks (a `CHANGELOG.md`, an `example/`, a description) are met so a later `dart pub publish --dry-run` passes.

## Out of scope for 0.1.0

pub.dev publication, Freezed/`copyWith` conveniences, an IANA zone database, request validation.
