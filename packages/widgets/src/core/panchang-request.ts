/**
 * The one `/v1/panchang` request, shared by `<kj-panchang>` and `<kj-muhurta>`.
 *
 * Decision 4 says two widgets pointed at the same place and day are one call,
 * and decision 11 says the muhurta strip costs nothing extra when a panchang
 * is already on the page. Neither holds unless both elements build a
 * *byte-identical* body: the cache key is the canonical JSON of it, so a
 * `timezone` one element sends and the other does not is two calls. That is
 * why the body is built here and nowhere else.
 *
 * Decision 10 is the other reason this is one function: every request asks for
 * both languages, so a `lang` flip repaints from data that is already in hand.
 */

import { memo, cacheKey } from './cache.ts';
import { request, type KjResponse } from './client.ts';
import { CLIENT_ERROR_CODES, KjError } from './errors.ts';
import { isoDate } from './format.ts';
import { pick, type Labelled, type Lang } from './i18n.ts';
import { findPlace, resolvePlace } from './places.ts';

/** The path, once, so the cache key and the call cannot disagree. */
const PATH = '/panchang';

/** Both languages, in this order, on every request (decision 10). */
const LANGUAGES: readonly ['en', 'hi'] = ['en', 'hi'];

/** Anything with attributes: an element under test does not have to be one. */
export interface AttrReader {
  getAttribute(name: string): string | null;
}

/** A `{ start, end }` pair of wall clocks, or `null` when the day has none. */
export interface KjWindow {
  start?: string | null;
  end?: string | null;
}

/** An id the engine also names, in every language the request asked for. */
export type NamedEntity = Labelled;

/** One of the tithis a civil day can contain (decision: a day may have two). */
export interface TithiEntry {
  index: number;
  name: NamedEntity;
  paksha: NamedEntity;
  /** `null` on the first, which began before sunrise. */
  starts: string | null;
  ends: string | null;
  kshaya: boolean;
  vriddhi: boolean;
}

/** The five limbs, as the engine computes them at local noon. */
export interface PanchangLimbs {
  tithi_index: number;
  tithi_name: NamedEntity;
  nakshatra: NamedEntity | null;
  pada: number | null;
  yoga_name: NamedEntity;
  karana_name: NamedEntity;
  paksha: NamedEntity;
  vara: NamedEntity;
}

/** The lunar month, with the Vikram Samvat year. */
export interface MasaDocument {
  /** The month's own name; a leap month says so in `is_adhik`, not here. */
  month_name: NamedEntity;
  is_adhik: boolean;
  samvat_year: number | null;
  system: string;
}

/** `data` of `POST /v1/panchang`, as far as these two elements read it. */
export interface PanchangDocument {
  at: string;
  panchang: PanchangLimbs | null;
  tithis?: TithiEntry[] | null;
  tithi_ends: string | null;
  nakshatra_ends: string | null;
  yoga_ends: string | null;
  karana_ends: string | null;
  sunrise: string | null;
  sunset: string | null;
  masa: MasaDocument | null;
  disha_shool: string | null;
  rahu_kalam: KjWindow | null;
  yamaganda: KjWindow | null;
  gulika_kalam: KjWindow | null;
  abhijit_muhurta: KjWindow | null;
  brahma_muhurta: KjWindow | null;
  lagna_sign?: NamedEntity | null;
}

/** The request body. Optional members are omitted, never sent as `null`. */
export interface PanchangBody {
  latitude: number;
  longitude: number;
  timezone?: string;
  place?: string;
  date?: string;
  options: { language: readonly ['en', 'hi'] };
}

/** The place attributes both elements share. */
function query(el: AttrReader) {
  return {
    city: el.getAttribute('city'),
    lat: el.getAttribute('lat'),
    lon: el.getAttribute('lon'),
    timezone: el.getAttribute('timezone'),
  };
}

/** Four decimals is about eleven metres — past that it is noise in a label. */
function round(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * The body for this element's attributes, or `null` for its "no place" state.
 *
 * `date` is omitted for a missing attribute, for `today`, and for anything
 * that is not `YYYY-MM-DD` (decision 7): no `date` means today at the place,
 * which is the right answer for a typo too, and it keeps the cache key the
 * same as the neighbouring widget that wrote nothing at all.
 */
export function panchangBody(el: AttrReader): PanchangBody | null {
  const place = resolvePlace(query(el));
  if (!place) return null;

  const body: PanchangBody = {
    latitude: place.latitude,
    longitude: place.longitude,
    options: { language: LANGUAGES },
  };
  if (place.timezone) body.timezone = place.timezone;

  const label = el.getAttribute('place')?.trim() || place.name;
  if (label) body.place = label;

  const date = el.getAttribute('date');
  if (date && date !== 'today' && isoDate(date)) body.date = date;
  return body;
}

/**
 * What to call the place in the header.
 *
 * A `place` attribute is the page's own words and wins; a bundled city knows
 * its own name in both languages; bare coordinates have only themselves.
 */
export function placeLabel(el: AttrReader, lang: Lang): string {
  const given = el.getAttribute('place')?.trim();
  if (given) return given;

  const city = findPlace(el.getAttribute('city'));
  if (city) return pick(city.names, city.name, lang);

  const place = resolvePlace(query(el));
  if (!place) return '';
  return `${round(place.latitude)}, ${round(place.longitude)}`;
}

/**
 * The day's panchang, from the page's one call for this place and day.
 *
 * @throws KjError `no_place` before the network, so an element with neither a
 * city nor coordinates paints its line without spending a call.
 */
export function fetchPanchang(el: AttrReader): Promise<KjResponse<PanchangDocument>> {
  const body = panchangBody(el);
  if (!body) {
    return Promise.reject(
      new KjError(CLIENT_ERROR_CODES.noPlace, 'No city, and no usable lat/lon'),
    );
  }
  return memo(cacheKey(PATH, body), () => request<PanchangDocument>(PATH, body));
}

/** One choghadiya (or hora) of `POST /v1/panchang/muhurta`. */
export interface MuhurtaSlot {
  choghadiya?: string | null;
  good?: boolean | null;
  planet?: NamedEntity | null;
  start: string;
  end: string;
}

/** `data` of `POST /v1/panchang/muhurta` for a place, as far as `<kj-muhurta>` reads it. */
export interface MuhurtaDocument {
  sunrise: string | null;
  sunset: string | null;
  next_sunrise?: string | null;
  abhijit?: KjWindow | null;
  abhijit_applies?: boolean | null;
  rahu_kaal?: KjWindow | null;
  yamaganda?: KjWindow | null;
  gulika_kaal?: KjWindow | null;
  choghadiya?: { day?: MuhurtaSlot[] | null; night?: MuhurtaSlot[] | null } | null;
}

const MUHURTA_PATH = '/panchang/muhurta';

/**
 * The day's choghadiya and windows for a place: the same body as the
 * panchang's, so the two are built one way.
 *
 * @throws KjError `no_place` before the network, like {@link fetchPanchang}.
 */
export function fetchMuhurta(el: AttrReader): Promise<KjResponse<MuhurtaDocument>> {
  const body = panchangBody(el);
  if (!body) {
    return Promise.reject(
      new KjError(CLIENT_ERROR_CODES.noPlace, 'No city, and no usable lat/lon'),
    );
  }
  return memo(cacheKey(MUHURTA_PATH, body), () => request<MuhurtaDocument>(MUHURTA_PATH, body));
}
