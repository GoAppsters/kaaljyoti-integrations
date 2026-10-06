<?php
/**
 * What deleting the plugin takes with it.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Server\Renderer;
use KaalJyoti\WP\Settings;
use KaalJyoti\WP\Uninstall;
use PHPUnit\Framework\Attributes\CoversClass;

#[CoversClass( Uninstall::class )]
final class UninstallTest extends TestCase {

	/**
	 * Every option name `delete_option()` was given.
	 *
	 * @var string[]
	 */
	private array $deleted = array();

	/**
	 * Every query the fake `$wpdb` was asked to run.
	 *
	 * @var string[]
	 */
	private array $queries = array();

	/**
	 * A database that records rather than runs.
	 */
	protected function setUp(): void {
		parent::setUp();

		$this->deleted = array();
		$this->queries = array();

		$deleted = &$this->deleted;
		Functions\when( 'delete_option' )->alias(
			static function ( string $option ) use ( &$deleted ): bool {
				$deleted[] = $option;

				return true;
			}
		);

		$GLOBALS['wpdb'] = $this->given_wpdb();
		Functions\when( 'is_multisite' )->justReturn( false );
	}

	/**
	 * Leaves no global behind.
	 */
	protected function tearDown(): void {
		unset( $GLOBALS['wpdb'] );
		parent::tearDown();
	}

	/**
	 * The settings row goes.
	 */
	public function test_the_option_row_is_deleted(): void {
		Uninstall::run();

		$this->assertSame( array( Settings::OPTION ), $this->deleted );
		$this->assertSame( 'kaal_jyoti_settings', Settings::OPTION );
	}

	/**
	 * The disclaimer setting lives in that one row, so it goes with it: there
	 * is no second option to forget.
	 */
	public function test_the_disclaimer_goes_with_the_option_row(): void {
		$this->assertArrayHasKey( 'disclaimer', Settings::defaults() );
		$this->assertArrayHasKey( 'disclaimer_name', Settings::defaults() );
		$this->assertArrayHasKey( 'disclaimer_url', Settings::defaults() );

		Uninstall::run();

		$this->assertSame( array( Settings::OPTION ), $this->deleted );
	}

	/**
	 * …and so does every transient the renderer wrote, both rows of each.
	 */
	public function test_the_transients_are_deleted_by_prefix(): void {
		Uninstall::run();

		$this->assertCount( 1, $this->queries );
		$sql = $this->queries[0];

		$this->assertStringContainsString( 'DELETE FROM wp_options', $sql );
		// `esc_like()` escapes every underscore, which is why the names read
		// the way they do here.
		$this->assertStringContainsString( "LIKE '\\_transient\\_kaal\\_jyoti\\_%'", $sql );
		$this->assertStringContainsString( "LIKE '\\_transient\\_timeout\\_kaal\\_jyoti\\_%'", $sql );
	}

	/**
	 * The prefix written out here is the one the renderer writes with. Two
	 * places, one string, and this is what keeps them the same.
	 */
	public function test_the_prefix_matches_the_renderer(): void {
		$this->assertSame( Renderer::CACHE_PREFIX, Uninstall::TRANSIENT_PREFIX );
	}

	/**
	 * On a network, every site's row and transients go, each with that
	 * site's tables, and the current site is restored after each.
	 */
	public function test_every_site_of_a_network_is_cleaned(): void {
		Functions\when( 'is_multisite' )->justReturn( true );
		Functions\expect( 'get_sites' )->once()->with(
			array(
				'fields' => 'ids',
				'number' => 0,
			)
		)->andReturn( array( 1, '2', 5 ) );

		$switched = array();
		$restored = 0;
		$wpdb     = $GLOBALS['wpdb'];
		Functions\when( 'switch_to_blog' )->alias(
			static function ( int $site ) use ( &$switched, $wpdb ): bool {
				$switched[]    = $site;
				$wpdb->options = 1 === $site ? 'wp_options' : 'wp_' . $site . '_options';

				return true;
			}
		);
		Functions\when( 'restore_current_blog' )->alias(
			static function () use ( &$restored ): bool {
				++$restored;

				return true;
			}
		);

		Uninstall::run();

		$this->assertSame( array( 1, 2, 5 ), $switched );
		$this->assertSame( 3, $restored );
		$this->assertSame( array( Settings::OPTION, Settings::OPTION, Settings::OPTION ), $this->deleted );
		$this->assertCount( 3, $this->queries );
		$this->assertStringContainsString( 'DELETE FROM wp_options', $this->queries[0] );
		$this->assertStringContainsString( 'DELETE FROM wp_2_options', $this->queries[1] );
		$this->assertStringContainsString( 'DELETE FROM wp_5_options', $this->queries[2] );
	}

	/**
	 * A site with no `$wpdb` — which is only ever a test — is not a fatal.
	 */
	public function test_a_missing_database_is_survivable(): void {
		$GLOBALS['wpdb'] = null;

		Uninstall::run();

		$this->assertSame( array( Settings::OPTION ), $this->deleted );
		$this->assertSame( array(), $this->queries );
	}

	/**
	 * `wpdb`, as far as this needs one.
	 *
	 * @return object The stand-in.
	 */
	private function given_wpdb(): object {
		$queries = &$this->queries;

		return new class( $queries ) {
			/** The options table's name. */
			public string $options = 'wp_options';

			/**
			 * @param string[] $queries Where to record what was run.
			 */
			public function __construct( private array &$queries ) {
			}

			/**
			 * Escapes the `LIKE` wildcards, as the real one does.
			 *
			 * @param string $text The text.
			 * @return string The escaped text.
			 */
			public function esc_like( string $text ): string {
				return addcslashes( $text, '_%\\' );
			}

			/**
			 * Fills the placeholders in, quoted.
			 *
			 * @param string $sql  The statement.
			 * @param mixed  ...$values The values.
			 * @return string The statement.
			 */
			public function prepare( string $sql, ...$values ): string {
				foreach ( $values as $value ) {
					$sql = preg_replace( '/%s/', "'" . (string) $value . "'", $sql, 1 ) ?? $sql;
				}

				return $sql;
			}

			/**
			 * Records the statement.
			 *
			 * @param string $sql The statement.
			 * @return int The rows a real one would have deleted.
			 */
			public function query( string $sql ): int {
				$this->queries[] = $sql;

				return 0;
			}
		};
	}
}
