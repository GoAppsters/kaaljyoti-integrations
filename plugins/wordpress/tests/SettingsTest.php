<?php
/**
 * What may be stored under `kaal_jyoti_settings`.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Settings;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

#[CoversClass( Settings::class )]
final class SettingsTest extends TestCase {

	/**
	 * An empty option row still answers every key.
	 */
	public function test_all_falls_back_to_the_defaults(): void {
		Functions\when( 'get_option' )->justReturn( false );

		$this->assertSame( Settings::defaults(), Settings::all() );
		$this->assertNull( Settings::get( 'base_url' ) );
		$this->assertNull( Settings::get( 'nonsense' ) );
	}

	/**
	 * A row written by an older version keeps its values and gains the new ones.
	 */
	public function test_all_drops_keys_the_schema_does_not_have(): void {
		Functions\when( 'get_option' )->justReturn(
			array(
				'language' => 'hi',
				'stowaway' => 'x',
			)
		);

		$all = Settings::all();
		$this->assertSame( 'hi', $all['language'] );
		$this->assertArrayNotHasKey( 'stowaway', $all );
		$this->assertSame( 15, $all['cache_minutes'] );
	}

	/**
	 * A publishable key with the right prefix is stored as it was typed.
	 */
	public function test_sanitize_accepts_a_publishable_key(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize( array( 'publishable_key' => '  kj_pub_abcdef123456  ' ) );

		$this->assertSame( 'kj_pub_abcdef123456', $clean['publishable_key'] );
		$this->assertSame( array(), $this->settings_error_codes() );
	}

	/**
	 * A secret key pasted into the publishable field is refused outright: it is
	 * the one mistake that would publish a key to every visitor.
	 */
	public function test_sanitize_refuses_a_secret_key_in_the_publishable_field(): void {
		$this->given_settings( array( 'publishable_key' => 'kj_pub_kept' ) );

		$clean = Settings::sanitize( array( 'publishable_key' => 'kj_live_secret_value' ) );

		$this->assertSame( 'kj_pub_kept', $clean['publishable_key'] );
		$this->assertStringNotContainsString( 'kj_live_secret_value', wp_json_encode( $clean ) );
		$this->assertContains( 'kaal_jyoti_publishable_key', $this->settings_error_codes() );
	}

	/**
	 * A test-mode secret key is refused there too.
	 */
	public function test_sanitize_refuses_a_test_secret_key_in_the_publishable_field(): void {
		$this->given_settings( array( 'publishable_key' => 'kj_pub_kept' ) );

		$clean = Settings::sanitize( array( 'publishable_key' => 'kj_test_secret_value' ) );

		$this->assertSame( 'kj_pub_kept', $clean['publishable_key'] );
		$this->assertContains( 'kaal_jyoti_publishable_key', $this->settings_error_codes() );
	}

	/**
	 * Anything else in that field keeps the stored key and says why.
	 */
	public function test_sanitize_refuses_a_publishable_key_without_the_prefix(): void {
		$this->given_settings( array( 'publishable_key' => 'kj_pub_kept' ) );

		$clean = Settings::sanitize( array( 'publishable_key' => 'sk_something_else' ) );

		$this->assertSame( 'kj_pub_kept', $clean['publishable_key'] );
		$this->assertContains( 'kaal_jyoti_publishable_key', $this->settings_error_codes() );
	}

	/**
	 * Clearing the field clears the key.
	 */
	public function test_sanitize_accepts_an_empty_publishable_key(): void {
		$this->given_settings( array( 'publishable_key' => 'kj_pub_kept' ) );

		$clean = Settings::sanitize( array( 'publishable_key' => '' ) );

		$this->assertSame( '', $clean['publishable_key'] );
		$this->assertSame( array(), $this->settings_error_codes() );
	}

	/**
	 * The Google Maps key is optional and stored as typed.
	 */
	public function test_sanitize_accepts_a_google_maps_key(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize( array( 'google_maps_key' => '  AIzaSyA-abcdefghijklmnopqrstuvwxyz_0123  ' ) );

		$this->assertSame( 'AIzaSyA-abcdefghijklmnopqrstuvwxyz_0123', $clean['google_maps_key'] );
		$this->assertSame( array(), $this->settings_error_codes() );
	}

	/**
	 * Clearing the field clears the key, and a fresh install has none.
	 */
	public function test_sanitize_accepts_an_empty_google_maps_key(): void {
		$this->given_settings( array( 'google_maps_key' => 'AIzaSyA-abcdefghijklmnopqrstuvwxyz_0123' ) );

		$this->assertSame( '', Settings::sanitize( array( 'google_maps_key' => '' ) )['google_maps_key'] );
		$this->assertSame( '', Settings::sanitize( array() )['google_maps_key'] );
		$this->assertSame( '', Settings::defaults()['google_maps_key'] );
		$this->assertSame( array(), $this->settings_error_codes() );
	}

	/**
	 * Anything that is not shaped like a Google key keeps the stored one, and a
	 * Kaal Jyoti key — above all a secret one — is never stored there.
	 *
	 * @param string $written What was typed.
	 */
	#[DataProvider( 'not_google_keys' )]
	public function test_sanitize_refuses_what_is_not_a_google_maps_key( string $written ): void {
		$this->given_settings( array( 'google_maps_key' => 'AIzaSyKept-abcdefghijklmnopqrstuvwxyz' ) );

		$clean = Settings::sanitize( array( 'google_maps_key' => $written ) );

		$this->assertSame( 'AIzaSyKept-abcdefghijklmnopqrstuvwxyz', $clean['google_maps_key'] );
		$this->assertContains( 'kaal_jyoti_google_maps_key', $this->settings_error_codes() );
	}

	/**
	 * Values the Google key field must refuse.
	 *
	 * @return array<string, array{string}>
	 */
	public static function not_google_keys(): array {
		return array(
			'a secret key'      => array( 'kj_live_abcdefghijklmnopqrstuvwxyz' ),
			'a publishable key' => array( 'kj_pub_abcdefghijklmnopqrstuvwxyz' ),
			'too short'         => array( 'AIza123' ),
			'markup'            => array( 'AIza"><script>alert(1)</script>' ),
			'spaces'            => array( 'AIza abcdefghijklmnopqrstuvwxyz' ),
		);
	}

	/**
	 * The settings page draws the key and says where searches go.
	 */
	public function test_the_google_maps_key_field(): void {
		$this->given_settings( array( 'google_maps_key' => 'AIzaSyA-abcdefghijklmnopqrstuvwxyz_0123' ) );

		ob_start();
		Settings::render_field( array( 'key' => 'google_maps_key' ) );
		$html = (string) ob_get_clean();

		$this->assertStringContainsString( 'name="kaal_jyoti_settings[google_maps_key]" value="AIzaSyA-abcdefghijklmnopqrstuvwxyz_0123"', $html );
		$this->assertStringContainsString( 'instead of Photon', $html );
		$this->assertStringContainsString( 'sent to Google', $html );
		$this->assertStringContainsString( Settings::GOOGLE_KEYS_URL, $html );
	}

	/**
	 * The place search provider is one of four, `auto` by default, and a
	 * value that is none of them keeps the stored one.
	 */
	public function test_sanitize_place_provider(): void {
		$this->given_settings( array() );
		$this->assertSame( 'auto', Settings::defaults()['place_provider'] );
		$this->assertSame( 'auto', Settings::sanitize( array() )['place_provider'] );

		foreach ( Settings::PLACE_PROVIDERS as $provider ) {
			$this->assertSame( $provider, Settings::sanitize( array( 'place_provider' => strtoupper( $provider ) ) )['place_provider'] );
		}

		$this->given_settings( array( 'place_provider' => 'kaaljyoti' ) );
		$this->assertSame( 'kaaljyoti', Settings::sanitize( array( 'place_provider' => 'nominatim' ) )['place_provider'] );
		$this->assertSame( 'kaaljyoti', Settings::sanitize( array( 'place_provider' => array( 'photon' ) ) )['place_provider'] );
	}

	/**
	 * A self-hosted Photon is stored as an https origin and path; the public
	 * server, or nothing, is stored as empty.
	 *
	 * @param string $written What was typed.
	 * @param string $stored  What is kept.
	 */
	#[DataProvider( 'photon_urls' )]
	public function test_sanitize_photon_url( string $written, string $stored ): void {
		$this->given_settings( array() );

		$this->assertSame( $stored, Settings::sanitize( array( 'photon_url' => $written ) )['photon_url'] );
		$this->assertSame( array(), $this->settings_error_codes() );
	}

	/**
	 * Photon URLs the field takes, and what it stores for each.
	 *
	 * @return array<string, array{string, string}>
	 */
	public static function photon_urls(): array {
		return array(
			'empty'                => array( '', '' ),
			'the public server'    => array( 'https://photon.komoot.io/', '' ),
			'a host'               => array( 'https://Photon.Example.com', 'https://photon.example.com' ),
			'a path and /api/'     => array( 'https://geo.example.com/photon/api/', 'https://geo.example.com/photon' ),
			'a port, and a query'  => array( 'https://geo.example.com:8443/?q=x', 'https://geo.example.com:8443' ),
		);
	}

	/**
	 * Anything but an https address keeps the stored Photon URL.
	 *
	 * @param string $written What was typed.
	 */
	#[DataProvider( 'not_photon_urls' )]
	public function test_sanitize_refuses_a_bad_photon_url( string $written ): void {
		$this->given_settings( array( 'photon_url' => 'https://kept.example.com' ) );

		$this->assertSame( 'https://kept.example.com', Settings::sanitize( array( 'photon_url' => $written ) )['photon_url'] );
		$this->assertContains( 'kaal_jyoti_photon_url', $this->settings_error_codes() );
	}

	/**
	 * Values the Photon URL field must refuse.
	 *
	 * @return array<string, array{string}>
	 */
	public static function not_photon_urls(): array {
		return array(
			'plain http' => array( 'http://photon.example.com' ),
			'no scheme'  => array( 'photon.example.com' ),
			'a script'   => array( 'javascript:alert(1)' ),
		);
	}

	/**
	 * The provider select offers the four, and says what is sent where.
	 */
	public function test_the_place_provider_field(): void {
		$this->given_settings( array( 'place_provider' => 'photon' ) );
		Functions\when( 'selected' )->alias(
			static fn( $a, $b, $display = true ): string => (string) $a === (string) $b ? ' selected="selected"' : ''
		);

		ob_start();
		Settings::render_field( array( 'key' => 'place_provider' ) );
		Settings::render_field( array( 'key' => 'photon_url' ) );
		$html = (string) ob_get_clean();

		foreach ( Settings::PLACE_PROVIDERS as $provider ) {
			$this->assertStringContainsString( 'value="' . $provider . '"', $html );
		}
		$this->assertStringContainsString( 'value="photon" selected="selected"', $html );
		$this->assertStringContainsString( 'credits OpenStreetMap', $html );
		$this->assertStringContainsString( 'mention it in your privacy policy', $html );
		$this->assertStringContainsString( 'name="kaal_jyoti_settings[photon_url]"', $html );
		$this->assertStringContainsString( 'placeholder="https://photon.komoot.io"', $html );
	}

	/**
	 * The secret field is posted blank on every save, because it shows the
	 * stored key masked. Blank means "leave it alone".
	 */
	public function test_sanitize_keeps_the_stored_secret_key_when_the_field_is_blank(): void {
		$this->given_settings( array( 'secret_key' => 'kj_live_stored' ) );

		$clean = Settings::sanitize( array( 'secret_key' => '' ) );

		$this->assertSame( 'kj_live_stored', $clean['secret_key'] );
	}

	/**
	 * The checkbox beside it is how a key is removed.
	 */
	public function test_sanitize_removes_the_secret_key_on_request(): void {
		$this->given_settings( array( 'secret_key' => 'kj_live_stored' ) );

		$clean = Settings::sanitize(
			array(
				'secret_key'        => '',
				'secret_key_remove' => '1',
			)
		);

		$this->assertSame( '', $clean['secret_key'] );
		$this->assertArrayNotHasKey( 'secret_key_remove', $clean );
	}

	/**
	 * A secret key is a secret key by its prefix.
	 */
	public function test_sanitize_checks_the_secret_key_prefix(): void {
		$this->given_settings( array( 'secret_key' => 'kj_live_stored' ) );

		$this->assertSame( 'kj_test_new', Settings::sanitize( array( 'secret_key' => 'kj_test_new' ) )['secret_key'] );
		$this->assertSame( array(), $this->settings_error_codes() );

		$clean = Settings::sanitize( array( 'secret_key' => 'kj_pub_not_a_secret' ) );
		$this->assertSame( 'kj_live_stored', $clean['secret_key'] );
		$this->assertContains( 'kaal_jyoti_secret_key', $this->settings_error_codes() );
	}

	/**
	 * Server rendering without a secret key is not a mode the plugin can be in.
	 */
	public function test_sanitize_reverts_server_mode_without_a_secret_key(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize( array( 'render_mode' => 'server' ) );

		$this->assertSame( 'browser', $clean['render_mode'] );
		$this->assertContains( 'kaal_jyoti_render_mode', $this->settings_error_codes() );
	}

	/**
	 * With one, it is.
	 */
	public function test_sanitize_allows_server_mode_with_a_secret_key(): void {
		$this->given_settings( array( 'secret_key' => 'kj_live_stored' ) );

		$clean = Settings::sanitize( array( 'render_mode' => 'server' ) );

		$this->assertSame( 'server', $clean['render_mode'] );
		$this->assertSame( array(), $this->settings_error_codes() );
	}

	/**
	 * A key posted in the same save counts.
	 */
	public function test_sanitize_allows_server_mode_with_a_secret_key_posted_at_the_same_time(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize(
			array(
				'render_mode' => 'server',
				'secret_key'  => 'kj_live_new',
			)
		);

		$this->assertSame( 'server', $clean['render_mode'] );
	}

	/**
	 * A base URL (the `KAAL_JYOTI_API_BASE` constant's value) is reduced to its origin.
	 *
	 * @param string $written  What the constant says.
	 * @param string $expected What the plugin calls.
	 */
	#[DataProvider( 'base_urls' )]
	public function test_normalize_base_url_trims_to_the_origin( string $written, string $expected ): void {
		$this->assertSame( $expected, Settings::normalize_base_url( $written ) );
	}

	/**
	 * Base URLs and what they normalise to.
	 *
	 * @return array<string, array{0: string, 1: string}> The cases.
	 */
	public static function base_urls(): array {
		return array(
			'production'        => array( 'https://api.kaaljyoti.com', 'https://api.kaaljyoti.com' ),
			'trailing slash'    => array( 'https://api.kaaljyoti.com/', 'https://api.kaaljyoti.com' ),
			'with /v1'          => array( 'https://api-staging.kaaljyoti.com/v1', 'https://api-staging.kaaljyoti.com' ),
			'with /v1/'         => array( 'https://api-staging.kaaljyoti.com/v1/', 'https://api-staging.kaaljyoti.com' ),
			'a port'            => array( 'https://api.internal:8443/v1', 'https://api.internal:8443' ),
			'a path in front'   => array( 'https://example.com/kaal/v1/', 'https://example.com/kaal' ),
			'spaces are trimmed' => array( '  https://api.kaaljyoti.com/v1  ', 'https://api.kaaljyoti.com' ),
		);
	}

	/**
	 * Anything that is not an https URL is refused.
	 */
	public function test_normalize_base_url_refuses_anything_but_https(): void {
		$this->assertNull( Settings::normalize_base_url( 'http://api.example.com' ) );
		$this->assertNull( Settings::normalize_base_url( 'not a url' ) );
		$this->assertNull( Settings::normalize_base_url( '' ) );
	}

	/**
	 * The enums only take what they know.
	 */
	public function test_sanitize_holds_the_enums_to_their_values(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize(
			array(
				'default_city' => 'VARANASI',
				'language'     => 'hi',
				'powered_by'   => 'hidden',
			)
		);

		$this->assertSame( 'varanasi', $clean['default_city'] );
		$this->assertSame( 'hi', $clean['language'] );
		$this->assertSame( 'hidden', $clean['powered_by'] );

		$clean = Settings::sanitize(
			array(
				'default_city' => 'paris',
				'language'     => 'fr',
				'powered_by'   => 'maybe',
			)
		);

		$this->assertSame( 'delhi', $clean['default_city'] );
		$this->assertSame( 'en', $clean['language'] );
		$this->assertSame( 'hidden', $clean['powered_by'] );
	}

	/**
	 * The cache window is an integer between one minute and a day.
	 */
	public function test_sanitize_clamps_the_cache_minutes(): void {
		$this->given_settings( array() );

		$this->assertSame( 1, Settings::sanitize( array( 'cache_minutes' => '0' ) )['cache_minutes'] );
		$this->assertSame( 1, Settings::sanitize( array( 'cache_minutes' => '-90' ) )['cache_minutes'] );
		$this->assertSame( 1440, Settings::sanitize( array( 'cache_minutes' => '99999' ) )['cache_minutes'] );
		$this->assertSame( 30, Settings::sanitize( array( 'cache_minutes' => '30' ) )['cache_minutes'] );
	}

	/**
	 * The origin the settings page prints is the one the browser will send.
	 */
	public function test_origin_is_scheme_host_and_port(): void {
		Functions\when( 'home_url' )->justReturn( 'http://localhost:3000/blog' );
		$this->assertSame( 'http://localhost:3000', Settings::origin() );

		Functions\when( 'home_url' )->justReturn( 'https://example.com/' );
		$this->assertSame( 'https://example.com', Settings::origin() );
	}

	/**
	 * A stored secret key is shown as its first twelve characters.
	 */
	public function test_mask_shows_twelve_characters(): void {
		$this->assertSame( 'kj_live_abcd…', Settings::mask( 'kj_live_abcdefghijklmnop' ) );
	}

	/**
	 * The eight bundled cities carry what a server call needs.
	 */
	public function test_cities_carry_their_coordinates(): void {
		$this->assertCount( 8, Settings::CITIES );
		$this->assertSame( 'Asia/Kolkata', Settings::city( 'varanasi' )['timezone'] );
		$this->assertNull( Settings::city( 'paris' ) );
	}

	/**
	 * Server calls attribute themselves to the plugin, not to the SDK.
	 */
	public function test_client_tag_names_the_plugin(): void {
		$this->assertSame( 'wordpress/' . KAAL_JYOTI_VERSION, Settings::client_tag() );
	}

	/**
	 * A fresh install follows the site's own colours and overrides nothing.
	 */
	public function test_appearance_defaults_to_auto_with_no_overrides(): void {
		Functions\when( 'get_option' )->justReturn( false );

		$this->assertSame( 'auto', Settings::theme() );
		foreach ( array_keys( Settings::COLOR_PROPERTIES ) as $key ) {
			$this->assertSame( '', Settings::get( $key ) );
		}
		$this->assertSame( '', Settings::get( 'font' ) );
		$this->assertSame( '', Settings::get( 'radius' ) );
	}

	/**
	 * The theme is one of three words; anything else keeps what was stored.
	 */
	public function test_sanitize_holds_the_theme_to_its_values(): void {
		$this->given_settings( array( 'theme' => 'light' ) );

		$this->assertSame( 'dark', Settings::sanitize( array( 'theme' => ' DARK ' ) )['theme'] );
		$this->assertSame( 'auto', Settings::sanitize( array( 'theme' => 'auto' ) )['theme'] );
		$this->assertSame( 'light', Settings::sanitize( array( 'theme' => 'sepia' ) )['theme'] );
		$this->assertSame( 'light', Settings::sanitize( array() )['theme'] );
	}

	/**
	 * The preset is one of four words; anything else keeps what was stored.
	 */
	public function test_sanitize_holds_the_preset_to_its_values(): void {
		$this->given_settings( array( 'preset' => 'modern' ) );

		$this->assertSame( 'minimal', Settings::sanitize( array( 'preset' => ' Minimal ' ) )['preset'] );
		$this->assertSame( 'traditional', Settings::sanitize( array( 'preset' => 'traditional' ) )['preset'] );
		$this->assertSame( 'modern', Settings::sanitize( array( 'preset' => 'neon' ) )['preset'] );
		$this->assertSame( 'modern', Settings::sanitize( array() )['preset'] );
	}

	/**
	 * The preset defaults to classic.
	 */
	public function test_the_preset_defaults_to_classic(): void {
		$this->given_settings( array() );

		$this->assertSame( 'classic', Settings::preset() );
	}

	/**
	 * A stored theme that is not one of the three reads as auto.
	 */
	public function test_theme_reads_a_bad_stored_value_as_auto(): void {
		$this->given_settings( array( 'theme' => 'neon' ) );

		$this->assertSame( 'auto', Settings::theme() );
	}

	/**
	 * Hex colours are kept, lower-cased; anything else is dropped to empty.
	 */
	public function test_sanitize_keeps_hex_colours_and_drops_the_rest(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize(
			array(
				'color_background' => '#1B1815',
				'color_text'       => ' #fff ',
				'color_accent'     => 'red',
				'color_line'       => '#12345',
				'color_muted'      => '#123456; background: url(x)',
				'color_good'       => '',
				'color_bad'        => array( '#000' ),
			)
		);

		$this->assertSame( '#1b1815', $clean['color_background'] );
		$this->assertSame( '#fff', $clean['color_text'] );
		$this->assertSame( '', $clean['color_accent'] );
		$this->assertSame( '', $clean['color_line'] );
		$this->assertSame( '', $clean['color_muted'] );
		$this->assertSame( '', $clean['color_good'] );
		$this->assertSame( '', $clean['color_bad'] );
	}

	/**
	 * The radius is whole pixels from 0 to 48, or empty.
	 *
	 * @param mixed      $written  What was posted.
	 * @param int|string $expected What is stored.
	 */
	#[DataProvider( 'radii' )]
	public function test_sanitize_holds_the_radius_to_its_range( $written, $expected ): void {
		$this->given_settings( array() );

		$this->assertSame( $expected, Settings::sanitize( array( 'radius' => $written ) )['radius'] );
	}

	/**
	 * Radii as posted, and as stored.
	 *
	 * @return array<string, array{0: mixed, 1: int|string}> The cases.
	 */
	public static function radii(): array {
		return array(
			'empty'      => array( '', '' ),
			'zero'       => array( '0', 0 ),
			'in range'   => array( '12', 12 ),
			'decimal'    => array( '7.6', 8 ),
			'negative'   => array( '-4', 0 ),
			'too large'  => array( '120', 48 ),
			'not a size' => array( '12px', '' ),
			'nonsense'   => array( 'round', '' ),
		);
	}

	/**
	 * A font list keeps what a font-family needs and nothing that could end the rule.
	 *
	 * @param string $written  What was posted.
	 * @param string $expected What is stored.
	 */
	#[DataProvider( 'fonts' )]
	public function test_sanitize_font( string $written, string $expected ): void {
		$this->given_settings( array() );

		$this->assertSame( $expected, Settings::sanitize( array( 'font' => $written ) )['font'] );
	}

	/**
	 * Fonts as posted, and as stored.
	 *
	 * @return array<string, array{0: string, 1: string}> The cases.
	 */
	public static function fonts(): array {
		return array(
			'empty'              => array( '', '' ),
			'a plain list'       => array( 'Georgia, serif', 'Georgia, serif' ),
			'quoted names'       => array( '"Noto Serif", \'Mukta\', sans-serif', '"Noto Serif", \'Mukta\', sans-serif' ),
			'a closing brace'    => array( 'Arial; } body { display: none', 'Arial body display none' ),
			'a style breakout'   => array( 'x</style><script>alert(1)</script>', 'xstylescriptalert1script' ),
			'an unbalanced quote' => array( '"Noto Serif, serif', 'Noto Serif, serif' ),
			'extra spaces'       => array( "  Georgia ,\t serif ,", 'Georgia , serif' ),
		);
	}

	/**
	 * A fresh site shows the API's own disclaimer line.
	 */
	public function test_the_disclaimer_defaults_to_the_api_line(): void {
		Functions\when( 'get_option' )->justReturn( false );

		$this->assertSame( 'default', Settings::get( 'disclaimer' ) );
		$this->assertSame( '', Settings::get( 'disclaimer_name' ) );
		$this->assertSame( '', Settings::get( 'disclaimer_url' ) );
		$this->assertSame( array(), Settings::disclaimer_attributes() );
	}

	/**
	 * The three choices, each stored as posted.
	 */
	public function test_sanitize_stores_the_disclaimer_choice(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize(
			array(
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => '  Acharya Amit Verma ',
				'disclaimer_url'  => 'https://kaaljyoti.com/consult',
			)
		);

		$this->assertSame( 'astrologer', $clean['disclaimer'] );
		$this->assertSame( 'Acharya Amit Verma', $clean['disclaimer_name'] );
		$this->assertSame( 'https://kaaljyoti.com/consult', $clean['disclaimer_url'] );
		$this->assertSame( array(), self::$settings_errors );

		$this->assertSame( 'off', Settings::sanitize( array( 'disclaimer' => 'OFF' ) )['disclaimer'] );
		$this->assertSame( 'default', Settings::sanitize( array( 'disclaimer' => 'default' ) )['disclaimer'] );
	}

	/**
	 * A choice that is not one of the three keeps what was stored.
	 */
	public function test_sanitize_keeps_the_stored_disclaimer_for_an_unknown_choice(): void {
		$this->given_settings( array( 'disclaimer' => 'off' ) );

		$this->assertSame( 'off', Settings::sanitize( array( 'disclaimer' => 'sometimes' ) )['disclaimer'] );
		$this->assertSame( 'off', Settings::sanitize( array() )['disclaimer'] );
	}

	/**
	 * "My astrologer" with no name has nothing to say, so the default line
	 * stands, and the page says why. The link is kept for next time.
	 */
	public function test_sanitize_needs_a_name_for_my_astrologer(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize(
			array(
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => '   ',
				'disclaimer_url'  => 'https://example.com',
			)
		);

		$this->assertSame( 'default', $clean['disclaimer'] );
		$this->assertSame( 'https://example.com', $clean['disclaimer_url'] );
		$this->assertContains( 'kaal_jyoti_disclaimer', $this->settings_error_codes() );
	}

	/**
	 * A link that is not http or https, or is too long, is dropped with a
	 * line saying so; the name is cut to eighty characters.
	 */
	public function test_sanitize_checks_the_disclaimer_link_and_name(): void {
		$this->given_settings( array() );

		$clean = Settings::sanitize(
			array(
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => str_repeat( 'x', 120 ),
				'disclaimer_url'  => 'javascript:alert(1)',
			)
		);

		$this->assertSame( 'astrologer', $clean['disclaimer'] );
		$this->assertSame( str_repeat( 'x', 80 ), $clean['disclaimer_name'] );
		$this->assertSame( '', $clean['disclaimer_url'] );
		$this->assertContains( 'kaal_jyoti_disclaimer_url', $this->settings_error_codes() );

		$clean = Settings::sanitize(
			array(
				'disclaimer_name' => 'A',
				'disclaimer_url'  => 'https://example.com/' . str_repeat( 'a', 200 ),
			)
		);
		$this->assertSame( '', $clean['disclaimer_url'] );
	}

	/**
	 * The attributes the setting writes onto a report element.
	 */
	public function test_disclaimer_attributes_follow_the_setting(): void {
		$this->given_settings( array( 'disclaimer' => 'off' ) );
		$this->assertSame( array( 'disclaimer' => 'off' ), Settings::disclaimer_attributes() );

		$this->given_settings(
			array(
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => 'Acharya Amit Verma',
				'disclaimer_url'  => 'https://kaaljyoti.com',
			)
		);
		$this->assertSame(
			array(
				'disclaimer-name' => 'Acharya Amit Verma',
				'disclaimer-url'  => 'https://kaaljyoti.com',
			),
			Settings::disclaimer_attributes()
		);

		// A name stored without a choice to use it says nothing.
		$this->given_settings(
			array(
				'disclaimer'      => 'default',
				'disclaimer_name' => 'Acharya Amit Verma',
			)
		);
		$this->assertSame( array(), Settings::disclaimer_attributes() );

		// Nor does "My astrologer" with a row that somehow lost its name.
		$this->given_settings( array( 'disclaimer' => 'astrologer' ) );
		$this->assertSame( array(), Settings::disclaimer_attributes() );
	}

	/**
	 * The settings page draws the three choices and the two fields, with the
	 * stored ones filled in and escaped.
	 */
	public function test_the_disclaimer_field(): void {
		$this->given_settings(
			array(
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => 'Pandit "Ji"',
				'disclaimer_url'  => 'https://example.com',
			)
		);
		Functions\when( 'checked' )->alias(
			static fn( $checked, $current, bool $display ): string => (string) $checked === (string) $current ? ' checked=\'checked\'' : ''
		);

		ob_start();
		Settings::render_field( array( 'key' => 'disclaimer' ) );
		$html = (string) ob_get_clean();

		$this->assertStringContainsString( 'id="kaal_jyoti_disclaimer" name="kaal_jyoti_settings[disclaimer]" value="default" />', $html );
		$this->assertStringContainsString( 'value="astrologer" checked=\'checked\'', $html );
		$this->assertStringContainsString( 'value="off" />', $html );
		$this->assertStringContainsString( 'name="kaal_jyoti_settings[disclaimer_name]" value="Pandit &quot;Ji&quot;"', $html );
		$this->assertStringContainsString( 'name="kaal_jyoti_settings[disclaimer_url]" value="https://example.com"', $html );
	}

	/**
	 * "Test connection" names the engine and the ephemeris `/v1/health`
	 * reports, and with no secret key stored it stops there.
	 */
	public function test_the_connection_check_names_the_engine_and_the_ephemeris(): void {
		$this->given_settings( array( 'secret_key' => '' ) );
		$sent = $this->stub_the_connection_check(
			'{"status":"ok","engine":"0.14.2","ephemeris":"kaaljyoti-ephemeris 0.1.1","ops":42,"uptime_s":1620}'
		);

		$this->assertSame( 'success', $sent['kind'] );
		$this->assertStringStartsWith( 'Engine 0.14.2, ephemeris kaaljyoti-ephemeris 0.1.1. ', $sent['data']['message'] );
		$this->assertStringContainsString( 'No secret key is stored', $sent['data']['message'] );
	}

	/**
	 * A health answer without the ephemeris still reads, with a stand-in.
	 */
	public function test_the_connection_check_survives_a_health_answer_without_the_ephemeris(): void {
		$this->given_settings( array( 'secret_key' => '' ) );
		$sent = $this->stub_the_connection_check( '{"status":"ok","engine":"0.14.2"}' );

		$this->assertStringStartsWith( 'Engine 0.14.2, ephemeris ?.', $sent['data']['message'] );
	}

	/**
	 * Stubs WordPress for `Settings::ajax_test()` with `/v1/health` answering
	 * `$health`, runs it, and returns what it sent back to the browser.
	 *
	 * `wp_send_json_*()` end the request in WordPress; the stand-ins throw
	 * instead, so the test sees the first answer exactly as the browser would.
	 *
	 * @param string $health The body `/v1/health` answers with.
	 * @return array{kind: string, data: array<string, mixed>}
	 */
	private function stub_the_connection_check( string $health ): array {
		Functions\when( 'check_ajax_referer' )->justReturn( 1 );
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'wp_remote_get' )->justReturn( array( 'body' => $health ) );
		Functions\when( 'is_wp_error' )->justReturn( false );
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( 200 );
		Functions\when( 'wp_remote_retrieve_body' )->alias( static fn( array $answer ): string => $answer['body'] );

		foreach ( array( 'success', 'error' ) as $kind ) {
			Functions\when( 'wp_send_json_' . $kind )->alias(
				static function ( $data ) use ( $kind ): void {
					throw new \RuntimeException( (string) wp_json_encode( array( 'kind' => $kind, 'data' => $data ) ) );
				}
			);
		}

		try {
			Settings::ajax_test();
		} catch ( \RuntimeException $sent ) {
			return json_decode( $sent->getMessage(), true );
		}

		$this->fail( 'ajax_test() answered nothing.' );
	}
}
