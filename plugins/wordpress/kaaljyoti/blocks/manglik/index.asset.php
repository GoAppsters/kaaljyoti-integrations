<?php // phpcs:disable WordPress.Files.FileName -- WordPress reads index.asset.php by exactly that name.
/**
 * Dependencies for this block's editor script: the plugin's block kit, which
 * itself depends on the editor's own packages.
 *
 * @package KaalJyoti
 */

defined( 'ABSPATH' ) || exit;

return array(
	'dependencies' => array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n', 'kaal-jyoti-block-kit' ),
	'version'      => defined( 'KAAL_JYOTI_VERSION' ) ? KAAL_JYOTI_VERSION : '0.1.0',
);
