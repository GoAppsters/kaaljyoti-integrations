<?php
/**
 * The seven blocks, and the one render path they share with the shortcodes.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Actions;
use Brain\Monkey\Functions;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Blocks;
use KaalJyoti\WP\Elements;
use PHPUnit\Framework\Attributes\CoversClass;

#[CoversClass( Blocks::class )]
final class BlocksTest extends TestCase {

	/**
	 * A configured site.
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
	 * Registration waits for `init`, and the editor gets its own assets.
	 */
	public function test_register_hooks_init_and_the_editor(): void {
		Blocks::register();

		// `has()` answers with the priority, the way `has_action()` does.
		$this->assertNotFalse( Actions\has( 'init', array( Blocks::class, 'register_blocks' ) ) );
		$this->assertNotFalse( Actions\has( 'enqueue_block_editor_assets', array( Blocks::class, 'enqueue_editor' ) ) );
	}

	/**
	 * Each block is registered from its own directory.
	 */
	public function test_every_block_is_registered_from_its_directory(): void {
		$registered = $this->given_registration();

		Blocks::register_blocks();

		$this->assertCount( 22, $registered );
		$this->assertArrayHasKey( KAAL_JYOTI_DIR . 'blocks/match-form', $registered );
		foreach ( Elements::ELEMENTS as $element ) {
			$directory = KAAL_JYOTI_DIR . 'blocks/' . $element;
			$this->assertArrayHasKey( $directory, $registered );
			$this->assertFileExists( $directory . '/block.json' );
			$this->assertFileExists( $directory . '/index.js' );
		}
	}

	/**
	 * Every `block.json` names the block WordPress will look for, in the
	 * category and with the attributes the elements accept.
	 */
	public function test_every_block_json_is_the_one_the_editor_loads(): void {
		foreach ( Elements::ELEMENTS as $element ) {
			$path = KAAL_JYOTI_DIR . 'blocks/' . $element . '/block.json';
			$json = (array) json_decode( (string) file_get_contents( $path ), true, 512, JSON_THROW_ON_ERROR );

			$this->assertSame( 3, $json['apiVersion'] );
			$this->assertSame( Blocks::NAMESPACE_PREFIX . $element, $json['name'] );
			$this->assertSame( 'widgets', $json['category'] );
			$this->assertSame( 'kaaljyoti', $json['textdomain'] );
			$this->assertSame( 'file:./index.js', $json['editorScript'] );

			// The attributes mirror the whitelist, so a block's attributes can
			// be handed to `Elements::render()` as they are.
			foreach ( array_keys( $json['attributes'] ) as $name ) {
				$this->assertSame(
					$json['attributes'][ $name ]['default'],
					'',
					$element . '.' . $name . ' should default to empty'
				);
				$this->assertNotSame(
					'',
					Elements::render( $element, array( $name => 'x' ) ),
					$element . '.' . $name . ' should be an attribute the element knows'
				);
			}
		}
	}

	/**
	 * A block's render callback is the shortcodes' path: the same markup, from
	 * the same whitelist.
	 */
	public function test_the_render_callback_reaches_elements(): void {
		$registered = $this->given_registration();

		Blocks::register_blocks();

		$callback = $registered[ KAAL_JYOTI_DIR . 'blocks/panchang' ]['render_callback'];
		$markup   = $callback( array( 'city' => 'mumbai' ) );

		$this->assertSame( Elements::render( 'panchang', array( 'city' => 'mumbai' ) ), $markup );
		$this->assertStringStartsWith( '<kj-panchang ', $markup );
		$this->assertStringContainsString( 'city="mumbai"', $markup );
	}

	/**
	 * Each callback draws its own element and nothing else.
	 */
	public function test_each_callback_draws_its_own_element(): void {
		$registered = $this->given_registration();

		Blocks::register_blocks();

		foreach ( Elements::ELEMENTS as $element ) {
			$callback = $registered[ KAAL_JYOTI_DIR . 'blocks/' . $element ]['render_callback'];
			$this->assertStringStartsWith( '<kj-' . $element . ' ', $callback( array() ) );
		}
	}

	/**
	 * A callback handed something that is not an attribute array still answers
	 * with markup rather than failing.
	 */
	public function test_the_callback_survives_an_empty_attribute_set(): void {
		$registered = $this->given_registration();

		Blocks::register_blocks();

		$callback = $registered[ KAAL_JYOTI_DIR . 'blocks/chart' ]['render_callback'];

		$this->assertStringStartsWith( '<kj-chart ', $callback( null ) );
	}

	/**
	 * The editor gets the bundle and the data its panels read.
	 */
	public function test_the_editor_gets_the_bundle_and_the_data(): void {
		$enqueued = array();
		Functions\when( 'wp_enqueue_script' )->alias(
			static function ( string $handle ) use ( &$enqueued ): void {
				$enqueued[] = $handle;
			}
		);
		Functions\when( 'wp_script_is' )->justReturn( false );
		Functions\when( 'wp_register_script' )->justReturn( true );

		$localised = array();
		Functions\when( 'wp_localize_script' )->alias(
			static function ( string $handle, string $name, array $data ) use ( &$localised ): bool {
				$localised = array( $handle, $name, $data );

				return true;
			}
		);

		Blocks::enqueue_editor();

		// The surrounding document gets the data handle only; the bundle
		// belongs in the iframed canvas, which `enqueue_canvas()` feeds.
		$this->assertNotContains( Assets::SCRIPT_HANDLE, $enqueued );
		$this->assertContains( Blocks::SCRIPT_HANDLE, $enqueued );
		$this->assertSame( Blocks::SCRIPT_HANDLE, $localised[0] );
		$this->assertSame( 'kaalJyotiBlocks', $localised[1] );
	}

	/**
	 * The bundle reaches the editor's canvas through `enqueue_block_assets`,
	 * and only in the admin: on the front end Elements enqueues it where a
	 * widget renders.
	 */
	public function test_the_canvas_gets_the_bundle_in_the_admin_only(): void {
		$enqueued = array();
		Functions\when( 'wp_enqueue_script' )->alias(
			static function ( string $handle ) use ( &$enqueued ): void {
				$enqueued[] = $handle;
			}
		);
		Functions\when( 'wp_script_is' )->justReturn( true );

		Functions\when( 'is_admin' )->justReturn( false );
		Blocks::enqueue_canvas();
		$this->assertSame( array(), $enqueued );

		Functions\when( 'is_admin' )->justReturn( true );
		Blocks::enqueue_canvas();
		$this->assertContains( Assets::SCRIPT_HANDLE, $enqueued );
	}

	/**
	 * The panels know the eight cities and the site's own defaults.
	 */
	public function test_the_editor_data_carries_the_cities_and_the_defaults(): void {
		$data = Blocks::editor_data();

		// Eight cities plus the "site default" row at the top.
		$this->assertCount( 9, $data['cities'] );
		$this->assertSame( '', $data['cities'][0]['value'] );
		$this->assertSame( 'delhi', $data['cities'][1]['value'] );
		$this->assertSame( 'New Delhi', $data['cities'][1]['label'] );
		$this->assertSame( 'delhi', $data['defaults']['city'] );
		$this->assertSame( 'en', $data['defaults']['lang'] );
		$this->assertArrayHasKey( 'calls', $data['i18n'] );
	}

	/**
	 * Records what `register_block_type()` is told.
	 *
	 * @return \ArrayObject<string, array<string, mixed>> Directory to arguments, filled in as they register.
	 */
	private function given_registration(): \ArrayObject {
		$registered = new \ArrayObject();

		Functions\when( 'register_block_type' )->alias(
			static function ( string $directory, array $args ) use ( $registered ): bool {
				$registered[ $directory ] = $args;

				return true;
			}
		);

		return $registered;
	}

	/**
	 * Every block has a theme attribute, and the panels have its choices.
	 */
	public function test_every_block_has_a_theme(): void {
		foreach ( Elements::ELEMENTS as $element ) {
			$path = KAAL_JYOTI_DIR . 'blocks/' . $element . '/block.json';
			$json = (array) json_decode( (string) file_get_contents( $path ), true, 512, JSON_THROW_ON_ERROR );

			$this->assertSame(
				array(
					'type'    => 'string',
					'default' => '',
				),
				$json['attributes']['theme'],
				$element
			);
			$script = (string) file_get_contents( KAAL_JYOTI_DIR . 'blocks/' . $element . '/index.js' );
			if ( self::is_kit_block( $element ) ) {
				// The kit draws the Display panel, theme included, for every block.
				$this->assertStringContainsString( "kit.register('kaal-jyoti/" . $element . "'", $script );
			} else {
				$this->assertStringContainsString( "set(props, 'theme')", $script, $element . ' should have a theme control' );
			}
		}

		$data = Blocks::editor_data();
		$this->assertSame( array( '', 'auto', 'light', 'dark' ), array_column( $data['themes'], 'value' ) );
		$this->assertSame( 'auto', $data['defaults']['theme'] );
		$this->assertArrayHasKey( 'theme', $data['i18n'] );
	}

	/**
	 * The match block: its name and title, the four attributes the element
	 * takes, a description that says what it costs, and an inspector with a
	 * control for each.
	 */
	public function test_the_match_form_block(): void {
		$directory = KAAL_JYOTI_DIR . 'blocks/match-form';
		$json      = (array) json_decode( (string) file_get_contents( $directory . '/block.json' ), true, 512, JSON_THROW_ON_ERROR );

		$this->assertSame( 'kaal-jyoti/match-form', $json['name'] );
		$this->assertSame( 'Kaal Jyoti Match (Ashtakoot)', $json['title'] );
		$this->assertSame( array( 'city', 'lang', 'powered-by', 'theme', 'time-format', 'remember', 'pdf', 'preset', 'font', 'heading', 'sign-icons' ), array_keys( $json['attributes'] ) );
		$this->assertStringContainsString( 'Two birth forms', $json['description'] );
		$this->assertStringContainsString( 'three calls per submit', $json['description'] );
		$this->assertFileExists( $directory . '/index.asset.php' );

		$script = (string) file_get_contents( $directory . '/index.js' );
		$this->assertStringContainsString( "registerBlockType('kaal-jyoti/match-form'", $script );
		$this->assertStringContainsString( "el('kj-match-form'", $script );
		foreach ( array( 'city', 'lang', 'theme', 'powered-by', 'time-format', 'remember', 'pdf', 'preset', 'font', 'heading', 'sign-icons' ) as $name ) {
			$this->assertStringContainsString( "set(props, '" . $name . "')", $script );
		}

		$this->assertArrayHasKey( 'matchCityHelp', Blocks::editor_data()['i18n'] );
	}
	/**
	 * WordPress's Styles tab writes a `style` object onto every block, so no
	 * block may declare an attribute of that name, and the chart's own style
	 * travels as `chart-style`. A block script that copied `style` to the
	 * element handed React an object as a string (error #62).
	 */
	public function test_no_block_declares_a_style_attribute_and_scripts_copy_only_declared_ones(): void {
		foreach ( Elements::ELEMENTS as $block ) {
			$dir  = dirname( __DIR__ ) . "/kaal-jyoti/blocks/{$block}";
			$json = json_decode( (string) file_get_contents( "{$dir}/block.json" ), true );
			$this->assertArrayNotHasKey( 'style', $json['attributes'], "{$block} declares style" );
			$script = (string) file_get_contents( "{$dir}/index.js" );
			if ( self::is_kit_block( $block ) ) {
				$kit = (string) file_get_contents( dirname( __DIR__ ) . '/kaal-jyoti/assets/blocks-kit.js' );
				$this->assertStringContainsString( 'spec.attributes.forEach', $kit );
			} else {
				$this->assertStringContainsString( 'ELEMENT_ATTRIBUTES.forEach', $script, "{$block} copies every attribute" );
			}
			foreach ( array_keys( $json['attributes'] ) as $name ) {
				$this->assertMatchesRegularExpression( '/[\'"]' . preg_quote( $name, '/' ) . '[\'"]/', $script, "{$block} script lists {$name}" );
			}
		}
		$chart = json_decode( (string) file_get_contents( dirname( __DIR__ ) . '/kaal-jyoti/blocks/chart/block.json' ), true );
		$this->assertArrayHasKey( 'chart-style', $chart['attributes'] );
	}

	/**
	 * The horoscope block: the attributes the element takes, a description
	 * that says what it costs, and a control for each.
	 */
	public function test_the_horoscope_block(): void {
		$directory = KAAL_JYOTI_DIR . 'blocks/horoscope';
		$json      = (array) json_decode( (string) file_get_contents( $directory . '/block.json' ), true, 512, JSON_THROW_ON_ERROR );

		$this->assertSame( 'kaal-jyoti/horoscope', $json['name'] );
		$this->assertSame(
			array( 'sign', 'period', 'date', 'timezone', 'show-basis', 'lang', 'disclaimer', 'disclaimer-name', 'disclaimer-url', 'powered-by', 'theme', 'preset', 'font', 'heading', 'sign-icons' ),
			array_keys( $json['attributes'] )
		);
		$this->assertStringContainsString( 'One call per sign and period', $json['description'] );
		$this->assertFileExists( $directory . '/index.asset.php' );

		$script = (string) file_get_contents( $directory . '/index.js' );
		$this->assertStringContainsString( "registerBlockType('kaal-jyoti/horoscope'", $script );
		$this->assertStringContainsString( "el('kj-horoscope'", $script );
		foreach ( array_keys( $json['attributes'] ) as $name ) {
			$this->assertStringContainsString( "set(props, '" . $name . "')", $script, $name );
		}
	}

	/**
	 * The reading block: a type, the preset for each type, an optional birth,
	 * and the disclaimer controls.
	 */
	public function test_the_reading_block(): void {
		$directory = KAAL_JYOTI_DIR . 'blocks/reading';
		$json      = (array) json_decode( (string) file_get_contents( $directory . '/block.json' ), true, 512, JSON_THROW_ON_ERROR );

		$this->assertSame( 'kaal-jyoti/reading', $json['name'] );
		foreach ( array( 'type', 'sign', 'nakshatra', 'year', 'parts', 'datetime', 'city', 'disclaimer', 'disclaimer-name', 'disclaimer-url' ) as $name ) {
			$this->assertArrayHasKey( $name, $json['attributes'] );
		}
		$this->assertStringContainsString( 'One call per reading', $json['description'] );

		$script = (string) file_get_contents( $directory . '/index.js' );
		$this->assertStringContainsString( "registerBlockType('kaal-jyoti/reading'", $script );
		$this->assertStringContainsString( "el('kj-reading'", $script );
		foreach ( array_keys( $json['attributes'] ) as $name ) {
			$this->assertStringContainsString( "set(props, '" . $name . "')", $script, $name );
		}
	}

	/**
	 * The birth form block can ask for readings, and says what they cost.
	 */
	public function test_the_kundli_form_block_takes_readings(): void {
		$directory = KAAL_JYOTI_DIR . 'blocks/kundli-form';
		$json      = (array) json_decode( (string) file_get_contents( $directory . '/block.json' ), true, 512, JSON_THROW_ON_ERROR );

		$this->assertArrayHasKey( 'readings', $json['attributes'] );
		$this->assertStringContainsString( 'one per reading', $json['description'] );

		$script = (string) file_get_contents( $directory . '/index.js' );
		$this->assertStringContainsString( "set(props, 'readings')", $script );
		$this->assertStringContainsString( "out.readings = ''", $script );

		$data = Blocks::editor_data();
		$this->assertSame(
			array( '', 'both', 'lagna', 'nakshatra', 'lagna,nakshatra,house_lords', 'house_lords', 'vimshottari,varshphal', 'life_areas', 'all' ),
			array_column( $data['readings'], 'value' )
		);

		// Every choice the block stores is one the element is handed as is,
		// but for `both`, which is the element's empty attribute, and `all`,
		// which is every reading by name.
		foreach ( array( 'lagna,nakshatra,house_lords', 'house_lords', 'vimshottari,varshphal', 'life_areas' ) as $stored ) {
			$this->assertStringContainsString( ' readings="' . $stored . '"', Elements::render( 'kundli-form', array( 'readings' => $stored ) ) );
		}

		// A block's `both` is the shortcode's `both`: the element's empty attribute.
		$this->assertStringContainsString( ' readings=""', Elements::render( 'kundli-form', array( 'readings' => 'both' ) ) );
		$this->assertStringContainsString(
			' readings="' . implode( ',', Elements::READING_TYPES ) . '"',
			Elements::render( 'kundli-form', array( 'readings' => 'all' ) )
		);
		$this->assertStringContainsString( "'lagna,nakshatra,house_lords,grahas,yogas,vimshottari,varshphal,life_areas'", $script );
	}

	/**
	 * The panels know the signs, the nakshatras, the periods, the disclaimer
	 * choices, and what the site's disclaimer setting writes.
	 */
	public function test_the_editor_data_carries_the_report_choices(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'disclaimer'      => 'off',
			)
		);

		$data = Blocks::editor_data();

		// Each list has the "let the visitor pick" row at the top.
		$this->assertCount( 13, $data['signs'] );
		$this->assertSame( '', $data['signs'][0]['value'] );
		$this->assertSame( 'aries', $data['signs'][1]['value'] );
		$this->assertCount( 28, $data['nakshatras'] );
		$this->assertSame( 'purva_phalguni', $data['nakshatras'][11]['value'] );
		$this->assertSame( array( '', 'daily', 'weekly', 'monthly', 'yearly' ), array_column( $data['periods'], 'value' ) );
		$this->assertSame( Elements::TYPES, array_column( $data['readingTypes'], 'value' ) );
		$this->assertSame( array( '', 'default', 'off' ), array_column( $data['disclaimers'], 'value' ) );
		$this->assertEquals( (object) array( 'disclaimer' => 'off' ), $data['defaults']['disclaimer'] );
	}

	/**
	 * Whether a block is drawn by the shared kit rather than its own script.
	 *
	 * @param string $element The element.
	 * @return bool True for the revamp's fifteen.
	 */
	private static function is_kit_block( string $element ): bool {
		return array_search( $element, Elements::ELEMENTS, true ) >= 7;
	}
}
