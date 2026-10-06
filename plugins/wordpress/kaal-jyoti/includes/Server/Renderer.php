<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * Panchang, muhurta, chart, horoscope and reading HTML drawn on this site,
 * through the PHP SDK.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Server;

use Kaaljyoti\Client;
use Kaaljyoti\Generated\LabelledId;
use Kaaljyoti\Http\TransportException;
use Kaaljyoti\KaaljyotiException;
use Kaaljyoti\Models\Birth;
use Kaaljyoti\Models\CalculationOptions;
use Kaaljyoti\Models\DailyPanchangDocument;
use Kaaljyoti\Models\Disclaimer;
use Kaaljyoti\Models\HoroscopeRequest;
use Kaaljyoti\Models\AreaSummary;
use Kaaljyoti\Models\HoroscopeDocument;
use Kaaljyoti\Models\HoroscopeTransit;
use Kaaljyoti\Models\KundliChartRequest;
use Kaaljyoti\Models\LocalizedText;
use Kaaljyoti\Models\Meta;
use Kaaljyoti\Models\PanchangRequest;
use Kaaljyoti\Models\ReadingSummary;
use Kaaljyoti\Models\ReportLagnaRequest;
use Kaaljyoti\Models\ReportNakshatraRequest;
use Kaaljyoti\Models\TimeWindow;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Elements;
use KaalJyoti\WP\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Server rendering: the same rows the widget shows, drawn here and cached.
 *
 * `Elements` calls this when the render mode is `server`, and reads the answer
 * as three states (design decision 5):
 *
 *   * **a string** — the HTML to print;
 *   * **`null`** — "I could not, fall back to the browser widget", which is
 *     the right answer whenever a publishable key exists, because a visitor
 *     then still sees a panchang;
 *   * **`''`** — nothing at all, for a visitor on a site with no publishable
 *     key to fall back to. Someone who could fix it gets a line saying which
 *     error code came back.
 *
 * Five endpoints are ever called: `POST /v1/panchang` for both the panchang
 * and the muhurta strip — they are the same document, so the same call and
 * the same cache entry serve both, exactly as the widget's decision 4 has it —
 * `POST /v1/kundli/chart` as SVG, `POST /v1/horoscope` for a horoscope with
 * its sign chosen, and `POST /v1/reports/lagna` or `/v1/reports/nakshatra`
 * for a reading with its sign or nakshatra chosen. A horoscope or a reading
 * that lets the visitor pick, and a reading of a birth — every personal
 * reading is one — are left to the browser: static HTML cannot hold a picker.
 * Nothing heavy is reachable from a page.
 *
 * Wall clocks are sliced, never parsed. Every string in a response is a local
 * clock at the place with no zone on it, so `strtotime()` would read it in the
 * *server's* zone and move a Delhi sunrise by hours while still looking
 * plausible. `substr( $wall, 11, 5 )` cannot be wrong by a zone it never knows
 * about (the SDK's design decision 7). The horoscope's instants are the one
 * exception: they are UTC with a `Z` on them, so they are parsed, and moved
 * into the zone the answer's `meta.timezone` names.
 *
 * The theme is not part of the cache: the same drawing serves every theme,
 * and `data-theme` is written onto the container as it leaves, so a light and
 * a dark card of the same day are still one call.
 */
final class Renderer {

	/** Every transient this plugin writes starts with this. @see uninstall.php */
	public const CACHE_PREFIX = 'kaal_jyoti_';

	/** Where the footer link goes. */
	private const POWERED_BY_URL = 'https://kaaljyoti.com/api?utm_source=wordpress';

	/** What a formatter renders when the API sent nothing. */
	private const EMPTY_VALUE = '—';

	/**
	 * What an inlined chart's own `:root` defaults are rewritten to.
	 *
	 * `:where()` has no specificity, so the plugin stylesheet's palette and a
	 * site's overrides both beat these, and they only fill in what neither
	 * declares.
	 */
	public const SVG_ROOT_SCOPE = ':where(.kj-server-chart)';

	/**
	 * What a drawn chart may contain, for `wp_kses()`: the elements and
	 * attributes the API's chart writer uses (`svg`, `title`, `style`, the
	 * four shapes, `text` and `tspan`), and nothing that can run or link.
	 * Names are lower case, as kses compares them ({@see kses_svg()}).
	 */
	public const SVG_ALLOWED = array(
		'svg'     => array(
			'xmlns'      => true,
			'viewbox'    => true,
			'width'      => true,
			'height'     => true,
			'role'       => true,
			'class'      => true,
			'aria-label' => true,
		),
		'title'   => array(),
		'style'   => array(),
		'rect'    => array(
			'x'            => true,
			'y'            => true,
			'width'        => true,
			'height'       => true,
			'class'        => true,
			'fill'         => true,
			'fill-opacity' => true,
			'stroke'       => true,
			'stroke-width' => true,
		),
		'line'    => array(
			'x1'           => true,
			'y1'           => true,
			'x2'           => true,
			'y2'           => true,
			'class'        => true,
			'fill'         => true,
			'fill-opacity' => true,
			'stroke'       => true,
			'stroke-width' => true,
		),
		'polygon' => array(
			'points'       => true,
			'class'        => true,
			'fill'         => true,
			'fill-opacity' => true,
			'stroke'       => true,
			'stroke-width' => true,
		),
		'circle'  => array(
			'cx'           => true,
			'cy'           => true,
			'r'            => true,
			'class'        => true,
			'fill'         => true,
			'fill-opacity' => true,
			'stroke'       => true,
			'stroke-width' => true,
		),
		'text'    => array(
			'x'           => true,
			'y'           => true,
			'font-size'   => true,
			'font-weight' => true,
			'text-anchor' => true,
			'xml:space'   => true,
			'class'       => true,
			'fill'        => true,
		),
		'tspan'   => array(
			'class'       => true,
			'fill'        => true,
			'font-size'   => true,
			'font-weight' => true,
		),
	);

	/** The deadline for one attempt, in seconds. A page is waiting on this. */
	private const TIMEOUT_SECONDS = 10.0;

	/**
	 * The chrome, in the two languages the widgets speak.
	 *
	 * Not `__()`: a `lang="hi"` shortcode on an English site must render
	 * Hindi, and gettext answers for the *site's* locale, not for the
	 * attribute's. This is the same table the widget bundle carries, so both
	 * render modes read alike.
	 *
	 * Entity names come from the response, never from here: every one is a
	 * `LabelledId` — the nakshatra and the lagna sign, and the panchang's own
	 * `tithi_name`, `yoga_name`, `karana_name`, `paksha`, `vara` and
	 * `masa.month_name` — and {@see name_of()} reads `names.hi` from it. Only
	 * the `Adhik` of a leap month is ours, since the API says that with a flag.
	 *
	 * @var array<string, array<string, string>>
	 */
	private const LABELS = array(
		'tithi'          => array(
			'en' => 'Tithi',
			'hi' => 'तिथि',
		),
		'nakshatra'      => array(
			'en' => 'Nakshatra',
			'hi' => 'नक्षत्र',
		),
		'yoga'           => array(
			'en' => 'Yoga',
			'hi' => 'योग',
		),
		'karana'         => array(
			'en' => 'Karana',
			'hi' => 'करण',
		),
		'sunrise'        => array(
			'en' => 'Sunrise',
			'hi' => 'सूर्योदय',
		),
		'sunset'         => array(
			'en' => 'Sunset',
			'hi' => 'सूर्यास्त',
		),
		'masa'           => array(
			'en' => 'Masa',
			'hi' => 'मास',
		),
		'pada'           => array(
			'en' => 'Pada',
			'hi' => 'पाद',
		),
		'vikram_samvat'  => array(
			'en' => 'Vikram Samvat',
			'hi' => 'विक्रम संवत्',
		),
		'adhik'          => array(
			'en' => 'Adhik',
			'hi' => 'अधिक',
		),
		'disha_shool'    => array(
			'en' => 'Disha shool',
			'hi' => 'दिशा शूल',
		),
		'rahu_kaal'      => array(
			'en' => 'Rahu kaal',
			'hi' => 'राहु काल',
		),
		'yamaganda'      => array(
			'en' => 'Yamaganda',
			'hi' => 'यमगण्ड',
		),
		'gulika_kaal'    => array(
			'en' => 'Gulika kaal',
			'hi' => 'गुलिक काल',
		),
		'abhijit'        => array(
			'en' => 'Abhijit muhurta',
			'hi' => 'अभिजित मुहूर्त',
		),
		'brahma_muhurta' => array(
			'en' => 'Brahma muhurta',
			'hi' => 'ब्रह्म मुहूर्त',
		),
		'until'          => array(
			'en' => 'until',
			'hi' => 'तक',
		),
		'then'           => array(
			'en' => 'then',
			'hi' => 'फिर',
		),
		'tomorrow'       => array(
			'en' => 'tomorrow',
			'hi' => 'कल',
		),
		'powered_by'     => array(
			'en' => 'Powered by Kaal Jyoti',
			'hi' => 'काल ज्योति द्वारा',
		),
		'daily'          => array(
			'en' => 'Daily horoscope',
			'hi' => 'दैनिक राशिफल',
		),
		'weekly'         => array(
			'en' => 'Weekly horoscope',
			'hi' => 'साप्ताहिक राशिफल',
		),
		'monthly'        => array(
			'en' => 'Monthly horoscope',
			'hi' => 'मासिक राशिफल',
		),
		'yearly'         => array(
			'en' => 'Yearly horoscope',
			'hi' => 'वार्षिक राशिफल',
		),
		'retrograde'     => array(
			'en' => 'retrograde',
			'hi' => 'वक्री',
		),
		'from'           => array(
			'en' => 'from',
			'hi' => 'से',
		),
		'lagna'          => array(
			'en' => 'lagna',
			'hi' => 'लग्न',
		),
		'nakshatra_word' => array(
			'en' => 'nakshatra',
			'hi' => 'नक्षत्र',
		),
		'work'           => array(
			'en' => 'Work',
			'hi' => 'कार्य',
		),
		'money'          => array(
			'en' => 'Money',
			'hi' => 'धन',
		),
		'relationships'  => array(
			'en' => 'Relationships',
			'hi' => 'संबंध',
		),
		'health'         => array(
			'en' => 'Health',
			'hi' => 'स्वास्थ्य',
		),
		'education'      => array(
			'en' => 'Education',
			'hi' => 'शिक्षा',
		),
		'favourable'     => array(
			'en' => 'Favourable',
			'hi' => 'अनुकूल',
		),
		'mixed'          => array(
			'en' => 'Mixed',
			'hi' => 'मिश्रित',
		),
		'care'           => array(
			'en' => 'Needs care',
			'hi' => 'सावधानी',
		),
		'basis'          => array(
			'en' => 'Transits behind this',
			'hi' => 'इसके आधार गोचर',
		),
		'is_favourable'  => array(
			'en' => 'favourable',
			'hi' => 'शुभ',
		),
		'unfavourable'   => array(
			'en' => 'unfavourable',
			'hi' => 'अशुभ',
		),
	);

	/**
	 * The twelve houses as Hindi ordinals, first to twelfth.
	 *
	 * @var string[]
	 */
	private const HOUSES_HI = array( 'प्रथम', 'द्वितीय', 'तृतीय', 'चतुर्थ', 'पंचम', 'षष्ठ', 'सप्तम', 'अष्टम', 'नवम', 'दशम', 'एकादश', 'द्वादश' );

	/**
	 * The three tones a summary can have, as the API writes them.
	 *
	 * @var string[]
	 */
	private const LEVELS = array( 'favourable', 'mixed', 'care' );

	/**
	 * The eight directions `disha_shool` names, as the engine writes them.
	 *
	 * @var array<string, array<string, string>>
	 */
	private const DIRECTIONS = array(
		'north'      => array(
			'en' => 'North',
			'hi' => 'उत्तर',
		),
		'north-east' => array(
			'en' => 'North-east',
			'hi' => 'उत्तर-पूर्व',
		),
		'east'       => array(
			'en' => 'East',
			'hi' => 'पूर्व',
		),
		'south-east' => array(
			'en' => 'South-east',
			'hi' => 'दक्षिण-पूर्व',
		),
		'south'      => array(
			'en' => 'South',
			'hi' => 'दक्षिण',
		),
		'south-west' => array(
			'en' => 'South-west',
			'hi' => 'दक्षिण-पश्चिम',
		),
		'west'       => array(
			'en' => 'West',
			'hi' => 'पश्चिम',
		),
		'north-west' => array(
			'en' => 'North-west',
			'hi' => 'उत्तर-पश्चिम',
		),
	);

	/**
	 * Month names for the card's date line.
	 *
	 * @var array<string, string[]>
	 */
	private const MONTHS = array(
		'en' => array( 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ),
		'hi' => array( 'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्तूबर', 'नवंबर', 'दिसंबर' ),
	);

	/**
	 * The client to call the API with, when something has set one.
	 *
	 * The seam a test uses: a {@see Client} built on a fake HTTP client
	 * answers from a fixture, and the cache tests set one that fails if it is
	 * called at all. Nothing in the plugin writes it.
	 *
	 * @var Client|null
	 */
	private static ?Client $client = null;

	/**
	 * Sets, or clears, the client this renderer calls the API with.
	 *
	 * @param Client|null $client A client, or null to go back to building one from the settings.
	 * @return void
	 */
	public static function set_client( ?Client $client ): void {
		self::$client = $client;
	}

	/**
	 * One element, drawn here.
	 *
	 * @param string                $element `panchang`, `muhurta`, `chart`, `horoscope` or `reading`; the forms are browser-only.
	 * @param array<string, string> $atts    The attributes {@see \KaalJyoti\WP\Elements} already sanitised.
	 * @return string|null The HTML, `null` to fall back to the browser widget, or `''` for nothing.
	 */
	public static function render( string $element, array $atts ): ?string {
		if ( ! in_array( $element, array( 'panchang', 'muhurta', 'chart', 'horoscope', 'reading' ), true ) ) {
			return null;
		}

		// A horoscope with no sign is the sign picker, and a reading with no
		// sign or nakshatra chosen is a picker or a birth: both are the
		// browser's to draw, and not a failure.
		if ( ( 'horoscope' === $element && ! isset( $atts['sign'] ) ) || ( 'reading' === $element && null === self::reading_preset( $atts ) ) ) {
			return null;
		}

		// The SDK is copied in by the build. A plugin directory without it is
		// a broken install rather than a failed call, and it must not fatal.
		if ( ! class_exists( Client::class ) ) {
			return self::failure( 'sdk_missing' );
		}

		$lang    = ( isset( $atts['lang'] ) && 'hi' === $atts['lang'] ) ? 'hi' : 'en';
		$request = self::request( $element, $atts, $lang );

		if ( null === $request ) {
			return self::failure( 'chart' === $element ? 'no_birth' : 'no_place' );
		}

		$key    = self::cache_key( $element, $request->toArray(), $lang );
		$cached = get_transient( $key );

		$theme = ( isset( $atts['theme'] ) && in_array( $atts['theme'], Settings::THEMES, true ) ) ? (string) $atts['theme'] : 'auto';

		if ( is_string( $cached ) && '' !== $cached ) {
			Assets::enqueue_style();

			// Scoped again on the way out: an entry cached by an earlier
			// version still carries the drawing's page-wide `:root` rule.
			return self::with_theme( self::scope_svg_styles( $cached ), $theme );
		}

		$client = self::client();
		if ( null === $client ) {
			return self::failure( 'invalid_key' );
		}

		try {
			if ( $request instanceof KundliChartRequest ) {
				$answer = $client->kundli->chartSvg( $request );
				$html   = self::chart_html( (string) $answer->data, $atts, $lang, $answer->plan );
			} elseif ( $request instanceof HoroscopeRequest ) {
				$answer = $client->horoscope( $request );
				$html   = self::horoscope_html( $answer->data, $answer->meta, $atts, $lang, $answer->plan );
			} elseif ( $request instanceof ReportLagnaRequest ) {
				$answer  = $client->reports->lagna( $request );
				$reading = $answer->data->lagna;
				$html    = null === $reading ? '' : self::reading_html(
					trim( self::name_of( $reading->sign, $lang ) . ' ' . self::label( 'lagna', $lang ) ),
					$reading->entry->text,
					$answer->data->disclaimer,
					$atts,
					$lang,
					$answer->plan
				);
			} elseif ( $request instanceof ReportNakshatraRequest ) {
				$answer  = $client->reports->nakshatra( $request );
				$reading = $answer->data->nakshatra;
				$html    = null === $reading ? '' : self::reading_html(
					trim( self::name_of( $reading->nakshatra, $lang ) . ' ' . self::label( 'nakshatra_word', $lang ) ),
					$reading->entry->text,
					$answer->data->disclaimer,
					$atts,
					$lang,
					$answer->plan
				);
			} else {
				$answer = $client->panchang->daily( $request );
				$html   = self::panchang_html( $element, $answer->data, $atts, $lang, $answer->plan );
			}
		} catch ( KaaljyotiException $error ) {
			return self::failure( $error->code() );
		} catch ( TransportException $error ) {
			// The SDK's transport turns these into a KaaljyotiException, so
			// this only catches one thrown by a client of our own making.
			return self::failure( 'network_error' );
		}

		if ( '' === $html ) {
			return self::failure( 'empty_answer' );
		}

		set_transient( $key, $html, self::cache_seconds() );
		Assets::enqueue_style();

		return self::with_theme( $html, $theme );
	}

	/**
	 * Writes `data-theme` onto the container, for `light` and `dark`.
	 *
	 * `auto` is the stylesheet's default and is left unwritten, the same way
	 * the elements and the script tag leave it off.
	 *
	 * @param string $html  The rendered markup.
	 * @param string $theme `auto`, `light` or `dark`.
	 * @return string The markup.
	 */
	public static function with_theme( string $html, string $theme ): string {
		if ( ! in_array( $theme, array( 'light', 'dark' ), true ) ) {
			return $html;
		}

		return (string) preg_replace(
			'/^<div class="kj-server([^"]*)"/',
			'<div class="kj-server$1" data-theme="' . esc_attr( $theme ) . '"',
			$html,
			1
		);
	}

	/**
	 * Scopes the `:root` rules of any `<style>` element to the chart container.
	 *
	 * The API's SVG is a standalone document, so it declares its palette on
	 * `:root`. Inlined into a page, that selector is the page's `<html>`, and
	 * the drawing would set `--kj-*` for the whole site — and, because that is
	 * an ancestor, the chart would never see the container's own palette at
	 * all. Rewritten to {@see SVG_ROOT_SCOPE} the defaults stay, but only for
	 * the chart, and at the lowest priority there is.
	 *
	 * @param string $html Markup that may hold an inlined SVG.
	 * @return string The same markup with its `:root` selectors scoped.
	 */
	public static function scope_svg_styles( string $html ): string {
		if ( false === stripos( $html, '<style' ) ) {
			return $html;
		}

		return (string) preg_replace_callback(
			'#<style\b[^>]*>.*?</style>#is',
			static function ( array $found ): string {
				return (string) preg_replace( '/:root\b/i', self::SVG_ROOT_SCOPE, $found[0] );
			},
			$html
		);
	}

	/**
	 * The transient key for one request.
	 *
	 * The body is written out with its keys in order, at every depth, so that
	 * two shortcodes that named the same place in a different order share an
	 * entry. The language is part of the key even though it is part of the
	 * body, because the chart's is and the panchang's is not: the panchang
	 * asks for both languages and picks one here.
	 *
	 * @param string               $element The element being drawn.
	 * @param array<string, mixed> $body    The request body, as the SDK will send it.
	 * @param string               $lang    `en` or `hi`.
	 * @return string The transient name.
	 */
	public static function cache_key( string $element, array $body, string $lang ): string {
		return self::CACHE_PREFIX . md5( $element . '|' . (string) wp_json_encode( self::sorted( $body ) ) . '|' . $lang );
	}

	/**
	 * An array with every key in order, at every depth.
	 *
	 * @param array<string, mixed> $value The array to order.
	 * @return array<string, mixed> The same values, in key order.
	 */
	private static function sorted( array $value ): array {
		ksort( $value );

		foreach ( $value as $key => $item ) {
			if ( is_array( $item ) ) {
				$value[ $key ] = self::sorted( $item );
			}
		}

		return $value;
	}

	/**
	 * How long rendered HTML is kept.
	 *
	 * @return int Seconds.
	 */
	private static function cache_seconds(): int {
		return max( 1, (int) Settings::get( 'cache_minutes' ) ) * 60;
	}

	/**
	 * The client to call with.
	 *
	 * @return Client|null A client, or null when no secret key is stored.
	 */
	private static function client(): ?Client {
		if ( null !== self::$client ) {
			return self::$client;
		}

		$secret = (string) Settings::get( 'secret_key' );
		if ( '' === $secret ) {
			return null;
		}

		return new Client(
			apiKey: $secret,
			baseUrl: Settings::api_base(),
			httpClient: new WpHttpClient(),
			timeoutSeconds: self::TIMEOUT_SECONDS,
			// One retry, not the SDK's two: a page is waiting, and a second
			// attempt already doubles the worst case a visitor sits through.
			maxRetries: 1,
			clientTag: Settings::client_tag(),
		);
	}

	/**
	 * What a page shows when the call could not be made or did not come back.
	 *
	 * @param string $code The SDK's error code, or one of ours.
	 * @return string|null Null to fall back to the browser widget, else the markup.
	 */
	private static function failure( string $code ): ?string {
		// A publishable key means the browser can ask for itself, which is a
		// better outcome for a visitor than any message we could print.
		if ( '' !== (string) Settings::get( 'publishable_key' ) ) {
			return null;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return '';
		}

		return '<p class="kj-notice">' . esc_html(
			sprintf(
				/* translators: %s: the API error code, for example invalid_key. */
				__( 'Kaal Jyoti could not render this on the server (%s).', 'kaal-jyoti' ),
				$code
			)
		) . '</p>';
	}

	/**
	 * The request one element makes.
	 *
	 * @param string                $element The element being drawn.
	 * @param array<string, string> $atts    The sanitised attributes.
	 * @param string                $lang    `en` or `hi`.
	 * @return PanchangRequest|KundliChartRequest|HoroscopeRequest|ReportLagnaRequest|ReportNakshatraRequest|null The request, or null without a place or a birth.
	 */
	private static function request( string $element, array $atts, string $lang ) {
		switch ( $element ) {
			case 'chart':
				return self::chart_request( $atts, $lang );

			case 'horoscope':
				return self::horoscope_request( $atts, $lang );

			case 'reading':
				return self::reading_request( $atts, $lang );
		}

		return self::panchang_request( $atts, $lang );
	}

	/**
	 * The `POST /v1/horoscope` body for these attributes.
	 *
	 * Both languages under `lang="hi"`, as for the panchang: the sign's
	 * `names.hi` is there to pick from and the text comes keyed by both.
	 *
	 * @param array<string, string> $atts The sanitised attributes; `sign` is set.
	 * @param string                $lang `en` or `hi`.
	 * @return HoroscopeRequest The request.
	 */
	private static function horoscope_request( array $atts, string $lang ): HoroscopeRequest {
		return new HoroscopeRequest(
			sign: (string) $atts['sign'],
			period: self::period( $atts ),
			date: self::date( $atts ),
			// Left out when unwritten, so the API's own default — Asia/Kolkata —
			// decides where each day starts, exactly as the widget leaves it.
			timezone: isset( $atts['timezone'] ) ? (string) $atts['timezone'] : null,
			options: new CalculationOptions(
				language: self::languages( $lang ),
				disclaimer: self::disclaimer_option( $atts ),
			),
		);
	}

	/**
	 * The `POST /v1/reports/lagna` or `/v1/reports/nakshatra` body.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @return ReportLagnaRequest|ReportNakshatraRequest|null The request, or null without a preset.
	 */
	private static function reading_request( array $atts, string $lang ) {
		$preset = self::reading_preset( $atts );
		if ( null === $preset ) {
			return null;
		}

		$options = new CalculationOptions(
			language: self::languages( $lang ),
			disclaimer: self::disclaimer_option( $atts ),
		);

		return 'nakshatra' === $preset[0]
			? new ReportNakshatraRequest( nakshatra: $preset[1], options: $options )
			: new ReportLagnaRequest( sign: $preset[1], options: $options );
	}

	/**
	 * The reading a page chose: its type and the sign or nakshatra.
	 *
	 * A reading of a birth — a `datetime` on it — is the browser's, even with
	 * a preset beside it, because that is what the element would draw; so is
	 * every personal reading (the house lords, the grahas, the yogas, the
	 * Vimshottari dashas, the varshphal and the life areas), which has no
	 * preset at all.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @return array{0: string, 1: string}|null `['lagna', 'leo']`, `['nakshatra', 'rohini']`, or null.
	 */
	private static function reading_preset( array $atts ): ?array {
		if ( isset( $atts['datetime'] ) ) {
			return null;
		}

		$type = isset( $atts['type'] ) ? (string) $atts['type'] : 'lagna';

		if ( in_array( $type, Elements::PERSONAL_READINGS, true ) ) {
			return null;
		}

		if ( 'nakshatra' === $type ) {
			return isset( $atts['nakshatra'] ) ? array( 'nakshatra', (string) $atts['nakshatra'] ) : null;
		}

		return isset( $atts['sign'] ) ? array( 'lagna', (string) $atts['sign'] ) : null;
	}

	/**
	 * `options.disclaimer` from the resolved disclaimer attributes.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @return string|Disclaimer|null `'off'`, the astrologer, or null for the API's own line.
	 */
	private static function disclaimer_option( array $atts ) {
		if ( isset( $atts['disclaimer'] ) && 'off' === $atts['disclaimer'] ) {
			return 'off';
		}

		if ( isset( $atts['disclaimer-name'] ) && '' !== $atts['disclaimer-name'] ) {
			return new Disclaimer(
				name: (string) $atts['disclaimer-name'],
				url: isset( $atts['disclaimer-url'] ) ? (string) $atts['disclaimer-url'] : null,
			);
		}

		return null;
	}

	/**
	 * The horoscope's period, `daily` when unwritten.
	 *
	 * Written out even when it is the default, so that `period="daily"` and
	 * no period at all share a cache entry.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @return string `daily`, `weekly`, `monthly` or `yearly`.
	 */
	private static function period( array $atts ): string {
		$period = isset( $atts['period'] ) ? (string) $atts['period'] : 'daily';

		return in_array( $period, array( 'daily', 'weekly', 'monthly', 'yearly' ), true ) ? $period : 'daily';
	}

	/**
	 * The `POST /v1/panchang` body for these attributes.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @return PanchangRequest|null The request, or null when there is no place.
	 */
	private static function panchang_request( array $atts, string $lang ): ?PanchangRequest {
		$place = self::place( $atts );
		if ( null === $place ) {
			return null;
		}

		return new PanchangRequest(
			latitude: $place['latitude'],
			longitude: $place['longitude'],
			timezone: $place['timezone'],
			place: $place['name'],
			// Both languages, so `names.hi` is there to pick from; the answer
			// is the same document either way, so two cards in two languages
			// are still one call.
			options: new CalculationOptions( language: self::languages( $lang ) ),
			date: self::date( $atts ),
		);
	}

	/**
	 * The `POST /v1/kundli/chart` body for these attributes.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @return KundliChartRequest|null The request, or null without a birth.
	 */
	private static function chart_request( array $atts, string $lang ): ?KundliChartRequest {
		$place = self::place( $atts );
		if ( null === $place || ! isset( $atts['datetime'] ) ) {
			return null;
		}

		$show_degrees = null;
		if ( isset( $atts['show-degrees'] ) ) {
			$show_degrees = 'true' === $atts['show-degrees'];
		}

		return new KundliChartRequest(
			birth: new Birth(
				datetime: (string) $atts['datetime'],
				latitude: $place['latitude'],
				longitude: $place['longitude'],
				timezone: $place['timezone'],
				place: $place['name'],
			),
			// One language, unlike the panchang: the labels are drawn into the
			// document, so a chart in the other language is another drawing.
			options: new CalculationOptions( language: array( $lang ) ),
			varga: isset( $atts['varga'] ) ? (string) $atts['varga'] : null,
			style: isset( $atts['chart-style'] ) ? (string) $atts['chart-style'] : ( isset( $atts['style'] ) ? (string) $atts['style'] : null ),
			size: isset( $atts['size'] ) ? (int) $atts['size'] : null,
			showDegrees: $show_degrees,
		);
	}

	/**
	 * The languages a panchang call asks for.
	 *
	 * @param string $lang `en` or `hi`.
	 * @return string[] The list for `options.language`.
	 */
	private static function languages( string $lang ): array {
		return 'hi' === $lang ? array( 'en', 'hi' ) : array( 'en' );
	}

	/**
	 * `date`, as the API wants it.
	 *
	 * `today` and a missing attribute both mean "no date", which is today at
	 * the place — and keeps the cache key the same for both spellings.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @return string|null `YYYY-MM-DD`, or null.
	 */
	private static function date( array $atts ): ?string {
		if ( ! isset( $atts['date'] ) || 'today' === $atts['date'] ) {
			return null;
		}

		return (string) $atts['date'];
	}

	/**
	 * The place a call is about.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @return array{latitude: float, longitude: float, timezone: string|null, name: string|null}|null The place, or null.
	 */
	private static function place( array $atts ): ?array {
		$zone  = isset( $atts['timezone'] ) ? (string) $atts['timezone'] : null;
		$label = isset( $atts['place'] ) ? (string) $atts['place'] : null;

		if ( isset( $atts['lat'], $atts['lon'] ) ) {
			return array(
				'latitude'  => (float) $atts['lat'],
				'longitude' => (float) $atts['lon'],
				// Left out for manual coordinates so the API derives the zone
				// from the point, which is what the widget does too.
				'timezone'  => $zone,
				'name'      => $label,
			);
		}

		$city = Settings::city( isset( $atts['city'] ) ? (string) $atts['city'] : '' );
		if ( null === $city ) {
			return null;
		}

		return array(
			'latitude'  => $city['latitude'],
			'longitude' => $city['longitude'],
			'timezone'  => null === $zone ? $city['timezone'] : $zone,
			'name'      => null === $label ? $city['name'] : $label,
		);
	}

	/**
	 * What the header calls the place.
	 *
	 * The bundled city names are English in both languages; the widget's own
	 * table knows them in Devanagari and this one does not, which is the one
	 * visible difference between the render modes under `lang="hi"`.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @return string The label, or an empty string.
	 */
	private static function place_label( array $atts ): string {
		$place = self::place( $atts );
		if ( null === $place ) {
			return '';
		}

		if ( null !== $place['name'] && '' !== $place['name'] ) {
			return $place['name'];
		}

		return self::degrees( $place['latitude'] ) . ', ' . self::degrees( $place['longitude'] );
	}

	/**
	 * A coordinate, written short.
	 *
	 * @param float $value Degrees.
	 * @return string Up to four decimal places, with trailing zeros dropped.
	 */
	private static function degrees( float $value ): string {
		return rtrim( rtrim( number_format( $value, 4, '.', '' ), '0' ), '.' );
	}

	/**
	 * One chrome label.
	 *
	 * @param string $key  A key of {@see LABELS}.
	 * @param string $lang `en` or `hi`.
	 * @return string The label.
	 */
	private static function label( string $key, string $lang ): string {
		if ( ! isset( self::LABELS[ $key ] ) ) {
			return '';
		}

		return self::LABELS[ $key ][ $lang ] ?? self::LABELS[ $key ]['en'];
	}

	/**
	 * A labelled name in `lang`: `names[lang]` when the call asked for two
	 * languages, else `name`, which is in the first language asked for.
	 *
	 * @param LabelledId $value A nakshatra, a tithi, a vara — any `LabelledId`.
	 * @param string     $lang  `en` or `hi`.
	 * @return string The name.
	 */
	private static function name_of( LabelledId $value, string $lang ): string {
		$names = $value->names;

		return ( is_array( $names ) && isset( $names[ $lang ] ) && is_string( $names[ $lang ] ) ) ? $names[ $lang ] : $value->name;
	}

	/**
	 * `HH:MM` out of a wall clock. Sliced, never parsed.
	 *
	 * @param string|null $wall A local clock at the place, `YYYY-MM-DDTHH:MM:SS…`.
	 * @return string The clock, or an em dash.
	 */
	private static function clock( ?string $wall ): string {
		if ( null === $wall || strlen( $wall ) < 16 ) {
			return self::EMPTY_VALUE;
		}

		return substr( $wall, 11, 5 );
	}

	/**
	 * `HH:MM–HH:MM` for one window.
	 *
	 * @param TimeWindow|null $span The window.
	 * @return string The range, or an empty string when there is nothing to show.
	 */
	private static function window_text( ?TimeWindow $span ): string {
		if ( null === $span ) {
			return '';
		}

		$start = self::clock( $span->start );
		$end   = self::clock( $span->end );

		if ( self::EMPTY_VALUE === $start || self::EMPTY_VALUE === $end ) {
			return '';
		}

		return $start . '–' . $end;
	}

	/**
	 * `22 Sep 2026`, from the date half of any wall clock.
	 *
	 * @param string|null $iso  A date or a wall clock.
	 * @param string      $lang `en` or `hi`.
	 * @return string The date, or an em dash.
	 */
	private static function date_label( ?string $iso, string $lang ): string {
		if ( null === $iso || strlen( $iso ) < 10 ) {
			return self::EMPTY_VALUE;
		}

		$month  = (int) substr( $iso, 5, 2 );
		$months = self::MONTHS[ $lang ] ?? self::MONTHS['en'];

		if ( ! isset( $months[ $month - 1 ] ) ) {
			return self::EMPTY_VALUE;
		}

		return (int) substr( $iso, 8, 2 ) . ' ' . $months[ $month - 1 ] . ' ' . substr( $iso, 0, 4 );
	}

	/**
	 * `Ekadashi until 21:44`, and `until tomorrow 09:09` when a limb runs past
	 * midnight.
	 *
	 * Hindi puts `तक` after the clock, so the two languages cannot share one
	 * template. A limb is at most a day and a bit long, so a date that differs
	 * from the day the card is about is always tomorrow.
	 *
	 * @param string      $name The limb's name.
	 * @param string|null $wall When it ends.
	 * @param string|null $day  The day the card is about, `data.at`.
	 * @param string      $lang `en` or `hi`.
	 * @return string The line.
	 */
	private static function until_text( string $name, ?string $wall, ?string $day, string $lang ): string {
		if ( null === $wall || '' === $wall ) {
			return $name;
		}

		$time = self::clock( $wall );
		if ( null !== $day && '' !== $day && substr( $wall, 0, 10 ) !== substr( $day, 0, 10 ) ) {
			$time = self::label( 'tomorrow', $lang ) . ' ' . $time;
		}

		$until = self::label( 'until', $lang );

		return 'hi' === $lang ? $name . ' ' . $time . ' ' . $until : $name . ' ' . $until . ' ' . $time;
	}

	/**
	 * The panchang card, or the muhurta strip.
	 *
	 * @param string                $element `panchang` or `muhurta`.
	 * @param DailyPanchangDocument $doc     The day's document.
	 * @param array<string, string> $atts    The sanitised attributes.
	 * @param string                $lang    `en` or `hi`.
	 * @param string|null           $plan    The plan header on the answer.
	 * @return string The markup.
	 */
	private static function panchang_html( string $element, DailyPanchangDocument $doc, array $atts, string $lang, ?string $plan ): string {
		$inner = 'muhurta' === $element
			? self::muhurta_inner( $doc, $atts, $lang )
			: self::panchang_inner( $doc, $atts, $lang );

		return '<div class="kj-server kj-server-' . esc_attr( $element ) . '" lang="' . esc_attr( $lang ) . '">'
			. $inner
			. self::powered_by( $atts, $lang, $plan )
			. '</div>';
	}

	/**
	 * The panchang card's blocks, in the order the widget draws them.
	 *
	 * @param DailyPanchangDocument $doc  The day's document.
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @return string The markup.
	 */
	private static function panchang_inner( DailyPanchangDocument $doc, array $atts, string $lang ): string {
		$show   = self::sections( $atts );
		$limbs  = $doc->panchang;
		$blocks = '';

		if ( in_array( 'header', $show, true ) ) {
			$blocks .= '<p class="kj-place">' . esc_html( self::place_label( $atts ) ) . '</p>'
				. '<p class="kj-heading"><span class="kj-date">' . esc_html( self::date_label( $doc->at, $lang ) ) . '</span>'
				. ' <span class="kj-vara">' . esc_html( self::name_of( $limbs->vara, $lang ) ) . '</span></p>';
		}

		$rows = '';
		if ( in_array( 'tithi', $show, true ) ) {
			$rows .= self::row( 'tithi', self::label( 'tithi', $lang ), self::tithi_text( $doc, $lang ) );
		}
		if ( in_array( 'nakshatra', $show, true ) ) {
			$rows .= self::row( 'nakshatra', self::label( 'nakshatra', $lang ), self::nakshatra_text( $doc, $lang ) );
		}
		if ( in_array( 'yoga', $show, true ) ) {
			$rows .= self::row( 'yoga', self::label( 'yoga', $lang ), self::until_text( self::name_of( $limbs->yogaName, $lang ), $doc->yogaEnds, $doc->at, $lang ) );
		}
		if ( in_array( 'karana', $show, true ) ) {
			$rows .= self::row( 'karana', self::label( 'karana', $lang ), self::until_text( self::name_of( $limbs->karanaName, $lang ), $doc->karanaEnds, $doc->at, $lang ) );
		}
		if ( in_array( 'sun', $show, true ) ) {
			$rows .= self::row( 'sunrise', self::label( 'sunrise', $lang ), self::clock( $doc->sunrise ) );
			$rows .= self::row( 'sunset', self::label( 'sunset', $lang ), self::clock( $doc->sunset ) );
		}
		if ( in_array( 'masa', $show, true ) ) {
			$rows .= self::row( 'masa', self::label( 'masa', $lang ), self::masa_text( $doc, $lang ) );
		}

		if ( '' !== $rows ) {
			$blocks .= '<dl class="kj-rows">' . $rows . '</dl>';
		}

		if ( in_array( 'windows', $show, true ) ) {
			$blocks .= self::windows_html( $doc, $lang );
			$blocks .= self::disha_shool_html( $doc, $lang );
		}

		return $blocks;
	}

	/**
	 * The muhurta strip: a small header, the five windows, and the sun line.
	 *
	 * `show` is not read here, exactly as the widget does not read it: anyone
	 * who wants the limbs has the panchang element, on the same one call.
	 *
	 * @param DailyPanchangDocument $doc  The day's document.
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @return string The markup.
	 */
	private static function muhurta_inner( DailyPanchangDocument $doc, array $atts, string $lang ): string {
		$sun = '';
		if ( null !== $doc->sunrise || null !== $doc->sunset ) {
			$sun = '<p class="kj-caption">'
				. esc_html( self::label( 'sunrise', $lang ) . ' ' . self::clock( $doc->sunrise ) )
				. ' · '
				. esc_html( self::label( 'sunset', $lang ) . ' ' . self::clock( $doc->sunset ) )
				. '</p>';
		}

		return '<p class="kj-heading"><span class="kj-place">' . esc_html( self::place_label( $atts ) ) . '</span>'
			. ' <span class="kj-date">' . esc_html( self::date_label( $doc->at, $lang ) ) . '</span></p>'
			. self::windows_html( $doc, $lang )
			. $sun;
	}

	/**
	 * The sections a panchang card draws.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @return string[] The section names.
	 */
	private static function sections( array $atts ): array {
		$all = array( 'header', 'tithi', 'nakshatra', 'yoga', 'karana', 'sun', 'windows', 'masa' );

		if ( ! isset( $atts['show'] ) || '' === $atts['show'] ) {
			return $all;
		}

		$asked = explode( ' ', $atts['show'] );
		$kept  = array();
		foreach ( $all as $section ) {
			if ( in_array( $section, $asked, true ) ) {
				$kept[] = $section;
			}
		}

		return array() === $kept ? $all : $kept;
	}

	/**
	 * One `dt`/`dd` pair.
	 *
	 * @param string $name  The row's name, for the class.
	 * @param string $label The label.
	 * @param string $value The value.
	 * @return string The markup, or an empty string when there is no value.
	 */
	private static function row( string $name, string $label, string $value ): string {
		if ( '' === $value ) {
			return '';
		}

		return '<dt class="kj-label kj-label-' . esc_attr( $name ) . '">' . esc_html( $label ) . '</dt>'
			. '<dd class="kj-value kj-value-' . esc_attr( $name ) . '">' . esc_html( $value ) . '</dd>';
	}

	/**
	 * `Shukla Ekadashi until 21:44, then Dwadashi`.
	 *
	 * A civil day runs from sunrise to sunrise and a tithi does not, so a good
	 * many days hold two; `tithis` is the engine's own list and the only
	 * honest source for the second one. The paksha is printed once unless it
	 * changes, which it does only at Purnima and Amavasya.
	 *
	 * @param DailyPanchangDocument $doc  The day's document.
	 * @param string                $lang `en` or `hi`.
	 * @return string The line.
	 */
	private static function tithi_text( DailyPanchangDocument $doc, string $lang ): string {
		$entries = array();
		foreach ( $doc->tithis as $entry ) {
			if ( '' !== $entry->name->name ) {
				$entries[] = $entry;
			}
		}

		if ( count( $entries ) > 1 ) {
			$parts    = array();
			$previous = '';
			foreach ( $entries as $index => $entry ) {
				$paksha = '';
				if ( '' !== $entry->paksha->id && $entry->paksha->id !== $previous ) {
					$paksha   = self::name_of( $entry->paksha, $lang ) . ' ';
					$previous = $entry->paksha->id;
				}

				$name = $paksha . self::name_of( $entry->name, $lang );
				// Only the tithi that hands over needs a clock; the last one
				// runs past this day's sunrise and belongs to tomorrow's card.
				$parts[] = 0 === $index
					? self::until_text( $name, $entry->ends, $doc->at, $lang )
					: self::label( 'then', $lang ) . ' ' . $name;
			}

			return implode( ', ', $parts );
		}

		$single = trim( self::name_of( $doc->panchang->paksha, $lang ) . ' ' . self::name_of( $doc->panchang->tithiName, $lang ) );
		$ends   = isset( $entries[0] ) ? $entries[0]->ends : $doc->tithiEnds;

		return self::until_text( $single, $ends, $doc->at, $lang );
	}

	/**
	 * `Shravana until tomorrow 09:09 · Pada 1`.
	 *
	 * @param DailyPanchangDocument $doc  The day's document.
	 * @param string                $lang `en` or `hi`.
	 * @return string The line.
	 */
	private static function nakshatra_text( DailyPanchangDocument $doc, string $lang ): string {
		$name = self::name_of( $doc->panchang->nakshatra, $lang );
		$text = self::until_text( $name, $doc->nakshatraEnds, $doc->at, $lang );
		$pada = $doc->panchang->pada;

		return $pada > 0 ? $text . ' · ' . self::label( 'pada', $lang ) . ' ' . $pada : $text;
	}

	/**
	 * `Bhadrapada · Vikram Samvat 2083`, with `Adhik` on an intercalary month.
	 *
	 * @param DailyPanchangDocument $doc  The day's document.
	 * @param string                $lang `en` or `hi`.
	 * @return string The line.
	 */
	private static function masa_text( DailyPanchangDocument $doc, string $lang ): string {
		$masa  = $doc->masa;
		$month = self::name_of( $masa->monthName, $lang );
		if ( '' === $month ) {
			return '';
		}

		// The label is the month's own name; a leap month is only a flag.
		if ( $masa->isAdhik ) {
			$month = self::label( 'adhik', $lang ) . ' ' . $month;
		}
		if ( null === $masa->samvatYear ) {
			return $month;
		}

		return $month . ' · ' . self::label( 'vikram_samvat', $lang ) . ' ' . $masa->samvatYear;
	}

	/**
	 * The five windows as chips.
	 *
	 * A window the engine could not compute — a polar day has no rahu kaal
	 * worth the name — is left out rather than drawn with an em dash in it.
	 *
	 * @param DailyPanchangDocument $doc  The day's document.
	 * @param string                $lang `en` or `hi`.
	 * @return string The markup, or an empty string.
	 */
	private static function windows_html( DailyPanchangDocument $doc, string $lang ): string {
		$windows = array(
			array( 'brahma_muhurta', $doc->brahmaMuhurta, 'good' ),
			array( 'abhijit', $doc->abhijitMuhurta, 'good' ),
			array( 'rahu_kaal', $doc->rahuKalam, 'bad' ),
			array( 'yamaganda', $doc->yamaganda, 'bad' ),
			array( 'gulika_kaal', $doc->gulikaKalam, 'bad' ),
		);

		$chips = '';
		foreach ( $windows as $window ) {
			list( $key, $span, $quality ) = $window;

			$range = self::window_text( $span );
			if ( '' === $range ) {
				continue;
			}

			$chips .= '<li class="kj-window kj-window-' . esc_attr( $key ) . '" data-quality="' . esc_attr( $quality ) . '">'
				. '<span class="kj-label">' . esc_html( self::label( $key, $lang ) ) . '</span>'
				. ' <span class="kj-value">' . esc_html( $range ) . '</span></li>';
		}

		return '' === $chips ? '' : '<ul class="kj-windows">' . $chips . '</ul>';
	}

	/**
	 * The direction to avoid today, beside the windows it belongs with.
	 *
	 * @param DailyPanchangDocument $doc  The day's document.
	 * @param string                $lang `en` or `hi`.
	 * @return string The markup, or an empty string.
	 */
	private static function disha_shool_html( DailyPanchangDocument $doc, string $lang ): string {
		$direction = $doc->dishaShool;
		if ( null === $direction || '' === $direction ) {
			return '';
		}

		$key   = strtolower( $direction );
		$named = isset( self::DIRECTIONS[ $key ] ) ? self::DIRECTIONS[ $key ][ $lang ] : $direction;

		return '<p class="kj-caption kj-disha-shool">'
			. esc_html( self::label( 'disha_shool', $lang ) . ': ' . $named )
			. '</p>';
	}

	/**
	 * The drawn chart.
	 *
	 * @param string                $svg  The markup the API drew.
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @param string|null           $plan The plan header on the answer.
	 * @return string The markup.
	 */
	private static function chart_html( string $svg, array $atts, string $lang, ?string $plan ): string {
		$caption = self::chart_caption( $atts, $lang );
		$figure  = '<figure class="kj-chart">'
			// The SVG is the API's own document: escaping it would print the
			// drawing as text, so it is filtered to the chart's own elements
			// and attributes instead.
			. self::scope_svg_styles( self::kses_svg( $svg ) )
			. ( '' === $caption ? '' : '<figcaption class="kj-caption">' . esc_html( $caption ) . '</figcaption>' )
			. '</figure>';

		return '<div class="kj-server kj-server-chart" lang="' . esc_attr( $lang ) . '">'
			. $figure
			. self::powered_by( $atts, $lang, $plan )
			. '</div>';
	}

	/**
	 * The API's SVG through `wp_kses()` with {@see SVG_ALLOWED}.
	 *
	 * The filter lower-cases attribute names. An HTML page's parser puts
	 * `viewBox` back in an inline SVG, but an XML reader of the page would
	 * not, so it is restored here.
	 *
	 * @param string $svg The markup the API drew.
	 * @return string The markup, with only the chart's elements and attributes.
	 */
	public static function kses_svg( string $svg ): string {
		return (string) preg_replace( '/(<svg\b[^>]*?\s)viewbox=/i', '$1viewBox=', wp_kses( $svg, self::SVG_ALLOWED, array() ) );
	}

	/**
	 * `New Delhi · 14 May 1990, 10:30`.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @return string The caption, or an empty string.
	 */
	private static function chart_caption( array $atts, string $lang ): string {
		$parts = array();

		$place = self::place_label( $atts );
		if ( '' !== $place ) {
			$parts[] = $place;
		}

		if ( isset( $atts['datetime'] ) ) {
			$date    = self::date_label( $atts['datetime'], $lang );
			$time    = self::clock( $atts['datetime'] );
			$parts[] = self::EMPTY_VALUE === $time ? $date : $date . ', ' . $time;
		}

		return implode( ' · ', $parts );
	}

	/**
	 * The horoscope card: the sign and the period, the summary, and one block
	 * per life area, each with its level.
	 *
	 * The transits the API read them from (`basis`) are for the site, not the
	 * reader, and are drawn only when the page set `show-basis`, folded away
	 * under the areas. There are no scores in the answer and none are drawn.
	 *
	 * @param HoroscopeDocument     $doc  The answer.
	 * @param Meta                  $meta The answer's meta, for the zone its instants are shown in.
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @param string|null           $plan The plan header on the answer.
	 * @return string The markup.
	 */
	private static function horoscope_html( HoroscopeDocument $doc, Meta $meta, array $atts, string $lang, ?string $plan ): string {
		$period = self::period( $atts );
		$zone   = self::zone( $meta );

		$blocks = '<p class="kj-heading"><span class="kj-sign">' . esc_html( self::name_of( $doc->sign, $lang ) ) . '</span>'
			. ' · <span class="kj-period">' . esc_html( self::label( $period, $lang ) ) . '</span></p>'
			. '<p class="kj-date">' . esc_html( self::period_label( $doc->from, $doc->to, $zone, $lang ) ) . '</p>'
			. self::summary_html( $doc->summary, $lang );

		$areas = '';
		foreach ( $doc->areas as $area ) {
			$areas .= self::area_html( $area, $lang );
		}
		if ( '' !== $areas ) {
			$blocks .= '<ul class="kj-areas">' . $areas . '</ul>';
		}

		if ( isset( $atts['show-basis'] ) && 'true' === $atts['show-basis'] ) {
			$blocks .= self::basis_html( $doc->basis, $period, $zone, $lang );
		}

		return '<div class="kj-server kj-server-horoscope" lang="' . esc_attr( $lang ) . '">'
			. $blocks
			. self::disclaimer_html( $doc->disclaimer, $lang )
			. self::powered_by( $atts, $lang, $plan )
			. '</div>';
	}

	/**
	 * A level as a word in a badge — Favourable, Mixed, Needs care — or
	 * nothing for a level this plugin does not know.
	 *
	 * @param string $level `favourable`, `mixed` or `care`.
	 * @param string $lang  `en` or `hi`.
	 * @return string The markup, or an empty string.
	 */
	private static function level_html( string $level, string $lang ): string {
		if ( ! in_array( $level, self::LEVELS, true ) ) {
			return '';
		}

		return '<span class="kj-level kj-level-' . esc_attr( $level ) . '">' . esc_html( self::label( $level, $lang ) ) . '</span>';
	}

	/**
	 * The overall line: its level, then its text.
	 *
	 * @param ReadingSummary $summary The summary.
	 * @param string         $lang    `en` or `hi`.
	 * @return string The markup, or an empty string when there is no text.
	 */
	private static function summary_html( ReadingSummary $summary, string $lang ): string {
		$text = self::text_in( $summary->text, $lang );
		if ( '' === $text ) {
			return '';
		}

		return '<div class="kj-summary">' . self::level_html( $summary->level, $lang ) . self::paragraphs( $text ) . '</div>';
	}

	/**
	 * One life area: its name and level, then its text.
	 *
	 * @param AreaSummary $area The area.
	 * @param string      $lang `en` or `hi`.
	 * @return string The markup, or an empty string when there is no text.
	 */
	private static function area_html( AreaSummary $area, string $lang ): string {
		$text = self::text_in( $area->text, $lang );
		if ( '' === $text ) {
			return '';
		}

		$name = isset( self::LABELS[ $area->area ] ) ? self::label( $area->area, $lang ) : $area->area;

		return '<li class="kj-area kj-area-' . esc_attr( $area->area ) . '">'
			. '<p class="kj-area-head"><strong class="kj-label">' . esc_html( $name ) . '</strong> ' . self::level_html( $area->level, $lang ) . '</p>'
			. self::paragraphs( $text )
			. '</li>';
	}

	/**
	 * `show-basis`: the transits, one line each, folded away.
	 *
	 * @param HoroscopeTransit[] $basis  The transits, in the answer's order.
	 * @param string             $period `daily`, `weekly`, `monthly` or `yearly`.
	 * @param \DateTimeZone      $zone   The zone the instants are shown in.
	 * @param string             $lang   `en` or `hi`.
	 * @return string The markup, or an empty string.
	 */
	private static function basis_html( array $basis, string $period, \DateTimeZone $zone, string $lang ): string {
		$items = '';
		foreach ( $basis as $transit ) {
			$items .= self::transit_html( $transit, $period, $zone, $lang );
		}

		if ( '' === $items ) {
			return '';
		}

		return '<details class="kj-basis"><summary>' . esc_html( self::label( 'basis', $lang ) ) . '</summary><ul class="kj-transits">' . $items . '</ul></details>';
	}

	/**
	 * One graha in one sign: `Sun in your 6th house · Virgo · favourable`,
	 * and when it changed sign inside the period.
	 *
	 * @param HoroscopeTransit $transit The transit.
	 * @param string           $period  `daily`, `weekly`, `monthly` or `yearly`.
	 * @param \DateTimeZone    $zone    The zone the instants are shown in.
	 * @param string           $lang    `en` or `hi`.
	 * @return string The markup.
	 */
	private static function transit_html( HoroscopeTransit $transit, string $period, \DateTimeZone $zone, string $lang ): string {
		$graha = $transit->graha->id;

		// Rahu and Ketu are always retrograde; saying so of them says nothing.
		$retro = '';
		if ( $transit->retrograde && ! in_array( $graha, array( 'rahu', 'ketu' ), true ) ) {
			$retro = ' <span class="kj-retro">(' . esc_html( self::label( 'retrograde', $lang ) ) . ')</span>';
		}

		$nature = '';
		if ( 'favourable' === $transit->nature ) {
			$nature = ' · ' . self::label( 'is_favourable', $lang );
		} elseif ( 'unfavourable' === $transit->nature ) {
			$nature = ' · ' . self::label( 'unfavourable', $lang );
		}

		$span = self::segment_span( $transit, $period, $zone, $lang );

		return '<li class="kj-transit kj-transit-' . esc_attr( $graha ) . '">'
			. '<strong class="kj-graha-name">' . esc_html( self::name_of( $transit->graha, $lang ) ) . '</strong> '
			. esc_html( self::house_text( $transit->house, $lang ) . ' · ' . self::name_of( $transit->sign, $lang ) . $nature )
			. $retro
			. ( '' === $span ? '' : ' <span class="kj-caption kj-span">' . esc_html( $span ) . '</span>' )
			. '</li>';
	}

	/**
	 * A reading: the sign or nakshatra it is about, its text, and the line
	 * that closes it.
	 *
	 * @param string                $title      `Leo lagna`, `रोहिणी नक्षत्र`.
	 * @param LocalizedText         $text       The reading.
	 * @param LocalizedText|null    $disclaimer The closing line, when the answer has one.
	 * @param array<string, string> $atts    The sanitised attributes.
	 * @param string                $lang       `en` or `hi`.
	 * @param string|null           $plan       The plan header on the answer.
	 * @return string The markup, or an empty string when the answer held no text.
	 */
	private static function reading_html( string $title, LocalizedText $text, ?LocalizedText $disclaimer, array $atts, string $lang, ?string $plan ): string {
		$body = self::paragraphs( self::text_in( $text, $lang ) );
		if ( '' === $body ) {
			return '';
		}

		return '<div class="kj-server kj-server-reading" lang="' . esc_attr( $lang ) . '">'
			. '<p class="kj-heading">' . esc_html( $title ) . '</p>'
			. $body
			. self::disclaimer_html( $disclaimer, $lang )
			. self::powered_by( $atts, $lang, $plan )
			. '</div>';
	}

	/**
	 * A text in `lang`, or in English when the answer has no such language.
	 *
	 * @param LocalizedText $text The text, keyed by language.
	 * @param string        $lang `en` or `hi`.
	 * @return string The text, or an empty string.
	 */
	private static function text_in( LocalizedText $text, string $lang ): string {
		$chosen = 'hi' === $lang ? $text->hi : $text->en;

		return trim( (string) ( $chosen ?? $text->en ?? $text->hi ?? '' ) );
	}

	/**
	 * Text as paragraphs, split where the answer leaves a blank line.
	 *
	 * @param string $text The text.
	 * @return string The markup, or an empty string.
	 */
	private static function paragraphs( string $text ): string {
		$markup = '';
		$split  = preg_split( '/\n\s*\n/', $text );
		foreach ( is_array( $split ) ? $split : array() as $paragraph ) {
			$paragraph = trim( $paragraph );
			if ( '' !== $paragraph ) {
				$markup .= '<p class="kj-text">' . esc_html( $paragraph ) . '</p>';
			}
		}

		return $markup;
	}

	/**
	 * The closing disclaimer, small, when the answer carries one.
	 *
	 * @param LocalizedText|null $disclaimer The line; null when it was turned off.
	 * @param string             $lang       `en` or `hi`.
	 * @return string The markup, or an empty string.
	 */
	private static function disclaimer_html( ?LocalizedText $disclaimer, string $lang ): string {
		$line = null === $disclaimer ? '' : self::text_in( $disclaimer, $lang );

		return '' === $line ? '' : '<p class="kj-disclaimer"><small>' . esc_html( $line ) . '</small></p>';
	}

	/**
	 * `in your 6th house`, `आपके षष्ठ भाव में`.
	 *
	 * @param int    $house 1 to 12, counted from the chosen sign.
	 * @param string $lang  `en` or `hi`.
	 * @return string The phrase.
	 */
	private static function house_text( int $house, string $lang ): string {
		if ( 'hi' === $lang && isset( self::HOUSES_HI[ $house - 1 ] ) ) {
			return 'आपके ' . self::HOUSES_HI[ $house - 1 ] . ' भाव में';
		}

		$suffix = 'th';
		if ( $house < 11 || $house > 13 ) {
			$suffix = array(
				1 => 'st',
				2 => 'nd',
				3 => 'rd',
			)[ $house % 10 ] ?? 'th';
		}

		return 'in your ' . $house . $suffix . ' house';
	}

	/**
	 * The zone the answer's instants are shown in.
	 *
	 * The zone's name when the API named one — a year of a zone with summer
	 * time is not one offset — else the offset it reported, else UTC.
	 *
	 * @param Meta $meta The answer's meta.
	 * @return \DateTimeZone The zone.
	 */
	private static function zone( Meta $meta ): \DateTimeZone {
		foreach ( array( $meta->timezone->name, $meta->timezone->utcOffset ) as $candidate ) {
			if ( null === $candidate || '' === $candidate ) {
				continue;
			}

			try {
				return new \DateTimeZone( $candidate );
			} catch ( \Exception $error ) {
				unset( $error );
			}
		}

		return new \DateTimeZone( 'UTC' );
	}

	/**
	 * A UTC instant, as a clock in the answer's zone.
	 *
	 * @param string|null   $instant `2026-09-27T18:30:00.000Z`.
	 * @param \DateTimeZone $zone    The zone to show it in.
	 * @return \DateTimeImmutable|null The local time, or null.
	 */
	private static function local( ?string $instant, \DateTimeZone $zone ): ?\DateTimeImmutable {
		if ( null === $instant || '' === $instant ) {
			return null;
		}

		try {
			return ( new \DateTimeImmutable( $instant ) )->setTimezone( $zone );
		} catch ( \Exception $error ) {
			return null;
		}
	}

	/**
	 * `28 Sep 2026`, or `28 Sep – 4 Oct 2026` for a longer period.
	 *
	 * `to` is where the next period starts, so the last day shown is the one
	 * just before it.
	 *
	 * @param string        $from The period's first instant.
	 * @param string        $to   The instant after its last.
	 * @param \DateTimeZone $zone The zone.
	 * @param string        $lang `en` or `hi`.
	 * @return string The line.
	 */
	private static function period_label( string $from, string $to, \DateTimeZone $zone, string $lang ): string {
		$start = self::local( $from, $zone );
		$end   = self::local( $to, $zone );
		if ( null === $start || null === $end ) {
			return self::EMPTY_VALUE;
		}

		$last      = $end->modify( '-1 second' );
		$first_day = $start->format( 'Y-m-d' );
		$last_day  = $last->format( 'Y-m-d' );

		if ( $last_day <= $first_day ) {
			return self::date_label( $first_day, $lang );
		}

		$opening = $start->format( 'Y' ) === $last->format( 'Y' )
			? self::short_date( $start, $lang )
			: self::date_label( $first_day, $lang );

		return $opening . ' – ' . self::date_label( $last_day, $lang );
	}

	/**
	 * `until 10:16`, `from 31 Oct`, `from 30 Sep, 13:14 until 2 Oct, 15:40` —
	 * when the graha changed sign inside the period; nothing when it stayed.
	 *
	 * A day's segments are told by the clock, a week's by the day and the
	 * clock, and a month's or a year's by the day alone.
	 *
	 * @param HoroscopeTransit $segment The transit.
	 * @param string           $period  `daily`, `weekly`, `monthly` or `yearly`.
	 * @param \DateTimeZone    $zone    The zone.
	 * @param string           $lang    `en` or `hi`.
	 * @return string The line, or an empty string.
	 */
	private static function segment_span( HoroscopeTransit $segment, string $period, \DateTimeZone $zone, string $lang ): string {
		$entered = self::moment( self::local( $segment->entered, $zone ), $period, $lang );
		$leaves  = self::moment( self::local( $segment->leaves, $zone ), $period, $lang );

		$from  = self::label( 'from', $lang );
		$until = self::label( 'until', $lang );

		if ( 'hi' === $lang ) {
			$parts = array();
			if ( '' !== $entered ) {
				$parts[] = $entered . ' ' . $from;
			}
			if ( '' !== $leaves ) {
				$parts[] = $leaves . ' ' . $until;
			}

			return implode( ' ', $parts );
		}

		$parts = array();
		if ( '' !== $entered ) {
			$parts[] = $from . ' ' . $entered;
		}
		if ( '' !== $leaves ) {
			$parts[] = $until . ' ' . $leaves;
		}

		return implode( ' ', $parts );
	}

	/**
	 * One instant, written as finely as the period needs.
	 *
	 * @param \DateTimeImmutable|null $moment The local time.
	 * @param string                  $period `daily`, `weekly`, `monthly` or `yearly`.
	 * @param string                  $lang   `en` or `hi`.
	 * @return string The moment, or an empty string.
	 */
	private static function moment( ?\DateTimeImmutable $moment, string $period, string $lang ): string {
		if ( null === $moment ) {
			return '';
		}

		if ( 'daily' === $period ) {
			return $moment->format( 'H:i' );
		}

		$day = self::short_date( $moment, $lang );

		return 'weekly' === $period ? $day . ', ' . $moment->format( 'H:i' ) : $day;
	}

	/**
	 * `31 Oct`, `31 अक्तूबर`.
	 *
	 * @param \DateTimeImmutable $moment The local time.
	 * @param string             $lang   `en` or `hi`.
	 * @return string The day and the month.
	 */
	private static function short_date( \DateTimeImmutable $moment, string $lang ): string {
		$months = self::MONTHS[ $lang ] ?? self::MONTHS['en'];

		return (int) $moment->format( 'j' ) . ' ' . $months[ (int) $moment->format( 'n' ) - 1 ];
	}

	/**
	 * The footer link, only when the site owner turned it on.
	 *
	 * Opt-in on every plan, as the browser widgets are in this plugin: the
	 * WordPress.org guidelines allow a credit link only with the site owner's
	 * explicit permission, and no plan gate in plugin code.
	 *
	 * @param array<string, string> $atts The sanitised attributes.
	 * @param string                $lang `en` or `hi`.
	 * @param string|null           $plan The plan header on the answer.
	 * @return string The markup, or an empty string.
	 */
	private static function powered_by( array $atts, string $lang, ?string $plan ): string {
		unset( $plan );
		$asked = isset( $atts['powered-by'] ) ? (string) $atts['powered-by'] : 'hidden';

		if ( 'shown' !== $asked ) {
			return '';
		}

		return '<p class="kj-powered-by"><a href="' . esc_url( self::POWERED_BY_URL ) . '" target="_blank" rel="noopener">'
			. esc_html( self::label( 'powered_by', $lang ) )
			. '</a></p>';
	}
}
