/**
 * Readable names for the generated shapes.
 *
 * `src/generated/openapi.d.ts` is correct and unreadable in equal measure:
 * nobody should write `paths['/v1/kundli']['post']['requestBody']['content']
 * ['application/json']` in application code, and nobody should have to change
 * their code when `openapi-typescript` changes how it nests things. So every
 * request body and every `data` document gets a hand-picked name here
 * (design decision 10), and the generated file stays an implementation
 * detail that `pnpm gen` may rewrite freely.
 *
 * The names follow the method list in the design doc, not the operation ids:
 * `kj.panchang.daily()` answers a `DailyPanchangDocument`, so that is what
 * the type is called, even though the operation is `postPanchang`.
 */

import type { components, operations } from './generated/openapi.d.ts';

/** The JSON request body of one operation. */
type BodyOf<K extends keyof operations> = operations[K] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** The `data` member of one operation's 200 JSON answer. */
type DataOf<K extends keyof operations> = operations[K]['responses'][200] extends {
  content: { 'application/json': { data: infer D } };
}
  ? D
  : never;

/** The `meta` member of one operation's 200 JSON answer. */
type MetaOf<K extends keyof operations> = operations[K]['responses'][200] extends {
  content: { 'application/json': { meta: infer M } };
}
  ? M
  : never;

/** One named schema from `components.schemas`. */
type Schema<K extends keyof components['schemas']> = components['schemas'][K];

// ---------------------------------------------------------------------------
// The pieces most requests share
// ---------------------------------------------------------------------------

/**
 * `birth`: a wall clock, a place, and at most one of `timezone` /
 * `utc_offset`.
 *
 * Every birth-based endpoint takes the same object, so it is worth one name a
 * caller can build a value of once and pass everywhere. The "at most one"
 * rule is the API's, not the type's: sending both is a `400`, which no
 * structural type can express without making the common case awkward.
 */
export type BirthInput = BodyOf<'postKundli'>['birth'];

/**
 * `options`: ayanamsa, label languages, engine pin, disclaimer.
 *
 * No house system: only the kundli PDF takes one, on {@link PdfKundliOptions},
 * and the API answers `400` to `options.house_system` on every other route.
 */
export type CalculationOptions = NonNullable<BodyOf<'postKundli'>['options']>;

/**
 * `options.ayanamsa`: one of the 47 slugs the API lists, e.g. `lahiri`
 * (the default) or `krishnamurti`. Names for each are in
 * `GET /v1/reference/ayanamsas`.
 */
export type Ayanamsa = NonNullable<CalculationOptions['ayanamsa']>;

/**
 * `options.disclaimer`: `'default'`, `'off'`, or `{ name, url? }` to name the
 * astrologer the closing line points to.
 *
 * Every route accepts it, so one `options` object can be shared; only the
 * report routes and the horoscope answer with a `disclaimer`.
 */
export type DisclaimerOption = NonNullable<CalculationOptions['disclaimer']>;

/** `meta` on a normal answer: what the numbers were computed with. */
/**
 * An id the gateway has named: `{ id, name, names? }`.
 *
 * The engine answers in stable snake_case ids and the gateway attaches the
 * human name in every requested language on the way out. `lagna_sign`,
 * `moon_sign`, every `*_nakshatra` and `*_lord`, and `planet`/`sign`/
 * `nakshatra` inside `positions` are all this shape.
 */
export type LabelledId = Schema<'LabelledId'>;

export type Meta = Schema<'Meta'>;

/** `meta` on `POST /v1/match/batch`: a {@link Meta} without the single timezone. */
export type BatchMeta = Schema<'BatchMeta'>;

/** The zone an answer was computed in, and where it came from. */
export type Timezone = Schema<'Timezone'>;

/** The body of every failure: `{ status: 'error', error: { code, … } }`. */
export type ErrorEnvelope = Schema<'Error'>;

// ---------------------------------------------------------------------------
// Service and reference
// ---------------------------------------------------------------------------

/** `GET /v1/health` — answered bare, without the envelope. */
export type HealthDocument = operations['getHealth']['responses'][200] extends {
  content: { 'application/json': infer D };
}
  ? D
  : never;

/** The `{list}` path segment of `GET /v1/reference/{list}`. */
export type ReferenceList = operations['getReferenceList']['parameters']['path']['list'];

/**
 * One row of a reference table.
 *
 * Deliberately open: a row is `{ id, name }` for most lists and
 * `{ index, name }` for the ones the engine numbers, and each list adds
 * columns of its own. Naming only the two that are always there would be a
 * lie about the other columns, which are the reason to fetch the table.
 */
export type ReferenceRow = DataOf<'getReferenceList'>[number];

/**
 * `meta` on a reference table: `{ engine, language }`.
 *
 * Not a {@link Meta} — nothing was computed, so there is no ayanamsa and no
 * timezone to report. `language` is what the labels actually came back in.
 */
export type ReferenceMeta = MetaOf<'getReferenceList'>;

/** `GET /v1/timezone` — the zone covering a coordinate at an instant. */
export type TimezoneDocument = DataOf<'getTimezone'>;

/** `meta` on a timezone lookup: the instant the offset was read at. */
export type TimezoneMeta = MetaOf<'getTimezone'>;

/** `GET /v1/places` — `{ places: [...] }`, best match first. */
export type PlacesDocument = DataOf<'getPlaces'>;

/**
 * One place: a name, its coordinates and the IANA zone to send as
 * `birth.timezone` — everything a birth needs but the clock.
 */
export type Place = PlacesDocument['places'][number];

/** `meta` on a place search: the query, the languages, the count, the source. */
export type PlacesMeta = MetaOf<'getPlaces'>;

// ---------------------------------------------------------------------------
// Kundli
// ---------------------------------------------------------------------------

export type KundliRequest = BodyOf<'postKundli'>;
export type KundliDocument = DataOf<'postKundli'>;

/**
 * A `birth`, the drawing (`style`, `size`, `varga`, …) and `first_house`,
 * which rotates the chart: `lagna` (default), a graha (`moon` draws the
 * Chandra kundli) or `house_2` … `house_12` (bhavat bhavam).
 */
export type KundliChartRequest = BodyOf<'postKundliChart'>;
/** The SVG with what it was drawn as: `first_house`, `first_house_sign`, `title`. */
export type ChartDocument = DataOf<'postKundliChart'>;
/** What `first_house` accepts: `lagna`, a graha id, or `house_2` … `house_12`. */
export type FirstHouse = NonNullable<KundliChartRequest['first_house']>;
/** A divisional chart id, `d1` … `d60`: `varga` here, `vargas` on the vargas and PDF routes. */
export type Varga = NonNullable<KundliChartRequest['varga']>;

export type DashaRequest = BodyOf<'postKundliDasha'>;
export type DashaDocument = DataOf<'postKundliDasha'>;

export type VargasRequest = BodyOf<'postKundliVargas'>;
export type VargasDocument = DataOf<'postKundliVargas'>;

export type ChalitRequest = BodyOf<'postKundliChalit'>;
export type ChalitDocument = DataOf<'postKundliChalit'>;

export type YogasRequest = BodyOf<'postKundliYogas'>;
export type YogasDocument = DataOf<'postKundliYogas'>;

export type ShadbalaRequest = BodyOf<'postKundliShadbala'>;
export type ShadbalaDocument = DataOf<'postKundliShadbala'>;

export type BhavaBalaRequest = BodyOf<'postKundliBhavaBala'>;
export type BhavaBalaDocument = DataOf<'postKundliBhavaBala'>;

export type AshtakavargaRequest = BodyOf<'postKundliAshtakavarga'>;
export type AshtakavargaDocument = DataOf<'postKundliAshtakavarga'>;

export type GrahaDrishtiRequest = BodyOf<'postKundliGrahaDrishti'>;
export type GrahaDrishtiDocument = DataOf<'postKundliGrahaDrishti'>;

export type MaitriRequest = BodyOf<'postKundliMaitri'>;
export type MaitriDocument = DataOf<'postKundliMaitri'>;

export type PaceRequest = BodyOf<'postKundliPace'>;
export type PaceDocument = DataOf<'postKundliPace'>;

export type SpecialLagnasRequest = BodyOf<'postKundliSpecialLagnas'>;
export type SpecialLagnasDocument = DataOf<'postKundliSpecialLagnas'>;

export type TripatakiRequest = BodyOf<'postKundliTripataki'>;
export type TripatakiDocument = DataOf<'postKundliTripataki'>;

export type SarvatobhadraRequest = BodyOf<'postKundliSarvatobhadra'>;
export type SarvatobhadraDocument = DataOf<'postKundliSarvatobhadra'>;

export type Nakshatra28Request = BodyOf<'postKundliNakshatra28'>;
export type Nakshatra28Document = DataOf<'postKundliNakshatra28'>;

export type SadeSatiRequest = BodyOf<'postKundliSadeSati'>;
export type SadeSatiDocument = DataOf<'postKundliSadeSati'>;

export type EventsRequest = BodyOf<'postKundliEvents'>;
export type EventsDocument = DataOf<'postKundliEvents'>;

export type KotaChakraRequest = BodyOf<'postKundliKotaChakra'>;
/** The schema is `KotaDocument`; the method is `kj.kundli.kotaChakra()`. */
export type KotaDocument = DataOf<'postKundliKotaChakra'>;

// ---------------------------------------------------------------------------
// Panchang and calendar
// ---------------------------------------------------------------------------

export type PanchangRequest = BodyOf<'postPanchang'>;
export type DailyPanchangDocument = DataOf<'postPanchang'>;

/**
 * Either a `birth` (the answer then adds `tara_bala` and `chandra_bala`) or a
 * place — `latitude`, `longitude`, optional `timezone`/`utc_offset` — with an
 * optional `date`, as for `/v1/panchang`.
 */
export type MuhurtaRequest = BodyOf<'postPanchangMuhurta'>;
export type MuhurtaDocument = DataOf<'postPanchangMuhurta'>;

/** A place and a `month` (`YYYY-MM`). */
export type PanchangMonthRequest = BodyOf<'postPanchangMonth'>;
/** Every day of the month: its limbs with their end times, vara, sun and masa. */
export type PanchangMonthDocument = DataOf<'postPanchangMonth'>;

/** A place, a `month` (`YYYY-MM`) and an optional `system`. */
export type EphemerisMonthRequest = BodyOf<'postEphemerisMonth'>;
export type EphemerisMonthDocument = DataOf<'postEphemerisMonth'>;

export type VikramSamvatRequest = BodyOf<'postCalendarVikramSamvat'>;
export type VikramSamvatDocument = DataOf<'postCalendarVikramSamvat'>;

// ---------------------------------------------------------------------------
// Jaimini
// ---------------------------------------------------------------------------

export type JaiminiKarakasRequest = BodyOf<'postJaiminiKarakas'>;
export type JaiminiKarakasDocument = DataOf<'postJaiminiKarakas'>;

export type JaiminiArudhaPadasRequest = BodyOf<'postJaiminiArudhaPadas'>;
export type JaiminiPadasDocument = DataOf<'postJaiminiArudhaPadas'>;

export type JaiminiAspectsRequest = BodyOf<'postJaiminiAspects'>;
export type JaiminiAspectsDocument = DataOf<'postJaiminiAspects'>;

export type JaiminiKarakamshaRequest = BodyOf<'postJaiminiKarakamsha'>;
export type JaiminiKarakamshaDocument = DataOf<'postJaiminiKarakamsha'>;

// ---------------------------------------------------------------------------
// KP
// ---------------------------------------------------------------------------

export type KpChartRequest = BodyOf<'postKpChart'>;
export type KpDocument = DataOf<'postKpChart'>;

// ---------------------------------------------------------------------------
// Varshphal
// ---------------------------------------------------------------------------

export type VarshphalRequest = BodyOf<'postVarshphal'>;
export type VarshphalVarshaYearDocument = DataOf<'postVarshphal'>;

export type VarshphalBalaRequest = BodyOf<'postVarshphalBala'>;
export type VarshphalHarshaBalaDocument = DataOf<'postVarshphalBala'>;

export type VarshphalSahamsRequest = BodyOf<'postVarshphalSahams'>;
export type VarshphalSahamsDocument = DataOf<'postVarshphalSahams'>;

export type VarshphalYogasRequest = BodyOf<'postVarshphalYogas'>;
export type VarshphalTajikaDocument = DataOf<'postVarshphalYogas'>;

export type VarshphalDashaRequest = BodyOf<'postVarshphalDasha'>;
export type VarshphalMuddaDocument = DataOf<'postVarshphalDasha'>;

// ---------------------------------------------------------------------------
// Transit
// ---------------------------------------------------------------------------

export type TransitNowRequest = BodyOf<'postTransitNow'>;
export type TransitNowDocument = DataOf<'postTransitNow'>;

export type TransitScanRequest = BodyOf<'postTransitScan'>;
export type TransitScanDocument = DataOf<'postTransitScan'>;

/**
 * A `year`, or a `from`…`to` window of at most 366 days, a zone for the local
 * times, and `moon`, `nakshatras`, `combustion` to list more. No birth.
 */
export type TransitEventsRequest = BodyOf<'postTransitEvents'>;
/** `{ events: [...], from, to, year, … }` — the year's ingresses and stations, by time. */
export type TransitEventsDocument = DataOf<'postTransitEvents'>;
/** One event of {@link TransitEventsDocument}: its `kind`, the graha, `time` and `local`. */
export type TransitEvent = TransitEventsDocument['events'][number];

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

export type MatchAshtakootRequest = BodyOf<'postMatchAshtakoot'>;
export type MatchAshtakootDocument = DataOf<'postMatchAshtakoot'>;

export type MatchCompareRequest = BodyOf<'postMatchCompare'>;
export type CompareDocument = DataOf<'postMatchCompare'>;

export type MatchBatchRequest = BodyOf<'postMatchBatch'>;
/**
 * `{ results: [{ index, data? , error? }] }`.
 *
 * A pair's failure is a value here, not a thrown error (design decision 6):
 * the other pairs were answered and charged, so throwing would discard
 * results the caller has already paid for.
 */
export type BatchDocument = DataOf<'postMatchBatch'>;

/** One pair's answer inside {@link BatchDocument}. */
export type BatchResult = BatchDocument['results'][number];

// ---------------------------------------------------------------------------
// Reports and horoscope
// ---------------------------------------------------------------------------

/** A `birth`, or a `sign` (`aries`…`pisces`) to read that lagna directly. */
export type ReportLagnaRequest = BodyOf<'postReportsLagna'>;
/** `{ lagna: { sign, entry: { text } }, disclaimer? }` — text keyed by language. */
export type ReadingLagnaDocument = DataOf<'postReportsLagna'>;

/** A `birth`, or a `nakshatra` (`ashwini`, `purva_phalguni`, …) to read directly. */
export type ReportNakshatraRequest = BodyOf<'postReportsNakshatra'>;
/** `{ nakshatra: { nakshatra, entry: { text } }, disclaimer? }`. */
export type ReadingNakshatraDocument = DataOf<'postReportsNakshatra'>;

/** A `birth` (required) and the usual `options`; there is nothing to pick. */
export type ReportHouseLordsRequest = BodyOf<'postReportsHouseLords'>;
/**
 * `{ house_lords: [...12], disclaimer? }` — the twelve houses in order, each
 * with the sign on it, its lord, the house the lord sits in and a reading.
 */
export type ReadingHouseLordsDocument = DataOf<'postReportsHouseLords'>;
/** One house of {@link ReadingHouseLordsDocument}: `{ house, sign, lord, in_house, entry }`. */
export type HouseLord = NonNullable<ReadingHouseLordsDocument['house_lords']>[number];

/** A `birth` and the usual `options`: what every personal report below takes. */
export type ReportGrahasRequest = BodyOf<'postReportsGrahas'>;
/**
 * `{ grahas: [...9], disclaimer? }` — Sun to Ketu, each with its sign and
 * house and what it says in each (`in_sign`, `in_house`).
 */
export type ReadingGrahasDocument = DataOf<'postReportsGrahas'>;
/** One graha of {@link ReadingGrahasDocument}: `{ graha, sign, house, in_sign, in_house }`. */
export type GrahaReading = NonNullable<ReadingGrahasDocument['grahas']>[number];

/** A `birth` and the usual `options`. */
export type ReportYogasRequest = BodyOf<'postReportsYogas'>;
/** `{ yogas: [...], disclaimer? }` — the yogas that form, each with its reading. */
export type ReadingYogasDocument = DataOf<'postReportsYogas'>;
/**
 * One yoga of {@link ReadingYogasDocument}: `{ code, category, participants,
 * entry }`. The answer names the yoga by `code` only (`gaja_kesari`).
 */
export type YogaReading = NonNullable<ReadingYogasDocument['yogas']>[number];

/** A `birth` and the usual `options`. */
export type ReportVimshottariRequest = BodyOf<'postReportsVimshottari'>;
/**
 * `{ periods: [...], basis, disclaimer? }` — every Vimshottari mahadasha of
 * the life, each with a `level` and a text; `basis` is the reasoning, for you
 * and not for the reader.
 */
export type VimshottariReadingDocument = DataOf<'postReportsVimshottari'>;
/**
 * One mahadasha of {@link VimshottariReadingDocument}: `{ lord, from, to,
 * current, level, text, areas, antardashas }`.
 */
export type MahadashaReading = VimshottariReadingDocument['periods'][number];

/** A `birth`, the `year` whose birthday starts the varshphal, and the usual `options`. */
export type ReportVarshphalRequest = BodyOf<'postReportsVarshphal'>;
/**
 * `{ year, from, to, summary, areas: [...7], months, basis, disclaimer? }` —
 * the year from that birthday to the next, read by the Tajika rules.
 */
export type VarshphalReadingDocument = DataOf<'postReportsVarshphal'>;
/** One period (mudda dasha) of {@link VarshphalReadingDocument}: `{ lord, from, to, level }`. */
export type VarshphalPeriod = VarshphalReadingDocument['months'][number];

/** A `birth` and the usual `options`. */
export type ReportLifeAreasRequest = BodyOf<'postReportsLifeAreas'>;
/**
 * `{ summary: { text, strongest, needs_care }, areas: [...11], disclaimer? }`
 * — the areas of life a birth chart shows, one reading each.
 */
export type LifeAreasDocument = DataOf<'postReportsLifeAreas'>;
/** One area of {@link LifeAreasDocument}: `{ area, level, text, periods, basis }`. */
export type LifeArea = LifeAreasDocument['areas'][number];

/**
 * A `birth`, and optionally `parts` (any of `lagna`, `nakshatra`,
 * `life_areas`, `house_lords`, `grahas`, `yogas`, `vimshottari`,
 * `varshphal`; default all) and a `year` for the varshphal (default the one
 * running now).
 */
export type ReportKundliRequest = BodyOf<'postReportsKundli'>;
/**
 * `{ parts: [...], <part>: …, disclaimer? }` — each part as its own route
 * answers it, in one request priced 5 credits per part (`meta.credits`).
 */
export type KundliReportDocument = DataOf<'postReportsKundli'>;

/**
 * A `sign`, and optionally a `period` (default `daily`), a `date`
 * (`YYYY-MM-DD`) and at most one of `timezone` / `utc_offset` for where the
 * day begins.
 */
export type HoroscopeRequest = BodyOf<'postHoroscope'>;
/**
 * `{ sign, period, from, to, summary, areas: [...5], basis, disclaimer? }` —
 * the period as one summary and one reading per life area (work, money,
 * relationships, health, education), each with a `level`: `favourable`,
 * `mixed` or `care`. No scores. `basis` lists the transits behind it, for you
 * and not for the reader.
 */
export type HoroscopeDocument = DataOf<'postHoroscope'>;
/** The overall line of a summary report: `{ level, text }`. */
export type ReadingSummary = HoroscopeDocument['summary'];
/** One life area of a summary report: `{ area, level, text }`. */
export type AreaSummary = HoroscopeDocument['areas'][number];
/**
 * One transit behind a horoscope: a graha in one sign for part of the period,
 * its `house` counted from the chosen sign, `nature` (`favourable` or not),
 * and `entered`/`leaves` when that happens inside the period.
 */
export type HoroscopeTransit = HoroscopeDocument['basis'][number];

/** `favourable`, `mixed` or `care`: the tone of a summary, never a score. */
export type Level = 'favourable' | 'mixed' | 'care';

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------

/**
 * The body of `POST /v1/kundli` plus the PDF fields: `name`, `edition`
 * (`basic` or `professional`), `sections`, `vargas`, `template`,
 * `chart_style` and `branding`.
 */
export type PdfKundliRequest = BodyOf<'postPdfKundli'>;
/** The body of `POST /v1/match/ashtakoot` plus `name` (the bride), `partner_name` (the groom) and the PDF fields. */
export type PdfMatchRequest = BodyOf<'postPdfMatch'>;
/** The body of `POST /v1/varshphal` (a `birth` and a `year`) plus `name` and the PDF fields. */
export type PdfVarshphalRequest = BodyOf<'postPdfVarshphal'>;
/** The body of `POST /v1/panchang/month` (a place and a `month`) plus `template` and `branding`. */
export type PdfPanchangMonthRequest = BodyOf<'postPdfPanchangMonth'>;
/** `classic`, `modern`, `minimal` or `traditional`. Default: the account's, else `classic`. */
export type PdfTemplate = NonNullable<PdfKundliRequest['template']>;
/** One section of a kundli PDF, for `sections`. */
export type PdfKundliSection = NonNullable<PdfKundliRequest['sections']>[number];
/**
 * This PDF's branding instead of the account's: name, logo (base64, never a
 * URL), contact lines, accent, footer, invocation, about. Enterprise only —
 * on any other plan a request that sends it is refused with `403 plan_required`.
 */
export type PdfBranding = NonNullable<PdfKundliRequest['branding']>;
/**
 * The kundli PDF's `options`: {@link CalculationOptions} plus `house_system`,
 * the bhava chalit the PDF prints (default `placidus`). No other route takes
 * a house system.
 */
export type PdfKundliOptions = NonNullable<PdfKundliRequest['options']>;
/** `whole_sign`, `placidus`, `porphyry`, `equal`, `sripati` or `kp`: the kundli PDF's `options.house_system`. */
export type HouseSystem = NonNullable<PdfKundliOptions['house_system']>;
