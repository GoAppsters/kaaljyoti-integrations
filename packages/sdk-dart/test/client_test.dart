/// The client's surface, against recorded answers.
///
/// `transport_test.dart` covers the wire; this file covers what a caller
/// actually touches: that `kundli.get` answers a typed document and its meta,
/// that `chart` and `chartSvg` are the same endpoint asked two ways, that a
/// batch's failed pair stays a value, that a PDF comes back as its bytes, and
/// that `close()` only closes what the client owns.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kaaljyoti/kaaljyoti.dart';
import 'package:test/test.dart';

const String apiKey = 'kj_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

final Birth birth = Birth(
  datetime: '1990-05-14T10:30:00',
  timezone: 'Asia/Kolkata',
  latitude: 28.6139,
  longitude: 77.209,
);

Map<String, dynamic> fixture(String name) =>
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync())
        as Map<String, dynamic>;

http.Response json(
  Object? body, {
  int status = 200,
  Map<String, String> headers = const <String, String>{},
}) {
  return http.Response.bytes(
    utf8.encode(jsonEncode(body)),
    status,
    headers: <String, String>{
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  );
}

/// Answers every request with [body], and remembers the last one sent.
class Recorder {
  Recorder(this._answer);

  final Future<http.Response> Function(http.Request request) _answer;

  late http.Request last;

  MockClient get client => MockClient((request) {
        last = request;
        return _answer(request);
      });
}

/// An `http.Client` the test owns, which counts the times it was closed.
class CountingClient extends http.BaseClient {
  CountingClient(this._inner);

  final http.Client _inner;

  /// How many times [close] was called on this client.
  int closes = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      _inner.send(request);

  @override
  void close() {
    closes += 1;
    _inner.close();
  }
}

void main() {
  group('kundli.get', () {
    test('answers the document and the meta, both typed', () async {
      final recorder = Recorder((_) async => json(fixture('kundli')));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.kundli.get(KundliRequest(birth: birth));

      expect(answer.data.lagnaSign.id, 'cancer');
      expect(answer.data.lagnaSign.name, 'Cancer');
      expect(answer.data.positions['sun']?.sign.id, 'aries');
      expect(answer.meta.timezone.source, 'given');
      expect(answer.meta.timezone.utcOffset, '+05:30');
      expect(answer.meta.ayanamsa.id, 'lahiri');
      expect(answer.cached, isFalse);

      expect(recorder.last.url.path, '/v1/kundli');
      expect(
        jsonDecode(recorder.last.body),
        <String, dynamic>{'birth': birth.toJson()},
      );
    });

    test('lets a refusal through as an exception', () async {
      final recorder =
          Recorder((_) async => json(fixture('error'), status: 400));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      await expectLater(
        kj.kundli.get(KundliRequest(birth: birth)),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'validation_error')
              .having((e) => e.field, 'field', 'options.language'),
        ),
      );
    });
  });

  group('the chart', () {
    test('is a document by default', () async {
      final recorder = Recorder((_) async => json(fixture('chart')));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.kundli.chart(KundliChartRequest(birth: birth));

      expect(recorder.last.headers['accept'], 'application/json');
      expect(recorder.last.url.path, '/v1/kundli/chart');
      expect(answer.data.style, ChartStyle.north);
      expect(answer.data.svg, startsWith('<svg'));
      expect(answer.meta, isA<Meta>());
    });

    test('sends first_house and reads back what the chart was drawn as',
        () async {
      final recorder = Recorder((_) async => json(fixture('chart')));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.kundli
          .chart(KundliChartRequest(birth: birth, firstHouse: 'lagna'));

      expect(
        (jsonDecode(recorder.last.body) as Map<String, dynamic>)['first_house'],
        'lagna',
      );
      expect(answer.data.firstHouse, 'lagna');
      expect(answer.data.firstHouseSign.id, 'cancer');
      expect(answer.data.title, 'Lagna chart');
    });

    test('is the markup itself when asked for as SVG', () async {
      final markup = fixture('chart')['data'] as Map<String, dynamic>;
      final recorder = Recorder(
        (_) async => http.Response.bytes(
          utf8.encode(markup['svg'] as String),
          200,
          headers: const <String, String>{
            'content-type': 'image/svg+xml; charset=utf-8',
          },
        ),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.kundli.chartSvg(KundliChartRequest(birth: birth));

      // The same endpoint and the same cost; only the Accept differs.
      expect(recorder.last.url.path, '/v1/kundli/chart');
      expect(recorder.last.headers['accept'], 'image/svg+xml');
      expect(answer.data, startsWith('<svg'));
      expect(answer.meta, isNull);
    });
  });

  group('reference', () {
    test('joins the languages into the one parameter the API takes', () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'data': <Map<String, dynamic>>[
            <String, dynamic>{
              'id': 'aries',
              'name': 'Aries',
              'names': <String, String>{'en': 'Aries', 'hi': 'मेष'},
            },
          ],
          'meta': <String, dynamic>{
            'engine': '0.2.0',
            'language': <String>['en', 'hi'],
          },
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.reference('signs', language: ['en', 'hi']);

      expect(recorder.last.url.path, '/v1/reference/signs');
      expect(recorder.last.url.queryParameters['language'], 'en,hi');
      expect(answer.data.single['id'], 'aries');
      expect(
        (answer.data.single['names'] as Map<String, dynamic>)['hi'],
        'मेष',
      );
      expect(answer.meta, isA<ReferenceMeta>());
      expect(answer.meta.language, <String>['en', 'hi']);
      expect(answer.meta.engine, '0.2.0');
    });

    test('leaves the parameter out when no language was asked for', () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'data': <Map<String, dynamic>>[],
          'meta': <String, dynamic>{},
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.reference('planets');

      expect(recorder.last.url.queryParameters, isEmpty);
      // Both of ReferenceMeta's fields are optional, so an empty meta parses.
      expect(answer.meta.language, isNull);
      expect(answer.meta.engine, isNull);
    });
  });

  group('timezone', () {
    test('sends the point and the instant, and reads the offset back',
        () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'data': <String, dynamic>{
            'name': 'Asia/Kolkata',
            'utc_offset': '+06:30',
            'source': 'derived',
          },
          'meta': <String, dynamic>{'datetime': '1944-03-15T10:00:00'},
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.timezone(
        lat: 28.6139,
        lon: 77.209,
        datetime: '1944-03-15T10:00:00',
      );

      expect(recorder.last.method, 'GET');
      expect(recorder.last.url.path, '/v1/timezone');
      expect(recorder.last.url.queryParameters, <String, String>{
        'lat': '28.6139',
        'lon': '77.209',
        'datetime': '1944-03-15T10:00:00',
      });
      // The war-time offset, which is the whole reason to ask.
      expect(answer.data.utcOffset, '+06:30');
      expect(answer.meta.datetime, '1944-03-15T10:00:00');
    });

    test('leaves datetime out for the offset in force now', () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'data': <String, dynamic>{
            'name': 'Asia/Kolkata',
            'utc_offset': '+05:30',
            'source': 'derived',
          },
          'meta': <String, dynamic>{},
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      await kj.timezone(lat: 28.6139, lon: 77.209);

      expect(
        recorder.last.url.queryParameters.containsKey('datetime'),
        isFalse,
      );
    });
  });

  group('reports', () {
    test('houseLords sends the birth and reads twelve houses in order',
        () async {
      final recorder =
          Recorder((_) async => json(fixture('reading_house_lords')));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.reports.houseLords(
        KundliRequest(
          birth: Birth(
            datetime: '1987-03-18T12:06:00',
            timezone: 'Asia/Kolkata',
            latitude: 28.6139,
            longitude: 77.209,
          ),
          options: CalculationOptions(language: ['en', 'hi']),
        ),
      );

      expect(recorder.last.method, 'POST');
      expect(recorder.last.url.path, '/v1/reports/house-lords');
      final sent = jsonDecode(recorder.last.body) as Map<String, dynamic>;
      expect(sent.keys, ['birth', 'options']);
      expect((sent['birth'] as Map<String, dynamic>)['datetime'],
          '1987-03-18T12:06:00');

      final lords = answer.data.houseLords!;
      expect(
          lords.map((l) => l.house), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      // Gemini rising: Mercury rules the 1st and sits in the 9th.
      expect(lords.first.sign.id, 'gemini');
      expect(lords.first.lord.id, 'mercury');
      expect(lords.first.lord.names?['hi'], 'बुध');
      expect(lords.first.inHouse, 9);
      for (final lord in lords) {
        expect(lord.entry.text.en, isNotEmpty);
        expect(lord.entry.text.hi, isNotEmpty);
      }
      expect(answer.data.disclaimer?.hi, contains('सांकेतिक'));
      expect(answer.meta.engine, '0.5.0');
    });

    test('lagna sends the sign and reads both languages back', () async {
      final recorder = Recorder((_) async => json(fixture('reading_lagna')));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.reports.lagna(
        ReportLagnaRequest(
          sign: 'leo',
          options: CalculationOptions(language: ['en', 'hi']),
        ),
      );

      expect(recorder.last.method, 'POST');
      expect(recorder.last.url.path, '/v1/reports/lagna');
      expect(jsonDecode(recorder.last.body), <String, dynamic>{
        'sign': 'leo',
        'options': <String, dynamic>{
          'language': <String>['en', 'hi'],
        },
      });
      expect(answer.data.lagna?.sign.id, 'leo');
      expect(answer.data.lagna?.sign.names?['hi'], 'सिंह');
      expect(answer.data.lagna?.entry.text.en, startsWith('With Leo rising'));
      expect(answer.data.lagna?.entry.text.hi, isNotEmpty);
      expect(
        answer.data.disclaimer?.en,
        'These predictions are indicative. For a reading of your own chart, '
        'consult an astrologer.',
      );
      expect(answer.data.disclaimer?.hi, isNotEmpty);
    });

    test('nakshatra sends a named disclaimer as the object the API takes',
        () async {
      final recorder =
          Recorder((_) async => json(fixture('reading_nakshatra')));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.reports.nakshatra(
        ReportNakshatraRequest(
          nakshatra: 'purva_phalguni',
          options: CalculationOptions(
            disclaimer: Disclaimer.consult(
              'Acharya Amit Verma',
              url: 'https://kaaljyoti.com',
            ),
          ),
        ),
      );

      expect(recorder.last.url.path, '/v1/reports/nakshatra');
      expect(jsonDecode(recorder.last.body), <String, dynamic>{
        'nakshatra': 'purva_phalguni',
        'options': <String, dynamic>{
          'disclaimer': <String, dynamic>{
            'name': 'Acharya Amit Verma',
            'url': 'https://kaaljyoti.com',
          },
        },
      });
      expect(answer.data.nakshatra?.nakshatra.id, 'purva_phalguni');
      expect(answer.data.nakshatra?.entry.text.en, contains('Purva Phalguni'));
      // English only was asked for, so there is no Hindi to read.
      expect(answer.data.nakshatra?.entry.text.hi, isNull);
      expect(
        answer.data.disclaimer?.en,
        endsWith('consult Acharya Amit Verma (https://kaaljyoti.com).'),
      );
    });

    test('a preset disclaimer goes out as its bare string', () {
      expect(
        CalculationOptions(disclaimer: Disclaimer.off).toJson(),
        <String, dynamic>{'disclaimer': 'off'},
      );
      expect(
        CalculationOptions(disclaimer: Disclaimer.standard).toJson(),
        <String, dynamic>{'disclaimer': 'default'},
      );
      expect(Disclaimer.fromJson('off'), Disclaimer.off);
      expect(
        Disclaimer.fromJson(<String, dynamic>{'name': 'A'}),
        const Disclaimer.consult('A'),
      );
    });
  });

  group('the personal reports', () {
    Kaaljyoti answering(String name, List<http.Request> sent) => Kaaljyoti(
          apiKey: apiKey,
          client: Recorder((request) async {
            sent.add(request);
            return json(fixture(name));
          }).client,
        );

    test('grahas: nine, each with its sign, house and two readings', () async {
      final sent = <http.Request>[];
      final kj = answering('reading_grahas', sent);
      final answer = await kj.reports.grahas(KundliRequest(birth: birth));

      expect(sent.single.url.path, '/v1/reports/grahas');
      final List<GrahaReading> grahas = answer.data.grahas!;
      expect(grahas.map((g) => g.graha.id), [
        'sun', 'moon', 'mars', 'mercury', 'jupiter', //
        'venus', 'saturn', 'rahu', 'ketu',
      ]);
      expect(grahas.first.sign.id, 'aries');
      expect(grahas.first.house, 10);
      expect(grahas.first.inSign.text.en, startsWith('Your Sun is in Aries'));
      expect(grahas.first.inHouse.text.hi, isNotEmpty);
      expect(answer.meta.engine, '0.10.1');
    });

    test('yogas: each by code and category, with the grahas in it', () async {
      final sent = <http.Request>[];
      final kj = answering('reading_yogas', sent);
      final answer = await kj.reports.yogas(KundliRequest(birth: birth));

      expect(sent.single.url.path, '/v1/reports/yogas');
      final YogaReading first = answer.data.yogas!.first;
      expect(first.code, 'gaja_kesari');
      expect(first.category, 'Chandra');
      expect(first.participants.map((p) => p.id), ['jupiter', 'moon']);
      expect(first.name.en, 'Gaja-Kesari Yoga');
      expect(first.name.hi, 'गजकेसरी योग');
    });

    test('kundli: the parts asked for, each as its own route answers it',
        () async {
      final sent = <http.Request>[];
      final kj = answering('reading_kundli', sent);
      final answer = await kj.reports.kundli(ReportKundliRequest(
        birth: birth,
        parts: ['lagna', 'yogas', 'vimshottari', 'varshphal'],
      ));

      expect(sent.single.url.path, '/v1/reports/kundli');
      final body = jsonDecode(sent.single.body) as Map<String, dynamic>;
      expect(body['parts'], ['lagna', 'yogas', 'vimshottari', 'varshphal']);
      expect(body.containsKey('year'), isFalse);
      final data = answer.data;
      expect(data.parts, ['lagna', 'yogas', 'vimshottari', 'varshphal']);
      expect(data.lagna?.sign.id, 'cancer');
      expect(data.yogas?.first.code, 'gaja_kesari');
      expect(data.vimshottari?.periods.where((p) => p.current), hasLength(1));
      // No year was sent: the API reads the one running now.
      expect(data.varshphal?.year, 2026);
      // Four parts at 5 credits each.
      expect(answer.meta.credits, 20);
    });

    test('vimshottari: every mahadasha, one of them current', () async {
      final sent = <http.Request>[];
      final kj = answering('reading_vimshottari', sent);
      final answer = await kj.reports.vimshottari(KundliRequest(birth: birth));

      expect(sent.single.url.path, '/v1/reports/vimshottari');
      final List<MahadashaReading> periods = answer.data.periods;
      expect(periods.map((p) => p.lord.id),
          ['venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn']);
      final current = periods.where((p) => p.current).toList();
      expect(current.map((p) => [p.lord.id, p.level]), [
        ['mars', 'mixed']
      ]);
      expect(periods.first.antardashas, isNotEmpty);
    });

    test('varshphal: sends the year; a summary, seven areas, the periods',
        () async {
      final sent = <http.Request>[];
      final kj = answering('reading_varshphal', sent);
      final answer = await kj.reports
          .varshphal(VarshphalRequest(birth: birth, year: 2026));

      expect(sent.single.url.path, '/v1/reports/varshphal');
      expect(
          (jsonDecode(sent.single.body) as Map<String, dynamic>)['year'], 2026);
      expect(answer.data.year, 2026);
      expect(answer.data.summary.level, 'mixed');
      expect(answer.data.areas.map((a) => a.area), [
        'work', 'money', 'relationships', 'health', //
        'education', 'home', 'travel',
      ]);
      final List<VarshphalPeriod> months = answer.data.months;
      expect(months, hasLength(10));
      expect(months.first.lord.id, 'venus');
    });

    test('life areas: the strongest, those needing care, eleven areas',
        () async {
      final sent = <http.Request>[];
      final kj = answering('reading_life_areas', sent);
      final answer = await kj.reports.lifeAreas(KundliRequest(birth: birth));

      expect(sent.single.url.path, '/v1/reports/life-areas');
      expect(answer.data.summary.strongest, ['foreign', 'marriage']);
      expect(answer.data.summary.needsCare, ['children', 'fortune']);
      final List<LifeArea> areas = answer.data.areas;
      expect(areas, hasLength(11));
      expect([areas.first.area, areas.first.level], ['self', 'favourable']);
    });

    test('with no credits left, a 402 quota_exceeded is thrown', () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'error',
          'error': <String, dynamic>{
            'code': 'quota_exceeded',
            'message': 'you have used all 1,000 credits for this month '
                '(1,000 included in the Free plan)',
            'docs': 'https://kaaljyoti.com/api/docs/errors#quota_exceeded',
          },
        }, status: 402),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      await expectLater(
        kj.reports.lifeAreas(KundliRequest(birth: birth)),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'quota_exceeded')
              .having((e) => e.status, 'status', 402),
        ),
      );
    });
  });

  group('horoscope', () {
    test('sends the sign and the day, and reads the summaries', () async {
      final recorder = Recorder((_) async => json(fixture('horoscope')));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final HoroscopeDocument data = (await kj.horoscope(
        HoroscopeRequest(
          sign: 'aries',
          period: 'daily',
          date: '2026-09-28',
          timezone: 'Asia/Kolkata',
        ),
      ))
          .data;

      expect(recorder.last.method, 'POST');
      expect(recorder.last.url.path, '/v1/horoscope');
      expect(jsonDecode(recorder.last.body), <String, dynamic>{
        'sign': 'aries',
        'period': 'daily',
        'date': '2026-09-28',
        'timezone': 'Asia/Kolkata',
      });

      expect(data.sign.id, 'aries');
      expect(data.from, '2026-09-27T18:30:00.000Z');
      expect(data.to, '2026-09-28T18:30:00.000Z');
      final ReadingSummary summary = data.summary;
      expect(summary.level, 'care');
      expect(summary.text.hi, isNotEmpty);
      final List<AreaSummary> areas = data.areas;
      expect(areas.map((a) => [a.area, a.level]), [
        ['work', 'mixed'],
        ['money', 'care'],
        ['relationships', 'care'],
        ['health', 'mixed'],
        ['education', 'care'],
      ]);

      // The transits behind it: the Moon leaves Pisces during the day.
      final List<HoroscopeTransit> moon =
          data.basis.where((t) => t.graha.id == 'moon').toList();
      expect(moon, hasLength(2));
      expect(moon.first.sign.id, 'pisces');
      expect(moon.first.house, 12);
      expect(moon.first.leaves, '2026-09-28T04:46:38.438Z');
      expect(moon.last.entered, moon.first.leaves);
      expect(moon.last.nature, 'favourable');

      expect(
        data.disclaimer?.en,
        'These predictions are indicative. For a reading of your own chart, '
        'consult an astrologer.',
      );
    });
  });

  group('places', () {
    test('sends the search as the query the document declares', () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'data': <String, dynamic>{
            'places': <Map<String, dynamic>>[
              <String, dynamic>{
                'id': 1275339,
                'name': 'Mumbai',
                'names': <String, String>{'en': 'Mumbai', 'hi': 'मुंबई'},
                'region': 'Maharashtra',
                'country': 'IN',
                'country_name': 'India',
                'latitude': 19.07283,
                'longitude': 72.88261,
                'timezone': 'Asia/Kolkata',
                'population': 12691836,
              },
            ],
          },
          'meta': <String, dynamic>{
            'query': 'Bombay',
            'language': <String>['en', 'hi'],
            'count': 1,
            'source': 'geonames',
          },
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.places(
        'Bombay',
        country: 'IN',
        limit: 5,
        language: ['en', 'hi'],
      );

      expect(recorder.last.method, 'GET');
      expect(recorder.last.url.path, '/v1/places');
      expect(recorder.last.url.queryParameters, <String, String>{
        'q': 'Bombay',
        'country': 'IN',
        'limit': '5',
        'language': 'en,hi',
      });
      final place = answer.data.places.single;
      expect(place.name, 'Mumbai');
      expect(place.names?['hi'], 'मुंबई');
      expect(place.countryName, 'India');
      expect(place.timezone, 'Asia/Kolkata');
      expect(place.latitude, 19.07283);
      expect(answer.meta.count, 1);
    });

    test('sends only q when nothing else was asked for', () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'data': <String, dynamic>{'places': <Object?>[]},
          'meta': <String, dynamic>{},
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.places('Zz');

      expect(recorder.last.url.queryParameters, <String, String>{'q': 'Zz'});
      expect(answer.data.places, isEmpty);
      expect(answer.meta.count, isNull);
    });
  });

  group('health', () {
    test('answers bare, with no meta and no envelope', () async {
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'engine': '0.14.2',
          'ephemeris': 'kaaljyoti-ephemeris 0.1.1',
          'ops': 42,
          'uptime_s': 512,
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.health();

      expect(recorder.last.url.path, '/v1/health');
      expect(answer.data.engine, '0.14.2');
      expect(answer.data.ephemeris, 'kaaljyoti-ephemeris 0.1.1');
      expect(answer.data.ops, 42);
      expect(answer.meta, isNull);
    });
  });

  group('match.batch', () {
    test('keeps a pair that failed as a value beside the ones that did not',
        () async {
      final ashtakoot = <String, dynamic>{
        'bride_mangal_dosha': false,
        'groom_mangal_dosha': false,
        'kootas': <Map<String, dynamic>>[
          <String, dynamic>{
            'koota': <String, dynamic>{'id': 'varna', 'name': 'Varna'},
            'max_points': 1.0,
            'points': 1.0,
          },
        ],
        'mangal_dosha_mismatch': false,
        'total': 28.5,
        'verdict': 'good',
      };
      final recorder = Recorder(
        (_) async => json(<String, dynamic>{
          'status': 'ok',
          'data': <String, dynamic>{
            'results': <Map<String, dynamic>>[
              <String, dynamic>{'index': 0, 'data': ashtakoot},
              <String, dynamic>{
                'index': 1,
                'error': <String, dynamic>{
                  'code': 'not_computable',
                  'message': 'No moon position for that instant',
                  'field': 'pairs.1.groom',
                },
              },
            ],
          },
          'meta': <String, dynamic>{
            'cached': false,
            'ayanamsa': <String, dynamic>{'id': 'lahiri', 'value': 23.7},
            'engine': '0.2.0',
            'compute_ms': 12,
            'language_fallback': <String>[],
            'credits': 2,
          },
        }),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.match.batch(
        MatchBatchRequest(
          pairs: [
            MatchBatchRequestPairsItem(bride: birth, groom: birth),
            MatchBatchRequestPairsItem(bride: birth, groom: birth),
          ],
        ),
      );

      expect(answer.data.results, hasLength(2));
      expect(answer.data.results.first.data?.total, 28.5);
      expect(answer.data.results.first.error, isNull);
      // The pair that failed did not throw: the other pair was computed and
      // charged, and throwing would have discarded it.
      expect(answer.data.results.last.data, isNull);
      expect(answer.data.results.last.error?.code, 'not_computable');
      expect(answer.data.results.last.error?.field, 'pairs.1.groom');
      expect(answer.meta.credits, 2);
    });
  });

  group('pdf', () {
    /// The first bytes of every PDF, and enough of one to prove nothing
    /// re-encodes it.
    final pdfBytes = Uint8List.fromList(<int>[
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, //
      0xe2, 0xe3, 0xcf, 0xd3,
    ]);

    http.Response pdf(
        [Map<String, String> headers = const <String, String>{}]) {
      return http.Response.bytes(
        pdfBytes,
        200,
        headers: <String, String>{
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="kundli-ravi-kumar.pdf"',
          'x-kj-credits': '1000',
          'x-kj-credits-remaining': '49000',
          'x-kj-cache': 'miss',
          'x-kj-request-id': '97f48252-8b54-4a7e-9e81-eb06d5a3ce02',
          ...headers,
        },
      );
    }

    test('returns the bytes untouched, with the file name and the cost',
        () async {
      final recorder = Recorder((_) async => pdf());
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.pdf.kundli(
        PdfKundliRequest(birth: birth, name: 'Ravi Kumar', edition: 'basic'),
      );

      expect(answer.data.bytes, isA<Uint8List>());
      expect(answer.data.bytes, pdfBytes);
      expect(answer.data.contentType, 'application/pdf');
      expect(answer.data.filename, 'kundli-ravi-kumar.pdf');
      expect(answer.data.credits, 1000);
      expect(answer.credits, 1000);
      expect(answer.creditsRemaining, 49000);
      expect(answer.meta, isNull);
      expect(answer.cached, isFalse);
      expect(answer.requestId, '97f48252-8b54-4a7e-9e81-eb06d5a3ce02');

      expect(recorder.last.url.toString(),
          'https://api.kaaljyoti.com/v1/pdf/kundli');
      expect(recorder.last.headers['accept'], 'application/pdf');
      expect(recorder.last.headers['content-type'],
          startsWith('application/json'));
      expect(jsonDecode(recorder.last.body), <String, dynamic>{
        'birth': birth.toJson(),
        'name': 'Ravi Kumar',
        'edition': 'basic',
      });
    });

    test('reports a cache hit from the header, the only place it can be',
        () async {
      final recorder = Recorder((_) async => pdf({'x-kj-cache': 'hit'}));
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer = await kj.pdf
          .match(PdfMatchRequest(bride: birth, groom: birth, name: 'Sita'));

      expect(answer.cached, isTrue);
      expect(recorder.last.url.path, '/v1/pdf/match');
    });

    test('answers null for the headers a proxy stripped', () async {
      final recorder = Recorder(
        (_) async => http.Response.bytes(
          pdfBytes,
          200,
          headers: const <String, String>{'content-type': 'application/pdf'},
        ),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      final answer =
          await kj.pdf.varshphal(PdfVarshphalRequest(birth: birth, year: 2026));

      expect(answer.data.filename, isNull);
      expect(answer.data.credits, isNull);
      expect(answer.credits, isNull);
      expect(answer.creditsRemaining, isNull);
      expect(recorder.last.url.path, '/v1/pdf/varshphal');
    });

    test('throws the JSON error a refused PDF answers with', () async {
      final recorder = Recorder(
        (_) async => json(
          <String, dynamic>{
            'status': 'error',
            'error': <String, dynamic>{
              'code': 'pdf_quota_exceeded',
              'message': "This month's PDFs are used up.",
              'docs':
                  'https://kaaljyoti.com/api/docs/errors#pdf_quota_exceeded',
            },
          },
          status: 402,
        ),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: recorder.client);

      await expectLater(
        kj.pdf.panchangMonth(PdfPanchangMonthRequest(
          latitude: 25.3176,
          longitude: 82.9739,
          month: '2026-10',
        )),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'pdf_quota_exceeded')
              .having((e) => e.status, 'status', 402),
        ),
      );
      expect(recorder.last.url.path, '/v1/pdf/panchang/month');
    });
  });

  group('close', () {
    test('leaves a client the caller passed in alone', () async {
      final counting = CountingClient(
        MockClient(
          (_) async => json(<String, dynamic>{
            'status': 'ok',
            'engine': '0.14.2',
            'ephemeris': 'kaaljyoti-ephemeris 0.1.1',
            'ops': 42,
            'uptime_s': 1,
          }),
        ),
      );
      final kj = Kaaljyoti(apiKey: apiKey, client: counting);

      await kj.health();
      kj.close();

      expect(counting.closes, 0);
      // Still usable, which is the point: a Flutter app shares one client.
      await kj.health();
    });

    test('closes the one it created itself', () async {
      // No `client:`, so the client is the SDK's own. A closed `http.Client`
      // refuses the next request without touching the network, which is how a
      // test observes a close it cannot otherwise see.
      final kj = Kaaljyoti(
        apiKey: apiKey,
        baseUrl: 'http://127.0.0.1:9',
        maxRetries: 0,
      );

      kj.close();

      await expectLater(
        kj.health(),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', KjErrorCode.networkError)
              .having((e) => e.message.toLowerCase(), 'message',
                  contains('closed')),
        ),
      );
    });
  });
}
