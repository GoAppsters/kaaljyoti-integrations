import { describe, expect, it } from 'vitest';
import { findPlace, PLACES, resolvePlace, type Place } from '../src/core/places.ts';

describe('PLACES', () => {
  it('bundles the eight demo cities with both names', () => {
    expect(PLACES).toHaveLength(8);
    for (const place of PLACES) {
      expect(place.names.en).toBe(place.name);
      expect(place.names.hi).not.toBe('');
      expect(place.timezone).toBe('Asia/Kolkata');
    }
  });
});

describe('findPlace', () => {
  it('matches an id, a name and a Hindi name, ignoring case', () => {
    expect(findPlace('delhi')?.id).toBe('delhi');
    expect(findPlace('New Delhi')?.id).toBe('delhi');
    expect(findPlace('  NEW DELHI ')?.id).toBe('delhi');
    expect(findPlace('नई दिल्ली')?.id).toBe('delhi');
    expect(findPlace('BENGALURU')?.id).toBe('bengaluru');
  });

  it('returns null for an unknown or empty city', () => {
    expect(findPlace('Paris')).toBeNull();
    expect(findPlace('')).toBeNull();
    expect(findPlace(null)).toBeNull();
  });
});

describe('resolvePlace', () => {
  it('resolves a city to its bundled coordinates and zone', () => {
    const place = resolvePlace({ city: 'varanasi' }) as Place;
    expect(place.latitude).toBeCloseTo(25.3176);
    expect(place.longitude).toBeCloseTo(82.9739);
    expect(place.timezone).toBe('Asia/Kolkata');
  });

  it('lets explicit coordinates win, from attribute strings', () => {
    const place = resolvePlace({ city: 'delhi', lat: '51.5072', lon: '-0.1276' });
    expect(place).toMatchObject({ latitude: 51.5072, longitude: -0.1276, name: 'New Delhi' });
  });

  it('omits the timezone when none was given, so the API derives it', () => {
    const place = resolvePlace({ lat: 51.5072, lon: -0.1276 });
    expect(place).not.toBeNull();
    expect(place).not.toHaveProperty('timezone');
  });

  it('keeps a timezone that was given', () => {
    expect(resolvePlace({ lat: 51.5, lon: -0.12, timezone: 'Europe/London' })).toMatchObject({
      timezone: 'Europe/London',
    });
  });

  it('is null when there is no place at all', () => {
    expect(resolvePlace({})).toBeNull();
    expect(resolvePlace({ city: 'Atlantis' })).toBeNull();
  });

  it('ignores half a coordinate pair and out-of-range values', () => {
    expect(resolvePlace({ lat: 28.6 })).toBeNull();
    expect(resolvePlace({ lat: 128.6, lon: 77.2 })).toBeNull();
    expect(resolvePlace({ lat: 28.6, lon: 'north' })).toBeNull();
  });
});
