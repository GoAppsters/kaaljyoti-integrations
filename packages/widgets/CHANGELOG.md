# Changelog

## 0.2.2

- When a request with a publishable key cannot reach the API, the widget
  names the page's origin: "Could not reach Kaal Jyoti. If this site is new,
  check that your key's allowed origins include https://…". The usual cause
  is an origin missing from the key, and on some hosts the page's origin is
  not the site's own address (a Wix Embed HTML element runs on
  `https://<id>.filesusr.com`). Requests that all go through the site's proxy
  keep the plain line.

## 0.2.1

The first release on npm; `cdn.kaaljyoti.com/widgets/v1.js` moves to it from
0.2.0.

- `data-credit="opt-in"` on the script tag makes the "Powered by Kaal Jyoti"
  line opt-in: it shows only where `data-powered-by="shown"` or a
  `powered-by="shown"` attribute asks for it. The WordPress plugin sets it.
  Without the attribute nothing changes.

## 0.2.0

On the CDN only: twenty-two widgets loaded on demand by one script tag, the
design system (modes, presets, fonts, sign-icon themes), the place search,
the tabbed kundli report, the server proxy and PDF downloads, and credits.
