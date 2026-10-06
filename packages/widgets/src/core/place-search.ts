/**
 * The place search under a form's "Other place": a text box, our own
 * suggestion list, and a pick that fills the coordinates below it.
 *
 * Where it looks is the form's `place-provider` (else the configured one):
 *
 *   - `auto`, the default: Google Places when the site gave a Google Maps key
 *     (`google-places.ts`), else Photon over OpenStreetMap (`photon.ts`);
 *   - `google` or `photon`: that one only;
 *   - `kaaljyoti`: `GET /v1/places` only — every place of 1,000 people or
 *     more, with its zone, and no third party asked anything.
 *
 * Whichever fails on the page (a refused key, an error, a timeout) is dropped
 * for the rest of it with one console warning — Google to Photon under
 * `auto`, and anything to `/v1/places` — so a search always has an answer.
 * The latitude and longitude fields stay editable either way, so a visitor
 * who knows their coordinates, or whose village no search finds, can type
 * them.
 *
 * The listeners are delegated to the shadow root, like the forms' own, and
 * everything is scoped to one `[data-coords]` block, so the match form's two
 * searches never read each other's fields.
 */

import { cacheKey, memo } from './cache.ts';
import { request } from './client.ts';
import { getConfig, parsePlaceProvider } from './config.ts';
import { esc } from './html.ts';
import type { SearchSession, Suggestion } from './google-places.ts';
import { t, type Lang } from './i18n.ts';
import { photonDown, photonFailed, photonSearch, TIMEOUT_MS } from './photon.ts';

/** `/v1/places` answers from the third character; Google and Photon are asked the same. */
const MIN_CHARS = 3;

/** A pause in typing, so a search is one call and not one per key. */
const DEBOUNCE_MS = 300;

/** The API's limit on the request's `place` label. */
const LABEL_MAX = 120;

/** One `GET /v1/places` hit, as far as the search reads it. */
interface PlaceHit {
  name: string;
  region?: string;
  country_name?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface SearchState {
  timer?: ReturnType<typeof setTimeout>;
  /** Which search is current, so a slow answer cannot replace a newer one. */
  run: number;
  items: Suggestion[];
  active: number;
  session: SearchSession;
  /** The Photon request in flight, aborted when the visitor types on. */
  abort?: AbortController;
}

const states = new WeakMap<Element, SearchState>();

function stateOf(input: Element): SearchState {
  let state = states.get(input);
  if (!state) states.set(input, (state = { run: 0, items: [], active: -1, session: {} }));
  return state;
}

/** `/v1/places`, memoised: the same letters typed twice are one call. */
async function ourSuggest(q: string, lang: Lang): Promise<Suggestion[]> {
  const query = { q, language: lang, limit: '8' };
  const answer = await memo(cacheKey('/places', query), () =>
    request<{ places: PlaceHit[] }>('/places', null, { query }),
  );
  return answer.data.places.map((hit) => {
    const label = [hit.name, hit.region, hit.country_name].filter(Boolean).join(', ');
    return {
      text: label,
      pick: async () => ({
        label,
        latitude: hit.latitude,
        longitude: hit.longitude,
        timezone: hit.timezone,
      }),
    };
  });
}

/** Put what a place is made of into its `[data-coords]` block. */
function setPlace(scope: Element, values: Record<string, string | number>): void {
  for (const name in values) {
    const field = scope.querySelector<HTMLInputElement>(`[data-field="${name}"]`);
    if (field) field.value = String(values[name]);
  }
}

/**
 * Wire the search into a form's shadow root.
 *
 * `host` is the form element, whose `place-provider`, `google-maps-key` and
 * `photon-url` attributes win over the configured ones; `lang` is its
 * language at the time of each search.
 */
export function wirePlaceSearch(root: ShadowRoot, host: Element, lang: () => Lang): void {
  const listOf = (q: Element) => q.parentElement?.querySelector<HTMLElement>('[data-suggest]');

  const show = (q: HTMLInputElement, items: Suggestion[] | null, credit?: 'google' | 'osm') => {
    const state = stateOf(q);
    const list = listOf(q);
    state.items = items ?? [];
    state.active = -1;
    if (!list) return;
    list.innerHTML = items
      ? (items
          .map((item, i) => `<li role="option" data-i="${i}">${esc(item.text)}</li>`)
          .join('') || `<li class="kj-muted">${esc(t(lang(), 'no_places'))}</li>`) +
        // Google Maps Platform's attribution: the words, unstyled and
        // untranslated, in the same box as the suggestions.
        (credit === 'google' ? '<li class="kj-gm" role="presentation">Google Maps</li>' : '') +
        // OpenStreetMap's (ODbL), under the places it found.
        (credit === 'osm' && items.length
          ? `<li class="kj-osm" role="presentation"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${esc(t(lang(), 'osm_credit'))}</a></li>`
          : '')
      : '';
    list.hidden = !items;
    q.setAttribute('aria-expanded', String(!!items));
  };

  const search = async (q: HTMLInputElement, text: string) => {
    const state = stateOf(q);
    const run = ++state.run;
    const language = lang();
    const config = getConfig();
    const provider =
      parsePlaceProvider(host.getAttribute('place-provider')) ?? config.placeProvider;
    const key = host.getAttribute('google-maps-key') || config.googleMapsKey;
    let items: Suggestion[] | undefined;
    let credit: 'google' | 'osm' | undefined;
    try {
      // Only a site with a Google Maps key downloads the Google code: it is
      // its own chunk, imported on the first search (decision 24).
      const google =
        key && (provider === 'auto' || provider === 'google')
          ? await import('./google-places.ts')
          : null;
      const lib = google ? await google.loadGooglePlaces(key!, language) : null;
      if (google && lib) {
        try {
          items = await google.googleSuggest(lib, text, language, state.session);
          credit = 'google';
        } catch (error) {
          google.googleFailed(error);
        }
      }
      if (!items && (provider === 'auto' || provider === 'photon') && !photonDown()) {
        const controller = (state.abort = new AbortController());
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          items = await photonSearch(
            host.getAttribute('photon-url') || config.photonUrl,
            text,
            controller.signal,
          );
          credit = 'osm';
        } catch (error) {
          // Aborted by newer letters: that search answers, not this one.
          if (run !== state.run) return;
          photonFailed(controller.signal.aborted ? 'timeout' : error);
        } finally {
          clearTimeout(timer);
        }
      }
      items ??= await ourSuggest(text, language);
    } catch {
      // A failed search is the same line as no match: the coordinates are
      // right there, and the form must keep working.
      items = [];
    }
    if (run === state.run) show(q, items, credit);
  };

  const pick = async (q: HTMLInputElement, index: number) => {
    const state = stateOf(q);
    const item = state.items[index];
    const scope = q.closest('[data-coords]');
    if (!item || !scope) return;
    show(q, null);
    q.value = item.text;
    const run = ++state.run;
    let picked = null;
    try {
      picked = await item.pick();
    } catch {
      // Google answered the list and then refused the details: say so the
      // way a search that found nothing does.
    }
    if (run !== state.run) return;
    if (!picked) {
      show(q, []);
      return;
    }
    q.value = picked.label;
    setPlace(scope, {
      lat: picked.latitude,
      lon: picked.longitude,
      tz: picked.timezone ?? '',
      label: picked.label.slice(0, LABEL_MAX),
    });
    // The forms read their fields on `input`; from the block, not the search
    // box, so it does not start another search.
    scope.dispatchEvent(new Event('input', { bubbles: true }));
  };

  root.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    const field = target.dataset?.field;
    const scope = target.closest?.('[data-coords]');
    if (!scope) return;
    if (field === 'q') {
      // New letters undo the last pick: what is submitted is what was picked.
      setPlace(scope, { lat: '', lon: '', tz: '', label: '' });
      const state = stateOf(target);
      clearTimeout(state.timer);
      state.abort?.abort();
      state.run++;
      const text = target.value.trim();
      if (text.length < MIN_CHARS) show(target, null);
      else state.timer = setTimeout(() => void search(target, text), DEBOUNCE_MS);
    } else if (field === 'lat' || field === 'lon') {
      // Typed coordinates are no longer the picked place: its zone and its
      // name go, and the API derives the zone from what was typed.
      setPlace(scope, { tz: '', label: '' });
    }
  });

  // A pick on `mousedown`, which is also what keeps the focus in the box.
  root.addEventListener('mousedown', (event) => {
    const option = (event.target as Element).closest?.<HTMLElement>('[data-suggest] > *');
    if (!option) return;
    event.preventDefault();
    const q =
      option.parentElement?.parentElement?.querySelector<HTMLInputElement>('[data-field="q"]');
    if (q && option.dataset.i) void pick(q, Number(option.dataset.i));
  });

  root.addEventListener('keydown', (event) => {
    const q = event.target as HTMLInputElement;
    const list = q.dataset?.field === 'q' ? listOf(q) : null;
    if (!list || list.hidden) return;
    const state = stateOf(q);
    const { key } = event as KeyboardEvent;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const count = state.items.length;
      if (!count) return;
      state.active = (state.active + (key === 'ArrowDown' ? 1 : count - 1)) % count;
      list.querySelectorAll('[data-i]').forEach((option, i) => {
        option.setAttribute('aria-selected', String(i === state.active));
      });
    } else if (key === 'Enter' && state.active >= 0) {
      // A pick, not a submit.
      event.preventDefault();
      void pick(q, state.active);
    } else if (key === 'Escape') {
      show(q, null);
    }
  });

  root.addEventListener('focusout', (event) => {
    const q = event.target as HTMLInputElement;
    if (q.dataset?.field === 'q') show(q, null);
  });
}
