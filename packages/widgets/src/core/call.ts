/**
 * Which way a request goes: straight to the API with the page's publishable
 * key, or through the site's own proxy (design decision 23).
 *
 * The API closes a few routes to publishable keys (`pubAllowed: false` in
 * the gateway): the transit scan (and the PDFs, which `pdf-offer.ts` sends).
 * A widget built on one asks the site's proxy — `proxy` on the element,
 * `data-proxy` on the script, `configure({ proxyUrl })` — and without one it
 * paints the "needs a server proxy" state and sends nothing.
 *
 * The two months (`/v1/panchang/month`, `/v1/ephemeris/month`) are open to
 * publishable keys since 2 October 2026 (heavy: ten a minute, 20 credits
 * each). They go direct, but through the proxy when the page has one: the
 * WordPress plugin keeps a month for hours, which saves the site's credits.
 *
 * Every other route goes direct, unless `proxyAll` says the page has no key.
 */

import { cacheKey, memo } from './cache.ts';
import { request, type KjRequestInit, type KjResponse } from './client.ts';
import { getConfig, safeProxyUrl } from './config.ts';
import { CLIENT_ERROR_CODES, KjError } from './errors.ts';

/** The routes a publishable key may not call; the API's `pubAllowed: false`. */
export const SERVER_ONLY: ReadonlySet<string> = new Set(['/transit/scan']);

/** Routes that go through the page's proxy when it has one, and direct when not. */
export const PROXY_PREFERRED: ReadonlySet<string> = new Set([
  '/panchang/month',
  '/ephemeris/month',
]);

/** The proxy this element uses: its `proxy` attribute, else the page's. */
export function proxyOf(el: Element | null | undefined): string | undefined {
  return safeProxyUrl(el?.getAttribute('proxy')) ?? getConfig().proxyUrl;
}

/**
 * `request()`, memoised per page (decision 4), sent through the proxy when
 * the route needs one or prefers one and the page has one.
 *
 * @throws KjError `proxy_required` before the network for a server-only
 * route with no proxy.
 */
export function call<T>(
  el: Element | null | undefined,
  path: string,
  body: unknown,
  init: KjRequestInit = {},
): Promise<KjResponse<T>> {
  const serverOnly = SERVER_ONLY.has(path);
  const proxy = serverOnly || PROXY_PREFERRED.has(path) ? proxyOf(el) : undefined;
  if (serverOnly && !proxy) {
    return Promise.reject(
      new KjError(CLIENT_ERROR_CODES.proxyRequired, `${path} needs a server proxy`),
    );
  }
  const key = cacheKey(init.accept ? `${path}#${init.accept}` : path, body);
  return memo(key, () => request<T>(path, body, proxy ? { ...init, proxy } : init));
}
