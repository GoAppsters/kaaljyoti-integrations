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
				self::option( '', __( 'Site default', 'kaal-jyoti' ) ),
				self::option( 'en', __( 'English', 'kaal-jyoti' ) ),
				self::option( 'hi', __( 'Hindi', 'kaal-jyoti' ) ),
			),
			'poweredBy'        => array(
				self::option( '', __( 'Site default', 'kaal-jyoti' ) ),
				self::option( 'shown', __( 'Shown', 'kaal-jyoti' ) ),
				self::option( 'hidden', __( 'Hidden (needs a growth plan)', 'kaal-jyoti' ) ),
			),
			'styles'           => array(
				self::option( '', __( 'Default (north)', 'kaal-jyoti' ) ),
				self::option( 'north', __( 'North Indian', 'kaal-jyoti' ) ),
				self::option( 'south', __( 'South Indian', 'kaal-jyoti' ) ),
				self::option( 'circular', __( 'Circular', 'kaal-jyoti' ) ),
			),
			'themes'           => array(
				self::option( '', __( 'Site default', 'kaal-jyoti' ) ),
				self::option( 'auto', __( 'Auto (follow the site\'s colours)', 'kaal-jyoti' ) ),
				self::option( 'light', __( 'Light', 'kaal-jyoti' ) ),
				self::option( 'dark', __( 'Dark', 'kaal-jyoti' ) ),
			),
			'signs'            => self::choices( Elements::SIGNS, __( 'Let the visitor pick', 'kaal-jyoti' ) ),
			'nakshatras'       => self::choices( Elements::NAKSHATRAS, __( 'Let the visitor pick', 'kaal-jyoti' ) ),
			'periods'          => array(
				self::option( '', __( 'Default (daily)', 'kaal-jyoti' ) ),
				self::option( 'daily', __( 'Daily', 'kaal-jyoti' ) ),
				self::option( 'weekly', __( 'Weekly', 'kaal-jyoti' ) ),
				self::option( 'monthly', __( 'Monthly', 'kaal-jyoti' ) ),
				self::option( 'yearly', __( 'Yearly', 'kaal-jyoti' ) ),
			),
			'readingTypes'     => array(
				self::option( 'lagna', __( 'Lagna (the rising sign)', 'kaal-jyoti' ) ),
				self::option( 'nakshatra', __( 'Nakshatra (the Moon\'s)', 'kaal-jyoti' ) ),
				self::option( 'house_lords', __( 'House lords (needs a birth)', 'kaal-jyoti' ) ),
				self::option( 'grahas', __( 'Grahas in signs and houses (needs a birth)', 'kaal-jyoti' ) ),
				self::option( 'yogas', __( 'Yogas (needs a birth)', 'kaal-jyoti' ) ),
				self::option( 'vimshottari', __( 'Vimshottari dashas (needs a birth)', 'kaal-jyoti' ) ),
				self::option( 'varshphal', __( 'Varshphal, the year ahead (needs a birth)', 'kaal-jyoti' ) ),
				self::option( 'life_areas', __( 'Life areas (needs a birth)', 'kaal-jyoti' ) ),
				self::option( 'kundli', __( 'Kundli report: every reading of a birth (5 credits per part)', 'kaal-jyoti' ) ),
			),
			'readings'         => array(
				self::option( '', __( 'None', 'kaal-jyoti' ) ),
				self::option( 'both', __( 'Lagna and nakshatra (two calls per submit)', 'kaal-jyoti' ) ),
				self::option( 'lagna', __( 'Lagna only (one call per submit)', 'kaal-jyoti' ) ),
				self::option( 'nakshatra', __( 'Nakshatra only (one call per submit)', 'kaal-jyoti' ) ),
				self::option( 'lagna,nakshatra,house_lords', __( 'Lagna, nakshatra and house lords (three calls per submit)', 'kaal-jyoti' ) ),
				self::option( 'house_lords', __( 'House lords only (one call per submit)', 'kaal-jyoti' ) ),
				self::option( 'vimshottari,varshphal', __( 'Dashas and the year ahead (two calls per submit)', 'kaal-jyoti' ) ),
				self::option( 'life_areas', __( 'Life areas only (one call per submit)', 'kaal-jyoti' ) ),
				self::option( 'all', __( 'Every reading (eight calls per submit)', 'kaal-jyoti' ) ),
			),
			'presets'          => array(
				self::option( '', __( 'Site default', 'kaal-jyoti' ) ),
				self::option( 'classic', __( 'Classic (cream and maroon)', 'kaal-jyoti' ) ),
				self::option( 'modern', __( 'Modern (teal, a solid header)', 'kaal-jyoti' ) ),
				self::option( 'minimal', __( 'Minimal (ink on white)', 'kaal-jyoti' ) ),
				self::option( 'traditional', __( 'Traditional (saffron and gold)', 'kaal-jyoti' ) ),
			),
			'signIcons'        => array(
				self::option( '', __( 'Site default', 'kaal-jyoti' ) ),
				self::option( 'element', __( 'Element tiles', 'kaal-jyoti' ) ),
				self::option( 'glyph', __( 'Glyph in a ring', 'kaal-jyoti' ) ),
				self::option( 'devanagari', __( 'Hindi name seal', 'kaal-jyoti' ) ),
				self::option( 'custom', __( 'The site\'s own images', 'kaal-jyoti' ) ),
			),
			'fonts'            => array(
				self::option( '', __( 'Site default', 'kaal-jyoti' ) ),
				self::option( 'system', __( 'The widget\'s own type', 'kaal-jyoti' ) ),
				self::option( 'inherit', __( 'The theme\'s font', 'kaal-jyoti' ) ),
			),
			'timeFormats'      => array(
				self::option( '', __( 'Site default', 'kaal-jyoti' ) ),
				self::option( '12', __( '12-hour, with AM and PM', 'kaal-jyoti' ) ),
				self::option( '24', __( '24-hour', 'kaal-jyoti' ) ),
			),
			'onOff'            => array(
				self::option( '', __( 'On', 'kaal-jyoti' ) ),
				self::option( 'off', __( 'Off', 'kaal-jyoti' ) ),
			),
			'masas'            => array(
				self::option( '', __( 'Purnimanta (the month ends at full moon)', 'kaal-jyoti' ) ),
				self::option( 'amanta', __( 'Amanta (the month ends at new moon)', 'kaal-jyoti' ) ),
			),
			'ephemerisSystems' => array(
				self::option( '', __( 'Sidereal (Lahiri)', 'kaal-jyoti' ) ),
				self::option( 'tropical', __( 'Tropical', 'kaal-jyoti' ) ),
			),
			'dashaSystems'     => array(
				self::option( '', __( 'Vimshottari', 'kaal-jyoti' ) ),
				self::option( 'yogini', __( 'Yogini', 'kaal-jyoti' ) ),
			),
			'vargas'           => self::varga_options(),
			'kpTabs'           => array(
				self::option( '', __( 'Cusps', 'kaal-jyoti' ) ),
				self::option( 'planets', __( 'Planets', 'kaal-jyoti' ) ),
				self::option( 'significators', __( 'Significators', 'kaal-jyoti' ) ),
				self::option( 'ruling', __( 'Ruling planets', 'kaal-jyoti' ) ),
			),
			'strengthTabs'     => array(
				self::option( '', __( 'Shadbala', 'kaal-jyoti' ) ),
				self::option( 'ashtakavarga', __( 'Ashtakavarga', 'kaal-jyoti' ) ),
			),
			'disclaimers'      => array(
				self::option( '', __( 'Site setting', 'kaal-jyoti' ) ),
				self::option( 'default', __( 'Default line', 'kaal-jyoti' ) ),
				self::option( 'off', __( 'Off', 'kaal-jyoti' ) ),
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
				'place'              => __( 'Place', 'kaal-jyoti' ),
				'city'               => __( 'City', 'kaal-jyoti' ),
				'cityHelp'           => __( 'One of the bundled cities, or leave it at the site default and set coordinates below.', 'kaal-jyoti' ),
				'latitude'           => __( 'Latitude', 'kaal-jyoti' ),
				'longitude'          => __( 'Longitude', 'kaal-jyoti' ),
				'timezone'           => __( 'Time zone', 'kaal-jyoti' ),
				'timezoneHelp'       => __( 'An IANA name such as Asia/Kolkata. Leave it empty and the API derives it from the point.', 'kaal-jyoti' ),
				'placeLabel'         => __( 'Place label', 'kaal-jyoti' ),
				'date'               => __( 'Date', 'kaal-jyoti' ),
				'dateHelp'           => __( 'YYYY-MM-DD, or empty for today at the place.', 'kaal-jyoti' ),
				'datetime'           => __( 'Birth date and time', 'kaal-jyoti' ),
				'datetimeHelp'       => __( 'The clock on the wall at the birth place: 1990-05-14T10:30:00.', 'kaal-jyoti' ),
				'display'            => __( 'Display', 'kaal-jyoti' ),
				'lang'               => __( 'Language', 'kaal-jyoti' ),
				'poweredBy'          => __( 'Powered by', 'kaal-jyoti' ),
				'sections'           => __( 'Sections', 'kaal-jyoti' ),
				'sectionsHelp'       => __( 'A space-separated list: header tithi nakshatra yoga karana sun windows masa. Empty shows them all.', 'kaal-jyoti' ),
				'formSections'       => __( 'Sections', 'kaal-jyoti' ),
				'formSectionsHelp'   => __( 'A space-separated list: summary chart. Empty shows both.', 'kaal-jyoti' ),
				'matchCityHelp'      => __( 'The city both birth forms start on. A visitor can change it on either form.', 'kaal-jyoti' ),
				'chart'              => __( 'Chart', 'kaal-jyoti' ),
				'style'              => __( 'Style', 'kaal-jyoti' ),
				'size'               => __( 'Size in pixels', 'kaal-jyoti' ),
				'sizeHelp'           => __( '200 to 2000. Empty leaves it to the widget.', 'kaal-jyoti' ),
				'varga'              => __( 'Divisional chart', 'kaal-jyoti' ),
				'vargaHelp'          => __( 'd1 to d60. Empty is the rasi chart.', 'kaal-jyoti' ),
				'showDegrees'        => __( 'Degrees on the chart', 'kaal-jyoti' ),
				'theme'              => __( 'Theme', 'kaal-jyoti' ),
				'themeHelp'          => __( 'Auto follows the site\'s colours; Light and Dark use Kaal Jyoti\'s own palettes.', 'kaal-jyoti' ),
				'yes'                => __( 'Shown', 'kaal-jyoti' ),
				'no'                 => __( 'Hidden', 'kaal-jyoti' ),
				'default'            => __( 'Default', 'kaal-jyoti' ),
				'calls'              => __( 'The preview here calls the Kaal Jyoti API, exactly as the published page will.', 'kaal-jyoti' ),
				'horoscope'          => __( 'Horoscope', 'kaal-jyoti' ),
				'sign'               => __( 'Sign', 'kaal-jyoti' ),
				'signHelp'           => __( 'Preselects the sign. The visitor can always pick another; with none chosen nothing is called until they do.', 'kaal-jyoti' ),
				'period'             => __( 'Period', 'kaal-jyoti' ),
				'horoscopeDateHelp'  => __( 'YYYY-MM-DD, or empty for today. A week runs seven days from it; a month and a year are the calendar ones around it.', 'kaal-jyoti' ),
				'horoscopeZoneHelp'  => __( 'The IANA zone whose midnight starts each day, such as America/New_York. Empty is Asia/Kolkata.', 'kaal-jyoti' ),
				'reading'            => __( 'Reading', 'kaal-jyoti' ),
				'readingType'        => __( 'Reading', 'kaal-jyoti' ),
				'lagnaSign'          => __( 'Lagna', 'kaal-jyoti' ),
				'nakshatra'          => __( 'Nakshatra', 'kaal-jyoti' ),
				'readingPickHelp'    => __( 'Pick one to show that reading, or leave it to the visitor. A birth below computes it instead.', 'kaal-jyoti' ),
				'readingBirth'       => __( 'Birth (optional)', 'kaal-jyoti' ),
				'readingBirthHelp'   => __( 'With a birth date and time the reading is computed from the birth. Always rendered in the browser.', 'kaal-jyoti' ),
				'houseLordsBirth'    => __( 'Birth', 'kaal-jyoti' ),
				'houseLordsHelp'     => __( 'This reading is always a birth\'s: a date and time, and a city or coordinates. Rendered in the browser. Each reading costs 5 credits.', 'kaal-jyoti' ),
				'year'               => __( 'Year', 'kaal-jyoti' ),
				'yearHelp'           => __( 'The varshphal runs from the birthday in this year to the next. Empty is the one running now.', 'kaal-jyoti' ),
				'parts'              => __( 'Parts', 'kaal-jyoti' ),
				'partsHelp'          => __( 'Which readings, comma-separated: lagna, nakshatra, life_areas, house_lords, grahas, yogas, vimshottari, varshphal. Empty is all eight; each costs 5 credits.', 'kaal-jyoti' ),
				'showBasis'          => __( 'Transits behind the horoscope', 'kaal-jyoti' ),
				'showBasisHelp'      => __( 'The horoscope shows its summaries. Shown also lists the transits it was read from.', 'kaal-jyoti' ),
				'readings'           => __( 'Readings after the chart', 'kaal-jyoti' ),
				'readingsHelp'       => __( 'Each reading is one more call per submit, at 5 credits each.', 'kaal-jyoti' ),
				'disclaimer'         => __( 'Disclaimer', 'kaal-jyoti' ),
				'disclaimerHelp'     => __( 'The line under the reading. Site setting follows Settings → Kaal Jyoti → Reports and PDFs.', 'kaal-jyoti' ),
				'disclaimerName'     => __( 'Astrologer\'s name', 'kaal-jyoti' ),
				'disclaimerNameHelp' => __( 'Names your astrologer in the line instead of the site setting. Up to 80 characters.', 'kaal-jyoti' ),
				'disclaimerUrl'      => __( 'Astrologer\'s link', 'kaal-jyoti' ),
				'stylePanel'         => __( 'Style', 'kaal-jyoti' ),
				'preset'             => __( 'Preset', 'kaal-jyoti' ),
				'presetHelp'         => __( 'The look, after the Kaal Jyoti PDF reports. Site default follows Settings → Kaal Jyoti → Appearance.', 'kaal-jyoti' ),
				'font'               => __( 'Font', 'kaal-jyoti' ),
				'signIcons'          => __( 'Sign icons', 'kaal-jyoti' ),
				'signIconsHelp'      => __( 'How the zodiac signs are drawn. Site default follows Settings → Kaal Jyoti → Appearance, where your own images are chosen.', 'kaal-jyoti' ),
				'heading'            => __( 'Heading', 'kaal-jyoti' ),
				'headingHelp'        => __( 'Replaces the card\'s title. Write off for no header at all.', 'kaal-jyoti' ),
				'timeFormat'         => __( 'Birth time', 'kaal-jyoti' ),
				'remember'           => __( 'Remember the last entry', 'kaal-jyoti' ),
				'rememberHelp'       => __( 'In the visitor\'s own browser only. Off forgets what was stored.', 'kaal-jyoti' ),
				'pdf'                => __( 'Download PDF', 'kaal-jyoti' ),
				'pdfHelp'            => __( 'Shown when PDF downloads are on in Settings → Kaal Jyoti → Reports and PDFs (a secret key, a paid plan). Off hides the button on this block.', 'kaal-jyoti' ),
				'tabs'               => __( 'Tabs', 'kaal-jyoti' ),
				'tabsHelp'           => __( 'A list of: overview charts planets dasha life readings. Empty shows them all.', 'kaal-jyoti' ),
				'calcBirth'          => __( 'Birth (optional)', 'kaal-jyoti' ),
				'calcBirthHelp'      => __( 'Leave empty for the birth form. A date and time here (1990-05-14T10:30:00), with a city or coordinates, shows that birth instead, with no form.', 'kaal-jyoti' ),
				'calcCityHelp'       => __( 'With a birth time, the birth place; without one, the place the form starts on.', 'kaal-jyoti' ),
				'personName'         => __( 'Name', 'kaal-jyoti' ),
				'dateTitle'          => __( 'Date', 'kaal-jyoti' ),
				'month'              => __( 'Month', 'kaal-jyoti' ),
				'monthHelp'          => __( 'YYYY-MM, or empty for this month at the place.', 'kaal-jyoti' ),
				'masa'               => __( 'Month reckoning', 'kaal-jyoti' ),
				'zodiac'             => __( 'Zodiac', 'kaal-jyoti' ),
				'chartShown'         => __( 'Chart', 'kaal-jyoti' ),
				'readingPanel'       => __( 'Reading', 'kaal-jyoti' ),
				'readingShown'       => __( 'Reading under the result', 'kaal-jyoti' ),
				'dashaPanel'         => __( 'Dashas', 'kaal-jyoti' ),
				'dashaSystem'        => __( 'Opens on', 'kaal-jyoti' ),
				'yoginiShown'        => __( 'Yogini switch', 'kaal-jyoti' ),
				'vargaOpen'          => __( 'Opens on', 'kaal-jyoti' ),
				'tabsPanel'          => __( 'Tabs', 'kaal-jyoti' ),
				'openTab'            => __( 'Opens on', 'kaal-jyoti' ),
				'yearPanel'          => __( 'Year', 'kaal-jyoti' ),
				'proxyNote'          => __( 'A month is one heavy call: 20 credits, on every plan. With a secret key stored (Settings → Kaal Jyoti → Connection), this site keeps each month for hours, which saves your credits.', 'kaal-jyoti' ),
				'readingNote'        => __( 'The reading costs 5 credits per submit, on every plan. If the month\'s credits run out, visitors see a polite "monthly limit" note in its place.', 'kaal-jyoti' ),
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
		$options = array( self::option( '', __( 'D9 Navamsha', 'kaal-jyoti' ) ) );
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
		$options = array( self::option( '', __( 'Site default', 'kaal-jyoti' ) ) );

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
