<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The twenty-two shortcodes.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * One shortcode per element: `[kj_panchang]`, `[kj_muhurta]`, `[kj_chart]`,
 * `[kj_kundli_form]`, `[kj_match_form]`, `[kj_horoscope]` and `[kj_reading]`
 * from 0.1.0, and the revamp's `[kj_panchang_month]`, `[kj_calendar]`,
 * `[kj_transits]`, `[kj_ephemeris]`, `[kj_moon_sign]`, `[kj_lagna]`,
 * `[kj_manglik]`, `[kj_sade_sati]`, `[kj_dasha]`, `[kj_vargas]`, `[kj_kp]`,
 * `[kj_strength]`, `[kj_life_areas]`, `[kj_varshphal]` and
 * `[kj_vimshottari_reading]` — the element's tag with underscores.
 *
 * A shortcode's attribute names arrive lower-cased, and an editor typing one
 * into a post is as likely to write `show_degrees` as `show-degrees`, so an
 * underscore is read as a hyphen. Everything else — the whitelist, the rules,
 * the escaping — belongs to {@see Elements}.
 */
final class Shortcodes {

	/**
	 * Shortcode tag to element: `kj_` and the element's name, `-` as `_`.
	 *
	 * @return array<string, string> Every tag.
	 */
	public static function tags(): array {
		$tags = array();
		foreach ( Elements::ELEMENTS as $element ) {
			$tags[ 'kj_' . str_replace( '-', '_', $element ) ] = $element;
		}

		return $tags;
	}

	/**
	 * Registers all twenty-two.
	 *
	 * @return void
	 */
	public static function register(): void {
		foreach ( array_keys( self::tags() ) as $tag ) {
			add_shortcode( $tag, array( self::class, 'render' ) );
		}
	}

	/**
	 * Renders whichever one was written.
	 *
	 * @param array<string, mixed>|string $atts    The attributes, or an empty string when there are none.
	 * @param string|null                 $content The enclosed content, which none of these use.
	 * @param string                      $tag     The shortcode tag WordPress matched.
	 * @return string The markup.
	 */
	public static function render( $atts, ?string $content = null, string $tag = '' ): string {
		unset( $content );

		$element = self::tags()[ $tag ] ?? '';
		if ( '' === $element ) {
			return '';
		}

		return Elements::render( $element, self::normalize( is_array( $atts ) ? $atts : array() ) );
	}

	/**
	 * Shortcode attribute names, as the custom elements write them.
	 *
	 * @param array<string|int, mixed> $atts What WordPress parsed out of the shortcode.
	 * @return array<string, mixed> The same values under hyphenated names.
	 */
	public static function normalize( array $atts ): array {
		$normalised = array();

		foreach ( $atts as $key => $value ) {
			// A bare word in a shortcode arrives under a numeric key. It is a
			// flag written without a value — `[kj_kundli_form readings]` —
			// and is read as one; a word no element has is dropped later,
			// like any other unknown attribute.
			if ( ! is_string( $key ) ) {
				if ( is_string( $value ) && preg_match( '/^[a-z][a-z_-]*$/i', $value ) ) {
					$normalised[ str_replace( '_', '-', strtolower( $value ) ) ] = 'true';
				}
				continue;
			}

			$normalised[ str_replace( '_', '-', strtolower( $key ) ) ] = $value;
		}

		return $normalised;
	}
}
