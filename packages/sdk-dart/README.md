# kaaljyoti

The typed Dart client for the [Kaal Jyoti API](https://kaaljyoti.com/api) —
kundli, panchang, dasha, vargas, KP, Jaimini, varshphal, transits, matching,
written readings, the horoscope and printable PDFs.
One class, one method per endpoint, every request and response generated from
the API's own OpenAPI document. No calculation happens here: the package adds
auth, retries, error mapping and the types, and gets out of the way.

Dart 3.6+, Flutter included. One dependency: `package:http`. No `build_runner`,
no code generation in your project, no `freezed`.

## 1. Install

Published to pub.dev:

```sh
dart pub add kaaljyoti
```

Until then it is a path or git dependency in your `pubspec.yaml`:

```yaml
dependencies:
  kaaljyoti:
    path: ../kaaljyoti-integrations/packages/sdk-dart
```

```yaml
dependencies:
  kaaljyoti:
    git:
      url: https://github.com/goappsters/kaaljyoti-integrations.git
      path: packages/sdk-dart
```

`example/main.dart` is the quick start below, runnable, and `CHANGELOG.md`
records what each version changed.

## 2. Quick start

```dart
import 'dart:io';

import 'package:kaaljyoti/kaaljyoti.dart';

Future<void> main() async {
  final kj = Kaaljyoti(apiKey: Platform.environment['KAALJYOTI_API_KEY']!);

  final answer = await kj.kundli.get(KundliRequest(
    birth: Birth(
      datetime: '1990-05-14T10:30:00', // wall clock at the birth place
      timezone: 'Asia/Kolkata',
      latitude: 28.6139,
      longitude: 77.209,
      place: 'New Delhi',
    ),
    options: CalculationOptions(ayanamsa: 'lahiri', language: ['en']),
  ));

  print(answer.data.ascendantDms); //  99°02'48.2"
  print(answer.data.lagnaSign.name); //  Cancer
  print(answer.meta.timezone.source); //  given

  kj.close();
}
```

Two details in that body are the whole contract, and they are the two people
get wrong:

- **`datetime` is the clock on the wall where the birth happened**, not UTC and
  not your device's zone. If you are starting from a `DateTime`, see
  [wall clocks](#7-dates-and-wall-clocks) — do not call `toIso8601String()` on
  a UTC `DateTime`.
- **Give `timezone` or `utcOffset`, or neither — never both.** With neither,
  the API derives the zone from the coordinates and `meta.timezone.source` says
  `derived`. Giving both is a `400`.

Everything else has a default, and `options` can be left out entirely. The
[quick start](https://kaaljyoti.com/api/docs/quick-start) covers the same ground
in curl and Python.

The SDK does not read the environment for you; pass `apiKey` explicitly, so a
process with two keys in it cannot pick the wrong one by accident.

## 3. Keys

Create one in the [dashboard](https://kaaljyoti.com/api/dashboard/keys). You see
the whole key once — only its SHA-256 is stored.

| Prefix      | What it is                          | Where the SDK puts it   | Safe in a Flutter app |
| ----------- | ----------------------------------- | ----------------------- | --------------------- |
| `kj_live_…` | Your production secret key          | `Authorization: Bearer` | **No**                |
| `kj_test_…` | A second secret key, for staging    | `Authorization: Bearer` | **No**                |
| `kj_pub_…`  | Publishable, locked to your origins | `?key=…` in the query   | Yes, with care        |

The prefix decides the placement; you never choose it. A browser cannot set
`Authorization` on a cross-origin request without a preflight the gateway does
not grant, so a publishable key travels in the query — and the gateway refuses a
secret key in a query string outright, which is the backstop for the mistake
this table exists to prevent.

**Flutter web needs a publishable key, and the page's origin has to be listed on
it.** A publishable key is only accepted from the origins you gave when you
created it; the match is exact and `*` is not a wildcard, so
`http://localhost:3000` and `https://app.example.com` are two entries. An origin
that is not on the list gets `403 forbidden_origin`. A publishable key also
cannot reach the heavy endpoints (`panchang.month`, `transit.scan`,
`match.batch`) or ask for `embedFont` on a chart.

**A `kj_live_…` or `kj_test_…` key in anything you ship — a mobile binary, a web
bundle, a desktop app — is a leak**, whatever `--dart-define` or obfuscation put
it there: a binary is unpackable and a bundle is readable. Put secret keys on a
server you control. Nothing in this package ever logs a key or puts one in an
exception message. See
[authentication](https://kaaljyoti.com/api/docs/authentication).

A publishable key is accepted only from a browser, because the browser's own
`Origin` header is what it is checked against. A Flutter mobile or desktop app,
a Dart VM or `curl` sends no `Origin` and gets `403 forbidden_origin`; call the
API from a server you control with a secret key instead, and let the app talk
to that server. Flutter **web** is a browser and works with a publishable key
once the site's origin is on it.

## 4. Every method

Grouped the way the paths are, so a path in the docs is a method here without
looking anything up. Every method takes one generated request class and answers
a `KjResult`. What each one costs is in
[Credits per API](https://kaaljyoti.com/api/docs/credits): **a calculation costs
1 credit, a written reading 5, a scan across time 10 or 20, a PDF 500 or
1,000**; a refusal costs nothing, and a cache hit costs the same as any other
answer. Every plan can call every method — the credits do the limiting — except
that PDFs are not on the Free plan.

### Service and reference

| Method                                            | Path                       | Answers                                          | Cost              |
| ------------------------------------------------- | -------------------------- | ------------------------------------------------ | ----------------- |
| `kj.health()`                                     | `GET /v1/health`           | `HealthDocument`, no meta                        | Free, no key      |
| `kj.reference(list, language: [...])`             | `GET /v1/reference/{list}` | `List<Map<String, dynamic>>` and `ReferenceMeta` | Free, wants a key |
| `kj.timezone(lat:, lon:, datetime:)`              | `GET /v1/timezone`         | `TimezoneDocument` and `TimezoneMeta`            | Free, wants a key |
| `kj.places(q, country:, limit:, language: [...])` | `GET /v1/places`           | `PlacesDocument` and `PlacesMeta`                | 1 credit a search |

```dart
final signs = await kj.reference('signs', language: ['en', 'hi']);
// the list is joined into the one comma-separated parameter the API takes
print(signs.data.first['name']);
print(signs.meta.language); // ['en', 'hi'] — the labels you actually got

final zone = await kj.timezone(lat: 28.6139, lon: 77.209);
print('${zone.data.name} ${zone.data.utcOffset}'); // Asia/Kolkata +05:30

final found = await kj.places('Bombay', country: 'IN', limit: 5);
final mumbai = found.data.places.first; // former names find the city
print('${mumbai.name} ${mumbai.latitude} ${mumbai.timezone}');
```

`places` answers the coordinates and the IANA `timezone`, which is everything a
`Birth` needs besides the clock. It is the one method in this group that costs
a credit, so a place field should search from the third character and on a
pause in typing, not on every key.

`list` is one of `ayanamsas`, `planets`, `signs`, `nakshatras`, `tithis`,
`yogas`, `karanas`, `vargas`, `dasha-systems`, `house-systems`,
`chalit-systems`, `transit-events`, `languages`, `credits`. `credits` is the
price list in force: one `{route, credits}` row per metered route, with `per`
(`pair` or `part`) on the two priced per unit. The rows come back as `Map<String, dynamic>`
rather than a class: each table publishes its own columns — `{id, name}` for
most, `{index, name}` for the ones the engine numbers — and the snapshot
declares them open, so a class here would be a guess that goes stale. The
`meta` beside them is the generated `ReferenceMeta` (`engine`, `language`),
whose fields the snapshot does name.

### `kj.kundli` — 1 credit each

| Method                 | Path                             | Request              |
| ---------------------- | -------------------------------- | -------------------- |
| `kundli.get`           | `POST /v1/kundli`                | `KundliRequest`      |
| `kundli.chart`         | `POST /v1/kundli/chart`          | `KundliChartRequest` |
| `kundli.chartSvg`      | `POST /v1/kundli/chart`          | `KundliChartRequest` |
| `kundli.dasha`         | `POST /v1/kundli/dasha`          | `DashaRequest`       |
| `kundli.vargas`        | `POST /v1/kundli/vargas`         | `VargasRequest`      |
| `kundli.chalit`        | `POST /v1/kundli/chalit`         | `ChalitRequest`      |
| `kundli.yogas`         | `POST /v1/kundli/yogas`          | `KundliRequest`      |
| `kundli.shadbala`      | `POST /v1/kundli/shadbala`       | `KundliRequest`      |
| `kundli.bhavaBala`     | `POST /v1/kundli/bhava-bala`     | `KundliRequest`      |
| `kundli.ashtakavarga`  | `POST /v1/kundli/ashtakavarga`   | `KundliRequest`      |
| `kundli.grahaDrishti`  | `POST /v1/kundli/graha-drishti`  | `KundliRequest`      |
| `kundli.maitri`        | `POST /v1/kundli/maitri`         | `KundliRequest`      |
| `kundli.pace`          | `POST /v1/kundli/pace`           | `KundliRequest`      |
| `kundli.specialLagnas` | `POST /v1/kundli/special-lagnas` | `KundliRequest`      |
| `kundli.tripataki`     | `POST /v1/kundli/tripataki`      | `KundliRequest`      |
| `kundli.sarvatobhadra` | `POST /v1/kundli/sarvatobhadra`  | `KundliRequest`      |
| `kundli.nakshatra28`   | `POST /v1/kundli/nakshatra28`    | `KundliRequest`      |
| `kundli.sadeSati`      | `POST /v1/kundli/sade-sati`      | `SadeSatiRequest`    |
| `kundli.events`        | `POST /v1/kundli/events`         | `SadeSatiRequest`    |
| `kundli.kotaChakra`    | `POST /v1/kundli/kota-chakra`    | `KundliRequest`      |

`chart` and `chartSvg` are the same endpoint and the same call, asked for with
a different `Accept`; see [charts as SVG](#8-charts-as-svg). `dasha` and
`kotaChakra` are never cached.

`kundli.dasha` answers one `system` — `vimshottari`, `yogini`, or the Jaimini
`chara`, `sthira` and `mandook` — as a tree `levels` deep: 1 to 5, default 2.
Levels 4 and 5 need `from`/`to`, UTC instants at most 366 days apart, which cut
the tree to that window; the running chain is always included, as deep as
`levels`.

### `kj.panchang`, `kj.ephemeris`, `kj.calendar`

| Method                  | Path                              | Cost                |
| ----------------------- | --------------------------------- | ------------------- |
| `panchang.daily`        | `POST /v1/panchang`               | 1 credit            |
| `panchang.muhurta`      | `POST /v1/panchang/muhurta`       | 1 credit            |
| `panchang.month`        | `POST /v1/panchang/month`         | 20 credits · 10/min |
| `ephemeris.month`       | `POST /v1/ephemeris/month`        | 20 credits · 10/min |
| `calendar.vikramSamvat` | `POST /v1/calendar/vikram-samvat` | 1 credit            |

`panchang.daily`, `panchang.month` and
`ephemeris.month` are about a **place and a day**, not a person, so their
requests take the place fields flat, with no `Birth`.
`panchang.month` answers one daily panchang per date — every tithi, nakshatra,
yoga and karana that touches the day with the time it ends, the vara, sunrise
and sunset, and the masa in both reckonings; `ephemeris.month` is the month of
graha positions, sidereal and tropical unless `system` narrows it.
`panchang.muhurta` takes a `MuhurtaRequest` with **either** a `birth` (the answer
then adds `taraBala` and `chandraBala`) **or** a place and an optional `date`.

The panchang's names — `tithi_name`, `yoga_name`, `karana_name`, `paksha`,
`vara`, `masa.month_name` and each of `tithis[]` — are `LabelledId`s like a
nakshatra: `id` is a lower-case slug (`shashthi`, `somavara`), `name` is in the
first language asked for, and `names` has both when two were asked for. A leap
month is `is_adhik` on the masa, not part of its name.

### `kj.jaimini`, `kj.kp` — 1 credit each

| Method                | Path                            | Request         |
| --------------------- | ------------------------------- | --------------- |
| `jaimini.karakas`     | `POST /v1/jaimini/karakas`      | `KundliRequest` |
| `jaimini.arudhaPadas` | `POST /v1/jaimini/arudha-padas` | `KundliRequest` |
| `jaimini.aspects`     | `POST /v1/jaimini/aspects`      | `KundliRequest` |
| `jaimini.karakamsha`  | `POST /v1/jaimini/karakamsha`   | `KundliRequest` |
| `kp.chart`            | `POST /v1/kp/chart`             | `KundliRequest` |

The four Jaimini sections are one document split four ways: asking for the
second section of the same chart is a cache hit, and still costs its own credit.
The five `varshphal` sections work the same way.

### `kj.varshphal` — 1 credit each, all `VarshphalRequest`

| Method             | Path                        |
| ------------------ | --------------------------- |
| `varshphal.get`    | `POST /v1/varshphal`        |
| `varshphal.bala`   | `POST /v1/varshphal/bala`   |
| `varshphal.sahams` | `POST /v1/varshphal/sahams` |
| `varshphal.yogas`  | `POST /v1/varshphal/yogas`  |
| `varshphal.dasha`  | `POST /v1/varshphal/dasha`  |

### `kj.transit`, `kj.match`

| Method            | Path                       | Cost                                                |
| ----------------- | -------------------------- | --------------------------------------------------- |
| `transit.now`     | `POST /v1/transit/now`     | 1 credit · never cached without an explicit `at`    |
| `transit.scan`    | `POST /v1/transit/scan`    | 20 credits · 10/min, no publishable keys            |
| `transit.events`  | `POST /v1/transit/events`  | 20 credits · 10/min                                 |
| `match.ashtakoot` | `POST /v1/match/ashtakoot` | 1 credit                                            |
| `match.compare`   | `POST /v1/match/compare`   | 1 credit · never cached                             |
| `match.batch`     | `POST /v1/match/batch`     | **1 credit per pair** · 10/min, no publishable keys |

`transit.events` is the calendar of a `year` (or a `from`…`to` window of at
most 366 days), the same for everyone: every sign ingress and every retrograde
and direct station, as `TransitEvent`s sorted by time. It takes no birth — only
a `timezone` for the local times — and `moon`, `nakshatras` and `combustion`
add more kinds.

```dart
final sky = await kj.transit.events(
  TransitEventsRequest(year: 2026, timezone: 'Asia/Kolkata'),
);
for (final event in sky.data.events) {
  print('${event.local} ${event.planet.id} ${event.kind}');
}
```

### `kj.reports`, `kj.horoscope` — 5 credits each

| Method                | Path                           | Request                  | Answers                      |
| --------------------- | ------------------------------ | ------------------------ | ---------------------------- |
| `reports.lagna`       | `POST /v1/reports/lagna`       | `ReportLagnaRequest`     | `ReadingLagnaDocument`       |
| `reports.nakshatra`   | `POST /v1/reports/nakshatra`   | `ReportNakshatraRequest` | `ReadingNakshatraDocument`   |
| `reports.houseLords`  | `POST /v1/reports/house-lords` | `KundliRequest`          | `ReadingHouseLordsDocument`  |
| `reports.grahas`      | `POST /v1/reports/grahas`      | `KundliRequest`          | `ReadingGrahasDocument`      |
| `reports.yogas`       | `POST /v1/reports/yogas`       | `KundliRequest`          | `ReadingYogasDocument`       |
| `reports.vimshottari` | `POST /v1/reports/vimshottari` | `KundliRequest`          | `VimshottariReadingDocument` |
| `reports.varshphal`   | `POST /v1/reports/varshphal`   | `VarshphalRequest`       | `VarshphalReadingDocument`   |
| `reports.lifeAreas`   | `POST /v1/reports/life-areas`  | `KundliRequest`          | `LifeAreasDocument`          |
| `reports.kundli`      | `POST /v1/reports/kundli`      | `ReportKundliRequest`    | `KundliReportDocument`       |
| `kj.horoscope`        | `POST /v1/horoscope`           | `HoroscopeRequest`       | `HoroscopeDocument`          |

All of them are on every plan. `reports.kundli`
asks for several at once: `parts` names them (default all eight), each comes
back as its own route answers it, and the request is priced 5 credits per part
(`meta.credits`); without a `year` its varshphal is the one running now. Every
`YogaReading` carries its `name`.

Written text rather than numbers. Every text is a `LocalizedText` with one
string per language of `options.language`, and every answer closes with a
`disclaimer` in the same languages.

```dart
// A reading: send a birth, or a sign (a nakshatra) to read it directly.
final lagna = await kj.reports.lagna(ReportLagnaRequest(
  sign: 'leo',
  options: CalculationOptions(language: ['en', 'hi']),
));
print(lagna.data.lagna?.entry.text.hi);

// The house lords: a birth only. Twelve houses in order, one request.
final lords = await kj.reports.houseLords(KundliRequest(birth: birth));
for (final lord in lords.data.houseLords ?? const <HouseLord>[]) {
  // 1 Gemini Mercury 9 — the sign on the house, its lord, where the lord sits.
  print('${lord.house} ${lord.sign.name} ${lord.lord.name} ${lord.inHouse}');
}

// The Vimshottari mahadashas of the life, one of them current.
final dashas = await kj.reports.vimshottari(KundliRequest(birth: birth));
final now = dashas.data.periods.firstWhere((p) => p.current);
print('${now.lord.name} ${now.from} – ${now.to}: ${now.level}');

// The year from the birthday in 2026: a summary, seven areas, its periods.
final year = await kj.reports.varshphal(VarshphalRequest(birth: birth, year: 2026));
print('${year.data.summary.level}: ${year.data.summary.text.en}');

// The horoscope: a summary and five areas for a sign over a day.
final day = await kj.horoscope(HoroscopeRequest(
  sign: 'aries',
  period: 'daily', // or weekly, monthly, yearly
  date: '2026-09-28',
  timezone: 'Asia/Kolkata', // where the day begins
));
print('${day.data.summary.level}: ${day.data.summary.text.en}');
for (final area in day.data.areas) {
  // work, money, relationships, health, education.
  print('${area.area} (${area.level}): ${area.text.en}');
}
print(day.data.disclaimer?.en);
```

Every summary and area has a `level` — `favourable`, `mixed` or `care` — and
a text; there are no scores or percentages. `from` and `to` are UTC instants.
`basis` (on the horoscope, one `HoroscopeTransit` per graha and sign, with
`entered` and `leaves`; on the Vimshottari, varshphal and life-areas readings,
the reasoning) is for you, not for the reader.

The closing line is `options.disclaimer`, a `Disclaimer`: `Disclaimer.standard`
(the default — "These predictions are indicative. For a reading of your own
chart, consult an astrologer."), `Disclaimer.off` (no `disclaimer` in the
answer), or your own name in place of "an astrologer":

```dart
options: CalculationOptions(
  disclaimer: Disclaimer.consult('Acharya Amit Verma', url: 'https://kaaljyoti.com'),
),
// "…consult Acharya Amit Verma (https://kaaljyoti.com)."
```

Every route accepts the option; only these three answer with a `disclaimer`.

### `kj.pdf` — 500 or 1,000 credits each · every paid plan

| Method              | Path                          | Request                   | Body of                    |
| ------------------- | ----------------------------- | ------------------------- | -------------------------- |
| `pdf.kundli`        | `POST /v1/pdf/kundli`         | `PdfKundliRequest`        | `POST /v1/kundli`          |
| `pdf.match`         | `POST /v1/pdf/match`          | `PdfMatchRequest`         | `POST /v1/match/ashtakoot` |
| `pdf.varshphal`     | `POST /v1/pdf/varshphal`      | `PdfVarshphalRequest`     | `POST /v1/varshphal`       |
| `pdf.panchangMonth` | `POST /v1/pdf/panchang/month` | `PdfPanchangMonthRequest` | `POST /v1/panchang/month`  |

A finished, printable PDF instead of JSON. Each takes the JSON route's body
plus `template` (`classic`, `modern`, `minimal`, `traditional`) and `branding`
(a `PdfBranding`); the kundli, match and varshphal also take `chartStyle` and
`name` (the match adds `partnerName`), and the kundli takes `edition`
(`basic`, the default, or `professional`), `sections` and `vargas`. The kundli
PDF costs 1,000 credits and the others 500, and each uses one PDF from the
month's allowance (Starter 50, Growth 200, Scale 500, Enterprise 2,500); past
it the error is `pdf_quota_exceeded`. PDFs are on every paid plan and not on
Free, which throws `plan_required`. A publishable key cannot make one, and
`branding` in the body is Enterprise only. See
[PDFs](https://kaaljyoti.com/api/docs/pdf).

The answer is the file, not an envelope: `data` is a `PdfFile` and `meta` is
`null`.

```dart
import 'dart:io';

final answer = await kj.pdf.kundli(PdfKundliRequest(
  birth: birth,
  name: 'Ravi Kumar',
  edition: 'professional',
  template: 'traditional',
  options: PdfKundliOptions(
    language: ['en', 'hi'],
    houseSystem: HouseSystem.kp,
  ),
));

final file = answer.data;
file.bytes; //  Uint8List — the PDF itself, never decoded as text
file.filename; //  'kundli-ravi-kumar.pdf', from Content-Disposition
file.credits; //  1000, from X-KJ-Credits
answer.cached; //  true when the 24-hour cache answered: no PDF used, still 1,000 credits
answer.creditsRemaining; //  what is left this month, packs included

await File(file.filename ?? 'kundli.pdf').writeAsBytes(file.bytes);
```

A failure is the usual JSON error and throws a `KaaljyotiException`, never a
PDF.

The kundli PDF takes `PdfKundliOptions` rather than `CalculationOptions`: the
same fields plus `houseSystem`, the bhava chalit it prints (default
`placidus`). No other route takes a house system — the API answers `400` to
`options.house_system` anywhere else — and `POST /v1/kundli/chalit` has its own
`system`.

Namespaces are plain fields, so pulling one out works:

```dart
final kundli = kj.kundli;
final chart = await kundli.get(KundliRequest(birth: birth));
```

No method here retypes its path: each one looks the path up in the generated
operation table by `operationId`, and the contract test walks the same table
against `openapi/openapi.json`, so a typo cannot ship.

## 5. What comes back

Every method resolves to `KjResult<Document, Meta>` — the envelope, flattened by
one level, because `meta` is how you answer a user who asks why a number is what
it is:

```dart
final answer = await kj.kundli.get(KundliRequest(birth: birth));

answer.data; //  the calculation, typed per endpoint
answer.meta; //  ayanamsa, timezone, engine, computeMs, languageFallback, credits
answer.requestId; //  'X-KJ-Request-Id' — quote it to support
answer.plan; //  the plan this answer was served under
answer.cached; //  true when the 24-hour cache answered. Costs the same credits.
answer.credits; //  'X-KJ-Credits' — what this request cost, as meta.credits says
answer.creditsRemaining; //  'X-KJ-Credits-Remaining' — secret keys only
answer.rateLimit; //  RateLimit(limit, remaining, reset) — the bucket as it stands
```

The second type parameter is the `meta`: `Meta` for almost everything,
`BatchMeta` for `match.batch`, `ReferenceMeta` for the reference tables,
`TimezoneMeta` for `kj.timezone`, and `Null` for the answers that carry
none — `kj.health()`, `kundli.chartSvg` and the `kj.pdf` methods. `requestId`,
`plan` and the `rateLimit` numbers are `null` when the gateway did not send the
header — a proxy in front of it, usually.

`credits` is what the request cost, on every metered answer — the same number
as `meta.credits`, and the only place an SVG or a PDF says it. It is `null` on
the free answers (health, time zone, the reference tables). `creditsRemaining`
is what is left of the month and of your credit packs together; the API sends
it to **secret keys only**, so it is always `null` with a `kj_pub_…` key — a
page's visitors do not get to read the account's balance.

Inside `data`, every id comes back as a `LabelledId` —
`LabelledId(id: 'cancer', name: 'Cancer')` — and asking for two languages
(`CalculationOptions(language: ['en', 'hi'])`) fills `names`. See
[labelled ids](#11-labelled-ids).

## 6. Errors

Every failure — from the gateway or from the socket — is a thrown
`KaaljyotiException`:

```dart
try {
  await kj.kundli.get(KundliRequest(birth: birth));
} on KaaljyotiException catch (error) {
  switch (error.code) {
    case 'validation_error':
      showFieldError(error.field); // 'birth.utc_offset'
    case 'quota_exceeded':
      askToUpgrade(error.docs);
    default:
      log('${error.code} ${error.status} ${error.requestId}');
      if (error.isRetryable) {
        scheduleRetry(error.retryAfter ?? const Duration(seconds: 60));
      }
  }
}
```

| Field        | What it is                                                    |
| ------------ | ------------------------------------------------------------- |
| `code`       | The contract. **Branch on this, never on `message`.**         |
| `status`     | HTTP status, or `0` when the request never got an answer      |
| `message`    | Human-readable, and free to get clearer between versions      |
| `field`      | Dotted path of the offending request field, when there is one |
| `docs`       | Link to the errors page for this code                         |
| `requestId`  | `X-KJ-Request-Id` — the one thing support asks for            |
| `retryAfter` | A `Duration` from `Retry-After`, on a `429`                   |

The codes are the API's own — `validation_error`, `invalid_key`, `key_revoked`,
`quota_exceeded`, `pdf_quota_exceeded`, `forbidden_origin`, `plan_required`,
`not_found`, `not_computable`, `rate_limited`, `engine_error`,
`service_disabled` — plus
three this package adds for failures that never reached the API:
`network_error`, `timeout` and `bad_response`, which are on `KjErrorCode`
alongside `invalid_key`. One `switch` handles both kinds.
`error.isRetryable` says whether sending the identical request again is worth
anything.

A malformed answer that the generated models cannot read is
`bad_response` too — never a raw `TypeError` for the caller to interpret.

### Retries

`maxRetries` is `2` by default, and the budget is spent per reason:

- **`429 rate_limited`** — waits what `Retry-After` said (capped at 30 seconds,
  defaulting to 2 when the header is missing or unparseable) and tries again, up
  to `maxRetries` times.
- **`500 engine_error`** — one more try. Our fault, and often transient.
- **A dead socket or a timeout** — one more try.
- **`400`, `401`, `402`, `403`, `422`** — never. The identical body will be
  refused identically, and retrying only spends your time.

Every endpoint is a pure calculation, which is what makes retrying a POST safe
at all. To do the waiting yourself — a Flutter app with its own backoff and its
own "you are offline" banner — turn it off and read `retryAfter` off the
exception:

```dart
final kj = Kaaljyoti(apiKey: apiKey, maxRetries: 0);
```

A refused request costs no credits, so a retry that gets refused again costs
nothing but latency.

## 7. Dates and wall clocks

The single most common integration bug is sending an instant where a wall clock
belongs. A birth time is a wall clock — `1990-05-14T10:30:00` means half past
ten _where the birth happened_ — and an instant knows nothing about where it
was.

> **`dateTime.toUtc().toIso8601String()` on a birth is wrong.** It sends the UTC
> time of that moment, which is the birth time only in London and five and a
> half hours out in India. That is not a rounding error: it moves the ascendant
> by most of the zodiac.

Dart has no IANA zone database in its core libraries, so this package does not
pretend to one. It gives you the two conversions that need no database, and
leaves zone _names_ to the API:

```dart
// The DateTime your date and time pickers produced is already the wall clock
// at the place. Write it out:
wallClock(DateTime(1990, 5, 14, 10, 30)); // '1990-05-14T10:30:00'

// The reverse, given meta.timezone.utcOffset from an answer:
fromWallClock('1990-05-14T10:30:00', '+05:30'); // 1990-05-14T05:00:00.000Z

formatOffset(const Duration(hours: 5, minutes: 30)); // '+05:30'
```

`wallClock` formats a `DateTime`'s own fields and does not convert between
zones — which is correct precisely when those fields already are the clock at
the place, and wrong for a `DateTime` that came from a device clock somewhere
else. `fromWallClock` throws a `FormatException` on anything that is not
`YYYY-MM-DDTHH:MM:SS` and `+HH:MM`, because a silently wrong chart is worse than
a throw.

For a zone **name**, ask the API — it costs no credits and it knows the historical
offsets a device's own arithmetic does not:

```dart
final zone = await kj.timezone(
  lat: 28.6139,
  lon: 77.209,
  datetime: '1944-03-15T10:00:00',
);
zone.data.utcOffset; // '+06:30' — India's war time, not today's +05:30
```

Or send no zone at all and let the API derive it from the coordinates;
`meta.timezone.source` then says `derived`. More on this on the
[time zones](https://kaaljyoti.com/api/docs/timezones) page.

## 8. Charts as SVG

The same endpoint answers either way:

```dart
// The document: metadata plus the markup in `data.svg`.
final document = await kj.kundli.chart(
  KundliChartRequest(birth: birth, style: ChartStyle.north, size: 360),
);
document.data.style; //  'north'
document.data.svg; //  '<svg …'

// The markup itself. `data` is a String, and `meta` is null.
final svg = await kj.kundli.chartSvg(
  KundliChartRequest(birth: birth, size: 360),
);
```

`firstHouse` rotates the chart: `lagna` (the default), a graha — `moon` draws
the Chandra kundli, `sun` the Surya kundli — or `house_2` … `house_12` for
bhavat bhavam. It works in every varga, and the grahas never move; the document
echoes `firstHouse`, names the sign drawn as house 1 in `firstHouseSign` and
says what the chart is in `title`:

```dart
final moon = await kj.kundli.chart(
  KundliChartRequest(birth: birth, firstHouse: 'moon'),
);
moon.data.firstHouseSign.id; //  the Moon's sign, now house 1
moon.data.title; //  'Moon chart'
```

The values the API's closed enums accept are generated beside the models as
`String` constants — `ChartStyle.north`, `Varga.d9`, `Ayanamsa.lahiri`,
`HouseSystem.wholeSign` (the kundli PDF's `houseSystem`), and `values` on each
for a picker. The fields stay `String`, so a slug from a form or a database
still goes in as it is.

In Flutter, hand the string to `flutter_svg`'s `SvgPicture.string(svg.data)`;
on the web, put it in the document. The markup colours itself from the same
sixteen custom properties (`--kj-bg`, `--kj-lagna`, `--kj-planet-sun`, …) that
[`@kaaljyoti/widgets`](https://www.npmjs.com/package/@kaaljyoti/widgets) uses,
so an inlined chart takes the page's theme. A failure is an envelope whatever
`Accept` asked for, so `chartSvg` throws the same `KaaljyotiException` as
everything else.

## 9. Matching in bulk

`match.batch` takes up to 100 pairs and charges 1 credit per pair. **A pair that
could not be computed comes back as a value, not as a thrown exception** — the
other pairs were calculated and charged, and throwing would discard answers you
have already paid for:

```dart
final answer = await kj.match.batch(MatchBatchRequest(
  pairs: [
    MatchBatchRequestPairsItem(bride: brideBirth, groom: groomBirth),
    MatchBatchRequestPairsItem(bride: brideBirth, groom: otherBirth),
  ],
));

for (final result in answer.data.results) {
  final error = result.error;
  if (error != null) {
    print('pair ${result.index}: ${error.code} ${error.field}');
    continue;
  }
  print('${result.index}: ${result.data?.total} / 36');
}

answer.meta.credits; //  what the request cost: one per pair
```

Only the whole request failing — a bad key, a body over the 8 KB limit, the rate
limit — throws. In practice that 8 KB allows about thirty pairs per request, not
a hundred. Batch is closed to publishable keys.

## 10. Options

```dart
final kj = Kaaljyoti(
  apiKey: apiKey,
  timeout: const Duration(seconds: 10),
  maxRetries: 1,
);
```

| Option       | Type                  | Default                     | What it does                                                                          |
| ------------ | --------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `apiKey`     | `String`              | — (required)                | Placed by its prefix; see [keys](#3-keys). An empty key is refused before the network |
| `baseUrl`    | `String?`             | `https://api.kaaljyoti.com` | Origin only; a trailing `/` or `/v1` is trimmed for you                               |
| `client`     | `http.Client?`        | a new `http.Client()`       | Your own client — a Flutter platform client, a `MockClient`. Not closed by `close()`  |
| `timeout`    | `Duration`            | 30 seconds                  | Deadline **per attempt**, not per call                                                |
| `maxRetries` | `int`                 | `2`                         | `0` turns retrying off entirely                                                       |
| `clientTag`  | `String`              | `sdk-dart/<version>`        | The `X-KJ-Client` tag, so a shell built on this SDK attributes usage to itself        |
| `headers`    | `Map<String, String>` | `{}`                        | Extra headers on every request. Cannot override the key, the `Accept` or the tag      |

`kj.close()` releases the HTTP client — but only the one the SDK created. A
client you passed in as `client:` is yours, and closing it would drop the
connections of everything else sharing it.

### Staging

One option, no separate build:

```dart
final kj = Kaaljyoti(
  apiKey: Platform.environment['KAALJYOTI_TEST_KEY']!, // a kj_test_… key
  baseUrl: 'https://api-staging.kaaljyoti.com',
);
```

The package's own smoke test runs against staging and is opt-in:

```sh
KJ_SMOKE=1 KJ_API_KEY=kj_pub_… dart test test/smoke_test.dart
```

It reads `KJ_BASE_URL` (default staging) and, for a publishable key,
`KJ_ORIGIN` (default `http://localhost:3000`), which it sends as `Origin`
because a Dart VM does not send one of its own.

## 11. Labelled ids

Every id the gateway recognises arrives as a `LabelledId` — `id`, `name` and an
optional `names` — and is typed that way: `lagnaSign`, `moonSign`, every
`*Nakshatra` and `*Lord`, `planet` / `sign` / `nakshatra` inside `positions`,
and so on.

```dart
final sun = answer.data.positions['sun']!;
sun.sign.id; //  'aries'      ← the stable half: switch on this
sun.sign.name; //  'Aries'    ← for people, in the first language you asked for
sun.sign.names?['hi']; //  'मेष' ← present when you asked for more than one
```

`LabelledId` compares by value, so two ids with the same `id`, `name` and
`names` are equal and hash alike — which makes them usable as map keys and safe
in a Flutter widget's `==`.

---

Generated from OpenAPI document version **0.15.2**
(`openApiVersion` is a constant in the package, beside `sdkVersion`).
`pnpm --filter sdk-dart run gen` regenerates `lib/src/generated/`, and CI fails when the generated code and the snapshot disagree.

MIT licensed. Issues and pull requests:
[kaaljyoti-integrations](https://github.com/goappsters/kaaljyoti-integrations).
