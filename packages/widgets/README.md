# @kaaljyoti/widgets

Twenty-two web components for the [Kaal Jyoti API](https://kaaljyoti.com/api): today's
panchang, the day's windows, a month of panchang, a Hindu calendar converter,
the planets now, a monthly ephemeris, a drawn kundli chart, a birth form with
a tabbed report, an Ashtakoot match form, a horoscope by sign and readings,
and birth calculators — moon sign, lagna, manglik, sade sati, dasha,
divisional charts, KP, Shadbala and Ashtakavarga, life areas, varshphal and
the Vimshottari reading. One script
tag — a loader of about 1 KB that fetches each element's code the first time
a page has one — no framework, no backend. Calculation stays in the API; this package adds
auth, request shapes, caching, error states, English/Hindi chrome and markup.

## 1. Quick start

```html
<script src="https://cdn.kaaljyoti.com/widgets/v1.js" data-key="kj_pub_…" defer></script>

<kj-panchang city="delhi" lang="hi"></kj-panchang>
<kj-muhurta city="mumbai"></kj-muhurta>
<kj-chart
  datetime="1990-05-14T10:30:00"
  timezone="Asia/Kolkata"
  lat="28.6139"
  lon="77.209"
  style="north"
  size="360"
></kj-chart>
<kj-kundli-form></kj-kundli-form>
<kj-match-form></kj-match-form>
<kj-horoscope sign="aries"></kj-horoscope>
<kj-reading type="lagna" sign="leo"></kj-reading>
<kj-moon-sign></kj-moon-sign>
<kj-dasha></kj-dasha>
<kj-transits city="delhi"></kj-transits>
```

The script reads `data-key`, and optionally `data-base`, `data-lang` (`en` or
`hi`), `data-theme` (`auto`, `light` or `dark`) and `data-preset` (`classic`,
`modern`, `minimal`, `traditional`; see §4), `data-powered-by`,
`data-place-provider`, `data-photon-url` and `data-google-maps-key` (see
"Place search" below), `data-time-format` (`12` or `24`), `data-remember`
(`off` to stop the forms remembering the last entry), `data-pricing-url` (where
the plan-required state sends a site owner), `data-proxy`, `data-proxy-all`
and `data-proxy-docs` (see "The server proxy" below), `data-pdf` (the PDF
editions the proxy relays; see "PDF downloads" below), `data-font`
(`inherit` for the page's own font; see §4), `data-sign-icons` (the zodiac
sign icons: a theme or your own images; see §4) and `data-chunks` (see §8). With
`defer`, elements already in the markup load as soon as it runs; elements added
later load when they appear.

## 2. Getting a publishable key

Create one in the [dashboard](https://kaaljyoti.com/api/dashboard/keys) and list the
origins it may be used from — exactly, including scheme and port
(`https://example.com`, `http://localhost:3000`). A publishable key used from an
origin it does not list gets `403 forbidden_origin`, and the widget says which
origin to add. The key is meant to be readable in a page; the origin list is
what protects it. See
[authentication](https://kaaljyoti.com/api/docs/authentication).

## 3. The elements

Shared by all: `lang` (`en` | `hi`, default the script's `data-lang`),
`powered-by` (`shown` | `hidden`; see [Powered by](#powered-by)), `theme`,
`preset`, `font`, `sign-icons`, `heading`, `frame` and `pricing-url` (see §4).

### `<kj-panchang>` — 1 call

Tithi, nakshatra, yoga, karana, sunrise and sunset, the day's windows and the
lunar month for a place.

| Attribute  | Value                                                                                                      | Default         |
| ---------- | ---------------------------------------------------------------------------------------------------------- | --------------- |
| `city`     | A bundled city id: `delhi`, `mumbai`, `kolkata`, `chennai`, `bengaluru`, `hyderabad`, `jaipur`, `varanasi` | —               |
| `lat`      | Degrees, `-90`…`90`. Overrides `city`                                                                      | —               |
| `lon`      | Degrees, `-180`…`180`. Required with `lat`                                                                 | —               |
| `timezone` | IANA zone for `lat`/`lon`; omit and the API derives it                                                     | —               |
| `place`    | A label for the heading                                                                                    | the city's name |
| `date`     | `YYYY-MM-DD`, or `today`                                                                                   | `today`         |
| `show`     | Space-separated subset of `header tithi nakshatra yoga karana sun windows masa`                            | all             |

With neither a `city` nor a `lat`/`lon` pair it renders a "no place" line and
asks for nothing.

### `<kj-muhurta>` — 1 call

The day's choghadiya and windows for a place (`POST /v1/panchang/muhurta`): a
timeline from sunrise through sunset to the next sunrise with the sixteen
choghadiyas on one lane and Rahu kaal, Yamaganda, Gulika and Abhijit on the
other, the windows as a list, and the choghadiyas as a table with a Day /
Night switch, the running one marked. Same place and date attributes as
`<kj-panchang>` (no `show`). Two muhurtas for one place and day are one call.

### `<kj-chart>` — 1 call

A drawn kundli, inlined as SVG so it inherits the page's colours.

| Attribute      | Value                                                       | Default         |
| -------------- | ----------------------------------------------------------- | --------------- |
| `datetime`     | Wall clock at the birth place, `YYYY-MM-DDTHH:MM:SS`        | — (required)    |
| `lat`, `lon`   | Degrees — required unless `city` is given                   | —               |
| `timezone`     | IANA zone; omit and the API derives it from the coordinates | —               |
| `city`         | A bundled city id, instead of `lat`/`lon`                   | —               |
| `place`        | A label for the caption                                     | the city's name |
| `style`        | `north` \| `south` \| `circular`                            | `north`         |
| `chart-style`  | The same, for a page that needs `style` for CSS             | —               |
| `size`         | `200`…`2000`; out-of-range values are clamped               | `360`           |
| `varga`        | `d1`, `d9`, `d10`, …                                        | `d1`            |
| `show-degrees` | `false` to drop the degree labels                           | `true`          |

Without a `datetime` and a place it renders a "no birth" line and asks for
nothing.

`chart.birth = { datetime, timezone, latitude, longitude, place }` sets those
attributes from script in one go; reading `chart.birth` gives back what the
element resolved.

**`lang` on this element re-requests the chart.** The other three carry both
languages in one response and repaint on a language switch; the chart's labels
are drawn into the SVG document by the API, so a `lang` change is a second
call. It is the one exception.

Two identical charts on a page — same birth, same style, size, varga and
language — are one call.

### `<kj-kundli-form>` — a birth form and a tabbed report

The form: name and gender (optional), the date as day / month / year, the time
as hour / minute / AM–PM (or 24-hour with `time-format="24"`), and one place
search box. After a pick the place, its coordinates and its timezone show
under the box; "Edit coordinates" opens them for editing. Each missing field
says so under itself, in English or Hindi, and nothing is sent until the date,
the time and the place are all there. The last entry is remembered on the
device and filled in next time, with a "Clear" link; `remember="off"` turns
that off.

On submit the form folds into one line — "Asha · 14 May 1990, 10:30 ·
Varanasi" and an "Edit details" button that opens it again with what was
typed — and a report opens under it, scrolled into view, in tabs:

| Tab        | Shows                                                                                                           | Calls, on first open                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Overview   | Lagna, Moon sign, nakshatra and pada, the running mahadasha and antardasha, the tithi, yogas, the lagna reading | 3 — `/v1/kundli`, `/v1/kundli/dasha`, `/v1/reports/lagna` |
| Charts     | D1, D9 and the Moon chart (North / South / Circular), and the bhava chalit table                                | 1 per chart and style shown; 1 for chalit                 |
| Planets    | Sign, degree, nakshatra and pada, house; ℞, dignity and vargottama badges                                       | 2 — `/v1/kundli/pace`, `/v1/kundli/vargas`                |
| Dasha      | Vimshottari mahadashas and the running one's antardashas, the current ones marked                               | 0 (the overview's)                                        |
| Life areas | The life-areas reading                                                                                          | 1 — `/v1/reports/life-areas`                              |
| Readings   | Only with `readings`: the `<kj-reading>`s it names                                                              | 1 per reading                                             |

Only the overview loads on submit; each other tab asks the first time it is
opened, so a visitor who reads the overview costs three calls (7 credits: two
calculations and a reading). A tab whose request is refused — the month's
credits have run out — shows a polite "Monthly limit reached" card in its
place; the rest of the report is unaffected.

| Attribute                                         | Value                                                                      | Default          |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| `tabs`                                            | Space-separated: `overview charts planets dasha life-areas`                | all              |
| `show`                                            | 0.1.0's spelling: `summary` = Overview and Planets, `chart` = Charts alone | —                |
| `city`                                            | A bundled city to pre-fill the place with                                  | none             |
| `time-format`                                     | `12` or `24`                                                               | `12`             |
| `remember`                                        | `off` to not remember the last entry on the device                         | on               |
| `chart-style`, `size`                             | Passed to the charts                                                       | see `<kj-chart>` |
| `readings`                                        | Any of the `<kj-reading>` types, below; adds a Readings tab                | off              |
| `disclaimer`, `disclaimer-*`                      | Passed to the readings                                                     | the API's line   |
| `place-provider`, `photon-url`, `google-maps-key` | The place search, below                                                    | `auto`           |

A Google or Photon pick and typed coordinates send no timezone, so the API
derives the historical zone from the coordinates; a Kaal Jyoti search result
and a bundled city send theirs. Submitting the same birth twice costs nothing
the second time: the page memo answers it.

`readings` alone is the lagna and the janma nakshatra; a list (spaces or
commas) names any of `lagna`, `nakshatra`, `house_lords`, `grahas`, `yogas`,
`vimshottari`, `varshphal`, `life_areas`, drawn in that order. Only the last
carries the disclaimer line.

### `<kj-match-form>` — 3 calls per submit

Ashtakoot guna milan. Two birth fieldsets — bride and groom, each with the
kundli form's fields, each remembered separately — side by side on a wide
card and stacked on a phone. The result: the total as a ring out of 36 with
the verdict (green from 25, gold 18–24, red below 18), each person's Moon sign
and nakshatra, the eight kootas with points, a bar and what each looks at, and
each side's Mangal dosha with a warning when only one has it.

| Attribute                                         | Value                                       | Default |
| ------------------------------------------------- | ------------------------------------------- | ------- |
| `city`                                            | A bundled city to pre-fill both places with | none    |
| `time-format`, `remember`                         | As on `<kj-kundli-form>`                    |         |
| `place-provider`, `photon-url`, `google-maps-key` | The place search                            | `auto`  |

After a submit both forms fold into a summary line each, with "Edit details".
Each submit is one `POST /v1/match/ashtakoot` with both births and one
`POST /v1/kundli` per person for the signs; resubmitting the same pair costs
nothing, and switching `lang` repaints from the answers already held.

### Place search (both forms)

The place field is a search box. It searches from the third letter, after a
pause in typing, and a pick fills the coordinates; "Edit coordinates" lets a
visitor type them instead.

Where it searches is `place-provider` on the form, `data-place-provider` on
the script tag, or `configure({ placeProvider })` from npm:

| Value       | Searches                                                            |
| ----------- | ------------------------------------------------------------------- |
| `auto`      | Google Places with a Google Maps key, else Photon (the default)     |
| `google`    | Google Places only (needs a key)                                    |
| `photon`    | Photon only, even with a Google Maps key                            |
| `kaaljyoti` | Kaal Jyoti's own `/v1/places` only: no third party is asked a thing |

Whichever it is, if it fails the form logs one console warning and goes on
with the next one — Google to Photon under `auto`, and anything to
`/v1/places` — for the rest of the page. The search never breaks the form.

- **Photon** — the default without a Google key. [Photon](https://photon.komoot.io)
  is komoot's free, keyless geocoder over OpenStreetMap, and finds villages.
  The search asks it for populated places (`osm_tag=place`, names in English
  where OpenStreetMap has them, else the local name) with no location bias,
  so a birth abroad is found as easily as one in India. A line in the list
  names the district, to tell two villages of one name apart; a pick sends
  "name, state, country" and the coordinates, and the API derives the
  timezone. The list credits "© OpenStreetMap contributors", linked to
  [OpenStreetMap's copyright page](https://www.openstreetmap.org/copyright),
  as OpenStreetMap's licence asks. Searches cost no Kaal Jyoti calls. The
  public server is a free service, so the search is careful with it: one
  request per pause in typing, the one in flight cancelled by new letters,
  the same letters asked once, no retries; an error, a throttle or no answer
  in 4 seconds switches the page to `/v1/places`. A busy site can run its own
  Photon and point `photon-url` (`data-photon-url`, `configure({ photonUrl })`)
  at it; the default is `https://photon.komoot.io`.
- **Google Places** — with a Google key: `google-maps-key="AIza…"` on the
  form, or `data-google-maps-key` on the script tag
  (`configure({ googleMapsKey })` from npm). The Maps JavaScript API is loaded from Google
  once per page, only when someone starts a search, and never bundled. It
  uses the new Places API (Autocomplete Data), so the key needs **Places API
  (New)** and **Maps JavaScript API** enabled, and should be restricted to
  your site's HTTP referrers. Searches are billed to your Google account
  under your key (Google's monthly free usage applies), and cost no Kaal
  Jyoti calls. The suggestion list shows the "Google Maps" attribution Google
  requires. A Google pick sends only the coordinates, so the API derives the
  timezone.
- **Kaal Jyoti** (`kaaljyoti`, and every fallback) — our own place index,
  `GET /v1/places`: every town and city of 1,000 people or more, in English
  or Hindi, with its timezone. Each search costs 1 credit on your key.

What a visitor types in the place box goes to Photon (komoot) or Google,
whichever searches; say so in your privacy policy, or set
`place-provider="kaaljyoti"`.

### `<kj-horoscope>` — 1 call per sign, period and day

For a Moon sign, the horoscope over the period as the API writes it: one
summary first, then one card for each of five areas — work, money,
relationships, health, education — each with a level badge, **Favourable**,
**Mixed** or **Needs care** (अनुकूल, मिश्रित, सावधानी), and a short text that
dates any change inside the period. There are no scores, percentages or lucky
numbers — the API has none, and the widget invents none.

The transits the summaries were read from (`basis` in the answer) are for the
site, not the reader, and are not shown. `show-basis` adds them under the areas,
folded away: each graha, its house from the sign and its sign, favourable or
not, retrograde, and when it enters or leaves a sign inside the period.

A reader picks the sign from the twelve and the period from four tabs (and,
for a day, yesterday, today or tomorrow). Each pick writes the element's own
attribute, so a page can read back what was chosen.

| Attribute         | Value                                                    | Default        |
| ----------------- | -------------------------------------------------------- | -------------- |
| `sign`            | `aries` … `pisces` — preselects the picker               | — (no call)    |
| `period`          | `daily` \| `weekly` \| `monthly` \| `yearly`             | `daily`        |
| `date`            | `YYYY-MM-DD`, or `today`; a week runs seven days from it | `today`        |
| `timezone`        | IANA zone the days are counted in                        | `Asia/Kolkata` |
| `show-basis`      | Present (and not `false`): also list the transits behind | absent         |
| `disclaimer`      | `off` to drop the closing line                           | the API's line |
| `disclaimer-name` | Your astrologer's name, for "consult …" in that line     | —              |
| `disclaimer-url`  | A link shown with the name (`http`/`https`)              | —              |

Without a `sign` it shows the picker and asks for nothing until one is picked.
Times in the answer are instants; the widget shows them in the zone the answer
names, never in the reader's own.

### `<kj-reading>` — 1 call

What a lagna (`type="lagna"`, the default) or a janma nakshatra
(`type="nakshatra"`) says about a person — or, for a birth, one of the personal
reports below — in plain English or Hindi, with the disclaimer line at the end.

| Attribute                                             | Value                                                                                                                      | Default   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| `type`                                                | `lagna` \| `nakshatra` \| `house_lords` \| `grahas` \| `yogas` \| `vimshottari` \| `varshphal` \| `life_areas` \| `kundli` | `lagna`   |
| `sign`                                                | `aries` … `pisces`, for a lagna                                                                                            | —         |
| `nakshatra`                                           | `ashwini` … `revati` (`purva_phalguni`, …)                                                                                 | —         |
| `datetime`, `lat`, `lon`, `city`, `timezone`, `place` | A birth, as on `<kj-chart>`                                                                                                | —         |
| `year`                                                | The varshphal's year, from the birthday in it (1800–2400)                                                                  | running   |
| `parts`                                               | For `type="kundli"`: the reports to include, spaces or commas                                                              | all eight |
| `disclaimer`, `disclaimer-name`, `disclaimer-url`     | As on `<kj-horoscope>`                                                                                                     | the API's |

`type` also takes `house-lords`, `life-areas` or `life areas`.

A preset `sign` or `nakshatra` needs no birth at all, for a "know your lagna"
page. With neither a preset nor a birth it shows a picker and asks for nothing
until the reader picks. `reading.birth = { … }` sets the birth from script, as
on `<kj-chart>`.

The personal reports need a birth — there is nothing to pick, so without one
they show the same "No birth" line as `<kj-chart>` and ask for nothing:

| `type`        | Route                          | What it draws                                                                                                         |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `house_lords` | `POST /v1/reports/house-lords` | Twelve houses in order: "1st house · Gemini · lord Mercury in the 9th", then the reading                              |
| `grahas`      | `POST /v1/reports/grahas`      | Nine grahas: "Sun · Aries · 10th house", then what it says in that sign and in that house                             |
| `yogas`       | `POST /v1/reports/yogas`       | Each yoga that forms: its name, the grahas in it, the text; a line saying so when none do                             |
| `vimshottari` | `POST /v1/reports/vimshottari` | Each mahadasha: "Venus mahadasha", its dates, a level badge and the text; the running one marked "Running now"        |
| `varshphal`   | `POST /v1/reports/varshphal`   | The year from the birthday in `year`: a summary, seven areas (work … travel) and the year's periods as dated chips    |
| `life_areas`  | `POST /v1/reports/life-areas`  | The summary line, then one card per area of life (eleven), each with a level badge                                    |
| `kundli`      | `POST /v1/reports/kundli`      | Several of the above in one request — `parts` names them, default all eight — each drawn as above, in the API's order |

The antardashas and the `basis` the API sends with some of these are not drawn:
the reader sees the summaries. They are on every plan, at 5 credits each.
Without `year` the varshphal is the one running now: this
year's from the birthday on, last year's before it (never before the birth).
`type="kundli"` sends no `year` unless one is written, and the API works out
the running one itself. It is priced 5 credits per part: `parts="lagna,
nakshatra, yogas"` is 15. `parts` takes `lagna`, `nakshatra`, `life_areas`,
`house_lords`, `grahas`, `yogas`, `vimshottari` and `varshphal`; the answer has
one disclaimer, at the end. A yoga's name is the API's own.

```html
<kj-reading
  type="vimshottari"
  datetime="1990-05-14T10:30:00"
  timezone="Asia/Kolkata"
  lat="28.6139"
  lon="77.209"
></kj-reading>
```

### The disclaimer

Every report answer ends with "These predictions are indicative. For a reading
of your own chart, consult an astrologer." (and its Hindi), shown small under
the reading. `disclaimer-name="Acharya …"` (with `disclaimer-url`) makes it
name your own astrologer instead; `disclaimer="off"` drops it — for an
astrologer handing a reading to their own client.

### The daily widgets

No birth, no form: a place (`city`, or `lat` / `lon` with an optional
`timezone`, and `place` for the label, as on `<kj-panchang>`); **New Delhi
when none is given**.

#### `<kj-panchang-month>` — 1 call per month shown, direct or through a proxy

A month as a calendar: one cell per day with the tithi at sunrise (paksha
and number on a phone, the name on a wide card) and the nakshatra; Purnima,
Amavasya and the Ekadashis marked by the tithi at sunrise, with a key. A
click opens the day's full panchang under the grid: every tithi, nakshatra,
yoga and karana that touches the day with its end time, sunrise and sunset,
the masa and the Vikram Samvat year. The API gives no festival list, so none
is invented.

| Attribute | Value                                                   | Default                 |
| --------- | ------------------------------------------------------- | ----------------------- |
| `month`   | `YYYY-MM`; the ‹ › buttons step it (1 call per month)   | this month there        |
| `masa`    | `purnimanta` or `amanta`; the switch flips it (no call) | `purnimanta`            |
| `proxy`   | The site's proxy endpoint (see below)                   | the page's `data-proxy` |

`/v1/panchang/month` is a heavy route: 20 credits a month shown, and ten
requests a minute per key, on every plan. The widget calls it
with the publishable key, or through the site's proxy when the page has one,
which can cache the month.

#### `<kj-calendar>` — 2 calls per date

The Hindu calendar converter: a date (day / month / year selects; `date`,
default today) in; its Vikram Samvat year, the masa in the purnimanta and the
amanta reckonings, paksha, the tithi at sunrise (and what follows it), vara
and nakshatra out. `/v1/panchang` for the day (shared with a `<kj-panchang>`
for the same place and day), then `/v1/calendar/vikram-samvat` at its
sunrise.

#### `<kj-transits>` — 2 calls

"Planets today": the chart of this minute at the place (an inner
`<kj-chart>` with its North / South / Circular switch) and a table of each
graha's sign, degree, nakshatra and pada, and retrograde motion, with the
lagna rising there. `/v1/transit/now` and `/v1/kundli/chart` for the same
instant; "Refresh" asks again. `chart="off"` drops the chart and its call;
`chart-style` and `size` pass to it.

#### `<kj-ephemeris>` — 1 call per month and zodiac

A month of daily longitudes at 00:00 UT: a row a day, a column a graha (and
the ascendant at the place), each cell the degree in the sign, the sign's
glyph where it changes, ℞ while a graha is retrograde; the month's
ingresses and stations as a list. `month` (default this month),
`system="tropical"` (default sidereal; the switch flips it, 1 call). Heavy
like the monthly panchang: 20 credits, ten a minute, and through the site's
proxy when the page has one.

### The birth calculators

One person's birth, two ways:

- **The form** (the default): the kundli form's fields without gender — name
  (optional), date, time, place search. Nothing is sent until a submit;
  then the form folds into one line ("Asha · 14 May 1990, 10:30 · Varanasi —
  Edit details") and the result opens under it. The entry is remembered on
  the device under the kundli form's slot, so a visitor finds it filled in
  on the next calculator (`remember="off"` opts out; "Clear" forgets it).
- **Attributes**: `datetime` and `lat` / `lon` (or `city`), `timezone`,
  `place`, and `name` for the header — as on `<kj-chart>` — or `.birth` set
  in one go. No form; the result at once.

All take `time-format`, `remember`, `place-provider`, `photon-url`,
`google-maps-key` and `city` (pre-fills the place) as the kundli form does,
and `disclaimer`, `disclaimer-name`, `disclaimer-url` for the readings they
draw. Each answer has its own state: a refused request shows the
monthly-limit card in its place and the rest stands. `kj-submit` fires on a
valid submit, `kj-ready` with the widget's main answer.

| Element                    | Shows                                                                                                                                                                               | Calls per birth                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<kj-moon-sign>`           | Moon sign (rashi) and its degree, janma nakshatra and pada, the nakshatra reading                                                                                                   | 2 — `/v1/kundli`, `/v1/reports/nakshatra`; `reading="off"`: 1                |
| `<kj-lagna>`               | The lagna and the ascendant's degree in it, the Moon sign, the lagna reading                                                                                                        | 2 — `/v1/kundli`, `/v1/reports/lagna`; `reading="off"`: 1                    |
| `<kj-manglik>`             | Manglik or not, the house Mars is in from the lagna, the engine's mitigation; the other doshas the chart forms, with their grahas                                                   | 1 — `/v1/kundli/yogas`                                                       |
| `<kj-sade-sati>`           | Whether sade sati (or a dhaiya) is running now; each calendar year's phases — rising, peak, setting, dhaiya — with Saturn's sign and the dates; a year stepper                      | 1 per year shown — `/v1/kundli/sade-sati`                                    |
| `<kj-dasha>`               | The running periods, the mahadashas as a band and a table, drill-down to antardashas and pratyantardashas, the current period marked; a Yogini switch (`yogini="off"` hides it)     | 1 — `/v1/kundli/dasha`, three levels; Yogini 1 more                          |
| `<kj-vargas>`              | A select of D1–D60; the chosen varga's chart and each graha's sign in it beside its D1 sign, vargottama marked. `varga` (default `d9`), `chart-style`, `size`                       | 1 — `/v1/kundli/vargas`; plus 1 `/v1/kundli/chart` per varga and style drawn |
| `<kj-kp>`                  | Tabs: cusps and planets with sign, degree, nakshatra and sign / star / sub / sub-sub lords; significators A–D per house and houses per graha; ruling planets. `tab` opens one first | 1 — `/v1/kp/chart`                                                           |
| `<kj-strength>`            | Tabs: Shadbala (rupas against the required minimum, the ratio, the six strengths in virupas); Ashtakavarga (the SAV square, shaded against its own average, and each graha's BAV)   | 1 per tab opened — `/v1/kundli/shadbala`, `/v1/kundli/ashtakavarga`          |
| `<kj-life-areas>`          | The life-areas report: one summary, eleven areas with a level each                                                                                                                  | 1 — `/v1/reports/life-areas`                                                 |
| `<kj-varshphal>`           | A year selector (`year`, default the one running now); when the year begins, varsha lagna, muntha and its house, year lord; the varsha kundli; the year's reading                   | 3 per year — `/v1/varshphal`, `/v1/kundli/chart`, `/v1/reports/varshphal`    |
| `<kj-vimshottari-reading>` | Each mahadasha from birth to eighty with its dates, level and reading, the running one marked                                                                                       | 1 — `/v1/reports/vimshottari`                                                |

### The server proxy

Some routes are closed to publishable keys whatever the plan — the PDFs (see
below), `/v1/transit/scan` and `/v1/match/batch` — so a widget that needs one sends its request
to the site's own endpoint, which calls the API with the site's secret key.
The two month widgets do not need it (their routes are open to publishable
keys since 2 October 2026), but use it when the page has one, so the site
can cache each month:

```html
<script src="…/v1.js" data-key="kj_pub_…" data-proxy="/wp-json/kaaljyoti/v1/proxy" defer></script>
```

`data-proxy`, `configure({ proxyUrl })` or `proxy="…"` on the element (an
`https://` URL or a path on the site). The widget `POST`s
`{"path": "/panchang/month", "body": {…}}` there with no key and reads back
the API's envelope. The Kaal Jyoti WordPress plugin provides the endpoint;
the contract for anyone writing their own is in
[docs/widgets-design.md, decision 23](../../docs/widgets-design.md).
`data-proxy-all` sends every request through it, for a page that carries no
key at all. A widget on a server-only route with no proxy shows "This widget
needs the Kaal Jyoti WordPress plugin or a server proxy" and a link for the
site owner (`proxy-docs`, `data-proxy-docs`, `configure({ proxyDocsUrl })`).

### PDF downloads

The API prints a kundli or a match as a PDF (`/v1/pdf/kundli`,
`/v1/pdf/match`) on every paid plan (not Free), and never for a publishable
key, so PDFs go through the same proxy. When the page says its proxy relays
them — `data-pdf="basic professional"` (or `basic`, `professional`, `on`),
`configure({ pdf: ['basic'] })` — the kundli report and the match result
show a "Download PDF" bar: the edition (when more than one is offered), the
language, and the button. The widget `POST`s
`{"path": "/pdf/kundli", "body": {birth, options: {language}, edition, name?, template?, chart_style?}}`
(the match: `{bride, groom, options, name?, partner_name?, template?}`;
`template` is the element's preset) and saves the file under the name the
API gave it. `pdf="off"` on an element hides the bar there; a list narrows
the editions. A `403 plan_required` (a site on the Free plan) shows the plan
card; `402 pdf_quota_exceeded` says the month's PDFs are used up. The bar's
code is loaded only on a page that offers PDFs. A kundli PDF costs 1,000
credits and a match PDF 500, and each uses one PDF of the month's allowance
(Starter 50, Growth 200, Scale 500, Enterprise 2,500).

### Calls per page, in one line

`<kj-panchang>` 1 · `<kj-muhurta>` 1 · `<kj-chart>` 1, plus 1 per `lang` or
style change · `<kj-kundli-form>` 0 until a visitor submits, then 3 for the
overview and the table above for each tab opened · `<kj-match-form>` 0 until
a visitor submits, then 3 · a place search on `/v1/places` (`kaaljyoti`, or a
fallback), 1 per search · `<kj-horoscope>` 0 until a sign is chosen, then 1
per sign, period and day · `<kj-reading>` 0 until there is a sign, a
nakshatra or a birth (a personal report: a birth), then 1. Identical requests
anywhere on the page are collapsed into one, in flight or already answered.
The widgets above add: `<kj-panchang-month>` 1 per month · `<kj-calendar>` 2
per date · `<kj-transits>` 2 · `<kj-ephemeris>` 1 per month · the birth
calculators 0 until a submit, then as in their table.

What a call costs is in [Credits per API](https://kaaljyoti.com/api/docs/credits):
a calculation (a panchang, a kundli, a chart, a dasha, a match, a place
search) is 1 credit, a written reading or a horoscope 5, a month of panchang
or ephemeris 20. A refused request costs nothing; an answer from the API's
cache costs the same as a fresh one, which is why the page-level memo above
matters. The widgets run on a publishable key, so they are never told the
account's balance (`X-KJ-Credits-Remaining` goes to secret keys only) and show
no usage meter: the dashboard does.

## 4. Theming

Every element renders into an open shadow root, so a page's `dl` and `table`
rules cannot take a widget apart.

### The card

Every widget is a card: a header band with a title and a line for the place
and date, the body, and a footer with the report's disclaimer and the
powered-by link. `heading="Aaj ka panchang"` replaces the title and
`heading="off"` drops the header; `frame="none"` draws the widget without its
card (no border, background or footer), for a page that frames it itself.

### Presets

`preset` on an element, `data-preset` on the script or `configure({ preset })`
picks one of four looks — the same four as the Kaal Jyoti PDF reports, so a
site's widgets and reports match:

| Preset              | Look                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| `classic` (default) | Cream and maroon, serif headings, a thin gold rule                               |
| `modern`            | Teal and amber, sans headings on a solid accent band                             |
| `minimal`           | Ink on white, hairlines only                                                     |
| `traditional`       | Maroon, saffron and gold; a tinted header with a gold rule and a saffron diamond |

A preset sets the accent family, the heading face and the header; the mode
below still sets light, dark or auto, and every custom property still wins.

### Plan-required

Every site can place every widget, and every plan can call every route a
widget uses: the month's credits do the limiting. A key past its month's
credits (`402 quota_exceeded`) shows a polite "Monthly limit reached" card,
and a PDF asked for on the Free plan (`403 plan_required`) one saying it
needs a paid plan, each with a small line for the site owner linking the pricing page
(`pricing-url`, `data-pricing-url` or `configure({ pricingUrl })`; default
`https://kaaljyoti.com/api/pricing`). It is never a raw error.

### Modes

Every element takes `theme="auto" | "light" | "dark"`:

| Mode             | What it looks like                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | Blends in. No card background; text, labels and chart lines take the page's text colour, so it reads on a light page and a dark one alike. Accent, graha and good/bad hues switch to lighter ones on a dark page. |
| `light`          | The cream card with dark text.                                                                                                                                                                                    |
| `dark`           | A dark card with light text and lightened graha colours.                                                                                                                                                          |

`auto` picks its hues from the page itself: the element reads the text
colour it inherits, and light text means a dark page (it sets
`data-scheme="dark"` on itself). Before that is known, CSS `light-dark()`
follows the page's `color-scheme`, and browsers without it follow the
visitor's `prefers-color-scheme`.

Set a page-wide default with `data-theme` on the script tag or
`configure({ theme })` (an unknown value means `auto`). An element with no
`theme` attribute then gets the default written onto it, unless the default is
`auto`, in which case the markup is left alone. A `theme` the page wrote
itself is never replaced. `<kj-kundli-form>` passes its theme to the chart it
draws.

### Custom properties

Colour and type cross the shadow boundary as custom properties. Set them on
the element, on a wrapper, or on `:root`. They win over the defaults in every
mode, so a mode is a starting point, not a lock:

```css
kj-panchang,
kj-chart {
  --kj-bg: #ffffff;
  --kj-text: #1a1a1a;
  --kj-lagna: #7a1f2b;
  --kj-font: 'Inter', system-ui, sans-serif;
}
```

| Property                                                                                           | What it colours                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `--kj-bg`                                                                                          | The chart's ground                                                                     |
| `--kj-surface`                                                                                     | The widget's own background                                                            |
| `--kj-text`                                                                                        | Body text                                                                              |
| `--kj-muted`                                                                                       | Labels, captions, secondary text                                                       |
| `--kj-line`                                                                                        | Chart rules and table borders                                                          |
| `--kj-lagna`                                                                                       | The lagna, and the accent default                                                      |
| `--kj-accent`                                                                                      | Headings and the submit button                                                         |
| `--kj-planet`                                                                                      | A graha with no colour of its own                                                      |
| `--kj-retro`                                                                                       | The ℞ marker                                                                           |
| `--kj-planet-sun`, `-moon`, `-mars`, `-mercury`, `-jupiter`, `-venus`, `-saturn`, `-rahu`, `-ketu` | One per graha, in the chart and the planets table                                      |
| `--kj-good`, `--kj-bad`                                                                            | Auspicious and inauspicious windows; `--kj-good` also a favourable level               |
| `--kj-care`                                                                                        | The "needs care" level (default: the Sun's colour)                                     |
| `--kj-font`, `--kj-font-heading`, `--kj-size`, `--kj-radius`                                       | Body type, heading type, the base size (15–18px) and corner radius                     |
| `--kj-max-width`                                                                                   | Where a card stops growing in a wide block (72em)                                      |
| `--kj-tint`, `--kj-border`, `--kj-shadow`, `--kj-accent-2`, `--kj-on-accent`                       | Tiles and the header band, hairlines, the card's shadow, ornaments, text on the accent |

The same sixteen names (all but `--kj-care`) are the ones the API's SVG uses, so a chart and the
widgets around it take one theme.

For structure, use `::part()`:

`card`, `header`, `title`, `subtitle`, `body`, `footer`, `tiles`, `tile`
(each also `tile-<name>`), `label`, `value` (each also `<name>-label` /
`<name>-value`, e.g. `tithi-value`), `timeline`, `legend`, `windows`, `window`,
`chart`, `form`, `submit`, `result`, `tabs`, `tab`, `panel`, `segmented`,
`segment`, `badge`, `summary`, `areas`, `area`, `planets`, `yogas`, `gauge`,
`kootas`, `loading`, `error`, `plan-required`, `plan-owner`, `disclaimer`,
`powered-by-row`, `powered-by`.

```css
kj-panchang::part(tithi-value) {
  font-weight: 700;
}
```

### Fonts

By default a widget sets its own type: the system UI face for body text,
Noto Serif for the classic and traditional headings, and a Devanagari stack
(Noto Sans Devanagari, Mukta, …) for Hindi. `font="inherit"` (or
`data-font="inherit"`, `configure({ font: 'inherit' })`) uses the page's own
font for everything, headings included; a Hindi card puts the Devanagari
faces behind it, since few Latin faces carry Devanagari. `--kj-font` and
`--kj-font-heading` still win over both.

### Zodiac sign icons

Wherever a sign is shown — the horoscope's picker, the kundli overview, the
lagna and Moon-sign calculators, the match cards, the planets, transits,
vargas and other tables — it carries an icon drawn by the widget, not a
Unicode character, so it looks the same whatever fonts the visitor has. Four
themes:

| Theme               | What it draws                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element` (default) | The sign's symbol on a rounded tile with a soft inner circle, coloured by element: fire (Aries, Leo, Sagittarius), earth (Taurus, Virgo, Capricorn), air (Gemini, Libra, Aquarius), water (Cancer, Scorpio, Pisces) |
| `glyph`             | The same symbol in a thin ring, in one colour (the accent)                                                                                                                                                          |
| `devanagari`        | The Hindi name (मेष … मीन) in a double-ring seal; on a Hindi page the horoscope picker prints no second name under it                                                                                               |
| `custom`            | Your own images (below)                                                                                                                                                                                             |

In tables the icon is the compact form: the symbol alone, in its element's
colour (`glyph`: the accent; `custom`: your image). `sign-icons="…"` on an
element (or on any element around it) chooses the theme there;
`data-sign-icons` on the script or `configure({ signIcons })` sets it for the
page.

**Your own images.** Give a URL template with `{sign}`, which becomes `aries` …
`pisces`, or a map:

```html
<script
  src="https://cdn.kaaljyoti.com/widgets/v1.js"
  data-key="kj_pub_…"
  data-sign-icons="https://example.com/signs/{sign}.png"
  defer
></script>
```

```js
KJWidgets.configure({ signIcons: 'https://example.com/signs/{sign}.svg' });
KJWidgets.configure({
  signIcons: { aries: 'https://example.com/ram.webp', taurus: 'https://example.com/bull.webp' },
});
```

A map may also name the page's default theme as `theme` (`{ theme: 'glyph', aries: … }`):
the images are then used only where an element asks for `sign-icons="custom"`.
Each is drawn as an `<img>` with the sign's name as its alt text — never
inlined, so an SVG of yours cannot put markup or script into the widget.
Only `https://` URLs and paths on your own site (`/images/leo.png`) are
used; anything else (`http:`, `data:`, another scheme) is ignored. A sign the
template or map does not give, or an image that fails to load, falls back to
the `element` icon. Square images look best; they are shown contained, at
about 48px in the picker and 20–32px elsewhere. `sign-icons="custom"` on one
element uses the configured images there while the page's default stays.

**Colours.** Every colour is a custom property on the element, so you can
re-tint the icons like anything else:

| Property                                                                            | What it colours                                |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| `--kj-sign-fire-bg`, `--kj-sign-earth-bg`, `--kj-sign-air-bg`, `--kj-sign-water-bg` | The tile behind an `element` icon              |
| `--kj-sign-fire-circle`, `-earth-circle`, `-air-circle`, `-water-circle`            | Its soft inner circle                          |
| `--kj-sign-fire-ink`, `-earth-ink`, `-air-ink`, `-water-ink`                        | The symbol's stroke, the seal's rings and name |
| `--kj-sign-glyph`, `--kj-sign-ring`                                                 | The `glyph` theme's symbol and its ring        |

The defaults follow the preset and the mode: `classic` and `modern` use the
element palette (fire `#FAECE7` / `#F5C4B3` / `#993C1D`, earth `#EAF3DE` /
`#C0DD97` / `#3B6D11`, air `#FAEEDA` / `#FAC775` / `#854F0B`, water `#E6F1FB` /
`#B5D4F4` / `#185FA5`), `traditional` leans to saffron and gold, `minimal` is
one ink with no tint, and a dark card gets deep tiles with light strokes.

```css
/* Softer fire signs, and a gold glyph theme. */
kj-horoscope {
  --kj-sign-fire-bg: #fff4ec;
  --kj-sign-fire-ink: #b4410c;
  --kj-sign-glyph: #a07a1c;
}

/* A bigger icon in the horoscope's picker. */
kj-horoscope::part(sign-icon-l) {
  width: 4em;
  height: 4em;
}
```

### Size and width

A widget lays itself out by its **own** width (container queries), not the
screen's: in a 300px sidebar it takes the phone layout on a desktop page.
The base size is the page's, between 15 and 18px (`--kj-size` fixes it). On a
wide block the card stops at `--kj-max-width` (72em) and centres itself;
readings stop at a reading width inside it; charts stay at most 26em wide.

### Styling guide for site owners

Host CSS cannot break a widget: everything is in a shadow root. The two
supported ways in are the `--kj-*` custom properties (the table above) and
`::part()`. What to reach for:

- **One brand colour**: set `--kj-accent` alone. Tints, rules, the selected
  tab and the text on buttons are worked out from it — white or near-black,
  whichever reads (browsers with relative colours; others keep the preset's).
- **Your font**: `font="inherit"`, or `--kj-font` for a specific stack.
- **A dark site**: leave `theme` unset (`auto`). The widget reads the text
  colour it inherits and switches to its dark hues on a dark page; or set
  `theme="dark"` for an opaque dark card.
- **Frame it yourself**: `frame="none"` drops the card's border, background
  and footer; `heading="off"` the header.
- **Sign icons**: `sign-icons` / `data-sign-icons` picks a theme or your own
  images, and `--kj-sign-*` re-tints them (see "Zodiac sign icons" above).

```css
/* A brand colour and the site's type. */
kj-panchang-month,
kj-dasha {
  --kj-accent: #0f766e;
  --kj-radius: 6px;
}

/* A flatter card. */
kj-kundli-form::part(card) {
  box-shadow: none;
  border-width: 2px;
}

/* Bigger day numbers in the month calendar. */
kj-panchang-month::part(day) {
  min-height: 6em;
}
```

Beyond the parts listed above, the stage-2 widgets name: `collapsed`,
`birth-summary`, `edit`, `calendar`, `day`, `day-detail`, `month-masa`,
`marks`, `stepper`, `verdict`, `phases`, `phase`, `crumbs`, `periods`,
`period`, `band`, `running`, `varga-table`, `cusps`, `significators`,
`ruling`, `shadbala`, `sav`, `sign-cell`, `bav`, `ephemeris`, `events`,
`transits`, `proxy-required`, `proxy-owner`, and every sign's icon is
`sign-icon` (with `sign-icon-l` in the horoscope's picker and `sign-icon-m`
beside a value or a heading).

### Powered by

A "Powered by Kaal Jyoti" link is opt-in, on every plan: it is rendered only
where `powered-by="shown"` is on the element or `data-powered-by="shown"` on
the script, and an element's `powered-by="hidden"` leaves it out under a
script that shows it.

## 5. Events

All three bubble and cross the shadow boundary, so a listener on `document`
hears them.

| Event       | Fired by                       | `detail`                                                         |
| ----------- | ------------------------------ | ---------------------------------------------------------------- |
| `kj-ready`  | Every element, after an answer | The response data                                                |
| `kj-error`  | Every element, after a failure | `KjError` — `code`, `status`, `message`, `requestId`             |
| `kj-submit` | `<kj-kundli-form>`             | The birth `{ datetime, timezone?, latitude, longitude, place? }` |
| `kj-submit` | `<kj-match-form>`              | `{ bride, groom }`, each a birth as above                        |

Errors are rendered inside the widget as a translated line and are never thrown
at the page; `kj-error` is there for site owners who want to log them.

```js
document.addEventListener('kj-error', (event) => {
  console.warn(event.detail.code, event.detail.requestId);
});
```

## 6. From npm

```sh
npm install @kaaljyoti/widgets
```

```js
import { configure, define } from '@kaaljyoti/widgets';

configure({ key: 'kj_pub_…', lang: 'en', theme: 'auto', preset: 'classic', signIcons: 'element' });
define(); // registers all 22; idempotent
```

Importing the module registers nothing until `define()` is called, so a
bundler or a framework stays in control. `define()` is safe to call twice and
safe on a page that already has another copy of the bundle. The 22 element classes
(`KjPanchang`, `KjMuhurta`, `KjChart`, `KjKundliForm`, `KjMatchForm`, `KjHoroscope`,
`KjReading`, `KjPanchangMonth`, `KjCalendar`, `KjTransits`, `KjEphemeris`,
`KjMoonSign`, `KjLagna`, `KjManglik`, `KjSadeSati`, `KjDasha`, `KjVargas`, `KjKp`,
`KjStrength`, `KjLifeAreas`, `KjVarshphal`, `KjVimshottariReading`), the `request` client,
`KjError`, the place list and the formatters are exported too. On a server
render the module evaluates without touching `customElements`.

## 7. Staging

One bundle, one attribute — no separate build:

```html
<script
  src="https://cdn.kaaljyoti.com/widgets/v1.js"
  data-key="kj_pub_…"
  data-base="https://api-staging.kaaljyoti.com"
  defer
></script>
```

Give it an origin only; `/v1` is added (and a trailing `/v1` you paste in is
removed). From npm it is `configure({ baseUrl })`.

## 8. Hosting the files yourself

`dist/v1.js` is a loader; the elements are the `dist/kj-*.js` chunks it
imports, from the directory it was loaded from, the first time the page has
one of their tags. Copy the loader and every chunk listed in
`dist/cdn-files.json` into one directory, flat. The chunks are ES modules,
fetched with CORS: serve them from the page's own origin, or send
`Access-Control-Allow-Origin` with them. If a script optimiser moves or
combines `v1.js`, put the chunks' directory on the tag as
`data-chunks="https://example.com/path/to/widgets/"`. The WordPress plugin ships
the files this way. `KJWidgets.define()` loads every
element at once; `KJWidgets.load('kj-chart')` loads one.

## 9. What it never does

- **No secret keys.** Only `kj_pub_…` works from a page. `kj_live_…` and
  `kj_test_…` are refused in a query string by the API, and nothing here sends
  an `Authorization` header.
- **No server-only routes from the page.** `/v1/transit/scan`,
  `/v1/match/batch` and the `/v1/pdf/*` routes are closed to publishable keys;
  the PDFs go only through the site's proxy, and no element asks for the
  other two. The two month routes (`/v1/panchang/month`,
  `/v1/ephemeris/month`) are open to publishable keys and called directly,
  or through the proxy when the page has one.
- **No `embed_font`.** The chart is always drawn with the web font, which is
  what a browser wants; the inlined-font variant is refused for publishable
  keys and is a server-side call.
- **No `new Date()` on a response time.** Every clock in a response is a wall
  clock at the place; the formatters slice the string, so a reader in another
  zone sees the same sunrise. The horoscope's instants are the one exception
  in kind, and they are read in the zone the answer names, never the reader's.
- **No scores.** A horoscope or a reading is text an astrologer wrote; nothing
  here turns it into a percentage, a star rating or a lucky number.
- **No unescaped response text.** The only markup inserted as markup is the
  chart SVG the API generated.

MIT licensed. Issues and pull requests:
[kaaljyoti-integrations](https://github.com/goappsters/kaaljyoti-integrations).
