/**
 * The two month fixtures are staging recordings (2 October 2026, engine
 * 0.14.2): October 2026 at New Delhi, the ephemeris sidereal, recorded with
 * the publishable key once the month routes opened to it. Until then they
 * were composed from the open daily routes. This test holds them to the
 * routes' shape: the keys of the generated response
 * types in `kaaljyoti-api/packages/schemas/src/generated/responses/`
 * (`panchang_month.ts`, `ephemeris_month.ts`, engine 0.14.2), with the
 * gateway's labels where it adds them (`lib/labels.ts`).
 */
import { describe, expect, it } from 'vitest';
import panchangMonth from './fixtures/panchang-month.json';
import ephemerisMonth from './fixtures/ephemeris-month.json';

const keys = (value: unknown) => Object.keys(value as object).sort();
const isLabel = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { id?: unknown }).id === 'string' &&
  typeof (value as { names?: { hi?: unknown } }).names?.hi === 'string';

describe('the month fixtures match the generated response types', () => {
  it('panchang_month: days of the generated shape, names labelled', () => {
    const data = panchangMonth.data;
    expect(keys(data)).toEqual(['days', 'month']);
    expect(data.days).toHaveLength(31);
    for (const day of data.days) {
      expect(keys(day)).toEqual(
        [
          'date',
          'karanas',
          'masa',
          'nakshatras',
          'next_sunrise',
          'sunrise',
          'sunset',
          'tithis',
          'vara',
          'vara_index',
          'yogas',
        ].sort(),
      );
      expect(keys(day.masa)).toEqual(['amanta', 'purnimanta']);
      for (const masa of [day.masa.amanta, day.masa.purnimanta]) {
        expect(keys(masa)).toEqual(
          ['is_adhik', 'month_index', 'month_name', 'samvat_year', 'system'].sort(),
        );
        expect(isLabel(masa.month_name)).toBe(true);
      }
      for (const tithi of day.tithis) {
        expect(keys(tithi)).toEqual(
          ['ends', 'index', 'kshaya', 'name', 'paksha', 'starts', 'vriddhi'].sort(),
        );
        expect(isLabel(tithi.name) && isLabel(tithi.paksha)).toBe(true);
      }
      for (const entry of day.nakshatras) {
        expect(keys(entry)).toEqual(['ends', 'index', 'nakshatra', 'starts']);
        expect(isLabel(entry.nakshatra)).toBe(true);
      }
      for (const entry of [...day.yogas, ...day.karanas]) {
        expect(keys(entry)).toEqual(['ends', 'index', 'name', 'starts']);
      }
      expect(isLabel(day.vara)).toBe(true);
    }
  });

  it('ephemeris_month: the sidereal table, a row a day, events labelled', () => {
    const data = ephemerisMonth.data;
    expect(keys(data)).toEqual(['nirayan']);
    const table = data.nirayan;
    expect(keys(table)).toEqual(
      ['ayanamsa_id', 'ayanamsa_on_first', 'days', 'events', 'month', 'system', 'year'].sort(),
    );
    expect(table.system).toBe('nirayan');
    expect(table.days).toHaveLength(31);
    for (const day of table.days) {
      expect(keys(day)).toEqual(['ascendant', 'ascendant_dms', 'day', 'positions']);
      for (const position of Object.values(day.positions)) {
        expect(keys(position)).toEqual(['latitude', 'longitude', 'longitude_dms', 'speed']);
      }
    }
    for (const event of table.events) {
      expect(keys(event)).toEqual(['day', 'kind', 'planet', 'sign']);
      expect(['ingress', 'station_retrograde', 'station_direct']).toContain(event.kind);
      expect(isLabel(event.planet)).toBe(true);
    }
  });
});
