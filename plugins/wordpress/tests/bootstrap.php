<?php
/**
 * The test suite's bootstrap.
 *
 * There is no WordPress here: Brain Monkey answers the handful of WordPress
 * functions the plugin calls, and the two that run while the plugin file is
 * being required are defined below because they run before any test's
 * `setUp()`. The plugin file itself only registers its hooks when
 * `add_action()` exists, so requiring it here loads the constants and the
 * autoloader and nothing else.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

require_once dirname( __DIR__ ) . '/vendor/autoload.php';

define( 'ABSPATH', dirname( __DIR__ ) . '/kaaljyoti/' );
define( 'WPINC', 'wp-includes' );

if ( ! function_exists( 'plugin_dir_path' ) ) {
	/**
	 * The directory a plugin file lives in, with a trailing slash.
	 *
	 * @param string $file A file inside the plugin.
	 * @return string The directory.
	 */
	function plugin_dir_path( string $file ): string {
		return rtrim( dirname( $file ), '/\\' ) . '/';
	}
}

if ( ! function_exists( 'plugin_dir_url' ) ) {
	/**
	 * The URL a plugin's files are served from. Fixed, so assertions can name it.
	 *
	 * @param string $file A file inside the plugin.
	 * @return string The URL, with a trailing slash.
	 */
	function plugin_dir_url( string $file ): string {
		unset( $file );

		return 'https://example.test/wp-content/plugins/kaaljyoti/';
	}
}

if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}

if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 3600 );
}

if ( ! defined( 'DAY_IN_SECONDS' ) ) {
	define( 'DAY_IN_SECONDS', 86400 );
}

require_once __DIR__ . '/Support/WpRest.php';
require_once dirname( __DIR__ ) . '/kaaljyoti/kaaljyoti.php';
