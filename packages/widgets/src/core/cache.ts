/**
 * One call per distinct request per page load (design decision 4).
 *
 * A page with `<kj-panchang city="delhi">` and `<kj-muhurta city="delhi">` on
 * it asks for the same document twice, within a millisecond of each other and
 * therefore before either answer exists. A plain result cache does not help:
 * the second element has to find the *in-flight* promise, not a stored value.
 * So the map holds promises, and the second caller awaits the first one's.
 *
 * It lives for one page load. A widget that wanted a fresher answer than that
 * would be asking for a different day, which is a different key.
 */

const inFlight = new Map<string, Promise<unknown>>();

/**
 * JSON with every object's keys in a stable order.
 *
 * `{ latitude, longitude }` and `{ longitude, latitude }` are the same
 * request, and two elements written by two people will not agree on the
 * order, so `JSON.stringify` alone would miss the match. Arrays keep their
 * order, which is significant everywhere the API takes one
 * (`options.language: ['en','hi']`).
 */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(',')}}`;
}

/** The identity of a request: where it goes and what it says. */
export function cacheKey(path: string, body: unknown): string {
  return `${path} ${canonical(body)}`;
}

/**
 * `fn()`'s promise, shared by everyone who asks for the same key.
 *
 * A rejected promise is evicted, because the widget renders a retry and a
 * cached failure would make that button a no-op for the rest of the page's
 * life.
 */
export function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const started = fn();
  inFlight.set(key, started);
  started.catch(() => {
    if (inFlight.get(key) === started) inFlight.delete(key);
  });
  return started;
}

/** Drop everything. Tests use it between cases. */
export function clearCache(): void {
  inFlight.clear();
}
