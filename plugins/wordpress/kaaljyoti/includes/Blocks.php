<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The twenty-two Gutenberg blocks.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * One block per element: `kaal-jyoti/panchang`, `muhurta`, `chart`,
 * `kundli-form`, `match-form`, `horoscope` and `reading` from 0.1.0, and the
 * revamp's `panchang-month`, `calendar`, `transits`, `ephemeris`,
 * `moon-sign`, `lagna`, `manglik`, `sade-sati`, `dasha`, `vargas`, `kp`,
 * `strength`, `life-areas`, `varshphal` and `vimshottari-reading`.
 *
 * The fifteen new blocks describe their panels as data and are drawn by one
 * shared script, `assets/blocks-kit.js` (registered here as
 * {@see KIT_HANDLE}, and a dependency in each block's `index.asset.php`);
 * the seven older blocks keep their own scripts.
 *
 * Each block is a directory under `blocks/` holding a `block.json` and an
 * `index.js`. The JSON is the whole registration — the name, the category, the
 * attributes and their defaults — and the JavaScript is plain ES5 on the
 * `wp.*` globals, so the plugin ships with no build step and wordpress.org
 * gets readable source (design decision 7).
 *
 * They are dynamic blocks: `save()` returns null and the markup is drawn at
 * render time by {@see Elements}, which is the same path the shortcodes take.
 * A block that stored its markup in the post would freeze today's panchang
 * into the content.
 */
final class Blocks {

	/** The handle the editor's shared data is attached to. */
	public const SCRIPT_HANDLE = 'kaal-jyoti-blocks';

	/** The shared editor script the revamp's blocks are drawn with. */
	public const KIT_HANDLE = 'kaal-jyoti-block-kit';

	/** The name every block's is built from. */
	public const NAMESPACE_PREFIX = 'kaal-jyoti/';

	/**
	 * Hooks the registration and the editor's assets.
	 *
	 * @return void
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'register_blocks' ) );
		add_action( 'enqueue_block_editor_assets', array( self::class, 'enqueue_editor' ) );
		add_action( 'enqueue_block_assets', array( self::class, 'enqueue_canvas' ) );
	}

	/**
	 * Registers each block from its own `block.json`.
	 *
	 * @return void
	 */
	public static function register_blocks(): void {
		// Before the blocks: their scripts name it as a dependency.
		wp_register_script(
			self::KIT_HANDLE,
			KAAL_JYOTI_URL . 'assets/blocks-kit.js',
			array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components' ),
			KAAL_JYOTI_VERSION,
			true
		);

		foreach ( Elements::ELEMENTS as $element ) {
			$directory = KAAL_JYOTI_DIR . 'blocks/' . $element;

			if ( ! is_readable( $directory . '/block.json' ) ) {
				continue;
			}

			register_block_type(
				$directory,
				array(
					'render_callback' => static function ( $attributes ) use ( $element ): string {
						return Elements::render( $element, is_array( $attributes ) ? $attributes : array() );
					},
				)
			);
		}
	}

	/**
	 * The editor's assets: the widget bundle, and the data the panels read.
	 *
	 * The preview in the editor is the live custom element, so the editor
	 * makes real API calls against the publishable key while a post is open
	 * (design decision 7). Each block's description says so.
	 *
	 * @return void
	 */
	public static function enqueue_editor(): void {
		// A handle with no file of its own: it exists to carry the data below
		// to whichever block script runs first. Every `index.js` reads
		// `window.kaalJyotiBlocks` when a panel is drawn rather than when it
		// loads, so the order the editor prints these in does not matter.
		if ( ! wp_script_is( self::SCRIPT_HANDLE, 'registered' ) ) {
			wp_register_script( self::SCRIPT_HANDLE, false, array(), KAAL_JYOTI_VERSION, true );
		}

		wp_enqueue_script( self::SCRIPT_HANDLE );
		wp_localize_script( self::SCRIPT_HANDLE, 'kaalJyotiBlocks', self::editor_data() );
	}

	/**
	 * The widget bundle, inside the editor's canvas.
	 *
	 * Since block API version 3 the canvas is an iframe, and a script enqueued
	 * on `enqueue_block_editor_assets` lands in the surrounding document, where
	 * it upgrades nothing. What the iframe loads is whatever was enqueued on
	 * `enqueue_block_assets` while the editor was being set up, so that is
	 * where the bundle goes — in the admin only; on the front end `Elements`
	 * enqueues it exactly where a widget renders.
	 *
	 * @return void
	 */
	public static function enqueue_canvas(): void {
		if ( ! is_admin() ) {
			return;
		}
		Assets::enqueue_widgets();
	}

	/**
	 * What the inspector panels need to draw themselves.
	 *
	 * @return array<string, mixed> The cities, the enums and the labels.
	 */
	public static function editor_data(): array {
		return array(
			'cities'           => self::city_options(),
			'langs'            => array(
				self::option( '', __( 'Site default', 'kaaljyoti' ) ),
				self::option( 'en', __( 'English', 'kaaljyoti' ) ),
				self::option( 'hi', __( 'Hindi', 'kaaljyoti' ) ),
			),
			'poweredBy'        => array(
				self::option( '', __( 'Site default', 'kaaljyoti' ) ),
				self::option( 'shown', __( 'Shown', 'kaaljyoti' ) ),
				self::option( 'hidden', __( 'Hidden', 'kaaljyoti' ) ),
			),
			'styles'           => array(
				self::option( '', __( 'Default (north)', 'kaaljyoti' ) ),
				self::option( 'north', __( 'North Indian', 'kaaljyoti' ) ),
				self::option( 'south', __( 'South Indian', 'kaaljyoti' ) ),
				self::option( 'circular', __( 'Circular', 'kaaljyoti' ) ),
			),
			'themes'           => array(
				self::option( '', __( 'Site default', 'kaaljyoti' ) ),
				self::option( 'auto', __( 'Auto (follow the site\'s colours)', 'kaaljyoti' ) ),
				self::option( 'light', __( 'Light', 'kaaljyoti' ) ),
				self::option( 'dark', __( 'Dark', 'kaaljyoti' ) ),
			),
			'signs'            => self::choices( Elements::SIGNS, __( 'Let the visitor pick', 'kaaljyoti' ) ),
			'nakshatras'       => self::choices( Elements::NAKSHATRAS, __( 'Let the visitor pick', 'kaaljyoti' ) ),
			'periods'          => array(
				self::option( '', __( 'Default (daily)', 'kaaljyoti' ) ),
				self::option( 'daily', __( 'Daily', 'kaaljyoti' ) ),
				self::option( 'weekly', __( 'Weekly', 'kaaljyoti' ) ),
				self::option( 'monthly', __( 'Monthly', 'kaaljyoti' ) ),
				self::option( 'yearly', __( 'Yearly', 'kaaljyoti' ) ),
			),
			'readingTypes'     => array(
				self::option( 'lagna', __( 'Lagna (the rising sign)', 'kaaljyoti' ) ),
				self::option( 'nakshatra', __( 'Nakshatra (the Moon\'s)', 'kaaljyoti' ) ),
				self::option( 'house_lords', __( 'House lords (needs a birth)', 'kaaljyoti' ) ),
				self::option( 'grahas', __( 'Grahas in signs and houses (needs a birth)', 'kaaljyoti' ) ),
				self::option( 'yogas', __( 'Yogas (needs a birth)', 'kaaljyoti' ) ),
				self::option( 'vimshottari', __( 'Vimshottari dashas (needs a birth)', 'kaaljyoti' ) ),
				self::option( 'varshphal', __( 'Varshphal, the year ahead (needs a birth)', 'kaaljyoti' ) ),
				self::option( 'life_areas', __( 'Life areas (needs a birth)', 'kaaljyoti' ) ),
				self::option( 'kundli', __( 'Kundli report: every reading of a birth (5 credits per part)', 'kaaljyoti' ) ),
			),
			'readings'         => array(
				self::option( '', __( 'None', 'kaaljyoti' ) ),
				self::option( 'both', __( 'Lagna and nakshatra (two calls per submit)', 'kaaljyoti' ) ),
				self::option( 'lagna', __( 'Lagna only (one call per submit)', 'kaaljyoti' ) ),
				self::option( 'nakshatra', __( 'Nakshatra only (one call per submit)', 'kaaljyoti' ) ),
				self::option( 'lagna,nakshatra,house_lords', __( 'Lagna, nakshatra and house lords (three calls per submit)', 'kaaljyoti' ) ),
				self::option( 'house_lords', __( 'House lords only (one call per submit)', 'kaaljyoti' ) ),
				self::option( 'vimshottari,varshphal', __( 'Dashas and the year ahead (two calls per submit)', 'kaaljyoti' ) ),
				self::option( 'life_areas', __( 'Life areas only (one call per submit)', 'kaaljyoti' ) ),
				self::option( 'all', __( 'Every reading (eight calls per submit)', 'kaaljyoti' ) ),
			),
			'presets'          => array(
				self::option( '', __( 'Site default', 'kaaljyoti' ) ),
				self::option( 'classic', __( 'Classic (cream and maroon)', 'kaaljyoti' ) ),
				self::option( 'modern', __( 'Modern (teal, a solid header)', 'kaaljyoti' ) ),
				self::option( 'minimal', __( 'Minimal (ink on white)', 'kaaljyoti' ) ),
				self::option( 'traditional', __( 'Traditional (saffron and gold)', 'kaaljyoti' ) ),
			),
			'signIcons'        => array(
				self::option( '', __( 'Site default', 'kaaljyoti' ) ),
				self::option( 'element', __( 'Element tiles', 'kaaljyoti' ) ),
				self::option( 'glyph', __( 'Glyph in a ring', 'kaaljyoti' ) ),
				self::option( 'devanagari', __( 'Hindi name seal', 'kaaljyoti' ) ),
				self::option( 'custom', __( 'The site\'s own images', 'kaaljyoti' ) ),
			),
			'fonts'            => array(
				self::option( '', __( 'Site default', 'kaaljyoti' ) ),
				self::option( 'system', __( 'The widget\'s own type', 'kaaljyoti' ) ),
				self::option( 'inherit', __( 'The theme\'s font', 'kaaljyoti' ) ),
			),
			'timeFormats'      => array(
				self::option( '', __( 'Site default', 'kaaljyoti' ) ),
				self::option( '12', __( '12-hour, with AM and PM', 'kaaljyoti' ) ),
				self::option( '24', __( '24-hour', 'kaaljyoti' ) ),
			),
			'onOff'            => array(
				self::option( '', __( 'On', 'kaaljyoti' ) ),
				self::option( 'off', __( 'Off', 'kaaljyoti' ) ),
			),
			'masas'            => array(
				self::option( '', __( 'Purnimanta (the month ends at full moon)', 'kaaljyoti' ) ),
				self::option( 'amanta', __( 'Amanta (the month ends at new moon)', 'kaaljyoti' ) ),
			),
			'ephemerisSystems' => array(
				self::option( '', __( 'Sidereal (Lahiri)', 'kaaljyoti' ) ),
				self::option( 'tropical', __( 'Tropical', 'kaaljyoti' ) ),
			),
			'dashaSystems'     => array(
				self::option( '', __( 'Vimshottari', 'kaaljyoti' ) ),
				self::option( 'yogini', __( 'Yogini', 'kaaljyoti' ) ),
			),
			'vargas'           => self::varga_options(),
			'kpTabs'           => array(
				self::option( '', __( 'Cusps', 'kaaljyoti' ) ),
				self::option( 'planets', __( 'Planets', 'kaaljyoti' ) ),
				self::option( 'significators', __( 'Significators', 'kaaljyoti' ) ),
				self::option( 'ruling', __( 'Ruling planets', 'kaaljyoti' ) ),
			),
			'strengthTabs'     => array(
				self::option( '', __( 'Shadbala', 'kaaljyoti' ) ),
				self::option( 'ashtakavarga', __( 'Ashtakavarga', 'kaaljyoti' ) ),
			),
			'disclaimers'      => array(
				self::option( '', __( 'Site setting', 'kaaljyoti' ) ),
				self::option( 'default', __( 'Default line', 'kaaljyoti' ) ),
				self::option( 'off', __( 'Off', 'kaaljyoti' ) ),
			),
			'defaults'         => array(
				'city'       => (string) Settings::get( 'default_city' ),
				'lang'       => (string) Settings::get( 'language' ),
				'poweredBy'  => (string) Settings::get( 'powered_by' ),
				'renderMode' => (string) Settings::get( 'render_mode' ),
				'theme'      => Settings::theme(),
				'preset'     => Settings::preset(),
				'proxy'      => Proxy::enabled(),
				// What the site's disclaimer setting writes onto a report
				// element, so the preview ends the way the page will.
				'disclaimer' => (object) Settings::disclaimer_attributes(),
			),
			'i18n'             => array(
				'place'              => __( 'Place', 'kaaljyoti' ),
				'city'               => __( 'City', 'kaaljyoti' ),
				'cityHelp'           => __( 'One of the bundled cities, or leave it at the site default and set coordinates below.', 'kaaljyoti' ),
				'latitude'           => __( 'Latitude', 'kaaljyoti' ),
				'longitude'          => __( 'Longitude', 'kaaljyoti' ),
				'timezone'           => __( 'Time zone', 'kaaljyoti' ),
				'timezoneHelp'       => __( 'An IANA name such as Asia/Kolkata. Leave it empty and the API derives it from the point.', 'kaaljyoti' ),
				'placeLabel'         => __( 'Place label', 'kaaljyoti' ),
				'date'               => __( 'Date', 'kaaljyoti' ),
				'dateHelp'           => __( 'YYYY-MM-DD, or empty for today at the place.', 'kaaljyoti' ),
				'datetime'           => __( 'Birth date and time', 'kaaljyoti' ),
				'datetimeHelp'       => __( 'The clock on the wall at the birth place: 1990-05-14T10:30:00.', 'kaaljyoti' ),
				'display'            => __( 'Display', 'kaaljyoti' ),
				'lang'               => __( 'Language', 'kaaljyoti' ),
				'poweredBy'          => __( 'Powered by', 'kaaljyoti' ),
				'sections'           => __( 'Sections', 'kaaljyoti' ),
				'sectionsHelp'       => __( 'A space-separated list: header tithi nakshatra yoga karana sun windows masa. Empty shows them all.', 'kaaljyoti' ),
				'formSections'       => __( 'Sections', 'kaaljyoti' ),
				'formSectionsHelp'   => __( 'A space-separated list: summary chart. Empty shows both.', 'kaaljyoti' ),
				'matchCityHelp'      => __( 'The city both birth forms start on. A visitor can change it on either form.', 'kaaljyoti' ),
				'chart'              => __( 'Chart', 'kaaljyoti' ),
				'style'              => __( 'Style', 'kaaljyoti' ),
				'size'               => __( 'Size in pixels', 'kaaljyoti' ),
				'sizeHelp'           => __( '200 to 2000. Empty leaves it to the widget.', 'kaaljyoti' ),
				'varga'              => __( 'Divisional chart', 'kaaljyoti' ),
				'vargaHelp'          => __( 'd1 to d60. Empty is the rasi chart.', 'kaaljyoti' ),
				'showDegrees'        => __( 'Degrees on the chart', 'kaaljyoti' ),
				'theme'              => __( 'Theme', 'kaaljyoti' ),
				'themeHelp'          => __( 'Auto follows the site\'s colours; Light and Dark use Kaal Jyoti\'s own palettes.', 'kaaljyoti' ),
				'yes'                => __( 'Shown', 'kaaljyoti' ),
				'no'                 => __( 'Hidden', 'kaaljyoti' ),
				'default'            => __( 'Default', 'kaaljyoti' ),
				'calls'              => __( 'The preview here calls the Kaal Jyoti API, exactly as the published page will.', 'kaaljyoti' ),
				'horoscope'          => __( 'Horoscope', 'kaaljyoti' ),
				'sign'               => __( 'Sign', 'kaaljyoti' ),
				'signHelp'           => __( 'Preselects the sign. The visitor can always pick another; with none chosen nothing is called until they do.', 'kaaljyoti' ),
				'period'             => __( 'Period', 'kaaljyoti' ),
				'horoscopeDateHelp'  => __( 'YYYY-MM-DD, or empty for today. A week runs seven days from it; a month and a year are the calendar ones around it.', 'kaaljyoti' ),
				'horoscopeZoneHelp'  => __( 'The IANA zone whose midnight starts each day, such as America/New_York. Empty is Asia/Kolkata.', 'kaaljyoti' ),
				'reading'            => __( 'Reading', 'kaaljyoti' ),
				'readingType'        => __( 'Reading', 'kaaljyoti' ),
				'lagnaSign'          => __( 'Lagna', 'kaaljyoti' ),
				'nakshatra'          => __( 'Nakshatra', 'kaaljyoti' ),
				'readingPickHelp'    => __( 'Pick one to show that reading, or leave it to the visitor. A birth below computes it instead.', 'kaaljyoti' ),
				'readingBirth'       => __( 'Birth (optional)', 'kaaljyoti' ),
				'readingBirthHelp'   => __( 'With a birth date and time the reading is computed from the birth. Always rendered in the browser.', 'kaaljyoti' ),
				'houseLordsBirth'    => __( 'Birth', 'kaaljyoti' ),
				'houseLordsHelp'     => __( 'This reading is always a birth\'s: a date and time, and a city or coordinates. Rendered in the browser. Each reading costs 5 credits.', 'kaaljyoti' ),
				'year'               => __( 'Year', 'kaaljyoti' ),
				'yearHelp'           => __( 'The varshphal runs from the birthday in this year to the next. Empty is the one running now.', 'kaaljyoti' ),
				'parts'              => __( 'Parts', 'kaaljyoti' ),
				'partsHelp'          => __( 'Which readings, comma-separated: lagna, nakshatra, life_areas, house_lords, grahas, yogas, vimshottari, varshphal. Empty is all eight; each costs 5 credits.', 'kaaljyoti' ),
				'showBasis'          => __( 'Transits behind the horoscope', 'kaaljyoti' ),
				'showBasisHelp'      => __( 'The horoscope shows its summaries. Shown also lists the transits it was read from.', 'kaaljyoti' ),
				'readings'           => __( 'Readings after the chart', 'kaaljyoti' ),
				'readingsHelp'       => __( 'Each reading is one more call per submit, at 5 credits each.', 'kaaljyoti' ),
				'disclaimer'         => __( 'Disclaimer', 'kaaljyoti' ),
				'disclaimerHelp'     => __( 'The line under the reading. Site setting follows Settings → Kaal Jyoti → Reports and PDFs.', 'kaaljyoti' ),
				'disclaimerName'     => __( 'Astrologer\'s name', 'kaaljyoti' ),
				'disclaimerNameHelp' => __( 'Names your astrologer in the line instead of the site setting. Up to 80 characters.', 'kaaljyoti' ),
				'disclaimerUrl'      => __( 'Astrologer\'s link', 'kaaljyoti' ),
				'stylePanel'         => __( 'Style', 'kaaljyoti' ),
				'preset'             => __( 'Preset', 'kaaljyoti' ),
				'presetHelp'         => __( 'The look, after the Kaal Jyoti PDF reports. Site default follows Settings → Kaal Jyoti → Appearance.', 'kaaljyoti' ),
				'font'               => __( 'Font', 'kaaljyoti' ),
				'signIcons'          => __( 'Sign icons', 'kaaljyoti' ),
				'signIconsHelp'      => __( 'How the zodiac signs are drawn. Site default follows Settings → Kaal Jyoti → Appearance, where your own images are chosen.', 'kaaljyoti' ),
				'heading'            => __( 'Heading', 'kaaljyoti' ),
				'headingHelp'        => __( 'Replaces the card\'s title. Write off for no header at all.', 'kaaljyoti' ),
				'timeFormat'         => __( 'Birth time', 'kaaljyoti' ),
				'remember'           => __( 'Remember the last entry', 'kaaljyoti' ),
				'rememberHelp'       => __( 'In the visitor\'s own browser only. Off forgets what was stored.', 'kaaljyoti' ),
				'pdf'                => __( 'Download PDF', 'kaaljyoti' ),
				'pdfHelp'            => __( 'Shown when PDF downloads are on in Settings → Kaal Jyoti → Reports and PDFs (a secret key, a paid plan). Off hides the button on this block.', 'kaaljyoti' ),
				'tabs'               => __( 'Tabs', 'kaaljyoti' ),
				'tabsHelp'           => __( 'A list of: overview charts planets dasha life readings. Empty shows them all.', 'kaaljyoti' ),
				'calcBirth'          => __( 'Birth (optional)', 'kaaljyoti' ),
				'calcBirthHelp'      => __( 'Leave empty for the birth form. A date and time here (1990-05-14T10:30:00), with a city or coordinates, shows that birth instead, with no form.', 'kaaljyoti' ),
				'calcCityHelp'       => __( 'With a birth time, the birth place; without one, the place the form starts on.', 'kaaljyoti' ),
				'personName'         => __( 'Name', 'kaaljyoti' ),
				'dateTitle'          => __( 'Date', 'kaaljyoti' ),
				'month'              => __( 'Month', 'kaaljyoti' ),
				'monthHelp'          => __( 'YYYY-MM, or empty for this month at the place.', 'kaaljyoti' ),
				'masa'               => __( 'Month reckoning', 'kaaljyoti' ),
				'zodiac'             => __( 'Zodiac', 'kaaljyoti' ),
				'chartShown'         => __( 'Chart', 'kaaljyoti' ),
				'readingPanel'       => __( 'Reading', 'kaaljyoti' ),
				'readingShown'       => __( 'Reading under the result', 'kaaljyoti' ),
				'dashaPanel'         => __( 'Dashas', 'kaaljyoti' ),
				'dashaSystem'        => __( 'Opens on', 'kaaljyoti' ),
				'yoginiShown'        => __( 'Yogini switch', 'kaaljyoti' ),
				'vargaOpen'          => __( 'Opens on', 'kaaljyoti' ),
				'tabsPanel'          => __( 'Tabs', 'kaaljyoti' ),
				'openTab'            => __( 'Opens on', 'kaaljyoti' ),
				'yearPanel'          => __( 'Year', 'kaaljyoti' ),
				'proxyNote'          => __( 'A month is one heavy call: 20 credits, on every plan. With a secret key stored (Settings → Kaal Jyoti → Connection), this site keeps each month for hours, which saves your credits.', 'kaaljyoti' ),
				'readingNote'        => __( 'The reading costs 5 credits per submit, on every plan. If the month\'s credits run out, visitors see a polite "monthly limit" note in its place.', 'kaaljyoti' ),
			),
		);
	}

	/**
	 * The divisional charts the vargas block can open on.
	 *
	 * @return array<int, array<string, string>> The options, D9 first as the element's own default.
	 */
	private static function varga_options(): array {
		$names   = array(
			'd1'  => 'D1 Rashi',
			'd2'  => 'D2 Hora',
			'd3'  => 'D3 Drekkana',
			'd4'  => 'D4 Chaturthamsha',
			'd7'  => 'D7 Saptamsha',
			'd10' => 'D10 Dashamsha',
			'd12' => 'D12 Dwadashamsha',
			'd16' => 'D16 Shodashamsha',
			'd20' => 'D20 Vimshamsha',
			'd24' => 'D24 Chaturvimshamsha',
			'd27' => 'D27 Bhamsha',
			'd30' => 'D30 Trimshamsha',
			'd40' => 'D40 Khavedamsha',
			'd45' => 'D45 Akshavedamsha',
			'd60' => 'D60 Shashtiamsha',
		);
		$options = array( self::option( '', __( 'D9 Navamsha', 'kaaljyoti' ) ) );
		foreach ( $names as $id => $name ) {
			$options[] = self::option( $id, $name );
		}

		return $options;
	}

	/**
	 * The city dropdown, with the site default at the top.
	 *
	 * @return array<int, array<string, string>> The options.
	 */
	private static function city_options(): array {
		$options = array( self::option( '', __( 'Site default', 'kaaljyoti' ) ) );

		foreach ( Settings::CITIES as $id => $city ) {
			$options[] = self::option( (string) $id, $city['name'] );
		}

		return $options;
	}

	/**
	 * A dropdown from an id-to-name list, with an empty choice at the top.
	 *
	 * @param array<string, string> $names Id to name.
	 * @param string                $none  What the empty choice says.
	 * @return array<int, array<string, string>> The options.
	 */
	private static function choices( array $names, string $none ): array {
		$options = array( self::option( '', $none ) );

		foreach ( $names as $id => $name ) {
			$options[] = self::option( (string) $id, $name );
		}

		return $options;
	}

	/**
	 * One `SelectControl` option.
	 *
	 * @param string $value The stored value.
	 * @param string $label What the editor shows.
	 * @return array<string, string> The option.
	 */
	private static function option( string $value, string $label ): array {
		return array(
			'value' => $value,
			'label' => $label,
		);
	}
}
