/**
 * The client: one method per endpoint, grouped the way the paths are.
 *
 * Everything hard already happened in `transport.ts` — where the key goes,
 * what a `Retry-After` means, how an envelope becomes a {@link Result}. What
 * is left is naming, and naming is the whole value of an SDK: a caller should
 * be able to guess `kj.kundli.sadeSati` from having seen `/v1/kundli/sade-sati`
 * and be right (design decision 1). So every method here is a path, two types
 * and nothing else, and the contract test walks `openapi.json` to prove that
 * all 58 of them exist and go where their name says.
 *
 * Two shapes are deliberate:
 *
 *   - **Namespaces are plain objects of arrow functions**, built in the
 *     constructor and closed over the transport. `const { kundli } = kj` is
 *     the obvious thing to write, and it would silently lose `this` if these
 *     were prototype methods.
 *   - **Each namespace has a written interface**, rather than one inferred
 *     from its factory with `ReturnType`. Inference costs nothing to write
 *     and everything to read: TypeScript expands the aliases structurally
 *     when it emits `.d.ts`, so a caller hovering `kundli.get` would get two
 *     thousand lines of inlined shape instead of
 *     `PostMethod<KundliRequest, KundliDocument>`. The interfaces below are
 *     what the published types say, and the factories are checked against
 *     them.
 */

import {
  createTransport,
  HEALTH_PATH,
  type ClientOptions,
  type PdfFile,
  type Result,
  type Transport,
} from './transport.ts';
import type {
  AshtakavargaDocument,
  AshtakavargaRequest,
  BatchDocument,
  BatchMeta,
  BhavaBalaDocument,
  BhavaBalaRequest,
  ChalitDocument,
  ChalitRequest,
  ChartDocument,
  CompareDocument,
  DailyPanchangDocument,
  DashaDocument,
  DashaRequest,
  EphemerisMonthDocument,
  EphemerisMonthRequest,
  EventsDocument,
  EventsRequest,
  GrahaDrishtiDocument,
  GrahaDrishtiRequest,
  HealthDocument,
  HoroscopeDocument,
  HoroscopeRequest,
  JaiminiArudhaPadasRequest,
  JaiminiAspectsDocument,
  JaiminiAspectsRequest,
  JaiminiKarakamshaDocument,
  JaiminiKarakamshaRequest,
  JaiminiKarakasDocument,
  JaiminiKarakasRequest,
  JaiminiPadasDocument,
  KotaChakraRequest,
  KotaDocument,
  KpChartRequest,
  KpDocument,
  KundliChartRequest,
  KundliDocument,
  KundliReportDocument,
  KundliRequest,
  LifeAreasDocument,
  MaitriDocument,
  MaitriRequest,
  MatchAshtakootDocument,
  MatchAshtakootRequest,
  MatchBatchRequest,
  MatchCompareRequest,
  Meta,
  MuhurtaDocument,
  MuhurtaRequest,
  Nakshatra28Document,
  Nakshatra28Request,
  PaceDocument,
  PaceRequest,
  PanchangMonthDocument,
  PanchangMonthRequest,
  PanchangRequest,
  PdfKundliRequest,
  PdfMatchRequest,
  PdfPanchangMonthRequest,
  PdfVarshphalRequest,
  PlacesDocument,
  PlacesMeta,
  ReadingGrahasDocument,
  ReadingHouseLordsDocument,
  ReadingLagnaDocument,
  ReadingNakshatraDocument,
  ReadingYogasDocument,
  ReferenceList,
  ReferenceMeta,
  ReferenceRow,
  ReportGrahasRequest,
  ReportHouseLordsRequest,
  ReportKundliRequest,
  ReportLagnaRequest,
  ReportLifeAreasRequest,
  ReportNakshatraRequest,
  ReportVarshphalRequest,
  ReportVimshottariRequest,
  ReportYogasRequest,
  SadeSatiDocument,
  SadeSatiRequest,
  SarvatobhadraDocument,
  SarvatobhadraRequest,
  ShadbalaDocument,
  ShadbalaRequest,
  SpecialLagnasDocument,
  SpecialLagnasRequest,
  TimezoneDocument,
  TimezoneMeta,
  TransitEventsDocument,
  TransitEventsRequest,
  TransitNowDocument,
  TransitNowRequest,
  TransitScanDocument,
  TransitScanRequest,
  TripatakiDocument,
  TripatakiRequest,
  VargasDocument,
  VargasRequest,
  VarshphalBalaRequest,
  VarshphalDashaRequest,
  VarshphalHarshaBalaDocument,
  VarshphalMuddaDocument,
  VarshphalReadingDocument,
  VarshphalRequest,
  VarshphalSahamsDocument,
  VarshphalSahamsRequest,
  VarshphalTajikaDocument,
  VarshphalVarshaYearDocument,
  VarshphalYogasRequest,
  VikramSamvatDocument,
  VikramSamvatRequest,
  VimshottariReadingDocument,
  YogasDocument,
  YogasRequest,
} from './types.ts';

/**
 * Per-call knobs on a POST.
 *
 * Only cancellation: a base URL, a timeout or a key that changed between two
 * calls is a different client, not a different request.
 */
export interface CallOptions {
  /** Cancel this call. The client's own `timeoutMs` still applies. */
  signal?: AbortSignal;
}

/** `kj.kundli.chart(body, { format: 'svg' })`. */
export interface ChartOptions extends CallOptions {
  /** `'svg'` asks for the markup itself instead of the chart document. */
  format: 'svg';
}

/** `kj.kundli.chart(body)` — the envelope, with `data.svg` inside it. */
export interface ChartJsonOptions extends CallOptions {
  format?: 'json';
}

/** Label languages for a reference table: `'hi'` or `['en', 'hi']`. */
export interface ReferenceOptions {
  /** Joined with commas, because the parameter is one comma-separated field. */
  language?: string | string[];
}

/** `GET /v1/timezone` — which zone covers a point, at an instant. */
export interface TimezoneQuery {
  /** Degrees, `-89.9`…`89.9`. `lat` is the parameter name the API uses. */
  lat: number;
  /** Degrees, `-180`…`180`. */
  lon: number;
  /** Wall clock, `YYYY-MM-DDTHH:MM:SS`. Default: now. */
  datetime?: string;
}

/** `GET /v1/places` — a place search, for filling in a birth's coordinates. */
export interface PlacesQuery {
  /** What the user typed, up to 100 characters. */
  q: string;
  /** ISO 3166-1 alpha-2, to keep the answers inside one country. */
  country?: string;
  /** `1`…`25`. Default `10`. */
  limit?: number;
  /** `'hi'` or `['en', 'hi']`, joined with commas like {@link ReferenceOptions}. */
  language?: string | string[];
}

/**
 * A POST method: a body, an optional signal, an envelope back.
 *
 * Every operation but `kundli.chart`, the PDFs and `health` has exactly this shape,
 * which is why the whole surface below fits on a screen per namespace.
 */
export type PostMethod<B, D, M = Meta> = (body: B, init?: CallOptions) => Promise<Result<D, M>>;

/**
 * Binds a transport once, so a namespace is a list of paths and types.
 *
 * `async`, deliberately: the transport refuses an empty key before it reaches
 * the network, and it does so by throwing. A method that returns a promise
 * must never *also* throw synchronously — a caller who wrote `.catch(…)`
 * would not catch it, and a caller who wrote `await` would. Every failure on
 * this surface is a rejection.
 */
function operations(transport: Transport) {
  return function op<B, D, M = Meta>(path: string): PostMethod<B, D, M> {
    return async (body: B, init: CallOptions = {}) =>
      transport.post<D, M>(path, body, { signal: init.signal });
  };
}

// ---------------------------------------------------------------------------
// Kundli — the birth chart and everything computed from one
// ---------------------------------------------------------------------------

/** `kj.kundli.chart` — two answers from one endpoint. */
export interface ChartMethod {
  /** The SVG document itself. No `meta`: markup carries no envelope. */
  (body: KundliChartRequest, init: ChartOptions): Promise<Result<string, null>>;
  /** The chart document, `svg` included, in the usual envelope. */
  (body: KundliChartRequest, init?: ChartJsonOptions): Promise<Result<ChartDocument>>;
}

/** `kj.kundli` — the birth chart and the eighteen documents read from one. */
export interface KundliNamespace {
  /** `POST /v1/kundli` — positions, houses, panchang at birth. */
  get: PostMethod<KundliRequest, KundliDocument>;
  /** `POST /v1/kundli/chart` — the chart drawn, as SVG. */
  chart: ChartMethod;
  /** `POST /v1/kundli/dasha` — periods for one system. Never cached. */
  dasha: PostMethod<DashaRequest, DashaDocument>;
  /** `POST /v1/kundli/vargas` — divisional charts. */
  vargas: PostMethod<VargasRequest, VargasDocument>;
  /** `POST /v1/kundli/chalit` — bhava chalit cusps. */
  chalit: PostMethod<ChalitRequest, ChalitDocument>;
  /** `POST /v1/kundli/yogas` — the yogas present, with their parts. */
  yogas: PostMethod<YogasRequest, YogasDocument>;
  /** `POST /v1/kundli/shadbala` — the six strengths, per planet. */
  shadbala: PostMethod<ShadbalaRequest, ShadbalaDocument>;
  /** `POST /v1/kundli/bhava-bala` — house strengths. */
  bhavaBala: PostMethod<BhavaBalaRequest, BhavaBalaDocument>;
  /** `POST /v1/kundli/ashtakavarga` — bhinna and sarva. */
  ashtakavarga: PostMethod<AshtakavargaRequest, AshtakavargaDocument>;
  /** `POST /v1/kundli/graha-drishti` — planetary aspects. */
  grahaDrishti: PostMethod<GrahaDrishtiRequest, GrahaDrishtiDocument>;
  /** `POST /v1/kundli/maitri` — natural, temporal and compound friendship. */
  maitri: PostMethod<MaitriRequest, MaitriDocument>;
  /** `POST /v1/kundli/pace` — placement and condition, per planet. */
  pace: PostMethod<PaceRequest, PaceDocument>;
  /** `POST /v1/kundli/special-lagnas` — bhava, hora, ghatika and the rest. */
  specialLagnas: PostMethod<SpecialLagnasRequest, SpecialLagnasDocument>;
  /** `POST /v1/kundli/tripataki` — the tripataki chakra. */
  tripataki: PostMethod<TripatakiRequest, TripatakiDocument>;
  /** `POST /v1/kundli/sarvatobhadra` — the sarvatobhadra chakra. */
  sarvatobhadra: PostMethod<SarvatobhadraRequest, SarvatobhadraDocument>;
  /** `POST /v1/kundli/nakshatra28` — positions in the 28-nakshatra scheme. */
  nakshatra28: PostMethod<Nakshatra28Request, Nakshatra28Document>;
  /** `POST /v1/kundli/sade-sati` — Saturn over the moon sign, in a window. */
  sadeSati: PostMethod<SadeSatiRequest, SadeSatiDocument>;
  /** `POST /v1/kundli/events` — what is coming, in a window. */
  events: PostMethod<EventsRequest, EventsDocument>;
  /** `POST /v1/kundli/kota-chakra` — the kota chakra. Never cached. */
  kotaChakra: PostMethod<KotaChakraRequest, KotaDocument>;
}

function kundliNamespace(transport: Transport): KundliNamespace {
  const op = operations(transport);

  /**
   * One implementation, two signatures. TypeScript will not infer an
   * overloaded type from a function expression, so the cast is what an
   * overload costs; {@link ChartMethod} is the checked part.
   */
  const chart = (async (body: KundliChartRequest, init: ChartOptions | ChartJsonOptions = {}) =>
    init.format === 'svg'
      ? transport.post<string, null>('/v1/kundli/chart', body, {
          accept: 'image/svg+xml',
          signal: init.signal,
        })
      : transport.post<ChartDocument>('/v1/kundli/chart', body, {
          signal: init.signal,
        })) as ChartMethod;

  return {
    get: op('/v1/kundli'),
    chart,
    dasha: op('/v1/kundli/dasha'),
    vargas: op('/v1/kundli/vargas'),
    chalit: op('/v1/kundli/chalit'),
    yogas: op('/v1/kundli/yogas'),
    shadbala: op('/v1/kundli/shadbala'),
    bhavaBala: op('/v1/kundli/bhava-bala'),
    ashtakavarga: op('/v1/kundli/ashtakavarga'),
    grahaDrishti: op('/v1/kundli/graha-drishti'),
    maitri: op('/v1/kundli/maitri'),
    pace: op('/v1/kundli/pace'),
    specialLagnas: op('/v1/kundli/special-lagnas'),
    tripataki: op('/v1/kundli/tripataki'),
    sarvatobhadra: op('/v1/kundli/sarvatobhadra'),
    nakshatra28: op('/v1/kundli/nakshatra28'),
    sadeSati: op('/v1/kundli/sade-sati'),
    events: op('/v1/kundli/events'),
    kotaChakra: op('/v1/kundli/kota-chakra'),
  };
}

// ---------------------------------------------------------------------------
// Panchang, calendar
// ---------------------------------------------------------------------------

/** `kj.panchang` */
export interface PanchangNamespace {
  /** `POST /v1/panchang` — the five limbs for a place and a day. */
  daily: PostMethod<PanchangRequest, DailyPanchangDocument>;
  /**
   * `POST /v1/panchang/muhurta` — the day's windows, choghadiya and hora, for
   * a `birth` (adds tara and chandra bala) or for a place and `date`.
   */
  muhurta: PostMethod<MuhurtaRequest, MuhurtaDocument>;
  /** `POST /v1/panchang/month` — a month of daily panchangs. 20 credits. */
  month: PostMethod<PanchangMonthRequest, PanchangMonthDocument>;
}

function panchangNamespace(transport: Transport): PanchangNamespace {
  const op = operations(transport);
  return {
    daily: op('/v1/panchang'),
    muhurta: op('/v1/panchang/muhurta'),
    month: op('/v1/panchang/month'),
  };
}

/** `kj.ephemeris` */
export interface EphemerisNamespace {
  /** `POST /v1/ephemeris/month` — a month of graha positions. 20 credits. */
  month: PostMethod<EphemerisMonthRequest, EphemerisMonthDocument>;
}

function ephemerisNamespace(transport: Transport): EphemerisNamespace {
  const op = operations(transport);
  return { month: op('/v1/ephemeris/month') };
}

/** `kj.calendar` */
export interface CalendarNamespace {
  /** `POST /v1/calendar/vikram-samvat` — samvat year, maasa, paksha, tithi. */
  vikramSamvat: PostMethod<VikramSamvatRequest, VikramSamvatDocument>;
}

function calendarNamespace(transport: Transport): CalendarNamespace {
  const op = operations(transport);
  return { vikramSamvat: op('/v1/calendar/vikram-samvat') };
}

// ---------------------------------------------------------------------------
// Jaimini, KP
// ---------------------------------------------------------------------------

/** `kj.jaimini` — one document, served in four sections. */
export interface JaiminiNamespace {
  /** `POST /v1/jaimini/karakas` — the chara karakas. */
  karakas: PostMethod<JaiminiKarakasRequest, JaiminiKarakasDocument>;
  /** `POST /v1/jaimini/arudha-padas` — arudha padas for the twelve houses. */
  arudhaPadas: PostMethod<JaiminiArudhaPadasRequest, JaiminiPadasDocument>;
  /** `POST /v1/jaimini/aspects` — rashi drishti. */
  aspects: PostMethod<JaiminiAspectsRequest, JaiminiAspectsDocument>;
  /** `POST /v1/jaimini/karakamsha` — karakamsha lagna and what sits on it. */
  karakamsha: PostMethod<JaiminiKarakamshaRequest, JaiminiKarakamshaDocument>;
}

function jaiminiNamespace(transport: Transport): JaiminiNamespace {
  const op = operations(transport);
  return {
    karakas: op('/v1/jaimini/karakas'),
    arudhaPadas: op('/v1/jaimini/arudha-padas'),
    aspects: op('/v1/jaimini/aspects'),
    karakamsha: op('/v1/jaimini/karakamsha'),
  };
}

/** `kj.kp` */
export interface KpNamespace {
  /** `POST /v1/kp/chart` — Placidus cusps with sub-lords. */
  chart: PostMethod<KpChartRequest, KpDocument>;
}

function kpNamespace(transport: Transport): KpNamespace {
  const op = operations(transport);
  return { chart: op('/v1/kp/chart') };
}

// ---------------------------------------------------------------------------
// Varshphal, transit, match
// ---------------------------------------------------------------------------

/** `kj.varshphal` — one document, served in five sections. */
export interface VarshphalNamespace {
  /** `POST /v1/varshphal` — the annual chart for a year. */
  get: PostMethod<VarshphalRequest, VarshphalVarshaYearDocument>;
  /** `POST /v1/varshphal/bala` — harsha bala, panchavargiya and dwadasha. */
  bala: PostMethod<VarshphalBalaRequest, VarshphalHarshaBalaDocument>;
  /** `POST /v1/varshphal/sahams` — the sahams for the year. */
  sahams: PostMethod<VarshphalSahamsRequest, VarshphalSahamsDocument>;
  /** `POST /v1/varshphal/yogas` — tajika yogas. */
  yogas: PostMethod<VarshphalYogasRequest, VarshphalTajikaDocument>;
  /** `POST /v1/varshphal/dasha` — mudda and patyayini. */
  dasha: PostMethod<VarshphalDashaRequest, VarshphalMuddaDocument>;
}

function varshphalNamespace(transport: Transport): VarshphalNamespace {
  const op = operations(transport);
  return {
    get: op('/v1/varshphal'),
    bala: op('/v1/varshphal/bala'),
    sahams: op('/v1/varshphal/sahams'),
    yogas: op('/v1/varshphal/yogas'),
    dasha: op('/v1/varshphal/dasha'),
  };
}

/** `kj.transit` */
export interface TransitNamespace {
  /** `POST /v1/transit/now` — the sky at an instant. Uncached without `at`. */
  now: PostMethod<TransitNowRequest, TransitNowDocument>;
  /** `POST /v1/transit/scan` — gochar events in a window. 20 credits. */
  scan: PostMethod<TransitScanRequest, TransitScanDocument>;
  /**
   * `POST /v1/transit/events` — the sign ingresses and stations of a `year`,
   * the same for everyone: no birth. 20 credits.
   */
  events: PostMethod<TransitEventsRequest, TransitEventsDocument>;
}

function transitNamespace(transport: Transport): TransitNamespace {
  const op = operations(transport);
  return {
    now: op('/v1/transit/now'),
    scan: op('/v1/transit/scan'),
    events: op('/v1/transit/events'),
  };
}

/** `kj.match` */
export interface MatchNamespace {
  /** `POST /v1/match/ashtakoot` — the eight kootas and the total. */
  ashtakoot: PostMethod<MatchAshtakootRequest, MatchAshtakootDocument>;
  /** `POST /v1/match/compare` — two charts side by side. Never cached. */
  compare: PostMethod<MatchCompareRequest, CompareDocument>;
  /**
   * `POST /v1/match/batch` — up to 100 pairs, 1 credit each (`meta.credits`).
   *
   * A pair that could not be answered comes back as `results[i].error`
   * rather than as a thrown error (design decision 6): the other pairs were
   * computed and charged, and throwing would discard them.
   */
  batch: PostMethod<MatchBatchRequest, BatchDocument, BatchMeta>;
}

function matchNamespace(transport: Transport): MatchNamespace {
  const op = operations(transport);
  return {
    ashtakoot: op('/v1/match/ashtakoot'),
    compare: op('/v1/match/compare'),
    batch: op('/v1/match/batch'),
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** `kj.reports` — written readings, text keyed by language. 5 credits each. */
export interface ReportsNamespace {
  /** `POST /v1/reports/lagna` — the lagna of a `birth`, or a `sign` read directly. */
  lagna: PostMethod<ReportLagnaRequest, ReadingLagnaDocument>;
  /** `POST /v1/reports/nakshatra` — the janma nakshatra of a `birth`, or one read directly. */
  nakshatra: PostMethod<ReportNakshatraRequest, ReadingNakshatraDocument>;
  /**
   * `POST /v1/reports/house-lords` — for each of the twelve houses of a
   * `birth`, its lord, the house the lord sits in, and a reading.
   */
  houseLords: PostMethod<ReportHouseLordsRequest, ReadingHouseLordsDocument>;
  /**
   * `POST /v1/reports/grahas` — for each of the nine grahas of a `birth`,
   * its sign and house and what it says in each.
   */
  grahas: PostMethod<ReportGrahasRequest, ReadingGrahasDocument>;
  /** `POST /v1/reports/yogas` — the yogas that form in a `birth` chart, each read. */
  yogas: PostMethod<ReportYogasRequest, ReadingYogasDocument>;
  /**
   * `POST /v1/reports/vimshottari` — every mahadasha of a `birth`, each with
   * its dates, a `level` and a reading; `current` marks the one running.
   */
  vimshottari: PostMethod<ReportVimshottariRequest, VimshottariReadingDocument>;
  /**
   * `POST /v1/reports/varshphal` — the `year` from the birthday in it: a
   * summary, seven life areas and the year's periods.
   */
  varshphal: PostMethod<ReportVarshphalRequest, VarshphalReadingDocument>;
  /**
   * `POST /v1/reports/life-areas` — eleven areas of life a `birth` chart
   * shows, each with a `level` and a reading, and a summary.
   */
  lifeAreas: PostMethod<ReportLifeAreasRequest, LifeAreasDocument>;
  /**
   * `POST /v1/reports/kundli` — several of the reports above for one `birth`
   * in one request: `parts` names them (default all eight), and each comes
   * back as its own route answers it. Priced 5 credits per part (`meta.credits`).
   */
  kundli: PostMethod<ReportKundliRequest, KundliReportDocument>;
}

function reportsNamespace(transport: Transport): ReportsNamespace {
  const op = operations(transport);
  return {
    lagna: op('/v1/reports/lagna'),
    nakshatra: op('/v1/reports/nakshatra'),
    houseLords: op('/v1/reports/house-lords'),
    grahas: op('/v1/reports/grahas'),
    yogas: op('/v1/reports/yogas'),
    vimshottari: op('/v1/reports/vimshottari'),
    varshphal: op('/v1/reports/varshphal'),
    lifeAreas: op('/v1/reports/life-areas'),
    kundli: op('/v1/reports/kundli'),
  };
}

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------

/**
 * A PDF method: the JSON route's body plus the PDF fields, and the file back.
 *
 * `meta` is always `null` — a PDF carries no envelope — and `cached` says
 * whether the 24-hour cache answered (`X-KJ-Cache: hit`), which uses no PDF
 * from the month's allowance but still costs the credits.
 */
export type PdfMethod<B> = (body: B, init?: CallOptions) => Promise<Result<PdfFile, null>>;

/**
 * `kj.pdf` — printable PDFs. Every paid plan (not Free), secret keys only;
 * 1,000 credits for a kundli and 500 for the others, and one PDF from the
 * month's allowance each.
 */
export interface PdfNamespace {
  /** `POST /v1/pdf/kundli` — the birth chart, `basic` (default) or `professional` edition. */
  kundli: PdfMethod<PdfKundliRequest>;
  /** `POST /v1/pdf/match` — the ashtakoot match: the kootas, both charts, mangal dosha. */
  match: PdfMethod<PdfMatchRequest>;
  /** `POST /v1/pdf/varshphal` — the annual chart for `year` and its reading. */
  varshphal: PdfMethod<PdfVarshphalRequest>;
  /** `POST /v1/pdf/panchang/month` — a month of panchang at a place, one day per row. */
  panchangMonth: PdfMethod<PdfPanchangMonthRequest>;
}

function pdfNamespace(transport: Transport): PdfNamespace {
  function op<B>(path: string): PdfMethod<B> {
    // `async` for the same reason as `operations`: every failure is a rejection.
    return async (body: B, init: CallOptions = {}) =>
      transport.post<PdfFile, null>(path, body, {
        accept: 'application/pdf',
        signal: init.signal,
      });
  }
  return {
    kundli: op('/v1/pdf/kundli'),
    match: op('/v1/pdf/match'),
    varshphal: op('/v1/pdf/varshphal'),
    panchangMonth: op('/v1/pdf/panchang/month'),
  };
}

/**
 * The Kaal Jyoti API, typed.
 *
 * ```ts
 * const kj = new Kaaljyoti({ apiKey: process.env.KAALJYOTI_API_KEY! });
 *
 * const { data, meta } = await kj.kundli.get({
 *   birth: {
 *     datetime: '1990-05-14T10:30:00',
 *     timezone: 'Asia/Kolkata',
 *     latitude: 28.6139,
 *     longitude: 77.209,
 *   },
 * });
 * ```
 *
 * Every method returns the envelope — `data` and `meta` together — because
 * `meta` is how an application answers "why is this number what it is"
 * (design decision 2). Every failure is a thrown {@link KaaljyotiError} with
 * a `code`; branch on the code, never on the message.
 */
export class Kaaljyoti {
  /** The birth chart and the eighteen documents computed from one. */
  readonly kundli: KundliNamespace;
  /** Daily panchang, the day's windows, a month of panchang. */
  readonly panchang: PanchangNamespace;
  /** A month of graha positions. */
  readonly ephemeris: EphemerisNamespace;
  /** Vikram Samvat. */
  readonly calendar: CalendarNamespace;
  /** Chara karakas, arudha padas, rashi drishti, karakamsha. */
  readonly jaimini: JaiminiNamespace;
  /** Krishnamurti Paddhati. */
  readonly kp: KpNamespace;
  /** The annual chart and what is read from it. */
  readonly varshphal: VarshphalNamespace;
  /** The sky now, gochar over a window, and the events of a year. */
  readonly transit: TransitNamespace;
  /** Ashtakoot, a full comparison, and both in bulk. */
  readonly match: MatchNamespace;
  /**
   * The readings: lagna and nakshatra, and the personal reports of one birth
   * (house lords, grahas, yogas, Vimshottari, varshphal, life areas). On
   * every plan, 5 credits each.
   */
  readonly reports: ReportsNamespace;
  /**
   * Printable kundli, match, varshphal and monthly panchang PDFs, answered as
   * bytes. Every paid plan, not Free; a publishable key cannot make one.
   */
  readonly pdf: PdfNamespace;

  /**
   * `POST /v1/horoscope` — a sign's day, week, month or year as one summary
   * and five life areas, each with a `level`. 5 credits.
   *
   * A family on its own at the top level, like `timezone`: there is one
   * horoscope, so a namespace around it would be a word with nothing in it.
   */
  readonly horoscope: PostMethod<HoroscopeRequest, HoroscopeDocument>;

  /**
   * `GET /v1/health` — liveness. Costs no credits and needs no key.
   *
   * The one answer with no envelope around it, so `meta` is always `null`.
   */
  readonly health: () => Promise<Result<HealthDocument, null>>;

  /**
   * `GET /v1/reference/{list}` — a static table. Costs no credits.
   * `'credits'` is the price list: `{ route, credits, per? }` for every metered route.
   *
   * ```ts
   * const { data } = await kj.reference('signs', { language: ['en', 'hi'] });
   * ```
   */
  readonly reference: (
    list: ReferenceList,
    opts?: ReferenceOptions,
  ) => Promise<Result<ReferenceRow[], ReferenceMeta>>;

  /**
   * `GET /v1/timezone` — the zone covering a point, and its offset at an
   * instant. Costs no credits, and is the cheapest way to fill in a `timezone`
   * you would otherwise have to guess.
   */
  readonly timezone: (query: TimezoneQuery) => Promise<Result<TimezoneDocument, TimezoneMeta>>;

  /**
   * `GET /v1/places` — places matching a name, best first, each with the
   * coordinates and zone a `birth` wants. 1 credit per search, so search on
   * a pause in typing rather than on every key.
   */
  readonly places: (query: PlacesQuery) => Promise<Result<PlacesDocument, PlacesMeta>>;

  constructor(options: ClientOptions) {
    const transport = createTransport(options);

    this.kundli = kundliNamespace(transport);
    this.panchang = panchangNamespace(transport);
    this.ephemeris = ephemerisNamespace(transport);
    this.calendar = calendarNamespace(transport);
    this.jaimini = jaiminiNamespace(transport);
    this.kp = kpNamespace(transport);
    this.varshphal = varshphalNamespace(transport);
    this.transit = transitNamespace(transport);
    this.match = matchNamespace(transport);
    this.reports = reportsNamespace(transport);
    this.pdf = pdfNamespace(transport);
    this.horoscope = operations(transport)<HoroscopeRequest, HoroscopeDocument>('/v1/horoscope');

    // Arrow functions, not prototype methods, for the same reason the
    // namespaces are objects: `const { health } = kj` has to keep working.
    // `async` for the same reason as `operations` above.
    this.health = async () => transport.get<HealthDocument, null>(HEALTH_PATH);

    this.reference = async (list, opts = {}) => {
      const language = opts.language;
      return transport.get<ReferenceRow[], ReferenceMeta>(
        // `ReferenceList` is a closed enum, but a JavaScript caller is not
        // typechecked and a stray `/` must not invent a path segment.
        `/v1/reference/${encodeURIComponent(list)}`,
        { language: Array.isArray(language) ? language.join(',') : language },
      );
    };

    this.timezone = async (query) =>
      transport.get<TimezoneDocument, TimezoneMeta>('/v1/timezone', {
        lat: query.lat,
        lon: query.lon,
        datetime: query.datetime,
      });

    this.places = async (query) => {
      const language = query.language;
      return transport.get<PlacesDocument, PlacesMeta>('/v1/places', {
        q: query.q,
        country: query.country,
        limit: query.limit,
        language: Array.isArray(language) ? language.join(',') : language,
      });
    };
  }
}

/**
 * `new Kaaljyoti(options)`, for code that prefers a function.
 *
 * Identical in every way; `new` reads badly in a module that exports a
 * configured singleton, and this saves that argument being had.
 */
export function createClient(options: ClientOptions): Kaaljyoti {
  return new Kaaljyoti(options);
}
