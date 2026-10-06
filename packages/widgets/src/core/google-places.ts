/**
 * Google Places, for a site that brings its own Google Maps Platform key.
 *
 * Our own `/v1/places` knows every place of 1,000 people or more; Google knows
 * every village. A form's place search uses Google when the page gives it a
 * key (`google-maps-key` on the form, or `googleMapsKey` in the config) and
 * the provider allows it, and moves on (to Photon under `auto`, else to
 * `/v1/places`) when the script does not load or Google refuses the key —
 * with one console warning, never a broken form.
 *
 * Three rules:
 *
 *   1. **Nothing of Google's is bundled.** The Maps JavaScript API is loaded
 *      from Google once per page, and only when a visitor starts a search. A
 *      page that already loaded Maps itself is reused as it is.
 *   2. **The new Places API only.** `AutocompleteSuggestion` and
 *      `Place.fetchFields`, with one `AutocompleteSessionToken` per search
 *      session: the legacy `places.Autocomplete` widget is closed to new
 *      Google customers, and our own dropdown keeps the widget's look.
 *   3. **No timezone from Google.** A pick sets the coordinates and the label
 *      and leaves the zone out, so the API derives the historical zone from
 *      the coordinates (`meta.timezone.source = "derived"`).
 */

import type { Lang } from './i18n.ts';

/** What a pick puts in the form. */
export interface Picked {
  /** The request's `place` label and what the search box then shows. */
  label: string;
  latitude: number;
  longitude: number;
  /** `/v1/places` knows it; Google does not, and it is left to the API. */
  timezone?: string;
}

/** One line in the suggestion list. */
export interface Suggestion {
  text: string;
  /** The coordinates, which Google fetches only for the line picked. */
  pick(): Promise<Picked | null>;
}

/** A search session: the token lives from the first keystroke to the pick. */
export interface SearchSession {
  token?: object;
}

/** As much of `google.maps.places` as the search uses. */
export interface PlacesLibrary {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: Record<string, unknown>): Promise<{
      suggestions: { placePrediction?: Prediction | null }[];
    }>;
  };
  AutocompleteSessionToken: new () => object;
}

interface Prediction {
  text: { text: string };
  toPlace(): GooglePlace;
}

interface GooglePlace {
  location?: { lat(): number; lng(): number } | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  fetchFields(options: { fields: string[] }): Promise<unknown>;
}

interface GoogleWindow {
  google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
  /** Google calls this global when it refuses a key. */
  gm_authFailure?: () => void;
  __kjGoogleMaps?: () => unknown;
}

const SCRIPT_URL = 'https://maps.googleapis.com/maps/api/js';

/** Past this, the built-in search is the better answer than a spinner. */
const LOAD_TIMEOUT_MS = 10_000;

/**
 * Where suggestions are ranked and formatted for. It biases, it does not
 * restrict: a birth in London is still found from an Indian site.
 */
const REGION = 'in';

let library: Promise<PlacesLibrary | null> | null = null;
let failed = false;

/** Stop using Google for this page, and say why once. */
export function googleFailed(reason: unknown): void {
  if (failed) return;
  failed = true;
  console.warn(`Kaal Jyoti: Google Places unavailable (${String(reason)}), searching elsewhere`);
}

/** Tests only: forget the loaded library and any failure. */
export function resetGooglePlaces(): void {
  library = null;
  failed = false;
}

/**
 * The Places library, loading the Maps JavaScript API on the first call, or
 * `null` once Google has failed on this page.
 */
export function loadGooglePlaces(key: string, lang: Lang): Promise<PlacesLibrary | null> {
  if (failed) return Promise.resolve(null);
  library ??= new Promise((resolve) => {
    const w = window as unknown as GoogleWindow;
    let done = false;
    const finish = (lib: PlacesLibrary | null, reason?: string) => {
      if (done) return;
      done = true;
      if (!lib) googleFailed(reason);
      resolve(lib);
    };
    const ready = () =>
      w.google?.maps?.importLibrary?.('places').then(
        (lib) => finish(lib as PlacesLibrary),
        (error: unknown) => finish(null, String(error)),
      );
    if (w.google?.maps?.importLibrary) {
      void ready();
      return;
    }
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => {
      googleFailed('auth');
      previous?.();
    };
    w.__kjGoogleMaps = ready;
    const script = document.createElement('script');
    script.src = `${SCRIPT_URL}?key=${encodeURIComponent(key)}&loading=async&libraries=places&language=${lang}&callback=__kjGoogleMaps`;
    script.async = true;
    script.onerror = () => finish(null, 'script error');
    document.head.append(script);
    setTimeout(() => finish(null, 'timeout'), LOAD_TIMEOUT_MS);
  });
  return library;
}

/** Google's suggestions for `input`; throws when Google refuses. */
export async function googleSuggest(
  lib: PlacesLibrary,
  input: string,
  lang: Lang,
  session: SearchSession,
): Promise<Suggestion[]> {
  session.token ??= new lib.AutocompleteSessionToken();
  const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken: session.token,
    language: lang,
    region: REGION,
  });
  return suggestions.flatMap(({ placePrediction: prediction }) =>
    prediction
      ? [
          {
            text: prediction.text.text,
            async pick() {
              // `fetchFields` ends the session; the next keystroke starts one.
              session.token = undefined;
              const place = prediction.toPlace();
              await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
              const at = place.location;
              if (!at) return null;
              return {
                label: place.formattedAddress || place.displayName || prediction.text.text,
                latitude: at.lat(),
                longitude: at.lng(),
              };
            },
          },
        ]
      : [],
  );
}
