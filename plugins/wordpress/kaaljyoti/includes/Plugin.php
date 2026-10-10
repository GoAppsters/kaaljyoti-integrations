<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The plugin's one entry point.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * Wires the pieces together on `plugins_loaded`.
 *
 * Everything the plugin does hangs off one call: the settings page and its
 * connection test, the asset registration, the server proxy, the shortcodes,
 * and the block registration. Each piece registers its own
 * hooks, so this class stays a list.
 */
final class Plugin {

	/**
	 * The one instance.
	 *
	 * @var Plugin|null
	 */
	private static ?Plugin $instance = null;

	/**
	 * Whether {@see boot()} has already run.
	 *
	 * @var bool
	 */
	private bool $booted = false;

	/**
	 * Not constructed from outside; {@see instance()} is the way in.
	 */
	private function __construct() {
	}

	/**
	 * The one instance.
	 *
	 * @return Plugin The singleton.
	 */
	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Registers every hook the plugin owns. Safe to call twice.
	 *
	 * `Blocks` and the server renderer are added by a later version of the
	 * plugin; `class_exists()` keeps this file working before and after.
	 *
	 * @return void
	 */
	public function boot(): void {
		if ( $this->booted ) {
			return;
		}
		$this->booted = true;

		Settings::hooks();
		Assets::hooks();
		Proxy::hooks();
		Shortcodes::register();

		if ( class_exists( Blocks::class ) ) {
			Blocks::register();
		}
	}
}
