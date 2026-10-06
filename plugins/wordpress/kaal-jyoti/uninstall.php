<?php
/**
 * Runs when the plugin is deleted from the Plugins screen.
 *
 * WordPress loads this file on its own, with the plugin unloaded: there is no
 * autoloader, no constant and no hook here, so the two classes it needs are
 * required by hand.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

// Nothing here may run on an ordinary request.
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/includes/Settings.php';
require_once __DIR__ . '/includes/Uninstall.php';

KaalJyoti\WP\Uninstall::run();
