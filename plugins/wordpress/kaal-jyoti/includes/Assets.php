<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The bundled widget script and the plugin's stylesheet.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the assets, and enqueues them only where a widget is used.
 *
 * `v1.js` is the widget loader copied into the plugin at build time, never
 * loaded from a CDN (design decision 1), with the element chunks it loads
 * beside it in `assets/widgets/` (`kj-*.js`, content-hashed). It finds them
 * from the `data-chunks` URL on its tag, so an optimisation plugin that
 * moves or combines scripts does not break the chunk URLs. It reads its configuration from its
 * own script tag, so the publishable key, the language and the "Powered by"
 * choice are added to that tag through `script_loader_tag` rather than
 * through an inline script (design decision 4).
 *
 * The place search settings ride on the same tag — the Google Maps key as
 * `data-google-maps-key`, a provider other than `auto` as
 * `data-place-provider`, a self-hosted Photon as `data-photon-url` — so
 * every birth and match form the plugin renders, shortcode or block, searches
 * the same way.
 *
 * The sign icons ride on the tag too: `data-sign-icons`, a theme name or
 * the site's own images as a JSON map.
 *
 * The appearance settings reach the page two ways: the theme as `data-theme`
 * on that same tag, and the colour, font and radius overrides as one inline
 * style attached to the plugin stylesheet, so it is printed once, right after
 * it, and only on a page the stylesheet is on.
 */
final class Assets {

	/** The widget bundle's handle. */
	public const SCRIPT_HANDLE = 'kaal-jyoti-widgets';

	/** The plugin stylesheet's handle. */
	public const STYLE_HANDLE = 'kaal-jyoti';

	/** What the overrides are scoped to: the twenty-two elements and the server markup. */
	public const THEME_SELECTOR = 'kj-panchang, kj-muhurta, kj-chart, kj-kundli-form, kj-match-form, kj-horoscope, kj-reading, kj-panchang-month, kj-calendar, kj-transits, kj-ephemeris, kj-moon-sign, kj-lagna, kj-manglik, kj-sade-sati, kj-dasha, kj-vargas, kj-kp, kj-strength, kj-life-areas, kj-varshphal, kj-vimshottari-reading, .kj-server';

	/**
	 * Registers the front-end hooks.
	 *
	 * @return void
	 */
	public static function hooks(): void {
		add_action( 'wp_enqueue_scripts', array( self::class, 'register' ) );
		add_filter( 'script_loader_tag', array( self::class, 'script_attributes' ), 10, 2 );
	}

	/**
	 * The `ver` a browser caches an asset under: the plugin version plus a
	 * short hash of the file. The loader names its chunks by content hash, so
	 * a loader cached from an older build would ask for chunks that no longer
	 * exist; versioning it by its own bytes makes every rebuild a new URL.
	 *
	 * @param string $relative Path under the plugin folder.
	 * @return string
	 */
	public static function asset_version( string $relative ): string {
		$file = KAAL_JYOTI_DIR . $relative;
		$hash = is_readable( $file ) ? md5_file( $file ) : false;
		return false === $hash ? KAAL_JYOTI_VERSION : KAAL_JYOTI_VERSION . '-' . substr( $hash, 0, 8 );
	}

	/**
	 * Registers the bundle and the stylesheet without enqueueing either.
	 *
	 * @return void
	 */
	public static function register(): void {
		wp_register_script(
			self::SCRIPT_HANDLE,
			KAAL_JYOTI_URL . 'assets/widgets/v1.js',
			array(),
			self::asset_version( 'assets/widgets/v1.js' ),
			array(
				'in_footer' => false,
				'strategy'  => 'defer',
			)
		);

		wp_register_style(
			self::STYLE_HANDLE,
			KAAL_JYOTI_URL . 'assets/kaal-jyoti.css',
			array(),
			self::asset_version( 'assets/kaal-jyoti.css' )
		);

		// Attached to the registration, so it rides along with the stylesheet
		// wherever and whenever that is enqueued, and is never printed twice.
		$css = self::theme_css();
		if ( '' !== $css ) {
			wp_add_inline_style( self::STYLE_HANDLE, $css );
		}
	}

	/**
	 * The appearance overrides as one CSS rule.
	 *
	 * Only the properties a site has set are written, so an empty field keeps
	 * the theme's own value. Every value is re-checked here rather than
	 * trusted from the option row: a colour must still be a hex colour, the
	 * font is sanitised again and the radius is an integer.
	 *
	 * @return string The rule, or an empty string when nothing is overridden.
	 */
	public static function theme_css(): string {
		$declarations = array();

		foreach ( Settings::COLOR_PROPERTIES as $key => $properties ) {
			$color = Settings::sanitize_color( Settings::get( $key ) );
			if ( '' === $color ) {
				continue;
			}
			foreach ( $properties as $property ) {
				$declarations[] = $property . ': ' . $color;
			}
		}

		$font = Settings::sanitize_font( (string) Settings::get( 'font' ) );
		if ( '' !== $font ) {
			$declarations[] = '--kj-font: ' . $font;
		}

		$radius = Settings::sanitize_radius( Settings::get( 'radius' ) );
		if ( '' !== $radius ) {
			$declarations[] = '--kj-radius: ' . (int) $radius . 'px';
		}

		if ( array() === $declarations ) {
			return '';
		}

		return self::THEME_SELECTOR . ' { ' . implode( '; ', $declarations ) . '; }';
	}

	/**
	 * Enqueues the bundle. Called from the markup path, not from a page hook.
	 *
	 * @return void
	 */
	public static function enqueue_widgets(): void {
		if ( ! wp_script_is( self::SCRIPT_HANDLE, 'registered' ) ) {
			self::register();
		}

		wp_enqueue_script( self::SCRIPT_HANDLE );
		wp_enqueue_style( self::STYLE_HANDLE );
	}

	/**
	 * Enqueues the stylesheet on its own.
	 *
	 * Server-rendered markup needs the stylesheet and nothing else: the whole
	 * point of that mode is a page with no widget bundle on it.
	 *
	 * @return void
	 */
	public static function enqueue_style(): void {
		if ( ! wp_style_is( self::STYLE_HANDLE, 'registered' ) ) {
			self::register();
		}

		wp_enqueue_style( self::STYLE_HANDLE );
	}

	/**
	 * The directory the widget loader and its chunks are served from.
	 *
	 * @return string An absolute URL ending in a slash.
	 */
	public static function chunk_base(): string {
		return KAAL_JYOTI_URL . 'assets/widgets/';
	}

	/**
	 * Adds the bundle's `data-*` configuration to its own script tag.
	 *
	 * `data-base` is left off on production, so the common tag is the short
	 * one and a site pointed elsewhere by the `KAAL_JYOTI_API_BASE` constant
	 * is visibly different.
	 *
	 * @param string $tag    The `<script>` tag WordPress built.
	 * @param string $handle The handle that tag belongs to.
	 * @return string The tag, with our attributes when it is ours.
	 */
	public static function script_attributes( string $tag, string $handle ): string {
		if ( self::SCRIPT_HANDLE !== $handle ) {
			return $tag;
		}

		$attributes = sprintf(
			' data-key="%s" data-lang="%s" data-powered-by="%s"',
			esc_attr( (string) Settings::get( 'publishable_key' ) ),
			esc_attr( (string) Settings::get( 'language' ) ),
			esc_attr( (string) Settings::get( 'powered_by' ) )
		);

		$theme = Settings::theme();
		if ( 'auto' !== $theme ) {
			$attributes .= sprintf( ' data-theme="%s"', esc_attr( $theme ) );
		}

		$preset = Settings::preset();
		if ( 'classic' !== $preset ) {
			$attributes .= sprintf( ' data-preset="%s"', esc_attr( $preset ) );
		}

		// The birth forms: 24-hour time, and not remembering the last entry,
		// are the two answers that differ from the bundle's own.
		if ( '24' === Settings::time_format() ) {
			$attributes .= ' data-time-format="24"';
		}
		if ( ! Settings::get( 'remember' ) ) {
			$attributes .= ' data-remember="off"';
		}
		if ( 'inherit' === Settings::font_mode() ) {
			$attributes .= ' data-font="inherit"';
		}

		// The zodiac sign icons: a theme other than the bundle's default, or
		// the site's own images as a JSON map of sign to URL (https, or a path
		// on this site — the bundle loads nothing else, and draws each as an
		// <img>, never inlined).
		$icons = Settings::sign_icons_attribute();
		if ( null !== $icons ) {
			$attributes .= sprintf( ' data-sign-icons="%s"', esc_attr( $icons ) );
		}

		$pricing = Elements::disclaimer_url( (string) Settings::get( 'pricing_url' ) );
		if ( null !== $pricing ) {
			$attributes .= sprintf( ' data-pricing-url="%s"', esc_attr( esc_url( $pricing ) ) );
		}

		// The server proxy (widgets decision 23): its URL, with a nonce, only
		// when a secret key is stored and the proxy is on. The month widgets
		// then go through it, so this site caches each month; without it they
		// call the API with the publishable key like every other widget. PDFs
		// always need it. The key itself is never written anywhere on the page.
		if ( Proxy::enabled() ) {
			$attributes .= sprintf( ' data-proxy="%s"', esc_attr( esc_url( Proxy::url() ) ) );

			$editions = Proxy::pdf_editions();
			if ( array() !== $editions ) {
				$attributes .= sprintf( ' data-pdf="%s"', esc_attr( implode( ' ', $editions ) ) );
			}
		}
		$docs        = Elements::disclaimer_url( (string) Settings::get( 'proxy_docs_url' ) ) ?? Settings::DOCS_URL . '#proxy';
		$attributes .= sprintf( ' data-proxy-docs="%s"', esc_attr( esc_url( $docs ) ) );

		// Where the loader's element chunks are: next to it, whatever URL a
		// caching or optimisation plugin later gives the loader itself.
		$attributes .= sprintf( ' data-chunks="%s"', esc_url( self::chunk_base() ) );

		// The place search in the birth and match forms: Google Places with the
		// site's own key, else Photon, unless the site chose otherwise.
		$google = (string) Settings::get( 'google_maps_key' );
		if ( '' !== $google && Settings::is_google_maps_key( $google ) ) {
			$attributes .= sprintf( ' data-google-maps-key="%s"', esc_attr( $google ) );
		}

		$provider = Settings::place_provider();
		if ( 'auto' !== $provider ) {
			$attributes .= sprintf( ' data-place-provider="%s"', esc_attr( $provider ) );
		}

		$photon = Settings::normalize_photon_url( (string) Settings::get( 'photon_url' ) );
		if ( null !== $photon && Settings::PHOTON_URL !== $photon ) {
			$attributes .= sprintf( ' data-photon-url="%s"', esc_attr( esc_url( $photon ) ) );
		}

		$base = Settings::api_base();
		if ( Settings::PRODUCTION_BASE_URL !== $base ) {
			$attributes .= sprintf( ' data-base="%s"', esc_attr( $base ) );
		}

		$position = strpos( $tag, '<script' );
		if ( false === $position ) {
			return $tag;
		}

		return substr_replace( $tag, '<script' . $attributes, $position, strlen( '<script' ) );
	}
}
