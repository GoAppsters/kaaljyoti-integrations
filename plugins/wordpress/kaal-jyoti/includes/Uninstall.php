<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * What deleting the plugin removes.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * Removes the one option row and every transient the renderer wrote.
 *
 * Called from `uninstall.php`, which WordPress loads on its own with the
 * plugin itself unloaded — so nothing here may assume the autoloader, a hook,
 * or anything else the plugin normally sets up (design decision 8).
 */
final class Uninstall {

	/**
	 * The prefix on every transient this plugin writes.
	 *
	 * The same string as {@see Server\Renderer::CACHE_PREFIX}, written out
	 * again because the renderer is not loaded during an uninstall. The test
	 * suite asserts the two are equal.
	 */
	public const TRANSIENT_PREFIX = 'kaal_jyoti_';

	/**
	 * Deletes everything the plugin stored, on every site of a network.
	 *
	 * The plugin keeps its settings and transients per site, and on a
	 * multisite network it is deleted once, from the network admin, so each
	 * site is visited in turn: `switch_to_blog()` points `$wpdb->options` and
	 * the option API at that site's tables.
	 *
	 * @return void
	 */
	public static function run(): void {
		if ( ! is_multisite() ) {
			self::clean_site();

			return;
		}

		foreach ( get_sites(
			array(
				'fields' => 'ids',
				'number' => 0,
			)
		) as $site_id ) {
			switch_to_blog( (int) $site_id );
			self::clean_site();
			restore_current_blog();
		}
	}

	/**
	 * Deletes the current site's option row and transients.
	 *
	 * @return void
	 */
	private static function clean_site(): void {
		delete_option( Settings::OPTION );
		self::delete_transients();
	}

	/**
	 * Deletes the rendered-HTML transients by prefix.
	 *
	 * There is no API for "delete every transient starting with", so this is
	 * two `LIKE`s against the options table: the value rows and the
	 * `_transient_timeout_` rows that expire them. On a site with a persistent
	 * object cache the transients were never rows at all; they are not in this
	 * table, they expire on their own, and this query simply matches nothing.
	 *
	 * @return void
	 */
	private static function delete_transients(): void {
		global $wpdb;

		if ( ! is_object( $wpdb ) ) {
			return;
		}

		$values   = $wpdb->esc_like( '_transient_' . self::TRANSIENT_PREFIX ) . '%';
		$timeouts = $wpdb->esc_like( '_transient_timeout_' . self::TRANSIENT_PREFIX ) . '%';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- transients are rows and there is no API for deleting them by prefix; this runs once, while the plugin is being deleted.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				$values,
				$timeouts
			)
		);
	}
}
