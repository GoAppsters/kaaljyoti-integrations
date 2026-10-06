<?php
/**
 * The seven shortcodes, and the attribute names an editor actually types.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Shortcodes;
use PHPUnit\Framework\Attributes\CoversClass;

#[CoversClass( Shortcodes::class )]
final class ShortcodesTest extends TestCase {

	/**
	 * A configured site.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->given_settings( array( 'publishable_key' => 'kj_pub_demo' ) );
	}

	/**
	 * All twenty-two are registered, and nothing else is.
	 */
	public function test_register_adds_a_shortcode_per_element(): void {
		$added = array();
		Functions\when( 'add_shortcode' )->alias(
			static function ( string $tag ) use ( &$added ): void {
				$added[] = $tag;
			}
		);

		Shortcodes::register();

		$this->assertSame(
			array(
				'kj_panchang',
				'kj_muhurta',
				'kj_chart',
				'kj_kundli_form',
				'kj_match_form',
				'kj_horoscope',
				'kj_reading',
				'kj_panchang_month',
				'kj_calendar',
				'kj_transits',
				'kj_ephemeris',
				'kj_moon_sign',
				'kj_lagna',
				'kj_manglik',
				'kj_sade_sati',
				'kj_dasha',
				'kj_vargas',
				'kj_kp',
				'kj_strength',
				'kj_life_areas',
				'kj_varshphal',
				'kj_vimshottari_reading',
			),
			$added
		);
	}

	/**
	 * Each tag renders its own element.
	 */
	public function test_each_tag_renders_its_element(): void {
		$this->assertStringStartsWith( '<kj-panchang', Shortcodes::render( array(), null, 'kj_panchang' ) );
		$this->assertStringStartsWith( '<kj-muhurta', Shortcodes::render( array(), null, 'kj_muhurta' ) );
		$this->assertStringStartsWith( '<kj-kundli-form', Shortcodes::render( array(), null, 'kj_kundli_form' ) );
		$this->assertStringStartsWith( '<kj-match-form', Shortcodes::render( array(), null, 'kj_match_form' ) );
		$this->assertStringStartsWith(
			'<kj-chart',
			Shortcodes::render( array( 'datetime' => '1990-05-14T10:30:00' ), null, 'kj_chart' )
		);
	}

	/**
	 * A shortcode with no attributes hands WordPress's empty string over, and
	 * a tag that is not ours renders nothing.
	 */
	public function test_an_empty_attribute_list_and_an_unknown_tag(): void {
		$this->assertStringStartsWith( '<kj-panchang', Shortcodes::render( '', null, 'kj_panchang' ) );
		$this->assertSame( '', Shortcodes::render( array(), null, 'kj_rashifal' ) );
		$this->assertSame( '', Shortcodes::render( array(), null, '' ) );
	}

	/**
	 * An underscore in a shortcode is the hyphen the element wants.
	 */
	public function test_underscores_become_hyphens(): void {
		$markup = Shortcodes::render(
			array(
				'datetime'     => '1990-05-14T10:30:00',
				'show_degrees' => 'false',
				'powered_by'   => 'hidden',
			),
			null,
			'kj_chart'
		);

		$this->assertStringContainsString( 'show-degrees="false"', $markup );
		$this->assertStringContainsString( 'powered-by="hidden"', $markup );
		$this->assertStringNotContainsString( 'show_degrees', $markup );
		$this->assertStringNotContainsString( 'powered_by', $markup );
	}

	/**
	 * Including the birth form's chart attributes.
	 */
	public function test_chart_style_is_hyphenated_for_the_form(): void {
		$markup = Shortcodes::render(
			array( 'chart_style' => 'south' ),
			null,
			'kj_kundli_form'
		);

		$this->assertStringContainsString( 'chart-style="south"', $markup );
	}

	/**
	 * The hyphenated spelling keeps working.
	 */
	public function test_hyphens_are_accepted_as_written(): void {
		$markup = Shortcodes::render(
			array( 'chart-style' => 'south', 'powered-by' => 'hidden' ),
			null,
			'kj_kundli_form'
		);

		$this->assertStringContainsString( 'chart-style="south"', $markup );
		$this->assertStringContainsString( 'powered-by="hidden"', $markup );
	}

	/**
	 * An attribute no element has is dropped, and so is a bare word.
	 */
	public function test_unknown_attributes_are_dropped(): void {
		$markup = Shortcodes::render(
			array(
				0       => 'bareword',
				'style' => 'color:red',
				'city'  => 'jaipur',
			),
			null,
			'kj_panchang'
		);

		$this->assertSame( '<kj-panchang city="jaipur" lang="en" powered-by="hidden"></kj-panchang>', $markup );
	}

	/**
	 * `normalize()` lower-cases the names WordPress already lower-cased, and
	 * leaves the values alone for {@see \KaalJyoti\WP\Elements} to judge.
	 */
	public function test_normalize_maps_names_only(): void {
		$this->assertSame(
			array( 'show-degrees' => 'FALSE' ),
			Shortcodes::normalize( array( 'SHOW_DEGREES' => 'FALSE' ) )
		);
	}

	/**
	 * `theme="dark"` reaches the element.
	 */
	public function test_the_theme_attribute_is_passed(): void {
		$this->assertStringContainsString(
			' theme="dark"',
			Shortcodes::render( array( 'theme' => 'dark' ), null, 'kj_chart' )
		);
		$this->assertStringNotContainsString(
			'theme=',
			Shortcodes::render( array( 'theme' => 'purple' ), null, 'kj_kundli_form' )
		);
	}

	/**
	 * `[kj_match_form city="mumbai" lang="hi"]`, and the underscored
	 * spelling of powered-by, reach the match form; anything else is dropped.
	 */
	public function test_the_match_form_shortcode(): void {
		$this->assertSame(
			'<kj-match-form city="mumbai" lang="hi" powered-by="hidden"></kj-match-form>',
			Shortcodes::render( array( 'city' => 'mumbai', 'lang' => 'hi' ), null, 'kj_match_form' )
		);

		$markup = Shortcodes::render(
			array(
				'powered_by'  => 'hidden',
				'chart_style' => 'south',
				'datetime'    => '1990-05-14T10:30:00',
			),
			null,
			'kj_match_form'
		);

		$this->assertSame( '<kj-match-form city="delhi" lang="en" powered-by="hidden"></kj-match-form>', $markup );
	}

	/**
	 * `[kj_horoscope sign="aries" period="daily"]` reaches the horoscope.
	 */
	public function test_the_horoscope_shortcode(): void {
		$this->assertSame(
			'<kj-horoscope sign="aries" period="daily" lang="en" powered-by="hidden"></kj-horoscope>',
			Shortcodes::render( array( 'sign' => 'aries', 'period' => 'daily' ), null, 'kj_horoscope' )
		);
		$this->assertSame(
			'<kj-horoscope lang="en" powered-by="hidden"></kj-horoscope>',
			Shortcodes::render( '', null, 'kj_horoscope' )
		);
	}

	/**
	 * `[kj_reading type="lagna" sign="leo"]` and the nakshatra spelling of it.
	 */
	public function test_the_reading_shortcode(): void {
		$this->assertSame(
			'<kj-reading type="lagna" sign="leo" lang="en" powered-by="hidden"></kj-reading>',
			Shortcodes::render( array( 'type' => 'lagna', 'sign' => 'leo' ), null, 'kj_reading' )
		);
		$this->assertSame(
			'<kj-reading type="nakshatra" nakshatra="rohini" lang="hi" powered-by="hidden"></kj-reading>',
			Shortcodes::render( array( 'type' => 'nakshatra', 'nakshatra' => 'rohini', 'lang' => 'hi' ), null, 'kj_reading' )
		);
	}

	/**
	 * `[kj_reading type="house_lords" datetime="…" city="…"]`: the birth's twelve
	 * house lords, drawn by the browser widget.
	 */
	public function test_the_house_lords_shortcode(): void {
		$this->assertSame(
			'<kj-reading type="house_lords" datetime="1987-03-18T12:06:00" timezone="Asia/Kolkata" lat="28.6139" lon="77.209" lang="en" powered-by="hidden"></kj-reading>',
			Shortcodes::render(
				array(
					'type'     => 'house_lords',
					'datetime' => '1987-03-18T12:06:00',
					'lat'      => '28.6139',
					'lon'      => '77.209',
					'timezone' => 'Asia/Kolkata',
				),
				null,
				'kj_reading'
			)
		);
	}

	/**
	 * `[kj_reading type="varshphal" year="2027" …]` and `[kj_horoscope
	 * show_basis="yes"]`: the new attributes pass through a shortcode.
	 */
	public function test_the_varshphal_and_basis_shortcodes(): void {
		$this->assertSame(
			'<kj-reading type="varshphal" year="2027" datetime="1990-05-14T10:30:00" city="delhi" lang="en" powered-by="hidden"></kj-reading>',
			Shortcodes::render(
				array(
					'type'     => 'varshphal',
					'year'     => '2027',
					'datetime' => '1990-05-14T10:30:00',
				),
				null,
				'kj_reading'
			)
		);
		$this->assertStringContainsString(
			' show-basis="true"',
			Shortcodes::render(
				array(
					'sign'       => 'aries',
					'show_basis' => 'yes',
				),
				null,
				'kj_horoscope'
			)
		);
	}

	/**
	 * The disclaimer overrides are written with underscores, like the rest.
	 */
	public function test_the_disclaimer_overrides_are_hyphenated(): void {
		$markup = Shortcodes::render(
			array(
				'sign'            => 'leo',
				'disclaimer_name' => 'Acharya Amit Verma',
				'disclaimer_url'  => 'https://kaaljyoti.com',
			),
			null,
			'kj_reading'
		);

		$this->assertStringContainsString( 'disclaimer-name="Acharya Amit Verma" disclaimer-url="https://kaaljyoti.com"', $markup );
		$this->assertStringNotContainsString( 'disclaimer_', $markup );
	}

	/**
	 * A bare word is a flag: `[kj_kundli_form readings]` is both readings,
	 * which the element reads as the attribute present and empty.
	 */
	public function test_a_bare_word_is_a_flag(): void {
		$markup = Shortcodes::render( array( 0 => 'readings' ), null, 'kj_kundli_form' );

		$this->assertStringContainsString( ' readings=""', $markup );
		$this->assertStringStartsWith( '<kj-kundli-form ', $markup );
		$this->assertSame( array( 'readings' => 'true' ), Shortcodes::normalize( array( 0 => 'readings' ) ) );
		$this->assertSame( array(), Shortcodes::normalize( array( 0 => '"quoted words"' ) ) );
	}

	/**
	 * `readings="lagna"` asks for one.
	 */
	public function test_the_kundli_form_takes_readings(): void {
		$this->assertStringContainsString(
			' readings="lagna,nakshatra,house_lords"',
			Shortcodes::render( array( 'readings' => 'lagna,nakshatra,house_lords' ), null, 'kj_kundli_form' )
		);
		$this->assertStringContainsString(
			' readings="lagna"',
			Shortcodes::render( array( 'readings' => 'lagna' ), null, 'kj_kundli_form' )
		);
		$this->assertStringNotContainsString(
			'readings',
			Shortcodes::render( array( 'readings' => 'none' ), null, 'kj_kundli_form' )
		);
	}
}
