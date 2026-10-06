# `@kaaljyoti/sdk` — design decisions

**Date:** 22 September 2026 · **Status:** settled before code · **Scope:** Tier 2, the TypeScript/Node SDK. The MCP server in `kaaljyoti-api` moves onto it later.

## What it is

```ts
import { Kaaljyoti } from '@kaaljyoti/sdk';

const kj = new Kaaljyoti({ apiKey: process.env.KAALJYOTI_API_KEY });

const { data, meta } = await kj.kundli.get({
  birth: {
    datetime: '1990-05-14T10:30:00',
    timezone: 'Asia/Kolkata',
    latitude: 28.6139,
    longitude: 77.209,
  },
});
console.log(data.lagna_sign.name, meta.timezone.source);
```

One class, one method per endpoint, every request and response typed from the OpenAPI document. No calculation, no caching of answers, no hidden state beyond the key.

## Layout

```
openapi/openapi.json                 the one snapshot every generator reads (refresh: scripts/refresh-openapi.mjs)
packages/sdk-ts/
  src/
    generated/openapi.d.ts           openapi-typescript output, committed; `pnpm gen` regenerates, CI checks it is current
    types.ts                         friendly aliases: KundliRequest, KundliDocument, Meta, … derived from `paths`/`components`
    errors.ts                        KaaljyotiError { code, status, message, field, docs, requestId, retryAfter }
    transport.ts                     the fetch: key placement by prefix, headers, timeout, retries, envelope → result | error
    client.ts                        class Kaaljyoti with the namespaces below
    wallclock.ts                     toWallClock(date, zone) and friends — the timezone helper the plan asks for
    index.ts
  scripts/build.mjs                  esbuild: dist/index.js (ESM), dist/index.cjs (CJS), dist/types via tsc
  scripts/gen.mjs                    openapi-typescript → src/generated/openapi.d.ts (`--check` for CI)
  test/                              vitest, node environment, fetch stubbed; contract test walks openapi.json
```

## Decisions

1. **Surface mirrors the paths, grouped by tag.** `kj.health()`, `kj.reference(list, { language })`, `kj.timezone({ lat, lon, datetime })`; `kj.kundli.get / chart / dasha / vargas / chalit / yogas / shadbala / bhavaBala / ashtakavarga / grahaDrishti / maitri / pace / specialLagnas / tripataki / sarvatobhadra / nakshatra28 / sadeSati / events / kotaChakra`; `kj.panchang.daily / muhurta / month`; `kj.ephemeris.month`; `kj.calendar.vikramSamvat`; `kj.jaimini.karakas / arudhaPadas / aspects / karakamsha`; `kj.kp.chart`; `kj.varshphal.get / bala / sahams / yogas / dasha`; `kj.transit.now / scan / events`; `kj.match.ashtakoot / compare / batch`; `kj.reports.lagna / nakshatra / houseLords / grahas / yogas / vimshottari / varshphal / lifeAreas / kundli`; `kj.horoscope(body)`; `kj.places({ q, country, limit, language })`; `kj.pdf.kundli / match / varshphal / panchangMonth`. camelCase of the last path segment (`house-lords` → `houseLords`, `life-areas` → `lifeAreas`); the base document of a family is `get`, and a family with one member (`horoscope`) is a top-level method. The one exception is `/v1/pdf/panchang/month`, which is `panchangMonth` because `kj.pdf.month` would not say a month of what. That is all 57 operations, and a contract test proves the count.

2. **Methods return the envelope, not the bare data.** `{ data, meta, requestId, plan, cached, credits, creditsRemaining, rateLimit: { limit, remaining, reset } }`. `credits` (`X-KJ-Credits`: what the request cost, the same number as `meta.credits`) and `creditsRemaining` (`X-KJ-Credits-Remaining`, which the API sends to secret keys only, so `null` on a publishable key) sit beside them, each `null` when its header is absent. The docs teach `answer.data` and `meta` is the thing a user shows when asked why a number is what it is; hiding it behind a second call would be a disservice. `kj.kundli.chart(body, { format: 'svg' })` returns `{ data: string, … }` from the `image/svg+xml` variant, and the `kj.pdf.*` methods return `{ data: PdfFile, meta: null, … }`: the bytes as a `Uint8Array` (never decoded as text), with `filename` from `Content-Disposition` and `credits` from `X-KJ-Credits`; `cached` reads `X-KJ-Cache`. A failed PDF is the usual JSON error and throws.

3. **Key placement follows the prefix.** `kj_live_…` and `kj_test_…` go in `Authorization: Bearer`; `kj_pub_…` goes in `?key=` (a browser will not let a page set `Authorization` on a cross-origin call, and the gateway refuses secret keys in the query). A key with no known prefix is sent as Bearer, with a `KaaljyotiError('invalid_key')` thrown before the network only when the key is empty. Nothing in the SDK ever logs the key.

4. **Retries are bounded and honest.** Default `maxRetries: 2`. Retry on `429` after `Retry-After` (cap 30 s), on `500 engine_error` once, on a network failure once; every request is a pure calculation so a retried POST is safe. `402`, `400`, `401`, `403`, `422` never retry. `retryAfter` is exposed on the error for callers who set `maxRetries: 0`.

5. **Errors are one class.** `KaaljyotiError` with `code` (the contract), `status`, `message`, `field`, `docs`, `requestId`, `retryAfter`. Client-side failures use `network_error`, `timeout`, `bad_response`. `isKaaljyotiError(x)` guard exported. Branch on `code`, never on `message` — the docs' rule.

6. **Batch results are not thrown.** `match.batch` returns `results[]` where each pair has `data` or `error`; a pair's error stays a value because the others were answered and charged.

7. **`X-KJ-Client: sdk-ts/<version>`** by default; `client` option overrides it for shells built on the SDK (the MCP server, the WordPress plugin's SSR mode) so usage attributes to them.

8. **Runtime: Node 18+, browsers, edge.** Global `fetch`, `AbortController` and `Headers` only; `fetch` is injectable for tests and for custom agents. `timeoutMs` default 30 000. ESM plus a CJS build for Node projects that still `require()`.

9. **The wall-clock helper.** `toWallClock(date: Date, timeZone: string)` → `'YYYY-MM-DDTHH:MM:SS'` via `Intl.DateTimeFormat`, because the single most common integration bug the docs describe is sending an instant where a wall clock belongs. Plus `fromWallClock(wall, offset)` for the reverse when a caller has `meta.timezone.utc_offset`. Pure functions, no dependency.

10. **Types are generated, aliases are hand-named.** `openapi-typescript` output is committed under `src/generated/` so a reader of the package sees the shapes; `types.ts` exports readable names (`KundliRequest`, `KundliDocument`, `PanchangRequest`, …) derived from it, so nobody writes `paths['/v1/kundli']['post']…` in application code. `pnpm gen --check` in CI fails when the snapshot and the generated file disagree.

11. **Versioning.** Package `0.1.0`, tag `sdk-ts-v0.1.0`, `engines.node >= 18`. The README states which API document version (`info.version`) the release was generated from.

12. **Tests.** Unit tests with a stubbed `fetch` against recorded fixtures (key placement, headers, retries with fake timers, error mapping, svg variant, batch errors as values, wall-clock helper against known DST cases); a contract test that walks `openapi/openapi.json` and asserts every operation is reachable through the client and hits the right method and path; an opt-in staging smoke (`KJ_SMOKE=1 KJ_API_KEY=…`) that runs a handful of endpoints.

## Out of scope for 0.1.0

Request validation on the client (the API validates and refuses for free), response caching, pagination helpers (nothing paginates), the MCP server migration.
