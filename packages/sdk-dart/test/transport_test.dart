/// The transport, against a mocked socket.
///
/// Everything here is behaviour a caller would otherwise have to reimplement
/// and could not verify: where the key ends up, which failures are tried
/// again, and what the envelope's headers become. The retry sleep is injected,
/// so a test that asserts "it waited five seconds" finishes in microseconds.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kaaljyoti/kaaljyoti.dart';
import 'package:test/test.dart';

const String liveKey = 'kj_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const String testKey = 'kj_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const String pubKey = 'kj_pub_ccccccccccccccccccccccccccccccccccccccccccc';

/// A JSON answer with the charset spelled out, as the gateway sends it.
http.Response json(
  Object? body, {
  int status = 200,
  Map<String, String> headers = const <String, String>{},
}) {
  return http.Response(
    jsonEncode(body),
    status,
    headers: <String, String>{
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  );
}

Map<String, dynamic> fixture(String name) =>
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync())
        as Map<String, dynamic>;

/// The standard envelope, with a `meta` the generated [Meta] can read.
Map<String, dynamic> okEnvelope({bool cached = false}) => <String, dynamic>{
      'status': 'ok',
      'data': <String, dynamic>{'value': 1},
      'meta': <String, dynamic>{
        'cached': cached,
        'ayanamsa': <String, dynamic>{'id': 'lahiri', 'value': 23.7},
        'engine': '0.2.0',
        'compute_ms': 4,
        'credits': 1,
        'language_fallback': <String>[],
        'timezone': <String, dynamic>{
          'name': 'Asia/Kolkata',
          'utc_offset': '+05:30',
          'source': 'given',
        },
      },
    };

/// `data` as it arrived, untyped — this file is about the envelope, not the
/// documents, which `models_test.dart` covers.
Map<String, dynamic> loose(Object? value) => value! as Map<String, dynamic>;

Meta meta(Object? value) => Meta.fromJson(loose(value));

void main() {
  group('the key', () {
    test('travels as a Bearer header and never in the URL', () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((request) async {
          sent = request;
          return json(okEnvelope());
        }),
      );

      await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(sent.headers['authorization'], 'Bearer $liveKey');
      expect(sent.url.toString(), isNot(contains('key=')));
      expect(sent.url.toString(), isNot(contains(liveKey)));
    });

    test('does the same for a test key', () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: testKey,
        client: MockClient((request) async {
          sent = request;
          return json(okEnvelope());
        }),
      );

      await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(sent.headers['authorization'], 'Bearer $testKey');
      expect(sent.url.queryParameters, isEmpty);
    });

    test('travels as ?key= for a publishable key, and never as a header',
        () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: pubKey,
        client: MockClient((request) async {
          sent = request;
          return json(okEnvelope());
        }),
      );

      await transport.get<Map<String, dynamic>, Meta>(
        '/v1/reference/signs',
        query: <String, String?>{'language': 'hi', 'skipped': null},
        decode: loose,
        decodeMeta: meta,
      );

      expect(sent.url.queryParameters['key'], pubKey);
      expect(sent.url.queryParameters['language'], 'hi');
      expect(sent.url.queryParameters.containsKey('skipped'), isFalse);
      expect(sent.headers.containsKey('authorization'), isFalse);
    });

    test('is refused before the network when it is empty', () async {
      var called = false;
      final transport = Transport(
        apiKey: '',
        client: MockClient((request) async {
          called = true;
          return json(okEnvelope());
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', KjErrorCode.invalidKey)
              .having((e) => e.status, 'status', 0),
        ),
      );
      expect(called, isFalse);
    });
  });

  group('the headers', () {
    test('name the client and the content type, and merge the caller\'s',
        () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((request) async {
          sent = request;
          return json(okEnvelope());
        }),
        headers: const <String, String>{'X-Tenant': 'acme'},
      );

      await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{'birth': 1},
        decode: loose,
        decodeMeta: meta,
      );

      expect(sent.headers['x-kj-client'], 'sdk-dart/$sdkVersion');
      expect(sent.headers['accept'], 'application/json');
      expect(sent.headers['content-type'], startsWith('application/json'));
      expect(sent.headers['x-tenant'], 'acme');
      expect(jsonDecode(sent.body), <String, dynamic>{'birth': 1});
    });

    test('let a shell claim the usage with its own tag', () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: liveKey,
        clientTag: 'kj-mcp/1.2.3',
        client: MockClient((request) async {
          sent = request;
          return json(okEnvelope());
        }),
      );

      await transport.get<Map<String, dynamic>, Meta>(
        '/v1/timezone',
        decode: loose,
        decodeMeta: meta,
      );

      expect(sent.headers['x-kj-client'], 'kj-mcp/1.2.3');
      // No body, so no Content-Type: it would buy a CORS preflight and say
      // nothing true about the request.
      expect(sent.headers.containsKey('content-type'), isFalse);
    });

    test('cannot be talked out of the key or the tag', () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((request) async {
          sent = request;
          return json(okEnvelope());
        }),
        headers: const <String, String>{
          'Authorization': 'Bearer not-your-key',
          'X-KJ-Client': 'impostor/9',
        },
      );

      await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(sent.headers['authorization'], 'Bearer $liveKey');
      expect(sent.headers['x-kj-client'], 'sdk-dart/$sdkVersion');
    });
  });

  group('the base URL', () {
    test('means the same thing however it was written', () {
      expect(normaliseBaseUrl(null), defaultBaseUrl);
      expect(normaliseBaseUrl(''), defaultBaseUrl);
      expect(normaliseBaseUrl('  '), defaultBaseUrl);
      expect(normaliseBaseUrl('https://api.kaaljyoti.com/'), defaultBaseUrl);
      expect(normaliseBaseUrl('https://api.kaaljyoti.com/v1'), defaultBaseUrl);
      expect(normaliseBaseUrl('https://api.kaaljyoti.com/v1/'), defaultBaseUrl);
      expect(
        normaliseBaseUrl('https://api-staging.kaaljyoti.com/v1///'),
        'https://api-staging.kaaljyoti.com',
      );
    });

    test('is the origin the request goes to', () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: liveKey,
        baseUrl: 'https://api-staging.kaaljyoti.com/v1/',
        client: MockClient((request) async {
          sent = request;
          return json(okEnvelope());
        }),
      );

      await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(
          sent.url.toString(), 'https://api-staging.kaaljyoti.com/v1/kundli');
    });
  });

  group('a successful answer', () {
    test('keeps the envelope and everything the headers said', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((request) async {
          return json(
            okEnvelope(),
            headers: const <String, String>{
              'x-kj-request-id': 'req_123',
              'x-kj-plan': 'growth',
              'x-kj-cache': 'miss',
              'x-kj-credits': '1',
              'x-kj-credits-remaining': '199412',
              'x-ratelimit-limit': '120',
              'x-ratelimit-remaining': '119',
              'x-ratelimit-reset': '1790000000',
            },
          );
        }),
      );

      final result = await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(result.data['value'], 1);
      expect(result.meta.timezone.name, 'Asia/Kolkata');
      expect(result.meta.ayanamsa.id, 'lahiri');
      expect(result.requestId, 'req_123');
      expect(result.plan, 'growth');
      expect(result.cached, isFalse);
      expect(result.credits, 1);
      expect(result.creditsRemaining, 199412);
      expect(result.meta.credits, 1);
      expect(result.rateLimit.limit, 120);
      expect(result.rateLimit.remaining, 119);
      expect(result.rateLimit.reset, 1790000000);
    });

    test('reports a cache hit from either the meta or the header', () async {
      final fromMeta = Transport(
        apiKey: liveKey,
        client: MockClient((_) async => json(okEnvelope(cached: true))),
      );
      final fromHeader = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => json(
            okEnvelope(),
            headers: const <String, String>{'x-kj-cache': 'hit'},
          ),
        ),
      );

      Future<bool> cachedOf(Transport transport) async {
        final result = await transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        );
        return result.cached;
      }

      expect(await cachedOf(fromMeta), isTrue);
      expect(await cachedOf(fromHeader), isTrue);
    });

    test('leaves the rate limit unknown when no headers arrived', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((_) async => json(okEnvelope())),
      );

      final result = await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(result.rateLimit.limit, isNull);
      expect(result.rateLimit.remaining, isNull);
      expect(result.requestId, isNull);
      expect(result.plan, isNull);
      expect(result.credits, isNull);
      expect(result.creditsRemaining, isNull);
    });

    test('tells a publishable key the cost, but not what is left', () async {
      // The gateway never sends `X-KJ-Credits-Remaining` to a `kj_pub_…` key.
      final transport = Transport(
        apiKey: pubKey,
        client: MockClient(
          (_) async => json(
            okEnvelope(),
            headers: const <String, String>{'x-kj-credits': '1'},
          ),
        ),
      );

      final result = await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(result.credits, 1);
      expect(result.creditsRemaining, isNull);
    });
  });

  group('an error envelope', () {
    test('becomes an exception with every field the gateway named', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => json(
            fixture('error'),
            status: 400,
            headers: const <String, String>{'x-kj-request-id': 'req_bad'},
          ),
        ),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'validation_error')
              .having((e) => e.status, 'status', 400)
              .having((e) => e.message, 'message', 'Invalid input')
              .having((e) => e.field, 'field', 'options.language')
              .having((e) => e.docs, 'docs', endsWith('#validation_error'))
              .having((e) => e.requestId, 'requestId', 'req_bad')
              .having((e) => e.isRetryable, 'isRetryable', isFalse)
              .having((e) => e.toString(), 'toString',
                  contains('field options.language')),
        ),
      );
    });

    test('is not retried when the caller is the one at fault', () async {
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((_) async {
          attempts += 1;
          return json(fixture('error'), status: 400);
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(isA<KaaljyotiException>()),
      );
      expect(attempts, 1);
    });
  });

  group('retrying', () {
    test('waits what a 429 asked for, and stops at maxRetries', () async {
      final waited = <Duration>[];
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        maxRetries: 2,
        sleep: (duration) async => waited.add(duration),
        client: MockClient((_) async {
          attempts += 1;
          return json(
            <String, dynamic>{
              'status': 'error',
              'error': <String, dynamic>{
                'code': 'rate_limited',
                'message': 'Slow down',
              },
            },
            status: 429,
            headers: const <String, String>{'retry-after': '5'},
          );
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'rate_limited')
              .having(
                  (e) => e.retryAfter, 'retryAfter', const Duration(seconds: 5))
              .having((e) => e.isRetryable, 'isRetryable', isTrue),
        ),
      );
      expect(attempts, 3, reason: 'one attempt plus two retries');
      expect(waited, const <Duration>[
        Duration(seconds: 5),
        Duration(seconds: 5),
      ]);
    });

    test('caps the wait, and falls back when Retry-After is nonsense',
        () async {
      final waited = <Duration>[];
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        maxRetries: 2,
        sleep: (duration) async => waited.add(duration),
        client: MockClient((_) async {
          attempts += 1;
          return json(
            <String, dynamic>{
              'status': 'error',
              'error': <String, dynamic>{
                'code': 'rate_limited',
                'message': 'x'
              },
            },
            status: 429,
            headers: <String, String>{
              'retry-after':
                  attempts == 1 ? '600' : 'Wed, 21 Oct 2026 07:28:00 GMT',
            },
          );
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(isA<KaaljyotiException>()),
      );
      expect(waited, const <Duration>[
        Duration(seconds: 30), // capped
        Duration(seconds: 2), // the default, for an unparseable header
      ]);
    });

    test('does not retry a 429 at all when maxRetries is 0', () async {
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        maxRetries: 0,
        sleep: (_) async => fail('should not have waited'),
        client: MockClient((_) async {
          attempts += 1;
          return json(
            <String, dynamic>{
              'status': 'error',
              'error': <String, dynamic>{
                'code': 'rate_limited',
                'message': 'x'
              },
            },
            status: 429,
            headers: const <String, String>{'retry-after': '3'},
          );
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(isA<KaaljyotiException>()),
      );
      expect(attempts, 1);
    });

    test('gives an engine_error exactly one more try', () async {
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((_) async {
          attempts += 1;
          if (attempts == 1) {
            return json(
              <String, dynamic>{
                'status': 'error',
                'error': <String, dynamic>{
                  'code': 'engine_error',
                  'message': 'the engine blew up',
                },
              },
              status: 500,
            );
          }
          return json(okEnvelope());
        }),
      );

      final result = await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(attempts, 2);
      expect(result.data['value'], 1);
    });

    test('gives up on a second engine_error', () async {
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((_) async {
          attempts += 1;
          return json(
            <String, dynamic>{
              'status': 'error',
              'error': <String, dynamic>{
                'code': 'engine_error',
                'message': 'the engine blew up',
              },
            },
            status: 500,
          );
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'engine_error')
              .having((e) => e.isRetryable, 'isRetryable', isTrue),
        ),
      );
      expect(attempts, 2);
    });

    test('tries a dead socket once more, then says network_error', () async {
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((_) async {
          attempts += 1;
          throw http.ClientException('Connection closed before full header');
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', KjErrorCode.networkError)
              .having((e) => e.status, 'status', 0)
              .having(
                  (e) => e.message, 'message', contains('Connection closed'))
              .having((e) => e.isRetryable, 'isRetryable', isTrue),
        ),
      );
      expect(attempts, 2);
    });

    test('recovers when the second attempt finds the socket alive', () async {
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((_) async {
          attempts += 1;
          if (attempts == 1) throw http.ClientException('boom');
          return json(okEnvelope());
        }),
      );

      final result = await transport.post<Map<String, dynamic>, Meta>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: meta,
      );

      expect(attempts, 2);
      expect(result.data['value'], 1);
    });
  });

  group('a deadline', () {
    test('is its own code, and names the budget it spent', () async {
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        maxRetries: 0,
        timeout: const Duration(milliseconds: 20),
        client: MockClient((_) async {
          attempts += 1;
          await Future<void>.delayed(const Duration(milliseconds: 200));
          return json(okEnvelope());
        }),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', KjErrorCode.timeout)
              .having((e) => e.message, 'message', contains('20 ms'))
              .having((e) => e.isRetryable, 'isRetryable', isTrue),
        ),
      );
      expect(attempts, 1, reason: 'maxRetries: 0 buys no second attempt');
    });
  });

  group('the answers that are not envelopes', () {
    test('health comes back bare, with no meta', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => json(<String, dynamic>{
            'status': 'ok',
            'engine': '0.14.2',
            'ephemeris': 'kaaljyoti-ephemeris 0.1.1',
            'ops': 42,
            'supported_range': {
              'first_date': '1550-04-01',
              'last_date': '2400-12-31',
              'first_year': 1551,
              'last_year': 2399
            },
            'uptime_s': 9001,
          }),
        ),
      );

      final result = await transport.get<HealthDocument, Null>(
        healthPath,
        decode: (value) => HealthDocument.fromJson(loose(value)),
        decodeMeta: (_) => null,
      );

      expect(result.data.engine, '0.14.2');
      expect(result.data.ephemeris, 'kaaljyoti-ephemeris 0.1.1');
      expect(result.data.ops, 42);
      expect(result.meta, isNull);
    });

    test('an SVG comes back as its own markup', () async {
      late http.Request sent;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((request) async {
          sent = request;
          return http.Response(
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            200,
            headers: const <String, String>{
              'content-type': 'image/svg+xml; charset=utf-8',
              'x-kj-credits': '1',
            },
          );
        }),
      );

      final result = await transport.post<String, Null>(
        '/v1/kundli/chart',
        <String, dynamic>{},
        decode: (value) => value! as String,
        decodeMeta: (_) => null,
        accept: acceptSvg,
      );

      expect(sent.headers['accept'], acceptSvg);
      expect(result.data, startsWith('<svg'));
      expect(result.meta, isNull);
      // No `meta` on markup: the header is the only place the cost is.
      expect(result.credits, 1);
    });

    test('an SVG request that failed is still an envelope', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => json(fixture('error'), status: 400),
        ),
      );

      await expectLater(
        transport.post<String, Null>(
          '/v1/kundli/chart',
          <String, dynamic>{},
          decode: (value) => value! as String,
          decodeMeta: (_) => null,
          accept: acceptSvg,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'validation_error'),
        ),
      );
    });
  });

  group('a PDF', () {
    test('comes back as bytes, never as text', () async {
      // Every byte value, so a UTF-8 decode anywhere on the way would show.
      final bytes = Uint8List.fromList(List<int>.generate(256, (i) => i));
      late http.Request sent;
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient((request) async {
          sent = request;
          return http.Response.bytes(
            bytes,
            200,
            headers: const <String, String>{
              'content-type': 'application/pdf',
              'content-disposition':
                  'attachment; filename="panchang-2026-10.pdf"',
              'x-kj-credits': '500',
            },
          );
        }),
      );

      final result = await transport.post<PdfFile, Null>(
        '/v1/pdf/panchang/month',
        <String, dynamic>{},
        decode: (value) => value! as PdfFile,
        decodeMeta: (_) => null,
        accept: acceptPdf,
      );

      expect(result.data.bytes, bytes);
      expect(result.data.contentType, 'application/pdf');
      expect(result.data.filename, 'panchang-2026-10.pdf');
      expect(result.data.credits, 500);
      expect(result.credits, 500);
      expect(result.meta, isNull);
      expect(sent.headers['accept'], acceptPdf);
      expect(sent.headers['content-type'], startsWith('application/json'));
    });

    test('that failed is still an envelope, and is retried like any other',
        () async {
      final waited = <Duration>[];
      var attempts = 0;
      final transport = Transport(
        apiKey: liveKey,
        sleep: (duration) async => waited.add(duration),
        client: MockClient((_) async {
          attempts += 1;
          if (attempts == 1) {
            return json(
              fixture('error'),
              status: 429,
              headers: const <String, String>{'retry-after': '1'},
            );
          }
          return json(fixture('error'), status: 400);
        }),
      );

      await expectLater(
        transport.post<PdfFile, Null>(
          '/v1/pdf/kundli',
          <String, dynamic>{},
          decode: (value) => value! as PdfFile,
          decodeMeta: (_) => null,
          accept: acceptPdf,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', 'validation_error'),
        ),
      );
      expect(attempts, 2);
      expect(waited, const <Duration>[Duration(seconds: 1)]);
    });
  });

  group('filenameOf', () {
    test('reads the quoted file name the gateway sends', () {
      expect(
        filenameOf('attachment; filename="kundli-ravi-kumar.pdf"'),
        'kundli-ravi-kumar.pdf',
      );
    });

    test('reads an unquoted one', () {
      expect(
          filenameOf('attachment; filename=match-2026.pdf'), 'match-2026.pdf');
    });

    test('prefers the RFC 6266 filename* form, which can carry Devanagari', () {
      expect(
        filenameOf('attachment; filename="kundli.pdf"; '
            "filename*=UTF-8''kundli-%E0%A4%B0%E0%A4%B5%E0%A4%BF.pdf"),
        'kundli-रवि.pdf',
      );
    });

    test('is null without a header or a file name in it', () {
      expect(filenameOf(null), isNull);
      expect(filenameOf('attachment'), isNull);
      expect(filenameOf('attachment; filename=""'), isNull);
    });
  });

  group('an answer we cannot read', () {
    test('is bad_response when it is not JSON at all', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => http.Response(
            '<html><body>502 Bad Gateway</body></html>',
            502,
            headers: const <String, String>{'content-type': 'text/html'},
          ),
        ),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', KjErrorCode.badResponse)
              .having((e) => e.status, 'status', 502)
              .having((e) => e.isRetryable, 'isRetryable', isFalse),
        ),
      );
    });

    test('is bad_response when it is JSON but not an envelope', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => json(<String, dynamic>{'whatever': true}),
        ),
      );

      await expectLater(
        transport.post<Map<String, dynamic>, Meta>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: loose,
          decodeMeta: meta,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', KjErrorCode.badResponse)
              .having((e) => e.message, 'message', contains('envelope')),
        ),
      );
    });

    test('is bad_response when the document does not match the schema',
        () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => json(<String, dynamic>{
            'status': 'ok',
            'data': <String, dynamic>{'engine': 42},
            'meta': null,
          }),
        ),
      );

      await expectLater(
        transport.post<HealthDocument, Null>(
          '/v1/kundli',
          <String, dynamic>{},
          decode: (value) => HealthDocument.fromJson(loose(value)),
          decodeMeta: (_) => null,
        ),
        throwsA(
          isA<KaaljyotiException>()
              .having((e) => e.code, 'code', KjErrorCode.badResponse)
              .having((e) => e.message, 'message', contains('schema')),
        ),
      );
    });
  });

  group('the UTF-8 the API speaks', () {
    test('survives a response with no charset on its content type', () async {
      final transport = Transport(
        apiKey: liveKey,
        client: MockClient(
          (_) async => http.Response.bytes(
            utf8.encode(jsonEncode(<String, dynamic>{
              'status': 'ok',
              'data': <String, dynamic>{'name': 'कर्क'},
              'meta': null,
            })),
            200,
            headers: const <String, String>{'content-type': 'application/json'},
          ),
        ),
      );

      final result = await transport.post<Map<String, dynamic>, Null>(
        '/v1/kundli',
        <String, dynamic>{},
        decode: loose,
        decodeMeta: (_) => null,
      );

      expect(result.data['name'], 'कर्क');
    });
  });
}
