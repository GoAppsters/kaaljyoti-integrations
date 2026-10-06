/**
 * Wall clocks and instants, and the conversion between them.
 *
 * The docs' time-zone page opens by saying more wrong answers come from this
 * than from everything else combined, and that almost all of them are one
 * mistake: sending an instant where a wall clock belongs. A birth time is a
 * wall clock — `1990-05-14T10:30:00` means half past ten *where the birth
 * happened* — and a JavaScript `Date` is an instant, which knows nothing
 * about where it was. `date.toISOString()` on a birth therefore sends the
 * UTC time of that moment, which is the birth time only in London, and an
 * hour or five and a half hours wrong everywhere else. That is not a
 * rounding error: five and a half hours moves the ascendant by most of the
 * zodiac.
 *
 * So the SDK offers the conversion rather than leaving each caller to write
 * it: {@link toWallClock} for the direction everyone needs, and
 * {@link fromWallClock} for the reverse, when an answer's
 * `meta.timezone.utc_offset` is in hand and the caller wants a real instant
 * back. {@link utcOffsetAt} is the piece in between.
 *
 * All three are pure, dependency-free and built on `Intl`, which every
 * supported runtime has and which carries the historical offsets the API
 * itself uses — India's 1944 `+06:30` included.
 */

/** `YYYY-MM-DDTHH:MM:SS`, no zone attached, as `birth.datetime` wants it. */
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?$/;

/** `+05:30`, `-04:00`, as `birth.utc_offset` and `meta.timezone` write it. */
const UTC_OFFSET = /^[+-]\d{2}:\d{2}$/;

/** `en-CA` writes `2026-09-22, 14:05:09` — ISO order, which is why it. */
const PART_KEYS = ['year', 'month', 'day', 'hour', 'minute', 'second'] as const;

function partsOf(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) found[part.type] = part.value;
  return found;
}

/**
 * The local wall clock at `timeZone` for an instant.
 *
 * ```ts
 * toWallClock(new Date('1990-05-14T05:00:00Z'), 'Asia/Kolkata'); // '1990-05-14T10:30:00'
 * ```
 *
 * The result is exactly what `birth.datetime` wants, and the zone you passed
 * is exactly what `birth.timezone` wants beside it. Sub-second precision is
 * dropped: the API accepts milliseconds and no birth record has them.
 *
 * @throws RangeError for an invalid `Date` or an unknown zone — both are
 * programming mistakes, and a silently wrong chart is worse than a throw.
 */
export function toWallClock(date: Date, timeZone: string): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid Date');
  const parts = partsOf(date, timeZone);
  for (const key of PART_KEYS) {
    if (parts[key] === undefined) throw new RangeError(`Could not format a date in ${timeZone}`);
  }
  // `hourCycle: 'h23'` normally prevents it, but some ICU builds still write
  // midnight as `24` rather than `00` for a few locales.
  const hour = parts['hour'] === '24' ? '00' : parts['hour'];
  return `${parts['year']}-${parts['month']}-${parts['day']}T${hour}:${parts['minute']}:${parts['second']}`;
}

/**
 * The instant a wall clock was, given the offset it was on.
 *
 * The offset is the one thing a wall clock does not carry, so it has to come
 * from somewhere: `meta.timezone.utc_offset` on an answer, or
 * {@link utcOffsetAt} before the call.
 *
 * ```ts
 * fromWallClock('1990-05-14T10:30:00', '+05:30'); // 1990-05-14T05:00:00.000Z
 * ```
 *
 * @throws RangeError when either argument is malformed. A `-0500`, an
 * `Asia/Kolkata` or a `+5:30` here would otherwise become a plausible but
 * wrong instant.
 */
export function fromWallClock(wall: string, utcOffset: string): Date {
  if (!WALL_CLOCK.test(wall)) {
    throw new RangeError(`Not a wall clock (YYYY-MM-DDTHH:MM:SS): ${wall}`);
  }
  if (!UTC_OFFSET.test(utcOffset)) {
    throw new RangeError(`Not a UTC offset (+HH:MM): ${utcOffset}`);
  }
  const at = new Date(`${wall}${utcOffset}`);
  if (Number.isNaN(at.getTime())) throw new RangeError(`Not a real date: ${wall}`);
  return at;
}

/** `330` → `'+05:30'`; `-240` → `'-04:00'`. */
function formatOffset(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(totalMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/**
 * The offset from the wall clock, when `longOffset` is unavailable.
 *
 * Formatting the instant in the zone gives the local wall clock; reading that
 * wall clock as if it were UTC and subtracting the real instant gives the
 * offset. Seconds are truncated on both sides, which is why an offset with
 * seconds in it — Calcutta's `+05:53:20` before 1906 — rounds to the minute
 * here exactly as the API's own database does.
 */
function offsetByDifference(date: Date, timeZone: string): string {
  const asUtc = Date.parse(`${toWallClock(date, timeZone)}Z`);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return formatOffset(Math.round((asUtc - truncated) / 60_000));
}

/**
 * The UTC offset `timeZone` was on at `date`, as `'+05:30'`.
 *
 * Historical, not current: a March 1944 date in `Asia/Kolkata` answers
 * `+06:30`, which is the war-time offset and the one the API would use. That
 * is the whole point of naming a zone rather than hard-coding an offset.
 *
 * @throws RangeError for an invalid `Date` or an unknown zone.
 */
export function utcOffsetAt(date: Date, timeZone: string): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid Date');
  let name: string | undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    name = parts.find((part) => part.type === 'timeZoneName')?.value;
  } catch {
    // An older ICU without `longOffset` throws on the option rather than
    // ignoring it; the arithmetic below needs nothing but the formatter.
    name = undefined;
  }
  if (name === undefined) return offsetByDifference(date, timeZone);
  // `GMT+05:30`, `GMT-4`, or a bare `GMT` at UTC itself.
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return name === 'GMT' ? '+00:00' : offsetByDifference(date, timeZone);
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  const total = (hours * 60 + minutes) * (match[1] === '-' ? -1 : 1);
  return formatOffset(total);
}
