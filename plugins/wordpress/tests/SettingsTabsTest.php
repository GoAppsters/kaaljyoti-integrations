<?php
/**
 * The settings page's tabs: one form per tab over one option row.
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
final class SettingsTabsTest extends TestCase {

	/**
	 * A stored row with every key away from its default, and valid.
	 *
	 * @var array<string, mixed>
	 */
	private const STORED = array(
		'publishable_key'   => 'kj_pub_stored',
		'secret_key'        => 'kj_live_stored',
		'google_maps_key'   => 'AIzaSyStored-abcdefghijklmnopqrstuvwx',
		'place_provider'    => 'photon',
		'photon_url'        => 'https://photon.stored.example',
		'default_city'      => 'mumbai',
		'language'          => 'hi',
		'powered_by'        => 'hidden',
		'render_mode'       => 'server',
		'cache_minutes'     => 30,
		'disclaimer'        => 'astrologer',
		'disclaimer_name'   => 'Stored Name',
		'disclaimer_url'    => 'https://stored.example/astrologer',
		'theme'             => 'dark',
		'preset'            => 'modern',
		'color_background'  => '#111111',
		'color_text'        => '#222222',
		'color_accent'      => '#333333',
		'color_line'        => '#444444',
		'color_muted'       => '#555555',
		'color_good'        => '#666666',
		'color_bad'         => '#777777',
		'font'              => 'Georgia, serif',
		'radius'            => 8,
		'font_mode'         => 'inherit',
		'time_format'       => '24',
		'remember'          => false,
		'pricing_url'       => 'https://stored.example/pricing',
		'proxy_docs_url'    => 'https://stored.example/docs',
		'proxy'             => true,
		'proxy_nonce'       => false,
		'pdf'               => true,
		'pdf_editions'      => array( 'professional' ),
		'rate_month'        => 20,
		'rate_pdf'          => 5,
		'month_cache_hours' => 24,
		'sign_icons'        => 'glyph',
		'sign_images'       => array( 'aries' => 11 ),
	);

	/**
	 * What a form posts for every key: valid, and different from STORED.
	 *
	 * @var array<string, mixed>
	 */
	private const POSTED = array(
		'publishable_key'   => 'kj_pub_posted',
		'secret_key'        => 'kj_test_posted',
		'google_maps_key'   => 'AIzaSyPosted-abcdefghijklmnopqrstuvwx',
		'place_provider'    => 'kaaljyoti',
		'photon_url'        => 'https://photon.posted.example',
		'default_city'      => 'jaipur',
		'language'          => 'en',
		'powered_by'        => 'shown',
		'render_mode'       => 'browser',
		'cache_minutes'     => '45',
		'disclaimer'        => 'off',
		'disclaimer_name'   => 'Posted Name',
		'disclaimer_url'    => 'https://posted.example/astrologer',
		'theme'             => 'light',
		'preset'            => 'minimal',
		'color_background'  => '#aaaaaa',
		'color_text'        => '#bbbbbb',
		'color_accent'      => '#cccccc',
		'color_line'        => '#dddddd',
		'color_muted'       => '#eeeeee',
		'color_good'        => '#00aa00',
		'color_bad'         => '#aa0000',
		'font'              => 'Verdana, sans-serif',
		'radius'            => '20',
		'font_mode'         => 'system',
		'time_format'       => '12',
		'remember'          => '1',
		'pricing_url'       => 'https://posted.example/pricing',
		'proxy_docs_url'    => 'https://posted.example/docs',
		'proxy'             => '0',
		'proxy_nonce'       => '1',
		'pdf'               => '0',
		'pdf_editions'      => array( '', 'basic', 'professional' ),
		'rate_month'        => '40',
		'rate_pdf'          => '7',
		'month_cache_hours' => '48',
		'sign_icons'        => 'devanagari',
		'sign_images'       => array( 'aries' => '22' ),
	);

	/**
	 * The stand-ins the tabs need on top of the shared ones.
	 */
	protected function setUp(): void {
		parent::setUp();

		Functions\when( 'wp_attachment_is_image' )->justReturn( true );
		Functions\when( 'sanitize_key' )->alias(
			static fn( $key ): string => (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) )
		);
		Functions\when( 'wp_unslash' )->returnArg( 1 );

		$this->given_settings( self::STORED );
	}

	/**
	 * Leaves `$_GET` as it was found.
	 */
	protected function tearDown(): void {
		unset( $_GET['tab'] );
		parent::tearDown();
	}

	/**
	 * The tabs with a form.
	 *
	 * @return array<string, array{0: string}>
	 */
	public static function form_tabs(): array {
		return array(
			'connection' => array( 'connection' ),
			'appearance' => array( 'appearance' ),
			'forms'      => array( 'forms' ),
			'reports'    => array( 'reports' ),
			'advanced'   => array( 'advanced' ),
		);
	}

	/**
	 * Every stored key is edited on exactly one tab, and the Shortcodes tab
	 * edits none.
	 */
	public function test_every_setting_belongs_to_exactly_one_tab(): void {
		$owners = array();
		foreach ( array_keys( Settings::tabs() ) as $tab ) {
			foreach ( Settings::tab_keys( $tab ) as $key ) {
				$owners[ $key ][] = $tab;
			}
		}

		foreach ( array_keys( Settings::defaults() ) as $key ) {
			$this->assertCount( 1, $owners[ $key ] ?? array(), "{$key} must be on exactly one tab" );
		}
		$this->assertSame( array(), Settings::tab_keys( 'shortcodes' ) );
		$this->assertSame( 'connection', array_key_first( Settings::tabs() ) );
		$this->assertSame( 'appearance', Settings::tab_of( 'sign_images' ) );
		$this->assertSame( 'reports', Settings::tab_of( 'pdf_editions' ) );
		$this->assertSame( 'advanced', Settings::tab_of( 'rate_pdf' ) );
	}

	/**
	 * Saving one tab changes that tab's settings and nothing else — even when
	 * the post carries other tabs' fields too.
	 *
	 * @param string $tab The tab saved.
	 */
	#[DataProvider( 'form_tabs' )]
	public function test_saving_a_tab_leaves_the_other_tabs_untouched( string $tab ): void {
		$owned = Settings::tab_keys( $tab );
		$clean = Settings::sanitize( array_merge( self::POSTED, array( '_tab' => $tab ) ) );

		$this->assertSame( array_keys( Settings::defaults() ), array_keys( $clean ) );
		$this->assertArrayNotHasKey( '_tab', $clean );

		foreach ( self::STORED as $key => $stored ) {
			if ( in_array( $key, $owned, true ) ) {
				$this->assertNotEquals( $stored, $clean[ $key ], "{$key} is on {$tab} and was posted" );
			} else {
				$this->assertSame( $stored, $clean[ $key ], "{$key} is not on {$tab}" );
			}
		}
	}

	/**
	 * Saving a tab with only its own fields — what the page's form posts —
	 * keeps every other tab's value, including the ones whole-row rules
	 * would empty when missing (the keys, colours, links).
	 *
	 * @param string $tab The tab saved.
	 */
	#[DataProvider( 'form_tabs' )]
	public function test_a_tab_form_posting_only_its_fields_keeps_the_rest( string $tab ): void {
		$input = array_intersect_key( self::POSTED, array_flip( Settings::tab_keys( $tab ) ) );
		$clean = Settings::sanitize( $input + array( '_tab' => $tab ) );

		foreach ( self::STORED as $key => $stored ) {
			if ( ! in_array( $key, Settings::tab_keys( $tab ), true ) ) {
				$this->assertSame( $stored, $clean[ $key ], "{$key} is not on {$tab}" );
			}
		}
	}

	/**
	 * The posted values land as the field rules make them.
	 */
	public function test_a_saved_tab_is_sanitised_by_the_usual_rules(): void {
		$clean = Settings::sanitize( array_merge( self::POSTED, array( '_tab' => 'advanced' ) ) );

		$this->assertSame( 45, $clean['cache_minutes'] );
		$this->assertSame( 'browser', $clean['render_mode'] );
		$this->assertFalse( $clean['proxy'] );
		$this->assertTrue( $clean['proxy_nonce'] );
		$this->assertSame( 40, $clean['rate_month'] );

		$clean = Settings::sanitize( array_merge( self::POSTED, array( '_tab' => 'reports' ) ) );
		$this->assertSame( array( 'basic', 'professional' ), $clean['pdf_editions'] );
		$this->assertSame( 'off', $clean['disclaimer'] );
		$this->assertSame( 'Posted Name', $clean['disclaimer_name'] );
	}

	/**
	 * A box missing from the post is off when it is on the saved tab, and
	 * left alone when it is not.
	 */
	public function test_a_missing_checkbox_is_off_only_on_its_own_tab(): void {
		$this->given_settings(
			array_merge(
				self::STORED,
				array(
					'remember'    => true,
					'proxy'       => true,
					'proxy_nonce' => true,
					'pdf'         => true,
				)
			)
		);

		$forms = Settings::sanitize( array( '_tab' => 'forms' ) );
		$this->assertFalse( $forms['remember'] );
		$this->assertTrue( $forms['proxy'] );
		$this->assertTrue( $forms['proxy_nonce'] );
		$this->assertTrue( $forms['pdf'] );

		$advanced = Settings::sanitize( array( '_tab' => 'advanced' ) );
		$this->assertFalse( $advanced['proxy'] );
		$this->assertFalse( $advanced['proxy_nonce'] );
		$this->assertTrue( $advanced['remember'] );
		$this->assertTrue( $advanced['pdf'] );

		$appearance = Settings::sanitize( array( '_tab' => 'appearance' ) );
		foreach ( array( 'remember', 'proxy', 'proxy_nonce', 'pdf' ) as $flag ) {
			$this->assertTrue( $appearance[ $flag ], "{$flag} is not on Appearance" );
		}
	}

	/**
	 * The hidden `0` and the ticked `1`: PHP keeps the last of two fields
	 * with one name, so a ticked box posts `1` and an unticked one `0`.
	 */
	public function test_the_hidden_zero_and_a_ticked_box(): void {
		$this->given_settings( array_merge( self::STORED, array( 'remember' => false ) ) );
		$this->assertTrue(
			Settings::sanitize(
				array(
					'_tab'     => 'forms',
					'remember' => '1',
				)
			)['remember']
		);

		$this->given_settings( array_merge( self::STORED, array( 'remember' => true ) ) );
		$this->assertFalse(
			Settings::sanitize(
				array(
					'_tab'     => 'forms',
					'remember' => '0',
				)
			)['remember']
		);
	}

	/**
	 * PDF editions are checkboxes too: none posted on Reports is none ticked
	 * (and PDFs on with none falls back to basic, with a note), while
	 * another tab's save keeps them.
	 */
	public function test_pdf_editions_follow_the_checkbox_rule(): void {
		$reports = Settings::sanitize(
			array(
				'_tab' => 'reports',
				'pdf'  => '1',
			)
		);
		$this->assertSame( array( 'basic' ), $reports['pdf_editions'] );
		$this->assertContains( 'kaal_jyoti_pdf_editions', $this->settings_error_codes() );

		self::$settings_errors = array();
		$forms                 = Settings::sanitize( array( '_tab' => 'forms' ) );
		$this->assertSame( array( 'professional' ), $forms['pdf_editions'] );
		$this->assertNotContains( 'kaal_jyoti_pdf_editions', $this->settings_error_codes() );
	}

	/**
	 * The secret key's "remove" box works on Connection and nowhere else.
	 */
	public function test_the_secret_key_is_removed_only_from_connection(): void {
		$this->assertSame(
			'kj_live_stored',
			Settings::sanitize(
				array(
					'_tab'              => 'advanced',
					'secret_key_remove' => '1',
				)
			)['secret_key']
		);

		$this->assertSame(
			'',
			Settings::sanitize(
				array(
					'_tab'              => 'connection',
					'publishable_key'   => 'kj_pub_stored',
					'secret_key'        => '',
					'secret_key_remove' => '1',
				)
			)['secret_key']
		);

		// The masked field posts blank: the stored key stays.
		$this->assertSame(
			'kj_live_stored',
			Settings::sanitize(
				array(
					'_tab'            => 'connection',
					'publishable_key' => 'kj_pub_stored',
					'secret_key'      => '',
				)
			)['secret_key']
		);
	}

	/**
	 * A tab the page does not have is the first one, in the URL and in a post.
	 */
	public function test_an_unknown_tab_falls_back_to_the_first(): void {
		$this->assertSame( 'connection', Settings::resolve_tab( 'nonsense' ) );
		$this->assertSame( 'connection', Settings::resolve_tab( '' ) );
		$this->assertSame( 'connection', Settings::resolve_tab( array( 'appearance' ) ) );
		$this->assertSame( 'appearance', Settings::resolve_tab( 'Appearance' ) );

		$_GET['tab'] = 'nonsense';
		$this->assertSame( 'connection', Settings::current_tab() );
		$_GET['tab'] = 'reports';
		$this->assertSame( 'reports', Settings::current_tab() );
		unset( $_GET['tab'] );
		$this->assertSame( 'connection', Settings::current_tab() );

		$clean = Settings::sanitize( array_merge( self::POSTED, array( '_tab' => 'nonsense' ) ) );
		$this->assertSame( 'kj_pub_posted', $clean['publishable_key'] );
		$this->assertSame( 'hi', $clean['language'] );
		$this->assertSame( 'dark', $clean['theme'] );
	}

	/**
	 * A post without a tab is a whole-row save, as before the tabs: what code
	 * that calls `update_option()` with the full row relies on.
	 */
	public function test_a_post_without_a_tab_saves_the_whole_row(): void {
		$clean = Settings::sanitize( self::POSTED );

		$this->assertSame( 'kj_pub_posted', $clean['publishable_key'] );
		$this->assertSame( 'en', $clean['language'] );
		$this->assertSame( 'light', $clean['theme'] );
		$this->assertSame( 'browser', $clean['render_mode'] );
	}

	/**
	 * Errors are raised for the saved tab's fields only, so they show on the
	 * tab the field is on; another tab's stale or posted value says nothing.
	 */
	public function test_errors_are_raised_only_for_the_saved_tab(): void {
		$this->given_settings(
			array_merge(
				self::STORED,
				array(
					'secret_key' => '',
					'pdf'        => true,
				)
			)
		);
		$bad = array(
			'publishable_key' => 'not-a-key',
			'photon_url'      => 'http://insecure.example',
			'pricing_url'     => 'javascript:alert(1)',
		);

		Settings::sanitize( $bad + array( '_tab' => 'appearance' ) );
		$this->assertSame( array(), $this->settings_error_codes() );

		Settings::sanitize( $bad + array( '_tab' => 'connection' ) );
		$this->assertSame( array( 'kaal_jyoti_publishable_key' ), $this->settings_error_codes() );

		self::$settings_errors = array();
		Settings::sanitize( $bad + array( '_tab' => 'forms' ) );
		$this->assertSame( array( 'kaal_jyoti_photon_url' ), $this->settings_error_codes() );

		self::$settings_errors = array();
		Settings::sanitize( $bad + array( '_tab' => 'advanced' ) );
		$this->assertContains( 'kaal_jyoti_pricing_url', $this->settings_error_codes() );
		$this->assertContains( 'kaal_jyoti_pdf', $this->settings_error_codes(), 'the proxy is on Advanced' );

		self::$settings_errors = array();
		Settings::sanitize(
			array(
				'_tab'         => 'reports',
				'pdf'          => '1',
				'pdf_editions' => array( 'basic' ),
			)
		);
		$this->assertSame( array( 'kaal_jyoti_pdf' ), $this->settings_error_codes() );
	}

	/**
	 * The page: one nav tab per tab, the active one marked for sight and for
	 * screen readers, and a form that names its tab.
	 *
	 * @param string $tab The tab asked for.
	 */
	#[DataProvider( 'form_tabs' )]
	public function test_the_page_draws_the_tabs_and_the_active_form( string $tab ): void {
		$_GET['tab'] = $tab;
		$html        = $this->page( $tab );

		$this->assertStringContainsString( '<nav class="nav-tab-wrapper', $html );
		$this->assertSame( count( Settings::tabs() ), preg_match_all( '/class="nav-tab(?: nav-tab-active)?"/', $html ) );
		$this->assertSame( 1, substr_count( $html, 'nav-tab-active' ) );
		$this->assertSame( 1, substr_count( $html, 'aria-current="page"' ) );
		$this->assertMatchesRegularExpression(
			'#<a href="[^"]*page=kaal-jyoti&(amp;)?tab=' . $tab . '" class="nav-tab nav-tab-active" aria-current="page">#',
			$html
		);
		$this->assertStringContainsString( '<input type="hidden" name="kaal_jyoti_settings[_tab]" value="' . $tab . '" />', $html );
		$this->assertStringContainsString( '[fields kaal_jyoti]', $html );
		$this->assertStringContainsString( '[sections kaal-jyoti-' . $tab . ']', $html );
		$this->assertStringContainsString( Settings::tabs()[ $tab ][1], $html );
		$this->assertSame( 'connection' === $tab, str_contains( $html, 'id="kaal-jyoti-test"' ) );
	}

	/**
	 * An unknown `?tab=` draws the first tab.
	 */
	public function test_the_page_falls_back_to_the_first_tab(): void {
		$_GET['tab'] = '<script>';
		$html        = $this->page( 'connection' );

		$this->assertStringContainsString( 'value="connection"', $html );
		$this->assertStringNotContainsString( '<script>', $html );
	}

	/**
	 * The Shortcodes tab has no form, and a copy button per shortcode.
	 */
	public function test_the_shortcodes_tab_lists_them_with_copy_buttons(): void {
		$_GET['tab'] = 'shortcodes';
		Functions\expect( 'settings_fields' )->never();
		Functions\expect( 'do_settings_sections' )->never();
		$html = $this->page( null );

		$this->assertStringNotContainsString( '<form', $html );
		$this->assertSame( count( Settings::SHORTCODE_EXAMPLES ), substr_count( $html, 'class="button button-small kaal-jyoti-copy"' ) );
		$this->assertStringContainsString( 'data-copy="[kj_horoscope sign=&quot;aries&quot; period=&quot;weekly&quot;]"', $html );
	}

	/**
	 * Capability and nonce are WordPress's, as before the tabs: the page is
	 * Settings → Kaal Jyoti for `manage_options`, the form posts to
	 * `options.php` with the `kaal_jyoti` group's nonce, and anyone else is
	 * turned away.
	 */
	public function test_capability_and_nonce_are_unchanged(): void {
		Functions\expect( 'add_options_page' )
			->once()
			->with( 'Kaal Jyoti', 'Kaal Jyoti', 'manage_options', 'kaal-jyoti', array( Settings::class, 'render_page' ) );
		Settings::add_page();

		Functions\when( 'current_user_can' )->justReturn( false );
		Functions\when( 'wp_die' )->alias(
			static function (): void {
				throw new \RuntimeException( 'wp_die' );
			}
		);
		try {
			Settings::render_page();
			$this->fail( 'A user without manage_options got the page.' );
		} catch ( \RuntimeException $e ) {
			$this->assertSame( 'wp_die', $e->getMessage() );
		}

		$html = $this->page( 'connection' );
		$this->assertStringContainsString( '<form action="options.php" method="post">', $html );
		$this->assertStringContainsString( '[fields kaal_jyoti]', $html );
	}

	/**
	 * The option is registered once, for the one group, and each section
	 * on its tab's page.
	 */
	public function test_registration_puts_each_section_on_its_tab(): void {
		$sections = array();
		$fields   = array();
		Functions\expect( 'register_setting' )
			->once()
			->with( 'kaal_jyoti', 'kaal_jyoti_settings', \Mockery::on( static fn( $args ) => array( Settings::class, 'sanitize' ) === $args['sanitize_callback'] ) );
		Functions\when( 'add_settings_section' )->alias(
			static function ( string $id, string $title, $callback, string $page ) use ( &$sections ): void {
				$sections[ $id ] = $page;
			}
		);
		Functions\when( 'add_settings_field' )->alias(
			static function ( string $id, string $title, $callback, string $page, string $section ) use ( &$fields ): void {
				$fields[ $id ] = $page;
			}
		);

		Settings::register();

		$this->assertSame( 'kaal-jyoti-connection', $sections['kaal_jyoti_keys'] );
		$this->assertSame( 'kaal-jyoti-appearance', $sections['kaal_jyoti_signs'] );
		$this->assertSame( 'kaal-jyoti-reports', $sections['kaal_jyoti_pdf'] );
		$this->assertSame( 'kaal-jyoti-advanced', $sections['kaal_jyoti_server'] );
		$this->assertSame( 'kaal-jyoti-forms', $fields['kaal_jyoti_language'] );
		$this->assertSame( 'kaal-jyoti-reports', $fields['kaal_jyoti_pdf'] );
	}

	/**
	 * The media library and the colour pickers load on Appearance only;
	 * the admin script (the connection test, the search) on every tab.
	 *
	 * @param string $tab The tab open.
	 */
	#[DataProvider( 'form_tabs' )]
	public function test_the_pickers_load_on_appearance_only( string $tab ): void {
		$_GET['tab'] = $tab;
		if ( ! defined( 'KAAL_JYOTI_URL' ) ) {
			$this->markTestSkipped( 'The plugin constants are not loaded.' );
		}
		Functions\when( 'wp_create_nonce' )->justReturn( 'nonce' );
		$localized = array();
		Functions\when( 'wp_localize_script' )->alias(
			static function ( string $handle, string $name, array $data ) use ( &$localized ): bool {
				$localized = $data;

				return true;
			}
		);
		$scripts = array();
		Functions\when( 'wp_enqueue_script' )->alias(
			static function ( string $handle, string $src = '', array $deps = array() ) use ( &$scripts ): void {
				$scripts[ $handle ] = $deps;
			}
		);
		$media = 0;
		Functions\when( 'wp_enqueue_media' )->alias(
			static function () use ( &$media ): void {
				++$media;
			}
		);

		Settings::enqueue_admin( 'settings_page_kaal-jyoti' );

		$appearance = 'appearance' === $tab;
		$this->assertSame( $appearance ? 1 : 0, $media );
		$this->assertSame( $appearance, isset( $scripts['wp-color-picker'] ) );
		$this->assertSame( $appearance ? array( 'jquery', 'wp-color-picker' ) : array( 'jquery' ), $scripts['kaal-jyoti-admin'] );
		$this->assertSame( $tab, $localized['tab'] );
		$this->assertNotEmpty( $localized['fields'] );
	}

	/**
	 * Nothing loads on another admin screen.
	 */
	public function test_the_admin_script_loads_on_the_settings_page_only(): void {
		Functions\expect( 'wp_enqueue_media' )->never();
		Functions\expect( 'wp_localize_script' )->never();
		Settings::enqueue_admin( 'edit.php' );
		$this->addToAssertionCount( 1 );
	}

	/**
	 * Links to a tab are the page's own URL with `tab`.
	 */
	public function test_tab_urls(): void {
		$this->assertSame(
			'https://example.test/wp-admin/options-general.php?page=kaal-jyoti&tab=appearance',
			Settings::tab_url( 'appearance' )
		);
		$this->assertStringEndsWith( 'tab=connection', Settings::tab_url( 'nope' ) );

		$index = Settings::search_index();
		$this->assertSame( count( array_unique( array_column( $index, 'label' ) ) ), count( $index ) );
		$this->assertContains( 'Google Maps API key (optional)', array_column( $index, 'label' ) );
	}

	/**
	 * Draws the page as an administrator, with the Settings API drawing
	 * markers in place of the fields.
	 *
	 * @param string|null $tab The tab whose sections are expected, or null for none.
	 * @return string The HTML.
	 */
	private function page( ?string $tab ): string {
		Functions\when( 'current_user_can' )->justReturn( true );
		// WordPress prints the errors above a Settings page itself; printing
		// them again here showed each one twice.
		Functions\expect( 'settings_errors' )->never();
		Functions\when( 'submit_button' )->alias(
			static function (): void {
				echo '<p class="submit">[submit]</p>';
			}
		);
		if ( null !== $tab ) {
			Functions\when( 'settings_fields' )->alias(
				static function ( string $group ): void {
					echo '[fields ' . $group . ']'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- A test marker.
				}
			);
			Functions\when( 'do_settings_sections' )->alias(
				static function ( string $page ): void {
					echo '[sections ' . $page . ']'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- A test marker.
				}
			);
		}

		ob_start();
		Settings::render_page();

		return (string) ob_get_clean();
	}
}
