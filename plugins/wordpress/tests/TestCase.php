<?php
/**
 * The base every test extends.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use KaalJyoti\WP\Settings;
use PHPUnit\Framework\TestCase as PhpUnitTestCase;

/**
 * Brain Monkey, plus stand-ins for the WordPress functions the plugin calls.
 *
 * The stand-ins are the real behaviour, not empty shells: `esc_attr()` really
 * escapes and `sanitize_text_field()` really strips tags, because the point of
 * most of these tests is what comes out the other side of them.
 */
abstract class TestCase extends PhpUnitTestCase {

	/**
	 * Everything `add_settings_error()` was told, newest last.
	 *
	 * @var array<int, array{0: string, 1: string, 2: string}>
	 */
	public static array $settings_errors = array();

	/**
	 * Starts Brain Monkey and the stand-ins.
	 */
	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		self::$settings_errors = array();
		$this->stub_wordpress();
	}

	/**
	 * Stops Brain Monkey.
	 */
	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * The WordPress functions every test needs.
	 */
	protected function stub_wordpress(): void {
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'esc_html__' )->returnArg( 1 );
		Functions\when( 'esc_attr__' )->returnArg( 1 );
		Functions\when( 'esc_html' )->returnArg( 1 );
		Functions\when( 'esc_url' )->returnArg( 1 );

		Functions\when( 'esc_attr' )->alias(
			static fn( $value ): string => htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' )
		);

		Functions\when( 'sanitize_text_field' )->alias(
			static fn( $value ): string => trim( strip_tags( (string) $value ) )
		);

		Functions\when( 'wp_parse_url' )->alias(
			static fn( string $url, int $component = -1 ) => parse_url( $url, $component )
		);

		// WordPress's own rule, cut down: a bare host gets `http://`, and a
		// scheme outside the allowed list empties the URL.
		Functions\when( 'esc_url_raw' )->alias(
			static function ( $url, $protocols = null ): string {
				$url = str_replace( ' ', '%20', trim( (string) $url ) );
				if ( '' === $url ) {
					return '';
				}

				if ( ! preg_match( '#^[a-z][a-z0-9+.-]*:#i', $url ) && ! in_array( $url[0], array( '/', '#', '?' ), true ) ) {
					$url = 'http://' . $url;
				}

				$scheme  = strtolower( (string) parse_url( $url, PHP_URL_SCHEME ) );
				$allowed = is_array( $protocols ) ? $protocols : array( 'http', 'https', 'mailto', 'ftp' );

				return in_array( $scheme, $allowed, true ) ? $url : '';
			}
		);

		Functions\when( 'home_url' )->justReturn( 'https://example.test' );
		Functions\when( 'admin_url' )->alias(
			static fn( string $path = '' ): string => 'https://example.test/wp-admin/' . $path
		);
		Functions\when( 'add_query_arg' )->alias(
			static fn( array $args, string $url ): string => $url . '?' . http_build_query( $args )
		);
		Functions\when( 'current_user_can' )->justReturn( false );

		Functions\when( 'add_settings_error' )->alias(
			static function ( string $setting, string $code, string $message = '' ): void {
				TestCase::$settings_errors[] = array( $setting, $code, $message );
			}
		);

		Functions\when( 'wp_json_encode' )->alias(
			static fn( $value ): string => (string) json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		);

		// Nothing is cached unless a test says so, and nothing is kept.
		Functions\when( 'get_transient' )->justReturn( false );
		Functions\when( 'set_transient' )->justReturn( true );
		Functions\when( 'wp_using_ext_object_cache' )->justReturn( false );

		// `wp_kses()`, cut down to what it does to well-formed markup: an
		// element not on the list loses its tags (its text stays), an
		// attribute not on its element's list goes, names come out lower
		// case and a self-closing tag as ` />`.
		Functions\when( 'wp_kses' )->alias(
			static function ( string $html, array $allowed ): string {
				return (string) preg_replace_callback(
					'#<(/?)([a-zA-Z][\w:-]*)([^>]*?)(/?)>#',
					static function ( array $tag ) use ( $allowed ): string {
						$name = strtolower( $tag[2] );
						if ( ! isset( $allowed[ $name ] ) ) {
							return '';
						}
						if ( '/' === $tag[1] ) {
							return '</' . $name . '>';
						}

						preg_match_all( '/([a-zA-Z][\w:-]*)\s*=\s*"([^"]*)"/', $tag[3], $attributes, PREG_SET_ORDER );
						$kept = '';
						foreach ( $attributes as $attribute ) {
							$attribute_name = strtolower( $attribute[1] );
							if ( ! empty( $allowed[ $name ][ $attribute_name ] ) ) {
								$kept .= ' ' . $attribute_name . '="' . $attribute[2] . '"';
							}
						}

						return '<' . $name . $kept . ( '' === $tag[4] ? '' : ' /' ) . '>';
					},
					$html
				);
			}
		);

		Functions\when( 'wp_register_script' )->justReturn( true );
		Functions\when( 'wp_register_style' )->justReturn( true );
		Functions\when( 'wp_enqueue_script' )->justReturn( null );
		Functions\when( 'wp_enqueue_style' )->justReturn( null );
		Functions\when( 'wp_script_is' )->justReturn( true );
		Functions\when( 'wp_style_is' )->justReturn( true );
		Functions\when( 'wp_add_inline_style' )->justReturn( true );

		// WordPress's own rule: `#` and three or six hex digits, else null.
		Functions\when( 'sanitize_hex_color' )->alias(
			static function ( $color ) {
				if ( '' === $color ) {
					return '';
				}

				return preg_match( '|^#([A-Fa-f0-9]{3}){1,2}$|', (string) $color ) ? $color : null;
			}
		);
	}

	/**
	 * Makes `get_option( 'kaal_jyoti_settings' )` answer with these settings.
	 *
	 * @param array<string, mixed> $settings What to store over the defaults.
	 */
	protected function given_settings( array $settings ): void {
		$stored = array_merge( Settings::defaults(), $settings );
		Functions\when( 'get_option' )->justReturn( $stored );
	}

	/**
	 * The codes of every settings error raised so far.
	 *
	 * @return string[] The codes.
	 */
	protected function settings_error_codes(): array {
		return array_column( self::$settings_errors, 1 );
	}
}
