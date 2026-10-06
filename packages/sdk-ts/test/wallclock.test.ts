/**
 * The cases here are the ones the docs' time-zone page names, because those
 * are the ones a wrong helper would get wrong quietly: a DST boundary, a
 * zone that is not a whole number of hours from UTC, and India's war time.
 */

import { describe, expect, it } from 'vitest';
import { fromWallClock, toWallClock, utcOffsetAt } from '../src/wallclock.ts';

describe('toWallClock', () => {
  it('reads a birth in Asia/Kolkata as the certificate would', () => {
    // The half-hour offset is the whole reason not to trust `toISOString()`.
    expect(toWallClock(new Date('1990-05-14T05:00:00Z'), 'Asia/Kolkata')).toBe(
      '1990-05-14T10:30:00',
    );
  });

  it('is the identity in UTC', () => {
    expect(toWallClock(new Date('2026-09-22T14:05:09Z'), 'UTC')).toBe('2026-09-22T14:05:09');
  });

  it('writes local midnight as 00, not 24', () => {
    expect(toWallClock(new Date('2026-09-21T18:30:00Z'), 'Asia/Kolkata')).toBe(
      '2026-09-22T00:00:00',
    );
  });

  it('crosses a New York DST boundary in both directions', () => {
    // 2026-03-08 07:00Z is 02:00 EST, the instant the clocks jump to 03:00.
    expect(toWallClock(new Date('2026-03-08T06:59:00Z'), 'America/New_York')).toBe(
      '2026-03-08T01:59:00',
    );
    expect(toWallClock(new Date('2026-03-08T07:00:00Z'), 'America/New_York')).toBe(
      '2026-03-08T03:00:00',
    );
    // And back: 2026-11-01 05:59Z is 01:59 EDT, 06:00Z is 01:00 EST again.
    expect(toWallClock(new Date('2026-11-01T05:59:00Z'), 'America/New_York')).toBe(
      '2026-11-01T01:59:00',
    );
    expect(toWallClock(new Date('2026-11-01T06:00:00Z'), 'America/New_York')).toBe(
      '2026-11-01T01:00:00',
    );
  });

  it('follows Europe/London off UTC in summer', () => {
    expect(toWallClock(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe(
      '2026-01-15T12:00:00',
    );
    expect(toWallClock(new Date('2026-07-15T12:00:00Z'), 'Europe/London')).toBe(
      '2026-07-15T13:00:00',
    );
  });

  it('refuses an invalid Date rather than inventing one', () => {
    expect(() => toWallClock(new Date('nonsense'), 'UTC')).toThrow(RangeError);
  });
});

describe('utcOffsetAt', () => {
  it('answers the historical offset, not today’s', () => {
    // The docs' own example: a Delhi birth in 1944 was on war time.
    expect(utcOffsetAt(new Date('1944-03-15T04:30:00Z'), 'Asia/Kolkata')).toBe('+06:30');
    expect(utcOffsetAt(new Date('1990-05-14T05:00:00Z'), 'Asia/Kolkata')).toBe('+05:30');
  });

  it('follows New York across the DST boundary', () => {
    expect(utcOffsetAt(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe('-05:00');
    expect(utcOffsetAt(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe('-04:00');
  });

  it('follows London across the same boundary', () => {
    expect(utcOffsetAt(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe('+00:00');
    expect(utcOffsetAt(new Date('2026-07-15T12:00:00Z'), 'Europe/London')).toBe('+01:00');
  });

  it('answers +00:00 for UTC itself', () => {
    expect(utcOffsetAt(new Date('2026-09-22T00:00:00Z'), 'UTC')).toBe('+00:00');
  });

  it('refuses an invalid Date', () => {
    expect(() => utcOffsetAt(new Date('nonsense'), 'UTC')).toThrow(RangeError);
  });
});

describe('fromWallClock', () => {
  it('turns a wall clock and an offset back into the instant', () => {
    expect(fromWallClock('1990-05-14T10:30:00', '+05:30').toISOString()).toBe(
      '1990-05-14T05:00:00.000Z',
    );
    expect(fromWallClock('2026-07-15T08:00:00', '-04:00').toISOString()).toBe(
      '2026-07-15T12:00:00.000Z',
    );
  });

  it('refuses anything that is not a wall clock or not an offset', () => {
    expect(() => fromWallClock('1990-05-14 10:30:00', '+05:30')).toThrow(RangeError);
    expect(() => fromWallClock('1990-05-14T10:30:00Z', '+05:30')).toThrow(RangeError);
    expect(() => fromWallClock('1990-05-14T10:30:00', '+0530')).toThrow(RangeError);
    expect(() => fromWallClock('1990-05-14T10:30:00', 'Asia/Kolkata')).toThrow(RangeError);
    expect(() => fromWallClock('1990-02-31T10:30:00', '+05:30')).not.toThrow();
  });
});

describe('round trip', () => {
  it.each([
    ['Asia/Kolkata', '1990-05-14T05:00:00Z'],
    ['Asia/Kolkata', '1944-03-15T04:30:00Z'],
    ['America/New_York', '2026-01-15T12:00:00Z'],
    ['America/New_York', '2026-07-15T12:00:00Z'],
    ['Europe/London', '2026-07-15T12:00:00Z'],
    ['Europe/London', '2026-01-15T12:00:00Z'],
    ['UTC', '2026-09-22T14:05:09Z'],
    ['Australia/Eucla', '2026-09-22T14:05:09Z'],
    ['Pacific/Kiritimati', '2026-09-22T14:05:09Z'],
  ])('%s at %s survives a there-and-back', (zone, iso) => {
    const instant = new Date(iso);
    const wall = toWallClock(instant, zone);
    const offset = utcOffsetAt(instant, zone);
    expect(fromWallClock(wall, offset).getTime()).toBe(instant.getTime());
  });
});
