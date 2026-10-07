<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The one place attributes become markup.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * Turns a shortcode's or a block's attributes into a widget.
 *
 * Shortcodes and blocks both end here, so there is one whitelist, one set of
 * rules for what a value may be, and one decision about browser or server
 * rendering (design decision 3). An attribute that is not on the element's
 * list is dropped; a value that does not match its rule is dropped rather
 * than passed on for the API to refuse.
 */
final class Elements {

	/**
	 * The twenty-two elements, by the suffix of their tag name: the seven of
	 * 0.1.0, then the fifteen of the widgets revamp in catalogue order.
	 */
	public const ELEMENTS = array(
		'panchang',
		'muhurta',
		'chart',
		'kundli-form',
		'match-form',
		'horoscope',
		'reading',
		'panchang-month',
		'calendar',
		'transits',
		'ephemeris',
		'moon-sign',
		'lagna',
		'manglik',
		'sade-sati',
		'dasha',
		'vargas',
		'kp',
		'strength',
		'life-areas',
		'varshphal',
		'vimshottari-reading',
	);

	/**
	 * The month widgets (`/v1/panchang/month`, `/v1/ephemeris/month`): with
	 * the proxy on they ask this site ({@see Proxy}), which caches the month,
	 * and then need no publishable key; without it they call the API with
	 * the publishable key like the rest.
	 *
	 * @var string[]
	 */
	public const PROXY_ONLY = array( 'panchang-month', 'ephemeris' );

	/**
	 * The birth calculators: a compact birth form, or a birth as attributes.
	 *
	 * @var string[]
	 */
	public const CALCULATORS = array( 'moon-sign', 'lagna', 'manglik', 'sade-sati', 'dasha', 'vargas', 'kp', 'strength', 'life-areas', 'varshphal', 'vimshottari-reading' );

	/**
	 * The elements that close with a disclaimer line, and so take the site's
	 * disclaimer setting. The birth form takes it only when it shows readings.
	 *
	 * @var string[]
	 */
	public const REPORTS = array( 'horoscope', 'reading', 'kundli-form', 'moon-sign', 'lagna', 'life-areas', 'varshphal', 'vimshottari-reading' );

	/**
	 * The twelve signs a horoscope or a lagna reading can name, as the API
	 * spells them, with the name the editor's dropdown shows.
	 *
	 * @var array<string, string>
	 */
	public const SIGNS = array(
		'aries'       => 'Aries',
		'taurus'      => 'Taurus',
		'gemini'      => 'Gemini',
		'cancer'      => 'Cancer',
		'leo'         => 'Leo',
		'virgo'       => 'Virgo',
		'libra'       => 'Libra',
		'scorpio'     => 'Scorpio',
		'sagittarius' => 'Sagittarius',
		'capricorn'   => 'Capricorn',
		'aquarius'    => 'Aquarius',
		'pisces'      => 'Pisces',
	);

	/**
	 * The twenty-seven nakshatras a nakshatra reading can name, as the API
	 * spells them.
	 *
	 * @var array<string, string>
	 */
	public const NAKSHATRAS = array(
		'ashwini'           => 'Ashwini',
		'bharani'           => 'Bharani',
		'krittika'          => 'Krittika',
		'rohini'            => 'Rohini',
		'mrigashira'        => 'Mrigashira',
		'ardra'             => 'Ardra',
		'punarvasu'         => 'Punarvasu',
		'pushya'            => 'Pushya',
		'ashlesha'          => 'Ashlesha',
		'magha'             => 'Magha',
		'purva_phalguni'    => 'Purva Phalguni',
		'uttara_phalguni'   => 'Uttara Phalguni',
		'hasta'             => 'Hasta',
		'chitra'            => 'Chitra',
		'swati'             => 'Swati',
		'vishakha'          => 'Vishakha',
		'anuradha'          => 'Anuradha',
		'jyeshtha'          => 'Jyeshtha',
		'mula'              => 'Mula',
		'purva_ashadha'     => 'Purva Ashadha',
		'uttara_ashadha'    => 'Uttara Ashadha',
		'shravana'          => 'Shravana',
		'dhanishta'         => 'Dhanishta',
		'shatabhisha'       => 'Shatabhisha',
		'purva_bhadrapada'  => 'Purva Bhadrapada',
		'uttara_bhadrapada' => 'Uttara Bhadrapada',
		'revati'            => 'Revati',
	);

	/** The spans a horoscope covers. */
	public const PERIODS = array( 'daily', 'weekly', 'monthly', 'yearly' );

	/**
	 * The readings, which are also what the birth form's `readings` may name,
	 * in the order the form draws them.
	 */
	public const READING_TYPES = array( 'lagna', 'nakshatra', 'house_lords', 'grahas', 'yogas', 'vimshottari', 'varshphal', 'life_areas' );

	/**
	 * The personal readings: about one birth and nothing else, so they have
	 * no preset and are never drawn on the server. The API has them on every
	 * plan, at 5 credits each.
	 */
	public const PERSONAL_READINGS = array( 'house_lords', 'grahas', 'yogas', 'vimshottari', 'varshphal', 'life_areas', 'kundli' );

	/**
	 * The types `[kj_reading]` takes: every reading, and `kundli` — several
	 * of them in one request (`parts`, default all), which the birth form
	 * does not draw since it lists its readings itself.
	 */
	public const TYPES = array( 'lagna', 'nakshatra', 'house_lords', 'grahas', 'yogas', 'vimshottari', 'varshphal', 'life_areas', 'kundli' );

	/** What the birth form draws for a bare `readings`: the first two. */
	public const DEFAULT_READINGS = array( 'lagna', 'nakshatra' );

	/** The longest astrologer's name a disclaimer may carry, in characters. */
	public const DISCLAIMER_NAME_MAX = 80;

	/** The longest link a disclaimer may carry. */
	public const DISCLAIMER_URL_MAX = 200;

	/**
	 * The elements that are always rendered in the browser.
	 *
	 * A form has nothing to draw until a visitor submits it, so there is no
	 * HTML a server could render and cache for it.
	 *
	 * @var string[]
	 */
	public const BROWSER_ONLY = array( 'kundli-form', 'match-form' );

	/**
	 * What each element accepts, in the order it is written out. Every one
	 * also takes {@see COMMON}, written after these.
	 *
	 * @var array<string, string[]>
	 */
	private const ATTRIBUTES = array(
		'panchang'            => array( 'city', 'lat', 'lon', 'timezone', 'place', 'date', 'lang', 'show', 'powered-by', 'theme' ),
		'muhurta'             => array( 'city', 'lat', 'lon', 'timezone', 'place', 'date', 'lang', 'show', 'powered-by', 'theme' ),
		'chart'               => array( 'datetime', 'timezone', 'lat', 'lon', 'place', 'city', 'style', 'chart-style', 'size', 'varga', 'show-degrees', 'lang', 'powered-by', 'theme' ),
		'kundli-form'         => array( 'tabs', 'show', 'city', 'chart-style', 'size', 'varga', 'readings', 'time-format', 'remember', 'pdf', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
		'match-form'          => array( 'city', 'time-format', 'remember', 'pdf', 'lang', 'powered-by', 'theme' ),
		'horoscope'           => array( 'sign', 'period', 'date', 'timezone', 'show-basis', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
		'reading'             => array( 'type', 'sign', 'nakshatra', 'year', 'parts', 'datetime', 'timezone', 'lat', 'lon', 'place', 'city', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
		'panchang-month'      => array( 'city', 'lat', 'lon', 'timezone', 'place', 'month', 'masa', 'lang', 'powered-by', 'theme' ),
		'calendar'            => array( 'city', 'lat', 'lon', 'timezone', 'place', 'date', 'lang', 'powered-by', 'theme' ),
		'transits'            => array( 'city', 'lat', 'lon', 'timezone', 'place', 'chart', 'chart-style', 'size', 'lang', 'powered-by', 'theme' ),
		'ephemeris'           => array( 'city', 'lat', 'lon', 'timezone', 'place', 'month', 'system', 'lang', 'powered-by', 'theme' ),
		'moon-sign'           => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'reading', 'time-format', 'remember', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
		'lagna'               => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'reading', 'time-format', 'remember', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
		'manglik'             => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'time-format', 'remember', 'lang', 'powered-by', 'theme' ),
		'sade-sati'           => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'time-format', 'remember', 'lang', 'powered-by', 'theme' ),
		'dasha'               => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'system', 'yogini', 'time-format', 'remember', 'lang', 'powered-by', 'theme' ),
		'vargas'              => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'varga', 'chart-style', 'size', 'time-format', 'remember', 'lang', 'powered-by', 'theme' ),
		'kp'                  => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'tab', 'time-format', 'remember', 'lang', 'powered-by', 'theme' ),
		'strength'            => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'tab', 'time-format', 'remember', 'lang', 'powered-by', 'theme' ),
		'life-areas'          => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'time-format', 'remember', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
		'varshphal'           => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'year', 'chart-style', 'size', 'reading', 'time-format', 'remember', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
		'vimshottari-reading' => array( 'datetime', 'timezone', 'lat', 'lon', 'city', 'place', 'name', 'time-format', 'remember', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme' ),
	);

	/**
	 * What every element takes besides its own: the preset, the font and the
	 * card's heading (`off` drops it).
	 *
	 * @var string[]
	 */
	public const COMMON = array( 'preset', 'font', 'heading' );

	/**
	 * The elements that show a zodiac sign, and so take `sign-icons` (the
	 * icons' theme, widgets decision 29) after {@see COMMON}.
	 *
	 * @var string[]
	 */
	public const SIGN_ELEMENTS = array( 'kundli-form', 'match-form', 'horoscope', 'reading', 'transits', 'ephemeris', 'moon-sign', 'lagna', 'sade-sati', 'vargas', 'kp', 'strength', 'varshphal' );

	/**
	 * The words the birth form's `tabs` may name, in the order it draws them.
	 *
	 * @var string[]
	 */
	public const KUNDLI_TABS = array( 'overview', 'charts', 'planets', 'dasha', 'life', 'readings' );

	/**
	 * The tabs a calculator can open on, per element.
	 *
	 * @var array<string, string[]>
	 */
	private const OPENING_TABS = array(
		'kp'       => array( 'cusps', 'planets', 'significators', 'ruling' ),
		'strength' => array( 'shadbala', 'ashtakavarga' ),
	);

	/**
	 * The reckonings `system` may name, per element.
	 *
	 * @var array<string, string[]>
	 */
	private const SYSTEMS = array(
		'ephemeris' => array( 'sidereal', 'tropical' ),
		'dasha'     => array( 'vimshottari', 'yogini' ),
	);

	/** The longest heading a card may be given, in characters. */
	public const HEADING_MAX = 80;

	/** The longest name a birth may be given, in characters. */
	public const NAME_MAX = 60;

	/**
	 * The sections `show` may name, per element.
	 *
	 * @var array<string, string[]>
	 */
	private const SHOW_TOKENS = array(
		'panchang'    => array( 'header', 'tithi', 'nakshatra', 'yoga', 'karana', 'sun', 'windows', 'masa' ),
		'muhurta'     => array( 'header', 'tithi', 'nakshatra', 'yoga', 'karana', 'sun', 'windows', 'masa' ),
		'kundli-form' => array( 'summary', 'chart' ),
	);

	/** The chart styles both `style` and `chart-style` accept. */
	private const CHART_STYLES = array( 'north', 'south', 'circular' );

	/**
	 * Renders one element.
	 *
	 * @param string               $element One of {@see ELEMENTS}.
	 * @param array<string, mixed> $atts    Attributes, keyed as the custom element writes them.
	 * @return string The markup, or an empty string.
	 */
	public static function render( string $element, array $atts ): string {
		if ( ! isset( self::ATTRIBUTES[ $element ] ) ) {
			return '';
		}

		$clean = self::attributes( $element, $atts );

		// The seam a later version's server renderer plugs into: it answers
		// with HTML, or with null to say "fall back to the browser". The birth
		// form and the match form are always rendered in the browser, because
		// they have nothing to draw until a visitor submits them.
		if ( 'server' === Settings::get( 'render_mode' ) && ! in_array( $element, self::BROWSER_ONLY, true ) && class_exists( Server\Renderer::class ) ) {
			$html = Server\Renderer::render( $element, $clean );
			if ( null !== $html ) {
				return $html;
			}
		}

		// With the proxy on, the two month widgets ask this site, not the API,
		// so they work on a page with no publishable key.
		$needs_key = ! ( in_array( $element, self::PROXY_ONLY, true ) && Proxy::enabled() );
		if ( $needs_key && '' === (string) Settings::get( 'publishable_key' ) ) {
			return self::missing_key_notice();
		}

		Assets::enqueue_widgets();

		$markup = '<kj-' . $element;
		foreach ( $clean as $name => $value ) {
			$markup .= ' ' . $name . '="' . esc_attr( $value ) . '"';
		}

		return $markup . '></kj-' . $element . '>';
	}

	/**
	 * The attributes an element will actually carry.
	 *
	 * @param string               $element One of {@see ELEMENTS}.
	 * @param array<string, mixed> $atts    What the shortcode or block passed.
	 * @return array<string, string> Attribute name to value, in whitelist order.
	 */
	public static function attributes( string $element, array $atts ): array {
		$clean = array();

		foreach ( self::whitelist( $element ) as $name ) {
			if ( ! isset( $atts[ $name ] ) ) {
				continue;
			}

			$value = self::sanitize_attribute( $element, $name, $atts[ $name ] );
			if ( null !== $value ) {
				$clean[ $name ] = $value;
			}
		}

		// Latitude and longitude only mean anything together.
		if ( isset( $clean['lat'] ) !== isset( $clean['lon'] ) ) {
			unset( $clean['lat'], $clean['lon'] );
		}

		if ( 'reading' === $element ) {
			$clean = self::reading_preset( $clean );
		}

		return self::with_defaults( $element, self::with_disclaimer( $element, $clean ) );
	}

	/**
	 * Every attribute an element takes: its own, then {@see COMMON}, then
	 * `sign-icons` where it shows a sign.
	 *
	 * @param string $element One of {@see ELEMENTS}.
	 * @return string[] The names, in the order they are written out.
	 */
	public static function whitelist( string $element ): array {
		if ( ! isset( self::ATTRIBUTES[ $element ] ) ) {
			return array();
		}

		$names = array_merge( self::ATTRIBUTES[ $element ], self::COMMON );

		return in_array( $element, self::SIGN_ELEMENTS, true ) ? array_merge( $names, array( 'sign-icons' ) ) : $names;
	}

	/**
	 * Fills in the settings that stand in for an unwritten attribute.
	 *
	 * The theme is written only when it says something: `auto` is what the
	 * bundle does anyway, so it is left off unless it has to beat a site-wide
	 * `light` or `dark` on the script tag.
	 *
	 * @param string                $element One of {@see ELEMENTS}.
	 * @param array<string, string> $clean   The sanitised attributes.
	 * @return array<string, string> The attributes, in whitelist order.
	 */
	private static function with_defaults( string $element, array $clean ): array {
		$whitelist = self::whitelist( $element );

		// A reading is about a birth only when it has one; the default city on
		// a reading with no birth time would be half a birth, not a place.
		$wants_city = 'reading' !== $element || isset( $clean['datetime'] );

		if ( $wants_city && in_array( 'city', $whitelist, true ) && ! isset( $clean['city'] ) && ! isset( $clean['lat'] ) ) {
			$city = (string) Settings::get( 'default_city' );
			if ( isset( Settings::CITIES[ $city ] ) ) {
				$clean['city'] = $city;
			}
		}

		if ( ! isset( $clean['lang'] ) ) {
			$clean['lang'] = (string) Settings::get( 'language' );
		}

		if ( ! isset( $clean['powered-by'] ) ) {
			$clean['powered-by'] = (string) Settings::get( 'powered_by' );
		}

		$theme = Settings::theme();
		if ( ! isset( $clean['theme'] ) && 'auto' !== $theme ) {
			$clean['theme'] = $theme;
		} elseif ( isset( $clean['theme'] ) && 'auto' === $clean['theme'] && 'auto' === $theme ) {
			unset( $clean['theme'] );
		}

		$ordered = array();
		foreach ( $whitelist as $name ) {
			if ( isset( $clean[ $name ] ) ) {
				$ordered[ $name ] = $clean[ $name ];
			}
		}

		return $ordered;
	}

	/**
	 * One attribute's rule.
	 *
	 * @param string $element One of {@see ELEMENTS}.
	 * @param string $name    The attribute name.
	 * @param mixed  $value   What was written.
	 * @return string|null The value to write out, or null to drop it.
	 */
	private static function sanitize_attribute( string $element, string $name, $value ): ?string {
		if ( is_bool( $value ) ) {
			$value = $value ? 'true' : 'false';
		}

		if ( ! is_scalar( $value ) ) {
			return null;
		}

		$value = trim( sanitize_text_field( (string) $value ) );
		if ( '' === $value ) {
			return null;
		}

		switch ( $name ) {
			case 'city':
				$city = strtolower( $value );

				return isset( Settings::CITIES[ $city ] ) ? $city : null;

			case 'lat':
				return self::degrees( $value, 90.0 );

			case 'lon':
				return self::degrees( $value, 180.0 );

			case 'timezone':
				return self::timezone( $value );

			case 'place':
				return substr( $value, 0, 120 );

			case 'date':
				return self::date( $value );

			case 'datetime':
				return self::datetime( $value );

			case 'lang':
				return in_array( strtolower( $value ), array( 'en', 'hi' ), true ) ? strtolower( $value ) : null;

			case 'show':
				return self::show( $element, $value );

			case 'powered-by':
				return in_array( strtolower( $value ), array( 'shown', 'hidden' ), true ) ? strtolower( $value ) : null;

			case 'style':
			case 'chart-style':
				return in_array( strtolower( $value ), self::CHART_STYLES, true ) ? strtolower( $value ) : null;

			case 'size':
				return is_numeric( $value ) ? (string) max( 200, min( 2000, (int) $value ) ) : null;

			case 'varga':
				return self::varga( $value );

			case 'show-degrees':
			case 'show-basis':
				return self::boolean( $value );

			case 'year':
				// Only the shape: which years are answered is the API's to say
				// (its supported range, from its ephemeris data), and a year
				// outside it gets the API's own message naming the range.
				return preg_match( '/^\d{4}$/', $value ) ? $value : null;

			case 'theme':
				return in_array( strtolower( $value ), Settings::THEMES, true ) ? strtolower( $value ) : null;

			case 'sign':
				return isset( self::SIGNS[ strtolower( $value ) ] ) ? strtolower( $value ) : null;

			case 'nakshatra':
				return self::nakshatra( $value );

			case 'period':
				return in_array( strtolower( $value ), self::PERIODS, true ) ? strtolower( $value ) : null;

			case 'type':
				$type = self::reading_type( $value );

				return in_array( $type, self::TYPES, true ) ? $type : null;

			case 'readings':
				return self::readings( $value );

			case 'parts':
				return self::parts( $value );

			case 'disclaimer':
				return in_array( strtolower( $value ), array( 'off', 'default' ), true ) ? strtolower( $value ) : null;

			case 'preset':
				return in_array( strtolower( $value ), Settings::PRESETS, true ) ? strtolower( $value ) : null;

			case 'font':
				return in_array( strtolower( $value ), Settings::FONT_MODES, true ) ? strtolower( $value ) : null;

			case 'sign-icons':
				return in_array( strtolower( trim( $value ) ), Settings::SIGN_ICON_THEMES, true ) ? strtolower( trim( $value ) ) : null;

			case 'heading':
				return self::heading( $value );

			case 'name':
				return trim( mb_substr( $value, 0, self::NAME_MAX ) );

			case 'month':
				return self::month( $value );

			case 'masa':
				return in_array( strtolower( $value ), array( 'purnimanta', 'amanta' ), true ) ? strtolower( $value ) : null;

			case 'system':
				return in_array( strtolower( $value ), self::SYSTEMS[ $element ] ?? array(), true ) ? strtolower( $value ) : null;

			case 'tab':
				return in_array( strtolower( $value ), self::OPENING_TABS[ $element ] ?? array(), true ) ? strtolower( $value ) : null;

			case 'tabs':
				return self::tabs( $value );

			case 'time-format':
				$format = rtrim( strtolower( $value ), 'h' );

				return in_array( $format, array( '12', '24' ), true ) ? $format : null;

			case 'chart':
			case 'reading':
			case 'yogini':
			case 'remember':
			case 'pdf':
				// On is what the element does untold, so only off is written.
				return 'false' === self::boolean( $value ) ? 'off' : null;

			case 'disclaimer-name':
				return self::disclaimer_name( $value );

			case 'disclaimer-url':
				return self::disclaimer_url( $value );
		}

		return null;
	}

	/**
	 * A nakshatra id, forgiving the spellings an editor types.
	 *
	 * `Purva Phalguni`, `purva-phalguni` and `purva_phalguni` are all the
	 * API's `purva_phalguni`.
	 *
	 * @param string $value What was written.
	 * @return string|null The id, or null.
	 */
	private static function nakshatra( string $value ): ?string {
		$id = (string) preg_replace( '/[\s-]+/', '_', strtolower( $value ) );

		return isset( self::NAKSHATRAS[ $id ] ) ? $id : null;
	}

	/**
	 * A reading's type, forgiving the spellings an editor types: `House
	 * Lords`, `house-lords` and `house_lords` are all `house_lords`, and
	 * `life areas` is `life_areas`.
	 *
	 * @param string $value What was written.
	 * @return string The type as the element spells it, known or not.
	 */
	private static function reading_type( string $value ): string {
		return (string) preg_replace( '/[\s-]+/', '_', strtolower( trim( $value ) ) );
	}

	/**
	 * The birth form's `readings`, as the element reads it.
	 *
	 * The element wants the attribute present and empty for the lagna and
	 * nakshatra readings, or a list naming the ones to draw. A shortcode
	 * cannot write an empty attribute that WordPress keeps, and a block stores
	 * an empty string for "off", so the default is written here as a word:
	 * `both` (or `true`, `yes`, `on`, `1`, or the two names together); `all`
	 * is every reading, eight calls per submit. Any other list of the
	 * {@see READING_TYPES} (`house-lords` and `life-areas` spelled either
	 * way), separated by spaces or commas, is kept in the order the form draws
	 * them; a list with anything else in it is off. The personal readings are
	 * drawn only when named (or by `all`) — one call per submit each, at 5
	 * credits.
	 *
	 * @param string $value What was written.
	 * @return string|null `''` for the two, a comma-separated list, or null for none.
	 */
	private static function readings( string $value ): ?string {
		$tokens = preg_split( '/[\s,]+/', strtolower( str_replace( '-', '_', $value ) ) );
		$tokens = is_array( $tokens ) ? array_values( array_filter( $tokens ) ) : array();

		if ( 1 === count( $tokens ) && in_array( $tokens[0], array( 'both', 'true', 'yes', 'on', '1' ), true ) ) {
			return '';
		}

		if ( array( 'all' ) === $tokens ) {
			return implode( ',', self::READING_TYPES );
		}

		if ( array() === $tokens || array() !== array_diff( $tokens, self::READING_TYPES ) ) {
			return null;
		}

		$kept = array_values( array_intersect( self::READING_TYPES, $tokens ) );

		return self::DEFAULT_READINGS === $kept ? '' : implode( ',', $kept );
	}

	/**
	 * A kundli report's `parts`: the readings it names, in the order the API
	 * draws them, comma-separated; nothing it knows is no attribute (all).
	 *
	 * @param string $value What was written.
	 * @return string|null The list, or null.
	 */
	private static function parts( string $value ): ?string {
		$tokens = preg_split( '/[\s,]+/', strtolower( str_replace( '-', '_', $value ) ) );
		$order  = array( 'lagna', 'nakshatra', 'life_areas', 'house_lords', 'grahas', 'yogas', 'vimshottari', 'varshphal' );
		$kept   = array_values( array_intersect( $order, is_array( $tokens ) ? $tokens : array() ) );

		return array() === $kept ? null : implode( ',', $kept );
	}

	/**
	 * The astrologer a disclaimer names: plain text, at most
	 * {@see DISCLAIMER_NAME_MAX} characters.
	 *
	 * @param string $value What was written, already through `sanitize_text_field()`.
	 * @return string|null The name, or null.
	 */
	public static function disclaimer_name( string $value ): ?string {
		$name = trim( sanitize_text_field( $value ) );
		if ( '' === $name ) {
			return null;
		}

		return trim( mb_substr( $name, 0, self::DISCLAIMER_NAME_MAX ) );
	}

	/**
	 * The link beside that name: `http` or `https` only, at most
	 * {@see DISCLAIMER_URL_MAX} characters, or nothing.
	 *
	 * @param string $value What was written.
	 * @return string|null The URL, or null.
	 */
	public static function disclaimer_url( string $value ): ?string {
		$url = trim( esc_url_raw( trim( $value ), array( 'http', 'https' ) ) );
		if ( '' === $url || strlen( $url ) > self::DISCLAIMER_URL_MAX ) {
			return null;
		}

		$scheme = strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) );

		return in_array( $scheme, array( 'http', 'https' ), true ) ? $url : null;
	}

	/**
	 * A reading's preset: the sign for a lagna, the nakshatra for a nakshatra,
	 * and neither for a personal reading, which is always a birth's. `year`
	 * belongs to the varshphal and the kundli report (whose varshphal it
	 * sets), `parts` to the kundli report alone. Without `year` the element
	 * reads the varshphal year running now.
	 *
	 * `type` defaults to `lagna`, as the element's does, except that a
	 * nakshatra written with no type and no sign plainly means a nakshatra
	 * reading. The preset that does not belong to the type is dropped, so the
	 * element is never handed two answers to one question.
	 *
	 * @param array<string, string> $clean The sanitised attributes.
	 * @return array<string, string> The same, with one preset at most.
	 */
	private static function reading_preset( array $clean ): array {
		if ( ! isset( $clean['type'] ) && isset( $clean['nakshatra'] ) && ! isset( $clean['sign'] ) ) {
			$clean['type'] = 'nakshatra';
		}

		$type = $clean['type'] ?? 'lagna';
		if ( 'varshphal' !== $type && 'kundli' !== $type ) {
			unset( $clean['year'] );
		}
		if ( 'kundli' !== $type ) {
			unset( $clean['parts'] );
		}

		if ( in_array( $type, self::PERSONAL_READINGS, true ) ) {
			unset( $clean['sign'], $clean['nakshatra'] );
		} elseif ( 'nakshatra' === $type ) {
			unset( $clean['sign'] );
		} else {
			unset( $clean['nakshatra'] );
		}

		return $clean;
	}

	/**
	 * The disclaimer attributes a report element carries.
	 *
	 * What the shortcode or block says wins; the site's setting fills in when
	 * it says nothing. The element itself knows three states and this writes
	 * one of them:
	 *
	 *   * `disclaimer="off"` — the answer comes back without the line;
	 *   * `disclaimer-name` (and `disclaimer-url`) — the line names the site's
	 *     astrologer;
	 *   * nothing — the API's own default line.
	 *
	 * `disclaimer="default"` is the plugin's word for "nothing, whatever the
	 * site's setting is", so it is never written onto the element.
	 *
	 * @param string                $element One of {@see ELEMENTS}.
	 * @param array<string, string> $clean   The sanitised attributes.
	 * @return array<string, string> The attributes, with the disclaimer resolved.
	 */
	private static function with_disclaimer( string $element, array $clean ): array {
		if ( ! in_array( $element, self::REPORTS, true ) ) {
			return $clean;
		}

		$asked = $clean['disclaimer'] ?? null;
		$name  = $clean['disclaimer-name'] ?? null;
		$url   = $clean['disclaimer-url'] ?? null;
		unset( $clean['disclaimer'], $clean['disclaimer-name'], $clean['disclaimer-url'] );

		// The birth form draws no reading unless it was asked to, and then
		// there is no line to configure.
		if ( 'kundli-form' === $element && ! isset( $clean['readings'] ) ) {
			return $clean;
		}

		if ( 'off' === $asked ) {
			$clean['disclaimer'] = 'off';

			return $clean;
		}

		if ( 'default' === $asked ) {
			return $clean;
		}

		if ( null !== $name ) {
			$clean['disclaimer-name'] = $name;
			if ( null !== $url ) {
				$clean['disclaimer-url'] = $url;
			}

			return $clean;
		}

		return array_merge( $clean, Settings::disclaimer_attributes() );
	}

	/**
	 * A card's own heading: plain text of at most {@see HEADING_MAX}
	 * characters, or `off` for no header at all.
	 *
	 * @param string $value What was written, already through `sanitize_text_field()`.
	 * @return string|null The heading, or null.
	 */
	private static function heading( string $value ): ?string {
		if ( in_array( strtolower( $value ), array( 'off', 'none', 'false', 'no' ), true ) ) {
			return 'off';
		}

		$heading = trim( mb_substr( $value, 0, self::HEADING_MAX ) );

		return '' === $heading ? null : $heading;
	}

	/**
	 * A calendar month, `YYYY-MM`.
	 *
	 * @param string $value What was written.
	 * @return string|null The month, or null.
	 */
	private static function month( string $value ): ?string {
		if ( ! preg_match( '/^(\d{4})-(\d{2})$/', $value, $parts ) ) {
			return null;
		}

		$month = (int) $parts[2];

		// The range of years is the API's to say; see 'year' above.
		return ( $month >= 1 && $month <= 12 ) ? $value : null;
	}

	/**
	 * The birth form's `tabs`: the words it knows, in the order it draws them,
	 * space-separated; none known is no attribute (every tab).
	 *
	 * @param string $value A list, spaces or commas between.
	 * @return string|null The tabs, or null.
	 */
	private static function tabs( string $value ): ?string {
		$tokens = preg_split( '/[\s,]+/', strtolower( $value ) );
		$kept   = array_values( array_intersect( self::KUNDLI_TABS, is_array( $tokens ) ? $tokens : array() ) );

		return array() === $kept ? null : implode( ' ', $kept );
	}

	/**
	 * A coordinate, within its range and written as a plain decimal.
	 *
	 * @param string $value  What was written.
	 * @param float  $limit  90 for a latitude, 180 for a longitude.
	 * @return string|null The coordinate, or null.
	 */
	private static function degrees( string $value, float $limit ): ?string {
		if ( ! is_numeric( $value ) ) {
			return null;
		}

		$degrees = (float) $value;
		if ( $degrees < -$limit || $degrees > $limit ) {
			return null;
		}

		$written = rtrim( rtrim( number_format( $degrees, 6, '.', '' ), '0' ), '.' );

		return '' === $written ? '0' : $written;
	}

	/**
	 * An IANA zone name, shaped like one.
	 *
	 * @param string $value What was written.
	 * @return string|null The zone, or null.
	 */
	private static function timezone( string $value ): ?string {
		if ( strlen( $value ) > 64 ) {
			return null;
		}

		return preg_match( '#^[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+)*$#', $value ) ? $value : null;
	}

	/**
	 * `today`, or a calendar date that exists.
	 *
	 * @param string $value What was written.
	 * @return string|null The date, or null.
	 */
	private static function date( string $value ): ?string {
		if ( 'today' === strtolower( $value ) ) {
			return 'today';
		}

		if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $value, $parts ) ) {
			return null;
		}

		return checkdate( (int) $parts[2], (int) $parts[3], (int) $parts[1] ) ? $value : null;
	}

	/**
	 * A wall clock at the birth place: `YYYY-MM-DDTHH:MM` or the same with seconds.
	 *
	 * @param string $value What was written.
	 * @return string|null The datetime, or null.
	 */
	private static function datetime( string $value ): ?string {
		if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/', $value, $parts ) ) {
			return null;
		}

		if ( ! checkdate( (int) $parts[2], (int) $parts[3], (int) $parts[1] ) ) {
			return null;
		}

		$hour   = (int) $parts[4];
		$minute = (int) $parts[5];
		$second = isset( $parts[6] ) ? (int) $parts[6] : 0;

		if ( $hour > 23 || $minute > 59 || $second > 59 ) {
			return null;
		}

		return $value;
	}

	/**
	 * The sections an element may be asked to draw.
	 *
	 * @param string $element One of {@see ELEMENTS}.
	 * @param string $value   A space-separated list.
	 * @return string|null The tokens this element knows, or null when none are left.
	 */
	private static function show( string $element, string $value ): ?string {
		$allowed = self::SHOW_TOKENS[ $element ] ?? array();
		$tokens  = preg_split( '/\s+/', strtolower( $value ) );
		$kept    = array();

		foreach ( is_array( $tokens ) ? $tokens : array() as $token ) {
			if ( in_array( $token, $allowed, true ) && ! in_array( $token, $kept, true ) ) {
				$kept[] = $token;
			}
		}

		return array() === $kept ? null : implode( ' ', $kept );
	}

	/**
	 * A divisional chart, `d1` to `d60`.
	 *
	 * @param string $value What was written.
	 * @return string|null The varga, or null.
	 */
	private static function varga( string $value ): ?string {
		$varga = strtolower( $value );
		if ( ! preg_match( '/^d(\d{1,2})$/', $varga, $parts ) ) {
			return null;
		}

		$division = (int) $parts[1];

		return ( $division >= 1 && $division <= 60 ) ? 'd' . $division : null;
	}

	/**
	 * A flag, written the way the element reads it.
	 *
	 * @param string $value What was written.
	 * @return string|null `true`, `false`, or null.
	 */
	private static function boolean( string $value ): ?string {
		$flag = strtolower( $value );

		if ( in_array( $flag, array( 'true', '1', 'yes', 'on' ), true ) ) {
			return 'true';
		}

		if ( in_array( $flag, array( 'false', '0', 'no', 'off' ), true ) ) {
			return 'false';
		}

		return null;
	}

	/**
	 * What a page shows when no publishable key is configured.
	 *
	 * Visitors see nothing at all; someone who can fix it is told what to fix.
	 *
	 * @return string The notice, or an empty string.
	 */
	private static function missing_key_notice(): string {
		if ( ! current_user_can( 'manage_options' ) ) {
			return '';
		}

		return '<p class="kj-notice">' . sprintf(
			/* translators: %s: a link to the plugin's settings, "Settings → Kaal Jyoti → Connection". */
			esc_html__( 'Kaal Jyoti: add a publishable key in %s.', 'kaal-jyoti' ),
			sprintf( '<a href="%s">%s</a>', esc_url( Settings::tab_url( 'connection' ) ), esc_html__( 'Settings → Kaal Jyoti → Connection', 'kaal-jyoti' ) )
		) . '</p>';
	}
}
