# `kaaljyoti/sdk` (PHP) — design decisions

**Date:** 22 September 2026 · **Status:** settled before code · **Scope:** Tier 2, the PHP SDK. The WordPress plugin's server-side mode and any Laravel integration build on it. Packagist lists it through the read-only mirror `amitverm/kaaljyoti-php`, pushed by CI from `packages/sdk-php` on every `sdk-php-v*` tag (distribution plan §5).

## What it is

```php
use Kaaljyoti\Client;
use Kaaljyoti\Models\{KundliRequest, Birth};

$kj = new Client(apiKey: getenv('KAALJYOTI_API_KEY'));

$answer = $kj->kundli->get(new KundliRequest(
    birth: new Birth(datetime: '1990-05-14T10:30:00', timezone: 'Asia/Kolkata', latitude: 28.6139, longitude: 77.209),
));
echo $answer->data->lagnaSign->name, ' · ', $answer->meta->timezone->source;
```

The same shape as the TypeScript and Dart SDKs: one client, a namespace per tag, a method per operation, typed requests and documents, the envelope returned whole.

## Layout

```
packages/sdk-php/
  composer.json                 name kaaljyoti/sdk, php >=8.1, ext-json; ext-curl suggested; dev: phpunit ^11, phpstan ^2
  package.json                  pnpm hooks (gen, gen:check) so the workspace gate covers the generator
  tool/gen.mjs                  Node: openapi/openapi.json → src/Generated/*.php (models, Operations, Version)
  src/Client.php                the client and its namespaces
  src/Transport.php             key placement, headers, timeout, retries, envelope → Result | KaaljyotiException
  src/Http/HttpClient.php       interface: send(Request): Response — the one seam WordPress and PSR-18 plug into
  src/Http/CurlClient.php       default implementation on ext-curl
  src/Http/Psr18Client.php      adapter for any PSR-18 client + PSR-17 factories, loaded only when those interfaces exist
  src/Result.php, RateLimit.php, KaaljyotiException.php, WallClock.php
  src/Generated/Models/*.php    one final readonly class per schema, fromArray()/toArray()
  src/Generated/LabelledId.php, Operations.php, Version.php
  tests/                        PHPUnit: models round-trip fixtures, transport with a recording HttpClient, contract walk of openapi.json, opt-in smoke
  examples/quickstart.php
  README.md, CHANGELOG.md, LICENSE
```

## Decisions

1. **Zero runtime dependencies.** The WordPress plugin bundles this package, and a vendor tree with Guzzle inside a plugin collides with every other plugin that bundles a different Guzzle. So HTTP goes through a two-method interface, `HttpClient`, with a `CurlClient` default and a PSR-18 adapter for frameworks that already have a client. WordPress implements the interface over `wp_remote_request` in the plugin, not here.

2. **PHP 8.2 minimum.** `final readonly class` models, enums and named arguments make the requests readable; 8.1 reached end of life in December 2025 and WordPress itself recommends 8.2+, so hosts below that are the exception the plugin's readme will name.

3. **Generated models, our generator.** `tool/gen.mjs` follows the Dart generator's rules (same naming table, same shape-based dedupe, `LabelledId` shared, `additionalProperties` as `array<string, T>`, `additionalProperties: true` as `array<string, mixed>`, `null`-only fields as `mixed`, a string-or-object `anyOf` such as `options.disclaimer` as a `string|Disclaimer` union): one `final readonly class` per schema with a promoted constructor, `static fromArray(array $data): self` and `toArray(): array` that omits nulls. PHPDoc `@param`/`@var` generics so PHPStan understands the arrays. Namespace `Kaaljyoti\Models`. Generated files are committed; `gen:check` diffs.

4. **Envelope returned whole.** `Result<T, M>` (a plain class with `data`, `meta`, `requestId`, `plan`, `cached`, `credits`, `creditsRemaining`, `rateLimit`; generic via PHPDoc templates). `credits` (`X-KJ-Credits`: what the request cost, the same number as `meta.credits`) and `creditsRemaining` (`X-KJ-Credits-Remaining`, which the API sends to secret keys only, so `null` on a publishable key) sit beside them, each `null` when its header is absent. `meta` is `Meta`, `BatchMeta`, `ReferenceMeta`, `TimezoneMeta`, `PlacesMeta` or `null` (health, SVG, PDF).

5. **Key placement, retries and errors** identical to the TypeScript design (decisions 3–6 there): `kj_pub_` in `?key=`, otherwise Bearer; 429 on `Retry-After` up to `maxRetries` (default 2, cap 30 s), `engine_error` and transport failures once; `KaaljyotiException` with `code`, `status`, `field`, `docs`, `requestId`, `retryAfter`, `isRetryable()`. The retry sleep is injectable for tests. Batch pair errors stay values.

6. **`X-KJ-Client: sdk-php/<version>`**, overridable (`wordpress/<version>` from the plugin). Timeout default 30 s. Bodies are decoded as UTF-8 via `json_decode(..., JSON_THROW_ON_ERROR)`; PHP strings are bytes, so nothing is re-encoded.

7. **Wall clocks.** `WallClock::fromDateTime(DateTimeInterface $dt, string $zone)` uses PHP's own zone database (`DateTimeZone`), so unlike Dart this one can convert an instant; `WallClock::toDateTime(string $wall, string $utcOffset)`; `WallClock::format(DateTimeInterface)`.

8. **SVG and PDF.** SVG via `$kj->kundli->chartSvg($request)` returning `Result<string, null>`. The four PDF routes are `$kj->pdf->kundli / match / varshphal / panchangMonth` (`/v1/pdf/panchang/month` is `panchangMonth` because `$kj->pdf->month()` would not say a month of what), each returning `Result<PdfFile, null>`: `bytes` is the body as the raw PHP string (never decoded as text), with `filename` from `Content-Disposition` (the RFC 6266 `filename*` form preferred), `credits` from `X-KJ-Credits` and `cached` from `X-KJ-Cache`. A failed PDF is the usual JSON error and throws. With these the client covers all 58 operations, and the contract test proves the count.

9. **Tests.** PHPUnit 11 with a `RecordingHttpClient`; contract test walks `openapi/openapi.json` (every operation reachable, right verb and path, `key` never in a secret-key URL); fixtures round-trip through `fromArray`/`toArray`; smoke against staging with `KJ_SMOKE=1` and `KJ_API_KEY` (publishable keys add `Origin`). PHPStan at level 9 on `src/` must be clean; `php -l` on every file.

10. **Versioning and the mirror.** `0.1.0`, tag `sdk-php-v0.1.0`; the mirror workflow (`.github/workflows/mirror-php.yml`) runs `git subtree split --prefix=packages/sdk-php` and force-pushes the result to `amitverm/kaaljyoti-php` with the same tag, using a deploy key secret (`PHP_MIRROR_DEPLOY_KEY`, owner-gated). `composer.json` at the package root is what Packagist reads from the mirror.

## Out of scope for 0.1.0

Laravel service provider, PSR-16 caching, request validation.
