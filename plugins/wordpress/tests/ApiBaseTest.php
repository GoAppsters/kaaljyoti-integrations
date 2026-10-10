<?php
/**
 * The API address: production, or the `KAAL_JYOTI_API_BASE` constant from
 * wp-config.php. There is no settings field for it.
 *
 * A constant cannot be undefined once defined, so every test that defines it
 * runs in a process of its own.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Settings;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;

#[CoversClass( Settings::class )]
#[CoversClass( Assets::class )]
final class ApiBaseTest extends TestCase {

	/** The bundle's tag as WordPress builds it. */
	private const TAG = '<script src="https://example.test/wp-content/plugins/kaaljyoti/assets/widgets/kaal-jyoti-widgets.js" id="kaal-jyoti-widgets-js"></script>';

	/** What a row saved by 0.1.0 on the QA site held. */
	private const LEGACY_BASE = 'https://api-staging.kaaljyoti.com';

	/**
	 * The stand-ins the settings page needs, and a row that still carries a
	 * `base_url` from before the field was removed.
	 */
	protected function setUp(): void {
		parent::setUp();

		Functions\when( 'sanitize_key' )->alias(
			static fn( $key ): string => (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) )
		);
		Functions\when( 'wp_unslash' )->returnArg( 1 );
		Functions\when( 'wp_attachment_is_image' )->justReturn( true );

		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'base_url'        => self::LEGACY_BASE,
			)
		);
	}

	/**
	 * Leaves `$_GET` as it was found.
	 */
	protected function tearDown(): void {
		unset( $_GET['tab'] );
		parent::tearDown();
	}

	/**
	 * Without the constant every reader gets production, whatever the row
	 * holds.
	 */
	public function test_the_default_is_production(): void {
		$this->assertFalse( defined( Settings::API_BASE_CONSTANT ) );
		$this->assertNull( Settings::api_base_constant() );
		$this->assertSame( 'https://api.kaaljyoti.com', Settings::api_base() );
		$this->assertSame( Settings::PRODUCTION_BASE_URL, Settings::api_base() );
		$this->assertArrayNotHasKey( 'base_url', Settings::defaults() );
		$this->assertArrayNotHasKey( 'base_url', Settings::all() );
		$this->assertStringNotContainsString( 'data-base', Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE ) );
	}

	/**
	 * The constant, normalised, is what every reader gets.
	 */
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	public function test_the_constant_is_honoured(): void {
		define( 'KAAL_JYOTI_API_BASE', ' https://api-staging.kaaljyoti.com/v1/ ' );

		$this->assertSame( 'https://api-staging.kaaljyoti.com', Settings::api_base() );
		$this->assertStringContainsString(
			'data-base="https://api-staging.kaaljyoti.com"',
			Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE )
		);

		$asked = null;
		$this->connection_check( $asked );
		$this->assertSame( 'https://api-staging.kaaljyoti.com/v1/health', $asked );
	}

	/**
	 * A constant that is not an https URL is ignored: production, no
	 * `data-base`, and the connection test calls production.
	 */
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	public function test_an_invalid_constant_falls_back_to_production(): void {
		define( 'KAAL_JYOTI_API_BASE', 'http://api-staging.kaaljyoti.com' );

		$this->assertSame( Settings::PRODUCTION_BASE_URL, Settings::api_base() );
		$this->assertStringNotContainsString( 'data-base', Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE ) );

		$asked = null;
		$this->connection_check( $asked );
		$this->assertSame( 'https://api.kaaljyoti.com/v1/health', $asked );
	}

	/**
	 * A constant that is not even a string is ignored too.
	 */
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	public function test_a_constant_that_is_not_a_string_falls_back(): void {
		define( 'KAAL_JYOTI_API_BASE', true );

		$this->assertNull( Settings::api_base_constant() );
		$this->assertSame( Settings::PRODUCTION_BASE_URL, Settings::api_base() );
	}

	/**
	 * The settings page has no API address field, section or search entry.
	 */
	public function test_the_field_is_absent_from_the_settings_page(): void {
		$sections = array();
		$fields   = array();
		Functions\when( 'register_setting' )->justReturn( true );
		Functions\when( 'add_settings_section' )->alias(
			static function ( string $id, string $title ) use ( &$sections ): void {
				$sections[ $id ] = $title;
			}
		);
		Functions\when( 'add_settings_field' )->alias(
			static function ( string $id, string $title ) use ( &$fields ): void {
				$fields[ $id ] = $title;
			}
		);

		Settings::register();

		$this->assertArrayNotHasKey( 'kaal_jyoti_base_url', $fields );
		$this->assertArrayNotHasKey( 'kaal_jyoti_api', $sections );
		$this->assertNotContains( 'API base URL', $fields );
		$this->assertNotContains( 'Advanced: API address', $sections );
		$this->assertNotContains( 'base_url', Settings::tab_keys( 'connection' ) );
		$this->assertNull( Settings::tab_of( 'base_url' ) );
		$this->assertNotContains( 'API base URL', array_column( Settings::search_index(), 'label' ) );

		ob_start();
		Settings::render_field( array( 'key' => 'base_url' ) );
		$this->assertSame( '', (string) ob_get_clean() );

		$html = $this->page( 'connection' );
		$this->assertStringNotContainsString( 'base_url', $html );
		$this->assertStringNotContainsString( 'API address', $html );
	}

	/**
	 * Saving — one tab, or the whole row — never writes `base_url`, and a
	 * posted one is dropped.
	 */
	public function test_saving_settings_does_not_write_base_url(): void {
		$posted = array(
			'publishable_key' => 'kj_pub_posted',
			'base_url'        => 'https://elsewhere.example',
		);

		foreach ( array_keys( Settings::tabs() ) as $tab ) {
			$clean = Settings::sanitize( $posted + array( '_tab' => $tab ) );
			$this->assertArrayNotHasKey( 'base_url', $clean, "saving {$tab}" );
		}

		$clean = Settings::sanitize( $posted );
		$this->assertArrayNotHasKey( 'base_url', $clean );
		$this->assertSame( 'kj_pub_posted', $clean['publishable_key'] );
		$this->assertNotContains( 'kaal_jyoti_base_url', $this->settings_error_codes() );
	}

	/**
	 * Without the constant the Connection tab says nothing about the API address.
	 */
	public function test_no_note_without_the_constant(): void {
		$html = $this->page( 'connection' );

		$this->assertStringNotContainsString( 'wp-config.php', $html );
		$this->assertStringNotContainsString( 'KAAL_JYOTI_API_BASE', $html );
	}

	/**
	 * With the constant the Connection tab names the address in use, and
	 * the other tabs do not.
	 */
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	public function test_the_connection_tab_notes_the_constant(): void {
		define( 'KAAL_JYOTI_API_BASE', 'https://api-staging.kaaljyoti.com/' );

		$html = $this->page( 'connection' );
		$this->assertStringContainsString( 'API address set in wp-config.php: <code>https://api-staging.kaaljyoti.com</code>', $html );
		$this->assertStringContainsString( 'notice-info', $html );

		$this->assertStringNotContainsString( 'wp-config.php', $this->page( 'appearance' ) );
	}

	/**
	 * An ignored constant is said to be ignored, on the Connection tab.
	 */
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	public function test_the_connection_tab_says_an_invalid_constant_is_ignored(): void {
		define( 'KAAL_JYOTI_API_BASE', 'api-staging.kaaljyoti.com' );

		$html = $this->page( 'connection' );
		$this->assertStringContainsString( 'KAAL_JYOTI_API_BASE in wp-config.php is not an https address, so it is ignored and the plugin uses https://api.kaaljyoti.com.', $html );
		$this->assertStringContainsString( 'notice-warning', $html );
		$this->assertStringNotContainsString( 'API address set in wp-config.php', $html );
	}

	/**
	 * Draws one tab of the page as an administrator, with markers in place
	 * of the Settings API's output.
	 *
	 * @param string $tab The tab.
	 * @return string The HTML.
	 */
	private function page( string $tab ): string {
		$_GET['tab'] = $tab;
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'submit_button' )->alias(
			static function (): void {
				echo '<p class="submit">[submit]</p>';
			}
		);
		Functions\when( 'settings_fields' )->justReturn( null );
		Functions\when( 'do_settings_sections' )->alias(
			static function ( string $page ): void {
				echo '[sections ' . $page . ']'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- A test marker.
			}
		);

		ob_start();
		Settings::render_page();

		return (string) ob_get_clean();
	}

	/**
	 * Runs "Test connection" with no secret key and records the URL it asked.
	 *
	 * @param string|null $asked Set to the health check's URL.
	 * @return void
	 */
	private function connection_check( ?string &$asked ): void {
		Functions\when( 'check_ajax_referer' )->justReturn( 1 );
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'wp_remote_get' )->alias(
			static function ( string $url ) use ( &$asked ): array {
				$asked = $url;

				return array( 'body' => '{"status":"ok","engine":"0.14.2","ephemeris":"kaaljyoti-ephemeris 0.1.1"}' );
			}
		);
		Functions\when( 'is_wp_error' )->justReturn( false );
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( 200 );
		Functions\when( 'wp_remote_retrieve_body' )->alias( static fn( array $answer ): string => $answer['body'] );
		Functions\when( 'wp_send_json_success' )->alias(
			static function (): void {
				throw new \RuntimeException( 'sent' );
			}
		);
		Functions\when( 'wp_send_json_error' )->alias(
			static function (): void {
				throw new \RuntimeException( 'sent' );
			}
		);

		try {
			Settings::ajax_test();
		} catch ( \RuntimeException $sent ) {
			unset( $sent );
		}
	}
}
