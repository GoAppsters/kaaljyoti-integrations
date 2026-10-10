<?php
/**
 * The fifteen elements of the widgets revamp, and the attributes every
 * element gained: each shortcode and each block draws its own element, with
 * only the attributes it takes, each held to its rule.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Blocks;
use KaalJyoti\WP\Elements;
use KaalJyoti\WP\Shortcodes;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

#[CoversClass( Elements::class )]
#[CoversClass( Shortcodes::class )]
#[CoversClass( Blocks::class )]
final class RevampElementsTest extends TestCase {

	/** The revamp's fifteen, in catalogue order. */
	private const NEW_ELEMENTS = array(
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
	 * A configured site with a publishable key only.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'default_city'    => 'delhi',
			)
		);
	}

	/**
	 * The catalogue: twenty-two, the fifteen after the seven.
	 */
	public function test_there_are_twenty_two_elements(): void {
		$this->assertCount( 22, Elements::ELEMENTS );
		$this->assertSame( self::NEW_ELEMENTS, array_slice( Elements::ELEMENTS, 7 ) );
		$this->assertSame( array( 'panchang-month', 'ephemeris' ), Elements::PROXY_ONLY );
	}

	/**
	 * Each new shortcode draws its element, with the site's language, the
	 * powered-by line and, for the daily ones and the calculators, the
	 * default city.
	 *
	 * @param string $element The element.
	 */
	#[DataProvider( 'new_elements' )]
	public function test_each_new_shortcode_draws_its_element( string $element ): void {
		$tag    = 'kj_' . str_replace( '-', '_', $element );
		$markup = Shortcodes::render( array(), null, $tag );

		$this->assertStringStartsWith( '<kj-' . $element . ' ', $markup );
		$this->assertStringEndsWith( '></kj-' . $element . '>', $markup );
		$this->assertStringContainsString( ' city="delhi"', $markup );
		$this->assertStringContainsString( ' lang="en"', $markup );
		$this->assertStringContainsString( ' powered-by="hidden"', $markup );
	}

	/**
	 * The fifteen.
	 *
	 * @return array<string, array{0: string}>
	 */
	public static function new_elements(): array {
		$cases = array();
		foreach ( self::NEW_ELEMENTS as $element ) {
			$cases[ $element ] = array( $element );
		}

		return $cases;
	}

	/**
	 * Each new block has a directory, a block.json whose attributes are the
	 * element's whitelist, and a script on the kit.
	 *
	 * @param string $element The element.
	 */
	#[DataProvider( 'new_elements' )]
	public function test_each_new_block_mirrors_its_element( string $element ): void {
		$directory = KAAL_JYOTI_DIR . 'blocks/' . $element;
		$json      = (array) json_decode( (string) file_get_contents( $directory . '/block.json' ), true, 512, JSON_THROW_ON_ERROR );

		$this->assertSame( 'kaal-jyoti/' . $element, $json['name'] );
		$this->assertStringStartsWith( 'Kaal Jyoti ', $json['title'] );
		$this->assertSame( Elements::whitelist( $element ), array_keys( $json['attributes'] ) );
		$this->assertArrayNotHasKey( 'style', $json['attributes'] );

		$script = (string) file_get_contents( $directory . '/index.js' );
		$this->assertStringContainsString( "kit.register('kaal-jyoti/" . $element . "'", $script );
		$this->assertStringContainsString( "tag: 'kj-" . $element . "'", $script );
		foreach ( array_keys( $json['attributes'] ) as $name ) {
			$this->assertMatchesRegularExpression( "/'" . preg_quote( $name, '/' ) . "'/", $script, $element . ' lists ' . $name );
		}

		$asset = (string) file_get_contents( $directory . '/index.asset.php' );
		$this->assertStringContainsString( "'kaal-jyoti-block-kit'", $asset );
	}

	/**
	 * A block's render callback draws what the shortcode draws.
	 */
	public function test_a_new_block_renders_through_elements(): void {
		$registered = array();
		Functions\when( 'register_block_type' )->alias(
			static function ( string $directory, array $args ) use ( &$registered ): bool {
				$registered[ basename( $directory ) ] = $args;

				return true;
			}
		);
		$scripts = array();
		Functions\when( 'wp_register_script' )->alias(
			static function ( string $handle, $src ) use ( &$scripts ): bool {
				$scripts[ $handle ] = $src;

				return true;
			}
		);

		Blocks::register_blocks();

		$this->assertSame( 'https://example.test/wp-content/plugins/kaaljyoti/assets/blocks-kit.js', $scripts[ Blocks::KIT_HANDLE ] );
		$markup = $registered['dasha']['render_callback']( array( 'system' => 'yogini' ) );
		$this->assertSame( Shortcodes::render( array( 'system' => 'yogini' ), null, 'kj_dasha' ), $markup );
		$this->assertStringContainsString( ' system="yogini"', $markup );
	}

	/**
	 * The daily widgets: a month, its reckoning, a zodiac, the chart switch.
	 */
	public function test_the_daily_widgets_attributes(): void {
		$month = Elements::render(
			'panchang-month',
			array(
				'month' => '2026-10',
				'masa'  => 'Amanta',
				'lat'   => '19.076',
				'lon'   => '72.8777',
			)
		);
		$this->assertStringContainsString( ' lat="19.076" lon="72.8777"', $month );
		$this->assertStringNotContainsString( 'city=', $month );
		$this->assertStringContainsString( ' month="2026-10" masa="amanta"', $month );

		$this->assertStringNotContainsString( 'month=', Elements::render( 'panchang-month', array( 'month' => '2026-13' ) ) );
		$this->assertStringNotContainsString( 'masa=', Elements::render( 'panchang-month', array( 'masa' => 'lunar' ) ) );

		$this->assertStringContainsString( ' system="tropical"', Elements::render( 'ephemeris', array( 'system' => 'TROPICAL' ) ) );
		$this->assertStringNotContainsString( 'system=', Elements::render( 'ephemeris', array( 'system' => 'yogini' ) ) );

		$this->assertStringContainsString( ' chart="off"', Elements::render( 'transits', array( 'chart' => 'no' ) ) );
		$this->assertStringNotContainsString( 'chart=', Elements::render( 'transits', array( 'chart' => 'yes' ) ) );
		$this->assertStringContainsString( ' date="2026-10-02"', Elements::render( 'calendar', array( 'date' => '2026-10-02' ) ) );
	}

	/**
	 * The calculators: a birth as attributes, a name, each one's own options.
	 */
	public function test_the_calculators_attributes(): void {
		$birth = array(
			'datetime' => '1990-05-14T10:30:00',
			'city'     => 'varanasi',
			'name'     => '<b>Asha</b>',
		);

		$lagna = Elements::render( 'lagna', array_merge( $birth, array( 'reading' => 'false' ) ) );
		$this->assertStringStartsWith( '<kj-lagna datetime="1990-05-14T10:30:00" city="varanasi" name="Asha" reading="off"', $lagna );

		$this->assertStringContainsString( ' system="yogini" yogini="off"', Elements::render( 'dasha', array( 'system' => 'yogini', 'yogini' => 'off' ) ) );
		$this->assertStringNotContainsString( 'system=', Elements::render( 'dasha', array( 'system' => 'tropical' ) ) );
		$this->assertStringContainsString( ' varga="d10" chart-style="south"', Elements::render( 'vargas', array( 'varga' => 'D10', 'chart-style' => 'south' ) ) );
		$this->assertStringContainsString( ' tab="significators"', Elements::render( 'kp', array( 'tab' => 'significators' ) ) );
		$this->assertStringNotContainsString( 'tab=', Elements::render( 'kp', array( 'tab' => 'ashtakavarga' ) ) );
		$this->assertStringContainsString( ' tab="ashtakavarga"', Elements::render( 'strength', array( 'tab' => 'ashtakavarga' ) ) );
		$this->assertStringContainsString( ' year="2027"', Elements::render( 'varshphal', array( 'year' => '2027' ) ) );
		$this->assertStringNotContainsString( 'year=', Elements::render( 'manglik', array( 'year' => '2027' ) ) );

		// Only the ones that end with a reading take the disclaimer.
		$this->assertStringContainsString( ' disclaimer="off"', Elements::render( 'life-areas', array( 'disclaimer' => 'off' ) ) );
		$this->assertStringNotContainsString( 'disclaimer', Elements::render( 'sade-sati', array( 'disclaimer' => 'off' ) ) );
	}

	/**
	 * The site's disclaimer reaches the calculators that end with a reading.
	 */
	public function test_the_site_disclaimer_reaches_the_reading_calculators(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => 'Acharya Amit',
			)
		);

		foreach ( array( 'moon-sign', 'lagna', 'life-areas', 'varshphal', 'vimshottari-reading' ) as $element ) {
			$this->assertStringContainsString( ' disclaimer-name="Acharya Amit"', Elements::render( $element, array() ), $element );
		}
		$this->assertStringNotContainsString( 'disclaimer', Elements::render( 'kp', array() ) );
	}

	/**
	 * Every element takes a preset, a font and a heading.
	 *
	 * @param string $element The element.
	 */
	#[DataProvider( 'every_element' )]
	public function test_every_element_takes_the_style_attributes( string $element ): void {
		$markup = Elements::render(
			$element,
			array(
				'preset'  => 'Traditional',
				'font'    => 'inherit',
				'heading' => 'Aaj ka <em>panchang</em>',
				'bogus'   => 'x',
			)
		);

		$this->assertStringContainsString( ' preset="traditional" font="inherit" heading="Aaj ka panchang"', $markup );
		$this->assertStringNotContainsString( 'bogus', $markup );

		$off = Elements::render(
			$element,
			array(
				'preset'  => 'neon',
				'font'    => 'Comic Sans',
				'heading' => 'OFF',
			)
		);
		$this->assertStringNotContainsString( 'preset=', $off );
		$this->assertStringNotContainsString( 'font=', $off );
		$this->assertStringContainsString( ' heading="off"', $off );
	}

	/**
	 * All twenty-two.
	 *
	 * @return array<string, array{0: string}>
	 */
	public static function every_element(): array {
		$cases = array();
		foreach ( Elements::ELEMENTS as $element ) {
			$cases[ $element ] = array( $element );
		}

		return $cases;
	}

	/**
	 * The forms and calculators take the time format and remember; the two
	 * forms also take pdf; the kundli form takes tabs.
	 */
	public function test_the_form_attributes(): void {
		$form = Elements::render(
			'kundli-form',
			array(
				'tabs'        => 'Planets, overview, bogus',
				'time-format' => '24h',
				'remember'    => 'no',
				'pdf'         => 'off',
			)
		);
		$this->assertStringContainsString( ' tabs="overview planets"', $form );
		$this->assertStringContainsString( ' time-format="24" remember="off" pdf="off"', $form );

		$this->assertStringNotContainsString( 'tabs=', Elements::render( 'kundli-form', array( 'tabs' => 'bogus' ) ) );
		$this->assertStringNotContainsString( 'remember=', Elements::render( 'match-form', array( 'remember' => 'yes' ) ) );
		$this->assertStringNotContainsString( 'pdf=', Elements::render( 'match-form', array( 'pdf' => 'on' ) ) );
		$this->assertStringContainsString( ' time-format="12"', Elements::render( 'match-form', array( 'time-format' => '12' ) ) );
		$this->assertStringNotContainsString( 'time-format=', Elements::render( 'manglik', array( 'time-format' => '36' ) ) );
		$this->assertStringNotContainsString( 'pdf=', Elements::render( 'lagna', array( 'pdf' => 'off' ) ) );
	}

	/**
	 * A shortcode's underscores work for the new attributes too.
	 */
	public function test_shortcode_spellings(): void {
		$markup = Shortcodes::render(
			array(
				'time_format' => '24',
				'chart_style' => 'north',
				'0'           => 'bogus',
			),
			null,
			'kj_varshphal'
		);

		$this->assertStringContainsString( ' chart-style="north"', $markup );
		$this->assertStringContainsString( ' time-format="24"', $markup );
	}

	/**
	 * Every value is escaped on the way out.
	 */
	public function test_values_are_escaped(): void {
		$markup = Elements::render( 'moon-sign', array( 'name' => 'A "quoted" name' ) );

		$this->assertStringContainsString( ' name="A &quot;quoted&quot; name"', $markup );
	}

	/**
	 * The editor's panels have the new choices.
	 */
	public function test_the_editor_data_has_the_new_choices(): void {
		Functions\when( 'rest_url' )->justReturn( 'https://example.test/wp-json/kaaljyoti/v1/proxy' );
		$data = Blocks::editor_data();

		$this->assertSame( array( '', 'classic', 'modern', 'minimal', 'traditional' ), array_column( $data['presets'], 'value' ) );
		$this->assertSame( array( '', 'system', 'inherit' ), array_column( $data['fonts'], 'value' ) );
		$this->assertSame( array( '', '12', '24' ), array_column( $data['timeFormats'], 'value' ) );
		$this->assertSame( array( '', 'off' ), array_column( $data['onOff'], 'value' ) );
		$this->assertSame( array( '', 'amanta' ), array_column( $data['masas'], 'value' ) );
		$this->assertSame( array( '', 'tropical' ), array_column( $data['ephemerisSystems'], 'value' ) );
		$this->assertSame( array( '', 'yogini' ), array_column( $data['dashaSystems'], 'value' ) );
		$this->assertContains( 'd60', array_column( $data['vargas'], 'value' ) );
		$this->assertSame( array( '', 'planets', 'significators', 'ruling' ), array_column( $data['kpTabs'], 'value' ) );
		$this->assertFalse( $data['defaults']['proxy'] );
		foreach ( array( 'preset', 'font', 'heading', 'timeFormat', 'remember', 'proxyNote', 'readingNote', 'calcBirth' ) as $key ) {
			$this->assertArrayHasKey( $key, $data['i18n'] );
		}

		// Every option list and string a new block, or the kit, names exists.
		$files = array( KAAL_JYOTI_DIR . 'assets/blocks-kit.js' );
		foreach ( self::NEW_ELEMENTS as $element ) {
			$files[] = KAAL_JYOTI_DIR . 'blocks/' . $element . '/index.js';
		}
		foreach ( $files as $file ) {
			$element = basename( dirname( $file ) );
			$script  = (string) file_get_contents( $file );
			preg_match_all( "/options: '(\\w+)'/", $script, $found );
			foreach ( $found[1] as $list ) {
				$this->assertArrayHasKey( $list, $data, $element . ' names ' . $list );
			}
			preg_match_all( "/(?:label|help|title|note): '(\\w+)'/", $script, $keys );
			foreach ( $keys[1] as $key ) {
				$this->assertArrayHasKey( $key, $data['i18n'], $element . ' names the string ' . $key );
			}
		}
	}

	/**
	 * A month widget renders with the publishable key and no secret key (it
	 * calls the API directly); with the proxy on, even with no publishable
	 * key (it asks this site); with neither, only an admin's notice.
	 */
	public function test_a_month_widget_needs_a_publishable_key_or_the_proxy(): void {
		$this->given_settings( array( 'publishable_key' => 'kj_pub_demo' ) );
		$this->assertStringStartsWith( '<kj-panchang-month city="delhi"', Elements::render( 'panchang-month', array() ) );
		$this->assertStringStartsWith( '<kj-ephemeris city="delhi"', Elements::render( 'ephemeris', array() ) );

		$this->given_settings( array( 'secret_key' => 'kj_test_abc123' ) );

		$this->assertStringStartsWith( '<kj-panchang-month ', Elements::render( 'panchang-month', array( 'city' => 'delhi' ) ) );
		$this->assertStringStartsWith( '<kj-ephemeris ', Elements::render( 'ephemeris', array() ) );
		$this->assertSame( '', Elements::render( 'calendar', array() ) );

		$this->given_settings( array( 'secret_key' => '' ) );
		$this->assertSame( '', Elements::render( 'panchang-month', array() ) );
	}

	/**
	 * The month blocks' notice names the price, not a plan or a secret key:
	 * every plan can call a month.
	 */
	public function test_the_month_blocks_notice_names_the_credits(): void {
		Functions\when( 'rest_url' )->justReturn( 'https://example.test/wp-json/kaaljyoti/v1/proxy' );
		$note = Blocks::editor_data()['i18n']['proxyNote'];

		$this->assertStringContainsString( '20 credits', $note );
		$this->assertStringNotContainsString( 'Growth plan', $note );
		$this->assertStringNotContainsString( 'needs a server connection', $note );
		foreach ( array( 'panchang-month', 'ephemeris' ) as $element ) {
			$json = (array) json_decode( (string) file_get_contents( KAAL_JYOTI_DIR . 'blocks/' . $element . '/block.json' ), true );
			$this->assertStringContainsString( '20 credits', $json['description'] );
			$this->assertStringNotContainsString( 'Growth plan', $json['description'] );
			$this->assertStringNotContainsString( 'needs a server connection', $json['description'] );
		}
	}
}
