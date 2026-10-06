/// The SDK against the real gateway. Opt-in, and skipped by default.
///
/// Every other test in this package mocks the socket, which proves that the
/// client sends what it means to send and not that the API answers it. This
/// one is the other half: it runs against staging, costs about fifty credits,
/// and is the thing to run after a snapshot regeneration or a gateway deploy.
///
/// ```sh
/// KJ_SMOKE=1 KJ_API_KEY=kj_pub_… dart test test/smoke_test.dart
/// ```
///
/// - `KJ_BASE_URL` — default `https://api-staging.kaaljyoti.com`.
/// - `KJ_ORIGIN` — default `http://localhost:3000`. Sent as `Origin` when the
///   key is publishable, because a publishable key is only accepted from an
///   origin it lists, and a `dart test` process sends no `Origin` of its own.
library;

import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:kaaljyoti/kaaljyoti.dart';
import 'package:test/test.dart';

const String _stagingBaseUrl = 'https://api-staging.kaaljyoti.com';
const String _defaultOrigin = 'http://localhost:3000';

/// Adds an `Origin` to every request.
///
/// The gateway checks a publishable key against the origins it was created
/// with. A browser sets this header without being asked; a Dart VM does not,
/// so the smoke test says which site it is pretending to be.
class _OriginClient extends http.BaseClient {
  _OriginClient(this._inner, this._origin);

  final http.Client _inner;
  final String _origin;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    request.headers['Origin'] = _origin;
    return _inner.send(request);
  }

  @override
  void close() => _inner.close();
}

void main() {
  final environment = Platform.environment;
  final apiKey = environment['KJ_API_KEY'] ?? '';
  final enabled = environment['KJ_SMOKE'] == '1' && apiKey.isNotEmpty;

  // `skip` takes the reason, or null to run. Printed by `dart test`, so a
  // skipped suite says what would have made it run.
  final String? skip = enabled
      ? null
      : 'set KJ_SMOKE=1 and KJ_API_KEY=kj_pub_… (or kj_test_…) to run the '
          'staging smoke test';

  final baseUrl = environment['KJ_BASE_URL'] ?? _stagingBaseUrl;
  final origin = environment['KJ_ORIGIN'] ?? _defaultOrigin;
  final publishable = apiKey.startsWith('kj_pub_');

  late Kaaljyoti kj;

  setUpAll(() {
    if (!enabled) return;
    kj = Kaaljyoti(
      apiKey: apiKey,
      baseUrl: baseUrl,
      client: publishable ? _OriginClient(http.Client(), origin) : null,
    );
  });

  tearDownAll(() {
    if (!enabled) return;
    kj.close();
  });

  group('staging', () {
    test('health answers without an envelope', () async {
      final answer = await kj.health();
      expect(answer.data.status, 'ok');
      expect(answer.data.engine, isNotEmpty);
      expect(answer.data.ephemeris, isNotEmpty);
      expect(answer.data.ops, greaterThan(0));
      expect(answer.meta, isNull);
    });

    test('a reference table answers in both languages asked for', () async {
      final answer = await kj.reference('signs', language: ['en', 'hi']);

      expect(answer.data, hasLength(12));
      final aries = answer.data.first;
      expect(aries['id'], 'aries');
      final names = aries['names'] as Map<String, dynamic>?;
      expect(names?['en'], isNotNull);
      expect(names?['hi'], isNotNull);
    });

    test('timezone knows the war-time offset', () async {
      final answer = await kj.timezone(
        lat: 28.6139,
        lon: 77.209,
        datetime: '1944-03-15T10:00:00',
      );

      expect(answer.data.name, 'Asia/Kolkata');
      expect(answer.data.utcOffset, '+06:30');
      expect(answer.data.source, 'derived');
    });

    test('the daily panchang answers for a place and a day', () async {
      final answer = await kj.panchang.daily(
        PanchangRequest(
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 'Asia/Kolkata',
          date: '2026-09-22',
        ),
      );

      expect(answer.data.tithis, isNotEmpty);
      expect(answer.data.panchang.vara.id, isNotEmpty);
      expect(answer.data.panchang.nakshatra.id, isNotEmpty);
      expect(answer.meta.timezone.name, 'Asia/Kolkata');
      expect(answer.requestId, isNotNull);
      // The cost twice over: `meta.credits` and `X-KJ-Credits`.
      expect(answer.meta.credits, greaterThan(0));
      expect(answer.credits, answer.meta.credits);
      // The balance goes to secret keys only, never to a page's key.
      if (publishable) {
        expect(answer.creditsRemaining, isNull);
      } else {
        expect(answer.creditsRemaining, greaterThanOrEqualTo(0));
      }
    });

    test('the price list answers for free', () async {
      final answer = await kj.reference('credits');

      final prices = <Object?, Map<String, dynamic>>{
        for (final row in answer.data) row['route']: row,
      };
      expect(prices['/v1/kundli']?['credits'], greaterThan(0));
      expect(prices['/v1/match/batch']?['per'], 'pair');
      expect(prices['/v1/reports/kundli']?['per'], 'part');
      // A free route is not metered, so there is no cost header on it.
      expect(answer.credits, isNull);
    });

    test('a kundli answers with the ascendant the docs quote', () async {
      final answer = await kj.kundli.get(
        KundliRequest(
          birth: Birth(
            datetime: '1990-05-14T10:30:00',
            timezone: 'Asia/Kolkata',
            latitude: 28.6139,
            longitude: 77.209,
            place: 'New Delhi',
          ),
          options: CalculationOptions(language: ['en', 'hi']),
        ),
      );

      expect(answer.data.lagnaSign.id, 'cancer');
      expect(answer.data.lagnaSign.names?['hi'], isNotNull);
      expect(answer.data.positions.keys, contains('sun'));
      expect(answer.meta.timezone.utcOffset, '+05:30');
      expect(answer.meta.timezone.source, 'given');
    });

    test('a chart answers as markup when asked for as SVG', () async {
      final answer = await kj.kundli.chartSvg(
        KundliChartRequest(
          birth: Birth(
            datetime: '1990-05-14T10:30:00',
            timezone: 'Asia/Kolkata',
            latitude: 28.6139,
            longitude: 77.209,
          ),
          size: 360,
        ),
      );

      expect(answer.data, startsWith('<svg'));
      expect(answer.data, contains('</svg>'));
      expect(answer.meta, isNull);
    });

    test('a lagna reading answers text and the disclaimer', () async {
      final answer = await kj.reports.lagna(
        ReportLagnaRequest(
          sign: 'leo',
          options: CalculationOptions(language: ['en', 'hi']),
        ),
      );

      expect(answer.data.lagna?.sign.id, 'leo');
      expect(answer.data.lagna?.entry.text.en, isNotEmpty);
      expect(answer.data.lagna?.entry.text.hi, isNotEmpty);
      expect(answer.data.disclaimer?.en, startsWith('These predictions'));
    });

    test(
        'a daily horoscope is a summary and five areas, no disclaimer when off',
        () async {
      final answer = await kj.horoscope(
        HoroscopeRequest(
          sign: 'aries',
          date: '2026-09-28',
          timezone: 'Asia/Kolkata',
          options: CalculationOptions(disclaimer: Disclaimer.off),
        ),
      );

      expect(answer.data.sign.id, 'aries');
      expect(answer.data.from, '2026-09-27T18:30:00.000Z');
      expect(
          ['favourable', 'mixed', 'care'], contains(answer.data.summary.level));
      expect(answer.data.areas.map((a) => a.area),
          ['work', 'money', 'relationships', 'health', 'education']);
      expect(answer.data.disclaimer, isNull);
    });

    test('a kundli report of two parts is priced as two', () async {
      final answer = await kj.reports.kundli(ReportKundliRequest(
        birth: Birth(
          datetime: '1990-05-14T10:30:00',
          timezone: 'Asia/Kolkata',
          latitude: 28.6139,
          longitude: 77.209,
        ),
        parts: ['lagna', 'yogas'],
      ));
      expect(answer.data.parts, ['lagna', 'yogas']);
      // Two parts at 5 credits each, unless the price list has been changed.
      expect(answer.meta.credits, 10);
    });

    test('the personal reports answer on every plan', () async {
      final birth = Birth(
        datetime: '1990-05-14T10:30:00',
        timezone: 'Asia/Kolkata',
        latitude: 28.6139,
        longitude: 77.209,
      );
      final dashas = await kj.reports.vimshottari(KundliRequest(birth: birth));
      expect(dashas.data.periods.where((p) => p.current), hasLength(1));
      final year = await kj.reports
          .varshphal(VarshphalRequest(birth: birth, year: 2026));
      expect(year.data.year, 2026);
      expect(year.data.areas, hasLength(7));
    });

    test('the house lords answer twelve houses in order', () async {
      final answer = await kj.reports.houseLords(
        KundliRequest(
          birth: Birth(
            datetime: '1990-05-14T10:30:00',
            timezone: 'Asia/Kolkata',
            latitude: 28.6139,
            longitude: 77.209,
            place: 'New Delhi',
          ),
          options: CalculationOptions(language: ['en', 'hi']),
        ),
      );

      final lords = answer.data.houseLords!;
      expect(
          lords.map((l) => l.house), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(lords.first.sign.id, 'cancer');
      expect(lords.first.entry.text.hi, isNotEmpty);
    });

    test('a place search answers coordinates and a zone', () async {
      final answer = await kj.places('Bombay', country: 'IN', limit: 3);

      expect(answer.data.places, isNotEmpty);
      expect(answer.data.places.first.timezone, 'Asia/Kolkata');
    });

    test('a contradiction is a validation_error with the field named',
        () async {
      await expectLater(
        kj.kundli.get(
          KundliRequest(
            // Both a zone and an offset: they can disagree, so the API
            // refuses rather than guessing which one was meant.
            birth: Birth(
              datetime: '1990-05-14T10:30:00',
              timezone: 'Asia/Kolkata',
              utcOffset: '+05:30',
              latitude: 28.6139,
              longitude: 77.209,
            ),
          ),
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'validation_error')
              .having((e) => e.status, 'status', 400)
              .having((e) => e.isRetryable, 'isRetryable', isFalse)
              .having((e) => e.docs, 'docs', contains('#validation_error')),
        ),
      );
    });
  }, skip: skip);
}
