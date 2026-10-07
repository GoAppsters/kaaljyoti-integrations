# Changelog

## 0.2.5

- No copy of the date range: the varshphal `year` and the month attributes are checked for shape
  only, and which dates are answered is the API's supported range (published on `/v1/health`, from
  its ephemeris data). A date outside it shows the API's message naming the range, instead of being
  silently replaced. The API now answers from 1 April 1550 to 31 December 2400.

## 0.2.4

- `data-pricing-url="off"` and `data-proxy-docs="off"` (or `pricing-url` / `proxy-docs` on an
  element) leave the site owner's line out of the monthly-limit, plan and "needs a server
  connection" cards, so they link nowhere. The WordPress plugin sets both unless the site owner gave
  a link of their own, so no public page links kaaljyoti.com unasked.

## 0.2.3

- **Changed:** the "Powered by Kaal Jyoti" line is opt-in on every plan. It shows only where a page
  asks for it — `data-powered-by="shown"` on the script tag, or `powered-by="shown"` on an element —
  and is left out otherwise. It used to show by default, and `hidden` was honoured only on the
  Growth plan and above. `data-credit="opt-in"` is no longer needed and is ignored.
- The npm package's repository URL names `GoAppsters/kaaljyoti-integrations` as GitHub spells it,
  which npm's provenance check requires. (0.2.2 was published to the CDN only, for that reason.)

## 0.2.2

- When a request with a publishable key cannot reach the API, the widget names the page's origin:
  "Could not reach Kaal Jyoti. Is https://… on the key?". The usual cause is an origin missing from
  the key, and on some hosts the page's origin is not the site's own address (a Wix Embed HTML
  element runs on `https://<id>.filesusr.com`). Requests that all go through the site's proxy keep
  the plain line. The page size budget is now 42 KB gzipped (was 40).

## 0.2.1

The first release on npm; `cdn.kaaljyoti.com/widgets/v1.js` moves to it from 0.2.0.

- `data-credit="opt-in"` on the script tag makes the "Powered by Kaal Jyoti" line opt-in: it shows
  only where `data-powered-by="shown"` or a `powered-by="shown"` attribute asks for it. The
  WordPress plugin sets it. Without the attribute nothing changes.

## 0.2.0

On the CDN only: twenty-two widgets loaded on demand by one script tag, the design system (modes,
presets, fonts, sign-icon themes), the place search, the tabbed kundli report, the server proxy and
PDF downloads, and credits.
