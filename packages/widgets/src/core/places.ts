/**
 * The eight cities a `city="…"` attribute can name (design decision 8).
 *
 * The same list the landing-page demo uses, plus the Hindi names, which the
 * demo does not need and a `<kj-kundli-form lang="hi">` does. It is bundled
 * rather than fetched because a widget must be able to paint without a second
 * round trip, and because eight cities is under a kilobyte. The 500-city list
 * and `GET /v1/places` are a later minor, with this same shape.
 *
 * Every entry carries its zone even though all eight are `Asia/Kolkata`
 * today: the request sends `timezone` so the API does not have to derive it,
 * and a ninth city may not be in India.
 */

/** A bundled city. */
export interface Place {
  id: string;
  /** English, and what goes in the request's `place` field. */
  name: string;
  names: { en: string; hi: string };
  latitude: number;
  longitude: number;
  /** IANA zone. */
  timezone: string;
}

/**
 * A place an element resolved: either a bundled {@link Place} or the raw
 * coordinates someone put on the element.
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
  /** Omitted for manual entry, so the API derives it from the coordinates. */
  timezone?: string;
  /** Only for the `place` label in the request; the API does not need it. */
  name?: string;
}

/** What an element knows about where it is pointed. */
export interface PlaceQuery {
  city?: string | null;
  lat?: string | number | null;
  lon?: string | number | null;
  timezone?: string | null;
}

/** @see Place */
export const PLACES: readonly Place[] = [
  {
    id: 'delhi',
    name: 'New Delhi',
    names: { en: 'New Delhi', hi: 'नई दिल्ली' },
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    names: { en: 'Mumbai', hi: 'मुंबई' },
    latitude: 19.076,
    longitude: 72.8777,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'kolkata',
    name: 'Kolkata',
    names: { en: 'Kolkata', hi: 'कोलकाता' },
    latitude: 22.5726,
    longitude: 88.3639,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'chennai',
    name: 'Chennai',
    names: { en: 'Chennai', hi: 'चेन्नई' },
    latitude: 13.0827,
    longitude: 80.2707,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    names: { en: 'Bengaluru', hi: 'बेंगलुरु' },
    latitude: 12.9716,
    longitude: 77.5946,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    names: { en: 'Hyderabad', hi: 'हैदराबाद' },
    latitude: 17.385,
    longitude: 78.4867,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'jaipur',
    name: 'Jaipur',
    names: { en: 'Jaipur', hi: 'जयपुर' },
    latitude: 26.9124,
    longitude: 75.7873,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'varanasi',
    name: 'Varanasi',
    names: { en: 'Varanasi', hi: 'वाराणसी' },
    latitude: 25.3176,
    longitude: 82.9739,
    timezone: 'Asia/Kolkata',
  },
];

/**
 * A city by id or by name, in either language, case-insensitively.
 *
 * `delhi` is the id and `New Delhi` is the name, so both spellings a page is
 * likely to write already resolve without an alias table.
 */
export function findPlace(city: string | null | undefined): Place | null {
  if (!city) return null;
  const needle = city.trim().toLowerCase();
  if (!needle) return null;
  return (
    PLACES.find(
      (place) =>
        place.id === needle ||
        place.name.toLowerCase() === needle ||
        place.names.en.toLowerCase() === needle ||
        place.names.hi === city.trim(),
    ) ?? null
  );
}

/** A finite number in range, out of an attribute string or a number. */
function coordinate(raw: string | number | null | undefined, limit: number): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

/**
 * Where an element should compute for, or `null` for its "no place" state.
 *
 * Coordinates win over a city, because they are the more specific thing to
 * have written; a `city` given alongside them still supplies the `place`
 * label, which is the only part of it coordinates cannot replace.
 */
export function resolvePlace(query: PlaceQuery): Place | Coordinates | null {
  const city = findPlace(query.city);
  const latitude = coordinate(query.lat, 90);
  const longitude = coordinate(query.lon, 180);

  if (latitude !== null && longitude !== null) {
    const resolved: Coordinates = { latitude, longitude };
    const timezone = query.timezone?.trim();
    if (timezone) resolved.timezone = timezone;
    if (city) resolved.name = city.name;
    return resolved;
  }

  return city;
}
