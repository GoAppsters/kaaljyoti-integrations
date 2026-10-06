# @kaaljyoti/sdk

The typed TypeScript client for the [Kaal Jyoti API](https://kaaljyoti.com/api) —
kundli, panchang, dasha, vargas, KP, Jaimini, varshphal, transits, matching,
horoscopes, written readings and printable PDFs.
One class, one method per endpoint, every request and response typed from the
API's own OpenAPI document. No calculation happens here: the package adds auth,
retries, error mapping and the types, and gets out of the way.

Node 18+, browsers and edge runtimes. ESM with a CommonJS build beside it.

## 1. Install

```sh
npm install @kaaljyoti/sdk
```

```sh
pnpm add @kaaljyoti/sdk
```

## 2. Quick start

```ts
import { Kaaljyoti } from '@kaaljyoti/sdk';

const kj = new Kaaljyoti({ apiKey: process.env.KAALJYOTI_API_KEY! });

const { data, meta } = await kj.kundli.get({
  birth: {
    datetime: '1990-05-14T10:30:00', // wall clock at the birth place
    timezone: 'Asia/Kolkata',
    latitude: 28.6139,
    longitude: 77.209,
    place: 'New Delhi',
  },
  options: { ayanamsa: 'lahiri', language: 'en' },
});

console.log(data.ascendant_dms); //  99°02'48.2"
console.log(meta?.timezone); // { name: 'Asia/Kolkata', utc_offset: '+05:30', source: 'given' }
```

Two details in that body are the whole contract, and they are the two people
get wrong:

- **`datetime` is the clock on the wall where the birth happened**, not UTC and
  not your server's zone. If you are starting from a `Date`, convert it with
  [`toWallClock`](#7-dates-and-wall-clocks) — do not call `toISOString()`.
- **Give `timezone` or `utc_offset`, or neither — never both.** With neither,
  the API derives the zone from the coordinates and `meta.timezone.source` says
  `derived`. Giving both is a `400`.

Everything else has a default, and `options` can be left out entirely. The
[quick start](https://kaaljyoti.com/api/docs/quick-start) covers the same ground
in curl and Python.

If you dislike `new`, `createClient(options)` is the same thing as a function:

```ts
import { createClient } from '@kaaljyoti/sdk';

export const kj = createClient({ apiKey: process.env.KAALJYOTI_API_KEY! });
```

## 3. Keys

Create one in the [dashboard](https://kaaljyoti.com/api/dashboard/keys). You see
the whole key once — only its SHA-256 is stored — so put it where your code can
read it:

```sh
export KAALJYOTI_API_KEY="kj_live_…"
```

The SDK does not read the environment for you; pass `apiKey` explicitly, so a
process with two keys in it cannot pick the wrong one by accident.

| Prefix      | What it is                          | Where the SDK puts it   | Safe in a browser |
| ----------- | ----------------------------------- | ----------------------- | ----------------- |
| `kj_live_…` | Your production secret key          | `Authorization: Bearer` | **No**            |
| `kj_test_…` | A second secret key, for staging    | `Authorization: Bearer` | **No**            |
| `kj_pub_…`  | Publishable, locked to your origins | `?key=…` in the query   | Yes               |

The prefix decides the placement; you never choose it. A browser cannot set
`Authorization` on a cross-origin request without a preflight the gateway does
not grant, so a publishable key travels in the query — and the gateway refuses a
secret key in a query string outright, which is the backstop for the mistake
this table exists to prevent.

**A publishable key in front-end code is fine and intended.** It only works from
the origins you listed on it, it cannot reach the heavy endpoints, and it can be
rotated from the dashboard. **A `kj_live_…` or `kj_test_…` key in anything a
browser downloads is a leak**, whatever bundler or environment-variable trick
put it there. Nothing in this package ever logs a key or puts one in an error
message. See
[authentication](https://kaaljyoti.com/api/docs/authentication).

## 4. Every method

Grouped the way the paths are, so a path in the docs is a method here without
looking anything up. What each one costs is in
[Credits per API](https://kaaljyoti.com/api/docs/credits): **a calculation
costs 1 credit, a written reading 5, a scan across time 10 or 20, a PDF 500 or
1,000**; a refusal costs nothing, and a cache hit costs the same as any other
answer. Every plan can call every method — the credits do the limiting — except
that PDFs are not on the Free plan.

### Service, reference and places

| Method                     | Path                       | Cost              |
| -------------------------- | -------------------------- | ----------------- |
| `kj.health()`              | `GET /v1/health`           | Free, no key      |
| `kj.reference(list, opts)` | `GET /v1/reference/{list}` | Free, wants a key |
| `kj.timezone(query)`       | `GET /v1/timezone`         | Free, wants a key |
| `kj.places(query)`         | `GET /v1/places`           | 1 credit a search |

```ts
const { data } = await kj.reference('signs', { language: ['en', 'hi'] });
// language: 'hi' or ['en', 'hi'] — the array is joined with commas for you

const zone = await kj.timezone({ lat: 28.6139, lon: 77.209 });
// { name: 'Asia/Kolkata', utc_offset: '+05:30', source: 'derived' }
```

`kj.places({ q, country?, limit?, language? })` searches place names and answers
each match with its coordinates and IANA `timezone` — the fields a `birth`
wants. `limit` is 1–25 (default 10); `language` works as for `reference`. It
costs 1 credit per search, so search on a pause in typing, not on every key.

`list` is one of `ayanamsas`, `planets`, `signs`, `nakshatras`, `tithis`,
`yogas`, `karanas`, `vargas`, `dasha-systems`, `house-systems`,
`chalit-systems`, `transit-events`, `languages`, `credits`.

`credits` is the price list in force: one `{ route, credits, per? }` row per
metered route, where `per` is `'pair'` or `'part'` on the two routes priced per
unit.

```ts
const { data: prices } = await kj.reference('credits');
// [{ route: '/v1/kundli', credits: 1 }, { route: '/v1/match/batch', credits: 1, per: 'pair' }, …]
```

### `kj.kundli` — 1 credit each

| Method                 | Path                             |
| ---------------------- | -------------------------------- |
| `kundli.get`           | `POST /v1/kundli`                |
| `kundli.chart`         | `POST /v1/kundli/chart`          |
| `kundli.dasha`         | `POST /v1/kundli/dasha`          |
| `kundli.vargas`        | `POST /v1/kundli/vargas`         |
| `kundli.chalit`        | `POST /v1/kundli/chalit`         |
| `kundli.yogas`         | `POST /v1/kundli/yogas`          |
| `kundli.shadbala`      | `POST /v1/kundli/shadbala`       |
| `kundli.bhavaBala`     | `POST /v1/kundli/bhava-bala`     |
| `kundli.ashtakavarga`  | `POST /v1/kundli/ashtakavarga`   |
| `kundli.grahaDrishti`  | `POST /v1/kundli/graha-drishti`  |
| `kundli.maitri`        | `POST /v1/kundli/maitri`         |
| `kundli.pace`          | `POST /v1/kundli/pace`           |
| `kundli.specialLagnas` | `POST /v1/kundli/special-lagnas` |
| `kundli.tripataki`     | `POST /v1/kundli/tripataki`      |
| `kundli.sarvatobhadra` | `POST /v1/kundli/sarvatobhadra`  |
| `kundli.nakshatra28`   | `POST /v1/kundli/nakshatra28`    |
| `kundli.sadeSati`      | `POST /v1/kundli/sade-sati`      |
| `kundli.events`        | `POST /v1/kundli/events`         |
| `kundli.kotaChakra`    | `POST /v1/kundli/kota-chakra`    |

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
then adds `tara_bala` and `chandra_bala`) **or** a place and an optional `date`.

The panchang's names — `tithi_name`, `yoga_name`, `karana_name`, `paksha`,
`vara`, `masa.month_name` and each of `tithis[]` — are `LabelledId`s like a
nakshatra: `id` is a lower-case slug (`shashthi`, `somavara`), `name` is in the
first language asked for, and `names` has both when two were asked for. A leap
month is `is_adhik` on the masa, not part of its name.

### `kj.jaimini`, `kj.kp` — 1 credit each

| Method                | Path                            |
| --------------------- | ------------------------------- |
| `jaimini.karakas`     | `POST /v1/jaimini/karakas`      |
| `jaimini.arudhaPadas` | `POST /v1/jaimini/arudha-padas` |
| `jaimini.aspects`     | `POST /v1/jaimini/aspects`      |
| `jaimini.karakamsha`  | `POST /v1/jaimini/karakamsha`   |
| `kp.chart`            | `POST /v1/kp/chart`             |

The four Jaimini sections are one document split four ways: asking for the
second section of the same chart is a cache hit, and still costs its own credit.
The five `varshphal` sections work the same way.

### `kj.varshphal` — 1 credit each

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

`transit.events` is the calendar of a `year` (or a `from`…`to` window of at most
366 days), the same for everyone: every sign ingress and every retrograde and
direct station, sorted by time. It takes no birth — only a `timezone` for the
local times — and `moon`, `nakshatras` and `combustion` add more kinds.

```ts
const { data: sky } = await kj.transit.events({ year: 2026, timezone: 'Asia/Kolkata' });
for (const event of sky.events) console.log(event.local, event.planet.id, event.kind);
```

### `kj.reports`, `kj.horoscope` — 5 credits each

| Method                | Path                           | Cost               |
| --------------------- | ------------------------------ | ------------------ |
| `reports.lagna`       | `POST /v1/reports/lagna`       | 5 credits          |
| `reports.nakshatra`   | `POST /v1/reports/nakshatra`   | 5 credits          |
| `reports.houseLords`  | `POST /v1/reports/house-lords` | 5 credits          |
| `reports.grahas`      | `POST /v1/reports/grahas`      | 5 credits          |
| `reports.yogas`       | `POST /v1/reports/yogas`       | 5 credits          |
| `reports.vimshottari` | `POST /v1/reports/vimshottari` | 5 credits          |
| `reports.varshphal`   | `POST /v1/reports/varshphal`   | 5 credits          |
| `reports.lifeAreas`   | `POST /v1/reports/life-areas`  | 5 credits          |
| `reports.kundli`      | `POST /v1/reports/kundli`      | 5 credits per part |
| `horoscope`           | `POST /v1/horoscope`           | 5 credits          |

Written text rather than numbers, on every plan, and all of them are open to
publishable keys.
Every text is an object keyed by language — exactly the languages in
`options.language`, in the order asked for — and the answer ends with a
`disclaimer` in the same languages.

```ts
// A reading: send a `birth`, or name the `sign` (or `nakshatra`) directly.
const { data: reading } = await kj.reports.lagna({
  sign: 'leo',
  options: { language: ['en', 'hi'] },
});
reading.lagna?.entry.text.hi; //  'सिंह लग्न होने पर …'
reading.disclaimer?.en; //  'These predictions are indicative. For a reading of your own chart, consult an astrologer.'

// The house lords: a `birth` only. Twelve houses in order, one request.
const { data: lords } = await kj.reports.houseLords({ birth });
for (const { house, sign, lord, in_house, entry } of lords.house_lords ?? []) {
  // 1 'gemini' 'mercury' 9 'Your lagna lord in the 9th, …'
  console.log(house, sign.id, lord.id, in_house, entry.text.en);
}

// The grahas and the yogas of a birth: one reading per graha (its sign and its
// house), one per yoga that forms (named by `code`, e.g. 'gaja_kesari').
const { data: grahas } = await kj.reports.grahas({ birth });
grahas.grahas?.[0]?.in_sign.text.en; //  'Your Sun is in Aries, …'
const { data: yogas } = await kj.reports.yogas({ birth });
yogas.yogas?.map((yoga) => yoga.name?.en); //  ['Gaja-Kesari Yoga', 'Sunapha Yoga', …]

// The Vimshottari mahadashas of the life, each with a level; one is current.
const { data: dashas } = await kj.reports.vimshottari({ birth });
const now = dashas.periods.find((period) => period.current);
console.log(now?.lord.id, now?.from, now?.to, now?.level, now?.text.en);

// The year from the birthday in `year` (Tajika): a summary, seven areas, and
// its periods (mudda dasha) with their dates and levels.
const { data: year } = await kj.reports.varshphal({ birth, year: 2026 });
console.log(
  year.summary.level,
  year.areas.map((a) => [a.area, a.level]),
  year.months.length,
);

// Eleven areas of life, and which are the strongest and which need care.
const { data: life } = await kj.reports.lifeAreas({ birth });
life.summary.strongest; //  ['foreign', 'marriage']

// Several of them in one request: `parts` (default all eight), each part as
// its own route answers it, priced 5 credits per part. Without a `year` the
// varshphal is the one running now.
const { data: report, meta } = await kj.reports.kundli({ birth, parts: ['lagna', 'vimshottari'] });
report.parts; //  ['lagna', 'vimshottari']
report.vimshottari?.periods.find((p) => p.current);
meta?.credits; //  10

// A horoscope: a sign and a period — daily (default), weekly, monthly or yearly.
const { data } = await kj.horoscope({
  sign: 'aries',
  period: 'daily',
  date: '2026-09-28',
  timezone: 'Asia/Kolkata', // where the day starts; or utc_offset
});
data.from; //  '2026-09-27T18:30:00.000Z' — the period as UTC instants
console.log(data.summary.level, data.summary.text.en);
for (const { area, level, text } of data.areas) {
  // 'work' 'mixed' 'Today, the working mood is uneven; …'
  console.log(area, level, text.en);
}
```

Every summary and area has a `level` — `favourable`, `mixed` or `care` — and a
text; there are no scores or percentages. `basis` (on the horoscope, the
Vimshottari, varshphal and life-areas readings) is the reasoning behind them —
for the horoscope, each transit with its `house` from the chosen sign and the
`entered` / `leaves` instants — and is for you, not for the reader. The
Vimshottari periods also carry their `antardashas`.

**The disclaimer** is `options.disclaimer`, accepted on every route and
answered only by these reports:

```ts
await kj.horoscope({ sign: 'leo', options: { disclaimer: 'default' } });
// "… consult an astrologer."

await kj.horoscope({
  sign: 'leo',
  options: { disclaimer: { name: 'Acharya Amit Verma', url: 'https://kaaljyoti.com' } },
});
// "… consult Acharya Amit Verma (https://kaaljyoti.com)."

await kj.horoscope({ sign: 'leo', options: { disclaimer: 'off' } });
// no `disclaimer` in the answer
```

`name` is 1–80 characters; `url` is optional, at most 200. The type is
`DisclaimerOption`.

### `kj.pdf` — 500 or 1,000 credits each · every paid plan

| Method              | Path                          | Body of                    |
| ------------------- | ----------------------------- | -------------------------- |
| `pdf.kundli`        | `POST /v1/pdf/kundli`         | `POST /v1/kundli`          |
| `pdf.match`         | `POST /v1/pdf/match`          | `POST /v1/match/ashtakoot` |
| `pdf.varshphal`     | `POST /v1/pdf/varshphal`      | `POST /v1/varshphal`       |
| `pdf.panchangMonth` | `POST /v1/pdf/panchang/month` | `POST /v1/panchang/month`  |

A finished, printable PDF instead of JSON. Each takes the JSON route's body
plus `template` (`classic`, `modern`, `minimal`, `traditional`) and `branding`;
the kundli, match and varshphal also take `chart_style` and `name` (the match
adds `partner_name`), and the kundli takes `edition` (`basic`, the default, or
`professional`), `sections` and `vargas`. The kundli PDF costs 1,000 credits
and the others 500, and each uses one PDF from the month's allowance (Starter
50, Growth 200, Scale 500, Enterprise 2,500); past it the error is
`pdf_quota_exceeded`. PDFs are on every paid plan and not on Free, which
answers `403 plan_required`. A publishable key cannot make one, and `branding`
in the body is Enterprise only. See [PDFs](https://kaaljyoti.com/api/docs/pdf).

The answer is the file, not an envelope: `data` is a `PdfFile` and `meta` is
`null`.

```ts
import { writeFile } from 'node:fs/promises';

const {
  data: file,
  cached,
  creditsRemaining,
} = await kj.pdf.kundli({
  birth,
  name: 'Ravi Kumar',
  edition: 'professional',
  template: 'traditional',
  options: { language: ['en', 'hi'], house_system: 'kp' },
});

file.bytes; //  Uint8Array — the PDF itself
file.filename; //  'kundli-ravi-kumar.pdf', from Content-Disposition
file.credits; //  1000, from X-KJ-Credits
cached; //  true when the 24-hour cache answered: no PDF used, still 1,000 credits
creditsRemaining; //  what is left this month, packs included

await writeFile(file.filename ?? 'kundli.pdf', file.bytes);
// In a browser: URL.createObjectURL(new Blob([file.bytes], { type: file.contentType }))
```

A failure is the usual JSON error and throws a `KaaljyotiError`, never a PDF.

The kundli PDF's `options` are a `PdfKundliOptions`: `CalculationOptions` plus
`house_system` (a `HouseSystem`), the bhava chalit it prints (default
`placidus`). No other route takes a house system — the API answers `400` to
`options.house_system` anywhere else — and `POST /v1/kundli/chalit` has its own
`system`. `Ayanamsa` and `Varga` name the 47 ayanamsa slugs and the 16 varga ids
(`d1` … `d60`) the API accepts.

Every POST method takes `(body, { signal })`, where `signal` is an
`AbortSignal` of your own; the client's own timeout still applies alongside it.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 2_000);

const yogas = await kj.kundli.yogas({ birth }, { signal: controller.signal });
```

Namespaces are plain objects, so destructuring works and keeps working:

```ts
const { kundli, panchang } = kj;
const chart = await kundli.get({ birth });
```

## 5. What comes back

Every method resolves to the envelope, flattened by one level — `data` and
`meta` together, because `meta` is how you answer a user who asks why a number
is what it is:

```ts
const answer = await kj.kundli.get({ birth });

answer.data; //  the calculation, typed per endpoint
answer.meta; //  ayanamsa, timezone, engine, compute_ms, language_fallback, credits
answer.requestId; //  'X-KJ-Request-Id' — quote it to support
answer.plan; //  the plan this answer was served under
answer.cached; //  true when the 24-hour cache answered. Costs the same credits.
answer.credits; //  'X-KJ-Credits' — what this request cost, as meta.credits says
answer.creditsRemaining; //  'X-KJ-Credits-Remaining' — secret keys only
answer.rateLimit; //  { limit, remaining, reset } — the bucket, as it stands
```

`meta` is `null` on the answers that carry none: `kj.health()`, a chart asked
for as SVG, and a PDF. `requestId`, `plan` and the `rateLimit` numbers are `null`
when the gateway did not send the header — a proxy in front of it, usually.

`credits` is what the request cost, on every metered answer — the same number
as `meta.credits`, and the only place an SVG or a PDF says it. It is `null` on
the free answers (health, time zone, the reference tables). `creditsRemaining`
is what is left of the month and of your credit packs together; the API sends
it to **secret keys only**, so it is always `null` with a `kj_pub_…` key — a
page's visitors do not get to read the account's balance.

Inside `data`, every id comes back with a name attached —
`{ id: 'cancer', name: 'Cancer' }` — and asking for two languages
(`options.language: ['en', 'hi']`) adds `names: { en, hi }`. The `id` is the
stable half; the `name` is for people. See
[labelled ids](#11-labelled-ids) for how the types describe this.

## 6. Errors

Every failure — from the gateway or from the network — is a thrown
`KaaljyotiError`:

```ts
import { isKaaljyotiError, isRetryable, KaaljyotiError } from '@kaaljyoti/sdk';

try {
  await kj.kundli.get({ birth });
} catch (error) {
  if (!isKaaljyotiError(error)) throw error;

  switch (error.code) {
    case 'validation_error':
      return showFieldError(error.field); // 'birth.utc_offset'
    case 'quota_exceeded':
      return askToUpgrade(error.docs);
    default:
      console.warn(error.code, error.status, error.requestId);
      if (isRetryable(error)) scheduleRetry(error.retryAfter ?? 60);
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
| `retryAfter` | Seconds from `Retry-After`, on a `429`                        |

The codes are the API's own — `validation_error`, `invalid_key`, `key_revoked`,
`quota_exceeded`, `pdf_quota_exceeded`, `forbidden_origin`, `plan_required`, `not_found`,
`not_computable`, `rate_limited`, `engine_error`, `service_disabled` — plus
three this package adds for failures that never reached the API:
`network_error`, `timeout` and `bad_response`. One `switch` handles both kinds.
`isKaaljyotiError(x)` is a type guard; `isRetryable(x)` says whether sending the
identical request again is worth anything.

### Retries

`maxRetries` is `2` by default, and the budget is spent per reason:

- **`429 rate_limited`** — waits what `Retry-After` said (capped at 30 seconds)
  and tries again, up to `maxRetries` times.
- **`500 engine_error`** — one more try. Our fault, and often transient.
- **A network failure or a timeout** — one more try.
- **`400`, `401`, `402`, `403`, `422`** — never. The identical body will be
  refused identically, and retrying only spends your time.

Every endpoint is a pure calculation, which is what makes retrying a `POST` safe
at all. To do the waiting yourself, turn it off and read `retryAfter` off the
error:

```ts
const kj = new Kaaljyoti({ apiKey, maxRetries: 0 });
```

A refused request costs no credits, so a retry that gets refused again costs
nothing but latency.

## 7. Dates and wall clocks

The single most common integration bug is sending an instant where a wall clock
belongs. A birth time is a wall clock — `1990-05-14T10:30:00` means half past
ten _where the birth happened_ — and a JavaScript `Date` is an instant, which
knows nothing about where it was.

> **`date.toISOString()` on a birth is wrong.** It sends the UTC time of that
> moment, which is the birth time only in London and five and a half hours out
> in India. That is not a rounding error: it moves the ascendant by most of the
> zodiac.

So convert explicitly:

```ts
import { toWallClock, fromWallClock, utcOffsetAt } from '@kaaljyoti/sdk';

toWallClock(new Date('1990-05-14T05:00:00Z'), 'Asia/Kolkata');
// '1990-05-14T10:30:00'  ← exactly what birth.datetime wants

fromWallClock('1990-05-14T10:30:00', '+05:30');
// Date 1990-05-14T05:00:00.000Z  ← the reverse, given meta.timezone.utc_offset

utcOffsetAt(new Date('1944-03-01T00:00:00Z'), 'Asia/Kolkata');
// '+06:30'  ← the war-time offset, which is why you name a zone, not an offset
```

All three are pure, dependency-free and built on `Intl`. They throw `RangeError`
on an invalid date or an unknown zone, because a silently wrong chart is worse
than a throw. More on this on the
[time zones](https://kaaljyoti.com/api/docs/timezones) page.

## 8. Charts as SVG

`kundli.chart` answers either way, and the overload decides which:

```ts
// The document: metadata plus the markup in `data.svg`.
const { data } = await kj.kundli.chart({ birth, style: 'north', size: 360 });
data.style; //  'north'
data.svg; //  '<svg …'

// The markup itself. `data` is a string, and `meta` is null.
const { data: svg } = await kj.kundli.chart({ birth, size: 360 }, { format: 'svg' });
container.innerHTML = svg;
```

`first_house` rotates the chart: `lagna` (the default), a graha — `moon` draws
the Chandra kundli, `sun` the Surya kundli — or `house_2` … `house_12` for
bhavat bhavam. It works in every varga, and the grahas never move; the document
echoes `first_house`, names the sign drawn as house 1 in `first_house_sign` and
says what the chart is in `title`:

```ts
const { data } = await kj.kundli.chart({ birth, first_house: 'moon' });
data.first_house_sign.id; //  the Moon's sign, now house 1
data.title; //  'Moon chart'
```

The SVG colours itself from the same sixteen custom properties
(`--kj-bg`, `--kj-lagna`, `--kj-planet-sun`, …) that
[`@kaaljyoti/widgets`](https://www.npmjs.com/package/@kaaljyoti/widgets) uses, so
an inlined chart takes the page's theme.

## 9. Matching in bulk

`match.batch` takes up to 100 pairs and charges 1 credit per pair. **A pair that
could not be computed comes back as a value, not as a thrown error** — the other
pairs were calculated and charged, and throwing would discard answers you have
already paid for:

```ts
const { data, meta } = await kj.match.batch({
  pairs: [
    { bride: brideBirth, groom: groomBirth },
    { bride: brideBirth, groom: otherBirth },
  ],
});

for (const result of data.results) {
  if (result.error) {
    console.warn(`pair ${result.index}: ${result.error.code}`, result.error.field);
    continue;
  }
  console.log(result.index, result.data);
}

meta?.credits; //  what the request cost: one per pair
```

Only the whole request failing — a bad key, a body over the 8 KB limit, the rate
limit — throws. In practice that 8 KB allows about thirty pairs per request, not
a hundred.

## 10. Options

```ts
const kj = new Kaaljyoti({
  apiKey: process.env.KAALJYOTI_API_KEY!,
  timeoutMs: 10_000,
  maxRetries: 1,
});
```

| Option       | Type                    | Default                     | What it does                                                                          |
| ------------ | ----------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `apiKey`     | `string`                | — (required)                | Placed by its prefix; see [keys](#3-keys). An empty key is refused before the network |
| `baseUrl`    | `string`                | `https://api.kaaljyoti.com` | Origin only; a trailing `/` or `/v1` is trimmed for you                               |
| `fetch`      | `typeof fetch`          | the global                  | For tests, a custom agent, or a runtime with no global                                |
| `timeoutMs`  | `number`                | `30000`                     | Deadline **per attempt**, not per call                                                |
| `maxRetries` | `number`                | `2`                         | `0` turns retrying off entirely                                                       |
| `client`     | `string`                | `sdk-ts/<version>`          | The `X-KJ-Client` tag, so a shell built on this SDK attributes usage to itself        |
| `headers`    | `Record<string,string>` | `{}`                        | Extra headers on every request. Cannot override the key, the `Accept` or the tag      |

### Staging

One option, no separate build:

```ts
const kj = new Kaaljyoti({
  apiKey: process.env.KAALJYOTI_TEST_KEY!, // a kj_test_… key
  baseUrl: 'https://api-staging.kaaljyoti.com',
});
```

The package's own smoke test runs against staging and is opt-in:

```sh
KJ_SMOKE=1 KJ_API_KEY=kj_pub_… pnpm --filter @kaaljyoti/sdk smoke
```

## 11. Labelled ids

Every id the gateway recognises arrives as `LabelledId` — `{ id, name, names? }`
— and is typed that way: `lagna_sign`, `moon_sign`, every `*_nakshatra` and
`*_lord`, `planet` / `sign` / `nakshatra` inside `positions`, and so on. `id` is
the stable machine half; `name` is in the first language you asked for, and
`names` carries one per language when you asked for more than one.

---

Generated from OpenAPI document version **0.15.2**. `pnpm gen` regenerates
`src/generated/openapi.d.ts` from `openapi/openapi.json`, and CI
fails when the two disagree.

MIT licensed. Issues and pull requests:
[kaaljyoti-integrations](https://github.com/amitverm/kaaljyoti-integrations).
