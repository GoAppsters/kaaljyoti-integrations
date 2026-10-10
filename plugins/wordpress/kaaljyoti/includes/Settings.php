<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The option schema, its sanitisation, the settings page and the connection test.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * Everything stored under `kaal_jyoti_settings`.
 *
 * One option row holds the whole schema, which is what `register_setting()`
 * wants and what keeps `uninstall.php` to a single `delete_option()`.
 *
 * The secret key is stored in that row as it was typed. WordPress has no
 * secret store, so every plugin that talks to an API keeps its key in
 * `wp_options`; hiding it behind an encryption whose key would sit in the same
 * database would buy nothing (design decision 5). It is masked in the UI, it
 * is never printed in full, and it never reaches the browser.
 */
final class Settings {

	/** The one option row. */
	public const OPTION = 'kaal_jyoti_settings';

	/** The plugin's user documentation on kaaljyoti.com. */
	public const DOCS_URL = 'https://kaaljyoti.com/api/docs/wordpress';

	/** The settings group `register_setting()` and `settings_fields()` share. */
	public const GROUP = 'kaal_jyoti';

	/** The settings page slug. */
	public const PAGE = 'kaal-jyoti';

	/** Where the API lives. */
	public const PRODUCTION_BASE_URL = 'https://api.kaaljyoti.com';

	/**
	 * The wp-config.php constant a developer sets to point the plugin at
	 * another API origin, for example a staging host:
	 * `define( 'KAAL_JYOTI_API_BASE', 'https://staging.example.com' );`.
	 * There is no settings field for it (owner decision, 6 October 2026).
	 */
	public const API_BASE_CONSTANT = 'KAAL_JYOTI_API_BASE';

	/** Where a site owner lists the origins a publishable key may be used from. */
	public const DASHBOARD_KEYS_URL = 'https://kaaljyoti.com/api/dashboard/keys';

	/** Where a site owner makes a Google Maps Platform key. */
	public const GOOGLE_KEYS_URL = 'https://console.cloud.google.com/google/maps-apis/credentials';

	/**
	 * The eight cities a `city="…"` attribute can name, with what a server
	 * call needs: the same list the widget bundle carries.
	 *
	 * @var array<string, array{name: string, latitude: float, longitude: float, timezone: string}>
	 */
	public const CITIES = array(
		'delhi'     => array(
			'name'      => 'New Delhi',
			'latitude'  => 28.6139,
			'longitude' => 77.209,
			'timezone'  => 'Asia/Kolkata',
		),
		'mumbai'    => array(
			'name'      => 'Mumbai',
			'latitude'  => 19.076,
			'longitude' => 72.8777,
			'timezone'  => 'Asia/Kolkata',
		),
		'kolkata'   => array(
			'name'      => 'Kolkata',
			'latitude'  => 22.5726,
			'longitude' => 88.3639,
			'timezone'  => 'Asia/Kolkata',
		),
		'chennai'   => array(
			'name'      => 'Chennai',
			'latitude'  => 13.0827,
			'longitude' => 80.2707,
			'timezone'  => 'Asia/Kolkata',
		),
		'bengaluru' => array(
			'name'      => 'Bengaluru',
			'latitude'  => 12.9716,
			'longitude' => 77.5946,
			'timezone'  => 'Asia/Kolkata',
		),
		'hyderabad' => array(
			'name'      => 'Hyderabad',
			'latitude'  => 17.385,
			'longitude' => 78.4867,
			'timezone'  => 'Asia/Kolkata',
		),
		'jaipur'    => array(
			'name'      => 'Jaipur',
			'latitude'  => 26.9124,
			'longitude' => 75.7873,
			'timezone'  => 'Asia/Kolkata',
		),
		'varanasi'  => array(
			'name'      => 'Varanasi',
			'latitude'  => 25.3176,
			'longitude' => 82.9739,
			'timezone'  => 'Asia/Kolkata',
		),
	);

	/** The three appearance modes; `auto` inherits the page's own colours. */
	public const THEMES = array( 'auto', 'light', 'dark' );

	/**
	 * The widget presets, after the PDF templates: accent colours, heading
	 * face and header style. `classic` is what the bundle draws untold.
	 */
	public const PRESETS = array( 'classic', 'modern', 'minimal', 'traditional' );

	/**
	 * Where the forms' place search looks: `auto` is Google Places with a
	 * Google Maps key and Photon without one; the others pin one. Every one
	 * falls back to the Kaal Jyoti API's own place index.
	 */
	public const PLACE_PROVIDERS = array( 'auto', 'google', 'photon', 'kaaljyoti' );

	/** The public Photon server the bundle uses when no Photon URL is set. */
	public const PHOTON_URL = 'https://photon.komoot.io';

	/**
	 * The three disclaimer choices: the API's own line, a line naming the
	 * site's astrologer, or no line at all.
	 */
	public const DISCLAIMERS = array( 'default', 'astrologer', 'off' );

	/**
	 * Where the widgets take their type from: their own stacks, or the
	 * theme's font (`data-font="inherit"`).
	 */
	public const FONT_MODES = array( 'system', 'inherit' );

	/** The kundli PDF editions the API prints. */
	public const PDF_EDITIONS = array( 'basic', 'professional' );

	/** The birth forms' time fields: with AM/PM, or 0–23. */
	public const TIME_FORMATS = array( '12', '24' );

	/**
	 * The zodiac sign icons (widgets decision 29): the sign's symbol on a
	 * tile in its element's colours (the bundle's default), the symbol in a
	 * ring, the Hindi name in a seal, or the site's own images.
	 */
	public const SIGN_ICON_THEMES = array( 'element', 'glyph', 'devanagari', 'custom' );

	/**
	 * The image size a sign's own image is written out at: big enough for the
	 * horoscope picker's tile on a high-density screen (about 100px), small
	 * enough not to send the original upload. WordPress gives the full image
	 * when an upload is smaller than this.
	 */
	public const SIGN_IMAGE_SIZE = 'medium';

	/**
	 * The proxy's per-visitor limits, per minute: default, lowest, highest.
	 *
	 * @var array<string, array{0: int, 1: int, 2: int}>
	 */
	public const RATE_LIMITS = array(
		'rate_month' => array( 10, 1, 600 ),
		'rate_pdf'   => array( 3, 1, 60 ),
	);

	/** The longest a month answer may be cached, in hours (a week). */
	public const MAX_MONTH_CACHE_HOURS = 168;

	/** The largest corner radius the settings page accepts, in pixels. */
	public const MAX_RADIUS = 48;

	/**
	 * The colour overrides, by setting key, with the custom properties each one sets.
	 *
	 * The background sets both `--kj-surface` (the card) and `--kj-bg` (the
	 * chart's own background), because a site that picks one colour means both.
	 *
	 * @var array<string, string[]>
	 */
	public const COLOR_PROPERTIES = array(
		'color_background' => array( '--kj-surface', '--kj-bg' ),
		'color_text'       => array( '--kj-text' ),
		'color_accent'     => array( '--kj-lagna', '--kj-accent' ),
		'color_line'       => array( '--kj-line' ),
		'color_muted'      => array( '--kj-muted' ),
		'color_good'       => array( '--kj-good' ),
		'color_bad'        => array( '--kj-bad' ),
	);

	/**
	 * What a fresh install answers for every key.
	 *
	 * There is no `base_url` here: the API origin is production unless the
	 * {@see API_BASE_CONSTANT} constant says otherwise. A row saved by 0.1.0
	 * may still hold a `base_url` (the QA site's held staging); {@see all()}
	 * only keeps keys listed here, so it is never read, and the next save
	 * leaves it out.
	 *
	 * @return array<string, mixed> The defaults.
	 */
	public static function defaults(): array {
		return array(
			'publishable_key'   => '',
			'secret_key'        => '',
			'google_maps_key'   => '',
			'place_provider'    => 'auto',
			'photon_url'        => '',
			'default_city'      => 'delhi',
			'language'          => 'en',
			'powered_by'        => 'hidden',
			'render_mode'       => 'browser',
			'cache_minutes'     => 15,
			'disclaimer'        => 'default',
			'disclaimer_name'   => '',
			'disclaimer_url'    => '',
			'theme'             => 'auto',
			'preset'            => 'classic',
			'color_background'  => '',
			'color_text'        => '',
			'color_accent'      => '',
			'color_line'        => '',
			'color_muted'       => '',
			'color_good'        => '',
			'color_bad'         => '',
			'font'              => '',
			'radius'            => '',
			'font_mode'         => 'system',
			'time_format'       => '12',
			'remember'          => true,
			'pricing_url'       => '',
			'proxy_docs_url'    => '',
			'proxy'             => true,
			'proxy_nonce'       => true,
			'pdf'               => false,
			'pdf_editions'      => array( 'basic' ),
			'rate_month'        => self::RATE_LIMITS['rate_month'][0],
			'rate_pdf'          => self::RATE_LIMITS['rate_pdf'][0],
			'month_cache_hours' => 12,
			'sign_icons'        => 'element',
			'sign_images'       => array(),
		);
	}

	/**
	 * Every setting, stored values over defaults.
	 *
	 * @return array<string, mixed> The whole schema, with no missing keys.
	 */
	public static function all(): array {
		$stored = get_option( self::OPTION, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}

		return array_merge( self::defaults(), array_intersect_key( $stored, self::defaults() ) );
	}

	/**
	 * One setting.
	 *
	 * @param string $key A key of {@see defaults()}.
	 * @return mixed The stored value, or the default.
	 */
	public static function get( string $key ) {
		$all = self::all();

		return $all[ $key ] ?? null;
	}

	/**
	 * The widget preset, held to its four values.
	 *
	 * @return string `classic`, `modern`, `minimal` or `traditional`.
	 */
	public static function preset(): string {
		$preset = (string) self::get( 'preset' );

		return in_array( $preset, self::PRESETS, true ) ? $preset : 'classic';
	}

	/**
	 * The PDF editions offered, held to the two the API prints.
	 *
	 * @return string[] In the order `basic`, `professional`.
	 */
	public static function pdf_editions(): array {
		$stored = self::get( 'pdf_editions' );

		return array_values( array_intersect( self::PDF_EDITIONS, is_array( $stored ) ? $stored : array() ) );
	}

	/**
	 * Whether a string is a secret key: `kj_live_` or `kj_test_` and a body.
	 *
	 * @param string $key The stored value.
	 * @return bool Whether the proxy and server rendering may use it.
	 */
	public static function is_secret_key( string $key ): bool {
		return 1 === preg_match( '/^kj_(live|test)_[A-Za-z0-9_-]+$/', $key );
	}

	/**
	 * The API origin every call goes to: the server's, and the one the
	 * widget bundle is told about.
	 *
	 * @return string The {@see API_BASE_CONSTANT} constant, normalised, when it is set and an https URL; production otherwise.
	 */
	public static function api_base(): string {
		$constant = self::api_base_constant();
		$base     = null === $constant ? null : self::normalize_base_url( $constant );

		return null === $base ? self::PRODUCTION_BASE_URL : $base;
	}

	/**
	 * The {@see API_BASE_CONSTANT} constant as wp-config.php wrote it.
	 *
	 * @return string|null Its value, or null when it is not defined (or not a string).
	 */
	public static function api_base_constant(): ?string {
		if ( ! defined( self::API_BASE_CONSTANT ) ) {
			return null;
		}

		$value = constant( self::API_BASE_CONSTANT );

		return is_string( $value ) ? $value : null;
	}

	/**
	 * The font mode, held to its two values.
	 *
	 * @return string `system` or `inherit`.
	 */
	public static function font_mode(): string {
		$mode = (string) self::get( 'font_mode' );

		return in_array( $mode, self::FONT_MODES, true ) ? $mode : 'system';
	}

	/**
	 * The birth forms' time format, held to its two values.
	 *
	 * @return string `12` or `24`.
	 */
	public static function time_format(): string {
		$format = (string) self::get( 'time_format' );

		return in_array( $format, self::TIME_FORMATS, true ) ? $format : '12';
	}

	/**
	 * The appearance mode, held to its three values.
	 *
	 * @return string `auto`, `light` or `dark`.
	 */
	public static function theme(): string {
		$theme = (string) self::get( 'theme' );

		return in_array( $theme, self::THEMES, true ) ? $theme : 'auto';
	}

	/**
	 * The sign icon theme, held to its four values.
	 *
	 * @return string `element`, `glyph`, `devanagari` or `custom`.
	 */
	public static function sign_icons(): string {
		$theme = (string) self::get( 'sign_icons' );

		return in_array( $theme, self::SIGN_ICON_THEMES, true ) ? $theme : 'element';
	}

	/**
	 * The stored images, one attachment id per sign, held to the twelve signs
	 * and to positive integers.
	 *
	 * @return array<string, int> Sign id to attachment id, in zodiac order.
	 */
	public static function sign_images(): array {
		$stored = self::get( 'sign_images' );
		$images = array();
		if ( ! is_array( $stored ) ) {
			return $images;
		}

		foreach ( array_keys( Elements::SIGNS ) as $sign ) {
			$id = isset( $stored[ $sign ] ) && is_scalar( $stored[ $sign ] ) ? max( 0, (int) $stored[ $sign ] ) : 0;
			if ( $id > 0 ) {
				$images[ $sign ] = $id;
			}
		}

		return $images;
	}

	/**
	 * The URL of a sign's image, as the widgets may load it.
	 *
	 * The attachment must still be an image. The URL is the
	 * {@see SIGN_IMAGE_SIZE} one; it must be `https://`, or on this site, in
	 * which case it is written as a path (`/wp-content/uploads/…`) so that a
	 * site served over plain HTTP — a local one — still gets its images:
	 * the bundle accepts only those two (decision 29).
	 *
	 * @param int $attachment The attachment id.
	 * @return string|null The URL, or null.
	 */
	public static function sign_image_url( int $attachment ): ?string {
		if ( $attachment <= 0 || ! wp_attachment_is_image( $attachment ) ) {
			return null;
		}

		$url = wp_get_attachment_image_url( $attachment, self::SIGN_IMAGE_SIZE );

		return is_string( $url ) ? self::safe_image_url( $url ) : null;
	}

	/**
	 * An image URL the widgets may load: `https://`, or this site's own,
	 * written as a path. Anything with a quote, a bracket, a backslash or a
	 * space is refused outright.
	 *
	 * @param string $url An absolute URL.
	 * @return string|null The URL or the path, or null.
	 */
	public static function safe_image_url( string $url ): ?string {
		$url = trim( $url );
		if ( '' === $url || 1 === preg_match( '/[\s"\'<>\\\\]/', $url ) ) {
			return null;
		}

		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) || empty( $parts['scheme'] ) ) {
			return null;
		}

		$home = wp_parse_url( home_url() );
		$same = is_array( $home ) && isset( $home['host'] ) && strtolower( $home['host'] ) === strtolower( $parts['host'] )
			&& ( $home['port'] ?? null ) === ( $parts['port'] ?? null );
		if ( $same && in_array( strtolower( $parts['scheme'] ), array( 'http', 'https' ), true ) ) {
			$path = ( $parts['path'] ?? '/' ) . ( isset( $parts['query'] ) ? '?' . $parts['query'] : '' );

			return '/' === substr( $path, 0, 1 ) ? $path : null;
		}

		return 'https' === strtolower( $parts['scheme'] ) ? $url : null;
	}

	/**
	 * The sign images as the widgets read them: sign id to URL, only the signs
	 * with a usable image.
	 *
	 * @return array<string, string> In zodiac order.
	 */
	public static function sign_image_urls(): array {
		$urls = array();
		foreach ( self::sign_images() as $sign => $attachment ) {
			$url = self::sign_image_url( $attachment );
			if ( null !== $url ) {
				$urls[ $sign ] = $url;
			}
		}

		return $urls;
	}

	/**
	 * What the script tag's `data-sign-icons` says.
	 *
	 * With images chosen, they go out as a JSON map of sign to URL whatever
	 * the theme, so a block set to "the site's own images" has them; a theme
	 * other than "your own images" rides in the map as `theme`, the page's
	 * default. Without images: nothing for the bundle's own default, else
	 * the theme's name ("your own images" with none usable is nothing, so
	 * the default draws).
	 *
	 * @return string|null The value, unescaped; the caller escapes it.
	 */
	public static function sign_icons_attribute(): ?string {
		$theme = self::sign_icons();
		$urls  = self::sign_image_urls();

		if ( array() === $urls ) {
			return in_array( $theme, array( 'element', 'custom' ), true ) ? null : $theme;
		}

		if ( 'custom' !== $theme ) {
			$urls['theme'] = $theme;
		}

		$json = wp_json_encode( $urls, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT );

		return is_string( $json ) ? $json : null;
	}

	/**
	 * Registers the hooks the settings page and its connection test need.
	 *
	 * @return void
	 */
	public static function hooks(): void {
		add_action( 'admin_menu', array( self::class, 'add_page' ) );
		add_action( 'admin_init', array( self::class, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'enqueue_admin' ) );
		add_action( 'wp_ajax_kaal_jyoti_test', array( self::class, 'ajax_test' ) );
	}

	/**
	 * Adds Settings → Kaal Jyoti.
	 *
	 * @return void
	 */
	public static function add_page(): void {
		add_options_page(
			__( 'Kaal Jyoti', 'kaaljyoti' ),
			__( 'Kaal Jyoti', 'kaaljyoti' ),
			'manage_options',
			self::PAGE,
			array( self::class, 'render_page' )
		);
	}

	/**
	 * Registers the option, its sections and its fields.
	 *
	 * @return void
	 */
	public static function register(): void {
		register_setting(
			self::GROUP,
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( self::class, 'sanitize' ),
				'default'           => self::defaults(),
			)
		);

		foreach ( self::sections() as $section => $about ) {
			list( $title, $callback, $tab ) = $about;
			add_settings_section( $section, $title, $callback, self::tab_page( $tab ) );
		}

		$sections = self::sections();
		foreach ( self::fields() as $key => $field ) {
			list( $label, $section ) = $field;
			add_settings_field(
				'kaal_jyoti_' . $key,
				$label,
				array( self::class, 'render_field' ),
				self::tab_page( $sections[ $section ][2] ),
				$section,
				array(
					'key'       => $key,
					'label_for' => 'kaal_jyoti_' . $key,
				)
			);
		}
	}

	/**
	 * The settings page's tabs, in order: slug to label and the one line
	 * under the tabs that says what the tab holds. The first is the default.
	 *
	 * @return array<string, array{0: string, 1: string}> Slug to label and description.
	 */
	public static function tabs(): array {
		return array(
			'connection' => array(
				__( 'Connection', 'kaaljyoti' ),
				__( 'Your Kaal Jyoti keys, this site\'s origin for the key\'s origin list, and a test that the API answers.', 'kaaljyoti' ),
			),
			'appearance' => array(
				__( 'Appearance', 'kaaljyoti' ),
				__( 'How every widget looks: the style, light or dark, colours, type, corners, the "Powered by" line and the zodiac sign icons.', 'kaaljyoti' ),
			),
			'forms'      => array(
				__( 'Defaults and forms', 'kaaljyoti' ),
				__( 'The city and language every widget starts with, and how the birth and match forms ask for a birth and search for a place.', 'kaaljyoti' ),
			),
			'reports'    => array(
				__( 'Reports and PDFs', 'kaaljyoti' ),
				__( 'The line every horoscope and reading ends with, and the "Download PDF" button on the kundli report and the match result.', 'kaaljyoti' ),
			),
			'advanced'   => array(
				__( 'Advanced', 'kaaljyoti' ),
				__( 'What this site does with the secret key: the server proxy and its limits, the month cache, server rendering, and where owner notes link to.', 'kaaljyoti' ),
			),
			'shortcodes' => array(
				__( 'Shortcodes', 'kaaljyoti' ),
				__( 'Every shortcode, ready to copy into a post. Each one has a matching block in the editor.', 'kaaljyoti' ),
			),
		);
	}

	/**
	 * The settings sections, in the order they are drawn: id to title,
	 * the callback that prints the blurb under the title, and the tab.
	 *
	 * @return array<string, array{0: string, 1: callable, 2: string}> Section id to title, callback and tab.
	 */
	private static function sections(): array {
		return array(
			'kaal_jyoti_keys'       => array( __( 'Keys', 'kaaljyoti' ), array( self::class, 'section_keys' ), 'connection' ),
			'kaal_jyoti_appearance' => array( __( 'Style and colours', 'kaaljyoti' ), array( self::class, 'section_appearance' ), 'appearance' ),
			'kaal_jyoti_signs'      => array( __( 'Zodiac sign icons', 'kaaljyoti' ), array( self::class, 'section_signs' ), 'appearance' ),
			'kaal_jyoti_display'    => array( __( 'Defaults', 'kaaljyoti' ), '__return_false', 'forms' ),
			'kaal_jyoti_forms'      => array( __( 'Birth and match forms', 'kaaljyoti' ), '__return_false', 'forms' ),
			'kaal_jyoti_places'     => array( __( 'Place search', 'kaaljyoti' ), array( self::class, 'section_places' ), 'forms' ),
			'kaal_jyoti_reports'    => array( __( 'Horoscopes and readings', 'kaaljyoti' ), array( self::class, 'section_reports' ), 'reports' ),
			'kaal_jyoti_pdf'        => array( __( 'PDF downloads', 'kaaljyoti' ), array( self::class, 'section_pdf' ), 'reports' ),
			'kaal_jyoti_server'     => array( __( 'Server connection: the proxy and the month cache', 'kaaljyoti' ), array( self::class, 'section_server' ), 'advanced' ),
			'kaal_jyoti_rendering'  => array( __( 'Server rendering', 'kaaljyoti' ), '__return_false', 'advanced' ),
			'kaal_jyoti_links'      => array( __( 'Links in the owner notes', 'kaaljyoti' ), '__return_false', 'advanced' ),
		);
	}

	/**
	 * The settings fields, in the order they are drawn: setting key to
	 * label and section.
	 *
	 * @return array<string, array{0: string, 1: string}> Key to label and section id.
	 */
	private static function fields(): array {
		return array(
			'publishable_key'   => array( __( 'Publishable key', 'kaaljyoti' ), 'kaal_jyoti_keys' ),
			'secret_key'        => array( __( 'Secret key', 'kaaljyoti' ), 'kaal_jyoti_keys' ),
			'preset'            => array( __( 'Style', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'theme'             => array( __( 'Theme', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'color_background'  => array( __( 'Background', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'color_text'        => array( __( 'Text', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'color_accent'      => array( __( 'Accent', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'color_line'        => array( __( 'Lines', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'color_muted'       => array( __( 'Muted text', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'color_good'        => array( __( 'Good windows', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'color_bad'         => array( __( 'Bad windows', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'font_mode'         => array( __( 'Type', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'font'              => array( __( 'Font', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'radius'            => array( __( 'Corner radius', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'powered_by'        => array( __( 'Powered by', 'kaaljyoti' ), 'kaal_jyoti_appearance' ),
			'sign_icons'        => array( __( 'Icons', 'kaaljyoti' ), 'kaal_jyoti_signs' ),
			'sign_images'       => array( __( 'Your own images', 'kaaljyoti' ), 'kaal_jyoti_signs' ),
			'default_city'      => array( __( 'Default city', 'kaaljyoti' ), 'kaal_jyoti_display' ),
			'language'          => array( __( 'Language', 'kaaljyoti' ), 'kaal_jyoti_display' ),
			'time_format'       => array( __( 'Birth time', 'kaaljyoti' ), 'kaal_jyoti_forms' ),
			'remember'          => array( __( 'Remember birth details', 'kaaljyoti' ), 'kaal_jyoti_forms' ),
			'place_provider'    => array( __( 'Search with', 'kaaljyoti' ), 'kaal_jyoti_places' ),
			'google_maps_key'   => array( __( 'Google Maps API key (optional)', 'kaaljyoti' ), 'kaal_jyoti_places' ),
			'photon_url'        => array( __( 'Photon URL (optional)', 'kaaljyoti' ), 'kaal_jyoti_places' ),
			'disclaimer'        => array( __( 'Disclaimer', 'kaaljyoti' ), 'kaal_jyoti_reports' ),
			'pdf'               => array( __( 'PDF downloads', 'kaaljyoti' ), 'kaal_jyoti_pdf' ),
			'proxy'             => array( __( 'Server proxy', 'kaaljyoti' ), 'kaal_jyoti_server' ),
			'proxy_nonce'       => array( __( 'Page check (nonce)', 'kaaljyoti' ), 'kaal_jyoti_server' ),
			'rate_month'        => array( __( 'Month requests per visitor', 'kaaljyoti' ), 'kaal_jyoti_server' ),
			'rate_pdf'          => array( __( 'PDFs per visitor', 'kaaljyoti' ), 'kaal_jyoti_server' ),
			'month_cache_hours' => array( __( 'Keep month answers', 'kaaljyoti' ), 'kaal_jyoti_server' ),
			'render_mode'       => array( __( 'Render mode', 'kaaljyoti' ), 'kaal_jyoti_rendering' ),
			'cache_minutes'     => array( __( 'Cache minutes', 'kaaljyoti' ), 'kaal_jyoti_rendering' ),
			'pricing_url'       => array( __( 'Pricing link', 'kaaljyoti' ), 'kaal_jyoti_links' ),
			'proxy_docs_url'    => array( __( 'Setup guide link', 'kaaljyoti' ), 'kaal_jyoti_links' ),
		);
	}

	/**
	 * The settings keys drawn inside another field rather than as a row of
	 * their own, and the field-less inputs a form posts, by tab.
	 */
	private const TAB_EXTRA_KEYS = array(
		'connection' => array( 'secret_key_remove' ),
		'reports'    => array( 'disclaimer_name', 'disclaimer_url', 'pdf_editions' ),
	);

	/**
	 * The on/off settings. A ticked box posts `1`; an unticked one posts the
	 * hidden `0` before it, or, from a form that lacks the hidden field,
	 * nothing — which is off only when the box is on the tab being saved.
	 */
	private const FLAGS = array( 'remember', 'proxy', 'proxy_nonce', 'pdf' );

	/**
	 * The form field that says which tab was saved.
	 */
	public const TAB_FIELD = '_tab';

	/**
	 * While a tab's form is being sanitised, the keys that tab owns: errors
	 * about any other key are not raised. Null for a whole-form save.
	 *
	 * @var string[]|null
	 */
	private static ?array $saving = null;

	/**
	 * The keys one tab's form edits: its fields, and the inputs drawn
	 * inside them (the astrologer's name and link, the PDF editions, the
	 * secret key's "remove" box).
	 *
	 * @param string $tab A tab slug.
	 * @return string[] The keys, empty for an unknown tab or the shortcodes.
	 */
	public static function tab_keys( string $tab ): array {
		$sections = self::sections();
		$keys     = array();
		foreach ( self::fields() as $key => $field ) {
			if ( $sections[ $field[1] ][2] === $tab ) {
				$keys[] = $key;
			}
		}

		return array_merge( $keys, self::TAB_EXTRA_KEYS[ $tab ] ?? array() );
	}

	/**
	 * The tab a setting is edited on.
	 *
	 * @param string $key A key of {@see defaults()}.
	 * @return string|null The tab slug, or null.
	 */
	public static function tab_of( string $key ): ?string {
		foreach ( array_keys( self::tabs() ) as $tab ) {
			if ( in_array( $key, self::tab_keys( $tab ), true ) ) {
				return $tab;
			}
		}

		return null;
	}

	/**
	 * A tab slug held to the known ones; anything else is the first tab.
	 *
	 * @param mixed $tab What the URL or the form said.
	 * @return string A key of {@see tabs()}.
	 */
	public static function resolve_tab( $tab ): string {
		$tabs = self::tabs();
		$tab  = is_scalar( $tab ) ? strtolower( trim( (string) $tab ) ) : '';

		return isset( $tabs[ $tab ] ) ? $tab : (string) array_key_first( $tabs );
	}

	/**
	 * The tab this request asks for, from `?tab=`.
	 *
	 * @return string A key of {@see tabs()}.
	 */
	public static function current_tab(): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Which tab to show is navigation, not an action.
		$tab = isset( $_GET['tab'] ) && is_string( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : '';

		return self::resolve_tab( $tab );
	}

	/**
	 * The settings page's address, on one tab.
	 *
	 * @param string $tab A tab slug.
	 * @return string The admin URL, for example `…/options-general.php?page=kaal-jyoti&tab=appearance`.
	 */
	public static function tab_url( string $tab ): string {
		return add_query_arg(
			array(
				'page' => self::PAGE,
				'tab'  => self::resolve_tab( $tab ),
			),
			admin_url( 'options-general.php' )
		);
	}

	/**
	 * The page slug one tab's sections are registered under, so that
	 * `do_settings_sections()` draws one tab at a time.
	 *
	 * @param string $tab A tab slug.
	 * @return string For example `kaal-jyoti-appearance`.
	 */
	public static function tab_page( string $tab ): string {
		return self::PAGE . '-' . $tab;
	}

	/**
	 * The note on the Connection tab when wp-config.php sets the API origin,
	 * so a developer can see it is in force. Nothing is drawn without the
	 * constant: a site owner never needs it.
	 *
	 * @return void
	 */
	public static function render_api_base_note(): void {
		$constant = self::api_base_constant();
		if ( null === $constant && ! defined( self::API_BASE_CONSTANT ) ) {
			return;
		}

		$base = null === $constant ? null : self::normalize_base_url( $constant );
		if ( null === $base ) {
			printf(
				'<div class="notice notice-warning inline"><p>%s</p></div>',
				esc_html(
					sprintf(
						/* translators: 1: the constant's name, 2: the production API address. */
						__( '%1$s in wp-config.php is not an https address, so it is ignored and the plugin uses %2$s.', 'kaaljyoti' ),
						self::API_BASE_CONSTANT,
						self::PRODUCTION_BASE_URL
					)
				)
			);

			return;
		}

		printf(
			'<div class="notice notice-info inline"><p>%s <code>%s</code></p></div>',
			esc_html__( 'API address set in wp-config.php:', 'kaaljyoti' ),
			esc_html( $base )
		);
	}

	/**
	 * The blurb above the PDF downloads setting: what it needs, with links to
	 * the tabs where those are set.
	 *
	 * @return void
	 */
	public static function section_pdf(): void {
		printf(
			'<p>%s <a href="%s">%s</a> %s <a href="%s">%s</a>.</p>',
			esc_html__( 'PDFs are fetched by this site, so they need the secret key on', 'kaaljyoti' ),
			esc_url( self::tab_url( 'connection' ) ),
			esc_html__( 'Connection', 'kaaljyoti' ),
			esc_html__( 'and the server proxy on', 'kaaljyoti' ),
			esc_url( self::tab_url( 'advanced' ) ),
			esc_html__( 'Advanced', 'kaaljyoti' )
		);
	}

	/**
	 * The blurb above the key fields: the origin this site sends.
	 *
	 * @return void
	 */
	public static function section_keys(): void {
		printf(
			'<p>%s</p><p><code>%s</code></p><p><a href="%s" target="_blank" rel="noopener noreferrer">%s</a></p>',
			esc_html__(
				'A publishable key may only be used from the origins listed on it. Add this site\'s origin to the key in the dashboard, exactly as it is written here:',
				'kaaljyoti'
			),
			esc_html( self::origin() ),
			esc_url( self::DASHBOARD_KEYS_URL ),
			esc_html__( 'Open the dashboard keys page', 'kaaljyoti' )
		);
	}

	/**
	 * The blurb above the server connection: what the secret key enables.
	 *
	 * @return void
	 */
	public static function section_server(): void {
		printf(
			'<p>%s</p><ul style="list-style:disc;margin-left:1.5em"><li>%s</li><li>%s</li><li>%s</li></ul><p>%s</p><p>%s <code>%s</code></p>',
			esc_html__( 'The publishable key is enough for every widget: visitors\' browsers call the Kaal Jyoti API with it directly. With a secret key, this site also does a few things on its visitors\' behalf:', 'kaaljyoti' ),
			esc_html__( 'PDF downloads of the kundli report and the match result, when switched on under Reports and PDFs. The API never gives a PDF to a browser, so these need the secret key; they are on every paid plan (not Free), and each costs 500 or 1,000 credits and one PDF from the month\'s allowance.', 'kaaljyoti' ),
			esc_html__( 'A cache for the month widgets, Panchang month and Ephemeris: they ask this site, which keeps each month for hours, so a busy page costs one call (20 credits) per place and month instead of one per visitor.', 'kaaljyoti' ),
			esc_html__( 'Server rendering (below), which draws the daily panchang, charts and preset readings on this server.', 'kaaljyoti' ),
			esc_html__( 'The widgets send those requests to this site, which checks them — only these routes, only well-formed bodies, a limit per visitor per minute — and calls the API with the secret key. The key is stored in this site\'s database, is never printed in a page and never reaches a browser. Without a secret key there is no PDF button, and the month widgets call the API with the publishable key like the others.', 'kaaljyoti' ),
			esc_html__( 'The endpoint the widgets use:', 'kaaljyoti' ),
			esc_html( rest_url( Proxy::REST_NAMESPACE . Proxy::ROUTE ) )
		);
	}

	/**
	 * The blurb above the place search settings.
	 *
	 * @return void
	 */
	public static function section_places(): void {
		printf(
			'<p>%s</p>',
			esc_html__(
				'The birth and match forms have an "Other place" choice with a place search: a visitor types three letters, picks a place, and its latitude and longitude are filled in. Choose where it searches.',
				'kaaljyoti'
			)
		);
	}

	/**
	 * The blurb above the disclaimer setting.
	 *
	 * @return void
	 */
	public static function section_reports(): void {
		printf(
			'<p>%s</p>',
			esc_html__(
				'Every horoscope and reading — and the birth form, when it shows readings — ends with a short line saying the predictions are indicative. Choose what that line says for the whole site; one shortcode or block can still choose its own.',
				'kaaljyoti'
			)
		);
	}

	/**
	 * The blurb above the appearance fields.
	 *
	 * @return void
	 */
	public static function section_appearance(): void {
		printf(
			'<p>%s</p>',
			esc_html__(
				'The theme picks a palette; each colour below, when set, replaces that one colour in every mode. Leave a field empty to keep the theme\'s own.',
				'kaaljyoti'
			)
		);
	}

	/**
	 * The blurb above the sign icon fields.
	 *
	 * @return void
	 */
	public static function section_signs(): void {
		printf(
			'<p>%s</p>',
			esc_html__(
				'How a zodiac sign is drawn wherever a widget shows one: the horoscope\'s sign picker, the kundli overview, the calculators, the match result and the planet tables. A block can choose its own in its Display panel.',
				'kaaljyoti'
			)
		);
	}

	/**
	 * The twelve image pickers: a preview, the media library, and "Clear".
	 * The stored value is the attachment id; the page gets its URL.
	 *
	 * @param string $id The id the field's label points at.
	 * @return void
	 */
	private static function render_sign_images( string $id ): void {
		$images = self::sign_images();

		printf( '<div id="%s" class="kaal-jyoti-sign-images" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;max-width:820px">', esc_attr( $id ) );
		foreach ( Elements::SIGNS as $sign => $label ) {
			$attachment = $images[ $sign ] ?? 0;
			$preview    = $attachment > 0 ? wp_get_attachment_image_url( $attachment, 'thumbnail' ) : false;
			$field      = self::OPTION . '[sign_images][' . $sign . ']';

			printf(
				'<div class="kaal-jyoti-sign-image" data-sign="%1$s" style="border:1px solid #dcdcde;border-radius:6px;padding:8px;background:#fff;text-align:center"><div style="font-weight:600;margin-bottom:6px">%2$s</div><div class="kaal-jyoti-sign-preview" style="height:64px;display:flex;align-items:center;justify-content:center;margin-bottom:6px">%3$s</div><input type="hidden" class="kaal-jyoti-sign-id" name="%4$s" value="%5$s" /><button type="button" class="button button-small kaal-jyoti-sign-choose">%6$s</button> <button type="button" class="button-link kaal-jyoti-sign-clear"%7$s>%8$s</button></div>',
				esc_attr( $sign ),
				esc_html( $label ),
				is_string( $preview ) ? sprintf( '<img src="%s" alt="" style="max-width:64px;max-height:64px" />', esc_url( $preview ) ) : '<span class="description">' . esc_html__( 'Default icon', 'kaaljyoti' ) . '</span>',
				esc_attr( $field ),
				esc_attr( $attachment > 0 ? (string) $attachment : '' ),
				esc_html__( 'Choose image', 'kaaljyoti' ),
				$attachment > 0 ? '' : ' hidden',
				esc_html__( 'Clear', 'kaaljyoti' )
			);
		}
		echo '</div>';

		printf(
			'<p class="description">%s</p>',
			esc_html__( 'Used when the icons are "Your own images". Square images look best (at least 96 by 96 pixels; SVG, PNG or WebP). Each is shown as an image with the sign\'s name as its alternative text; a sign without one keeps the default icon. Images must be served over HTTPS or from this site.', 'kaaljyoti' )
		);
	}

	/**
	 * The exact origin the browser sends: scheme, host and port, nothing else.
	 *
	 * @return string For example `https://example.com` or `http://localhost:3000`.
	 */
	public static function origin(): string {
		$home   = home_url();
		$parts  = wp_parse_url( $home );
		$scheme = is_array( $parts ) && isset( $parts['scheme'] ) ? $parts['scheme'] : 'https';
		$host   = is_array( $parts ) && isset( $parts['host'] ) ? $parts['host'] : '';
		$port   = is_array( $parts ) && isset( $parts['port'] ) ? ':' . $parts['port'] : '';

		return $scheme . '://' . $host . $port;
	}

	/**
	 * Draws one settings field.
	 *
	 * @param array<string, mixed> $args The `key` this field edits, and `label_for`.
	 * @return void
	 */
	public static function render_field( array $args ): void {
		$key   = isset( $args['key'] ) ? (string) $args['key'] : '';
		$id    = 'kaal_jyoti_' . $key;
		$name  = self::OPTION . '[' . $key . ']';
		$value = self::get( $key );

		switch ( $key ) {
			case 'publishable_key':
				printf(
					'<input type="text" class="regular-text code" id="%s" name="%s" value="%s" placeholder="kj_pub_…" autocomplete="off" /><p class="description">%s</p>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_html__( 'Starts with kj_pub_. Safe to publish: the origin list on the key is what protects it.', 'kaaljyoti' )
				);
				break;

			case 'secret_key':
				$stored = (string) $value;
				printf(
					'<p><code>%s</code></p><input type="password" class="regular-text code" id="%s" name="%s" value="" placeholder="%s" autocomplete="off" /><p class="description">%s</p><p><label><input type="checkbox" name="%s" value="1" /> %s</label></p>',
					esc_html( '' === $stored ? __( 'Not set', 'kaaljyoti' ) : self::mask( $stored ) ),
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr__( 'Leave blank to keep the stored key', 'kaaljyoti' ),
					esc_html__(
						'Needed only for PDF downloads, the month cache and server rendering (Reports and PDFs, Advanced). Starts with kj_live_ or kj_test_, is never sent to the browser, and is stored in this site\'s options table.',
						'kaaljyoti'
					),
					esc_attr( self::OPTION . '[secret_key_remove]' ),
					esc_html__( 'Remove the stored secret key', 'kaaljyoti' )
				);
				break;

			case 'google_maps_key':
				printf(
					'<input type="text" class="regular-text code" id="%s" name="%s" value="%s" placeholder="AIza…" autocomplete="off" /><p class="description">%s</p><p class="description">%s</p><p><a href="%s" target="_blank" rel="noopener noreferrer">%s</a></p>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_html__(
						'With a key, "Automatic" searches Google Places instead of Photon. Enable Places API (New) and Maps JavaScript API on the key, and restrict it to this site\'s address. Google bills its own usage to your Google account, with its monthly free allowance.',
						'kaaljyoti'
					),
					esc_html__(
						'With a key set, what a visitor types into the place field is sent to Google. Mention Google Maps Platform in your privacy policy.',
						'kaaljyoti'
					),
					esc_url( self::GOOGLE_KEYS_URL ),
					esc_html__( 'Open Google Cloud credentials', 'kaaljyoti' )
				);
				break;

			case 'place_provider':
				self::render_select(
					$id,
					$name,
					(string) $value,
					array(
						'auto'      => __( 'Automatic: Google Places with a Google Maps key, else Photon', 'kaaljyoti' ),
						'photon'    => __( 'Photon (OpenStreetMap)', 'kaaljyoti' ),
						'google'    => __( 'Google Places (needs a Google Maps key)', 'kaaljyoti' ),
						'kaaljyoti' => __( 'Kaal Jyoti only (no third-party service)', 'kaaljyoti' ),
					),
					__( 'Photon is a free OpenStreetMap search run by komoot that finds villages, and costs no Kaal Jyoti credits; the list credits OpenStreetMap. Kaal Jyoti\'s own index has every town and city of 1,000 people or more, 1 credit per search. Whatever you choose, a search that fails falls back to Kaal Jyoti\'s. With Photon or Google, what a visitor types into the place field is sent to that service: mention it in your privacy policy.', 'kaaljyoti' )
				);
				break;

			case 'photon_url':
				printf(
					'<input type="url" class="regular-text code" id="%s" name="%s" value="%s" placeholder="%s" /><p class="description">%s</p>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_attr( self::PHOTON_URL ),
					esc_html__( 'Leave empty for the public Photon server. Set it only if you run your own Photon (an https address).', 'kaaljyoti' )
				);
				break;

			case 'cache_minutes':
				printf(
					'<input type="number" min="1" max="1440" step="1" class="small-text" id="%s" name="%s" value="%s" /><p class="description">%s</p>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_html__( 'How long server-rendered HTML is kept in a transient. 1 to 1440.', 'kaaljyoti' )
				);
				break;

			case 'default_city':
				self::render_select( $id, $name, (string) $value, self::city_choices(), '' );
				break;

			case 'language':
				self::render_select(
					$id,
					$name,
					(string) $value,
					array(
						'en' => __( 'English', 'kaaljyoti' ),
						'hi' => __( 'Hindi', 'kaaljyoti' ),
					),
					''
				);
				break;

			case 'powered_by':
				self::render_select(
					$id,
					$name,
					(string) $value,
					array(
						'hidden' => __( 'Off', 'kaaljyoti' ),
						'shown'  => __( 'Show a "Powered by Kaal Jyoti" link', 'kaaljyoti' ),
					),
					__( 'Off unless you turn it on: a small link to kaaljyoti.com under each widget. A block or shortcode can also turn it on for itself with powered_by="shown".', 'kaaljyoti' )
				);
				break;

			case 'preset':
				self::render_select(
					$id,
					$name,
					(string) $value,
					array(
						'classic'     => __( 'Classic (cream and maroon)', 'kaaljyoti' ),
						'modern'      => __( 'Modern (teal, a solid header)', 'kaaljyoti' ),
						'minimal'     => __( 'Minimal (ink on white)', 'kaaljyoti' ),
						'traditional' => __( 'Traditional (saffron and gold)', 'kaaljyoti' ),
					),
					__( 'The same four looks as the Kaal Jyoti PDF reports, so your widgets and reports match.', 'kaaljyoti' )
				);
				break;

			case 'sign_icons':
				self::render_select(
					$id,
					$name,
					self::sign_icons(),
					array(
						'element'    => __( 'Element tiles: the sign\'s symbol on a tile in fire, earth, air or water colours (default)', 'kaaljyoti' ),
						'glyph'      => __( 'Glyph: the symbol in a thin ring, in the accent colour', 'kaaljyoti' ),
						'devanagari' => __( 'Hindi name: मेष, वृष … in a round seal', 'kaaljyoti' ),
						'custom'     => __( 'Your own images (choose them below)', 'kaaljyoti' ),
					),
					__( 'In tables the icons are small: the symbol alone, in its element\'s colour.', 'kaaljyoti' )
				);
				break;

			case 'sign_images':
				self::render_sign_images( $id );
				break;

			case 'theme':
				self::render_select(
					$id,
					$name,
					(string) $value,
					array(
						'auto'  => __( 'Auto', 'kaaljyoti' ),
						'light' => __( 'Light', 'kaaljyoti' ),
						'dark'  => __( 'Dark', 'kaaljyoti' ),
					),
					__( 'Auto follows your site\'s colours; Light and Dark use Kaal Jyoti\'s own palettes.', 'kaaljyoti' )
				);
				break;

			case 'color_background':
			case 'color_text':
			case 'color_accent':
			case 'color_line':
			case 'color_muted':
			case 'color_good':
			case 'color_bad':
				printf(
					'<input type="text" class="kaal-jyoti-color" id="%s" name="%s" value="%s" data-default-color="" maxlength="7" placeholder="#rrggbb" />',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value )
				);
				break;

			case 'font':
				printf(
					'<input type="text" class="regular-text" id="%s" name="%s" value="%s" placeholder="%s" /><p class="description">%s</p>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_attr( '"Noto Serif", Georgia, serif' ),
					esc_html__( 'A CSS font family list. Empty uses the theme\'s font; the font itself must already be loaded by your site.', 'kaaljyoti' )
				);
				break;

			case 'radius':
				printf(
					'<input type="number" min="0" max="%d" step="1" class="small-text" id="%s" name="%s" value="%s" /> px<p class="description">%s</p>',
					(int) self::MAX_RADIUS,
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_html__( 'The corners of the card, 0 to 48. Empty keeps the default.', 'kaaljyoti' )
				);
				break;

			case 'disclaimer':
				self::render_disclaimer( $id );
				break;

			case 'proxy':
				self::render_checkbox(
					$id,
					$name,
					(bool) $value,
					__( 'Relay PDFs and cache the month widgets\' answers, with the secret key', 'kaaljyoti' ),
					'' === (string) self::get( 'secret_key' ) ? __( 'Needs the secret key (Connection tab); until one is stored, nothing is relayed.', 'kaaljyoti' ) : ''
				);
				break;

			case 'proxy_nonce':
				self::render_checkbox(
					$id,
					$name,
					(bool) $value,
					__( 'Accept only requests from a page this site served in the last day', 'kaaljyoti' ),
					__( 'Recommended. Turn it off only if a page cache keeps pages longer than a day and the PDF button or the month widgets on old cached pages stop loading.', 'kaaljyoti' )
				);
				break;

			case 'pdf':
				self::render_pdf( $id, $name, (bool) $value );
				break;

			case 'rate_month':
			case 'rate_pdf':
				list( , $min, $max ) = self::RATE_LIMITS[ $key ];
				printf(
					'<input type="number" min="%d" max="%d" step="1" class="small-text" id="%s" name="%s" value="%s" /> %s<p class="description">%s</p>',
					(int) $min,
					(int) $max,
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_html__( 'a minute', 'kaaljyoti' ),
					esc_html(
						'rate_pdf' === $key
							? __( 'How many PDFs one visitor may ask for in a minute. Each PDF costs ten calls.', 'kaaljyoti' )
							: __( 'How many month requests one visitor may make in a minute. A cached month does not count.', 'kaaljyoti' )
					)
				);
				break;

			case 'month_cache_hours':
				printf(
					'<input type="number" min="1" max="%d" step="1" class="small-text" id="%s" name="%s" value="%s" /> %s<p class="description">%s</p>',
					(int) self::MAX_MONTH_CACHE_HOURS,
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_html__( 'hours', 'kaaljyoti' ),
					esc_html__( 'A month\'s panchang or ephemeris does not change, so it is kept and served without a call. 1 to 168.', 'kaaljyoti' )
				);
				break;

			case 'time_format':
				self::render_select(
					$id,
					$name,
					self::time_format(),
					array(
						'12' => __( '12-hour, with AM and PM', 'kaaljyoti' ),
						'24' => __( '24-hour', 'kaaljyoti' ),
					),
					__( 'How the birth forms ask for the time of birth.', 'kaaljyoti' )
				);
				break;

			case 'remember':
				self::render_checkbox(
					$id,
					$name,
					(bool) $value,
					__( 'Fill the birth forms in with the visitor\'s last entry', 'kaaljyoti' ),
					__( 'Stored in the visitor\'s own browser only, never on this site; the form has a "Clear" link. Turn it off and the forms forget what they stored.', 'kaaljyoti' )
				);
				break;

			case 'font_mode':
				self::render_select(
					$id,
					$name,
					self::font_mode(),
					array(
						'system'  => __( 'The widgets\' own type', 'kaaljyoti' ),
						'inherit' => __( 'The theme\'s font', 'kaaljyoti' ),
					),
					__( 'The theme\'s font makes the widgets read like the rest of the page; Hindi still falls back to a Devanagari face.', 'kaaljyoti' )
				);
				break;

			case 'pricing_url':
			case 'proxy_docs_url':
				printf(
					'<input type="url" class="regular-text code" id="%s" name="%s" value="%s" placeholder="https://" /><p class="description">%s</p>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( (string) $value ),
					esc_html(
						'pricing_url' === $key
							? __( 'Where the "needs a plan" note sends you, the site owner. Empty: the note has no link.', 'kaaljyoti' )
							: __( 'Where the "needs a server connection" note sends you. Empty: the note has no link.', 'kaaljyoti' )
					)
				);
				break;

			case 'render_mode':
				self::render_select(
					$id,
					$name,
					(string) $value,
					array(
						'browser' => __( 'Browser (the widget bundle)', 'kaaljyoti' ),
						'server'  => __( 'Server (needs a secret key)', 'kaaljyoti' ),
					),
					__( 'Server rendering draws the HTML on this site and caches it; the birth form, the match form, and a horoscope or reading that lets the visitor pick are always rendered in the browser.', 'kaaljyoti' )
				);
				break;
		}
	}

	/**
	 * The disclaimer setting: three choices, and the astrologer's name and
	 * link beside the one that uses them.
	 *
	 * @param string $id The id the field's label points at.
	 * @return void
	 */
	private static function render_disclaimer( string $id ): void {
		$choice  = (string) self::get( 'disclaimer' );
		$choices = array(
			'default'    => __( 'Default line — "These predictions are indicative. For a reading of your own chart, consult an astrologer."', 'kaaljyoti' ),
			'astrologer' => __( 'My astrologer — the line names the astrologer below and suggests consulting them', 'kaaljyoti' ),
			'off'        => __( 'Off — no line at all', 'kaaljyoti' ),
		);

		echo '<fieldset>';
		foreach ( $choices as $value => $label ) {
			printf(
				'<label><input type="radio" id="%s" name="%s" value="%s"%s /> %s</label><br />',
				// The first choice carries the id the row's label points at.
				esc_attr( 'default' === $value ? $id : $id . '_' . $value ),
				esc_attr( self::OPTION . '[disclaimer]' ),
				esc_attr( $value ),
				checked( $choice, $value, false ),
				esc_html( $label )
			);
		}
		echo '</fieldset>';

		printf(
			'<p><label for="%1$s_name">%2$s</label><br /><input type="text" class="regular-text" id="%1$s_name" name="%3$s" value="%4$s" maxlength="%5$d" /></p>',
			esc_attr( $id ),
			esc_html__( 'Astrologer\'s name', 'kaaljyoti' ),
			esc_attr( self::OPTION . '[disclaimer_name]' ),
			esc_attr( (string) self::get( 'disclaimer_name' ) ),
			(int) Elements::DISCLAIMER_NAME_MAX
		);

		printf(
			'<p><label for="%1$s_url">%2$s</label><br /><input type="url" class="regular-text code" id="%1$s_url" name="%3$s" value="%4$s" maxlength="%5$d" placeholder="https://" /></p><p class="description">%6$s</p>',
			esc_attr( $id ),
			esc_html__( 'Link (optional)', 'kaaljyoti' ),
			esc_attr( self::OPTION . '[disclaimer_url]' ),
			esc_attr( (string) self::get( 'disclaimer_url' ) ),
			(int) Elements::DISCLAIMER_URL_MAX,
			esc_html__( 'The name and link are used only with "My astrologer". A shortcode can choose its own with disclaimer="off", disclaimer="default" or disclaimer_name="…".', 'kaaljyoti' )
		);
	}

	/**
	 * The disclaimer attributes the site's setting writes onto a report element.
	 *
	 * @return array<string, string> `disclaimer="off"`, the astrologer's name and link, or nothing.
	 */
	public static function disclaimer_attributes(): array {
		$choice = (string) self::get( 'disclaimer' );

		if ( 'off' === $choice ) {
			return array( 'disclaimer' => 'off' );
		}

		if ( 'astrologer' !== $choice ) {
			return array();
		}

		$name = Elements::disclaimer_name( (string) self::get( 'disclaimer_name' ) );
		if ( null === $name ) {
			return array();
		}

		$attributes = array( 'disclaimer-name' => $name );
		$url        = Elements::disclaimer_url( (string) self::get( 'disclaimer_url' ) );
		if ( null !== $url ) {
			$attributes['disclaimer-url'] = $url;
		}

		return $attributes;
	}

	/**
	 * Draws a checkbox, with a hidden `0` before it so that an unticked box
	 * is posted as off rather than as missing.
	 *
	 * @param string $id          The element id.
	 * @param string $name        The form field name.
	 * @param bool   $checked     Whether it is on.
	 * @param string $label       The label beside it.
	 * @param string $description A line under it, or an empty string.
	 * @return void
	 */
	private static function render_checkbox( string $id, string $name, bool $checked, string $label, string $description ): void {
		printf(
			'<input type="hidden" name="%1$s" value="0" /><label><input type="checkbox" id="%2$s" name="%1$s" value="1"%3$s /> %4$s</label>',
			esc_attr( $name ),
			esc_attr( $id ),
			checked( $checked, true, false ),
			esc_html( $label )
		);

		if ( '' !== $description ) {
			printf( '<p class="description">%s</p>', esc_html( $description ) );
		}
	}

	/**
	 * PDF downloads: on or off, and which kundli editions to offer.
	 *
	 * @param string $id      The element id.
	 * @param string $name    The form field name.
	 * @param bool   $checked Whether PDFs are on.
	 * @return void
	 */
	private static function render_pdf( string $id, string $name, bool $checked ): void {
		self::render_checkbox(
			$id,
			$name,
			$checked,
			__( 'Show "Download PDF" on the kundli report and the match result', 'kaaljyoti' ),
			__( 'Needs the secret key and the server proxy, and a paid plan (PDFs are not on Free). A kundli PDF costs 1,000 credits and a match PDF 500, and each uses one PDF from the month\'s allowance; on the Free plan visitors see a polite "needs a plan" note instead.', 'kaaljyoti' )
		);

		$offered = self::pdf_editions();
		$labels  = array(
			'basic'        => __( 'Basic: details, charts, dashas and the readings', 'kaaljyoti' ),
			'professional' => __( 'Professional: every section, sixteen divisional charts, KP and more', 'kaaljyoti' ),
		);

		printf( '<fieldset style="margin-top:.5em"><legend>%s</legend>', esc_html__( 'Kundli editions to offer', 'kaaljyoti' ) );
		printf( '<input type="hidden" name="%s" value="" />', esc_attr( self::OPTION . '[pdf_editions][]' ) );
		foreach ( self::PDF_EDITIONS as $edition ) {
			printf(
				'<label><input type="checkbox" id="%s" name="%s" value="%s"%s /> %s</label><br />',
				esc_attr( $id . '_' . $edition ),
				esc_attr( self::OPTION . '[pdf_editions][]' ),
				esc_attr( $edition ),
				checked( in_array( $edition, $offered, true ), true, false ),
				esc_html( $labels[ $edition ] )
			);
		}
		printf( '</fieldset><p class="description">%s</p>', esc_html__( 'With both, the visitor chooses. The match PDF has one edition. The language is the visitor\'s choice.', 'kaaljyoti' ) );
	}

	/**
	 * Draws a `<select>` for one of the enum settings.
	 *
	 * @param string                $id          The element id.
	 * @param string                $name        The form field name.
	 * @param string                $value       The stored value.
	 * @param array<string, string> $choices     Value to label.
	 * @param string                $description A line under the field, or an empty string.
	 * @return void
	 */
	private static function render_select( string $id, string $name, string $value, array $choices, string $description ): void {
		printf( '<select id="%s" name="%s">', esc_attr( $id ), esc_attr( $name ) );
		foreach ( $choices as $choice => $label ) {
			printf(
				'<option value="%s"%s>%s</option>',
				esc_attr( $choice ),
				selected( $value, $choice, false ),
				esc_html( $label )
			);
		}
		echo '</select>';

		if ( '' !== $description ) {
			printf( '<p class="description">%s</p>', esc_html( $description ) );
		}
	}

	/**
	 * The city dropdown's options.
	 *
	 * @return array<string, string> City id to name.
	 */
	private static function city_choices(): array {
		$choices = array();
		foreach ( self::CITIES as $id => $city ) {
			$choices[ $id ] = $city['name'];
		}

		return $choices;
	}

	/**
	 * A key, shown: the first twelve characters and an ellipsis.
	 *
	 * @param string $key The stored key.
	 * @return string What the settings page prints.
	 */
	public static function mask( string $key ): string {
		return substr( $key, 0, 12 ) . '…';
	}

	/**
	 * The shortcodes the Shortcodes tab lists, one example each.
	 */
	public const SHORTCODE_EXAMPLES = array(
		'[kj_panchang city="delhi"]',
		'[kj_muhurta city="delhi"]',
		'[kj_panchang_month city="delhi"]',
		'[kj_calendar]',
		'[kj_transits]',
		'[kj_ephemeris]',
		'[kj_chart datetime="1990-05-14T10:30:00" city="delhi"]',
		'[kj_kundli_form readings="both"]',
		'[kj_match_form city="mumbai" lang="hi"]',
		'[kj_moon_sign]',
		'[kj_lagna]',
		'[kj_manglik]',
		'[kj_sade_sati]',
		'[kj_dasha]',
		'[kj_vargas]',
		'[kj_kp]',
		'[kj_strength]',
		'[kj_horoscope sign="aries" period="weekly"]',
		'[kj_reading type="lagna" sign="leo"]',
		'[kj_life_areas]',
		'[kj_varshphal]',
		'[kj_vimshottari_reading]',
	);

	/**
	 * The settings page: the tabs, then the active tab's form (or the
	 * shortcode list). Each tab is its own form posting only its own fields
	 * and a hidden field naming the tab, which {@see sanitize()} reads so that
	 * the other tabs' settings are left as they are.
	 *
	 * @return void
	 */
	public static function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to change these settings.', 'kaaljyoti' ) );
		}

		$active = self::current_tab();
		$tabs   = self::tabs();

		echo '<div class="wrap">';
		printf( '<h1>%s</h1>', esc_html__( 'Kaal Jyoti', 'kaaljyoti' ) );
		// No settings_errors() here: a page under Settings gets WordPress's
		// own (wp-admin/options-head.php), and a second call printed every
		// error twice.

		printf( '<nav class="nav-tab-wrapper wp-clearfix" aria-label="%s">', esc_attr__( 'Kaal Jyoti settings', 'kaaljyoti' ) );
		foreach ( $tabs as $tab => $about ) {
			printf(
				'<a href="%s" class="nav-tab%s"%s>%s</a>',
				esc_url( self::tab_url( $tab ) ),
				$tab === $active ? ' nav-tab-active' : '',
				$tab === $active ? ' aria-current="page"' : '',
				esc_html( $about[0] )
			);
		}
		echo '</nav>';

		printf( '<p class="kaal-jyoti-tab-description">%s</p>', esc_html( $tabs[ $active ][1] ) );

		if ( 'connection' === $active ) {
			self::render_api_base_note();
		}

		if ( 'shortcodes' === $active ) {
			self::render_shortcodes();
			echo '</div>';

			return;
		}

		printf(
			'<p class="kaal-jyoti-search" hidden><label for="kaal-jyoti-search">%s</label> <input type="search" id="kaal-jyoti-search" class="regular-text" autocomplete="off" /></p><div id="kaal-jyoti-search-other" role="status"></div>',
			esc_html__( 'Search settings', 'kaaljyoti' )
		);

		echo '<form action="options.php" method="post">';
		settings_fields( self::GROUP );
		printf(
			'<input type="hidden" name="%s" value="%s" />',
			esc_attr( self::OPTION . '[' . self::TAB_FIELD . ']' ),
			esc_attr( $active )
		);
		do_settings_sections( self::tab_page( $active ) );
		submit_button();
		echo '</form>';

		if ( 'connection' === $active ) {
			printf(
				'<h2>%s</h2><p><button type="button" class="button" id="kaal-jyoti-test">%s</button> <span id="kaal-jyoti-test-result" role="status"></span></p><p class="description">%s</p>',
				esc_html__( 'Test connection', 'kaaljyoti' ),
				esc_html__( 'Test connection', 'kaaljyoti' ),
				esc_html__( 'Asks the API for its version, and — when a secret key is stored — for the default city\'s panchang, then says what the key\'s plan means for the month widgets and PDF downloads. Nothing from the answer is saved; save your changes before testing.', 'kaaljyoti' )
			);
		}

		echo '</div>';
	}

	/**
	 * The Shortcodes tab: every shortcode with a copy button (shown by the
	 * admin script; without it the code is still there to select).
	 *
	 * @return void
	 */
	private static function render_shortcodes(): void {
		echo '<table class="widefat striped kaal-jyoti-shortcodes" style="max-width:820px"><tbody>';
		foreach ( self::SHORTCODE_EXAMPLES as $shortcode ) {
			printf(
				'<tr><td><code>%s</code></td><td style="width:1%%;white-space:nowrap"><button type="button" class="button button-small kaal-jyoti-copy" data-copy="%s" hidden>%s</button></td></tr>',
				esc_html( $shortcode ),
				esc_attr( $shortcode ),
				esc_html__( 'Copy', 'kaaljyoti' )
			);
		}
		echo '</tbody></table>';

		printf(
			'<p class="description">%s <a href="%s" target="_blank" rel="noopener">%s</a></p>',
			esc_html__( 'Every attribute, every block setting and the server-rendering mode are documented at', 'kaaljyoti' ),
			esc_url( self::DOCS_URL ),
			esc_html( self::DOCS_URL )
		);
	}

	/**
	 * Every field's label and the tab it is on, for the search box: a label
	 * on another tab is offered as a link to it.
	 *
	 * @return array<int, array{label: string, section: string, tab: string, tabLabel: string, url: string}> In page order.
	 */
	public static function search_index(): array {
		$tabs     = self::tabs();
		$sections = self::sections();
		$index    = array();
		foreach ( self::fields() as $field ) {
			$tab     = $sections[ $field[1] ][2];
			$index[] = array(
				'label'    => $field[0],
				'section'  => $sections[ $field[1] ][0],
				'tab'      => $tab,
				'tabLabel' => $tabs[ $tab ][0],
				'url'      => self::tab_url( $tab ),
			);
		}

		return $index;
	}

	/**
	 * Loads the connection test's script, on this settings page only.
	 *
	 * @param string $hook_suffix The screen `admin_enqueue_scripts` was fired for.
	 * @return void
	 */
	public static function enqueue_admin( string $hook_suffix ): void {
		if ( 'settings_page_' . self::PAGE !== $hook_suffix ) {
			return;
		}

		$tab  = self::current_tab();
		$deps = array( 'jquery' );

		// The colour pickers and the sign image pickers are on Appearance only.
		if ( 'appearance' === $tab ) {
			wp_enqueue_style( 'wp-color-picker' );
			wp_enqueue_script( 'wp-color-picker' );
			wp_enqueue_media();
			$deps[] = 'wp-color-picker';
		}

		wp_enqueue_script(
			'kaal-jyoti-admin',
			KAAL_JYOTI_URL . 'assets/admin.js',
			$deps,
			KAAL_JYOTI_VERSION,
			true
		);

		wp_localize_script(
			'kaal-jyoti-admin',
			'kaalJyotiAdmin',
			array(
				'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
				'nonce'         => wp_create_nonce( 'kaal_jyoti_test' ),
				'testing'       => __( 'Testing…', 'kaaljyoti' ),
				'failed'        => __( 'The test could not be run.', 'kaaljyoti' ),
				/* translators: %s: a zodiac sign's name, such as Aries. */
				'signTitle'     => __( 'An image for %s', 'kaaljyoti' ),
				'signButton'    => __( 'Use this image', 'kaaljyoti' ),
				'signDefault'   => __( 'Default icon', 'kaaljyoti' ),
				'copied'        => __( 'Copied', 'kaaljyoti' ),
				'tab'           => $tab,
				'fields'        => self::search_index(),
				'searchOther'   => __( 'On other tabs:', 'kaaljyoti' ),
				'searchNothing' => __( 'No setting matches.', 'kaaljyoti' ),
			)
		);
	}

	/**
	 * Sanitises the settings form.
	 *
	 * Each tab of the settings page is its own form, posting only that tab's
	 * fields and a hidden `_tab` naming it. Everything lives in one option
	 * row, so a tab's save is laid over what is stored: a key the tab does not
	 * own keeps its stored value whatever was posted, and an on/off setting
	 * missing from the post is off only when it is on the tab being saved.
	 * A tab that is not one of {@see tabs()} is the first tab. Errors are raised
	 * only for the saved tab's own fields, so they show on the tab they are
	 * about. A post with no `_tab` at all (`update_option()` from code) is a
	 * whole-row save, as before the tabs.
	 *
	 * Every value is placed by its own rule and a rejected one keeps whatever
	 * was stored, with a line in `settings_errors()` saying why.
	 *
	 * @param array<string, mixed> $input What the form posted.
	 * @return array<string, mixed> What goes into the option row.
	 */
	public static function sanitize( array $input ): array {
		$current = self::all();

		if ( ! array_key_exists( self::TAB_FIELD, $input ) ) {
			return self::sanitize_all( $input, $current );
		}

		$tab   = self::resolve_tab( $input[ self::TAB_FIELD ] );
		$owned = self::tab_keys( $tab );

		// The stored row, with this tab's posted fields over it.
		$merged = $current;
		foreach ( $owned as $key ) {
			if ( array_key_exists( $key, $input ) ) {
				$merged[ $key ] = $input[ $key ];
			} elseif ( in_array( $key, self::FLAGS, true ) ) {
				$merged[ $key ] = '0';
			} elseif ( 'pdf_editions' === $key ) {
				$merged[ $key ] = array();
			}
		}

		self::$saving = $owned;
		try {
			$clean = self::sanitize_all( $merged, $current );
		} finally {
			self::$saving = null;
		}

		// Belt and braces: whatever the rules above did, another tab's keys
		// are written back exactly as they were stored.
		foreach ( array_keys( $current ) as $key ) {
			if ( ! in_array( $key, $owned, true ) ) {
				$clean[ $key ] = $current[ $key ];
			}
		}

		return $clean;
	}

	/**
	 * Raises a settings error about one or more settings, unless a tab is
	 * being saved that owns none of them.
	 *
	 * @param string|string[] $about   The setting key or keys the error is about.
	 * @param string          $code    The error's code.
	 * @param string          $message The translated message.
	 * @param string          $type    `error`, `warning`, `success` or `info`.
	 * @return void
	 */
	private static function error( $about, string $code, string $message, string $type = 'error' ): void {
		if ( null !== self::$saving && array() === array_intersect( (array) $about, self::$saving ) ) {
			return;
		}

		add_settings_error( self::OPTION, $code, $message, $type );
	}

	/**
	 * Sanitises every key of the row from one input.
	 *
	 * @param array<string, mixed> $input   What the form posted, or the merged row.
	 * @param array<string, mixed> $current What is stored now.
	 * @return array<string, mixed> What goes into the option row.
	 */
	private static function sanitize_all( array $input, array $current ): array {
		$clean = self::defaults();

		$clean['publishable_key'] = self::sanitize_publishable_key( $input, $current );
		$clean['secret_key']      = self::sanitize_secret_key( $input, $current );
		$clean['google_maps_key'] = self::sanitize_google_maps_key( $input, $current );
		$clean['photon_url']      = self::sanitize_photon_url( $input, $current );

		$provider                = isset( $input['place_provider'] ) && is_scalar( $input['place_provider'] ) ? strtolower( trim( sanitize_text_field( (string) $input['place_provider'] ) ) ) : '';
		$clean['place_provider'] = in_array( $provider, self::PLACE_PROVIDERS, true ) ? $provider : self::place_provider();

		$city                  = isset( $input['default_city'] ) ? strtolower( trim( sanitize_text_field( (string) $input['default_city'] ) ) ) : '';
		$clean['default_city'] = isset( self::CITIES[ $city ] ) ? $city : $current['default_city'];

		$language          = isset( $input['language'] ) ? strtolower( trim( sanitize_text_field( (string) $input['language'] ) ) ) : '';
		$clean['language'] = in_array( $language, array( 'en', 'hi' ), true ) ? $language : $current['language'];

		$powered_by          = isset( $input['powered_by'] ) ? strtolower( trim( sanitize_text_field( (string) $input['powered_by'] ) ) ) : '';
		$clean['powered_by'] = in_array( $powered_by, array( 'shown', 'hidden' ), true ) ? $powered_by : $current['powered_by'];

		$minutes                = isset( $input['cache_minutes'] ) ? (int) $input['cache_minutes'] : (int) $current['cache_minutes'];
		$clean['cache_minutes'] = max( 1, min( 1440, $minutes ) );

		$mode = isset( $input['render_mode'] ) ? strtolower( trim( sanitize_text_field( (string) $input['render_mode'] ) ) ) : '';
		if ( ! in_array( $mode, array( 'browser', 'server' ), true ) ) {
			$mode = $current['render_mode'];
		}
		if ( 'server' === $mode && '' === $clean['secret_key'] ) {
			self::error(
				'render_mode',
				'kaal_jyoti_render_mode',
				__( 'Server rendering needs a secret key, so the render mode was left at browser.', 'kaaljyoti' )
			);
			$mode = 'browser';
		}
		$clean['render_mode'] = $mode;

		$theme          = isset( $input['theme'] ) ? strtolower( trim( sanitize_text_field( (string) $input['theme'] ) ) ) : '';
		$clean['theme'] = in_array( $theme, self::THEMES, true ) ? $theme : self::theme();

		$preset          = isset( $input['preset'] ) ? strtolower( trim( sanitize_text_field( (string) $input['preset'] ) ) ) : '';
		$clean['preset'] = in_array( $preset, self::PRESETS, true ) ? $preset : self::preset();

		foreach ( array_keys( self::COLOR_PROPERTIES ) as $color ) {
			$clean[ $color ] = isset( $input[ $color ] ) ? self::sanitize_color( $input[ $color ] ) : '';
		}

		$clean['font']   = isset( $input['font'] ) && is_scalar( $input['font'] ) ? self::sanitize_font( (string) $input['font'] ) : '';
		$clean['radius'] = isset( $input['radius'] ) ? self::sanitize_radius( $input['radius'] ) : '';

		$font_mode          = isset( $input['font_mode'] ) && is_scalar( $input['font_mode'] ) ? strtolower( trim( (string) $input['font_mode'] ) ) : '';
		$clean['font_mode'] = in_array( $font_mode, self::FONT_MODES, true ) ? $font_mode : self::font_mode();

		$format               = isset( $input['time_format'] ) && is_scalar( $input['time_format'] ) ? trim( (string) $input['time_format'] ) : '';
		$clean['time_format'] = in_array( $format, self::TIME_FORMATS, true ) ? $format : self::time_format();

		$clean['remember']    = self::sanitize_flag( $input, 'remember', (bool) $current['remember'] );
		$clean['proxy']       = self::sanitize_flag( $input, 'proxy', (bool) $current['proxy'] );
		$clean['proxy_nonce'] = self::sanitize_flag( $input, 'proxy_nonce', (bool) $current['proxy_nonce'] );
		$clean['pdf']         = self::sanitize_flag( $input, 'pdf', (bool) $current['pdf'] );

		$clean['pdf_editions'] = self::sanitize_pdf_editions( $input, $current );
		if ( $clean['pdf'] && array() === $clean['pdf_editions'] ) {
			self::error(
				'pdf',
				'kaal_jyoti_pdf_editions',
				__( 'PDF downloads need at least one edition, so the basic one is offered.', 'kaaljyoti' )
			);
			$clean['pdf_editions'] = array( 'basic' );
		}
		if ( $clean['pdf'] && ( ! $clean['proxy'] || '' === $clean['secret_key'] ) ) {
			self::error(
				array( 'pdf', 'proxy' ),
				'kaal_jyoti_pdf',
				__( 'PDF downloads are saved as on, but no button is shown until a secret key is stored and the server proxy is on.', 'kaaljyoti' ),
				'warning'
			);
		}

		foreach ( self::RATE_LIMITS as $rate => $bounds ) {
			$clean[ $rate ] = self::sanitize_int( $input, $rate, (int) $current[ $rate ], $bounds[1], $bounds[2] );
		}
		$clean['month_cache_hours'] = self::sanitize_int( $input, 'month_cache_hours', (int) $current['month_cache_hours'], 1, self::MAX_MONTH_CACHE_HOURS );

		foreach ( array( 'pricing_url', 'proxy_docs_url' ) as $link ) {
			$clean[ $link ] = self::sanitize_link( $input, $link, (string) $current[ $link ] );
		}

		$icons                = isset( $input['sign_icons'] ) && is_scalar( $input['sign_icons'] ) ? strtolower( trim( (string) $input['sign_icons'] ) ) : '';
		$clean['sign_icons']  = in_array( $icons, self::SIGN_ICON_THEMES, true ) ? $icons : self::sign_icons();
		$clean['sign_images'] = self::sanitize_sign_images( $input );
		if ( 'custom' === $clean['sign_icons'] && array() === $clean['sign_images'] ) {
			self::error(
				array( 'sign_icons', 'sign_images' ),
				'kaal_jyoti_sign_images',
				__( 'The sign icons are set to your own images, but none is chosen, so the default icons are shown.', 'kaaljyoti' ),
				'warning'
			);
		}

		return array_merge( $clean, self::sanitize_disclaimer( $input, $current ) );
	}

	/**
	 * The sign images: an attachment id per sign, kept only when it is an
	 * image in the media library. A form that did not post them keeps what is
	 * stored; an empty field (the "Clear" button) drops that sign's image.
	 *
	 * @param array<string, mixed> $input What the form posted.
	 * @return array<string, int> Sign id to attachment id, in zodiac order.
	 */
	private static function sanitize_sign_images( array $input ): array {
		if ( ! isset( $input['sign_images'] ) || ! is_array( $input['sign_images'] ) ) {
			return self::sign_images();
		}

		$images = array();
		foreach ( array_keys( Elements::SIGNS ) as $sign ) {
			$raw = $input['sign_images'][ $sign ] ?? '';
			$id  = is_scalar( $raw ) && 1 === preg_match( '/^\s*\d+\s*$/', (string) $raw ) ? (int) $raw : 0;
			if ( $id > 0 && wp_attachment_is_image( $id ) ) {
				$images[ $sign ] = $id;
			}
		}

		return $images;
	}

	/**
	 * An on/off setting: `1`, `true`, `on` or `yes` is on, `0`, an empty
	 * string, `false`, `off` or `no` is off, and a field that was not posted
	 * at all keeps what is stored.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param string               $key     The setting.
	 * @param bool                 $current What is stored now.
	 * @return bool The value to store.
	 */
	private static function sanitize_flag( array $input, string $key, bool $current ): bool {
		if ( ! array_key_exists( $key, $input ) ) {
			return $current;
		}

		$value = $input[ $key ];
		if ( is_bool( $value ) ) {
			return $value;
		}

		return is_scalar( $value ) && in_array( strtolower( trim( (string) $value ) ), array( '1', 'true', 'on', 'yes' ), true );
	}

	/**
	 * A whole number within bounds; a field not posted, or not a number,
	 * keeps what is stored.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param string               $key     The setting.
	 * @param int                  $current What is stored now.
	 * @param int                  $min     The lowest value.
	 * @param int                  $max     The highest value.
	 * @return int The value to store.
	 */
	private static function sanitize_int( array $input, string $key, int $current, int $min, int $max ): int {
		$value = $input[ $key ] ?? null;
		if ( ! is_scalar( $value ) || ! is_numeric( trim( (string) $value ) ) ) {
			return max( $min, min( $max, $current ) );
		}

		return max( $min, min( $max, (int) $value ) );
	}

	/**
	 * The editions ticked, in the API's order; not posted keeps what is stored.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param array<string, mixed> $current What is stored now.
	 * @return string[] The editions.
	 */
	private static function sanitize_pdf_editions( array $input, array $current ): array {
		if ( ! array_key_exists( 'pdf_editions', $input ) ) {
			return array_values( array_intersect( self::PDF_EDITIONS, is_array( $current['pdf_editions'] ) ? $current['pdf_editions'] : array() ) );
		}

		$posted = is_array( $input['pdf_editions'] ) ? $input['pdf_editions'] : array( $input['pdf_editions'] );

		return array_values( array_intersect( self::PDF_EDITIONS, array_map( 'strval', array_filter( $posted, 'is_scalar' ) ) ) );
	}

	/**
	 * An optional link for the site owner: http or https, at most 200
	 * characters, or empty for the bundle's own.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param string               $key     The setting.
	 * @param string               $current What is stored now.
	 * @return string The URL, or an empty string.
	 */
	private static function sanitize_link( array $input, string $key, string $current ): string {
		$raw = isset( $input[ $key ] ) && is_scalar( $input[ $key ] ) ? trim( (string) $input[ $key ] ) : '';
		if ( '' === $raw ) {
			return '';
		}

		$url = Elements::disclaimer_url( $raw );
		if ( null === $url ) {
			self::error(
				$key,
				'kaal_jyoti_' . $key,
				__( 'A link must be an http or https address of at most 200 characters. The stored one was kept.', 'kaaljyoti' )
			);

			return $current;
		}

		return $url;
	}

	/**
	 * The disclaimer choice, and the name and link that go with it.
	 *
	 * The name and link are kept whichever choice is made, so switching to
	 * the default line and back does not lose them. "My astrologer" with no
	 * name has nothing to say, so it is stored as the default line, with a
	 * line in `settings_errors()` saying so; a link that is not http or https
	 * is dropped the same way.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param array<string, mixed> $current What is stored now.
	 * @return array{disclaimer: string, disclaimer_name: string, disclaimer_url: string} The three keys to store.
	 */
	private static function sanitize_disclaimer( array $input, array $current ): array {
		$choice = isset( $input['disclaimer'] ) && is_scalar( $input['disclaimer'] ) ? strtolower( trim( sanitize_text_field( (string) $input['disclaimer'] ) ) ) : '';
		if ( ! in_array( $choice, self::DISCLAIMERS, true ) ) {
			$choice = in_array( $current['disclaimer'], self::DISCLAIMERS, true ) ? (string) $current['disclaimer'] : 'default';
		}

		$name = isset( $input['disclaimer_name'] ) && is_scalar( $input['disclaimer_name'] ) ? Elements::disclaimer_name( (string) $input['disclaimer_name'] ) : null;

		$url     = null;
		$raw_url = isset( $input['disclaimer_url'] ) && is_scalar( $input['disclaimer_url'] ) ? trim( (string) $input['disclaimer_url'] ) : '';
		if ( '' !== $raw_url ) {
			$url = Elements::disclaimer_url( $raw_url );
			if ( null === $url ) {
				self::error(
					'disclaimer_url',
					'kaal_jyoti_disclaimer_url',
					__( 'The astrologer\'s link must be an http or https address of at most 200 characters, so it was left out.', 'kaaljyoti' )
				);
			}
		}

		if ( 'astrologer' === $choice && null === $name ) {
			self::error(
				array( 'disclaimer', 'disclaimer_name' ),
				'kaal_jyoti_disclaimer',
				__( '"My astrologer" needs the astrologer\'s name, so the disclaimer was left at the default line.', 'kaaljyoti' )
			);
			$choice = 'default';
		}

		return array(
			'disclaimer'      => $choice,
			'disclaimer_name' => (string) $name,
			'disclaimer_url'  => (string) $url,
		);
	}

	/**
	 * A `#rgb` or `#rrggbb` colour, lower-cased, or an empty string.
	 *
	 * @param mixed $value What was posted or stored.
	 * @return string The colour, or an empty string for anything else.
	 */
	public static function sanitize_color( $value ): string {
		if ( ! is_scalar( $value ) ) {
			return '';
		}

		$color = sanitize_hex_color( trim( (string) $value ) );

		return is_string( $color ) ? strtolower( $color ) : '';
	}

	/**
	 * A CSS font-family list, reduced to what one can safely hold.
	 *
	 * Letters, digits, spaces, commas, quotes and hyphens: enough for
	 * `"Noto Serif", Georgia, serif`, and nothing that could close the
	 * declaration or the style element it is printed in. A quote left open
	 * would swallow the rest of the rule, so unbalanced quotes are removed.
	 *
	 * @param string $value What was posted or stored.
	 * @return string The list, or an empty string.
	 */
	public static function sanitize_font( string $value ): string {
		$font = (string) preg_replace( '/[^A-Za-z0-9 ,\'"-]/', '', $value );
		$font = trim( (string) preg_replace( '/\s+/', ' ', $font ) );

		foreach ( array( '"', "'" ) as $quote ) {
			if ( 0 !== substr_count( $font, $quote ) % 2 ) {
				$font = str_replace( $quote, '', $font );
			}
		}

		return trim( substr( trim( $font, ' ,' ), 0, 200 ) );
	}

	/**
	 * A corner radius in whole pixels, 0 to {@see MAX_RADIUS}, or empty.
	 *
	 * @param mixed $value What was posted or stored.
	 * @return int|string The radius, or an empty string when none was given.
	 */
	public static function sanitize_radius( $value ) {
		if ( is_int( $value ) ) {
			return max( 0, min( self::MAX_RADIUS, $value ) );
		}

		if ( ! is_scalar( $value ) ) {
			return '';
		}

		$radius = trim( (string) $value );
		if ( '' === $radius || ! is_numeric( $radius ) ) {
			return '';
		}

		return max( 0, min( self::MAX_RADIUS, (int) round( (float) $radius ) ) );
	}

	/**
	 * The publishable key, or what was stored when the posted one is refused.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param array<string, mixed> $current What is stored now.
	 * @return string The key to store.
	 */
	private static function sanitize_publishable_key( array $input, array $current ): string {
		$key = isset( $input['publishable_key'] ) ? trim( sanitize_text_field( (string) $input['publishable_key'] ) ) : '';

		if ( '' === $key ) {
			return '';
		}

		// A secret key in the field a page can read is the one mistake that
		// must never be stored, whatever else it looks like.
		if ( str_starts_with( $key, 'kj_live_' ) || str_starts_with( $key, 'kj_test_' ) ) {
			self::error(
				'publishable_key',
				'kaal_jyoti_publishable_key',
				__( 'That is a secret key. It belongs in the secret key field; the publishable key is the one visitors\' browsers see.', 'kaaljyoti' )
			);

			return (string) $current['publishable_key'];
		}

		if ( ! str_starts_with( $key, 'kj_pub_' ) ) {
			self::error(
				'publishable_key',
				'kaal_jyoti_publishable_key',
				__( 'A publishable key starts with kj_pub_. The stored key was kept.', 'kaaljyoti' )
			);

			return (string) $current['publishable_key'];
		}

		return $key;
	}

	/**
	 * The Google Maps Platform key: optional, and public by nature.
	 *
	 * It is printed on every page with a form, so it is a browser key and its
	 * safety is the referrer restriction on it at Google, as with the
	 * publishable key. Only the characters a Google key has are accepted; a
	 * Kaal Jyoti key pasted here by mistake is refused, so a secret key can
	 * never reach the page this way either.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param array<string, mixed> $current What is stored now.
	 * @return string The key to store, or an empty string for none.
	 */
	private static function sanitize_google_maps_key( array $input, array $current ): string {
		$key = isset( $input['google_maps_key'] ) && is_scalar( $input['google_maps_key'] ) ? trim( sanitize_text_field( (string) $input['google_maps_key'] ) ) : '';

		if ( '' === $key ) {
			return '';
		}

		if ( str_starts_with( $key, 'kj_' ) || ! self::is_google_maps_key( $key ) ) {
			self::error(
				'google_maps_key',
				'kaal_jyoti_google_maps_key',
				__( 'That does not look like a Google Maps API key (they start with AIza). The stored key was kept.', 'kaaljyoti' )
			);

			return (string) $current['google_maps_key'];
		}

		return $key;
	}

	/**
	 * Whether a string has the shape of a Google API key.
	 *
	 * Letters, digits, `_` and `-`, 20 to 100 of them: Google's keys are
	 * `AIza` and 35 more today, and the check is loose on purpose so a future
	 * key format is not refused.
	 *
	 * @param string $key The trimmed value.
	 * @return bool Whether it may be stored and printed.
	 */
	public static function is_google_maps_key( string $key ): bool {
		return 1 === preg_match( '/^[A-Za-z0-9_-]{20,100}$/', $key );
	}

	/**
	 * The stored place search provider, or `auto` for anything else.
	 *
	 * @return string One of {@see self::PLACE_PROVIDERS}.
	 */
	public static function place_provider(): string {
		$provider = (string) self::get( 'place_provider' );

		return in_array( $provider, self::PLACE_PROVIDERS, true ) ? $provider : 'auto';
	}

	/**
	 * A self-hosted Photon's address: optional, https only.
	 *
	 * Empty means the public server, which the bundle knows itself, so nothing
	 * is stored for it.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param array<string, mixed> $current What is stored now.
	 * @return string The URL to store, or an empty string for the public server.
	 */
	private static function sanitize_photon_url( array $input, array $current ): string {
		$raw = isset( $input['photon_url'] ) && is_scalar( $input['photon_url'] ) ? trim( sanitize_text_field( (string) $input['photon_url'] ) ) : '';

		if ( '' === $raw ) {
			return '';
		}

		$normalised = self::normalize_photon_url( $raw );
		if ( null === $normalised ) {
			self::error(
				'photon_url',
				'kaal_jyoti_photon_url',
				__( 'The Photon URL must be an https address, for example https://photon.example.com. The stored one was kept.', 'kaaljyoti' )
			);

			return (string) $current['photon_url'];
		}

		return self::PHOTON_URL === $normalised ? '' : $normalised;
	}

	/**
	 * A Photon address as the bundle wants it: https, a host, an optional
	 * path, no query and no trailing slash. The bundle adds `/api/`.
	 *
	 * @param string $raw What was typed or stored.
	 * @return string|null The URL, or null when it is not an https URL.
	 */
	public static function normalize_photon_url( string $raw ): ?string {
		$parts = wp_parse_url( trim( $raw ) );

		if ( ! is_array( $parts ) || empty( $parts['host'] ) || 'https' !== strtolower( $parts['scheme'] ?? '' ) ) {
			return null;
		}

		$path = rtrim( $parts['path'] ?? '', '/' );
		if ( str_ends_with( $path, '/api' ) ) {
			$path = substr( $path, 0, -4 );
		}

		return 'https://' . strtolower( $parts['host'] ) . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' ) . $path;
	}

	/**
	 * The secret key.
	 *
	 * The field is posted blank on every save because it shows the stored key
	 * masked, so blank means "leave it alone"; the checkbox beside it is how a
	 * key is removed.
	 *
	 * @param array<string, mixed> $input   What the form posted.
	 * @param array<string, mixed> $current What is stored now.
	 * @return string The key to store.
	 */
	private static function sanitize_secret_key( array $input, array $current ): string {
		$stored = (string) $current['secret_key'];

		if ( ! empty( $input['secret_key_remove'] ) ) {
			return '';
		}

		$key = isset( $input['secret_key'] ) ? trim( sanitize_text_field( (string) $input['secret_key'] ) ) : '';
		if ( '' === $key ) {
			return $stored;
		}

		if ( ! str_starts_with( $key, 'kj_live_' ) && ! str_starts_with( $key, 'kj_test_' ) ) {
			self::error(
				'secret_key',
				'kaal_jyoti_secret_key',
				__( 'A secret key starts with kj_live_ or kj_test_. The stored key was kept.', 'kaaljyoti' )
			);

			return $stored;
		}

		return $key;
	}

	/**
	 * Trims a base URL down to the origin the SDK and the bundle want.
	 *
	 * @param string $raw The {@see API_BASE_CONSTANT} constant's value.
	 * @return string|null The origin, or null when it is not an https URL.
	 */
	public static function normalize_base_url( string $raw ): ?string {
		$url   = rtrim( trim( $raw ), '/' );
		$parts = wp_parse_url( $url );

		if ( ! is_array( $parts ) || empty( $parts['host'] ) || 'https' !== ( $parts['scheme'] ?? '' ) ) {
			return null;
		}

		$origin = 'https://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
		$path   = rtrim( $parts['path'] ?? '', '/' );

		if ( str_ends_with( $path, '/v1' ) ) {
			$path = substr( $path, 0, -3 );
		}

		return $origin . rtrim( $path, '/' );
	}

	/**
	 * One city's coordinates.
	 *
	 * @param string $id A city id.
	 * @return array{name: string, latitude: float, longitude: float, timezone: string}|null The city, or null.
	 */
	public static function city( string $id ): ?array {
		return self::CITIES[ $id ] ?? null;
	}

	/**
	 * The `X-KJ-Client` value every server call carries (design decision 6).
	 *
	 * @return string For example `wordpress/0.1.0`.
	 */
	public static function client_tag(): string {
		return 'wordpress/' . KAAL_JYOTI_VERSION;
	}

	/**
	 * Answers the settings page's "Test connection" button.
	 *
	 * Asks `/v1/health` for the engine and ephemeris versions, and with a secret key stored
	 * asks `/v1/panchang` for the default city so the key, the plan and the
	 * origin are all exercised. Nothing from either answer is stored.
	 *
	 * @return void
	 */
	public static function ajax_test(): void {
		check_ajax_referer( 'kaal_jyoti_test', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'You are not allowed to test the connection.', 'kaaljyoti' ) ), 403 );
		}

		$base   = self::api_base();
		$health = wp_remote_get(
			$base . '/v1/health',
			array(
				'timeout' => 10,
				'headers' => array(
					'Accept'      => 'application/json',
					'X-KJ-Client' => self::client_tag(),
				),
			)
		);

		if ( is_wp_error( $health ) ) {
			wp_send_json_error(
				array(
					/* translators: %s: the error WordPress reported. */
					'message' => sprintf( __( 'The API could not be reached: %s', 'kaaljyoti' ), $health->get_error_message() ),
				)
			);
		}

		$status = (int) wp_remote_retrieve_response_code( $health );
		$body   = json_decode( (string) wp_remote_retrieve_body( $health ), true );

		if ( 200 !== $status || ! is_array( $body ) ) {
			wp_send_json_error(
				array(
					'message' => sprintf(
						/* translators: 1: HTTP status, 2: the error code the API returned. */
						__( 'The API answered %1$d (%2$s).', 'kaaljyoti' ),
						$status,
						self::error_code( $body )
					),
				)
			);
		}

		$lines = array(
			sprintf(
				/* translators: 1: engine version, 2: ephemeris name and version, for example "kaaljyoti-ephemeris 0.1.1". */
				__( 'Engine %1$s, ephemeris %2$s.', 'kaaljyoti' ),
				isset( $body['engine'] ) ? (string) $body['engine'] : '?',
				isset( $body['ephemeris'] ) ? (string) $body['ephemeris'] : '?'
			),
		);

		$secret = (string) self::get( 'secret_key' );
		if ( '' === $secret ) {
			$lines[] = __( 'No secret key is stored, so only the health check ran. Browser rendering does not need one.', 'kaaljyoti' );
			wp_send_json_success( array( 'message' => implode( ' ', $lines ) ) );
		}

		list( $line, $plan ) = self::test_panchang( $base, $secret );
		$lines[]             = $line;

		if ( null !== $plan ) {
			$lines = array_merge( $lines, self::proxy_lines( $plan ) );
		}

		wp_send_json_success( array( 'message' => implode( ' ', $lines ) ) );
	}

	/**
	 * The secret key half of the connection test.
	 *
	 * @param string $base   The API base URL.
	 * @param string $secret The stored secret key.
	 * @return array{0: string, 1: string|null} One translated line about what came back, and the plan when the key worked.
	 */
	private static function test_panchang( string $base, string $secret ): array {
		$city = self::city( (string) self::get( 'default_city' ) ) ?? self::CITIES['delhi'];

		$answer = wp_remote_post(
			$base . '/v1/panchang',
			array(
				'timeout' => 15,
				'headers' => array(
					'Accept'        => 'application/json',
					'Authorization' => 'Bearer ' . $secret,
					'Content-Type'  => 'application/json',
					'X-KJ-Client'   => self::client_tag(),
				),
				'body'    => wp_json_encode(
					array(
						'latitude'  => $city['latitude'],
						'longitude' => $city['longitude'],
						'timezone'  => $city['timezone'],
						'place'     => $city['name'],
					)
				),
			)
		);

		if ( is_wp_error( $answer ) ) {
			/* translators: %s: the error WordPress reported. */
			return array( sprintf( __( 'The panchang call failed: %s', 'kaaljyoti' ), $answer->get_error_message() ), null );
		}

		$status = (int) wp_remote_retrieve_response_code( $answer );
		$body   = json_decode( (string) wp_remote_retrieve_body( $answer ), true );

		if ( 200 !== $status ) {
			return array(
				sprintf(
					/* translators: 1: HTTP status, 2: the error code the API returned. */
					__( 'The secret key was refused: %1$d (%2$s).', 'kaaljyoti' ),
					$status,
					self::error_code( is_array( $body ) ? $body : null )
				),
				null,
			);
		}

		$plan = strtolower( (string) wp_remote_retrieve_header( $answer, 'x-kj-plan' ) );

		return array(
			sprintf(
				/* translators: %s: the plan the key is on, for example "free". */
				__( 'The secret key works; plan: %s.', 'kaaljyoti' ),
				'' === $plan ? __( 'unknown', 'kaaljyoti' ) : $plan
			),
			$plan,
		);
	}

	/**
	 * What the key's plan means for the proxy and the PDFs, in a line each.
	 *
	 * @param string $plan The plan the key is on (`X-KJ-Plan`), lower-cased.
	 * @return string[] Translated lines.
	 */
	private static function proxy_lines( string $plan ): array {
		if ( ! self::get( 'proxy' ) ) {
			return array( __( 'The server proxy is off, so there is no PDF button, and the month widgets call the API with the publishable key.', 'kaaljyoti' ) );
		}

		// Every plan can call the month routes; a month costs 20 credits.
		$lines = array(
			__( 'The server proxy is on: the month widgets load through it, and each month is cached here.', 'kaaljyoti' ),
		);

		if ( self::get( 'pdf' ) ) {
			// The one thing a plan still decides: PDFs are not on Free.
			$lines[] = 'free' === $plan
				? __( 'PDF downloads are on, but PDFs are not on the Free plan; visitors will see a "needs a plan" note on the button until you move to a paid plan.', 'kaaljyoti' )
				: __( 'PDF downloads are on, and this plan includes PDFs: a kundli PDF costs 1,000 credits and a match PDF 500.', 'kaaljyoti' );
		}

		return $lines;
	}

	/**
	 * The `error.code` of a decoded error body.
	 *
	 * @param array<string, mixed>|null $body The decoded response body.
	 * @return string The code, or a translated stand-in.
	 */
	private static function error_code( ?array $body ): string {
		if ( is_array( $body ) && isset( $body['error']['code'] ) ) {
			return (string) $body['error']['code'];
		}

		return __( 'no error code', 'kaaljyoti' );
	}
}
