/// The wall-clock helpers, which are pure and therefore cheap to pin down.
///
/// The case that matters is the round trip: a birth time goes out as a wall
/// clock, the answer says which offset it was on, and the same instant has to
/// come back. Everything else here guards the throw — a silently wrong chart
/// is worse than a `FormatException`.
library;

import 'package:kaaljyoti/kaaljyoti.dart';
import 'package:test/test.dart';

void main() {
  group('wallClock', () {
    test('writes the DateTime\'s own fields, zero-padded', () {
      expect(
        wallClock(DateTime(1990, 5, 14, 10, 30)),
        '1990-05-14T10:30:00',
      );
      expect(wallClock(DateTime(2026, 1, 2, 3, 4, 5)), '2026-01-02T03:04:05');
    });

    test('drops sub-second precision, which no birth record has', () {
      expect(
        wallClock(DateTime(1990, 5, 14, 10, 30, 15, 250)),
        '1990-05-14T10:30:15',
      );
    });

    test('pads a year before 1000 to four digits', () {
      expect(wallClock(DateTime(872, 3, 4, 5, 6, 7)), '0872-03-04T05:06:07');
    });

    test('reads a UTC DateTime\'s fields as they stand, not as an instant', () {
      // The documented contract: the caller hands over a DateTime whose fields
      // already are the clock at the place. A UTC one is only right when the
      // birth happened on UTC — which is exactly the mistake the docs warn
      // about, and why this function does not convert.
      final utc = DateTime.utc(1990, 5, 14, 5);
      expect(wallClock(utc), '1990-05-14T05:00:00');
    });
  });

  group('fromWallClock', () {
    test('turns a wall clock and its offset into an instant', () {
      final at = fromWallClock('1990-05-14T10:30:00', '+05:30');
      expect(at.isUtc, isTrue);
      expect(at.toIso8601String(), '1990-05-14T05:00:00.000Z');
    });

    test('handles a negative offset', () {
      final at = fromWallClock('2026-09-22T09:15:00', '-04:00');
      expect(at.toIso8601String(), '2026-09-22T13:15:00.000Z');
    });

    test('accepts the milliseconds the API tolerates', () {
      final at = fromWallClock('2026-09-22T09:15:00.250', '+00:00');
      expect(at.toIso8601String(), '2026-09-22T09:15:00.250Z');
    });

    test('refuses an instant, a zone name or a sloppy offset', () {
      expect(
        () => fromWallClock('1990-05-14T10:30:00Z', '+05:30'),
        throwsFormatException,
      );
      expect(
        () => fromWallClock('1990-05-14', '+05:30'),
        throwsFormatException,
      );
      expect(
        () => fromWallClock('1990-05-14T10:30:00', 'Asia/Kolkata'),
        throwsFormatException,
      );
      expect(
        () => fromWallClock('1990-05-14T10:30:00', '+5:30'),
        throwsFormatException,
      );
      expect(
        () => fromWallClock('1990-05-14T10:30:00', '0530'),
        throwsFormatException,
      );
    });
  });

  group('formatOffset', () {
    test('writes the shape the API writes', () {
      expect(formatOffset(const Duration(hours: 5, minutes: 30)), '+05:30');
      expect(formatOffset(const Duration(hours: -4)), '-04:00');
      expect(formatOffset(Duration.zero), '+00:00');
      expect(formatOffset(const Duration(hours: 6, minutes: 30)), '+06:30');
      expect(formatOffset(const Duration(hours: -9, minutes: -30)), '-09:30');
    });

    test('truncates seconds, as the zone database itself does', () {
      // Calcutta was +05:53:20 until 1906; ICU rounds such offsets to the
      // minute, and so does the API.
      expect(
        formatOffset(const Duration(hours: 5, minutes: 53, seconds: 20)),
        '+05:53',
      );
    });
  });

  group('the round trip', () {
    test('gets back the wall clock it started from', () {
      const wall = '1990-05-14T10:30:00';
      const offset = '+05:30';

      final instant = fromWallClock(wall, offset);
      // Back to the place's clock: the instant plus the offset it was on.
      final local = instant.add(const Duration(hours: 5, minutes: 30));
      expect(wallClock(local), wall);
    });

    test('survives an offset the other side of UTC', () {
      const wall = '2026-02-14T23:59:59';
      final instant = fromWallClock(wall, '-04:00');
      final local = instant.subtract(const Duration(hours: 4));
      expect(wallClock(local), wall);
    });
  });
}
