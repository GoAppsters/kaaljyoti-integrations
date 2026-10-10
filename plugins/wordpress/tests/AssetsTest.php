<?php
/**
 * The bundle's script tag.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Settings;
use PHPUnit\Framework\Attributes\CoversClass;

#[CoversClass( Assets::class )]
final class AssetsTest extends TestCase {

	/** A script tag shaped like the one WordPress builds. */
	private const TAG = '<script src="https://example.test/wp-content/plugins/kaaljyoti/assets/widgets/v1.js?ver=0.1.0" id="kaal-jyoti-widgets-js" defer></script>' . "\n";

	/**
	 * A configured site.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'language'        => 'hi',
				'powered_by'      => 'hidden',
			)
		);
	}

	/**
	 * The bundle reads its configuration from its own tag.
	 */
	public function test_the_data_attributes_are_added(): void {
		$tag = Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE );

		$this->assertStringContainsString( 'data-key="kj_pub_demo"', $tag );
		$this->assertStringContainsString( 'data-lang="hi"', $tag );
		$this->assertStringContainsString( 'data-powered-by="hidden"', $tag );
		$this->assertStringContainsString( 'src="https://example.test', $tag );
		$this->assertStringStartsWith( '<script data-key=', $tag );
	}

	/**
	 * On production the base URL is the bundle's own default, so the tag stays short.
	 */
	public function test_data_base_is_omitted_on_production(): void {
		$this->assertStringNotContainsString(
			'data-base',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * A `base_url` stored by an earlier build (the QA site had one) is not
	 * read: only the `KAAL_JYOTI_API_BASE` constant moves the tag off
	 * production (see ApiBaseTest).
	 */
	public function test_a_stored_base_url_is_ignored(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'base_url'        => 'https://api-staging.kaaljyoti.com',
			)
		);

		$this->assertStringNotContainsString(
			'data-base',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * Without a Google Maps key the tag says nothing about Google.
	 */
	public function test_data_google_maps_key_is_omitted_without_a_key(): void {
		$this->assertStringNotContainsString(
			'data-google-maps-key',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * With one, every form the plugin renders gets it through the tag.
	 */
	public function test_data_google_maps_key_is_added_with_a_key(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'google_maps_key' => 'AIzaSyA-abcdefghijklmnopqrstuvwxyz_0123',
			)
		);

		$this->assertStringContainsString(
			'data-google-maps-key="AIzaSyA-abcdefghijklmnopqrstuvwxyz_0123"',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * A stored value that is not shaped like a key is not printed.
	 */
	public function test_a_bad_stored_google_maps_key_is_not_printed(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'google_maps_key' => 'AIza"><b>x</b>',
			)
		);

		$this->assertStringNotContainsString(
			'data-google-maps-key',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * `auto` and the public Photon are the bundle's own defaults: nothing is
	 * written for them.
	 */
	public function test_place_search_defaults_write_nothing(): void {
		$tag = Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE );

		$this->assertStringNotContainsString( 'data-place-provider', $tag );
		$this->assertStringNotContainsString( 'data-photon-url', $tag );
	}

	/**
	 * A chosen provider and a self-hosted Photon reach every form.
	 */
	public function test_place_provider_and_photon_url_are_added(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'place_provider'  => 'photon',
				'photon_url'      => 'https://geo.example.com/photon',
			)
		);

		$tag = Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE );
		$this->assertStringContainsString( 'data-place-provider="photon"', $tag );
		$this->assertStringContainsString( 'data-photon-url="https://geo.example.com/photon"', $tag );
	}

	/**
	 * Stored values that are not valid any more are not printed.
	 */
	public function test_bad_stored_place_settings_are_not_printed(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'place_provider'  => 'nominatim',
				'photon_url'      => 'http://geo.example.com',
			)
		);

		$tag = Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE );
		$this->assertStringNotContainsString( 'data-place-provider', $tag );
		$this->assertStringNotContainsString( 'data-photon-url', $tag );
	}

	/**
	 * A key with a quote in it cannot break out of the attribute.
	 */
	public function test_the_attributes_are_escaped(): void {
		$this->given_settings( array( 'publishable_key' => 'kj_pub_"><script>x</script>' ) );

		$tag = Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE );

		$this->assertStringContainsString( 'data-key="kj_pub_&quot;&gt;&lt;script&gt;', $tag );
		$this->assertSame( 1, substr_count( $tag, '<script' ) );
	}

	/**
	 * Every other plugin's script tag is left exactly as it was.
	 */
	public function test_another_handle_is_untouched(): void {
		$this->assertSame( self::TAG, Assets::script_attributes( self::TAG, 'jquery-core' ) );
		$this->assertSame( self::TAG, Assets::script_attributes( self::TAG, 'kaal-jyoti-admin' ) );
	}

	/**
	 * The bundle is registered from the plugin's own copy, deferred, in the head.
	 */
	public function test_register_points_at_the_bundled_copy(): void {
		$calls = new \ArrayObject();
		Functions\when( 'wp_register_script' )->alias(
			static function ( ...$args ) use ( $calls ): void {
				$calls['script'] = $args;
			}
		);
		Functions\when( 'wp_register_style' )->alias(
			static function ( ...$args ) use ( $calls ): void {
				$calls['style'] = $args;
			}
		);

		Assets::register();

		$this->assertSame(
			array(
				Assets::SCRIPT_HANDLE,
				KAAL_JYOTI_URL . 'assets/widgets/v1.js',
				array(),
				Assets::asset_version( 'assets/widgets/v1.js' ),
				array(
					'in_footer' => false,
					'strategy'  => 'defer',
				),
			),
			$calls['script']
		);

		$this->assertSame(
			array(
				Assets::STYLE_HANDLE,
				KAAL_JYOTI_URL . 'assets/kaal-jyoti.css',
				array(),
				Assets::asset_version( 'assets/kaal-jyoti.css' ),
			),
			$calls['style']
		);
	}

	/**
	 * A rebuilt bundle gets a new URL: the version carries a hash of the file,
	 * and a missing file falls back to the plugin version alone.
	 */
	public function test_asset_version_follows_the_file(): void {
		$version = Assets::asset_version( 'assets/widgets/v1.js' );
		$this->assertMatchesRegularExpression( '/^' . preg_quote( KAAL_JYOTI_VERSION, '/' ) . '-[0-9a-f]{8}$/', $version );
		$this->assertSame(
			KAAL_JYOTI_VERSION . '-' . substr( (string) md5_file( KAAL_JYOTI_DIR . 'assets/widgets/v1.js' ), 0, 8 ),
			$version
		);
		$this->assertSame( KAAL_JYOTI_VERSION, Assets::asset_version( 'assets/no-such-file.js' ) );
	}

	/**
	 * Enqueueing registers first when the markup path runs before the hook did.
	 */
	public function test_enqueue_registers_when_it_has_to(): void {
		$done = new \ArrayObject();
		Functions\when( 'wp_script_is' )->justReturn( false );
		Functions\when( 'wp_register_script' )->alias(
			static function () use ( $done ): void {
				$done[] = 'register';
			}
		);
		Functions\when( 'wp_enqueue_script' )->alias(
			static function ( string $handle ) use ( $done ): void {
				$done[] = 'enqueue:' . $handle;
			}
		);
		Functions\when( 'wp_enqueue_style' )->alias(
			static function ( string $handle ) use ( $done ): void {
				$done[] = 'enqueue:' . $handle;
			}
		);

		Assets::enqueue_widgets();

		$this->assertSame(
			array( 'register', 'enqueue:' . Assets::SCRIPT_HANDLE, 'enqueue:' . Assets::STYLE_HANDLE ),
			$done->getArrayCopy()
		);
	}

	/**
	 * The production base URL is the one the bundle already defaults to.
	 */
	public function test_the_production_base_url_is_the_api(): void {
		$this->assertSame( 'https://api.kaaljyoti.com', Settings::PRODUCTION_BASE_URL );
	}

	/**
	 * Auto is what the bundle does without being told, so the tag says nothing.
	 */
	public function test_data_theme_is_omitted_when_auto(): void {
		$this->assertStringNotContainsString(
			'data-theme',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * A light or dark site says so on the tag.
	 */
	public function test_data_theme_is_added_when_not_auto(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'theme'           => 'dark',
			)
		);

		$this->assertStringContainsString(
			'data-theme="dark"',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * The loader finds its chunks from the tag, not from its own URL, which an
	 * optimisation plugin may have changed.
	 */
	public function test_data_chunks_points_at_the_widget_directory(): void {
		$tag = Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE );

		$this->assertStringContainsString(
			'data-chunks="https://example.test/wp-content/plugins/kaaljyoti/assets/widgets/"',
			$tag
		);
		$this->assertSame( KAAL_JYOTI_URL . 'assets/widgets/', Assets::chunk_base() );
	}

	/**
	 * Classic is what the bundle draws untold, so the tag says nothing.
	 */
	public function test_data_preset_is_omitted_when_classic(): void {
		$this->assertStringNotContainsString(
			'data-preset',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * Any other preset is on the tag, and every element follows it.
	 */
	public function test_data_preset_is_added_when_chosen(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'preset'          => 'traditional',
			)
		);

		$this->assertStringContainsString(
			'data-preset="traditional"',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * A preset that got into the option row some other way is not written.
	 */
	public function test_an_unknown_stored_preset_reads_as_classic(): void {
		$this->given_settings( array( 'preset' => '"><script>' ) );

		$this->assertSame( 'classic', Settings::preset() );
		$this->assertStringNotContainsString(
			'data-preset',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);
	}

	/**
	 * With nothing overridden there is no rule, and nothing is attached.
	 */
	public function test_no_overrides_means_no_inline_style(): void {
		$attached = new \ArrayObject();
		Functions\when( 'wp_add_inline_style' )->alias(
			static function ( ...$args ) use ( $attached ): void {
				$attached[] = $args;
			}
		);

		$this->assertSame( '', Assets::theme_css() );

		Assets::register();

		$this->assertCount( 0, $attached );
	}

	/**
	 * Only the properties that were set are written, scoped to the
	 * twenty-two elements and the server markup, and attached to the stylesheet once.
	 */
	public function test_the_overrides_are_one_rule_of_set_values(): void {
		$this->given_settings(
			array(
				'color_background' => '#1b1815',
				'color_accent'     => '#e8b04a',
				'font'             => '"Noto Serif", serif',
				'radius'           => 4,
			)
		);

		$attached = new \ArrayObject();
		Functions\when( 'wp_add_inline_style' )->alias(
			static function ( ...$args ) use ( $attached ): void {
				$attached[] = $args;
			}
		);

		$css = Assets::theme_css();

		$this->assertSame(
			'kj-panchang, kj-muhurta, kj-chart, kj-kundli-form, kj-match-form, kj-horoscope, kj-reading, '
			. 'kj-panchang-month, kj-calendar, kj-transits, kj-ephemeris, kj-moon-sign, kj-lagna, kj-manglik, kj-sade-sati, '
			. 'kj-dasha, kj-vargas, kj-kp, kj-strength, kj-life-areas, kj-varshphal, kj-vimshottari-reading, .kj-server { '
			. '--kj-surface: #1b1815; --kj-bg: #1b1815; --kj-lagna: #e8b04a; --kj-accent: #e8b04a; '
			. '--kj-font: "Noto Serif", serif; --kj-radius: 4px; }',
			$css
		);
		$this->assertStringNotContainsString( '--kj-text', $css );
		$this->assertStringNotContainsString( '--kj-line', $css );

		Assets::register();

		$this->assertSame( array( array( Assets::STYLE_HANDLE, $css ) ), $attached->getArrayCopy() );
	}

	/**
	 * A value that got into the option row some other way is checked again on the way out.
	 */
	public function test_the_overrides_are_rechecked_on_output(): void {
		$this->given_settings(
			array(
				'color_text' => 'red; } body { display: none',
				'color_line' => '#ABCDEF',
				'font'       => 'x</style><script>alert(1)</script>',
				'radius'     => '999',
			)
		);

		$css = Assets::theme_css();

		$this->assertStringNotContainsString( '--kj-text', $css );
		$this->assertStringContainsString( '--kj-line: #abcdef', $css );
		$this->assertStringNotContainsString( '<', $css );
		$this->assertStringNotContainsString( '}', substr( $css, 0, -1 ) );
		$this->assertStringContainsString( '--kj-radius: 48px', $css );
	}
}
