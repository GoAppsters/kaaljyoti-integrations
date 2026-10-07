/// The generated models against real staging envelopes.
///
/// `test/fixtures/*.json` are recorded answers, not hand-written samples, so
/// this is the test that catches a schema the engine has quietly outgrown: a
/// field the snapshot calls required and the engine now omits fails
/// `fromJson`, and a field the snapshot does not mention at all disappears in
/// the round trip and fails the comparison.
library;

import 'dart:convert';
import 'dart:io';

import 'package:kaaljyoti/kaaljyoti.dart';
import 'package:test/test.dart';

Map<String, dynamic> fixture(String name) {
  final file = File('test/fixtures/$name.json');
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

Map<String, dynamic> dataOf(String name) =>
    fixture(name)['data'] as Map<String, dynamic>;

/// `toJson()` omits nulls; the recorded envelopes carry them explicitly.
///
/// Both are the same document — the gateway's `additionalProperties: false`
/// means an absent key and a null key say the same thing — so the original is
/// stripped before the two are compared, rather than teaching `toJson` to
/// write nulls that the API's "either timezone or utc_offset" rules would
/// then trip over.
Object? stripNulls(Object? value) {
  if (value is Map<String, dynamic>) {
    final out = <String, dynamic>{};
    for (final entry in value.entries) {
      if (entry.value != null) out[entry.key] = stripNulls(entry.value);
    }
    return out;
  }
  if (value is List) return value.map(stripNulls).toList();
  return value;
}

/// Deep equality that treats `23` and `23.0` as the same number.
///
/// JSON has one number type and Dart has two: a `number` field whose recorded
/// value happens to be whole comes back as an `int` and goes out as a
/// `double`. That is not a round-trip failure.
bool deepEquals(Object? a, Object? b) {
  if (a is num && b is num) return a == b;
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final key in a.keys) {
      if (!b.containsKey(key)) return false;
      if (!deepEquals(a[key], b[key])) return false;
    }
    return true;
  }
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false;
    }
    return true;
  }
  return a == b;
}

/// Asserts that `toJson()` of a parsed fixture is the fixture again.
void expectRoundTrip(Map<String, dynamic> original, Map<String, dynamic> json) {
  final reparsed = jsonDecode(jsonEncode(json)) as Map<String, dynamic>;
  final wanted = stripNulls(original);
  expect(
    deepEquals(reparsed, wanted),
    isTrue,
    reason: 'round trip lost or changed keys:\n'
        'wanted ${jsonEncode(wanted)}\n'
        'got    ${jsonEncode(reparsed)}',
  );
}

void main() {
  group('KundliDocument', () {
    final data = dataOf('kundli');
    final document = KundliDocument.fromJson(data);

    test('names ids instead of answering bare strings', () {
      expect(document.lagnaSign, isA<LabelledId>());
      expect(document.lagnaSign.id, 'cancer');
      expect(document.lagnaSign.name, 'Cancer');
      expect(document.lagnaSign.names?['hi'], 'कर्क');
      expect(document.moonNakshatra.id, 'purva_ashadha');
    });

    test('types the numbers and the maps', () {
      expect(document.ascendant, isA<double>());
      expect(document.ascendantDms, "99°02'48.2\"");
      expect(document.houseCusps, hasLength(12));
      expect(document.houses['sun'], isA<int>());

      final sun = document.positions['sun'];
      expect(sun, isNotNull);
      expect(sun!.planet.id, 'sun');
      expect(sun.sign.id, 'aries');
      expect(sun.isRetrograde, isFalse);
      expect(sun.pada, 1);
      expect(sun.longitude, closeTo(29.4246, 0.0001));
    });

    test('camelCases the wire keys', () {
      expect(document.birth.placeName, 'New Delhi');
      expect(document.birth.utcOffsetMinutes, 330);
    });

    test('round-trips', () => expectRoundTrip(data, document.toJson()));
  });

  group('DailyPanchangDocument', () {
    final data = dataOf('panchang');
    final document = DailyPanchangDocument.fromJson(data);

    test('carries both tithis of a two-tithi day', () {
      expect(document.tithis, hasLength(2));
      expect(document.tithis.first.name.id, 'ekadashi');
      expect(document.tithis.first.starts, isNull);
      expect(document.tithis.last.name.id, 'dwadashi');
      expect(document.tithis.last.paksha.id, 'shukla');
      expect(document.tithis.last.starts, isNotNull);
    });

    test('labels its names from their index', () {
      final day = document.panchang;
      expect(day.tithiName, isA<LabelledId>());
      expect(day.tithiName.id, 'ekadashi');
      expect(day.tithiName.names, {'en': 'Ekadashi', 'hi': 'एकादशी'});
      expect(day.vara.id, 'mangalavara');
      expect(day.paksha.id, 'shukla');
      expect(day.yogaName.id, 'atiganda');
      expect(day.karanaName.id, 'vishti');
      expect(document.masa.monthName.names?['hi'], 'भाद्रपद');
    });

    test('shares one window type for every muhurta', () {
      expect(document.abhijitMuhurta, isA<TimeWindow>());
      expect(document.brahmaMuhurta, isA<TimeWindow>());
      expect(document.rahuKalam?.start, isNotNull);
      expect(document.masa.samvatYear, 2083);
      expect(document.masa.isAdhik, isFalse);
      expect(document.placements['cancer'], containsAll(['mars', 'jupiter']));
    });

    test('round-trips', () => expectRoundTrip(data, document.toJson()));
  });

  group('MuhurtaDocument', () {
    final data = dataOf('muhurta');
    final document = MuhurtaDocument.fromJson(data);

    test('reads the choghadiya table', () {
      final day = document.choghadiya?.day;
      expect(day, hasLength(8));
      expect(day?.first.choghadiya, 'amrit');
      expect(day?.first.good, isTrue);
      expect(document.abhijitApplies, isTrue);
      expect(document.abhijit.start, startsWith('1990-05-14T'));
    });

    test('round-trips', () => expectRoundTrip(data, document.toJson()));
  });

  group('ChartDocument', () {
    final data = dataOf('chart');
    final document = ChartDocument.fromJson(data);

    test('carries the SVG whole', () {
      expect(document.svg, startsWith('<svg'));
      expect(document.style, ChartStyle.north);
      expect(document.size, 360);
      expect(document.showDegrees, isTrue);
    });

    test('round-trips', () => expectRoundTrip(data, document.toJson()));
  });

  group('the summary reports', () {
    final cases = <String, Map<String, dynamic> Function(Map<String, dynamic>)>{
      'horoscope': (data) => HoroscopeDocument.fromJson(data).toJson(),
      'reading_grahas': (data) => ReadingGrahasDocument.fromJson(data).toJson(),
      'reading_yogas': (data) => ReadingYogasDocument.fromJson(data).toJson(),
      'reading_vimshottari': (data) =>
          VimshottariReadingDocument.fromJson(data).toJson(),
      'reading_varshphal': (data) =>
          VarshphalReadingDocument.fromJson(data).toJson(),
      'reading_life_areas': (data) => LifeAreasDocument.fromJson(data).toJson(),
      'reading_kundli': (data) => KundliReportDocument.fromJson(data).toJson(),
    };
    for (final MapEntry(key: name, value: read) in cases.entries) {
      test('$name round-trips', () {
        final data = dataOf(name);
        expectRoundTrip(data, read(data));
      });
    }
  });

  group('ErrorBody', () {
    final body = fixture('error');
    final error = ErrorBody.fromJson(body);

    test('names the code and the offending field', () {
      expect(error.status, 'error');
      expect(error.error.code, 'validation_error');
      expect(error.error.message, 'Invalid input');
      expect(error.error.field, 'options.language');
      expect(error.error.docs, endsWith('#validation_error'));
    });

    test('round-trips', () => expectRoundTrip(body, error.toJson()));
  });

  group('Meta', () {
    test('reports the zone the answer was computed in', () {
      final meta =
          Meta.fromJson(fixture('kundli')['meta'] as Map<String, dynamic>);
      expect(meta.cached, isFalse);
      expect(meta.computeMs, isA<int>());
      expect(meta.ayanamsa.id, 'lahiri');
      expect(meta.timezone.name, 'Asia/Kolkata');
      expect(meta.timezone.utcOffset, '+05:30');
      expect(meta.timezone.source, 'given');
      expect(meta.languageFallback, isEmpty);
    });
  });

  group('requests', () {
    test('send exactly the quick start body, with no null keys', () {
      final request = KundliRequest(
        birth: Birth(
          datetime: '1990-05-14T10:30:00',
          timezone: 'Asia/Kolkata',
          latitude: 28.6139,
          longitude: 77.209,
          place: 'New Delhi',
        ),
        options: CalculationOptions(ayanamsa: 'lahiri', language: ['en']),
      );

      expect(request.toJson(), {
        'birth': {
          'datetime': '1990-05-14T10:30:00',
          'timezone': 'Asia/Kolkata',
          'latitude': 28.6139,
          'longitude': 77.209,
          'place': 'New Delhi',
        },
        // A single language goes out as the bare string the API documents…
        'options': {'ayanamsa': 'lahiri', 'language': 'en'},
      });
    });

    test('write several languages as an array', () {
      final options = CalculationOptions(language: ['en', 'hi']).toJson();
      // …and more than one as the array.
      expect(options, {
        'language': ['en', 'hi'],
      });
    });

    test('read a language back as a list either way', () {
      expect(
        CalculationOptions.fromJson({'language': 'hi'}).language,
        ['hi'],
      );
      expect(
        CalculationOptions.fromJson({
          'language': ['en', 'hi'],
        }).language,
        ['en', 'hi'],
      );
    });

    test('leave out every option the caller did not set', () {
      final request = KundliRequest(
        birth: Birth(
          datetime: '1990-05-14T10:30:00',
          latitude: 28.6139,
          longitude: 77.209,
        ),
      );
      expect(request.toJson().keys, ['birth']);
      expect(
        (request.toJson()['birth'] as Map<String, dynamic>).keys,
        ['datetime', 'latitude', 'longitude'],
      );
    });

    test('ask for a muhurta with a birth or with a place', () {
      final byPlace = MuhurtaRequest(
        latitude: 28.6139,
        longitude: 77.209,
        date: '2026-09-22',
      );
      expect(byPlace.toJson(), {
        'latitude': 28.6139,
        'longitude': 77.209,
        'date': '2026-09-22',
      });
      final byBirth = MuhurtaRequest(
        birth: Birth(
          datetime: '1990-05-14T10:30:00',
          latitude: 28.6139,
          longitude: 77.209,
        ),
      );
      expect(byBirth.toJson().keys, ['birth']);
    });

    test('ask for a dasha five levels deep inside a window', () {
      final request = DashaRequest(
        birth: Birth(
          datetime: '1990-05-14T10:30:00',
          latitude: 28.6139,
          longitude: 77.209,
        ),
        system: 'chara',
        levels: 5,
        from: '2026-09-01T00:00:00Z',
        to: '2026-10-01T00:00:00Z',
      );
      expect(request.toJson()['levels'], 5);
      expect(request.toJson()['system'], 'chara');
    });
  });

  group('LabelledId', () {
    test('compares by value, names included', () {
      const a = LabelledId(id: 'sun', name: 'Sun', names: {'en': 'Sun'});
      const b = LabelledId(id: 'sun', name: 'Sun', names: {'en': 'Sun'});
      const c = LabelledId(id: 'sun', name: 'Sun');
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
      expect(a.toString(), 'LabelledId(sun, Sun)');
    });

    test('omits absent names', () {
      expect(const LabelledId(id: 'sun', name: 'Sun').toJson(), {
        'id': 'sun',
        'name': 'Sun',
      });
    });
  });

  group('the generated constants', () {
    test('pin both versions', () {
      expect(sdkVersion, matches(RegExp(r'^\d+\.\d+\.\d+')));
      expect(openApiVersion, '0.16.0');
    });

    test('spell the enums the schema lists', () {
      expect(HouseSystem.wholeSign, 'whole_sign');
      expect(HouseSystem.values,
          ['whole_sign', 'placidus', 'porphyry', 'equal', 'sripati', 'kp']);
      expect(ChartStyle.values, ['north', 'south', 'circular']);
      expect(Ayanamsa.values, hasLength(47));
      expect(Ayanamsa.lahiri, 'lahiri');
      expect(Ayanamsa.aryabhata522, 'aryabhata_522');
      expect(Varga.values, hasLength(16));
      expect(Varga.values.first, Varga.d1);
      expect(Varga.d60, 'd60');
    });

    test('leave the enum fields plain strings', () {
      // A slug the caller already holds goes in as it is.
      expect(CalculationOptions(ayanamsa: 'raman').toJson(), {
        'ayanamsa': 'raman',
      });
      const birth = Birth(
        datetime: '1990-05-14T10:30:00',
        latitude: 28.6,
        longitude: 77.2,
      );
      expect(
        VargasRequest(birth: birth, vargas: [Varga.d9, 'd10'])
            .toJson()['vargas'],
        ['d9', 'd10'],
      );
      expect(
        DashaRequest(birth: birth, system: 'vimshottari', levels: 3)
            .toJson()['levels'],
        3,
      );
    });

    test('offer a house system on the kundli PDF only', () {
      // The API answers 400 to `options.house_system` anywhere but the
      // kundli PDF, so the shared options do not offer it.
      final request = PdfKundliRequest(
        birth: const Birth(
          datetime: '1990-05-14T10:30:00',
          latitude: 28.6,
          longitude: 77.2,
        ),
        options: PdfKundliOptions(
          language: ['en'],
          houseSystem: HouseSystem.wholeSign,
        ),
      );
      expect(request.toJson()['options'], {
        'language': 'en',
        'house_system': 'whole_sign',
      });
      expect(
        PdfKundliRequest.fromJson(request.toJson()).toJson(),
        request.toJson(),
      );
    });
  });

  group('a malformed payload', () {
    test('says what it wanted and what it got', () {
      expect(
        () => LabelledId.fromJson({'id': 42, 'name': 'Sun'}),
        throwsA(
          isA<KaaljyotiFormatException>().having(
            (e) => e.message,
            'message',
            contains('expected a string, got int (42)'),
          ),
        ),
      );
    });
  });
}
