<?php
/**
 * The settings stage 3 added: the server proxy, PDF downloads, the rate
 * limits and the month cache, the birth forms' time format and memory, the
 * font, the owner's links — their sanitising, their fields, what they write
 * on the script tag, and the connection test's lines about them.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Settings;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

#[CoversClass( Settings::class )]
#[CoversClass( Assets::class )]
final class ServerSettingsTest extends TestCase {

	/** A secret key, as a test would store it. */
	private const SECRET = 'kj_test_s3cr3tDoNotLeak_0123456789';

	/**
	 * Nothing stored yet, and the functions the fields and the tag call.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->given_settings( array() );
		Functions\when( 'checked' )->alias( static fn( $a, $b = true, $echo = true ): string => $a === $b ? ' checked="checked"' : '' );
		Functions\when( 'selected' )->alias( static fn( $a, $b = true, $echo = true ): string => (string) $a === (string) $b ? ' selected="selected"' : '' );
		Functions\when( 'rest_url' )->alias( static fn( string $path = '' ): string => 'https://example.test/wp-json/' . ltrim( $path, '/' ) );
		Functions\when( 'wp_create_nonce' )->justReturn( 'n0nce' );
		Functions\when( 'add_query_arg' )->alias( static fn( string $key, string $value, string $url ): string => $url . '?' . $key . '=' . $value );
	}

	/**
	 * A fresh install: the proxy on (it does nothing without a key), PDFs
	 * off, the limits and the cache at their defaults, the forms as the
	 * bundle draws them.
	 */
	public function test_the_defaults(): void {
		$all = Settings::all();

		$this->assertTrue( $all['proxy'] );
		$this->assertTrue( $all['proxy_nonce'] );
		$this->assertFalse( $all['pdf'] );
		$this->assertSame( array( 'basic' ), $all['pdf_editions'] );
		$this->assertSame( 10, $all['rate_month'] );
		$this->assertSame( 3, $all['rate_pdf'] );
		$this->assertSame( 12, $all['month_cache_hours'] );
		$this->assertSame( '12', $all['time_format'] );
		$this->assertTrue( $all['remember'] );
		$this->assertSame( 'system', $all['font_mode'] );
		$this->assertSame( '', $all['pricing_url'] );
	}

	/**
	 * Checkboxes: the hidden `0` is off, `1` on, and a field not posted keeps
	 * what is stored.
	 */
	public function test_sanitize_reads_the_switches(): void {
		$clean = Settings::sanitize(
			array(
				'proxy'       => '0',
				'proxy_nonce' => '1',
				'pdf'         => '1',
				'remember'    => '0',
			)
		);

		$this->assertFalse( $clean['proxy'] );
		$this->assertTrue( $clean['proxy_nonce'] );
		$this->assertTrue( $clean['pdf'] );
		$this->assertFalse( $clean['remember'] );

		$this->given_settings(
			array(
				'pdf'      => true,
				'remember' => false,
			)
		);
		$kept = Settings::sanitize( array() );
		$this->assertTrue( $kept['pdf'] );
		$this->assertFalse( $kept['remember'] );
	}

	/**
	 * The editions ticked, in the API's order; none with PDFs on is the basic
	 * one, with a note; PDFs on without a key is saved with a warning.
	 */
	public function test_sanitize_pdf_editions(): void {
		$clean = Settings::sanitize(
			array(
				'secret_key'   => self::SECRET,
				'pdf'          => '1',
				'pdf_editions' => array( '', 'professional', 'deluxe', 'basic' ),
			)
		);
		$this->assertSame( array( 'basic', 'professional' ), $clean['pdf_editions'] );
		$this->assertSame( array(), $this->settings_error_codes() );

		$clean = Settings::sanitize(
			array(
				'secret_key'   => self::SECRET,
				'pdf'          => '1',
				'pdf_editions' => array( '' ),
			)
		);
		$this->assertSame( array( 'basic' ), $clean['pdf_editions'] );
		$this->assertContains( 'kaal_jyoti_pdf_editions', $this->settings_error_codes() );

		self::$settings_errors = array();
		$clean                 = Settings::sanitize(
			array(
				'pdf'          => '1',
				'pdf_editions' => array( 'professional' ),
			)
		);
		$this->assertTrue( $clean['pdf'] );
		$this->assertContains( 'kaal_jyoti_pdf', $this->settings_error_codes() );
	}

	/**
	 * The limits and the cache are whole numbers within their bounds.
	 *
	 * @param string $key      The setting.
	 * @param mixed  $written  What was posted.
	 * @param int    $expected What is stored.
	 */
	#[DataProvider( 'numbers' )]
	public function test_sanitize_holds_the_numbers_to_their_bounds( string $key, $written, int $expected ): void {
		$this->assertSame( $expected, Settings::sanitize( array( $key => $written ) )[ $key ] );
	}

	/**
	 * Numbers, in and out.
	 *
	 * @return array<string, array{0: string, 1: mixed, 2: int}>
	 */
	public static function numbers(): array {
		return array(
			'months'             => array( 'rate_month', '25', 25 ),
			'months zero'        => array( 'rate_month', '0', 1 ),
			'months huge'        => array( 'rate_month', '100000', 600 ),
			'months text'        => array( 'rate_month', 'lots', 10 ),
			'pdfs'               => array( 'rate_pdf', '5', 5 ),
			'pdfs huge'          => array( 'rate_pdf', '1000', 60 ),
			'pdfs negative'      => array( 'rate_pdf', '-4', 1 ),
			'cache'              => array( 'month_cache_hours', '24', 24 ),
			'cache over a week'  => array( 'month_cache_hours', '1000', 168 ),
			'cache zero'         => array( 'month_cache_hours', '0', 1 ),
			'cache not a number' => array( 'month_cache_hours', array( 1 ), 12 ),
		);
	}

	/**
	 * The enums: the time format and the font mode keep their values only.
	 */
	public function test_sanitize_holds_the_new_enums(): void {
		$clean = Settings::sanitize(
			array(
				'time_format' => '24',
				'font_mode'   => 'inherit',
			)
		);
		$this->assertSame( '24', $clean['time_format'] );
		$this->assertSame( 'inherit', $clean['font_mode'] );

		$this->given_settings( array( 'time_format' => '24' ) );
		$clean = Settings::sanitize(
			array(
				'time_format' => '36',
				'font_mode'   => 'comic',
			)
		);
		$this->assertSame( '24', $clean['time_format'] );
		$this->assertSame( 'system', $clean['font_mode'] );
	}

	/**
	 * The owner's links: http or https, else the stored one with a note.
	 */
	public function test_sanitize_the_links(): void {
		$clean = Settings::sanitize( array( 'pricing_url' => 'https://example.test/pricing' ) );
		$this->assertSame( 'https://example.test/pricing', $clean['pricing_url'] );

		$this->given_settings( array( 'proxy_docs_url' => 'https://example.test/docs' ) );
		$clean = Settings::sanitize( array( 'proxy_docs_url' => 'javascript:alert(1)' ) );
		$this->assertSame( 'https://example.test/docs', $clean['proxy_docs_url'] );
		$this->assertContains( 'kaal_jyoti_proxy_docs_url', $this->settings_error_codes() );

		$this->assertSame( '', Settings::sanitize( array( 'pricing_url' => '' ) )['pricing_url'] );
	}

	/**
	 * A stored value that got in some other way is re-read safely.
	 */
	public function test_the_readers_hold_bad_stored_values(): void {
		$this->given_settings(
			array(
				'pdf_editions' => array( 'deluxe', 'professional' ),
				'time_format'  => '99',
				'font_mode'    => 'x',
				'base_url'     => 'http://insecure.example',
			)
		);

		$this->assertSame( array( 'professional' ), Settings::pdf_editions() );
		$this->assertSame( '12', Settings::time_format() );
		$this->assertSame( 'system', Settings::font_mode() );
		$this->assertSame( Settings::PRODUCTION_BASE_URL, Settings::api_base() );
	}

	/**
	 * A secret key is `kj_live_` or `kj_test_` and a body, nothing else.
	 */
	public function test_is_secret_key(): void {
		$this->assertTrue( Settings::is_secret_key( self::SECRET ) );
		$this->assertTrue( Settings::is_secret_key( 'kj_live_abc' ) );
		$this->assertFalse( Settings::is_secret_key( 'kj_pub_abc' ) );
		$this->assertFalse( Settings::is_secret_key( 'kj_live_' ) );
		$this->assertFalse( Settings::is_secret_key( 'kj_live_a"b' ) );
	}

	/**
	 * The fields: switches with their hidden off, the editions, the numbers.
	 */
	public function test_the_server_fields(): void {
		$this->given_settings(
			array(
				'secret_key'   => self::SECRET,
				'pdf'          => true,
				'pdf_editions' => array( 'professional' ),
			)
		);

		$pdf = $this->field( 'pdf' );
		$this->assertStringContainsString( '<input type="hidden" name="kaal_jyoti_settings[pdf]" value="0" />', $pdf );
		$this->assertStringContainsString( 'name="kaal_jyoti_settings[pdf]" value="1" checked="checked"', $pdf );
		$this->assertStringContainsString( 'value="professional" checked="checked"', $pdf );
		$this->assertStringNotContainsString( 'value="basic" checked', $pdf );

		$this->assertStringContainsString( 'min="1" max="60"', $this->field( 'rate_pdf' ) );
		$this->assertStringContainsString( 'max="168"', $this->field( 'month_cache_hours' ) );
		$this->assertStringContainsString( 'value="24"', $this->field( 'time_format' ) );
		$this->assertStringNotContainsString( self::SECRET, $this->field( 'secret_key' ) );
	}

	/**
	 * The section says what the secret key enables, and where the proxy is.
	 */
	public function test_the_server_section_explains_the_secret_key(): void {
		ob_start();
		Settings::section_server();
		$text = (string) ob_get_clean();

		$this->assertStringContainsString( 'Panchang month', $text );
		$this->assertStringContainsString( 'PDF downloads', $text );
		$this->assertStringContainsString( 'never reaches a browser', $text );
		$this->assertStringContainsString( 'https://example.test/wp-json/kaaljyoti/v1/proxy', $text );
	}

	/**
	 * The script tag: 24-hour time, no memory, the theme's font and a
	 * pricing link when set; nothing for the defaults.
	 */
	public function test_the_script_tag_carries_the_form_settings(): void {
		$tag = Assets::script_attributes( '<script src="v1.js"></script>', Assets::SCRIPT_HANDLE );
		$this->assertStringNotContainsString( 'data-time-format', $tag );
		$this->assertStringNotContainsString( 'data-remember', $tag );
		$this->assertStringNotContainsString( 'data-font', $tag );
		$this->assertStringNotContainsString( 'data-pricing-url', $tag );

		$this->given_settings(
			array(
				'time_format' => '24',
				'remember'    => false,
				'font_mode'   => 'inherit',
				'pricing_url' => 'https://example.test/plans',
			)
		);
		$tag = Assets::script_attributes( '<script src="v1.js"></script>', Assets::SCRIPT_HANDLE );
		$this->assertStringContainsString( ' data-time-format="24" data-remember="off" data-font="inherit" data-pricing-url="https://example.test/plans"', $tag );
	}

	/**
	 * The connection test says what the key's plan means for the proxy and
	 * for PDFs.
	 *
	 * @param string $plan     The key's plan.
	 * @param bool   $pdf      Whether PDFs are on.
	 * @param string $expected A line the answer must hold.
	 */
	#[DataProvider( 'plans' )]
	public function test_the_connection_test_explains_the_plan( string $plan, bool $pdf, string $expected ): void {
		$this->given_settings(
			array(
				'secret_key' => self::SECRET,
				'pdf'        => $pdf,
			)
		);

		$message = $this->run_connection_test( $plan );

		$this->assertStringContainsString( 'The secret key works; plan: ' . $plan . '.', $message );
		$this->assertStringContainsString( $expected, $message );
		$this->assertStringNotContainsString( self::SECRET, $message );
	}

	/**
	 * Plans and what the test says about them.
	 *
	 * @return array<string, array{0: string, 1: bool, 2: string}>
	 */
	public static function plans(): array {
		return array(
			'free'              => array( 'free', false, 'the month widgets load through it, and each month is cached here' ),
			'starter'           => array( 'starter', false, 'the month widgets load through it, and each month is cached here' ),
			'free with pdfs'    => array( 'free', true, 'PDFs are not on the Free plan' ),
			'starter with pdfs' => array( 'starter', true, 'this plan includes PDFs' ),
			'scale with pdfs'   => array( 'scale', true, 'this plan includes PDFs' ),
		);
	}

	/**
	 * One settings field's markup.
	 *
	 * @param string $key The setting.
	 * @return string What it prints.
	 */
	private function field( string $key ): string {
		ob_start();
		Settings::render_field(
			array(
				'key'       => $key,
				'label_for' => 'kaal_jyoti_' . $key,
			)
		);

		return (string) ob_get_clean();
	}

	/**
	 * Runs the connection test with a key on `$plan`.
	 *
	 * @param string $plan The plan `X-KJ-Plan` names.
	 * @return string The message sent back.
	 */
	private function run_connection_test( string $plan ): string {
		Functions\when( 'check_ajax_referer' )->justReturn( 1 );
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'wp_remote_get' )->justReturn( array( 'body' => '{"status":"ok","engine":"0.14.2","ephemeris":"kaaljyoti-ephemeris 0.1.1"}' ) );
		Functions\when( 'wp_remote_post' )->justReturn( array( 'body' => '{"status":"ok","data":{}}' ) );
		Functions\when( 'is_wp_error' )->justReturn( false );
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( 200 );
		Functions\when( 'wp_remote_retrieve_body' )->alias( static fn( array $answer ): string => $answer['body'] );
		Functions\when( 'wp_remote_retrieve_header' )->justReturn( $plan );
		Functions\when( 'wp_send_json_error' )->alias(
			static function ( $data ): void {
				throw new \RuntimeException( 'error: ' . (string) wp_json_encode( $data ) );
			}
		);
		Functions\when( 'wp_send_json_success' )->alias(
			static function ( $data ): void {
				throw new \RuntimeException( (string) $data['message'] );
			}
		);

		try {
			Settings::ajax_test();
		} catch ( \RuntimeException $sent ) {
			return $sent->getMessage();
		}

		return '';
	}
}
