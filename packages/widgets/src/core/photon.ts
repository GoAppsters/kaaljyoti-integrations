/**
 * Photon, komoot's geocoder over OpenStreetMap: the forms' place search when
 * a site has no Google Maps key. It is free, needs no key, is built for
 * search-as-you-type, and knows villages that `/v1/places` (1,000 people or
 * more) does not. Nominatim is not an option: its usage policy forbids
 * autocomplete on the public server.
 *
 * The public server (`https://photon.komoot.io`) is a free service run by
 * komoot, so the search is a good citizen of it:
 *
 *   - one request per pause in typing, from the third letter (the debounce
 *     and the minimum live in `place-search.ts`), with the one in flight
 *     aborted when the visitor types on;
 *   - no prefetching and no retries: an error, a throttle or no answer inside
 *     {@link TIMEOUT_MS} ends Photon for the page, with one console warning,
 *     and the search goes on with `/v1/places`;
 *   - the same letters typed twice are one request.
 *
 * `photon-url` points a page at a self-hosted Photon instead.
 *
 * OpenStreetMap's data is ODbL: the suggestion list credits
 * "© OpenStreetMap contributors", linked to its copyright page.
 *
 * Like a Google pick, a Photon pick carries no timezone: the API derives the
 * historical zone from the coordinates.
 */

import type { Suggestion } from './google-places.ts';

// Kept in `config.ts`, which every chunk needs, so that importing the default
// does not pull the search itself into pages without a form.
export { PHOTON_URL } from './config.ts';

/** Past this the visitor is better served by `/v1/places` than a spinner. */
export const TIMEOUT_MS = 4000;

/**
 * Populated places only: `osm_tag=place` asks for them, and the ones no one
 * is born "in" as a place of birth (a country, a state) are dropped here.
 */
const TOO_BIG = /^(country|state|region|province|continent|archipelago|ocean|sea)$/;

interface Feature {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    /** The district, in India. */
    county?: string;
    state?: string;
    country?: string;
    osm_value?: string;
  };
}

let failed = false;
const answers = new Map<string, Promise<Suggestion[]>>();

/** Stop using Photon for this page, and say why once. */
export function photonFailed(reason: unknown): void {
  if (failed) return;
  failed = true;
  console.warn(`Kaal Jyoti: Photon unavailable (${String(reason)}), using /v1/places`);
}

/** Whether Photon has failed on this page. */
export function photonDown(): boolean {
  return failed;
}

/** Tests only: forget the answers and any failure. */
export function resetPhoton(): void {
  failed = false;
  answers.clear();
}

/** Parts of a place, each once: "Delhi, Delhi, India" is "Delhi, India". */
function join(...parts: (string | undefined)[]): string {
  return parts.filter((part, i) => part && parts.indexOf(part) === i).join(', ');
}

/**
 * Photon's places for `q`. Rejects on an error, a non-JSON answer or `signal`
 * aborting; the caller decides whether that ends Photon.
 *
 * A line in the list names the district too, since two villages of one name
 * in one state are common; the label a pick sends is "name, state, country".
 */
export function photonSearch(base: string, q: string, signal: AbortSignal): Promise<Suggestion[]> {
  // `lang=en`: the public server has names in only a few languages, and
  // falls back to the local name where there is no English one. No `lat` or
  // `lon`: a bias would bury a birth abroad under Indian namesakes.
  const url = `${base.replace(/\/+$/, '')}/api/?${new URLSearchParams({ q, limit: '8', lang: 'en', osm_tag: 'place' })}`;
  let answer = answers.get(url);
  if (!answer) {
    answer = fetch(url, { signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ features?: Feature[] }>;
      })
      .then(({ features }) => {
        const items: Suggestion[] = [];
        for (const { geometry, properties: p } of features ?? []) {
          const [longitude, latitude] = geometry?.coordinates ?? [];
          if (!p?.name || TOO_BIG.test(p.osm_value ?? '') || latitude == null) continue;
          const text = join(p.name, p.county, p.state, p.country);
          const picked = {
            label: join(p.name, p.state, p.country),
            latitude,
            longitude: longitude!,
          };
          if (!items.some((item) => item.text === text))
            items.push({ text, pick: async () => picked });
        }
        return items;
      });
    answers.set(url, answer);
    // A failure is not an answer: the same letters may be asked again.
    answer.catch(() => answers.delete(url));
  }
  return answer;
}
