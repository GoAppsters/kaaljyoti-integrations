<?php
/**
 * What an element is allowed to carry into a page.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Elements;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

#[CoversClass( Elements::class )]
final class ElementsTest extends TestCase {

	/**
	 * A configured site, unless a test says otherwise.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->given_settings( array( 'publishable_key' => 'kj_pub_demo' ) );
	}

	/**
	 * The defaults from the settings page are written onto every element.
	 */
	public function test_panchang_carries_the_defaults(): void {
		$this->assertSame(
			'<kj-panchang city="delhi" lang="en" powered-by="hidden"></kj-panchang>',
			Elements::render( 'panchang', array() )
		);
	}

	/**
	 * Including the ones an author did not think to write.
	 */
	public function test_defaults_follow_the_settings(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'default_city'    => 'varanasi',
				'language'        => 'hi',
				'powered_by'      => 'hidden',
			)
		);

		$this->assertSame(
			'<kj-muhurta city="varanasi" lang="hi" powered-by="hidden"></kj-muhurta>',
			Elements::render( 'muhurta', array() )
		);
	}

	/**
	 * An attribute always beats the default.
	 */
	public function test_an_attribute_overrides_the_default(): void {
		$this->assertStringContainsString(
			'city="mumbai" lang="hi"',
			Elements::render( 'panchang', array( 'city' => 'MUMBAI', 'lang' => 'HI' ) )
		);
	}

	/**
	 * Each of the seven has its own tag.
	 */
	public function test_every_element_has_its_tag(): void {
		foreach ( Elements::ELEMENTS as $element ) {
			$this->assertStringStartsWith( '<kj-' . $element . ' ', Elements::render( $element, array() ) );
			$this->assertStringEndsWith( '></kj-' . $element . '>', Elements::render( $element, array() ) );
		}
	}

	/**
	 * Something that is not one of the seven renders nothing at all.
	 */
	public function test_an_unknown_element_renders_nothing(): void {
		$this->assertSame( '', Elements::render( 'rashifal', array( 'city' => 'delhi' ) ) );
	}

	/**
	 * An attribute that is not on the element's list is dropped.
	 */
	public function test_unknown_attributes_are_dropped(): void {
		$markup = Elements::render(
			'panchang',
			array(
				'onclick'  => 'alert(1)',
				'datetime' => '1990-05-14T10:30:00',
				'show'     => 'tithi',
			)
		);

		$this->assertStringNotContainsString( 'onclick', $markup );
		$this->assertStringNotContainsString( 'datetime', $markup );
		$this->assertStringContainsString( 'show="tithi"', $markup );
	}

	/**
	 * A value that would close the attribute, or open a tag, does neither.
	 */
	public function test_values_are_escaped(): void {
		$markup = Elements::render(
			'panchang',
			array( 'place' => 'Delhi" onload="alert(1)' )
		);

		$this->assertStringNotContainsString( 'onload="', $markup );
		$this->assertStringContainsString( '&quot;', $markup );

		$markup = Elements::render( 'panchang', array( 'place' => 'Delhi <script>x</script>' ) );

		$this->assertStringNotContainsString( '<script', $markup );
		$this->assertStringContainsString( 'place="Delhi x"', $markup );
	}

	/**
	 * The chart's size is clamped rather than refused.
	 */
	public function test_the_size_is_clamped(): void {
		$this->assertStringContainsString( 'size="200"', $this->chart( array( 'size' => '10' ) ) );
		$this->assertStringContainsString( 'size="2000"', $this->chart( array( 'size' => '9999' ) ) );
		$this->assertStringContainsString( 'size="420"', $this->chart( array( 'size' => '420' ) ) );
		$this->assertStringNotContainsString( 'size=', $this->chart( array( 'size' => 'large' ) ) );
	}

	/**
	 * A date that is not a date is dropped, not passed on for the API to refuse.
	 */
	public function test_an_invalid_date_is_dropped(): void {
		$this->assertStringContainsString( 'date="2026-02-28"', Elements::render( 'panchang', array( 'date' => '2026-02-28' ) ) );
		$this->assertStringContainsString( 'date="today"', Elements::render( 'panchang', array( 'date' => 'TODAY' ) ) );
		$this->assertStringNotContainsString( 'date=', Elements::render( 'panchang', array( 'date' => '2026-02-30' ) ) );
		$this->assertStringNotContainsString( 'date=', Elements::render( 'panchang', array( 'date' => 'next tuesday' ) ) );
	}

	/**
	 * A birth time is a wall clock, with or without seconds.
	 */
	public function test_the_datetime_is_checked(): void {
		$this->assertStringContainsString( 'datetime="1990-05-14T10:30:00"', $this->chart( array() ) );
		$this->assertStringContainsString( 'datetime="1990-05-14T10:30"', $this->chart( array( 'datetime' => '1990-05-14T10:30' ) ) );
		$this->assertStringNotContainsString( 'datetime=', $this->chart( array( 'datetime' => '1990-05-14 10:30:00' ) ) );
		$this->assertStringNotContainsString( 'datetime=', $this->chart( array( 'datetime' => '1990-05-14T99:30:00' ) ) );
	}

	/**
	 * Coordinates are a pair, in range, and written plainly.
	 */
	public function test_coordinates_are_a_pair(): void {
		$markup = Elements::render(
			'panchang',
			array( 'lat' => '28.6139', 'lon' => '77.2090' )
		);
		$this->assertStringContainsString( 'lat="28.6139" lon="77.209"', $markup );
		$this->assertStringNotContainsString( 'city=', $markup );

		// A lone latitude means nothing, so the default city stands.
		$markup = Elements::render( 'panchang', array( 'lat' => '28.6139' ) );
		$this->assertStringNotContainsString( 'lat=', $markup );
		$this->assertStringContainsString( 'city="delhi"', $markup );

		$markup = Elements::render( 'panchang', array( 'lat' => '128', 'lon' => '77' ) );
		$this->assertStringNotContainsString( 'lat=', $markup );
	}

	/**
	 * `show` keeps the sections this element knows and drops the rest.
	 */
	public function test_show_is_filtered_per_element(): void {
		$this->assertStringContainsString(
			'show="tithi nakshatra"',
			Elements::render( 'panchang', array( 'show' => 'tithi nakshatra chart' ) )
		);

		$this->assertStringContainsString(
			'show="summary chart"',
			Elements::render( 'kundli-form', array( 'show' => 'summary chart tithi' ) )
		);

		$this->assertStringNotContainsString(
			'show=',
			Elements::render( 'kundli-form', array( 'show' => 'tithi' ) )
		);
	}

	/**
	 * The enums, the varga and the flag.
	 */
	public function test_the_chart_enums(): void {
		$markup = $this->chart(
			array(
				'style'        => 'SOUTH',
				'varga'        => 'D9',
				'show-degrees' => 'false',
				'timezone'     => 'Asia/Kolkata',
			)
		);

		$this->assertStringContainsString( 'style="south"', $markup );
		$this->assertStringContainsString( 'varga="d9"', $markup );
		$this->assertStringContainsString( 'show-degrees="false"', $markup );
		$this->assertStringContainsString( 'timezone="Asia/Kolkata"', $markup );

		$markup = $this->chart(
			array(
				'style'        => 'diagonal',
				'varga'        => 'd99',
				'show-degrees' => 'perhaps',
				'timezone'     => 'Asia/Kolkata; rm -rf',
			)
		);

		$this->assertStringNotContainsString( 'style=', $markup );
		$this->assertStringNotContainsString( 'varga=', $markup );
		$this->assertStringNotContainsString( 'show-degrees=', $markup );
		$this->assertStringNotContainsString( 'timezone=', $markup );
	}

	/**
	 * The birth form takes the chart's presentation attributes, hyphenated.
	 */
	public function test_the_kundli_form_takes_chart_style(): void {
		$markup = Elements::render(
			'kundli-form',
			array( 'chart-style' => 'circular', 'size' => '500', 'varga' => 'd10' )
		);

		$this->assertStringContainsString( 'chart-style="circular"', $markup );
		$this->assertStringContainsString( 'size="500"', $markup );
		$this->assertStringContainsString( 'varga="d10"', $markup );
	}

	/**
	 * With no publishable key, someone who can fix it is told, and nobody else
	 * sees anything.
	 */
	public function test_without_a_key_only_an_administrator_sees_a_notice(): void {
		$this->given_settings( array( 'publishable_key' => '' ) );

		Functions\when( 'current_user_can' )->justReturn( false );
		$this->assertSame( '', Elements::render( 'panchang', array() ) );

		Functions\when( 'current_user_can' )->justReturn( true );
		$markup = Elements::render( 'panchang', array() );
		$this->assertStringContainsString( 'add a publishable key', $markup );
		$this->assertStringContainsString( 'href="https://example.test/wp-admin/options-general.php?page=kaal-jyoti&tab=connection"', $markup );
		$this->assertStringNotContainsString( '<kj-panchang', $markup );
	}

	/**
	 * The bundle is enqueued from the markup path, not from every page load.
	 */
	public function test_browser_markup_enqueues_the_bundle(): void {
		$enqueued = $this->record_enqueues();

		Elements::render( 'panchang', array() );

		$this->assertSame(
			array( 'script:' . Assets::SCRIPT_HANDLE, 'style:' . Assets::STYLE_HANDLE ),
			$enqueued->getArrayCopy()
		);
	}

	/**
	 * Nothing is enqueued for a page that only got the notice.
	 */
	public function test_the_notice_enqueues_nothing(): void {
		$this->given_settings( array( 'publishable_key' => '' ) );
		$enqueued = $this->record_enqueues();

		Elements::render( 'panchang', array() );

		$this->assertSame( array(), $enqueued->getArrayCopy() );
	}

	/**
	 * A server render that cannot be made is not an error a visitor sees: the
	 * browser markup is what comes out, because the publishable key means the
	 * page can still ask for itself.
	 */
	public function test_server_mode_falls_back_to_the_browser(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'secret_key'      => '',
				'render_mode'     => 'server',
			)
		);

		$this->assertStringStartsWith( '<kj-panchang', Elements::render( 'panchang', array() ) );
	}

	/**
	 * Watches what the markup path enqueues.
	 *
	 * @return \ArrayObject<int, string> The handles, filled in as they are enqueued.
	 */
	private function record_enqueues(): \ArrayObject {
		$enqueued = new \ArrayObject();

		Functions\when( 'wp_enqueue_script' )->alias(
			static function ( string $handle ) use ( $enqueued ): void {
				$enqueued[] = 'script:' . $handle;
			}
		);
		Functions\when( 'wp_enqueue_style' )->alias(
			static function ( string $handle ) use ( $enqueued ): void {
				$enqueued[] = 'style:' . $handle;
			}
		);

		return $enqueued;
	}

	/**
	 * A chart, with whatever this case is about.
	 *
	 * @param array<string, mixed> $atts The attributes under test.
	 * @return string The markup.
	 */
	private function chart( array $atts ): string {
		return Elements::render(
			'chart',
			array_merge( array( 'datetime' => '1990-05-14T10:30:00' ), $atts )
		);
	}

	/**
	 * On an auto site nothing is written; a theme on the element is kept.
	 */
	public function test_the_theme_attribute(): void {
		$this->assertStringNotContainsString( 'theme=', Elements::render( 'panchang', array() ) );
		$this->assertStringNotContainsString( 'theme=', Elements::render( 'panchang', array( 'theme' => 'auto' ) ) );
		$this->assertStringNotContainsString( 'theme=', Elements::render( 'panchang', array( 'theme' => 'sepia' ) ) );

		foreach ( Elements::ELEMENTS as $element ) {
			$this->assertStringContainsString(
				' theme="dark"',
				Elements::render( $element, array( 'theme' => 'DARK' ) ),
				$element . ' should carry theme'
			);
		}
	}

	/**
	 * The site's theme is the default, and `auto` on one element beats it.
	 */
	public function test_the_theme_defaults_to_the_setting(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'theme'           => 'dark',
			)
		);

		$this->assertSame(
			'<kj-panchang city="delhi" lang="en" powered-by="hidden" theme="dark"></kj-panchang>',
			Elements::render( 'panchang', array() )
		);
		$this->assertStringContainsString( ' theme="light"', Elements::render( 'chart', array( 'theme' => 'light' ) ) );
		$this->assertStringContainsString( ' theme="auto"', Elements::render( 'muhurta', array( 'theme' => 'auto' ) ) );
	}

	/**
	 * The match form carries the site's defaults, like the others.
	 */
	public function test_the_match_form_carries_the_defaults(): void {
		$this->assertSame(
			'<kj-match-form city="delhi" lang="en" powered-by="hidden"></kj-match-form>',
			Elements::render( 'match-form', array() )
		);

		$this->assertSame(
			'<kj-match-form city="mumbai" lang="hi" powered-by="hidden" theme="dark"></kj-match-form>',
			Elements::render(
				'match-form',
				array(
					'city'       => 'MUMBAI',
					'lang'       => 'hi',
					'powered-by' => 'Hidden',
					'theme'      => 'dark',
				)
			)
		);
	}

	/**
	 * It takes a default city, a language, powered-by and a theme, and nothing
	 * else: no coordinates, no birth, no chart options, no sections.
	 */
	public function test_the_match_form_whitelist(): void {
		$markup = Elements::render(
			'match-form',
			array(
				'city'        => 'jaipur',
				'lat'         => '28.6',
				'lon'         => '77.2',
				'timezone'    => 'Asia/Kolkata',
				'datetime'    => '1990-05-14T10:30:00',
				'show'        => 'summary chart',
				'chart-style' => 'south',
				'size'        => '500',
				'varga'       => 'd9',
				'onclick'     => 'alert(1)',
			)
		);

		$this->assertSame( '<kj-match-form city="jaipur" lang="en" powered-by="hidden"></kj-match-form>', $markup );

		// A value outside its enum is dropped and the default stands.
		$this->assertSame(
			'<kj-match-form city="delhi" lang="en" powered-by="hidden"></kj-match-form>',
			Elements::render(
				'match-form',
				array(
					'city'       => 'london',
					'lang'       => 'fr',
					'powered-by' => 'maybe',
					'theme'      => 'sepia',
				)
			)
		);
	}

	/**
	 * The site's theme and powered-by settings reach the match form, and
	 * `auto` on the element beats a site-wide theme.
	 */
	public function test_the_match_form_theme_and_powered_by_defaults(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'default_city'    => 'varanasi',
				'language'        => 'hi',
				'powered_by'      => 'hidden',
				'theme'           => 'light',
			)
		);

		$this->assertSame(
			'<kj-match-form city="varanasi" lang="hi" powered-by="hidden" theme="light"></kj-match-form>',
			Elements::render( 'match-form', array() )
		);
		$this->assertStringContainsString( ' theme="auto"', Elements::render( 'match-form', array( 'theme' => 'auto' ) ) );
	}

	/**
	 * Server mode never renders either form: a cached server render that a
	 * panchang would be answered with is not what a form gets.
	 */
	public function test_the_forms_are_never_server_rendered(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'secret_key'      => 'kj_test_secret',
				'render_mode'     => 'server',
			)
		);
		Functions\when( 'get_transient' )->justReturn( '<div class="kj-server">cached</div>' );

		$this->assertSame( array( 'kundli-form', 'match-form' ), Elements::BROWSER_ONLY );
		$this->assertSame(
			'<kj-match-form city="delhi" lang="en" powered-by="hidden"></kj-match-form>',
			Elements::render( 'match-form', array() )
		);
		$this->assertStringStartsWith( '<kj-kundli-form ', Elements::render( 'kundli-form', array() ) );
	}

	/**
	 * The horoscope takes a sign, a period, a date, a zone, and nothing that
	 * is not one of those: no place, no birth.
	 */
	public function test_the_horoscope_whitelist(): void {
		$this->assertSame(
			'<kj-horoscope sign="aries" period="weekly" date="2026-09-28" timezone="America/New_York" lang="en" powered-by="hidden"></kj-horoscope>',
			Elements::render(
				'horoscope',
				array(
					'sign'     => 'ARIES',
					'period'   => 'Weekly',
					'date'     => '2026-09-28',
					'timezone' => 'America/New_York',
					'city'     => 'delhi',
					'datetime' => '1990-05-14T10:30:00',
				)
			)
		);

		// Outside its enum, a value is dropped and the element's own default stands.
		$this->assertSame(
			'<kj-horoscope date="today" lang="en" powered-by="hidden"></kj-horoscope>',
			Elements::render(
				'horoscope',
				array(
					'sign'     => 'ophiuchus',
					'period'   => 'hourly',
					'date'     => 'today',
					'timezone' => 'not a zone',
				)
			)
		);
	}

	/**
	 * A reading's preset: the sign for a lagna, the nakshatra for a nakshatra,
	 * never both.
	 */
	public function test_the_reading_keeps_the_preset_its_type_uses(): void {
		$this->assertSame(
			'<kj-reading type="lagna" sign="leo" lang="en" powered-by="hidden"></kj-reading>',
			Elements::render(
				'reading',
				array(
					'type'      => 'lagna',
					'sign'      => 'leo',
					'nakshatra' => 'rohini',
				)
			)
		);
		$this->assertSame(
			'<kj-reading type="nakshatra" nakshatra="rohini" lang="en" powered-by="hidden"></kj-reading>',
			Elements::render(
				'reading',
				array(
					'type'      => 'nakshatra',
					'sign'      => 'leo',
					'nakshatra' => 'rohini',
				)
			)
		);

		// With no type, a lone nakshatra plainly means a nakshatra reading;
		// the element's own default type is lagna, so a lone sign needs none.
		$this->assertSame(
			'<kj-reading type="nakshatra" nakshatra="purva_phalguni" lang="en" powered-by="hidden"></kj-reading>',
			Elements::render( 'reading', array( 'nakshatra' => 'Purva Phalguni' ) )
		);
		$this->assertSame(
			'<kj-reading sign="virgo" lang="en" powered-by="hidden"></kj-reading>',
			Elements::render( 'reading', array( 'sign' => 'virgo' ) )
		);
	}

	/**
	 * The house lords take a birth and no preset: a sign or nakshatra written
	 * beside them is dropped, and the type forgives an editor's spelling.
	 */
	public function test_the_house_lords_reading_takes_a_birth_and_no_preset(): void {
		$this->assertSame(
			'<kj-reading type="house_lords" datetime="1990-05-14T10:30:00" city="delhi" lang="en" powered-by="hidden"></kj-reading>',
			Elements::render(
				'reading',
				array(
					'type'      => 'house_lords',
					'sign'      => 'leo',
					'nakshatra' => 'rohini',
					'datetime'  => '1990-05-14T10:30:00',
				)
			)
		);

		foreach ( array( 'House Lords', 'house-lords', 'HOUSE_LORDS' ) as $written ) {
			$this->assertStringContainsString(
				'type="house_lords"',
				Elements::render( 'reading', array( 'type' => $written ) ),
				$written
			);
		}

		$this->assertStringNotContainsString( 'type=', Elements::render( 'reading', array( 'type' => 'bhava' ) ) );
	}

	/**
	 * Every personal reading takes a birth and no preset, and forgives the
	 * spellings an editor types.
	 */
	public function test_the_personal_readings_take_a_birth_and_no_preset(): void {
		foreach ( array( 'grahas', 'yogas', 'vimshottari', 'varshphal', 'life_areas' ) as $type ) {
			$this->assertSame(
				'<kj-reading type="' . $type . '" datetime="1990-05-14T10:30:00" city="delhi" lang="en" powered-by="hidden"></kj-reading>',
				Elements::render(
					'reading',
					array(
						'type'     => $type,
						'sign'     => 'leo',
						'datetime' => '1990-05-14T10:30:00',
					)
				),
				$type
			);
		}

		foreach ( array( 'Life Areas', 'life-areas', 'LIFE_AREAS' ) as $written ) {
			$this->assertStringContainsString( 'type="life_areas"', Elements::render( 'reading', array( 'type' => $written ) ), $written );
		}
	}

	/**
	 * `year` is the varshphal's, within the years the API accepts, and is
	 * dropped from every other reading.
	 */
	public function test_the_varshphal_year(): void {
		$birth = array(
			'type'     => 'varshphal',
			'datetime' => '1990-05-14T10:30:00',
		);

		$this->assertStringContainsString( ' year="2027"', Elements::render( 'reading', $birth + array( 'year' => '2027' ) ) );
		// Any four-digit year goes through: the API's supported range decides.
		$this->assertStringContainsString( ' year="1799"', Elements::render( 'reading', $birth + array( 'year' => '1799' ) ) );
		foreach ( array( '26', 'next', '2026.5', '12026' ) as $refused ) {
			$this->assertStringNotContainsString( 'year=', Elements::render( 'reading', $birth + array( 'year' => $refused ) ), $refused );
		}

		$this->assertStringNotContainsString(
			'year=',
			Elements::render(
				'reading',
				array(
					'type'     => 'vimshottari',
					'datetime' => '1990-05-14T10:30:00',
					'year'     => '2027',
				)
			)
		);
	}

	/**
	 * `type="kundli"`: a birth, `parts` in the API's order (unknown ones
	 * dropped), and `year` kept; `parts` is dropped from every other type.
	 */
	public function test_the_kundli_report(): void {
		$this->assertSame(
			'<kj-reading type="kundli" year="2027" parts="lagna,yogas,varshphal" datetime="1990-05-14T10:30:00" city="delhi" lang="en" powered-by="hidden"></kj-reading>',
			Elements::render(
				'reading',
				array(
					'type'     => 'Kundli',
					'sign'     => 'leo',
					'year'     => '2027',
					'parts'    => 'varshphal, yogas lagna palmistry',
					'datetime' => '1990-05-14T10:30:00',
				)
			)
		);
		$this->assertStringNotContainsString( 'parts=', Elements::render( 'reading', array( 'type' => 'kundli', 'parts' => 'palmistry' ) ) );
		$this->assertStringNotContainsString(
			'parts=',
			Elements::render(
				'reading',
				array(
					'type'  => 'grahas',
					'parts' => 'lagna',
				)
			)
		);
		// The birth form does not draw a kundli report among its readings.
		$this->assertStringNotContainsString( 'readings', Elements::render( 'kundli-form', array( 'readings' => 'kundli' ) ) );
	}

	/**
	 * `show-basis` on a horoscope is a yes or a no, like `show-degrees`.
	 */
	public function test_the_horoscope_basis_switch(): void {
		$this->assertStringContainsString( ' show-basis="true"', Elements::render( 'horoscope', array( 'show-basis' => 'yes' ) ) );
		$this->assertStringContainsString( ' show-basis="false"', Elements::render( 'horoscope', array( 'show-basis' => '0' ) ) );
		$this->assertStringNotContainsString( 'show-basis', Elements::render( 'horoscope', array( 'show-basis' => 'maybe' ) ) );
	}

	/**
	 * The twenty-seven nakshatras, in any spelling an editor types; nothing else.
	 */
	public function test_nakshatra_ids(): void {
		$this->assertCount( 27, Elements::NAKSHATRAS );
		$this->assertCount( 12, Elements::SIGNS );

		foreach ( array( 'purva_phalguni', 'Purva Phalguni', 'purva-phalguni', 'PURVA_PHALGUNI' ) as $written ) {
			$this->assertStringContainsString(
				'nakshatra="purva_phalguni"',
				Elements::render( 'reading', array( 'nakshatra' => $written ) ),
				$written
			);
		}

		$this->assertStringNotContainsString( 'nakshatra=', Elements::render( 'reading', array( 'nakshatra' => 'abhijit' ) ) );
	}

	/**
	 * With no birth, a reading gets no default city: a place alone is half a
	 * birth. With a birth time it does, as the chart does.
	 */
	public function test_a_reading_takes_the_default_city_only_with_a_birth(): void {
		$this->assertStringNotContainsString( 'city=', Elements::render( 'reading', array() ) );
		$this->assertSame(
			'<kj-reading datetime="1990-05-14T10:30:00" city="delhi" lang="en" powered-by="hidden"></kj-reading>',
			Elements::render( 'reading', array( 'datetime' => '1990-05-14T10:30:00' ) )
		);
	}

	/**
	 * `readings` on the birth form: present and empty for the lagna and the
	 * nakshatra, a list of the ones asked for otherwise, gone for none.
	 *
	 * @param string      $written  What the shortcode or block said.
	 * @param string|null $expected What the element carries, or null for no attribute.
	 */
	#[DataProvider( 'readings_values' )]
	public function test_the_readings_attribute( string $written, ?string $expected ): void {
		$markup = Elements::render( 'kundli-form', array( 'readings' => $written ) );

		if ( null === $expected ) {
			$this->assertStringNotContainsString( 'readings', $markup );
		} else {
			$this->assertStringContainsString( ' readings="' . $expected . '"', $markup );
		}
	}

	/**
	 * The readings a birth form can be asked for.
	 *
	 * @return array<string, array{0: string, 1: string|null}>
	 */
	public static function readings_values(): array {
		return array(
			'both'                  => array( 'both', '' ),
			'true'                  => array( 'true', '' ),
			'the two names'         => array( 'lagna nakshatra', '' ),
			'the two names, commas' => array( 'nakshatra,lagna', '' ),
			'lagna'                 => array( 'Lagna', 'lagna' ),
			'nakshatra'             => array( 'nakshatra', 'nakshatra' ),
			'none'                  => array( 'none', null ),
			'false'                 => array( 'false', null ),
			'empty, as a block'     => array( '', null ),
			'nonsense'              => array( 'navamsa', null ),
			'the house lords'       => array( 'house_lords', 'house_lords' ),
			'house lords, hyphen'   => array( 'House-Lords', 'house_lords' ),
			'all three'             => array( 'lagna,nakshatra,house_lords', 'lagna,nakshatra,house_lords' ),
			'all three, any order'  => array( 'house_lords nakshatra lagna', 'lagna,nakshatra,house_lords' ),
			'all'                   => array( 'all', 'lagna,nakshatra,house_lords,grahas,yogas,vimshottari,varshphal,life_areas' ),
			'lagna and house lords' => array( 'lagna, house_lords', 'lagna,house_lords' ),
			'the year and the life' => array( 'life-areas varshphal', 'varshphal,life_areas' ),
			'grahas and yogas'      => array( 'yogas,grahas', 'grahas,yogas' ),
			'a known and an odd'    => array( 'lagna navamsa', null ),
		);
	}

	/**
	 * The site's default line writes nothing: the API's own line is the default.
	 */
	public function test_the_default_disclaimer_writes_nothing(): void {
		foreach ( array( 'horoscope', 'reading' ) as $element ) {
			$this->assertStringNotContainsString( 'disclaimer', Elements::render( $element, array( 'sign' => 'leo' ) ), $element );
		}
	}

	/**
	 * The site's setting reaches every report element, and the birth form
	 * only when it shows readings.
	 */
	public function test_the_site_disclaimer_reaches_every_report(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => 'Acharya Amit Verma',
				'disclaimer_url'  => 'https://kaaljyoti.com/consult',
			)
		);

		$expected = ' disclaimer-name="Acharya Amit Verma" disclaimer-url="https://kaaljyoti.com/consult"';
		$this->assertStringContainsString( $expected, Elements::render( 'horoscope', array( 'sign' => 'aries' ) ) );
		$this->assertStringContainsString( $expected, Elements::render( 'reading', array( 'sign' => 'leo' ) ) );
		$this->assertStringContainsString( $expected, Elements::render( 'kundli-form', array( 'readings' => 'both' ) ) );
		$this->assertStringNotContainsString( 'disclaimer', Elements::render( 'kundli-form', array() ) );
		$this->assertStringNotContainsString( 'disclaimer', Elements::render( 'panchang', array( 'disclaimer' => 'off' ) ) );

		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'disclaimer'      => 'off',
			)
		);

		$this->assertStringContainsString( ' disclaimer="off"', Elements::render( 'horoscope', array( 'sign' => 'aries' ) ) );
		$this->assertStringContainsString( ' disclaimer="off"', Elements::render( 'kundli-form', array( 'readings' => 'lagna' ) ) );
	}

	/**
	 * What a shortcode or block says beats the site's setting.
	 */
	public function test_an_attribute_disclaimer_beats_the_setting(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'disclaimer'      => 'off',
			)
		);

		// `default` is the API's own line: nothing is written.
		$this->assertStringNotContainsString(
			'disclaimer',
			Elements::render(
				'reading',
				array(
					'sign'       => 'leo',
					'disclaimer' => 'default',
				)
			)
		);

		$this->assertSame(
			'<kj-reading sign="leo" lang="en" disclaimer-name="Pandit Sharma" powered-by="hidden"></kj-reading>',
			Elements::render(
				'reading',
				array(
					'sign'            => 'leo',
					'disclaimer-name' => 'Pandit Sharma',
				)
			)
		);

		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => 'Acharya Amit Verma',
			)
		);

		// `off` beats a name, whether the site's or the shortcode's own.
		$this->assertSame(
			'<kj-horoscope sign="aries" lang="en" disclaimer="off" powered-by="hidden"></kj-horoscope>',
			Elements::render(
				'horoscope',
				array(
					'sign'            => 'aries',
					'disclaimer'      => 'OFF',
					'disclaimer-name' => 'Pandit Sharma',
				)
			)
		);
	}

	/**
	 * The name is plain text of at most eighty characters, and the link is
	 * http or https of at most two hundred, or it is left off.
	 */
	public function test_the_disclaimer_name_and_link_are_checked(): void {
		$markup = Elements::render(
			'reading',
			array(
				'sign'            => 'leo',
				'disclaimer-name' => '<b>' . str_repeat( 'अ', 100 ) . '</b>',
				'disclaimer-url'  => 'javascript:alert(1)',
			)
		);

		$this->assertStringContainsString( 'disclaimer-name="' . str_repeat( 'अ', 80 ) . '"', $markup );
		$this->assertStringNotContainsString( 'disclaimer-url', $markup );
		$this->assertStringNotContainsString( '<b>', $markup );

		$this->assertNull( Elements::disclaimer_url( 'https://example.com/' . str_repeat( 'a', 200 ) ) );
		$this->assertNull( Elements::disclaimer_url( 'ftp://example.com' ) );
		$this->assertSame( 'http://example.com', Elements::disclaimer_url( 'example.com' ) );
		$this->assertSame( 'https://example.com/astrologer', Elements::disclaimer_url( ' https://example.com/astrologer ' ) );

		// A link with no name has nothing to hang on.
		$this->assertStringNotContainsString(
			'disclaimer',
			Elements::render(
				'reading',
				array(
					'sign'           => 'leo',
					'disclaimer-url' => 'https://example.com',
				)
			)
		);
	}

	/**
	 * Server mode draws a horoscope with its sign chosen, and hands one
	 * without to the browser, which has the picker.
	 */
	public function test_a_horoscope_without_a_sign_stays_in_the_browser(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'secret_key'      => 'kj_test_secret',
				'render_mode'     => 'server',
			)
		);
		Functions\when( 'get_transient' )->justReturn( '<div class="kj-server kj-server-horoscope">cached</div>' );

		$this->assertSame( '<div class="kj-server kj-server-horoscope">cached</div>', Elements::render( 'horoscope', array( 'sign' => 'aries' ) ) );
		$this->assertSame( '<kj-horoscope lang="en" powered-by="hidden"></kj-horoscope>', Elements::render( 'horoscope', array() ) );
		$this->assertStringStartsWith( '<kj-reading ', Elements::render( 'reading', array( 'datetime' => '1990-05-14T10:30:00' ) ) );
	}
}
