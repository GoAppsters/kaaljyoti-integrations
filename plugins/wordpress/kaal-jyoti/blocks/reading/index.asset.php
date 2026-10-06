<?php // phpcs:disable WordPress.Files.FileName -- WordPress reads index.asset.php by exactly that name.
/**
 * Dependencies for this block's editor script.
 *
 * WordPress reads this file next to `index.js` when the block is registered
 * from `block.json`. Without it the script is enqueued with no dependencies
 * and runs before `wp.blocks` exists, so `registerBlockType` never runs and
 * the editor shows the block as unsupported.
 *
 * @package KaalJyoti
 */

defined( 'ABSPATH' ) || exit;

return array(
	'dependencies' => array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n' ),
	'version'      => defined( 'KAAL_JYOTI_VERSION' ) ? KAAL_JYOTI_VERSION : '0.1.0',
);
