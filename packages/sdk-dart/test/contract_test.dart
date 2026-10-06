/// The client against the snapshot it was generated from.
///
/// This is the test that makes `operations.dart` worth having. It reads
/// `openapi/openapi.json`, calls every operation through the public client
/// with a minimal request, and asserts that what went out matches what the
/// document says: the same verb, the same path, no query parameter the
/// document did not declare — and, for a secret key, no `key` in the URL at
/// all, which is the mistake the gateway refuses outright.
///
/// The table below is written by hand on purpose. An operation added to the
/// API and forgotten here fails the "every operation is exercised" assertion,
/// which is the only way a missing method gets noticed before a user notices.
library;

import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kaaljyoti/kaaljyoti.dart';
import 'package:kaaljyoti/src/generated/operations.dart';
import 'package:test/test.dart';

const String pubKey = 'kj_pub_ccccccccccccccccccccccccccccccccccccccccccc';
const String secretKey = 'kj_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

final Birth birth = Birth(
  datetime: '1990-05-14T10:30:00',
  timezone: 'Asia/Kolkata',
  latitude: 28.6139,
  longitude: 77.209,
);

final KundliRequest kundli = KundliRequest(birth: birth);
final SadeSatiRequest window = SadeSatiRequest(birth: birth);
final VarshphalRequest varshphal = VarshphalRequest(birth: birth, year: 2026);

/// One call on the client, per `operationId`.
///
/// `kundli.chartSvg` is deliberately absent: it is the same operation as
/// `kundli.chart` with a different `Accept`, and `client_test.dart` covers the
/// difference. Every other entry is one operation, called exactly once.
final Map<String, Future<void> Function(Kaaljyoti kj)> calls =
    <String, Future<void> Function(Kaaljyoti kj)>{
  'getHealth': (kj) => kj.health(),
  'getReferenceList': (kj) => kj.reference('signs', language: ['en', 'hi']),
  'getTimezone': (kj) => kj.timezone(lat: 28.6139, lon: 77.209),
  'getPlaces': (kj) => kj.places('Mumbai', country: 'IN', limit: 5),
  'postKundli': (kj) => kj.kundli.get(kundli),
  'postKundliChart': (kj) => kj.kundli.chart(KundliChartRequest(birth: birth)),
  'postKundliDasha': (kj) =>
      kj.kundli.dasha(DashaRequest(birth: birth, system: 'vimshottari')),
  'postKundliVargas': (kj) => kj.kundli.vargas(VargasRequest(birth: birth)),
  'postKundliChalit': (kj) => kj.kundli.chalit(ChalitRequest(birth: birth)),
  'postKundliYogas': (kj) => kj.kundli.yogas(kundli),
  'postKundliShadbala': (kj) => kj.kundli.shadbala(kundli),
  'postKundliBhavaBala': (kj) => kj.kundli.bhavaBala(kundli),
  'postKundliAshtakavarga': (kj) => kj.kundli.ashtakavarga(kundli),
  'postKundliGrahaDrishti': (kj) => kj.kundli.grahaDrishti(kundli),
  'postKundliMaitri': (kj) => kj.kundli.maitri(kundli),
  'postKundliPace': (kj) => kj.kundli.pace(kundli),
  'postKundliSpecialLagnas': (kj) => kj.kundli.specialLagnas(kundli),
  'postKundliTripataki': (kj) => kj.kundli.tripataki(kundli),
  'postKundliSarvatobhadra': (kj) => kj.kundli.sarvatobhadra(kundli),
  'postKundliNakshatra28': (kj) => kj.kundli.nakshatra28(kundli),
  'postKundliSadeSati': (kj) => kj.kundli.sadeSati(window),
  'postKundliEvents': (kj) => kj.kundli.events(window),
  'postKundliKotaChakra': (kj) => kj.kundli.kotaChakra(kundli),
  'postPanchang': (kj) => kj.panchang.daily(
        PanchangRequest(
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 'Asia/Kolkata',
        ),
      ),
  'postPanchangMuhurta': (kj) =>
      kj.panchang.muhurta(MuhurtaRequest(birth: birth)),
  'postPanchangMonth': (kj) => kj.panchang.month(
        PanchangMonthRequest(
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 'Asia/Kolkata',
          month: '2026-09',
        ),
      ),
  'postEphemerisMonth': (kj) => kj.ephemeris.month(
        EphemerisMonthRequest(
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 'Asia/Kolkata',
          month: '2026-09',
        ),
      ),
  'postCalendarVikramSamvat': (kj) => kj.calendar.vikramSamvat(
        VikramSamvatRequest(
          datetime: '2026-09-22T12:00:00',
          timezone: 'Asia/Kolkata',
          latitude: 28.6139,
          longitude: 77.209,
        ),
      ),
  'postJaiminiKarakas': (kj) => kj.jaimini.karakas(kundli),
  'postJaiminiArudhaPadas': (kj) => kj.jaimini.arudhaPadas(kundli),
  'postJaiminiAspects': (kj) => kj.jaimini.aspects(kundli),
  'postJaiminiKarakamsha': (kj) => kj.jaimini.karakamsha(kundli),
  'postKpChart': (kj) => kj.kp.chart(kundli),
  'postVarshphal': (kj) => kj.varshphal.get(varshphal),
  'postVarshphalBala': (kj) => kj.varshphal.bala(varshphal),
  'postVarshphalSahams': (kj) => kj.varshphal.sahams(varshphal),
  'postVarshphalYogas': (kj) => kj.varshphal.yogas(varshphal),
  'postVarshphalDasha': (kj) => kj.varshphal.dasha(varshphal),
  'postTransitNow': (kj) => kj.transit.now(
        TransitNowRequest(
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 'Asia/Kolkata',
        ),
      ),
  'postTransitScan': (kj) => kj.transit.scan(
        TransitScanRequest(
          birth: birth,
          from: '2026-01-01T00:00:00Z',
          to: '2026-02-01T00:00:00Z',
        ),
      ),
  'postTransitEvents': (kj) =>
      kj.transit.events(TransitEventsRequest(year: 2026)),
  'postMatchAshtakoot': (kj) =>
      kj.match.ashtakoot(MatchAshtakootRequest(bride: birth, groom: birth)),
  'postMatchCompare': (kj) =>
      kj.match.compare(MatchCompareRequest(birth: birth, partner: birth)),
  'postMatchBatch': (kj) => kj.match.batch(
        MatchBatchRequest(
          pairs: [MatchBatchRequestPairsItem(bride: birth, groom: birth)],
        ),
      ),
  'postReportsLagna': (kj) =>
      kj.reports.lagna(ReportLagnaRequest(birth: birth)),
  'postReportsNakshatra': (kj) =>
      kj.reports.nakshatra(ReportNakshatraRequest(nakshatra: 'ashwini')),
  'postReportsHouseLords': (kj) => kj.reports.houseLords(kundli),
  'postReportsGrahas': (kj) => kj.reports.grahas(kundli),
  'postReportsYogas': (kj) => kj.reports.yogas(kundli),
  'postReportsVimshottari': (kj) => kj.reports.vimshottari(kundli),
  'postReportsVarshphal': (kj) => kj.reports.varshphal(varshphal),
  'postReportsLifeAreas': (kj) => kj.reports.lifeAreas(kundli),
  'postReportsKundli': (kj) => kj.reports
      .kundli(ReportKundliRequest(birth: birth, parts: ['lagna', 'yogas'])),
  'postHoroscope': (kj) => kj.horoscope(HoroscopeRequest(sign: 'aries')),
  // PDFs — the bytes, not an envelope.
  'postPdfKundli': (kj) => kj.pdf.kundli(
        PdfKundliRequest(
          birth: birth,
          name: 'Ravi Kumar',
          edition: 'professional',
          template: 'modern',
          vargas: ['d1', 'd9'],
          options: PdfKundliOptions(
            language: ['en', 'hi'],
            houseSystem: HouseSystem.kp,
          ),
        ),
      ),
  'postPdfMatch': (kj) => kj.pdf.match(
        PdfMatchRequest(
          bride: birth,
          groom: birth,
          name: 'Sita',
          partnerName: 'Ram',
        ),
      ),
  'postPdfVarshphal': (kj) => kj.pdf.varshphal(
        PdfVarshphalRequest(
          birth: birth,
          year: 2026,
          name: 'Ravi Kumar',
          chartStyle: 'south',
        ),
      ),
  'postPdfPanchangMonth': (kj) => kj.pdf.panchangMonth(
        PdfPanchangMonthRequest(
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 'Asia/Kolkata',
          month: '2026-09',
          template: 'minimal',
        ),
      ),
};

/// One operation as the snapshot describes it.
class DocumentedOperation {
  const DocumentedOperation(this.id, this.method, this.path, this.parameters);

  final String id;
  final String method;
  final String path;

  /// Query parameter names the document declares for this operation.
  final Set<String> parameters;
}

List<DocumentedOperation> readSnapshot() {
  // `dart test` runs from the package root; the snapshot is the workspace's,
  // shared with the TypeScript SDK and the generator.
  final file = File('../../openapi/openapi.json');
  final document = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  final paths = document['paths'] as Map<String, dynamic>;
  final found = <DocumentedOperation>[];
  for (final entry in paths.entries) {
    final byMethod = entry.value as Map<String, dynamic>;
    for (final verb in byMethod.entries) {
      final operation = verb.value as Map<String, dynamic>;
      final parameters =
          (operation['parameters'] as List<dynamic>? ?? <dynamic>[])
              .cast<Map<String, dynamic>>()
              .where((parameter) => parameter['in'] == 'query')
              .map((parameter) => parameter['name'] as String)
              .toSet();
      found.add(
        DocumentedOperation(
          operation['operationId'] as String,
          verb.key.toUpperCase(),
          entry.key,
          parameters,
        ),
      );
    }
  }
  return found;
}

/// A documented path as a pattern a concrete URL path must match.
///
/// `/v1/reference/{list}` becomes `^/v1/reference/[^/]+$`, so a filled-in
/// placeholder matches and a path segment invented by the client does not.
RegExp pathPattern(String path) {
  final escaped =
      path.split(RegExp(r'\{[^}]+\}')).map(RegExp.escape).join('[^/]+');
  return RegExp('^$escaped\$');
}

/// What the SDK sent for one operation.
class Sent {
  Sent(this.method, this.url, this.body);

  final String method;
  final Uri url;
  final String body;
}

/// Calls every operation once and returns what went out, by `operationId`.
Future<Map<String, Sent>> runEveryOperation(String apiKey) async {
  final sent = <String, Sent>{};
  var current = '';
  final client = MockClient((request) async {
    sent[current] = Sent(request.method, request.url, request.body);
    // An empty envelope: enough for the transport to accept, never enough for
    // a generated document to parse. The request is what this test reads. The
    // PDF methods read the same answer as bytes, which is all they do.
    return http.Response(
      jsonEncode(<String, dynamic>{
        'status': 'ok',
        'data': <String, dynamic>{},
        'meta': <String, dynamic>{},
      }),
      200,
      headers: const <String, String>{
        'content-type': 'application/json; charset=utf-8',
      },
    );
  });

  final kj = Kaaljyoti(apiKey: apiKey, client: client, maxRetries: 0);
  for (final entry in calls.entries) {
    current = entry.key;
    try {
      await entry.value(kj);
    } on KaaljyotiException catch (error) {
      expect(
        error.code,
        KjErrorCode.badResponse,
        reason: '${entry.key} failed for a reason other than the empty body',
      );
    }
  }
  kj.close();
  return sent;
}

void main() {
  final documented = readSnapshot();

  test('the generated table is the snapshot, operation for operation', () {
    final fromSnapshot = documented
        .map((operation) => '${operation.method} ${operation.path} '
            '(${operation.id})')
        .toSet();
    final fromTable =
        operations.map((operation) => operation.toString()).toSet();

    expect(fromTable, fromSnapshot);
    expect(operations, hasLength(documented.length));
    expect(operations, hasLength(58));
  });

  test('every operation the API documents has a method on the client', () {
    expect(
      calls.keys.toSet(),
      documented.map((operation) => operation.id).toSet(),
    );
  });

  group('with a publishable key', () {
    late Map<String, Sent> sent;

    setUpAll(() async => sent = await runEveryOperation(pubKey));

    test('every operation is called exactly once', () {
      expect(sent.keys.toSet(), calls.keys.toSet());
      expect(sent, hasLength(documented.length));
    });

    test('each call uses the verb and the path the document names', () {
      for (final operation in documented) {
        final actual = sent[operation.id]!;
        expect(actual.method, operation.method, reason: operation.id);
        expect(
          actual.url.path,
          matches(pathPattern(operation.path)),
          reason: '${operation.id} went to ${actual.url.path}, not '
              '${operation.path}',
        );
      }
    });

    test('no query parameter the document did not declare, beyond the key', () {
      for (final operation in documented) {
        final actual = sent[operation.id]!;
        expect(
          actual.url.queryParameters.keys.toSet(),
          isNot(contains('apiKey')),
          reason: operation.id,
        );
        for (final name in actual.url.queryParameters.keys) {
          expect(
            operation.parameters.contains(name) || name == 'key',
            isTrue,
            reason: '${operation.id} sent an undeclared "$name"',
          );
        }
      }
    });

    test('the key is in the query, because a browser cannot send the header',
        () {
      for (final actual in sent.values) {
        expect(actual.url.queryParameters['key'], pubKey);
      }
    });

    test('a POST carries a JSON body and a GET carries none', () {
      for (final operation in documented) {
        final actual = sent[operation.id]!;
        if (operation.method == 'POST') {
          expect(jsonDecode(actual.body), isA<Map<String, dynamic>>(),
              reason: operation.id);
        } else {
          expect(actual.body, isEmpty, reason: operation.id);
        }
      }
    });
  });

  group('with a secret key', () {
    late Map<String, Sent> sent;

    setUpAll(() async => sent = await runEveryOperation(secretKey));

    test('the key is never in a URL, on any operation', () {
      for (final entry in sent.entries) {
        expect(
          entry.value.url.queryParameters.containsKey('key'),
          isFalse,
          reason: entry.key,
        );
        expect(
          entry.value.url.toString(),
          isNot(contains(secretKey)),
          reason: entry.key,
        );
      }
    });

    test('the reference list is still a path segment, not a parameter', () {
      expect(sent['getReferenceList']!.url.path, '/v1/reference/signs');
      expect(
        sent['getReferenceList']!.url.queryParameters,
        <String, String>{'language': 'en,hi'},
      );
    });
  });
}
