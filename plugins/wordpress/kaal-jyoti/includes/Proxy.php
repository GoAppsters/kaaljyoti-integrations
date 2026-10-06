<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The server proxy: the PDF downloads, and a cache for the month widgets.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * `POST /wp-json/kaaljyoti/v1/proxy`: the widgets' proxy contract (widgets
 * design decision 23), answered with the site's secret key.
 *
 * The PDFs are closed to publishable keys whatever the plan, so the PDF
 * button sends `{"path": "/pdf/kundli", "body": {…}}` here, and this class
 * calls the API with the secret key stored in the settings and relays the
 * answer. The month of panchang and the month of ephemeris are open to
 * publishable keys (since 2 October 2026; 20 credits each), but when the
 * page has this proxy the two month widgets ask it instead, and the month
 * is answered from this site's cache for hours rather than from the
 * site's credits on every visit. The key never leaves the server: not in the answer, not
 * in a header, not in an error message.
 *
 * It is not an open relay:
 *
 *   * **Allowlist.** Only `/panchang/month` and `/ephemeris/month`, and with
 *     PDF downloads on, `/pdf/kundli` and `/pdf/match`. Everything else is
 *     `403 proxy_path_not_allowed`.
 *   * **Bodies rebuilt, not passed on.** Each path has its fields; a body is
 *     rebuilt from them with their types checked, and anything else in it —
 *     a PDF's `branding`, `sections`, `vargas` — is dropped. The PDF's
 *     edition must be one the settings offer, and its disclaimer is the
 *     site's setting, not the page's.
 *   * **Size.** A request body over 16 KB is refused before it is read.
 *   * **Nonce.** The URL the plugin writes into the page carries a
 *     `wp_rest` nonce, checked here (a setting turns it off for a site whose
 *     page cache outlives a nonce), and a request that says it comes from
 *     another origin is refused. Neither stops a script, which can read the
 *     nonce off the page and leave `Origin` out; a PDF (1,000 credits) must
 *     therefore name this site's origin, as every browser's `POST` does.
 *   * **Rate limits per visitor**, keyed by a salted hash of the IP address
 *     (an IPv6 address by its /64, which one host can rotate through): by
 *     default 10 month requests and 3 PDFs a minute.
 *   * **A daily cap per site**, per bucket, on the calls that reach the API:
 *     by default 500 months and 50 PDFs a UTC day
 *     (`kaal_jyoti_proxy_daily_cap`). It bounds what a visitor rotating
 *     addresses can spend.
 *   * The counters use `wp_cache_incr()` when the site has a persistent
 *     object cache, which is atomic, and transients otherwise.
 *   * **Cache.** A month answer is the same for a place and a month, so a
 *     200 is kept for 12 hours (a setting) and served without a call; a
 *     cached answer costs no rate-limit allowance either.
 *
 * The API's status and JSON body are relayed as they are, with `X-KJ-Plan`,
 * `X-KJ-Request-Id` and `Retry-After`, so a `402 quota_exceeded` becomes the
 * widget's monthly-limit card. `X-KJ-Credits-Remaining`, which the API sends
 * to this site's secret key, is the account's balance and is not relayed. A
 * PDF is streamed back as the file, with the API's filename. The proxy's own refusals are the API's envelope with a
 * `proxy_…` code.
 */
final class Proxy {

	/** The REST namespace; the widgets' README names it. */
	public const REST_NAMESPACE = 'kaaljyoti/v1';

	/** The one route. */
	public const ROUTE = '/proxy';

	/** Largest request body read, in bytes (the contract's 16 KB). */
	public const MAX_BODY = 16384;

	/** The routes the month widgets use. */
	public const MONTH_PATHS = array( '/panchang/month', '/ephemeris/month' );

	/** The routes the PDF downloads use. */
	public const PDF_PATHS = array( '/pdf/kundli', '/pdf/match' );

	/** Transient prefix of a cached month answer (Uninstall removes `kaal_jyoti_*`). */
	public const CACHE_PREFIX = 'kaal_jyoti_px_';

	/** Transient prefix of a visitor's rate-limit window. */
	public const RATE_PREFIX = 'kaal_jyoti_rl_';

	/** Transient prefix of the site's daily count, per bucket. */
	public const CAP_PREFIX = 'kaal_jyoti_cap_';

	/** The object-cache group of the counters, when the site has a persistent cache. */
	public const COUNTER_GROUP = 'kaal_jyoti';

	/**
	 * The calls a day this site relays to the API, per bucket, before the
	 * `kaal_jyoti_proxy_daily_cap` filter. A month is 20 credits and is cached
	 * for hours, so 500 is many distinct months; a PDF is 1,000 credits.
	 */
	public const DAILY_CAPS = array(
		'month' => 500,
		'pdf'   => 50,
	);

	/** The nonce action: WordPress's own REST one, so a signed-in editor's cookie check agrees. */
	public const NONCE_ACTION = 'wp_rest';

	/** How long a month request may take, in seconds. */
	private const MONTH_TIMEOUT = 20;

	/** How long a PDF may take to render, in seconds. */
	private const PDF_TIMEOUT = 60;

	/** The API headers relayed to the widget. */
	private const RELAYED_HEADERS = array(
		'x-kj-plan'       => 'X-KJ-Plan',
		'x-kj-request-id' => 'X-KJ-Request-Id',
		'retry-after'     => 'Retry-After',
	);

	/**
	 * Registers the route and the raw output the relay needs.
	 *
	 * @return void
	 */
	public static function hooks(): void {
		add_action( 'rest_api_init', array( self::class, 'register_route' ) );
		add_filter( 'rest_pre_serve_request', array( self::class, 'serve' ), 10, 3 );
	}

	/**
	 * `POST /wp-json/kaaljyoti/v1/proxy`, open to visitors: every check is in
	 * {@see handle()}, since a visitor is exactly who calls it.
	 *
	 * @return void
	 */
	public static function register_route(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			self::ROUTE,
			array(
				'methods'             => 'POST',
				'callback'            => array( self::class, 'handle_rest' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * Whether the proxy is on: switched on in the settings, with a secret key
	 * stored. Without one there is nothing to relay with, the page carries no
	 * `data-proxy`, there is no PDF button, and the month widgets call the
	 * API directly with the publishable key.
	 *
	 * @return bool Whether requests are relayed.
	 */
	public static function enabled(): bool {
		return (bool) Settings::get( 'proxy' ) && Settings::is_secret_key( (string) Settings::get( 'secret_key' ) );
	}

	/**
	 * The kundli PDF editions the site offers: none unless the proxy is on
	 * and PDF downloads are switched on.
	 *
	 * @return string[] `basic`, `professional`, both, or none.
	 */
	public static function pdf_editions(): array {
		if ( ! self::enabled() || ! Settings::get( 'pdf' ) ) {
			return array();
		}

		return Settings::pdf_editions();
	}

	/**
	 * The paths this site relays right now.
	 *
	 * @return string[] The allowlist.
	 */
	public static function allowed_paths(): array {
		if ( ! self::enabled() ) {
			return array();
		}

		return array() === self::pdf_editions() ? self::MONTH_PATHS : array_merge( self::MONTH_PATHS, self::PDF_PATHS );
	}

	/**
	 * The URL the widgets are given (`data-proxy`), with its nonce.
	 *
	 * @return string The endpoint.
	 */
	public static function url(): string {
		$url = rest_url( self::REST_NAMESPACE . self::ROUTE );

		if ( ! Settings::get( 'proxy_nonce' ) ) {
			return $url;
		}

		return add_query_arg( '_wpnonce', wp_create_nonce( self::NONCE_ACTION ), $url );
	}

	/**
	 * The REST callback: the request's body and context in, the relay out.
	 *
	 * @param \WP_REST_Request $request The request WordPress parsed.
	 * @return \WP_REST_Response The answer; its body is written raw by {@see serve()}.
	 */
	public static function handle_rest( $request ): \WP_REST_Response {
		$nonce = $request->get_param( '_wpnonce' );
		if ( ! is_string( $nonce ) || '' === $nonce ) {
			$nonce = (string) $request->get_header( 'x_wp_nonce' );
		}

		$result = self::handle(
			(string) $request->get_body(),
			array(
				'nonce'        => $nonce,
				'origin'       => (string) $request->get_header( 'origin' ),
				'content_type' => (string) $request->get_header( 'content_type' ),
				'client'       => (string) $request->get_header( 'x_kj_client' ),
				'ip'           => self::client_ip(),
			)
		);

		$response = new \WP_REST_Response( $result['body'], $result['status'] );
		foreach ( $result['headers'] as $name => $value ) {
			$response->header( $name, $value );
		}

		return $response;
	}

	/**
	 * Writes the relayed body as it is, instead of WordPress encoding it again.
	 *
	 * The API's JSON is passed through byte for byte (decoding and encoding it
	 * again could change a number's spelling), and a PDF is binary. WordPress
	 * has already sent the status and the headers by the time this runs.
	 *
	 * @param bool   $served  Whether something else already served the request.
	 * @param mixed  $result  The response.
	 * @param object $request The request.
	 * @return bool True once this wrote the body.
	 */
	public static function serve( $served, $result, $request ): bool {
		if ( $served || ! is_object( $request ) || ! method_exists( $request, 'get_route' ) ) {
			return (bool) $served;
		}

		if ( '/' . self::REST_NAMESPACE . self::ROUTE !== $request->get_route() || ! is_object( $result ) || ! method_exists( $result, 'get_data' ) ) {
			return (bool) $served;
		}

		$body = $result->get_data();
		if ( ! is_string( $body ) ) {
			return (bool) $served;
		}

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the relayed API answer (JSON or a PDF), sent with its own Content-Type and nosniff; escaping it would corrupt it.
		echo $body;

		return true;
	}

	/**
	 * The whole proxy, without WordPress's REST classes: checks, cache, rate
	 * limit, the call, and the answer.
	 *
	 * @param string               $raw     The request body.
	 * @param array<string, mixed> $context `nonce`, `origin`, `content_type`, `client`, `ip`.
	 * @return array{status: int, headers: array<string, string>, body: string} The answer.
	 */
	public static function handle( string $raw, array $context ): array {
		if ( ! self::enabled() ) {
			return self::refusal( 503, 'proxy_error', 'This site has no server connection to Kaal Jyoti set up.' );
		}

		if ( Settings::get( 'proxy_nonce' ) && ! wp_verify_nonce( (string) ( $context['nonce'] ?? '' ), self::NONCE_ACTION ) ) {
			return self::refusal( 403, 'proxy_forbidden', 'The page that sent this request has expired; reload it.' );
		}

		if ( ! self::same_origin( (string) ( $context['origin'] ?? '' ) ) ) {
			return self::refusal( 403, 'proxy_forbidden', 'Requests are accepted from this site\'s own pages only.' );
		}

		if ( strlen( $raw ) > self::MAX_BODY ) {
			return self::refusal( 413, 'proxy_error', 'The request body is larger than 16 KB.' );
		}

		$content_type = strtolower( (string) ( $context['content_type'] ?? '' ) );
		if ( '' !== $content_type && ! str_starts_with( $content_type, 'application/json' ) ) {
			return self::refusal( 415, 'proxy_bad_request', 'Send the request as application/json.' );
		}

		$request = json_decode( $raw, true );
		if ( ! is_array( $request ) || ! isset( $request['path'] ) || ! is_string( $request['path'] ) ) {
			return self::refusal( 400, 'proxy_bad_request', 'Expected {"path": "…", "body": {…}}.' );
		}

		$path = $request['path'];
		if ( ! in_array( $path, self::allowed_paths(), true ) ) {
			return self::refusal( 403, 'proxy_path_not_allowed', 'This site does not relay that route.' );
		}

		$body = self::clean_body( $path, isset( $request['body'] ) && is_array( $request['body'] ) ? $request['body'] : array() );
		if ( null === $body ) {
			return self::refusal( 400, 'proxy_bad_request', 'The request body is not one this route takes.' );
		}

		$is_pdf = in_array( $path, self::PDF_PATHS, true );

		// A browser's POST always says where it comes from; only a script
		// leaves it out, and a PDF is worth a script's while.
		if ( $is_pdf && '' === (string) ( $context['origin'] ?? '' ) ) {
			return self::refusal( 403, 'proxy_forbidden', 'Requests are accepted from this site\'s own pages only.' );
		}

		$cache_key = $is_pdf ? '' : self::cache_key( $path, $body );

		if ( '' !== $cache_key ) {
			$cached = get_transient( $cache_key );
			if ( is_array( $cached ) && isset( $cached['status'], $cached['body'] ) && is_string( $cached['body'] ) ) {
				$headers                 = isset( $cached['headers'] ) && is_array( $cached['headers'] ) ? $cached['headers'] : array();
				$headers['X-KJ-Proxy']   = 'hit';
				$headers['Content-Type'] = 'application/json; charset=utf-8';

				return array(
					'status'  => (int) $cached['status'],
					'headers' => self::with_security_headers( $headers ),
					'body'    => $cached['body'],
				);
			}
		}

		$bucket = $is_pdf ? 'pdf' : 'month';
		$wait   = self::rate_limit( $bucket, (string) ( $context['ip'] ?? '' ) );
		if ( $wait > 0 ) {
			$refusal                           = self::refusal( 429, 'proxy_rate_limited', 'Too many requests from this visitor; try again in a minute.' );
			$refusal['headers']['Retry-After'] = (string) $wait;

			return $refusal;
		}

		$wait = self::daily_cap( $bucket );
		if ( $wait > 0 ) {
			$refusal                           = self::refusal( 429, 'proxy_rate_limited', 'This site has relayed all it relays today; try again tomorrow.' );
			$refusal['headers']['Retry-After'] = (string) $wait;

			return $refusal;
		}

		$answer = wp_remote_post(
			Settings::api_base() . '/v1' . $path,
			array(
				'timeout'     => $is_pdf ? self::PDF_TIMEOUT : self::MONTH_TIMEOUT,
				'redirection' => 0,
				'headers'     => array(
					'Accept'        => $is_pdf ? 'application/pdf, application/json' : 'application/json',
					'Authorization' => 'Bearer ' . (string) Settings::get( 'secret_key' ),
					'Content-Type'  => 'application/json',
					'X-KJ-Client'   => self::client_tag( (string) ( $context['client'] ?? '' ) ),
				),
				'body'        => (string) wp_json_encode( $body ),
			)
		);

		if ( is_wp_error( $answer ) ) {
			// The error's message is not relayed: it can carry the URL, and
			// the reader has no use for it.
			return self::refusal( 502, 'proxy_error', 'The Kaal Jyoti API could not be reached.' );
		}

		$status   = (int) wp_remote_retrieve_response_code( $answer );
		$received = (string) wp_remote_retrieve_body( $answer );
		$type     = strtolower( (string) wp_remote_retrieve_header( $answer, 'content-type' ) );
		$headers  = self::relayed_headers( $answer );

		if ( $is_pdf && 200 === $status && str_contains( $type, 'application/pdf' ) ) {
			$headers['Content-Type']        = 'application/pdf';
			$headers['Content-Disposition'] = 'attachment; filename="' . self::file_name( (string) wp_remote_retrieve_header( $answer, 'content-disposition' ), $path ) . '"';
			$headers['Content-Length']      = (string) strlen( $received );
			$headers['Cache-Control']       = 'private, no-store';

			return array(
				'status'  => 200,
				'headers' => self::with_security_headers( $headers ),
				'body'    => $received,
			);
		}

		$envelope = json_decode( $received, true );
		if ( $status < 100 || ! is_array( $envelope ) || ! isset( $envelope['status'] ) ) {
			return self::refusal( 502, 'proxy_error', 'The Kaal Jyoti API answered with something other than JSON.' );
		}

		$headers['Content-Type'] = 'application/json; charset=utf-8';

		if ( '' !== $cache_key && 200 === $status && 'ok' === $envelope['status'] ) {
			set_transient(
				$cache_key,
				array(
					'status'  => $status,
					'headers' => array_intersect_key( $headers, array( 'X-KJ-Plan' => true ) ),
					'body'    => $received,
				),
				self::cache_seconds()
			);
		}

		return array(
			'status'  => $status,
			'headers' => self::with_security_headers( $headers ),
			'body'    => $received,
		);
	}

	/**
	 * A route's body, rebuilt from the fields it takes.
	 *
	 * @param string               $path A path from {@see allowed_paths()}.
	 * @param array<string, mixed> $body What the widget sent.
	 * @return array<string, mixed>|null The body to send, or null when it is not one.
	 */
	public static function clean_body( string $path, array $body ): ?array {
		switch ( $path ) {
			case '/panchang/month':
			case '/ephemeris/month':
				$place = self::place( $body );
				$month = isset( $body['month'] ) && is_string( $body['month'] ) && preg_match( '/^\d{4}-(0[1-9]|1[0-2])$/', $body['month'] ) ? $body['month'] : null;
				if ( null === $place || null === $month ) {
					return null;
				}

				$clean = array_merge( $place, array( 'month' => $month ) );
				if ( '/ephemeris/month' === $path && isset( $body['system'] ) ) {
					if ( ! in_array( $body['system'], array( 'sidereal', 'tropical' ), true ) ) {
						return null;
					}
					$clean['system'] = $body['system'];
				}
				$clean['options'] = array( 'language' => self::languages( $body['options']['language'] ?? null ) );

				return $clean;

			case '/pdf/kundli':
				$birth = self::birth( $body['birth'] ?? null );
				if ( null === $birth ) {
					return null;
				}

				$editions = self::pdf_editions();
				$edition  = $body['edition'] ?? $editions[0] ?? null;
				if ( ! is_string( $edition ) || ! in_array( $edition, $editions, true ) ) {
					return null;
				}

				$clean = array(
					'birth'   => $birth,
					'options' => self::pdf_options( $body ),
					'edition' => $edition,
				);

				return array_merge( $clean, self::pdf_extras( $body, array( 'name' ) ) );

			case '/pdf/match':
				$bride = self::birth( $body['bride'] ?? null );
				$groom = self::birth( $body['groom'] ?? null );
				if ( null === $bride || null === $groom ) {
					return null;
				}

				$clean = array(
					'bride'   => $bride,
					'groom'   => $groom,
					'options' => self::pdf_options( $body ),
				);

				return array_merge( $clean, self::pdf_extras( $body, array( 'name', 'partner_name' ) ) );
		}

		return null;
	}

	/**
	 * A place: latitude and longitude in range, and an optional zone, UTC
	 * offset (not both) and label.
	 *
	 * @param mixed $value What was sent.
	 * @return array<string, mixed>|null The place, or null.
	 */
	private static function place( $value ): ?array {
		if ( ! is_array( $value ) ) {
			return null;
		}

		$lat = $value['latitude'] ?? null;
		$lon = $value['longitude'] ?? null;
		if ( ! ( is_int( $lat ) || is_float( $lat ) ) || ! ( is_int( $lon ) || is_float( $lon ) ) ) {
			return null;
		}
		if ( abs( (float) $lat ) > 89.9 || abs( (float) $lon ) > 180 ) {
			return null;
		}

		$place = array(
			'latitude'  => (float) $lat,
			'longitude' => (float) $lon,
		);

		if ( isset( $value['timezone'] ) ) {
			if ( ! is_string( $value['timezone'] ) || strlen( $value['timezone'] ) > 64 || ! preg_match( '#^[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+)*$#', $value['timezone'] ) ) {
				return null;
			}
			$place['timezone'] = $value['timezone'];
		} elseif ( isset( $value['utc_offset'] ) ) {
			if ( ! is_string( $value['utc_offset'] ) || ! preg_match( '/^[+-]\d{2}:\d{2}$/', $value['utc_offset'] ) ) {
				return null;
			}
			$place['utc_offset'] = $value['utc_offset'];
		}

		if ( isset( $value['place'] ) && is_string( $value['place'] ) && '' !== trim( $value['place'] ) ) {
			$place['place'] = mb_substr( sanitize_text_field( $value['place'] ), 0, 120 );
		}

		return $place;
	}

	/**
	 * A birth: a wall clock and a place.
	 *
	 * @param mixed $value What was sent.
	 * @return array<string, mixed>|null The birth, or null.
	 */
	private static function birth( $value ): ?array {
		if ( ! is_array( $value ) || ! isset( $value['datetime'] ) || ! is_string( $value['datetime'] ) ) {
			return null;
		}
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/', $value['datetime'] ) ) {
			return null;
		}

		$place = self::place( $value );

		return null === $place ? null : array_merge( array( 'datetime' => $value['datetime'] ), $place );
	}

	/**
	 * `options.language` as the API takes it: `en`, `hi`, or both.
	 *
	 * @param mixed $value What was sent.
	 * @return string|string[] The language or languages; English when nothing usable was sent.
	 */
	private static function languages( $value ) {
		$list = is_array( $value ) ? array_values( $value ) : array( $value );
		$kept = array_values( array_unique( array_filter( $list, static fn( $lang ): bool => in_array( $lang, array( 'en', 'hi' ), true ) ) ) );

		if ( array() === $kept ) {
			return 'en';
		}

		return 1 === count( $kept ) ? $kept[0] : $kept;
	}

	/**
	 * A PDF's options: its language, and the site's disclaimer rather than
	 * whatever the page sent.
	 *
	 * @param array<string, mixed> $body What the widget sent.
	 * @return array<string, mixed> The options.
	 */
	private static function pdf_options( array $body ): array {
		$options = array( 'language' => self::languages( $body['options']['language'] ?? null ) );

		$disclaimer = Settings::disclaimer_attributes();
		if ( isset( $disclaimer['disclaimer'] ) ) {
			$options['disclaimer'] = 'off';
		} elseif ( isset( $disclaimer['disclaimer-name'] ) ) {
			$options['disclaimer'] = array_filter(
				array(
					'name' => $disclaimer['disclaimer-name'],
					'url'  => $disclaimer['disclaimer-url'] ?? null,
				)
			);
		}

		return $options;
	}

	/**
	 * The names on a PDF's cover, its template and its chart style.
	 *
	 * @param array<string, mixed> $body  What the widget sent.
	 * @param string[]             $names The name fields this PDF takes.
	 * @return array<string, string> The fields that were sent and are valid.
	 */
	private static function pdf_extras( array $body, array $names ): array {
		$extras = array();

		foreach ( $names as $field ) {
			if ( isset( $body[ $field ] ) && is_string( $body[ $field ] ) ) {
				$name = trim( mb_substr( sanitize_text_field( $body[ $field ] ), 0, 120 ) );
				if ( '' !== $name ) {
					$extras[ $field ] = $name;
				}
			}
		}

		if ( isset( $body['template'] ) && in_array( $body['template'], Settings::PRESETS, true ) ) {
			$extras['template'] = $body['template'];
		}

		if ( isset( $body['chart_style'] ) && in_array( $body['chart_style'], array( 'north', 'south' ), true ) ) {
			$extras['chart_style'] = $body['chart_style'];
		}

		return $extras;
	}

	/**
	 * Whether a request's `Origin` is this site's. A request without one — a
	 * same-origin `GET`, an old browser — is let through to the other checks.
	 *
	 * @param string $origin The `Origin` header, or an empty string.
	 * @return bool False only for a request that names another origin.
	 */
	public static function same_origin( string $origin ): bool {
		if ( '' === $origin ) {
			return true;
		}

		return strtolower( rtrim( $origin, '/' ) ) === strtolower( Settings::origin() );
	}

	/**
	 * Counts one request against the visitor's minute, per bucket.
	 *
	 * The key is a salted hash of the IP address, so the options table never
	 * holds an address; an IPv6 address counts by its /64 ({@see rate_subject()}).
	 * The window is fixed: it starts at the first request and lasts sixty
	 * seconds.
	 *
	 * @param string $bucket `month` or `pdf`.
	 * @param string $ip     The visitor's address.
	 * @return int Seconds to wait, or 0 when the request may go ahead.
	 */
	public static function rate_limit( string $bucket, string $ip ): int {
		$limit = 'pdf' === $bucket ? (int) Settings::get( 'rate_pdf' ) : (int) Settings::get( 'rate_month' );
		if ( $limit <= 0 ) {
			return 0;
		}

		$key = self::RATE_PREFIX . $bucket . '_' . substr( wp_hash( $bucket . '|' . self::rate_subject( $ip ), 'nonce' ), 0, 32 );

		return self::count( $key, $limit, MINUTE_IN_SECONDS );
	}

	/**
	 * Counts one call to the API against the site's day, per bucket.
	 *
	 * The per-visitor minute is only as good as the visitor's address, and a
	 * script can rotate addresses; this bounds the day whatever it does. The
	 * day is UTC's, and the cap is {@see DAILY_CAPS} unless the site filters
	 * it.
	 *
	 * @param string $bucket `month` or `pdf`.
	 * @return int Seconds to wait (until 00:00 UTC), or 0 when the call may go ahead.
	 */
	public static function daily_cap( string $bucket ): int {
		/**
		 * How many calls a UTC day the proxy relays to the API, per bucket.
		 * Zero or less turns the cap off.
		 *
		 * @param int    $cap    The default: 500 for `month`, 50 for `pdf`.
		 * @param string $bucket `month` or `pdf`.
		 */
		$cap = (int) apply_filters( 'kaal_jyoti_proxy_daily_cap', self::DAILY_CAPS[ $bucket ] ?? 0, $bucket );
		if ( $cap <= 0 ) {
			return 0;
		}

		$now      = time();
		$midnight = ( intdiv( $now, DAY_IN_SECONDS ) + 1 ) * DAY_IN_SECONDS;

		return self::count( self::CAP_PREFIX . $bucket . '_' . gmdate( 'Ymd', $now ), $cap, $midnight - $now );
	}

	/**
	 * What the per-visitor limit counts by: the address, or for IPv6 its /64.
	 *
	 * One IPv6 host is usually given a whole /64 and can take a new address
	 * in it for every request, so the /64 is the visitor.
	 *
	 * @param string $ip The address.
	 * @return string The address, or the /64 it is in.
	 */
	public static function rate_subject( string $ip ): string {
		if ( false === filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 ) ) {
			return $ip;
		}

		$packed = inet_pton( $ip );
		if ( false === $packed || 16 !== strlen( $packed ) ) {
			return $ip;
		}

		return (string) inet_ntop( substr( $packed, 0, 8 ) . str_repeat( "\0", 8 ) ) . '/64';
	}

	/**
	 * Counts one against `$key`'s window and says whether it was over.
	 *
	 * With a persistent object cache the count is `wp_cache_incr()`, which is
	 * atomic, so concurrent requests cannot all read the same count and go
	 * ahead. Without one it is a transient: read, add one, write, which two
	 * requests at the same instant can both pass, and is what WordPress offers.
	 *
	 * @param string $key   The counter.
	 * @param int    $limit The most a window allows.
	 * @param int    $ttl   A new window's length, in seconds.
	 * @return int Seconds to wait, or 0 when this one is within the limit.
	 */
	private static function count( string $key, int $limit, int $ttl ): int {
		$now = time();
		$ttl = max( 1, $ttl );

		if ( wp_using_ext_object_cache() ) {
			// `add` writes only when the key is absent, so the first request
			// of a window sets its end and every other leaves it.
			wp_cache_add( $key . '_until', $now + $ttl, self::COUNTER_GROUP, $ttl );
			wp_cache_add( $key, 0, self::COUNTER_GROUP, $ttl );
			$count = wp_cache_incr( $key, 1, self::COUNTER_GROUP );
			if ( false !== $count ) {
				if ( (int) $count <= $limit ) {
					return 0;
				}

				$until = (int) wp_cache_get( $key . '_until', self::COUNTER_GROUP );

				return max( 1, ( $until > $now ? $until : $now + $ttl ) - $now );
			}
			// The cache would not count: fall back to the transient.
		}

		$entry = get_transient( $key );
		if ( ! is_array( $entry ) || ! isset( $entry['until'], $entry['count'] ) || (int) $entry['until'] <= $now ) {
			$entry = array(
				'until' => $now + $ttl,
				'count' => 0,
			);
		}

		if ( (int) $entry['count'] >= $limit ) {
			return max( 1, (int) $entry['until'] - $now );
		}

		++$entry['count'];
		set_transient( $key, $entry, max( 1, (int) $entry['until'] - $now ) );

		return 0;
	}

	/**
	 * The transient a month answer is kept under: the API, the path and the
	 * rebuilt body, so two widgets asking the same month share it.
	 *
	 * @param string               $path The path.
	 * @param array<string, mixed> $body The rebuilt body.
	 * @return string The transient name.
	 */
	public static function cache_key( string $path, array $body ): string {
		return self::CACHE_PREFIX . md5( Settings::api_base() . '|' . $path . '|' . (string) wp_json_encode( $body ) );
	}

	/**
	 * How long a month answer is kept.
	 *
	 * @return int Seconds.
	 */
	private static function cache_seconds(): int {
		return max( 1, (int) Settings::get( 'month_cache_hours' ) ) * HOUR_IN_SECONDS;
	}

	/**
	 * The `X-KJ-Client` sent on: the widget's own tag when it is one, so
	 * usage is attributed to the widgets, else the plugin's.
	 *
	 * @param string $sent What the widget sent.
	 * @return string The tag.
	 */
	private static function client_tag( string $sent ): string {
		return preg_match( '#^widgets/\d+\.\d+\.\d+[\w.+-]*$#', $sent ) && strlen( $sent ) <= 64 ? $sent : Settings::client_tag();
	}

	/**
	 * The headers the widget reads, from the API's answer.
	 *
	 * @param array<string, mixed>|object $answer What `wp_remote_post()` returned.
	 * @return array<string, string> Header name to value.
	 */
	private static function relayed_headers( $answer ): array {
		$headers = array();

		foreach ( self::RELAYED_HEADERS as $name => $spelling ) {
			$value = wp_remote_retrieve_header( $answer, $name );
			if ( is_array( $value ) ) {
				$value = (string) end( $value );
			}
			if ( is_string( $value ) && '' !== $value && preg_match( '/^[\w.:, -]{1,128}$/', $value ) ) {
				$headers[ $spelling ] = $value;
			}
		}

		return $headers;
	}

	/**
	 * The PDF's filename from the API's `Content-Disposition`, kept only when
	 * it is a plain name.
	 *
	 * @param string $disposition The header.
	 * @param string $path        The PDF route, for the fallback name.
	 * @return string A name ending in `.pdf`.
	 */
	public static function file_name( string $disposition, string $path ): string {
		if ( preg_match( '/filename="?([^";]+)"?/i', $disposition, $found ) && preg_match( '/^[\w.-]{1,120}\.pdf$/', $found[1] ) ) {
			return $found[1];
		}

		return '/pdf/match' === $path ? 'match.pdf' : 'kundli.pdf';
	}

	/**
	 * The proxy's own refusal, in the API's envelope.
	 *
	 * @param int    $status  The HTTP status.
	 * @param string $code    A `proxy_…` code.
	 * @param string $message What went wrong, for the site owner's network tab.
	 * @return array{status: int, headers: array<string, string>, body: string} The answer.
	 */
	private static function refusal( int $status, string $code, string $message ): array {
		return array(
			'status'  => $status,
			'headers' => self::with_security_headers( array( 'Content-Type' => 'application/json; charset=utf-8' ) ),
			'body'    => (string) wp_json_encode(
				array(
					'status' => 'error',
					'error'  => array(
						'code'    => $code,
						'message' => $message,
					),
				)
			),
		);
	}

	/**
	 * No caching by a shared cache, and no sniffing.
	 *
	 * @param array<string, string> $headers The headers so far.
	 * @return array<string, string> With the two added.
	 */
	private static function with_security_headers( array $headers ): array {
		$headers['X-Content-Type-Options'] = 'nosniff';
		$headers['Cache-Control']          = $headers['Cache-Control'] ?? 'private, no-store';

		return $headers;
	}

	/**
	 * The visitor's address: `REMOTE_ADDR`, which is the connection's and
	 * cannot be forged. A site behind a reverse proxy or a CDN sees the
	 * proxy's address there and can say which header to trust with the
	 * `kaal_jyoti_proxy_client_ip` filter (the readme has the Cloudflare
	 * example).
	 *
	 * @return string The address, or an empty string.
	 */
	private static function client_ip(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';

		/**
		 * The address the proxy's rate limits count by.
		 *
		 * @param string $ip `REMOTE_ADDR`.
		 */
		return (string) apply_filters( 'kaal_jyoti_proxy_client_ip', $ip );
	}
}
