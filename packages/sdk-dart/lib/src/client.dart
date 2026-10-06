/// The client: one method per endpoint, grouped the way the paths are.
///
/// Everything hard already happened in `transport.dart` — where the key goes,
/// what a `Retry-After` means, how an envelope becomes a [KjResult]. What is
/// left is naming, and naming is the whole value of an SDK: a caller should be
/// able to guess `kj.kundli.sadeSati` from having seen `/v1/kundli/sade-sati`
/// and be right. The names match `@kaaljyoti/sdk`, the TypeScript client,
/// method for method.
///
/// **No path string is typed twice.** Every method looks its path up in the
/// generated `operations` table by `operationId`, so a typo is a `StateError`
/// at construction rather than a 404 in production, and the contract test
/// walks the same table to prove that all 57 operations are reachable.
library;

import 'package:http/http.dart' as http;

import 'errors.dart';
import 'generated/_json.dart';
import 'generated/models.dart';
import 'generated/operations.dart';
import 'generated/version.dart';
import 'result.dart';
import 'transport.dart';

/// Every operation's path, by `operationId`, from the generated table.
final Map<String, String> _pathsById = <String, String>{
  for (final operation in operations) operation.id: operation.path,
};

/// The path for [operationId], or a [StateError] naming the id that is gone.
///
/// Called once per method at construction time, so a regenerated snapshot that
/// drops or renames an operation fails the moment a client is built.
String _pathOf(String operationId) {
  final path = _pathsById[operationId];
  if (path == null) {
    throw StateError('No operation "$operationId" in the generated table');
  }
  return path;
}

/// The envelope's `meta` for every endpoint that carries the standard one.
Meta _meta(Object? json) => Meta.fromJson(asMap(json));

/// A POST that answers a document and the standard [Meta].
///
/// The shape of most of the fifty-seven operations, which is why each method
/// below is one line.
Future<KjResult<D, Meta>> _call<D>(
  Transport transport,
  String operationId,
  Map<String, dynamic> body,
  D Function(Map<String, dynamic> json) fromJson,
) {
  return transport.post<D, Meta>(
    _pathOf(operationId),
    body,
    decode: (json) => fromJson(asMap(json)),
    decodeMeta: _meta,
  );
}

/// `kj.kundli` — the birth chart and the eighteen documents read from one.
class KundliApi {
  /// Binds the namespace to the client's transport.
  const KundliApi(this._transport);

  final Transport _transport;

  /// `POST /v1/kundli` — positions, houses and the panchang at birth.
  Future<KjResult<KundliDocument, Meta>> get(KundliRequest request) => _call(
      _transport, 'postKundli', request.toJson(), KundliDocument.fromJson);

  /// `POST /v1/kundli/chart` — the chart document, with the markup in `svg`.
  ///
  /// `firstHouse` rotates the chart: `lagna` (the default), a graha — `moon`
  /// draws the Chandra kundli — or `house_2` … `house_12` for bhavat bhavam.
  /// The document echoes `firstHouse`, names the sign drawn as house 1 in
  /// `firstHouseSign` and says what the chart is in `title`.
  ///
  /// Use [chartSvg] to get the markup on its own.
  Future<KjResult<ChartDocument, Meta>> chart(KundliChartRequest request) =>
      _call(_transport, 'postKundliChart', request.toJson(),
          ChartDocument.fromJson);

  /// `POST /v1/kundli/chart` asked for as `image/svg+xml` — the markup itself.
  ///
  /// The same endpoint and the same call cost as [chart]; only the `Accept`
  /// differs, and markup carries no envelope, so `meta` is `null`.
  Future<KjResult<String, Null>> chartSvg(KundliChartRequest request) =>
      _transport.post<String, Null>(
        _pathOf('postKundliChart'),
        request.toJson(),
        decode: (json) => json! as String,
        decodeMeta: (_) => null,
        accept: acceptSvg,
      );

  /// `POST /v1/kundli/dasha` — the periods of one system. Never cached.
  Future<KjResult<DashaDocument, Meta>> dasha(DashaRequest request) => _call(
      _transport, 'postKundliDasha', request.toJson(), DashaDocument.fromJson);

  /// `POST /v1/kundli/vargas` — the divisional charts.
  Future<KjResult<VargasDocument, Meta>> vargas(VargasRequest request) => _call(
      _transport,
      'postKundliVargas',
      request.toJson(),
      VargasDocument.fromJson);

  /// `POST /v1/kundli/chalit` — the bhava chalit cusps.
  Future<KjResult<ChalitDocument, Meta>> chalit(ChalitRequest request) => _call(
      _transport,
      'postKundliChalit',
      request.toJson(),
      ChalitDocument.fromJson);

  /// `POST /v1/kundli/yogas` — the yogas present, with the parts that make
  /// each one.
  Future<KjResult<YogasDocument, Meta>> yogas(KundliRequest request) => _call(
      _transport, 'postKundliYogas', request.toJson(), YogasDocument.fromJson);

  /// `POST /v1/kundli/shadbala` — the six strengths, per planet.
  Future<KjResult<ShadbalaDocument, Meta>> shadbala(KundliRequest request) =>
      _call(_transport, 'postKundliShadbala', request.toJson(),
          ShadbalaDocument.fromJson);

  /// `POST /v1/kundli/bhava-bala` — the house strengths.
  Future<KjResult<BhavaBalaDocument, Meta>> bhavaBala(KundliRequest request) =>
      _call(_transport, 'postKundliBhavaBala', request.toJson(),
          BhavaBalaDocument.fromJson);

  /// `POST /v1/kundli/ashtakavarga` — bhinna and sarva.
  Future<KjResult<AshtakavargaDocument, Meta>> ashtakavarga(
          KundliRequest request) =>
      _call(_transport, 'postKundliAshtakavarga', request.toJson(),
          AshtakavargaDocument.fromJson);

  /// `POST /v1/kundli/graha-drishti` — the planetary aspects.
  Future<KjResult<GrahaDrishtiDocument, Meta>> grahaDrishti(
          KundliRequest request) =>
      _call(_transport, 'postKundliGrahaDrishti', request.toJson(),
          GrahaDrishtiDocument.fromJson);

  /// `POST /v1/kundli/maitri` — natural, temporal and compound friendship.
  Future<KjResult<MaitriDocument, Meta>> maitri(KundliRequest request) => _call(
      _transport,
      'postKundliMaitri',
      request.toJson(),
      MaitriDocument.fromJson);

  /// `POST /v1/kundli/pace` — placement and condition, per planet.
  Future<KjResult<PaceDocument, Meta>> pace(KundliRequest request) => _call(
      _transport, 'postKundliPace', request.toJson(), PaceDocument.fromJson);

  /// `POST /v1/kundli/special-lagnas` — bhava, hora, ghatika and the rest.
  Future<KjResult<SpecialLagnasDocument, Meta>> specialLagnas(
          KundliRequest request) =>
      _call(_transport, 'postKundliSpecialLagnas', request.toJson(),
          SpecialLagnasDocument.fromJson);

  /// `POST /v1/kundli/tripataki` — the tripataki chakra.
  Future<KjResult<TripatakiDocument, Meta>> tripataki(KundliRequest request) =>
      _call(_transport, 'postKundliTripataki', request.toJson(),
          TripatakiDocument.fromJson);

  /// `POST /v1/kundli/sarvatobhadra` — the sarvatobhadra chakra.
  Future<KjResult<SarvatobhadraDocument, Meta>> sarvatobhadra(
          KundliRequest request) =>
      _call(_transport, 'postKundliSarvatobhadra', request.toJson(),
          SarvatobhadraDocument.fromJson);

  /// `POST /v1/kundli/nakshatra28` — positions in the 28-nakshatra scheme.
  Future<KjResult<Nakshatra28Document, Meta>> nakshatra28(
          KundliRequest request) =>
      _call(_transport, 'postKundliNakshatra28', request.toJson(),
          Nakshatra28Document.fromJson);

  /// `POST /v1/kundli/sade-sati` — Saturn over the moon sign, in a window.
  Future<KjResult<SadeSatiDocument, Meta>> sadeSati(SadeSatiRequest request) =>
      _call(_transport, 'postKundliSadeSati', request.toJson(),
          SadeSatiDocument.fromJson);

  /// `POST /v1/kundli/events` — what is coming, in a window.
  Future<KjResult<EventsDocument, Meta>> events(SadeSatiRequest request) =>
      _call(_transport, 'postKundliEvents', request.toJson(),
          EventsDocument.fromJson);

  /// `POST /v1/kundli/kota-chakra` — the kota chakra. Never cached.
  Future<KjResult<KotaDocument, Meta>> kotaChakra(KundliRequest request) =>
      _call(_transport, 'postKundliKotaChakra', request.toJson(),
          KotaDocument.fromJson);
}

/// `kj.panchang` — the five limbs, the day's windows, a month of panchang.
class PanchangApi {
  /// Binds the namespace to the client's transport.
  const PanchangApi(this._transport);

  final Transport _transport;

  /// `POST /v1/panchang` — the five limbs for a place and a day.
  Future<KjResult<DailyPanchangDocument, Meta>> daily(
          PanchangRequest request) =>
      _call(_transport, 'postPanchang', request.toJson(),
          DailyPanchangDocument.fromJson);

  /// `POST /v1/panchang/muhurta` — the day's windows, choghadiya and hora.
  ///
  /// Send either `birth` (the answer adds `taraBala` and `chandraBala`) or a
  /// place — `latitude`, `longitude`, optional `timezone`/`utcOffset` — with
  /// an optional `date`, as for [daily].
  Future<KjResult<MuhurtaDocument, Meta>> muhurta(MuhurtaRequest request) =>
      _call(_transport, 'postPanchangMuhurta', request.toJson(),
          MuhurtaDocument.fromJson);

  /// `POST /v1/panchang/month` — a month of daily panchangs.
  ///
  /// 20 credits, 10 a minute.
  Future<KjResult<PanchangMonthDocument, Meta>> month(
          PanchangMonthRequest request) =>
      _call(_transport, 'postPanchangMonth', request.toJson(),
          PanchangMonthDocument.fromJson);
}

/// `kj.ephemeris` — a month of graha positions at a place.
class EphemerisApi {
  /// Binds the namespace to the client's transport.
  const EphemerisApi(this._transport);

  final Transport _transport;

  /// `POST /v1/ephemeris/month` — a month of positions, sidereal and tropical
  /// unless `system` narrows it.
  ///
  /// 20 credits, 10 a minute.
  Future<KjResult<EphemerisMonthDocument, Meta>> month(
          EphemerisMonthRequest request) =>
      _call(_transport, 'postEphemerisMonth', request.toJson(),
          EphemerisMonthDocument.fromJson);
}

/// `kj.calendar` — the Vikram Samvat calendar.
class CalendarApi {
  /// Binds the namespace to the client's transport.
  const CalendarApi(this._transport);

  final Transport _transport;

  /// `POST /v1/calendar/vikram-samvat` — samvat year, maasa, paksha, tithi.
  Future<KjResult<VikramSamvatDocument, Meta>> vikramSamvat(
          VikramSamvatRequest request) =>
      _call(_transport, 'postCalendarVikramSamvat', request.toJson(),
          VikramSamvatDocument.fromJson);
}

/// `kj.jaimini` — one document, served in four sections.
///
/// Asking for the second section of the same chart is a cache hit, and still
/// costs its own call.
class JaiminiApi {
  /// Binds the namespace to the client's transport.
  const JaiminiApi(this._transport);

  final Transport _transport;

  /// `POST /v1/jaimini/karakas` — the chara karakas.
  Future<KjResult<JaiminiKarakasDocument, Meta>> karakas(
          KundliRequest request) =>
      _call(_transport, 'postJaiminiKarakas', request.toJson(),
          JaiminiKarakasDocument.fromJson);

  /// `POST /v1/jaimini/arudha-padas` — arudha padas for the twelve houses.
  Future<KjResult<JaiminiPadasDocument, Meta>> arudhaPadas(
          KundliRequest request) =>
      _call(_transport, 'postJaiminiArudhaPadas', request.toJson(),
          JaiminiPadasDocument.fromJson);

  /// `POST /v1/jaimini/aspects` — rashi drishti.
  Future<KjResult<JaiminiAspectsDocument, Meta>> aspects(
          KundliRequest request) =>
      _call(_transport, 'postJaiminiAspects', request.toJson(),
          JaiminiAspectsDocument.fromJson);

  /// `POST /v1/jaimini/karakamsha` — karakamsha lagna and what sits on it.
  Future<KjResult<JaiminiKarakamshaDocument, Meta>> karakamsha(
          KundliRequest request) =>
      _call(_transport, 'postJaiminiKarakamsha', request.toJson(),
          JaiminiKarakamshaDocument.fromJson);
}

/// `kj.kp` — Krishnamurti Paddhati.
class KpApi {
  /// Binds the namespace to the client's transport.
  const KpApi(this._transport);

  final Transport _transport;

  /// `POST /v1/kp/chart` — Placidus cusps with their sub-lords.
  Future<KjResult<KpDocument, Meta>> chart(KundliRequest request) =>
      _call(_transport, 'postKpChart', request.toJson(), KpDocument.fromJson);
}

/// `kj.varshphal` — one document, served in five sections.
class VarshphalApi {
  /// Binds the namespace to the client's transport.
  const VarshphalApi(this._transport);

  final Transport _transport;

  /// `POST /v1/varshphal` — the annual chart for a year.
  Future<KjResult<VarshphalVarshaYearDocument, Meta>> get(
          VarshphalRequest request) =>
      _call(_transport, 'postVarshphal', request.toJson(),
          VarshphalVarshaYearDocument.fromJson);

  /// `POST /v1/varshphal/bala` — harsha bala, panchavargiya and dwadasha.
  Future<KjResult<VarshphalHarshaBalaDocument, Meta>> bala(
          VarshphalRequest request) =>
      _call(_transport, 'postVarshphalBala', request.toJson(),
          VarshphalHarshaBalaDocument.fromJson);

  /// `POST /v1/varshphal/sahams` — the sahams for the year.
  Future<KjResult<VarshphalSahamsDocument, Meta>> sahams(
          VarshphalRequest request) =>
      _call(_transport, 'postVarshphalSahams', request.toJson(),
          VarshphalSahamsDocument.fromJson);

  /// `POST /v1/varshphal/yogas` — the tajika yogas.
  Future<KjResult<VarshphalTajikaDocument, Meta>> yogas(
          VarshphalRequest request) =>
      _call(_transport, 'postVarshphalYogas', request.toJson(),
          VarshphalTajikaDocument.fromJson);

  /// `POST /v1/varshphal/dasha` — mudda and patyayini.
  Future<KjResult<VarshphalMuddaDocument, Meta>> dasha(
          VarshphalRequest request) =>
      _call(_transport, 'postVarshphalDasha', request.toJson(),
          VarshphalMuddaDocument.fromJson);
}

/// `kj.transit` — the sky now, gochar over a window, and the events of a year.
class TransitApi {
  /// Binds the namespace to the client's transport.
  const TransitApi(this._transport);

  final Transport _transport;

  /// `POST /v1/transit/now` — the sky at an instant.
  ///
  /// Never cached without an explicit `at`.
  Future<KjResult<TransitNowDocument, Meta>> now(TransitNowRequest request) =>
      _call(_transport, 'postTransitNow', request.toJson(),
          TransitNowDocument.fromJson);

  /// `POST /v1/transit/scan` — gochar events in a window.
  ///
  /// 20 credits, 10 a minute, closed to publishable keys.
  Future<KjResult<TransitScanDocument, Meta>> scan(
          TransitScanRequest request) =>
      _call(_transport, 'postTransitScan', request.toJson(),
          TransitScanDocument.fromJson);

  /// `POST /v1/transit/events` — the sign ingresses and stations of a `year`.
  ///
  /// The same for everyone, so there is no birth: a `year` (or a `from`…`to`
  /// window of at most 366 days) and a `timezone` for the local times. `moon`,
  /// `nakshatras` and `combustion` add more kinds.
  ///
  /// 20 credits, 10 a minute.
  Future<KjResult<TransitEventsDocument, Meta>> events(
          TransitEventsRequest request) =>
      _call(_transport, 'postTransitEvents', request.toJson(),
          TransitEventsDocument.fromJson);
}

/// `kj.match` — ashtakoot, a full comparison, and both in bulk.
class MatchApi {
  /// Binds the namespace to the client's transport.
  const MatchApi(this._transport);

  final Transport _transport;

  /// `POST /v1/match/ashtakoot` — the eight kootas and the total.
  Future<KjResult<MatchAshtakootDocument, Meta>> ashtakoot(
          MatchAshtakootRequest request) =>
      _call(_transport, 'postMatchAshtakoot', request.toJson(),
          MatchAshtakootDocument.fromJson);

  /// `POST /v1/match/compare` — two charts side by side. Never cached.
  Future<KjResult<CompareDocument, Meta>> compare(
          MatchCompareRequest request) =>
      _call(_transport, 'postMatchCompare', request.toJson(),
          CompareDocument.fromJson);

  /// `POST /v1/match/batch` — up to 100 pairs, 1 credit each (`meta.credits`).
  ///
  /// A pair that could not be answered comes back as `results[i].error` rather
  /// than as a thrown exception: the other pairs were computed and charged,
  /// and throwing would discard answers already paid for. Only the whole
  /// request failing — a bad key, a body over the 8 KB limit, the rate limit —
  /// throws.
  ///
  /// 10 a minute, and closed to publishable keys.
  Future<KjResult<BatchDocument, BatchMeta>> batch(MatchBatchRequest request) =>
      _transport.post<BatchDocument, BatchMeta>(
        _pathOf('postMatchBatch'),
        request.toJson(),
        decode: (json) => BatchDocument.fromJson(asMap(json)),
        decodeMeta: (json) => BatchMeta.fromJson(asMap(json)),
      );
}

/// `kj.reports` — written readings, the text keyed by language.
///
/// Each answer carries one text per language of `options.language`, in that
/// order, and closes with a `disclaimer` that `options.disclaimer` can name an
/// astrologer in or turn off (see [Disclaimer]). On every plan; each costs 5
/// credits.
class ReportsApi {
  /// Binds the namespace to the client's transport.
  const ReportsApi(this._transport);

  final Transport _transport;

  /// `POST /v1/reports/lagna` — the lagna of a `birth`, or a `sign` read
  /// directly.
  Future<KjResult<ReadingLagnaDocument, Meta>> lagna(
          ReportLagnaRequest request) =>
      _call(_transport, 'postReportsLagna', request.toJson(),
          ReadingLagnaDocument.fromJson);

  /// `POST /v1/reports/nakshatra` — the janma nakshatra of a `birth`, or a
  /// `nakshatra` (`ashwini`, `purva_phalguni`, …) read directly.
  Future<KjResult<ReadingNakshatraDocument, Meta>> nakshatra(
          ReportNakshatraRequest request) =>
      _call(_transport, 'postReportsNakshatra', request.toJson(),
          ReadingNakshatraDocument.fromJson);

  /// `POST /v1/reports/house-lords` — for each of the twelve houses of a
  /// `birth`, the sign on it, its lord, the house the lord sits in
  /// (whole-sign, from the lagna) and a reading: twelve [HouseLord]s in house
  /// order.
  ///
  /// The body is a `birth` and `options`, the same [KundliRequest] as
  /// [KundliApi.get]; there is nothing to pick.
  Future<KjResult<ReadingHouseLordsDocument, Meta>> houseLords(
          KundliRequest request) =>
      _call(_transport, 'postReportsHouseLords', request.toJson(),
          ReadingHouseLordsDocument.fromJson);

  /// `POST /v1/reports/grahas` — for each of the nine grahas of a `birth`,
  /// its sign and house (whole-sign, from the lagna) and what it says in each:
  /// nine [GrahaReading]s, Sun to Ketu.
  Future<KjResult<ReadingGrahasDocument, Meta>> grahas(KundliRequest request) =>
      _call(_transport, 'postReportsGrahas', request.toJson(),
          ReadingGrahasDocument.fromJson);

  /// `POST /v1/reports/yogas` — the yogas that form in a `birth` chart: one
  /// [YogaReading] per yoga, by `code` (`gaja_kesari`), with its `category`,
  /// the grahas that make it and a reading.
  Future<KjResult<ReadingYogasDocument, Meta>> yogas(KundliRequest request) =>
      _call(_transport, 'postReportsYogas', request.toJson(),
          ReadingYogasDocument.fromJson);

  /// `POST /v1/reports/vimshottari` — every mahadasha of a `birth`: one
  /// [MahadashaReading] each, with its dates, a `level` (`favourable`,
  /// `mixed` or `care`), a reading and its antardashas; `current` marks the
  /// one running. `basis` is the reasoning, for you rather than the reader.
  Future<KjResult<VimshottariReadingDocument, Meta>> vimshottari(
          KundliRequest request) =>
      _call(_transport, 'postReportsVimshottari', request.toJson(),
          VimshottariReadingDocument.fromJson);

  /// `POST /v1/reports/varshphal` — the year from the birthday in `year`, by
  /// the Tajika rules: a `summary`, seven [AreaSummary]s (work, money,
  /// relationships, health, education, home, travel) and the year's periods
  /// (`months`, [VarshphalPeriod]s).
  Future<KjResult<VarshphalReadingDocument, Meta>> varshphal(
          VarshphalRequest request) =>
      _call(_transport, 'postReportsVarshphal', request.toJson(),
          VarshphalReadingDocument.fromJson);

  /// `POST /v1/reports/life-areas` — eleven areas of life a `birth` chart
  /// shows, one [LifeArea] each with a `level` and a reading, and a summary
  /// naming the strongest and those that need care.
  Future<KjResult<LifeAreasDocument, Meta>> lifeAreas(KundliRequest request) =>
      _call(_transport, 'postReportsLifeAreas', request.toJson(),
          LifeAreasDocument.fromJson);

  /// `POST /v1/reports/kundli` — several of the reports above for one
  /// `birth` at once. `parts` names any of `lagna`, `nakshatra`,
  /// `life_areas`, `house_lords`, `grahas`, `yogas`, `vimshottari` and
  /// `varshphal` (default all eight); each comes back as its own route
  /// answers it. Without a `year` the varshphal is the one running now.
  /// Priced 5 credits per part (`meta.credits`).
  Future<KjResult<KundliReportDocument, Meta>> kundli(
          ReportKundliRequest request) =>
      _call(_transport, 'postReportsKundli', request.toJson(),
          KundliReportDocument.fromJson);
}

/// `kj.pdf` — printable PDFs, answered as bytes.
///
/// Every paid plan (not Free), secret keys only; 1,000 credits for a kundli
/// and 500 for the others, and one PDF from the month's allowance each. `meta`
/// is always `null` — a PDF carries no envelope — and `cached` says whether
/// the 24-hour cache answered (`X-KJ-Cache: hit`), which uses no PDF from the
/// allowance but still costs the credits. A failure is the usual JSON error
/// and throws a [KaaljyotiException], never a PDF.
class PdfApi {
  /// Binds the namespace to the client's transport.
  const PdfApi(this._transport);

  final Transport _transport;

  /// `POST /v1/pdf/kundli` — the birth chart, `basic` (default) or
  /// `professional` edition.
  Future<KjResult<PdfFile, Null>> kundli(PdfKundliRequest request) =>
      _pdf(_transport, 'postPdfKundli', request.toJson());

  /// `POST /v1/pdf/match` — the ashtakoot match: the kootas, both charts,
  /// mangal dosha.
  Future<KjResult<PdfFile, Null>> match(PdfMatchRequest request) =>
      _pdf(_transport, 'postPdfMatch', request.toJson());

  /// `POST /v1/pdf/varshphal` — the annual chart for `year` and its reading.
  Future<KjResult<PdfFile, Null>> varshphal(PdfVarshphalRequest request) =>
      _pdf(_transport, 'postPdfVarshphal', request.toJson());

  /// `POST /v1/pdf/panchang/month` — a month of panchang at a place, one day
  /// per row.
  ///
  /// `panchangMonth` rather than `month`, because `kj.pdf.month` would not say
  /// a month of what.
  Future<KjResult<PdfFile, Null>> panchangMonth(
          PdfPanchangMonthRequest request) =>
      _pdf(_transport, 'postPdfPanchangMonth', request.toJson());
}

/// A POST to a PDF route: a JSON body out, the file's bytes back.
Future<KjResult<PdfFile, Null>> _pdf(
  Transport transport,
  String operationId,
  Map<String, dynamic> body,
) {
  return transport.post<PdfFile, Null>(
    _pathOf(operationId),
    body,
    decode: (json) => json! as PdfFile,
    decodeMeta: (_) => null,
    accept: acceptPdf,
  );
}

/// The Kaal Jyoti API, typed.
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
/// ));
/// print('${answer.data.lagnaSign.name} · ${answer.meta.timezone.source}');
/// kj.close();
/// ```
///
/// Every method returns the envelope — `data` and `meta` together — because
/// `meta` is how an application answers "why is this number what it is".
/// Every failure is a thrown [KaaljyotiException] with a `code`; branch on the
/// code, never on the message.
class Kaaljyoti {
  /// Builds a client. [apiKey] is the only required option.
  ///
  /// - [apiKey] is placed by its prefix: `kj_pub_…` travels as `?key=`,
  ///   everything else as `Authorization: Bearer`. An empty key is refused
  ///   before the network, as `invalid_key`.
  /// - [baseUrl] defaults to `https://api.kaaljyoti.com`; a trailing `/` or
  ///   `/v1` is trimmed, so staging is one option and no separate build.
  /// - [client] is an `http.Client` of your own — a Flutter platform client, a
  ///   `MockClient` in a test. One passed here is *not* closed by [close].
  /// - [timeout] is the deadline for one attempt, not for the whole call.
  /// - [maxRetries] is the retry budget; `0` turns retrying off entirely.
  /// - [clientTag] is `X-KJ-Client`, so a shell built on this SDK can
  ///   attribute usage to itself rather than to the SDK.
  /// - [headers] are sent on every request, and cannot override the key, the
  ///   `Accept` or the tag.
  Kaaljyoti({
    required String apiKey,
    String? baseUrl,
    http.Client? client,
    Duration timeout = const Duration(seconds: 30),
    int maxRetries = 2,
    String clientTag = 'sdk-dart/$sdkVersion',
    Map<String, String> headers = const <String, String>{},
  }) : this.withTransport(Transport(
          apiKey: apiKey,
          baseUrl: baseUrl,
          client: client,
          timeout: timeout,
          maxRetries: maxRetries,
          clientTag: clientTag,
          headers: headers,
        ));

  /// Builds a client on a [Transport] you configured yourself.
  ///
  /// The only reason to reach for this is a test that needs to replace the
  /// retry sleep; everything else is a named parameter on the main
  /// constructor.
  Kaaljyoti.withTransport(this._transport)
      : kundli = KundliApi(_transport),
        panchang = PanchangApi(_transport),
        ephemeris = EphemerisApi(_transport),
        calendar = CalendarApi(_transport),
        jaimini = JaiminiApi(_transport),
        kp = KpApi(_transport),
        varshphal = VarshphalApi(_transport),
        transit = TransitApi(_transport),
        match = MatchApi(_transport),
        reports = ReportsApi(_transport),
        pdf = PdfApi(_transport);

  final Transport _transport;

  /// The birth chart and the eighteen documents computed from one.
  final KundliApi kundli;

  /// Daily panchang, the day's windows, a month of panchang.
  final PanchangApi panchang;

  /// A month of graha positions.
  final EphemerisApi ephemeris;

  /// Vikram Samvat.
  final CalendarApi calendar;

  /// Chara karakas, arudha padas, rashi drishti, karakamsha.
  final JaiminiApi jaimini;

  /// Krishnamurti Paddhati.
  final KpApi kp;

  /// The annual chart and what is read from it.
  final VarshphalApi varshphal;

  /// The sky now, gochar over a window, and the events of a year.
  final TransitApi transit;

  /// Ashtakoot, a full comparison, and both in bulk.
  final MatchApi match;

  /// The lagna and nakshatra readings, and the personal reports of a birth.
  /// On every plan, 5 credits each.
  final ReportsApi reports;

  /// Printable kundli, match, varshphal and monthly panchang PDFs, answered
  /// as bytes. Every paid plan, not Free; a publishable key cannot make one.
  final PdfApi pdf;

  /// `POST /v1/horoscope` — a `sign`'s `daily`, `weekly`, `monthly` or
  /// `yearly` horoscope as one `summary` ([ReadingSummary]) and five
  /// [AreaSummary]s — work, money, relationships, health, education — each
  /// with a `level` (`favourable`, `mixed` or `care`). There are no scores.
  ///
  /// At the top level, like [timezone]: there is one horoscope, so a namespace
  /// around it would be a word with nothing in it. `basis` lists the
  /// transits behind it ([HoroscopeTransit]), for you rather than the reader.
  /// 5 credits.
  Future<KjResult<HoroscopeDocument, Meta>> horoscope(
          HoroscopeRequest request) =>
      _call(_transport, 'postHoroscope', request.toJson(),
          HoroscopeDocument.fromJson);

  /// `GET /v1/health` — liveness. Costs no credits and needs no key.
  ///
  /// The one answer with no envelope around it, so `meta` is always `null`. It
  /// keeps answering while the service is disabled, which is what makes it the
  /// right thing to poll after a `service_disabled`.
  Future<KjResult<HealthDocument, Null>> health() =>
      _transport.get<HealthDocument, Null>(
        _pathOf('getHealth'),
        decode: (json) => HealthDocument.fromJson(asMap(json)),
        decodeMeta: (_) => null,
      );

  /// `GET /v1/reference/{list}` — a static table. Costs no credits.
  ///
  /// [list] is one of `ayanamsas`, `planets`, `signs`, `nakshatras`, `tithis`,
  /// `yogas`, `karanas`, `vargas`, `dasha-systems`, `house-systems`,
  /// `chalit-systems`, `transit-events`, `languages`, `credits`. [language] is
  /// joined with commas, because the parameter is one comma-separated field.
  ///
  /// `credits` is the price list in force: one `{route, credits}` row per
  /// metered route, with `per` (`pair` or `part`) on the two priced per unit.
  ///
  /// The rows are deliberately untyped: each table publishes its own columns —
  /// `{id, name}` for most, `{index, name}` for the ones the engine numbers —
  /// and the snapshot declares them `additionalProperties: true`, so a class
  /// here would be a guess that goes stale. The `meta` is the generated
  /// [ReferenceMeta], whose two fields the snapshot does name.
  ///
  /// ```dart
  /// final signs = await kj.reference('signs', language: ['en', 'hi']);
  /// print(signs.data.first['name']);
  /// print(signs.meta.language); // ['en', 'hi']
  /// ```
  Future<KjResult<List<Map<String, dynamic>>, ReferenceMeta>> reference(
    String list, {
    List<String>? language,
  }) {
    return _transport.get<List<Map<String, dynamic>>, ReferenceMeta>(
      // The snapshot's `{list}` placeholder, filled in. Encoded because a
      // stray `/` in a caller's string must not invent a path segment.
      _pathOf('getReferenceList')
          .replaceFirst('{list}', Uri.encodeComponent(list)),
      query: <String, String?>{
        'language':
            language == null || language.isEmpty ? null : language.join(','),
      },
      decode: (json) => asList(json).map(asMap).toList(),
      // Both of `ReferenceMeta`'s fields are optional, so an absent `meta` is
      // an empty one rather than a `bad_response`.
      decodeMeta: (json) => ReferenceMeta.fromJson(
        json == null ? <String, dynamic>{} : asMap(json),
      ),
    );
  }

  /// `GET /v1/timezone` — the zone covering a point, and its offset at an
  /// instant. Costs no credits.
  ///
  /// This is the cheapest way to fill in a `timezone` you would otherwise have
  /// to guess, and the only way to get a *historical* offset: a March 1944
  /// date in Delhi answers `+06:30`, the war-time offset, which a device's own
  /// clock arithmetic would not.
  ///
  /// [datetime] is a wall clock, `YYYY-MM-DDTHH:MM:SS`; leave it out for the
  /// offset in force now.
  Future<KjResult<TimezoneDocument, TimezoneMeta>> timezone({
    required double lat,
    required double lon,
    String? datetime,
  }) {
    return _transport.get<TimezoneDocument, TimezoneMeta>(
      _pathOf('getTimezone'),
      query: <String, String?>{
        'lat': '$lat',
        'lon': '$lon',
        'datetime': datetime,
      },
      decode: (json) => TimezoneDocument.fromJson(asMap(json)),
      decodeMeta: (json) => TimezoneMeta.fromJson(asMap(json)),
    );
  }

  /// `GET /v1/places` — places whose name begins with [q], best match first,
  /// each with the coordinates and IANA `timezone` a `birth` needs.
  ///
  /// [country] is ISO 3166-1 alpha-2; [limit] is 1–25 (default 10);
  /// [language] is joined with commas, as for [reference]. Costs 1 credit per
  /// search, so a place field should search from the third character and on a
  /// pause in typing, not on every key.
  Future<KjResult<PlacesDocument, PlacesMeta>> places(
    String q, {
    String? country,
    int? limit,
    List<String>? language,
  }) {
    return _transport.get<PlacesDocument, PlacesMeta>(
      _pathOf('getPlaces'),
      query: <String, String?>{
        'q': q,
        'country': country,
        'limit': limit?.toString(),
        'language':
            language == null || language.isEmpty ? null : language.join(','),
      },
      decode: (json) => PlacesDocument.fromJson(asMap(json)),
      // Every `PlacesMeta` field is optional, as for [reference].
      decodeMeta: (json) => PlacesMeta.fromJson(
        json == null ? <String, dynamic>{} : asMap(json),
      ),
    );
  }

  /// Releases the HTTP client this client created.
  ///
  /// A client passed in as `client:` belongs to the caller and is left alone:
  /// closing a shared `http.Client` would drop the connections of everything
  /// else using it. Calling this on a client that owns nothing is harmless.
  void close() => _transport.close();
}
