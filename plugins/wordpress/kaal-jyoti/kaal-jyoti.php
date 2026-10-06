<?php
/**
 * Plugin Name:       Kaal Jyoti
 * Plugin URI:        https://kaaljyoti.com/api/docs/wordpress
 * Description:       Twenty-two Vedic astrology widgets from the Kaal Jyoti API — panchang, kundli, match, calculators, horoscopes and readings — as blocks and shortcodes.
 * Version:           0.1.0
 * Requires at least: 6.5
 * Requires PHP:      8.2
 * Author:            GoAppsters
 * Author URI:        https://goappsters.in
 * License:           MIT
 * License URI:       https://opensource.org/license/mit
 * Text Domain:       kaal-jyoti
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

defined( 'ABSPATH' ) || exit;

define( 'KAAL_JYOTI_VERSION', '0.1.0' );
define( 'KAAL_JYOTI_FILE', __FILE__ );
define( 'KAAL_JYOTI_DIR', plugin_dir_path( __FILE__ ) );
define( 'KAAL_JYOTI_URL', plugin_dir_url( __FILE__ ) );

/**
 * Loads the plugin's own classes from `includes/`.
 *
 * PSR-4 for `KaalJyoti\WP\`: the file is named for the class, so
 * `KaalJyoti\WP\Server\Renderer` lives in `includes/Server/Renderer.php`. Only
 * this plugin's namespace is answered, and a missing file is left alone so
 * `class_exists()` on a class a later version adds stays false rather than
 * fatal.
 *
 * @param string $class_name The fully qualified class name PHP is looking for.
 * @return void
 */
function kaal_jyoti_autoload( string $class_name ): void {
	$prefix = 'KaalJyoti\\WP\\';
	if ( ! str_starts_with( $class_name, $prefix ) ) {
		return;
	}

	$relative = substr( $class_name, strlen( $prefix ) );
	$path     = KAAL_JYOTI_DIR . 'includes/' . str_replace( '\\', '/', $relative ) . '.php';

	if ( is_readable( $path ) ) {
		require_once $path;
	}
}

spl_autoload_register( 'kaal_jyoti_autoload' );

/**
 * Loads the bundled PHP SDK, unless the site already has one.
 *
 * `tool/build.mjs` copies `packages/sdk-php/src` in and writes the autoloader
 * beside it; a site whose own Composer tree already provides `Kaaljyoti\Client`
 * keeps that copy (design decision 1).
 *
 * @return void
 */
function kaal_jyoti_load_sdk(): void {
	if ( class_exists( 'Kaaljyoti\\Client', false ) ) {
		return;
	}

	$autoload = KAAL_JYOTI_DIR . 'vendor/kaaljyoti-sdk/autoload.php';
	if ( is_readable( $autoload ) ) {
		require_once $autoload;
	}
}

kaal_jyoti_load_sdk();

// The hooks, and only the hooks, need WordPress: requiring this file from the
// test suite loads the constants and the autoloader and stops here.
if ( function_exists( 'add_action' ) ) {
	add_action(
		'plugins_loaded',
		static function (): void {
			KaalJyoti\WP\Plugin::instance()->boot();
		}
	);
}
