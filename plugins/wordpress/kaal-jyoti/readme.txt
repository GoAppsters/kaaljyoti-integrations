=== Kaal Jyoti ===
Contributors: goappsters
Tags: astrology, panchang, kundli, vedic, jyotish
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/license/mit

Twenty-two Vedic astrology widgets from the Kaal Jyoti API: panchang, kundli, match, calculators, horoscopes and readings, as blocks and shortcodes.

== Description ==

Kaal Jyoti puts twenty-two widgets on a WordPress page, each a block and a shortcode. In four groups:

**Daily** — Panchang, Muhurta and choghadiya, Panchang month (a calendar grid), Hindu calendar (Vikram Samvat), Planets now, Ephemeris.

**Calculators** — each a birth form a visitor fills in (or a birth you set): Moon sign, Lagna, Manglik, Sade sati, Dasha (Vimshottari with drill-down, and Yogini), Divisional charts (D1–D60), KP, Shadbala and ashtakavarga, and a drawn Chart.

**Reports** — Horoscope, Reading (lagna, nakshatra and the personal readings), Life areas, Varshphal, Dasha reading.

**Kundli & Match** — the Kundli form with its tabbed report, and the Ashtakoot Match.

Every widget comes in four looks (Classic, Modern, Minimal, Traditional — the same as the Kaal Jyoti PDF reports), follows your theme's colours or its own light and dark palettes, can take your theme's font, lays itself out by its own width (a sidebar gets the phone layout), and speaks English and Hindi. With a secret key, visitors can also download the kundli report and the match as a PDF.

Seven of them in more detail:

* **Panchang** — the day's five limbs for a place: tithi, nakshatra, yoga, karana and vara, with sunrise, sunset and the lunar month.
* **Muhurta** — the day's choghadiya and windows for a place: a timeline from sunrise to the next sunrise with the sixteen choghadiyas, rahu kaal, yamaganda, gulika kaal and abhijit, and the choghadiyas as a table with a Day / Night switch (in server rendering, the day's windows only).
* **Chart** — a drawn kundli for one birth, in the north, south or circular style, for any divisional chart from D1 to D60.
* **Kundli form** — a birth form a visitor fills in, which opens a tabbed report of their own kundli: overview, charts, planets, dasha and life areas (and readings, when you turn them on).
* **Match (Ashtakoot)** — two birth forms, bride and groom, that score a match out of 36 with a verdict, the eight kootas and mangal dosha for both.
* **Horoscope** — pick a sign and read its day, week, month or year: a summary, then work, money, relationships, health and education, each marked Favourable, Mixed or Needs care. No scores or percentages. The transits behind it can be listed too (`show_basis="yes"`).
* **Reading** — what a lagna or a janma nakshatra says about a person, for one the visitor picks or one you set, or for a birth; or a personal reading of a birth: the twelve house lords, the nine grahas in their signs and houses, the yogas, the Vimshottari dashas, the varshphal (the year from a birthday) or the areas of life — or several of these at once as a kundli report. Every Kaal Jyoti plan includes them; each reading costs 5 credits.

Each widget is a shortcode — the element's name with underscores: `[kj_panchang]`, `[kj_muhurta]`, `[kj_chart]`, `[kj_kundli_form]`, `[kj_match_form]`, `[kj_horoscope]`, `[kj_reading]`, `[kj_panchang_month]`, `[kj_calendar]`, `[kj_transits]`, `[kj_ephemeris]`, `[kj_moon_sign]`, `[kj_lagna]`, `[kj_manglik]`, `[kj_sade_sati]`, `[kj_dasha]`, `[kj_vargas]`, `[kj_kp]`, `[kj_strength]`, `[kj_life_areas]`, `[kj_varshphal]`, `[kj_vimshottari_reading]` — and a block of the same name — the match form's block is Kaal Jyoti Match (Ashtakoot). `[kj_match_form city="mumbai" lang="hi"]` starts both birth forms on Mumbai, in Hindi. Both go through the same code, so an attribute means the same thing wherever you write it. English and Hindi are both built in, per widget.

= Appearance =

Settings → Kaal Jyoti → Appearance sets how every widget looks. The theme is **Auto** by default, which takes the text colour from your site and leaves the background transparent, so the widgets sit in a light or a dark theme without looking pasted in. **Light** and **Dark** use Kaal Jyoti's own palettes instead. On top of either, you can set any of seven colours (background, text, accent, lines, muted text, good and bad windows), a font family and a corner radius; an empty field keeps the theme's own. One widget can differ from the rest with `theme="dark"` on its shortcode, or the Theme setting in its block's panel. Server-rendered markup follows the same settings.

Every shortcode and block also takes `preset` (`classic`, `modern`, `minimal`, `traditional`), `font="inherit"` (your theme's font), `heading` (the card's title, or `off`) and `theme`; the forms and calculators take `time_format="24"` and `remember="off"`; the calculators take a birth as `datetime`, `city` or `lat`/`lon`, `timezone` and `name`, and show that birth with no form.

= Zodiac sign icons =

Wherever a widget shows a zodiac sign — the horoscope's sign picker, the kundli overview, the calculators, the match result and the planet tables — it draws an icon rather than a font character. Settings → Kaal Jyoti → Appearance → Zodiac sign icons chooses how: **Element tiles** (the default: the sign's symbol on a tile in fire, earth, air or water colours), **Glyph** (the symbol in a thin ring, in the accent colour), **Hindi name** (मेष, वृष … in a round seal), or **Your own images** — one image per sign, chosen from your media library, each shown as an image with the sign's name as its alternative text. A sign without an image keeps the default icon. Images must be served over HTTPS or from your own site. A block can choose its own icons in its Display panel, and a shortcode with `sign_icons="glyph"` (or `element`, `devanagari`, `custom`).

= Disclaimer =

Settings → Kaal Jyoti → Reports and PDFs sets the line every horoscope and reading ends with: the **default** line ("These predictions are indicative. For a reading of your own chart, consult an astrologer."), a line naming **your astrologer** with a link, or **off**. One shortcode can differ with `disclaimer="off"`, `disclaimer="default"`, or `disclaimer_name="…"` and `disclaimer_url="…"` (the hyphenated spellings work too); each block has the same choice in its panel. The name is plain text up to 80 characters, and the link must be http or https.

= Place search =

Both birth forms have one place search box: type three letters and pick a place, and its name, coordinates and time zone show under the box ("Edit coordinates" lets them be typed by hand). There is no fixed city list; `city` only pre-fills the box. Settings → Kaal Jyoti → Defaults and forms → Search with chooses where it searches:

* **Automatic** (the default) — Google Places if you set a Google Maps key, otherwise Photon.
* **Photon (OpenStreetMap)** — Photon is a free place search over OpenStreetMap data, run by komoot. It finds villages, needs no key, and costs no Kaal Jyoti credits. The list of places credits "© OpenStreetMap contributors", as OpenStreetMap's licence asks. If you run your own Photon server, put its address in Photon URL.
* **Google Places** — needs a Google Maps key (Settings → Kaal Jyoti → Defaults and forms → Google Maps API key). Make the key in Google Cloud with **Places API (New)** and **Maps JavaScript API** enabled, and restrict it to your site's address. Google bills its usage to your own Google account; Google's monthly free usage applies, and these searches cost no Kaal Jyoti credits.
* **Kaal Jyoti only** — the Kaal Jyoti API's own place index, which has every town and city of 1,000 people or more, in English and Hindi. Each search is one API call at 1 credit, and no other service is contacted.

A place picked from Photon or Google sends only its coordinates, and the Kaal Jyoti API works out the time zone that applied there on the birth date. If Photon or Google fails, is slow or refuses the key, the form quietly goes on with the Kaal Jyoti search.

= More =

What a page costs in credits, the two kinds of key, PDF downloads and the month cache, and the horoscope and reading attributes are under Frequently Asked Questions below. Full documentation, with every shortcode attribute and block setting: https://kaaljyoti.com/api/docs/wordpress

== External services ==

The plugin talks to the services below, and to nothing else. It loads no code from another server: the widget scripts ship inside the plugin (see Source code), and the only script ever loaded from elsewhere is Google's Maps JavaScript API, and only when you set a Google Maps key.

= Kaal Jyoti API (api.kaaljyoti.com) =

This plugin sends requests to the **Kaal Jyoti API** at `https://api.kaaljyoti.com`, a service run by the plugin's author. Nothing works without it: every panchang, muhurta and chart is computed there.

What is sent, and when:

* **Panchang and muhurta** — the place (a latitude, a longitude and a time zone, or one of the eight bundled cities), the date asked for, and the language. Sent when a page carrying one of those widgets is viewed (browser rendering) or rendered (server rendering).
* **Chart** — the same place fields plus the birth date and time written into the shortcode or block, and the chart options (style, size, divisional chart).
* **Place search** (birth and match forms, with Kaal Jyoti only or as the fallback) — the letters a visitor types into the place field and the language, sent as they type so the API can suggest places.
* **Birth form** — the date, time and place a visitor types, sent when they press the button so the API can compute their chart. Birth data is used to answer that one request and is not stored by the API.
* **Match form** — the two births (date, time and place for the bride and for the groom) a visitor types, sent when they press the button so the API can score the match. As with the birth form, they are used to answer that one request and are not stored.
* **Horoscope** — the sign, the period, the date and the time zone, and the language; nothing about the visitor.
* **Reading** — the sign or nakshatra, or the birth written into the shortcode or block (always a birth for a personal reading), the varshphal's year, a kundli report's parts, and the language. The birth form's readings send the birth the visitor typed, used to answer that one request and not stored.
* **Panchang month and ephemeris** — the place and the month, sent when a page with one of those widgets is viewed: from the visitor's browser with the publishable key, or, with a secret key stored, from this site's server, and only when the month is not already cached.
* **Calculators** — the birth a visitor types (or the one you set), sent when they press the button, used to answer that one request and not stored.
* **PDF downloads** — the birth (or the two births), the names typed into the form, the edition, the language and the look, sent from this site's server with the secret key when a visitor presses "Download PDF". The PDF is sent back to the visitor and is not kept on this site.
* **Disclaimer** — when the line names your astrologer, that name and link are sent with each horoscope and reading so the API can write them into it.
* **Remembered birth details** — not sent anywhere: with "Remember birth details" on (the default), the forms keep the last entry in the visitor's own browser (`localStorage`); see "Where is my data?" below.
* In browser rendering the request comes from the visitor's browser, so their IP address reaches the service like any other request to any other host; the page's origin is sent as well, because that is what a publishable key is checked against. In server rendering the request comes from this site's server and the visitor's browser never contacts the service at all.

The plugin's own `X-KJ-Client` header says `wordpress/<version>`, so the calls a site makes are attributed to the plugin.

Terms of service: https://kaaljyoti.com/api/terms
Privacy policy: https://kaaljyoti.com/api/privacy

= Photon and OpenStreetMap (place search, unless you choose Kaal Jyoti only) =

With Search with set to Automatic and no Google Maps key, or to Photon, the birth and match forms' place search uses **Photon**, a place search run by komoot GmbH over **OpenStreetMap** data. Nothing is sent to Photon while no one uses the place search, and nothing at all with Kaal Jyoti only or Google Places.

What is sent, and when:

* When a visitor types three letters or more into the place field, their browser sends what they typed to `https://photon.komoot.io/api/` (or to the Photon URL you set), after a short pause in typing, with a fixed limit, the language `en` and a filter for towns and villages. No Kaal Jyoti key, birth date or other form data is sent.
* As with any request from a browser, the Photon server receives the visitor's IP address, browser details and the page address.
* When a visitor picks a place, its coordinates go to the Kaal Jyoti API with the rest of the birth, as described above; nothing more goes to Photon.

Photon: https://photon.komoot.io
komoot privacy policy: https://www.komoot.com/privacy
OpenStreetMap copyright and licence: https://www.openstreetmap.org/copyright
OpenStreetMap Foundation privacy policy: https://osmfoundation.org/wiki/Privacy_Policy

= Google Maps Platform (only when you set a Google Maps key) =

When a Google Maps API key is set in Settings → Kaal Jyoti → Defaults and forms and Search with is Automatic or Google Places, the birth and match forms use **Google Maps Platform** (the Maps JavaScript API and Places API, run by Google LLC) for their place search. Nothing is sent to Google while the key field is empty.

What is sent, and when:

* The Maps JavaScript API is loaded from `https://maps.googleapis.com` in the visitor's browser the first time they type into a form's place field, with your key and the page language.
* What the visitor types into the place field is sent to Google as they type, to get suggestions; when they pick one, the chosen place is looked up to get its coordinates and address.
* As with any request from a browser, Google receives the visitor's IP address and the page address.

Google Maps Platform Terms of Service: https://cloud.google.com/maps-platform/terms
Google Privacy Policy: https://policies.google.com/privacy

== Source code ==

The widget scripts in `assets/widgets/` are minified. Their human-readable source — the TypeScript and CSS of the web components, and the build that turns them into those files — ships with the plugin in `widgets-src/`, MIT licensed; `widgets-src/README.txt` says how to rebuild the files. The block editor scripts (`blocks/*/index.js`, `assets/blocks-kit.js`), `assets/admin.js` and the PHP are not minified.

The whole plugin, the widgets and their tests are developed in the open at https://github.com/goappsters/kaaljyoti-integrations.

== Installation ==

1. Install and activate the plugin.
2. Get a publishable key at https://kaaljyoti.com/api/dashboard/keys.
3. Open Settings → Kaal Jyoti → Connection. Paste the key, and add the origin the page prints to the key in the dashboard — a publishable key only works from the origins listed on it.
4. Press "Test connection". It asks the API for its version and, when a secret key is stored, for the default city's panchang.
5. Put `[kj_panchang city="delhi"]` in a post, or add the Kaal Jyoti Panchang block.

To render on the server instead, add a secret key, set the render mode to Server, and choose how long the HTML is cached (15 minutes by default). The birth form and the match form are always rendered in the browser: there is nothing to draw until a visitor has typed a birth. A horoscope is rendered on the server when its sign is set, and a reading when its sign or nakshatra is set; one that lets the visitor pick, or a reading of a birth — every personal reading is one — stays in the browser.

== Frequently Asked Questions ==

= Where is a setting? =

Settings → Kaal Jyoti has six tabs, and each says what it holds at its top:

* **Connection** — the publishable and secret keys, the origin to add to the key, and "Test connection".
* **Appearance** — the style, Auto/Light/Dark, colours, type, corner radius, the "Powered by" line and the zodiac sign icons.
* **Defaults and forms** — the default city and language, the birth time format, remembering birth details, and the place search.
* **Reports and PDFs** — the disclaimer under horoscopes and readings, and PDF downloads with their editions.
* **Advanced** — the server proxy and its per-visitor limits, the month cache, server rendering and its cache, and the links in the owner notes.
* **Shortcodes** — every shortcode, with a Copy button.

A "Search settings" box on each tab narrows the tab to the matching settings and links to matches on the other tabs. Saving a tab saves only that tab.

= What does a page cost? =

The plugin is a client for the Kaal Jyoti API, which bills in credits. A plan is a number of credits a month (Free 1,000, Starter 50,000, Growth 200,000, Scale 1,000,000), every plan can use every widget, and each API call costs credits by what it is: a calculation 1, a written reading 5, a month of panchang or ephemeris 20, a PDF 500 or 1,000.

* a panchang costs **1 credit**;
* a muhurta costs **1 credit** — in the browser it is its own call (the choghadiya), so a panchang and a muhurta for the same place and day are two calls, and two muhurtas for the same place and day are one; in server rendering it is drawn from the panchang's call and shares it;
* a chart costs **1 credit**, and another if the page asks for it in a second language, because the labels are drawn into the drawing;
* the birth form costs **nothing** until a visitor submits it, and then **3 calls, 7 credits** for the overview (the kundli and the dasha at 1 credit each, the lagna reading at 5); each other tab costs its own calls the first time it is opened — 1 credit per chart and style shown and 1 for the chalit table, 2 for the planets, 5 for the life areas, nothing for the dasha;
* the match form costs **nothing** until a visitor submits it, and then **3 calls, 3 credits** per submit: the ashtakoot match and one kundli per person;
* a place search in either form costs **nothing** with Photon or Google (Google bills its searches to your Google account), and **1 credit** per search with Kaal Jyoti only, or when Photon or Google fails and the form falls back to it;
* a horoscope costs **5 credits** for each sign and period shown;
* a reading costs **5 credits**, and the birth form's readings 5 each when you turn them on; a kundli report 5 per part;
* a panchang month or an ephemeris costs **20 credits** per month shown — with a secret key, made by this site and then kept for 12 hours, so many visitors cost one call;
* the calculators cost **nothing** until a visitor submits, then one to three calls (the widget descriptions in the block editor say how many), at 1 credit for a calculation and 5 for a reading;
* a kundli PDF costs **1,000 credits** and a match PDF **500**, and each uses one PDF of your plan's monthly PDF allowance (Starter 50, Growth 200, Scale 500, Enterprise 2,500; none on Free).

A request the API refuses costs nothing. The full list is at https://kaaljyoti.com/api/docs/credits.

Identical requests on one page are made once. Server rendering (see Installation) caches the finished HTML, so a page that many visitors see is one call every few minutes rather than one call per visitor.

= What are the two keys? =

A **publishable key** (`kj_pub_…`) is meant to be in a page's HTML. What protects it is the list of origins on the key, so this site's origin has to be on it; Settings → Kaal Jyoti → Connection prints the exact origin to paste into the dashboard. This is all most sites need.

A **secret key** (`kj_live_…` or `kj_test_…`) is for what this site — not the visitor's browser — asks the API for: PDF downloads and the month widgets' cache through the server connection, and server rendering, which draws the HTML here and caches it. It is stored in this site's options table, is never sent to a browser or printed in a page, and is shown masked in the settings page. "Test connection" checks it and says what its plan means for the month widgets and PDFs.

= Do I need a secret key? =

Not for the widgets: the publishable key is enough for all of them. A secret key turns on PDF downloads, a cache that serves the Panchang month and Ephemeris widgets from this site (saving your credits), and server rendering. Paste it in Settings → Kaal Jyoti → Connection; it is stored in your database and never sent to a browser.

= Is the secret key safe on my site? =

It is stored in the options table like any other plugin's API key (WordPress has no separate secret store), shown masked in the settings, and never printed in a page, a script or an error message. The widgets never see it: they ask this site, and this site asks the API. If you think it has leaked, revoke it in the Kaal Jyoti dashboard and paste a new one.

= PDF downloads and the month cache: the server connection =

Every widget is called from the visitor's browser with your publishable key — including **Panchang month** and **Ephemeris**. One thing the API never gives a browser, whatever the plan: **PDF downloads**. With a **secret key** stored in Settings → Kaal Jyoti → Connection, this site fetches PDFs for its visitors, and also serves the two month widgets from its own cache: the widgets send the request to this site (`/wp-json/kaaljyoti/v1/proxy`), which checks it and calls the API with the secret key. The key stays on the server.

The proxy relays only those routes, rebuilds each request from the fields the route takes, refuses anything over 16 KB, accepts requests only from this site's own pages (a nonce, and the browser's origin), limits each visitor per minute (10 month requests and 3 PDFs by default; Settings → Kaal Jyoti → Advanced), and keeps each month's answer for 12 hours so a busy page costs one call per place and month instead of one per visitor. Without a secret key there is no PDF button, and the month widgets call the API directly.

**PDF downloads**: switch them on under Server connection and choose the kundli editions to offer (Basic, Professional, or both). The kundli report and the match result then show a "Download PDF" button with the edition and the language; the PDF uses the widget's look and your Kaal Jyoti branding. PDFs are on every paid plan, not on Free.

= What is the server proxy, and can someone else use it? =

It is the endpoint the PDF button, and with a secret key the month widgets, send their requests to, `/wp-json/kaaljyoti/v1/proxy`. It is not an open relay: it answers only the month and PDF routes, rebuilds each request from the fields those routes take, accepts only requests from this site's pages (a PDF request must carry this site's `Origin`, as every browser sends it), limits each visitor per minute, and caps what the whole site relays in a day. Month answers are cached, so the same month for the same place costs one call however many visitors see it.

The page check and the origin check stop other sites' pages, not a determined script, which is why the limits exist. A visitor is counted by IP address, and an IPv6 address by its /64 (one host can hold a whole /64). The daily cap is per UTC day: 500 month calls and 50 PDFs by default, counting only calls that reach the API (a cached month is free). Change it with the `kaal_jyoti_proxy_daily_cap` filter, which gets the cap and the bucket (`month` or `pdf`); 0 turns a cap off:

`add_filter( 'kaal_jyoti_proxy_daily_cap', fn( $cap, $bucket ) => 'pdf' === $bucket ? 200 : $cap, 10, 2 );`

With a persistent object cache (Redis, Memcached) the counters are atomic; without one they are transients, which is what WordPress offers.

= My site is behind Cloudflare or a managed host: everyone shares one limit =

The per-visitor limit counts by `REMOTE_ADDR`, which behind a CDN or a reverse proxy is the proxy's address, so every visitor shares one minute. Tell the plugin which header carries the visitor's address with the `kaal_jyoti_proxy_client_ip` filter. Trust a header only if your server accepts traffic from that proxy alone, since anyone else can send it. For Cloudflare:

`add_filter( 'kaal_jyoti_proxy_client_ip', fn( $ip ) => isset( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ) : $ip );`

Other hosts use their own header (often `X-Forwarded-For` or `X-Real-IP`); your host's documentation names it.

= A widget says "Monthly limit reached" =

Your account has used its credits for the month, or has fewer left than the request costs (a month of panchang or ephemeris costs 20, a reading 5). The widget says so politely (with a link, if you set one under Settings → Kaal Jyoti → Links). Buy a credit pack or move to a larger plan, or wait for your account's billing day, when the credits reset.

= The PDF button or a month stopped loading on a cached page =

With a secret key, these go through this site with a check that a page is no more than a day old. If your page cache keeps pages longer, clear it, or turn off "Page check (nonce)" under Server connection.

= How do PDF downloads work, and what do they cost? =

Switch on PDF downloads under Settings → Kaal Jyoti → Reports and PDFs and choose the editions (the server proxy, on by default, is under Advanced). The kundli report and the match result then show a Download PDF button; the visitor picks the edition and the language. A kundli PDF costs 1,000 credits and a match PDF 500, and each uses one PDF from your plan's monthly allowance, and PDFs are on every paid plan — on the Free plan the button shows a polite "needs a plan" note, and when the month's PDFs are used up it says so.

= The widget says the key does not allow this origin =

A publishable key carries a list of origins it may be used from, and this site's is not on it. Settings → Kaal Jyoti → Connection prints the exact origin — scheme, host and port, nothing else — to paste into the key in the dashboard. `https://example.com` and `https://www.example.com` are different origins, and so are `http://localhost:3000` and `http://localhost`.

= Can it show Hindi? =

Yes. Set the language in Settings → Kaal Jyoti → Defaults and forms, or write `lang="hi"` on one shortcode or block. The tithi, nakshatra, yoga and karana, the paksha, the weekday, the lunar month, the sign names, the horoscope and reading texts and all the labels come through in Hindi, in both render modes.

= Which attributes do the horoscope and the reading take? =

`[kj_horoscope sign="aries" period="daily"]` preselects a sign and a period (`daily`, `weekly`, `monthly`, `yearly`); without `sign` the visitor picks one. It shows a summary and five life areas, each with its level; `show_basis="yes"` adds the transits it was read from, folded away. `[kj_reading type="lagna" sign="leo"]` or `[kj_reading type="nakshatra" nakshatra="revati"]` shows one reading; without `sign`/`nakshatra` the visitor picks. `[kj_reading type="house_lords" datetime="1990-05-14T10:30:00" city="delhi"]` reads the twelve house lords of a birth — for each house, the sign on it, its lord and the house the lord sits in ("1st house · Gemini · lord Mercury in the 9th"), then what that says — with the same birth attributes as `[kj_chart]`; it always needs a birth. The other personal readings work the same way: `type="grahas"`, `type="yogas"`, `type="vimshottari"` (each mahadasha with its dates and level, the running one marked), `type="varshphal"` (the year from the birthday in `year`, default the one running now — this year's from the birthday on, last year's before it: `[kj_reading type="varshphal" year="2027" datetime="…" city="…"]`) and `type="life_areas"` (`life-areas` works too). `type="kundli"` puts several of them in one request — `parts="lagna,nakshatra,yogas"`, or all eight when `parts` is left out — each drawn as on its own, with one disclaimer; it costs 5 credits per part. They are on every Kaal Jyoti plan. The birth form shows the visitor's own lagna and nakshatra readings under their chart with `[kj_kundli_form readings="lagna,nakshatra"]`, and any personal reading too by name — `readings="lagna,nakshatra,house_lords"`, `readings="vimshottari,varshphal"` — or every reading with `readings="all"`; readings are off unless you set them, because each costs 5 credits.

= Can I point the plugin at a different API address? =

Site owners never need to: the plugin always talks to `https://api.kaaljyoti.com`. For development and testing, a developer can set another address in `wp-config.php`, above the "That's all, stop editing!" line:

`define( 'KAAL_JYOTI_API_BASE', 'https://staging.example.com' );`

It must be an https address; a trailing `/` or `/v1` is trimmed. Anything else is ignored and the plugin stays on production. While it is set, Settings → Kaal Jyoti → Connection shows the address in use. There is no settings field for it.

= Does it cost anything? =

The API has a free plan with 1,000 credits a month, and a page costs the credits the dashboard shows — see "What a page costs" above. The "Powered by Kaal Jyoti" link is off unless you turn it on (Settings → Kaal Jyoti → Appearance), on every plan.

= Why does the widget look wrong on my dark theme? =

With the theme set to Auto (the default) the widget inherits your site's text colour and has no background of its own, so it should already read on a dark page; if your theme sets its colours somewhere the widget cannot see them, choose Dark in Settings → Kaal Jyoti → Appearance for Kaal Jyoti's own dark palette, or `theme="dark"` on one shortcode. If a single colour is still off — the accent, the lines — set just that one under Appearance; it replaces that colour in every mode.

= What does the Ashtakoot match show, and what does it cost? =

The match form scores two births by the eight kootas of Ashtakoot guna milan — varna, vashya, tara, yoni, graha maitri, gana, bhakoot and nadi — and shows the total out of 36, a verdict, each koota's points, and whether either chart has mangal dosha. Nothing is called until a visitor submits both births; each submit is three API calls (the match and one kundli per person), 3 credits.

= Does it work without JavaScript? =

In server rendering, yes: the panchang, the muhurta strip and the chart are plain HTML and an inline SVG drawn before the page is sent, and so are a horoscope with its sign set and a reading with its sign or nakshatra set. The birth form and the match form need JavaScript, because they are forms, and so do a horoscope or reading that lets the visitor pick and a reading computed from a birth, every personal reading included.

= Where is my data? =

The plugin stores one option row (your settings) and, in server mode, the rendered HTML in transients; with a secret key, also the cached months and the proxy's counters (hashed, never an IP address). Deleting the plugin removes them, on every site of a multisite network.

In the visitor's browser, the birth and match forms remember the last entry (name, date, time and place) in the browser's `localStorage` on that device, so a returning visitor need not type it again. It never leaves the browser and is not sent to this site. Turn it off for every form with "Remember birth details" in Settings → Kaal Jyoti → Defaults and forms, or on one form with `remember="off"`; a form with it off also forgets what an earlier visit stored. Mention it in your privacy policy if you leave it on. Nothing else is written to your database, and nothing is sent anywhere except the API calls listed above and, from the visitor's browser when they use the place search, the searches sent to Photon or, if you set a Google Maps key, to Google Maps Platform — none with Kaal Jyoti only.

== Screenshots ==

1. The daily widgets: the panchang, muhurta and choghadiya, and the Hindu calendar (Vikram Samvat).
2. The panchang month as a calendar grid, with ekadashi, purnima and amavasya marked and the chosen day's limbs below.
3. The kundli report from the birth form, in tabs: overview, charts, planets, dasha, life areas and readings.
4. The Ashtakoot match: the score out of 36, the eight kootas, and mangal dosha for both.
5. Birth calculators after a submit: the Vimshottari dasha and the divisional charts.
6. A weekly horoscope by sign, and the lagna and nakshatra readings.
7. The widgets in Hindi: the panchang and the horoscope.
8. Zodiac sign icons: element tiles, a glyph in a ring, the Hindi name in a seal, your own images, and the glyph on the dark theme.
9. The four looks: Classic, Modern, Minimal and Traditional.
10. The settings page, in tabs: the Connection tab with the keys and the connection test.

== Changelog ==

= 0.1.0 =
* First release.
* Billing in credits: every Kaal Jyoti plan can use every widget, a calculation costs 1 credit, a reading 5 and a month of panchang or ephemeris 20, and PDF downloads are on every paid plan.
* Shortcodes `[kj_panchang]`, `[kj_muhurta]`, `[kj_chart]`, `[kj_kundli_form]`, `[kj_match_form]`, `[kj_horoscope]` and `[kj_reading]`.
* Blocks `kaal-jyoti/panchang`, `kaal-jyoti/muhurta`, `kaal-jyoti/chart`, `kaal-jyoti/kundli-form`, `kaal-jyoti/match-form`, `kaal-jyoti/horoscope` and `kaal-jyoti/reading`.
* Readings of a lagna or a nakshatra, and the personal readings of a birth — house lords, grahas, yogas, Vimshottari dashas, varshphal and life areas, alone or together as a kundli report; the birth form can add any of them under the chart.
* A horoscope as a summary and five life areas, each Favourable, Mixed or Needs care; the transits behind it on request.
* A disclaimer setting for horoscopes and readings: the default line, your own astrologer, or off.
* A place search in the birth and match forms: Photon (OpenStreetMap) by default, Google Places with your own Google Maps API key, or the Kaal Jyoti API's own index only.
* Browser rendering with the bundled widget bundle, and server rendering through the bundled PHP SDK with a transient cache.
* English and Hindi.
* "Test connection" names the engine and the ephemeris the API is running.
* The API address is fixed at `https://api.kaaljyoti.com`; developers can point a test site elsewhere with the `KAAL_JYOTI_API_BASE` constant in `wp-config.php`. The settings page no longer has an API base URL field.
* Appearance settings: an Auto, Light or Dark theme, seven colour overrides, a font and a corner radius, for both render modes; `theme` on every shortcode and block.
* Fifteen more widgets, each a block and a shortcode: panchang month, Hindu calendar, planets now, ephemeris, moon sign, lagna, manglik, sade sati, dasha, divisional charts, KP, shadbala and ashtakavarga, life areas, varshphal and the dasha reading.
* A redesigned look in four presets, the theme's own font on request, a search-first birth form that remembers the last entry, and a tabbed kundli report.
* A server connection with the secret key: PDF downloads, and a cache for the month widgets, through a checked, rate-limited proxy.
* PDF downloads of the kundli report (basic and professional editions) and the match.
* The settings page in tabs — Connection, Appearance, Defaults and forms, Reports and PDFs, Advanced, Shortcodes — with a settings search; saving one tab leaves the others as they are.
* Settings for the birth time format, remembering birth details, the font, the proxy's limits and cache, and PDFs; "Test connection" says what the key's plan allows.
* The human-readable source of the minified widget scripts, and their build, in `widgets-src/`.
* Zodiac sign icons in four styles — element tiles, a glyph in a ring, the Hindi name in a seal, or your own images from the media library — site-wide and per block.

== Upgrade Notice ==

= 0.1.0 =
First release.
