import { describe, expect, it } from 'vitest';
import { clock, dateLabel, formatDegrees, isoDate, shortDate, window } from '../src/core/format.ts';
import panchang from './fixtures/panchang.json';

const day = panchang.data;

describe('clock', () => {
  it('slices a wall clock rather than parsing it', () => {
    expect(clock(day.sunrise, 'en')).toBe('06:13');
    expect(clock(day.sunset, 'en')).toBe('18:14');
  });

  it('does not move with the reader’s zone', () => {
    // The proof that nothing here builds a Date: an offset in the string
    // would be sliced away, not applied.
    expect(clock('2026-09-22T06:13:13.728', 'hi')).toBe('06:13');
  });

  it('renders a dash for a missing time', () => {
    expect(clock(null, 'en')).toBe('—');
    expect(clock(undefined, 'hi')).toBe('—');
    expect(clock('2026-09-22', 'en')).toBe('—');
  });
});

describe('window', () => {
  it('joins a start and an end', () => {
    expect(window(day.rahu_kalam, 'en')).toBe('15:14–16:44');
    expect(window(day.brahma_muhurta, 'hi')).toBe('04:37–05:25');
  });

  it('renders a dash for a missing window', () => {
    expect(window(null, 'en')).toBe('—');
  });
});

describe('isoDate', () => {
  it('accepts a plain YYYY-MM-DD', () => {
    expect(isoDate('2026-09-22')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isoDate('today')).toBe(false);
    expect(isoDate('2026-9-2')).toBe(false);
    expect(isoDate('2026-13-01')).toBe(false);
    expect(isoDate('2026-09-32')).toBe(false);
    expect(isoDate('2026-09-22T06:13:13.728')).toBe(false);
    expect(isoDate(null)).toBe(false);
  });
});

describe('dateLabel', () => {
  it('reads the date half of a wall clock', () => {
    expect(dateLabel('2026-09-22', 'en')).toBe('22 Sep 2026');
    expect(dateLabel('2026-09-22', 'hi')).toBe('22 सितंबर 2026');
    expect(dateLabel(day.sunrise, 'en')).toBe('22 Sep 2026');
  });

  it('drops the leading zero on the day', () => {
    expect(dateLabel('2026-01-05', 'en')).toBe('5 Jan 2026');
  });

  it('renders a dash for nothing usable', () => {
    expect(dateLabel(null, 'en')).toBe('—');
    expect(dateLabel('2026-99-01', 'en')).toBe('—');
  });
});

describe('formatDegrees', () => {
  it('passes a DMS string through', () => {
    expect(formatDegrees('229°54\'19.9"')).toBe('229°54\'19.9"');
    expect(formatDegrees(null)).toBe('—');
  });
});

describe('shortDate', () => {
  it('is dateLabel without the year', () => {
    expect(shortDate('2026-10-31T10:16', 'en')).toBe('31 Oct');
    expect(shortDate('2026-10-31', 'hi')).toBe('31 अक्तूबर');
    expect(shortDate(null, 'en')).toBe('—');
  });
});
