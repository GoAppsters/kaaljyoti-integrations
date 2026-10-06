/// Wall clocks and instants, and the conversion between them.
///
/// The docs' time-zone page opens by saying that more wrong answers come from
/// this than from everything else combined, and that almost all of them are
/// one mistake: sending an instant where a wall clock belongs. A birth time is
/// a wall clock — `1990-05-14T10:30:00` means half past ten *where the birth
/// happened* — and `DateTime.toIso8601String()` on a UTC `DateTime` sends the
/// UTC time of that moment, which is the birth time only in London and five
/// and a half hours out in India. That is not a rounding error: it moves the
/// ascendant by most of the zodiac.
///
/// Dart has no IANA zone database in its core libraries, so this SDK does not
/// pretend to one. [wallClock] formats a `DateTime`'s own fields, which is
/// correct precisely when those fields already are the clock at the place;
/// [fromWallClock] goes back, given the offset the API reported in
/// `meta.timezone.utc_offset`. Zone *names* are resolved by the API —
/// `kj.timezone(lat: …, lon: …)` — and never locally, which is also how a
/// 1944 Indian birth gets its `+06:30` instead of today's `+05:30`.
///
/// All three functions are pure and depend on nothing.
library;

/// `YYYY-MM-DDTHH:MM:SS`, no zone attached, as `birth.datetime` wants it.
final RegExp _wallClockPattern =
    RegExp(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?$');

/// `+05:30`, `-04:00`, as `birth.utc_offset` and `meta.timezone` write it.
final RegExp _utcOffsetPattern = RegExp(r'^[+-]\d{2}:\d{2}$');

String _pad(int value, int width) => value.toString().padLeft(width, '0');

/// The wall clock a [DateTime]'s own fields spell, as `birth.datetime` wants.
///
/// ```dart
/// wallClock(DateTime(1990, 5, 14, 10, 30)); // '1990-05-14T10:30:00'
/// ```
///
/// **The caller passes a `DateTime` whose fields already are the wall clock at
/// the place.** This function reads `year`, `month`, `day`, `hour`, `minute`
/// and `second` and writes them out; it does not convert between zones,
/// because Dart cannot without a zone database. A `DateTime` built from a
/// user's date and time pickers is already right. A `DateTime` that came from
/// a device clock in another zone, or from `DateTime.parse` of an instant, is
/// not — convert it first, or ask the API for the offset and use
/// [fromWallClock] in reverse.
///
/// Sub-second precision is dropped: the API accepts milliseconds and no birth
/// record has them.
String wallClock(DateTime dt) =>
    '${_pad(dt.year, 4)}-${_pad(dt.month, 2)}-${_pad(dt.day, 2)}'
    'T${_pad(dt.hour, 2)}:${_pad(dt.minute, 2)}:${_pad(dt.second, 2)}';

/// The instant a wall clock was, given the offset it was on, in UTC.
///
/// The offset is the one thing a wall clock does not carry, so it has to come
/// from somewhere: `meta.timezone.utcOffset` on an answer, or
/// `kj.timezone(...)` before the call.
///
/// ```dart
/// fromWallClock('1990-05-14T10:30:00', '+05:30');
/// // 1990-05-14T05:00:00.000Z
/// ```
///
/// Throws a [FormatException] when either argument is malformed. A `-0500`, an
/// `Asia/Kolkata` or a `+5:30` here would otherwise become a plausible but
/// wrong instant, and a silently wrong chart is worse than a throw.
DateTime fromWallClock(String wall, String utcOffset) {
  if (!_wallClockPattern.hasMatch(wall)) {
    throw FormatException('Not a wall clock (YYYY-MM-DDTHH:MM:SS)', wall);
  }
  if (!_utcOffsetPattern.hasMatch(utcOffset)) {
    throw FormatException('Not a UTC offset (+HH:MM)', utcOffset);
  }
  // `DateTime.parse` understands the offset suffix and normalises it away;
  // `toUtc` only makes the result's own `isUtc` explicit.
  return DateTime.parse('$wall$utcOffset').toUtc();
}

/// A [Duration] as the API writes an offset: `+05:30`, `-04:00`.
///
/// ```dart
/// formatOffset(const Duration(hours: 5, minutes: 30)); // '+05:30'
/// formatOffset(const Duration(hours: -4)); // '-04:00'
/// ```
///
/// Seconds are truncated, exactly as the API's own database does with the
/// pre-1906 local mean times — Calcutta's `+05:53:20` is `+05:53` to both.
String formatOffset(Duration offset) {
  final sign = offset.isNegative ? '-' : '+';
  final minutes = offset.inMinutes.abs();
  return '$sign${_pad(minutes ~/ 60, 2)}:${_pad(minutes % 60, 2)}';
}
