# kaaljyoti

The typed Python client for the [Kaal Jyoti API](https://kaaljyoti.com/api) —
kundli, panchang, dasha, vargas, KP, Jaimini, varshphal, transits, matching,
readings, horoscopes and printable PDFs.
One client, one method per endpoint, every request and response generated from
the API's own OpenAPI document. No calculation happens here: the package adds
auth, retries, error mapping and the types, and gets out of the way.

Python 3.10+. **No runtime dependencies at all** — HTTP goes through a
one-method protocol with a standard-library implementation built in, and an
optional adapter for the `httpx.Client` you may already have. Fully typed
(`py.typed`, clean under `mypy --strict`).

## 1. Install

```sh
pip install kaaljyoti
```

To send requests through httpx instead of `urllib`:

```sh
pip install 'kaaljyoti[httpx]'
```

`examples/quickstart.py` is the quick start below, runnable, and
`CHANGELOG.md` records what each version changed.

## 2. Quick start

```python
import os

from kaaljyoti import Birth, CalculationOptions, Kaaljyoti, KundliRequest

kj = Kaaljyoti(api_key=os.environ["KAALJYOTI_API_KEY"])

answer = kj.kundli.get(
    KundliRequest(
        birth=Birth(
            datetime="1990-05-14T10:30:00",  # wall clock at the birth place
            latitude=28.6139,
            longitude=77.209,
            timezone="Asia/Kolkata",
            place="New Delhi",
        ),
        options=CalculationOptions(ayanamsa="lahiri", language=["en"]),
    )
)

print(answer.data.ascendant_dms)  #  99°02'48.2"
print(answer.data.lagna_sign.name)  #  Cancer
print(answer.meta.timezone.source)  #  given
```

Two details in that body are the whole contract, and they are the two people
get wrong:

- **`datetime` is the clock on the wall where the birth happened**, not UTC and
  not your server's zone. If you are starting from a `datetime` object, see
  [wall clocks](#7-dates-and-wall-clocks).
- **Give `timezone` or `utc_offset`, or neither — never both.** With neither,
  the API derives the zone from the coordinates and `meta.timezone.source` says
  `derived`. Giving both is a `400`.

Everything else has a default, and `options` can be left out entirely. The
[quick start](https://kaaljyoti.com/api/docs/quick-start) covers the same ground
in curl.

The SDK does not read the environment for you; pass `api_key` explicitly, so a
process with two keys in it cannot pick the wrong one by accident.

## 3. Keys

Create one in the [dashboard](https://kaaljyoti.com/api/dashboard/keys). You see
the whole key once — only its SHA-256 is stored.

| Prefix      | What it is                          | Where the SDK puts it   | Safe in a browser |
| ----------- | ----------------------------------- | ----------------------- | ----------------- |
| `kj_live_…` | Your production secret key          | `Authorization: Bearer` | **No**            |
| `kj_test_…` | A second secret key, for staging    | `Authorization: Bearer` | **No**            |
| `kj_pub_…`  | Publishable, locked to your origins | `?key=…` in the query   | Yes, with care    |

The prefix decides the placement; you never choose it. A browser cannot set
`Authorization` on a cross-origin request without a preflight the gateway does
not grant, so a publishable key travels in the query — and the gateway refuses a
secret key in a query string outright, which is the backstop for the mistake
this table exists to prevent.

Python runs on a server, so the key you want is almost always a secret one. A
publishable key is what you would hand to the JavaScript on a page; it is only
accepted from the origins you listed when you created it, the match is exact and
`*` is not a wildcard, and it cannot reach the heavy endpoints
(`panchang.month`, `transit.scan`, `match.batch`) or ask for `embed_font` on a
chart. A Python process sends no `Origin` header, so the gateway refuses a
publishable key from one unless you send an `Origin` of your own (see
[options](#11-options)).

**Keep secret keys out of version control**: an environment variable or a
secrets manager. Nothing in this package ever logs a key or puts one in an
exception message. See
[authentication](https://kaaljyoti.com/api/docs/authentication).

## 4. Every method

Grouped the way the paths are, so a path in the docs is a method here without
looking anything up — `/v1/kundli/sade-sati` is `kj.kundli.sade_sati`. The names
match the TypeScript, Dart and PHP clients, in snake_case. Every method takes
one generated request class and answers a `Result`. What each one costs is in
[Credits per API](https://kaaljyoti.com/api/docs/credits): **a calculation costs
1 credit, a written reading 5, a scan across time 10 or 20, a PDF 500 or
1,000**; a refusal costs nothing, and a cache hit costs the same as any other
answer. Every plan can call every method — the credits do the limiting — except
that PDFs are not on the Free plan.

### Service and reference — free, but for a place search

| Method                                      | Path                       | Answers                                 | Cost              |
| ------------------------------------------- | -------------------------- | --------------------------------------- | ----------------- |
| `kj.health()`                               | `GET /v1/health`           | `HealthDocument`, no meta               | Free, no key      |
| `kj.reference(list_name, language)`         | `GET /v1/reference/{list}` | `list[dict[str, Any]]`, `ReferenceMeta` | Free, wants a key |
| `kj.timezone(lat, lon, datetime=None)`      | `GET /v1/timezone`         | `TimezoneDocument`, `TimezoneMeta`      | Free, wants a key |
| `kj.places(q, *, country, limit, language)` | `GET /v1/places`           | `PlacesDocument`, `PlacesMeta`          | 1 credit a search |

```python
signs = kj.reference("signs", ["en", "hi"])
# the list is joined into the one comma-separated parameter the API takes
signs.data[0]["name"]  #  'Aries'
signs.meta.language  #  ['en', 'hi'] — the labels you actually got

zone = kj.timezone(28.6139, 77.209)
print(zone.data.name, zone.data.utc_offset)  #  Asia/Kolkata +05:30

# Names beginning with "Bombay", best match first: coordinates and zone included,
# which is everything a Birth needs besides the clock.
mumbai = kj.places("Bombay", country="IN", limit=5).data.places[0]
print(mumbai.name, mumbai.timezone)  #  Mumbai Asia/Kolkata
```

`list_name` is one of `ayanamsas`, `planets`, `signs`, `nakshatras`, `tithis`,
`yogas`, `karanas`, `vargas`, `dasha-systems`, `house-systems`,
`chalit-systems`, `transit-events`, `languages`, `credits`. `language` is a
`str` or a sequence of them. `credits` is the price list in force: one
`{route, credits}` row per metered route, with `per` (`pair` or `part`) on the
two priced per unit. The
rows come back as plain dicts rather than a class: each table publishes its own
columns — `{id, name}` for most, `{index, name}` for the ones the engine
numbers — and the snapshot declares them open, so a class here would be a guess
that goes stale. The `meta` beside them is the generated `ReferenceMeta`
(`engine`, `language`), whose fields the snapshot does name.

### `kj.kundli` — 1 credit each

| Method                  | Path                             | Request              |
| ----------------------- | -------------------------------- | -------------------- |
| `kundli.get`            | `POST /v1/kundli`                | `KundliRequest`      |
| `kundli.chart`          | `POST /v1/kundli/chart`          | `KundliChartRequest` |
| `kundli.chart_svg`      | `POST /v1/kundli/chart`          | `KundliChartRequest` |
| `kundli.dasha`          | `POST /v1/kundli/dasha`          | `DashaRequest`       |
| `kundli.vargas`         | `POST /v1/kundli/vargas`         | `VargasRequest`      |
| `kundli.chalit`         | `POST /v1/kundli/chalit`         | `ChalitRequest`      |
| `kundli.yogas`          | `POST /v1/kundli/yogas`          | `KundliRequest`      |
| `kundli.shadbala`       | `POST /v1/kundli/shadbala`       | `KundliRequest`      |
| `kundli.bhava_bala`     | `POST /v1/kundli/bhava-bala`     | `KundliRequest`      |
| `kundli.ashtakavarga`   | `POST /v1/kundli/ashtakavarga`   | `KundliRequest`      |
| `kundli.graha_drishti`  | `POST /v1/kundli/graha-drishti`  | `KundliRequest`      |
| `kundli.maitri`         | `POST /v1/kundli/maitri`         | `KundliRequest`      |
| `kundli.pace`           | `POST /v1/kundli/pace`           | `KundliRequest`      |
| `kundli.special_lagnas` | `POST /v1/kundli/special-lagnas` | `KundliRequest`      |
| `kundli.tripataki`      | `POST /v1/kundli/tripataki`      | `KundliRequest`      |
| `kundli.sarvatobhadra`  | `POST /v1/kundli/sarvatobhadra`  | `KundliRequest`      |
| `kundli.nakshatra28`    | `POST /v1/kundli/nakshatra28`    | `KundliRequest`      |
| `kundli.sade_sati`      | `POST /v1/kundli/sade-sati`      | `SadeSatiRequest`    |
| `kundli.events`         | `POST /v1/kundli/events`         | `SadeSatiRequest`    |
| `kundli.kota_chakra`    | `POST /v1/kundli/kota-chakra`    | `KundliRequest`      |

`chart` and `chart_svg` are the same endpoint and the same call, asked for with
a different `Accept`; see [charts as SVG](#8-charts-as-svg). `dasha` and
`kota_chakra` are never cached. A field that is a Python keyword keeps its wire
name in the JSON and gains a trailing underscore here: `SadeSatiRequest(from_=…,
to=…)`.

`kundli.dasha` answers one `system` — `vimshottari`, `yogini`, or the Jaimini
`chara`, `sthira` and `mandook` — as a tree `levels` deep: 1 to 5, default 2.
Levels 4 and 5 need `from_`/`to`, UTC instants at most 366 days apart, which cut
the tree to that window; the running chain is always included, as deep as
`levels`.

### `kj.panchang`, `kj.ephemeris`, `kj.calendar`

| Method                   | Path                              | Cost                |
| ------------------------ | --------------------------------- | ------------------- |
| `panchang.daily`         | `POST /v1/panchang`               | 1 credit            |
| `panchang.muhurta`       | `POST /v1/panchang/muhurta`       | 1 credit            |
| `panchang.month`         | `POST /v1/panchang/month`         | 20 credits · 10/min |
| `ephemeris.month`        | `POST /v1/ephemeris/month`        | 20 credits · 10/min |
| `calendar.vikram_samvat` | `POST /v1/calendar/vikram-samvat` | 1 credit            |

`panchang.daily`, `panchang.month` and
`ephemeris.month` are about a **place and a day**, not a person, so their
requests take the place fields flat, with no `Birth`.
`panchang.month` answers one daily panchang per date — every tithi, nakshatra,
yoga and karana that touches the day with the time it ends, the vara, sunrise
and sunset, and the masa in both reckonings; `ephemeris.month` is the month of
graha positions, sidereal and tropical unless `system` narrows it.
`panchang.muhurta` takes a `MuhurtaRequest` with **either** a `birth` (the answer
then adds `tara_bala` and `chandra_bala`) **or** a place and an optional `date`.

The panchang's names — `tithi_name`, `yoga_name`, `karana_name`, `paksha`,
`vara`, `masa.month_name` and each of `tithis[]` — are `LabelledId`s like a
nakshatra: `id` is a lower-case slug (`shashthi`, `somavara`), `name` is in the
first language asked for, and `names` has both when two were asked for. A leap
month is `is_adhik` on the masa, not part of its name.

### `kj.jaimini`, `kj.kp` — 1 credit each

| Method                 | Path                            | Request         |
| ---------------------- | ------------------------------- | --------------- |
| `jaimini.karakas`      | `POST /v1/jaimini/karakas`      | `KundliRequest` |
| `jaimini.arudha_padas` | `POST /v1/jaimini/arudha-padas` | `KundliRequest` |
| `jaimini.aspects`      | `POST /v1/jaimini/aspects`      | `KundliRequest` |
| `jaimini.karakamsha`   | `POST /v1/jaimini/karakamsha`   | `KundliRequest` |
| `kp.chart`             | `POST /v1/kp/chart`             | `KundliRequest` |

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

| Method            | Path                       | Request                 | Cost                                                |
| ----------------- | -------------------------- | ----------------------- | --------------------------------------------------- |
| `transit.now`     | `POST /v1/transit/now`     | `TransitNowRequest`     | 1 credit · never cached without an explicit `at`    |
| `transit.scan`    | `POST /v1/transit/scan`    | `TransitScanRequest`    | 20 credits · 10/min, no publishable keys            |
| `transit.events`  | `POST /v1/transit/events`  | `TransitEventsRequest`  | 20 credits · 10/min                                 |
| `match.ashtakoot` | `POST /v1/match/ashtakoot` | `MatchAshtakootRequest` | 1 credit                                            |
| `match.compare`   | `POST /v1/match/compare`   | `MatchCompareRequest`   | 1 credit · never cached                             |
| `match.batch`     | `POST /v1/match/batch`     | `MatchBatchRequest`     | **1 credit per pair** · 10/min, no publishable keys |

`transit.events` is the calendar of a `year` (or a `from_`…`to` window of at
most 366 days), the same for everyone: every sign ingress and every retrograde
and direct station, as `TransitEvent`s sorted by time. It takes no birth — only
a `timezone` for the local times — and `moon`, `nakshatras` and `combustion`
add more kinds.

```python
sky = kj.transit.events(TransitEventsRequest(year=2026, timezone="Asia/Kolkata"))
for event in sky.data.events:
    print(event.local, event.planet.id, event.kind)
```

### `kj.reports`, `kj.horoscope` — 5 credits each

| Method                | Path                           | Request                  | Answers                      |
| --------------------- | ------------------------------ | ------------------------ | ---------------------------- |
| `reports.lagna`       | `POST /v1/reports/lagna`       | `ReportLagnaRequest`     | `ReadingLagnaDocument`       |
| `reports.nakshatra`   | `POST /v1/reports/nakshatra`   | `ReportNakshatraRequest` | `ReadingNakshatraDocument`   |
| `reports.house_lords` | `POST /v1/reports/house-lords` | `KundliRequest`          | `ReadingHouseLordsDocument`  |
| `reports.grahas`      | `POST /v1/reports/grahas`      | `KundliRequest`          | `ReadingGrahasDocument`      |
| `reports.yogas`       | `POST /v1/reports/yogas`       | `KundliRequest`          | `ReadingYogasDocument`       |
| `reports.vimshottari` | `POST /v1/reports/vimshottari` | `KundliRequest`          | `VimshottariReadingDocument` |
| `reports.varshphal`   | `POST /v1/reports/varshphal`   | `VarshphalRequest`       | `VarshphalReadingDocument`   |
| `reports.life_areas`  | `POST /v1/reports/life-areas`  | `KundliRequest`          | `LifeAreasDocument`          |
| `reports.kundli`      | `POST /v1/reports/kundli`      | `ReportKundliRequest`    | `KundliReportDocument`       |
| `kj.horoscope`        | `POST /v1/horoscope`           | `HoroscopeRequest`       | `HoroscopeDocument`          |

A reading takes a `birth`, whose lagna or janma nakshatra is read, or the
`sign` / `nakshatra` itself with no birth at all. The personal reports take a
`birth` only. All of them are on every plan:

- the house lords: twelve `HouseLord`s in house order — the sign on the house,
  its lord, the house the lord sits in (`in_house`) and a reading;
- the grahas: nine `GrahaReading`s, each graha's sign and house and what it says
  in each (`in_sign`, `in_house`);
- the yogas: a `YogaReading` for each yoga that forms, by `code` and `category`,
  with the grahas in it;
- the Vimshottari dashas: a `MahadashaReading` per mahadasha — dates, `level`,
  text, `current` for the running one, and its `antardashas`;
- the varshphal: the year from the birthday in `year` — a `summary`, seven
  `AreaSummary`s and the year's periods (`months`, `VarshphalPeriod`);
- the life areas: a summary naming the `strongest` and `needs_care` areas, and
  eleven `LifeArea`s;
- the kundli report: several of these at once — `parts` names them (default
  all eight), each comes back as its own route answers it, and the request is
  priced 5 credits per part (`meta.credits`). Without a `year` its varshphal
  is the one running now.

Each `YogaReading` carries its `name` as a `LocalizedText`.

A horoscope takes a `sign` and a `period` — `daily` (the default), `weekly`,
`monthly` or `yearly` — and answers one `summary` and five areas (work, money,
relationships, health, education). Every summary and area has a `level` —
`favourable`, `mixed` or `care` — and no scores. `basis`, where an answer has
it, is the reasoning (for the horoscope, one `HoroscopeTransit` per graha and
sign), for you and not for the reader. Every text is a `LocalizedText` with one
field per language in `options.language`:

```python
from kaaljyoti import (
    CalculationOptions,
    HoroscopeRequest,
    KundliRequest,
    ReportNakshatraRequest,
    VarshphalRequest,
)

today = kj.horoscope(HoroscopeRequest(sign="aries", date="2026-09-28"))
print(today.data.summary.level, today.data.summary.text.en)  #  care Today, small setbacks …
for area in today.data.areas:
    print(area.area, area.level, area.text.en)  #  work mixed Today, the working mood …

reading = kj.reports.nakshatra(
    ReportNakshatraRequest(
        nakshatra="purva_phalguni", options=CalculationOptions(language=["en", "hi"])
    )
)
print(reading.data.nakshatra.entry.text.hi)
print(reading.data.disclaimer.en)  #  'These predictions are indicative. …'

lords = kj.reports.house_lords(KundliRequest(birth=birth))
for lord in lords.data.house_lords or []:
    print(lord.house, lord.sign.name, lord.lord.name, lord.in_house)
    #  1 Gemini Mercury 9, then 2 Cancer Moon 5, …

dashas = kj.reports.vimshottari(KundliRequest(birth=birth))
now = next(p for p in dashas.data.periods if p.current)
print(now.lord.name, now.from_, now.to, now.level)  #  Mars 2019-11-23T… 2026-11-23T… mixed

year = kj.reports.varshphal(VarshphalRequest(birth=birth, year=2026))
print(year.data.summary.text.en, [m.lord.name for m in year.data.months])
```

Every report ends with a `disclaimer`. `options.disclaimer` shapes it: leave it
out (or `"default"`) for the stock line, pass a `Disclaimer` to name the
astrologer to consult, or `"off"` to leave the line out of the answer:

```python
from kaaljyoti import Disclaimer, ReportLagnaRequest

kj.reports.lagna(
    ReportLagnaRequest(
        sign="leo",
        options=CalculationOptions(
            disclaimer=Disclaimer(name="Acharya Amit Verma", url="https://kaaljyoti.com")
        ),
    )
)
# data.disclaimer.en: '… consult Acharya Amit Verma (https://kaaljyoti.com).'
```

The option is on every request's `options` and has no effect outside the
report routes.

### `kj.pdf` — 500 or 1,000 credits each · every paid plan

| Method               | Path                          | Request                   | Body of                    |
| -------------------- | ----------------------------- | ------------------------- | -------------------------- |
| `pdf.kundli`         | `POST /v1/pdf/kundli`         | `PdfKundliRequest`        | `POST /v1/kundli`          |
| `pdf.match`          | `POST /v1/pdf/match`          | `PdfMatchRequest`         | `POST /v1/match/ashtakoot` |
| `pdf.varshphal`      | `POST /v1/pdf/varshphal`      | `PdfVarshphalRequest`     | `POST /v1/varshphal`       |
| `pdf.panchang_month` | `POST /v1/pdf/panchang/month` | `PdfPanchangMonthRequest` | `POST /v1/panchang/month`  |

A finished, printable PDF instead of JSON. Each takes the JSON route's body
plus `template` (`classic`, `modern`, `minimal`, `traditional`) and `branding`
(a `PdfBranding`); the kundli, match and varshphal also take `chart_style` and
`name` (the match adds `partner_name`), and the kundli takes `edition`
(`basic`, the default, or `professional`), `sections` and `vargas`. The kundli
PDF costs 1,000 credits and the others 500, and each uses one PDF from the
month's allowance (Starter 50, Growth 200, Scale 500, Enterprise 2,500); past
it the error is `pdf_quota_exceeded`. PDFs are on every paid plan and not on
Free, which raises `plan_required`. A publishable key cannot make one, and
`branding` in the body is Enterprise only — on any other plan it raises
`plan_required`. See [PDFs](https://kaaljyoti.com/api/docs/pdf).

The answer is the file, not an envelope: `data` is a `PdfFile` and `meta` is
`None`.

```python
from pathlib import Path

from kaaljyoti import HouseSystem, PdfKundliOptions, PdfKundliRequest

answer = kj.pdf.kundli(
    PdfKundliRequest(
        birth=birth,
        name="Ravi Kumar",
        edition="professional",
        template="traditional",
        options=PdfKundliOptions(language=["en", "hi"], house_system=HouseSystem.KP),
    )
)
file = answer.data

file.bytes  #  bytes — the PDF itself, never decoded as text
file.filename  #  'kundli-ravi-kumar.pdf', from Content-Disposition
file.credits  #  1000, from X-KJ-Credits
answer.cached  #  True when the 24-hour cache answered: no PDF used, still 1,000 credits
answer.credits_remaining  #  what is left this month, packs included

Path(file.filename or "kundli.pdf").write_bytes(file.bytes)
```

A failure is the usual JSON error and raises a `KaaljyotiError`, never a PDF.

The kundli PDF takes `PdfKundliOptions` rather than `CalculationOptions`: the
same fields plus `house_system`, the bhava chalit it prints (default
`placidus`). No other route takes a house system — the API answers `400` to
`options.house_system` anywhere else — and `POST /v1/kundli/chalit` has its own
`system`.

Namespaces are plain attributes, so pulling one out works:

```python
kundli = kj.kundli
chart = kundli.get(KundliRequest(birth=birth))
```

No method here retypes its path: each one looks the path up in the generated
operation table by `operationId` (`operation("postKundliDasha").path`), and the
contract test walks the same table against `openapi/openapi.json`, so a typo
cannot ship.

## 5. What comes back

Every method answers a `Result[Document, Meta]` — the envelope, flattened by one
level, because `meta` is how you answer a user who asks why a number is what it
is:

```python
answer = kj.kundli.get(KundliRequest(birth=birth))

answer.data  #  the calculation, typed per endpoint
answer.meta  #  ayanamsa, timezone, engine, compute_ms, language_fallback, credits
answer.request_id  #  'X-KJ-Request-Id' — quote it to support
answer.plan  #  the plan this answer was served under
answer.cached  #  True when the 24-hour cache answered. Costs the same credits.
answer.credits  #  'X-KJ-Credits' — what this request cost, as meta.credits says
answer.credits_remaining  #  'X-KJ-Credits-Remaining' — secret keys only
answer.rate_limit  #  RateLimit(limit, remaining, reset) — the bucket as it stands
```

The two type parameters are what mypy, Pyright and your editor read: the second
is the `meta` — `Meta` for almost everything, `BatchMeta` for `match.batch`,
`ReferenceMeta` for the reference tables, `TimezoneMeta` for `kj.timezone()`,
and `None` for the answers that carry none: `kj.health()`, `kundli.chart_svg`
and the `kj.pdf` methods. `request_id`, `plan` and the `rate_limit` numbers are `None`
when the gateway did not send the header — a proxy in front of it, usually.

`credits` is what the request cost, on every metered answer — the same number
as `meta.credits`, and the only place an SVG or a PDF says it. It is `None` on
the free answers (health, time zone, the reference tables). `credits_remaining`
is what is left of the month and of your credit packs together; the API sends
it to **secret keys only**, so it is always `None` with a `kj_pub_…` key — a
page's visitors do not get to read the account's balance.

Every document is a frozen dataclass with `from_dict()` and `to_dict()`, so an
answer is JSON-serialisable (`json.dumps(answer.data.to_dict())`) and comparable
by value without a library. Field names are the wire names, already snake_case.
Inside `data`, every id comes back as a `LabelledId` — see
[labelled ids](#12-labelled-ids).

## 6. Errors

Every failure — from the gateway or from the socket — is a raised
`KaaljyotiError`:

```python
from kaaljyoti import KaaljyotiError

try:
    answer = kj.kundli.get(KundliRequest(birth=birth))
except KaaljyotiError as error:
    match error.code:
        case "validation_error":
            form.reject(error.field)  # 'birth.utc_offset'
        case "quota_exceeded":
            ask_to_upgrade(error.docs)
        case _:
            log.warning("%s %s %s", error.code, error.status, error.request_id)
    if error.is_retryable:
        queue.later(error.retry_after or 60, job)
```

| Member         | What it is                                                    |
| -------------- | ------------------------------------------------------------- |
| `code`         | The contract. **Branch on this, never on `message`.**         |
| `status`       | HTTP status, or `0` when the request never got an answer      |
| `message`      | Human-readable, and free to get clearer between versions      |
| `field`        | Dotted path of the offending request field, when there is one |
| `docs`         | Link to the errors page for this code                         |
| `request_id`   | `X-KJ-Request-Id` — the one thing support asks for            |
| `retry_after`  | Seconds from `Retry-After`, on a `429`                        |
| `is_retryable` | Whether sending the identical request again is worth anything |

The codes are the API's own — `validation_error`, `invalid_key`, `key_revoked`,
`quota_exceeded`, `pdf_quota_exceeded`, `forbidden_origin`, `plan_required`,
`not_found`, `not_computable`, `rate_limited`, `engine_error`,
`service_disabled` — plus
three this package adds for failures that never reached the API:
`KaaljyotiError.NETWORK_ERROR`, `.TIMEOUT` and `.BAD_RESPONSE`, alongside
`.INVALID_KEY` for a key that was never configured. One `match` handles both
kinds. A malformed answer that the generated models cannot read is
`bad_response` too — never a raw `ValueError` for the caller to interpret; the
original is on `__cause__`. See [errors](https://kaaljyoti.com/api/docs/errors).

### Retries

`max_retries` is `2` by default, and the budget is spent per reason:

- **`429 rate_limited`** — waits what `Retry-After` said (capped at 30 seconds,
  defaulting to 2 when the header is missing or unparseable) and tries again, up
  to `max_retries` times.
- **`500 engine_error`** — one more try. Our fault, and often transient.
- **A dead socket or a timeout** — one more try.
- **`400`, `401`, `402`, `403`, `422`** — never. The identical body will be
  refused identically, and retrying only spends your time.

Every endpoint is a pure calculation, which is what makes retrying a POST safe
at all. To do the waiting yourself — a Celery task with its own backoff, a
request that must answer inside a page load — turn it off and read
`retry_after` off the exception:

```python
kj = Kaaljyoti(api_key=api_key, max_retries=0)
```

A refused request costs no credits, so a retry that gets refused again costs
nothing but latency. **The SDK sleeps in-process while it waits** (`time.sleep`),
so `max_retries=2` on a 429 with a 30-second `Retry-After` can hold a web
request for a minute; inside a request handler, `max_retries=0` and a job queue
is the better shape.

## 7. Dates and wall clocks

The single most common integration bug is sending an instant where a wall clock
belongs. A birth time is a wall clock — `1990-05-14T10:30:00` means half past ten
_where the birth happened_ — and an instant knows nothing about where it was.

> **`datetime.fromtimestamp(ts, timezone.utc).isoformat()` on a birth is
> wrong.** It sends the UTC time of that moment, which is the birth time only in
> London and five and a half hours out in India. That is not a rounding error:
> it moves the ascendant by most of the zodiac.

Python ships the IANA zone database as `zoneinfo`, so the SDK can convert an
instant for you. Four pure functions:

```python
from datetime import datetime, timezone

from kaaljyoti import format_wall_clock, from_wall_clock, to_wall_clock, utc_offset_at

# A datetime whose fields already are the clock at the place — a date and a
# time typed into a form. Written out as they stand:
format_wall_clock(datetime(1990, 5, 14, 10, 30))
# '1990-05-14T10:30:00'

# An instant from anywhere else — a UTC database column, another API — turned
# into the clock that was on the wall at the place:
to_wall_clock(datetime(1990, 5, 14, 5, 0, tzinfo=timezone.utc), "Asia/Kolkata")
# '1990-05-14T10:30:00'

# The reverse, given meta.timezone.utc_offset from an answer:
from_wall_clock("1990-05-14T10:30:00", "+05:30")
# datetime(1990, 5, 14, 5, 0, tzinfo=timezone.utc)

# The offset a zone was on at an instant, for birth.utc_offset:
utc_offset_at(datetime(1944, 3, 15, 10, 0, tzinfo=timezone.utc), "Asia/Kolkata")
# '+06:30' — India's war time, not today's +05:30
```

`format_wall_clock()` reads `year`…`second` and does not convert, which is
correct precisely when those fields already are the clock at the place and wrong
for a `datetime` that came from a clock somewhere else — use `to_wall_clock()`
for that one. `to_wall_clock()` and `utc_offset_at()` refuse a naive `datetime`
with a `ValueError`, because it names no instant; `from_wall_clock()` refuses
anything that is not `YYYY-MM-DDTHH:MM:SS` and `+HH:MM`, because a silently
wrong chart is worse than an exception. On Windows, `zoneinfo` needs the
`tzdata` package for its zone data.

For a zone **name** from a pair of coordinates, ask the API — it costs no credits:

```python
zone = kj.timezone(28.6139, 77.209, "1944-03-15T10:00:00")
zone.data.utc_offset  # '+06:30'
```

Or send no zone at all and let the API derive it from the coordinates;
`meta.timezone.source` then says `derived`. More on this on the
[time zones](https://kaaljyoti.com/api/docs/timezones) page.

## 8. Charts as SVG

The same endpoint answers either way:

```python
from kaaljyoti import ChartStyle, KundliChartRequest

# The document: metadata plus the markup in `data.svg`.
document = kj.kundli.chart(KundliChartRequest(birth=birth, style=ChartStyle.NORTH, size=360))
document.data.style  #  'north'
document.data.svg  #  '<svg …'

# The markup itself. `data` is a str, and `meta` is None.
svg = kj.kundli.chart_svg(KundliChartRequest(birth=birth, size=360))
Path("chart.svg").write_text(svg.data, encoding="utf-8")
```

`first_house` rotates the chart: `lagna` (the default), a graha — `moon` draws
the Chandra kundli, `sun` the Surya kundli — or `house_2` … `house_12` for
bhavat bhavam. It works in every varga, and the grahas never move; the document
echoes `first_house`, names the sign drawn as house 1 in `first_house_sign` and
says what the chart is in `title`:

```python
chart = kj.kundli.chart(KundliChartRequest(birth=birth, first_house="moon"))
chart.data.first_house_sign.id  #  the Moon's sign, now house 1
chart.data.title  #  'Moon chart'
```

Put it straight into a page — the markup colours itself from the same sixteen
custom properties (`--kj-bg`, `--kj-lagna`, `--kj-planet-sun`, …) that
[`@kaaljyoti/widgets`](https://www.npmjs.com/package/@kaaljyoti/widgets) uses, so
an inlined chart takes the page's theme (in a Jinja or Django template, mark it
safe). The body is always decoded as UTF-8. A failure is an envelope whatever
`Accept` asked for, so `chart_svg` raises the same `KaaljyotiError` as
everything else.

## 9. Matching in bulk

`match.batch` takes up to 100 pairs and charges 1 credit per pair. **A pair that
could not be computed comes back as a value, not as a raised exception** — the
other pairs were calculated and charged, and raising would discard answers you
have already paid for:

```python
from kaaljyoti import MatchBatchRequest, MatchBatchRequestPairsItem

answer = kj.match.batch(
    MatchBatchRequest(
        pairs=[
            MatchBatchRequestPairsItem(bride=bride_birth, groom=groom_birth),
            MatchBatchRequestPairsItem(bride=bride_birth, groom=other_birth),
        ]
    )
)

for result in answer.data.results:
    if result.error is not None:
        print(f"pair {result.index}: {result.error.code} {result.error.field}")
        continue
    print(f"{result.index}: {result.data.total if result.data else '?'} / 36")

answer.meta.credits  #  what the request cost: one per pair
```

Only the whole request failing — a bad key, a body over the 8 KB limit, the rate
limit — raises. In practice that 8 KB allows about thirty pairs per request, not
a hundred. Batch is closed to publishable keys.

## 10. HTTP clients

The package has **no runtime dependencies**: nothing it installs can clash with
the versions your application pins. HTTP is a one-method protocol,
`kaaljyoti.HttpClient`, with three ways to satisfy it.

**`urllib`, the default.** Nothing to install or configure. Redirects are not
followed — the API never redirects, and following one would re-send the key to
wherever it points. For a proxy or a custom TLS context, pass your own opener:

```python
import urllib.request

from kaaljyoti import Kaaljyoti, UrllibClient

opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"https": "http://proxy.internal:3128"})
)
kj = Kaaljyoti(api_key=api_key, http_client=UrllibClient(opener))
```

**An `httpx.Client` you already have.** Its proxies, connection pool, limits
and event hooks apply; `pip install 'kaaljyoti[httpx]'`. httpx is imported only
when you use this class. The `timeout_seconds` option is applied per request,
over the client's own:

```python
import httpx

from kaaljyoti import HttpxClient, Kaaljyoti

with httpx.Client(http2=False, event_hooks={"request": [trace]}) as http:
    kj = Kaaljyoti(api_key=api_key, http_client=HttpxClient(http))
    answer = kj.kundli.get(request)
```

**Your own.** A class with one method; no inheritance needed, because
`HttpClient` is a `Protocol`:

```python
from kaaljyoti import HttpRequest, HttpResponse, TransportError


class RequestsClient:
    def __init__(self, session: requests.Session) -> None:
        self.session = session

    def send(self, request: HttpRequest) -> HttpResponse:
        try:
            answer = self.session.request(
                request.method,
                request.url,
                headers=dict(request.headers),
                data=request.body,
                timeout=request.timeout_seconds,
                allow_redirects=False,
            )
        # A dead socket must raise, never come back as an invented status:
        # the SDK retries a transport failure on a different budget than a 500.
        except requests.Timeout as error:
            raise TransportError(str(error), timed_out=True) from error
        except requests.RequestException as error:
            raise TransportError(str(error)) from error
        return HttpResponse(answer.status_code, dict(answer.headers), answer.content)
```

An implementation does not retry, does not touch the key or the headers and does
not interpret the body: the transport owns all of that, so every client behaves
identically. A `4xx` or `5xx` is an answer and comes back as an `HttpResponse`;
only "no answer at all" is a `TransportError`.

## 11. Options

```python
kj = Kaaljyoti(
    api_key=api_key,
    timeout_seconds=10.0,
    max_retries=1,
)
```

All options are keyword-only.

| Option            | Type                        | Default                     | What it does                                                                          |
| ----------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `api_key`         | `str`                       | — (required)                | Placed by its prefix; see [keys](#3-keys). An empty key is refused before the network |
| `base_url`        | `str \| None`               | `https://api.kaaljyoti.com` | Origin only; a trailing `/` or `/v1` is trimmed for you                               |
| `http_client`     | `HttpClient \| None`        | a new `UrllibClient`        | Your own transport; see [HTTP clients](#10-http-clients)                              |
| `timeout_seconds` | `float`                     | `30.0`                      | Deadline **per attempt**, not per call                                                |
| `max_retries`     | `int`                       | `2`                         | `0` turns retrying off entirely                                                       |
| `client_tag`      | `str \| None`               | `sdk-python/<version>`      | The `X-KJ-Client` tag, so a shell built on this SDK attributes usage to itself        |
| `headers`         | `Mapping[str, str] \| None` | `None`                      | Extra headers on every request. Cannot override the key, `Accept` or the tag          |

The SDK sends `User-Agent: kaaljyoti-python/<version>` unless `headers` carries
one of your own; the edge in front of the API refuses the standard library's
default `Python-urllib` signature.

`Kaaljyoti` is a context manager. Leaving the block closes the HTTP client the
SDK created for itself; one you passed in stays yours to close:

```python
with Kaaljyoti(api_key=api_key) as kj:
    answer = kj.kundli.get(request)
```

`headers` is also how a server-side process uses a publishable key at all — the
gateway wants an `Origin`, and Python is not a browser:

```python
kj = Kaaljyoti(api_key=publishable_key, headers={"Origin": "https://example.com"})
```

### Staging

One option, no separate build:

```python
kj = Kaaljyoti(
    api_key=os.environ["KAALJYOTI_TEST_KEY"],  # a kj_test_… key
    base_url="https://api-staging.kaaljyoti.com",
)
```

The package's own smoke test runs against staging and is opt-in (plain `pytest`
deselects it):

```sh
KJ_SMOKE=1 KJ_API_KEY=kj_pub_… pytest -m smoke
```

It reads `KJ_BASE_URL` (default staging) and, for a publishable key, `KJ_ORIGIN`
(default `http://localhost:3000`), which it sends as `Origin` because a Python
process does not send one of its own.

## 12. Labelled ids

Every id the gateway recognises arrives as a `LabelledId` — `id`, `name` and an
optional `names` — and is typed that way: `lagna_sign`, `moon_sign`, every
`*_nakshatra` and `*_lord`, `planet` / `sign` / `nakshatra` inside `positions`,
and so on.

```python
sun = answer.data.positions["sun"]
sun.sign.id  #  'aries'  ← the stable half: switch on this
sun.sign.name  #  'Aries'  ← for people, in the first language you asked for
sun.sign.names["hi"]  #  'मेष'    ← present when you asked for more than one
str(sun.sign)  #  'Aries'
```

`LabelledId` is a frozen dataclass, so two ids with the same `id`, `name` and
`names` compare equal with `==`. The constants the API's closed enums accept are
generated beside the models — `Ayanamsa.LAHIRI`, `Varga.D9`, `ChartStyle.NORTH`,
`HouseSystem.WHOLE_SIGN` (the kundli PDF's `house_system`), and `.VALUES` on each
for a form's choices. They are plain strings, and the fields stay `str`, so a
slug from a form or a database still goes in as it is.

---

Generated from OpenAPI document version **0.15.2**
(`kaaljyoti.OPENAPI_VERSION`, beside `kaaljyoti.SDK_VERSION`).
`pnpm --filter sdk-python run gen` regenerates `src/kaaljyoti/generated/`, and CI fails when the generated code and the snapshot disagree.

MIT licensed. Issues and pull requests:
[kaaljyoti-integrations](https://github.com/goappsters/kaaljyoti-integrations).
