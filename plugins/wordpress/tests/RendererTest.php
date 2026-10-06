<?php
/**
 * What the server draws, and what it does when it cannot.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Server\Renderer;
use KaalJyoti\WP\Tests\Support\FakeHttpClient;
use Kaaljyoti\Client;
use PHPUnit\Framework\Attributes\CoversClass;

#[CoversClass( Renderer::class )]
final class RendererTest extends TestCase {

	/**
	 * A site in server mode with a key of each kind.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'secret_key'      => 'kj_live_demo',
				'render_mode'     => 'server',
			)
		);
	}

	/**
	 * The injected client never leaks into the next test.
	 */
	protected function tearDown(): void {
		Renderer::set_client( null );
		parent::tearDown();
	}

	/**
	 * A cached page costs nothing: the transient is the answer and the API is
	 * never asked.
	 */
	public function test_a_cache_hit_returns_the_stored_html(): void {
		$stored = '<div class="kj-server kj-server-panchang">cached</div>';
		Functions\when( 'get_transient' )->justReturn( $stored );

		// Nothing queued: calling the API at all is a LogicException.
		$socket = $this->given_api();

		$this->assertSame( $stored, Renderer::render( 'panchang', $this->panchang_atts() ) );
		$this->assertSame( array(), $socket->requests );
	}

	/**
	 * A miss draws the card: the header, the five limbs and the windows.
	 */
	public function test_a_miss_renders_the_rows_and_the_windows(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'panchang' ) ) );

		$html = (string) Renderer::render( 'panchang', $this->panchang_atts() );

		$this->assertStringContainsString( 'class="kj-server kj-server-panchang"', $html );
		$this->assertStringContainsString( 'New Delhi', $html );
		$this->assertStringContainsString( '22 Sep 2026', $html );
		$this->assertStringContainsString( 'Mangalavara', $html );

		$this->assertStringContainsString( '<dl class="kj-rows">', $html );
		$this->assertStringContainsString( 'Shukla Ekadashi until 21:44, then Dwadashi', $html );
		$this->assertStringContainsString( 'Shravana until tomorrow 09:09 · Pada 1', $html );
		$this->assertStringContainsString( 'Atiganda until 16:29', $html );
		$this->assertStringContainsString( 'Vishti until 21:44', $html );
		$this->assertStringContainsString( '06:13', $html );
		$this->assertStringContainsString( 'Bhadrapada · Vikram Samvat 2083', $html );

		$this->assertStringContainsString( '<ul class="kj-windows">', $html );
		$this->assertStringContainsString( 'data-quality="good"', $html );
		$this->assertStringContainsString( 'data-quality="bad"', $html );
		$this->assertStringContainsString( '04:37–05:25', $html );
		$this->assertStringContainsString( 'Rahu kaal', $html );
		$this->assertStringContainsString( '15:14–16:44', $html );
		$this->assertStringContainsString( 'Disha shool: North', $html );
		$this->assertStringContainsString( 'Powered by Kaal Jyoti', $html );
	}

	/**
	 * …and keeps it for the next visitor.
	 */
	public function test_a_miss_stores_the_html(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'panchang' ) ) );

		$kept = array();
		Functions\when( 'set_transient' )->alias(
			static function ( string $key, $value, int $seconds ) use ( &$kept ): bool {
				$kept = array( $key, $value, $seconds );

				return true;
			}
		);

		$html = (string) Renderer::render( 'panchang', $this->panchang_atts() );

		$this->assertStringStartsWith( 'kaal_jyoti_', $kept[0] );
		$this->assertSame( $html, $kept[1] );
		$this->assertSame( 15 * 60, $kept[2] );
	}

	/**
	 * Hindi takes the nakshatra from `names.hi` and puts `तक` after the clock.
	 */
	public function test_hindi_uses_the_names_in_the_response(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'panchang' ) ) );

		$html = (string) Renderer::render( 'panchang', $this->panchang_atts( array( 'lang' => 'hi' ) ) );

		$this->assertStringContainsString( 'lang="hi"', $html );
		$this->assertStringContainsString( 'तिथि', $html );
		$this->assertStringContainsString( 'श्रवण कल 09:09 तक', $html );
		$this->assertStringContainsString( 'शुक्ल एकादशी 21:44 तक, फिर द्वादशी', $html );
		$this->assertStringContainsString( 'मंगलवार', $html );
		$this->assertStringContainsString( 'अतिगण्ड', $html );
		$this->assertStringContainsString( 'विष्टि', $html );
		$this->assertStringContainsString( 'भाद्रपद · विक्रम संवत् 2083', $html );
		$this->assertStringContainsString( '22 सितंबर 2026', $html );
		$this->assertStringContainsString( 'राहु काल', $html );
		$this->assertStringContainsString( 'काल ज्योति द्वारा', $html );
	}

	/**
	 * A leap month is a flag beside the month's own label; the prefix is ours.
	 */
	public function test_an_adhik_month_is_prefixed_in_either_language(): void {
		$doc                             = FakeHttpClient::fixture( 'panchang' );
		$doc['data']['masa']['is_adhik'] = true;
		$body                            = (string) wp_json_encode( $doc );

		$this->given_api( FakeHttpClient::json( $body ) );
		$english = (string) Renderer::render( 'panchang', $this->panchang_atts() );
		$this->assertStringContainsString( 'Adhik Bhadrapada · Vikram Samvat 2083', $english );

		$this->given_api( FakeHttpClient::json( $body ) );
		$hindi = (string) Renderer::render( 'panchang', $this->panchang_atts( array( 'lang' => 'hi' ) ) );
		$this->assertStringContainsString( 'अधिक भाद्रपद · विक्रम संवत् 2083', $hindi );
	}

	/**
	 * Both languages are asked for, so one document answers either card.
	 */
	public function test_hindi_asks_for_both_languages(): void {
		$socket = $this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'panchang' ) ) );

		Renderer::render( 'panchang', $this->panchang_atts( array( 'lang' => 'hi' ) ) );

		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame( array( 'en', 'hi' ), $body['options']['language'] );
		$this->assertSame( 'Asia/Kolkata', $body['timezone'] );
		$this->assertSame( 'New Delhi', $body['place'] );
	}

	/**
	 * The muhurta strip is the same call, drawn as the five windows and a sun
	 * line — no limbs.
	 */
	public function test_the_muhurta_strip_is_the_windows(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'panchang' ) ) );

		$html = (string) Renderer::render( 'muhurta', $this->panchang_atts() );

		$this->assertStringContainsString( 'class="kj-server kj-server-muhurta"', $html );
		$this->assertStringContainsString( '<ul class="kj-windows">', $html );
		$this->assertStringContainsString( 'Abhijit muhurta', $html );
		$this->assertStringContainsString( 'Sunrise 06:13', $html );
		$this->assertStringNotContainsString( '<dl class="kj-rows">', $html );
	}

	/**
	 * `show` cuts the card down to the sections it names.
	 */
	public function test_show_keeps_only_the_named_sections(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'panchang' ) ) );

		$html = (string) Renderer::render( 'panchang', $this->panchang_atts( array( 'show' => 'tithi nakshatra' ) ) );

		$this->assertStringContainsString( 'Ekadashi', $html );
		$this->assertStringContainsString( 'Shravana', $html );
		$this->assertStringNotContainsString( 'kj-windows', $html );
		$this->assertStringNotContainsString( 'Bhadrapada', $html );
		$this->assertStringNotContainsString( '22 Sep 2026', $html );
	}

	/**
	 * The chart is the API's own document, inlined inside a figure.
	 */
	public function test_the_chart_inlines_the_svg(): void {
		$svg = (string) FakeHttpClient::fixture( 'chart' )['data']['svg'];
		$this->given_api( FakeHttpClient::svg( $svg ) );

		$html = (string) Renderer::render(
			'chart',
			array(
				'datetime'   => '1990-05-14T10:30:00',
				'city'       => 'delhi',
				'style'      => 'north',
				'lang'       => 'en',
				'powered-by' => 'shown',
			)
		);

		$this->assertStringContainsString( '<figure class="kj-chart">', $html );
		$this->assertStringContainsString( '<svg xmlns="http://www.w3.org/2000/svg"', $html );
		$this->assertStringContainsString( '</svg>', $html );
		$this->assertStringContainsString( '<figcaption class="kj-caption">New Delhi · 14 May 1990, 10:30</figcaption>', $html );
	}

	/**
	 * Every element and attribute the API's chart uses is on the allowlist,
	 * so the filtered drawing is the drawing: the same elements, in the same
	 * order, each with all its attributes.
	 */
	public function test_the_allowlist_keeps_the_whole_chart(): void {
		$svg = (string) FakeHttpClient::fixture( 'chart' )['data']['svg'];

		preg_match_all( '#<([a-zA-Z][\w:-]*)([^>]*)>#', $svg, $tags, PREG_SET_ORDER );
		$this->assertGreaterThan( 50, count( $tags ) );
		foreach ( $tags as $tag ) {
			$name = strtolower( $tag[1] );
			$this->assertArrayHasKey( $name, Renderer::SVG_ALLOWED, "<{$name}>" );
			preg_match_all( '/([a-zA-Z][\w:-]*)=/', $tag[2], $attributes );
			foreach ( $attributes[1] as $attribute ) {
				$this->assertArrayHasKey( strtolower( $attribute ), Renderer::SVG_ALLOWED[ $name ], "<{$name} {$attribute}>" );
			}
		}

		$filtered = Renderer::kses_svg( $svg );
		$this->assertSame( str_replace( '"/>', '" />', $svg ), $filtered );
		$this->assertStringContainsString( 'viewBox="0 0 360 360"', $filtered );
	}

	/**
	 * Whatever the API sent, nothing that runs or links reaches the page.
	 */
	public function test_the_chart_svg_is_filtered(): void {
		$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">'
			. '<script>alert(2)</script><a href="javascript:alert(3)"><text x="1" y="2" onclick="alert(4)">7</text></a>'
			. '<foreignObject><iframe src="https://evil.example"></iframe></foreignObject>'
			. '<rect width="1" height="1" style="fill:url(https://evil.example)"/></svg>';
		$this->given_api( FakeHttpClient::svg( $svg ) );

		$html = (string) Renderer::render(
			'chart',
			array(
				'datetime' => '1990-05-14T10:30:00',
				'city'     => 'delhi',
			)
		);

		$this->assertStringContainsString( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">', $html );
		$this->assertStringContainsString( '<text x="1" y="2">7</text>', $html );
		$this->assertStringContainsString( '<rect width="1" height="1" />', $html );
		$drawing = strtolower( (string) strstr( (string) strstr( $html, '<svg' ), '</svg>', true ) );
		foreach ( array( 'onload', 'onclick', '<script', '<a ', 'javascript:', '<foreignobject', '<iframe', 'evil.example' ) as $gone ) {
			$this->assertStringNotContainsString( $gone, $drawing );
		}
	}

	/**
	 * The chart asks for one language, because the labels are drawn in.
	 */
	public function test_the_chart_asks_for_one_language(): void {
		$svg    = (string) FakeHttpClient::fixture( 'chart' )['data']['svg'];
		$socket = $this->given_api( FakeHttpClient::svg( $svg ) );

		Renderer::render(
			'chart',
			array(
				'datetime' => '1990-05-14T10:30:00',
				'city'     => 'delhi',
				'lang'     => 'hi',
			)
		);

		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame( 'hi', $body['options']['language'] );
		$this->assertSame( '1990-05-14T10:30:00', $body['birth']['datetime'] );
	}

	/**
	 * A refused call is not a visitor's problem: with a publishable key the
	 * page falls back to the browser widget.
	 */
	public function test_a_failure_falls_back_to_the_browser(): void {
		$this->given_api( FakeHttpClient::failure( 'quota_exceeded', 402 ) );

		$this->assertNull( Renderer::render( 'panchang', $this->panchang_atts() ) );
	}

	/**
	 * With nothing to fall back to, someone who can fix it is told the code.
	 */
	public function test_a_failure_without_a_publishable_key_is_an_admin_notice(): void {
		$this->given_settings(
			array(
				'publishable_key' => '',
				'secret_key'      => 'kj_live_demo',
				'render_mode'     => 'server',
			)
		);
		Functions\when( 'current_user_can' )->justReturn( true );
		$this->given_api( FakeHttpClient::failure( 'invalid_key', 401 ) );

		$html = (string) Renderer::render( 'panchang', $this->panchang_atts() );

		$this->assertStringContainsString( 'kj-notice', $html );
		$this->assertStringContainsString( 'invalid_key', $html );
	}

	/**
	 * A visitor sees nothing at all.
	 */
	public function test_a_failure_shows_a_visitor_nothing(): void {
		$this->given_settings(
			array(
				'publishable_key' => '',
				'secret_key'      => 'kj_live_demo',
				'render_mode'     => 'server',
			)
		);
		$this->given_api( FakeHttpClient::failure( 'invalid_key', 401 ) );

		$this->assertSame( '', Renderer::render( 'panchang', $this->panchang_atts() ) );
	}

	/**
	 * A place that is neither a city nor a pair of coordinates never reaches
	 * the network.
	 */
	public function test_no_place_never_calls_the_api(): void {
		$socket = $this->given_api();

		$this->assertNull( Renderer::render( 'panchang', array( 'lang' => 'en' ) ) );
		$this->assertSame( array(), $socket->requests );
	}

	/**
	 * The "Powered by" link is opt-in (WordPress.org guideline 10): hidden
	 * unless the site owner turned it on, on a free plan too.
	 */
	public function test_powered_by_is_off_unless_turned_on(): void {
		$this->given_api(
			FakeHttpClient::json(
				FakeHttpClient::fixture_body( 'panchang' ),
				200,
				array( 'x-kj-plan' => 'free' )
			)
		);

		$html = (string) Renderer::render( 'panchang', $this->panchang_atts( array( 'powered-by' => 'hidden' ) ) );

		$this->assertStringNotContainsString( 'Powered by Kaal Jyoti', $html );
	}

	/**
	 * …and shown when it is turned on, on any plan.
	 */
	public function test_powered_by_shows_when_turned_on(): void {
		$this->given_api(
			FakeHttpClient::json(
				FakeHttpClient::fixture_body( 'panchang' ),
				200,
				array( 'x-kj-plan' => 'growth' )
			)
		);

		$html = (string) Renderer::render( 'panchang', $this->panchang_atts( array( 'powered-by' => 'shown' ) ) );

		$this->assertStringContainsString( 'Powered by Kaal Jyoti', $html );
	}

	/**
	 * Two ways of writing the same request share a cache entry.
	 */
	public function test_the_cache_key_does_not_depend_on_key_order(): void {
		$one = Renderer::cache_key(
			'panchang',
			array(
				'latitude'  => 28.6139,
				'options'   => array(
					'language' => array( 'en' ),
					'ayanamsa' => 'lahiri',
				),
				'longitude' => 77.209,
			),
			'en'
		);

		$two = Renderer::cache_key(
			'panchang',
			array(
				'longitude' => 77.209,
				'latitude'  => 28.6139,
				'options'   => array(
					'ayanamsa' => 'lahiri',
					'language' => array( 'en' ),
				),
			),
			'en'
		);

		$this->assertSame( $one, $two );
		$this->assertSame( 43, strlen( $one ) );
		$this->assertNotSame( $one, Renderer::cache_key( 'muhurta', array( 'latitude' => 28.6139 ), 'en' ) );
	}

	/**
	 * Points the renderer at a client that answers from this list.
	 *
	 * @param \Kaaljyoti\Http\HttpResponse|\Kaaljyoti\Http\TransportException ...$answers What the socket does.
	 * @return FakeHttpClient The socket, for the assertions.
	 */
	private function given_api( ...$answers ): FakeHttpClient {
		$socket = new FakeHttpClient( ...$answers );

		Renderer::set_client(
			new Client(
				apiKey: 'kj_live_demo',
				httpClient: $socket,
				maxRetries: 0,
			)
		);

		return $socket;
	}

	/**
	 * The attributes `Elements` would have handed over for a panchang.
	 *
	 * @param array<string, string> $overrides What this test is about.
	 * @return array<string, string> The attributes.
	 */
	private function panchang_atts( array $overrides = array() ): array {
		return array_merge(
			array(
				'city'       => 'delhi',
				'lang'       => 'en',
				'powered-by' => 'shown',
			),
			$overrides
		);
	}

	/**
	 * The drawing's `:root` palette is scoped to the chart, so it neither
	 * sets `--kj-*` for the whole page nor beats the container's own.
	 */
	public function test_the_chart_svg_root_is_scoped(): void {
		$svg = (string) FakeHttpClient::fixture( 'chart' )['data']['svg'];
		$this->assertStringContainsString( ':root{', $svg );
		$this->given_api( FakeHttpClient::svg( $svg ) );

		$kept = array();
		Functions\when( 'set_transient' )->alias(
			static function ( string $key, $value ) use ( &$kept ): bool {
				$kept = array( $key, $value );

				return true;
			}
		);

		$html = (string) Renderer::render(
			'chart',
			array(
				'datetime' => '1990-05-14T10:30:00',
				'city'     => 'delhi',
				'lang'     => 'en',
			)
		);

		$this->assertStringNotContainsString( ':root', $html );
		$this->assertStringContainsString( ':where(.kj-server-chart){--kj-bg:#FCFAF4;', $html );
		$this->assertStringNotContainsString( ':root', (string) $kept[1] );
	}

	/**
	 * Only `:root` inside a style element is touched, and scoping twice changes nothing.
	 */
	public function test_scope_svg_styles(): void {
		$html = '<div class="kj-server kj-server-chart"><svg><style>:root{--kj-bg:#fff} :ROOT .x{fill:red}</style><text>:root{</text></svg></div>';

		$once = Renderer::scope_svg_styles( $html );

		$this->assertSame(
			'<div class="kj-server kj-server-chart"><svg><style>:where(.kj-server-chart){--kj-bg:#fff} :where(.kj-server-chart) .x{fill:red}</style><text>:root{</text></svg></div>',
			$once
		);
		$this->assertSame( $once, Renderer::scope_svg_styles( $once ) );
		$this->assertSame( '<p>plain</p>', Renderer::scope_svg_styles( '<p>plain</p>' ) );
	}

	/**
	 * An entry cached before scoping existed is scoped on the way out.
	 */
	public function test_an_old_cache_entry_is_scoped(): void {
		Functions\when( 'get_transient' )->justReturn( '<div class="kj-server kj-server-chart"><svg><style>:root{--kj-bg:#fff}</style></svg></div>' );
		$this->given_api();

		$html = (string) Renderer::render(
			'chart',
			array(
				'datetime' => '1990-05-14T10:30:00',
				'city'     => 'delhi',
			)
		);

		$this->assertStringContainsString( ':where(.kj-server-chart){--kj-bg:#fff}', $html );
	}

	/**
	 * Light and dark are written on the container; auto is the stylesheet's default.
	 */
	public function test_the_container_carries_the_theme(): void {
		$this->given_api(
			FakeHttpClient::json( FakeHttpClient::fixture_body( 'panchang' ) ),
		);

		$kept = array();
		Functions\when( 'set_transient' )->alias(
			static function ( string $key, $value ) use ( &$kept ): bool {
				$kept = array( $key, $value );

				return true;
			}
		);

		$dark = (string) Renderer::render( 'panchang', $this->panchang_atts( array( 'theme' => 'dark' ) ) );

		$this->assertStringStartsWith( '<div class="kj-server kj-server-panchang" data-theme="dark" lang="en">', $dark );
		// The cache holds the drawing without the theme, so every theme shares one call.
		$this->assertStringNotContainsString( 'data-theme', (string) $kept[1] );

		Functions\when( 'get_transient' )->justReturn( $kept[1] );

		$this->assertStringContainsString(
			'data-theme="light"',
			(string) Renderer::render( 'panchang', $this->panchang_atts( array( 'theme' => 'light' ) ) )
		);
		$this->assertStringNotContainsString(
			'data-theme',
			(string) Renderer::render( 'panchang', $this->panchang_atts() )
		);
		$this->assertSame( '<p class="kj-notice">x</p>', Renderer::with_theme( '<p class="kj-notice">x</p>', 'dark' ) );
	}

	/**
	 * A daily horoscope: the sign and the period, the summary with its level,
	 * then the five areas each with theirs — and no transits, which are the
	 * site's and not the reader's.
	 */
	public function test_a_horoscope_renders_the_summary_and_five_areas(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'horoscope' ) ) );

		$html = (string) Renderer::render( 'horoscope', $this->horoscope_atts() );

		$this->assertStringStartsWith( '<div class="kj-server kj-server-horoscope" lang="en">', $html );
		$this->assertStringContainsString( '<span class="kj-sign">Aries</span> · <span class="kj-period">Daily horoscope</span>', $html );
		$this->assertStringContainsString( '<p class="kj-date">28 Sep 2026</p>', $html );
		$this->assertStringContainsString( '<div class="kj-summary"><span class="kj-level kj-level-care">Needs care</span><p class="kj-text">Today, small setbacks are possible', $html );

		$this->assertStringContainsString( '<ul class="kj-areas"><li class="kj-area kj-area-work"><p class="kj-area-head"><strong class="kj-label">Work</strong> <span class="kj-level kj-level-mixed">Mixed</span></p><p class="kj-text">Today, the working mood is uneven', $html );
		foreach ( array( 'Work', 'Money', 'Relationships', 'Health', 'Education' ) as $area ) {
			$this->assertStringContainsString( '<strong class="kj-label">' . $area . '</strong>', $html );
		}
		// The answer's order: work first, education last.
		$this->assertLessThan( strpos( $html, 'kj-area-education' ), strpos( $html, 'kj-area-work' ) );
		$this->assertLessThan( strpos( $html, 'kj-areas' ), strpos( $html, 'kj-summary' ) );

		// The transits stay out unless the page asks for them.
		$this->assertStringNotContainsString( 'kj-basis', $html );
		$this->assertStringNotContainsString( 'Saturn', $html );

		$this->assertStringContainsString( '<p class="kj-disclaimer"><small>These predictions are indicative. For a reading of your own chart, consult an astrologer.</small></p>', $html );
		$this->assertLessThan( strpos( $html, 'kj-powered-by' ), strpos( $html, 'kj-disclaimer' ) );

		// No scores: the answer has none, and nothing is made up.
		$this->assertStringNotContainsString( '%', $html );
	}

	/**
	 * `show_basis`: the transits, folded away — each graha in its house, the
	 * Moon's change of sign told by the clock in the answer's zone, and a
	 * retrograde graha said so (Rahu and Ketu, always so, are not).
	 */
	public function test_a_horoscope_shows_its_transits_when_asked(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'horoscope' ) ) );

		$html = (string) Renderer::render( 'horoscope', $this->horoscope_atts( array( 'show-basis' => 'true' ) ) );

		$this->assertStringContainsString( '<details class="kj-basis"><summary>Transits behind this</summary>', $html );
		$this->assertSame( 10, substr_count( $html, '<li class="kj-transit ' ) );
		$this->assertStringContainsString( '<strong class="kj-graha-name">Sun</strong> in your 6th house · Virgo · favourable', $html );
		$this->assertStringContainsString( '<strong class="kj-graha-name">Moon</strong> in your 12th house · Pisces · unfavourable <span class="kj-caption kj-span">until 10:16</span>', $html );
		$this->assertStringContainsString( 'in your 1st house · Aries · favourable <span class="kj-caption kj-span">from 10:16</span>', $html );
		$this->assertStringContainsString( 'Pisces · unfavourable <span class="kj-retro">(retrograde)</span>', $html );
		$this->assertStringNotContainsString( 'Leo · unfavourable <span class="kj-retro">', $html );
		$this->assertLessThan( strpos( $html, 'kj-disclaimer' ), strpos( $html, 'kj-basis' ) );
	}

	/**
	 * Hindi: the sign's own name, the areas and levels in Hindi, and `तक`
	 * after the clock in the transits.
	 */
	public function test_a_hindi_horoscope(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'horoscope' ) ) );

		$html = (string) Renderer::render(
			'horoscope',
			$this->horoscope_atts(
				array(
					'lang'       => 'hi',
					'show-basis' => 'true',
				)
			)
		);

		$this->assertStringContainsString( 'lang="hi"', $html );
		$this->assertStringContainsString( '<span class="kj-sign">मेष</span> · <span class="kj-period">दैनिक राशिफल</span>', $html );
		$this->assertStringContainsString( '28 सितंबर 2026', $html );
		$this->assertStringContainsString( '<span class="kj-level kj-level-care">सावधानी</span><p class="kj-text">आज', $html );
		foreach ( array( 'कार्य', 'धन', 'संबंध', 'स्वास्थ्य', 'शिक्षा' ) as $area ) {
			$this->assertStringContainsString( '<strong class="kj-label">' . $area . '</strong>', $html );
		}
		$this->assertStringContainsString( 'मिश्रित', $html );
		$this->assertStringContainsString( '<strong class="kj-graha-name">सूर्य</strong> आपके षष्ठ भाव में · कन्या · शुभ', $html );
		$this->assertStringContainsString( '<span class="kj-caption kj-span">10:16 तक</span>', $html );
		$this->assertStringContainsString( '<span class="kj-retro">(वक्री)</span>', $html );
		$this->assertStringContainsString( 'ये फलादेश सांकेतिक हैं।', $html );
		$this->assertStringContainsString( 'काल ज्योति द्वारा', $html );
	}

	/**
	 * A week: the card's date line is the span of the week, and its text
	 * speaks of the week.
	 */
	public function test_a_weekly_horoscope(): void {
		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'horoscope-weekly' ) ) );

		$html = (string) Renderer::render( 'horoscope', $this->horoscope_atts( array( 'period' => 'weekly' ) ) );

		$this->assertStringContainsString( '<span class="kj-period">Weekly horoscope</span>', $html );
		$this->assertStringContainsString( '<p class="kj-date">28 Sep – 4 Oct 2026</p>', $html );
		$this->assertStringContainsString( '<p class="kj-text">This week, small setbacks are possible', $html );
		$this->assertSame( 5, substr_count( $html, '<li class="kj-area ' ) );
	}

	/**
	 * The request: the sign, the period written out, both languages under
	 * Hindi, and no zone unless one was written.
	 */
	public function test_the_horoscope_request(): void {
		$socket = $this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'horoscope' ) ) );

		Renderer::render( 'horoscope', $this->horoscope_atts( array( 'lang' => 'hi' ) ) );

		$this->assertStringEndsWith( '/v1/horoscope', $socket->requests[0]->url );
		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame( 'aries', $body['sign'] );
		$this->assertSame( 'daily', $body['period'] );
		$this->assertSame( array( 'en', 'hi' ), $body['options']['language'] );
		$this->assertArrayNotHasKey( 'timezone', $body );
		$this->assertArrayNotHasKey( 'date', $body );
		$this->assertArrayNotHasKey( 'disclaimer', $body['options'] );

		$socket = $this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'horoscope' ) ) );

		Renderer::render(
			'horoscope',
			$this->horoscope_atts(
				array(
					'period'   => 'monthly',
					'date'     => '2026-10-01',
					'timezone' => 'America/New_York',
				)
			)
		);

		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame( 'monthly', $body['period'] );
		$this->assertSame( '2026-10-01', $body['date'] );
		$this->assertSame( 'America/New_York', $body['timezone'] );
		$this->assertSame( 'en', $body['options']['language'] );
	}

	/**
	 * The disclaimer attributes become `options.disclaimer`.
	 */
	public function test_the_disclaimer_reaches_the_request(): void {
		$socket = $this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'reading-lagna' ) ) );

		Renderer::render(
			'reading',
			$this->reading_atts(
				array(
					'disclaimer-name' => 'Acharya Amit Verma',
					'disclaimer-url'  => 'https://kaaljyoti.com',
				)
			)
		);

		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame(
			array(
				'name' => 'Acharya Amit Verma',
				'url'  => 'https://kaaljyoti.com',
			),
			$body['options']['disclaimer']
		);

		$socket = $this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'horoscope' ) ) );
		Renderer::render( 'horoscope', $this->horoscope_atts( array( 'disclaimer' => 'off' ) ) );

		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame( 'off', $body['options']['disclaimer'] );
	}

	/**
	 * An answer with the line turned off ends without one.
	 */
	public function test_no_disclaimer_in_the_answer_draws_none(): void {
		$doc = FakeHttpClient::fixture( 'reading-lagna' );
		unset( $doc['data']['disclaimer'] );
		$this->given_api( FakeHttpClient::json( (string) wp_json_encode( $doc ) ) );

		$html = (string) Renderer::render( 'reading', $this->reading_atts( array( 'disclaimer' => 'off' ) ) );

		$this->assertStringContainsString( 'Leo lagna', $html );
		$this->assertStringNotContainsString( 'kj-disclaimer', $html );
	}

	/**
	 * A lagna reading: the sign, the text, the line; and in Hindi, the same
	 * from the Hindi half of the same answer.
	 */
	public function test_a_lagna_reading(): void {
		$socket = $this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'reading-lagna' ) ) );

		$html = (string) Renderer::render( 'reading', $this->reading_atts() );

		$this->assertStringEndsWith( '/v1/reports/lagna', $socket->requests[0]->url );
		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame( 'leo', $body['sign'] );
		$this->assertArrayNotHasKey( 'birth', $body );

		$this->assertStringStartsWith( '<div class="kj-server kj-server-reading" lang="en"><p class="kj-heading">Leo lagna</p>', $html );
		$this->assertStringContainsString( '<p class="kj-text">With Leo rising, the Sun is the lord of your lagna', $html );
		$this->assertStringContainsString( '<p class="kj-disclaimer"><small>These predictions are indicative.', $html );

		$this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'reading-lagna' ) ) );
		$hindi = (string) Renderer::render( 'reading', $this->reading_atts( array( 'lang' => 'hi' ) ) );

		$this->assertStringContainsString( '<p class="kj-heading">सिंह लग्न</p>', $hindi );
		$this->assertStringContainsString( 'सिंह लग्न होने पर आपके लग्न के स्वामी सूर्य हैं', $hindi );
		$this->assertStringContainsString( 'ये फलादेश सांकेतिक हैं।', $hindi );
	}

	/**
	 * A nakshatra reading calls the nakshatra endpoint with the id.
	 */
	public function test_a_nakshatra_reading(): void {
		$socket = $this->given_api( FakeHttpClient::json( FakeHttpClient::fixture_body( 'reading-nakshatra-picked' ) ) );

		$html = (string) Renderer::render(
			'reading',
			$this->reading_atts(
				array(
					'type'      => 'nakshatra',
					'nakshatra' => 'purva_phalguni',
					'lang'      => 'hi',
				)
			)
		);

		$this->assertStringEndsWith( '/v1/reports/nakshatra', $socket->requests[0]->url );
		$body = (array) json_decode( (string) $socket->requests[0]->body, true );
		$this->assertSame( 'purva_phalguni', $body['nakshatra'] );
		$this->assertArrayNotHasKey( 'sign', $body );

		$this->assertStringContainsString( '<p class="kj-heading">पूर्वा फाल्गुनी नक्षत्र</p>', $html );
		$this->assertStringContainsString( 'आपका चंद्रमा पूर्वाफाल्गुनी नक्षत्र में है', $html );
	}

	/**
	 * A horoscope with no sign, a reading with no preset, a reading of a
	 * birth and the house lords are the browser's: nothing is called and the
	 * widget is drawn.
	 */
	public function test_pickers_and_births_stay_in_the_browser(): void {
		$socket = $this->given_api();

		$this->assertNull( Renderer::render( 'horoscope', array( 'lang' => 'en' ) ) );
		$this->assertNull( Renderer::render( 'reading', array( 'lang' => 'en' ) ) );
		$this->assertNull( Renderer::render( 'reading', array( 'type' => 'nakshatra', 'sign' => 'leo' ) ) );
		$this->assertNull(
			Renderer::render(
				'reading',
				array(
					'sign'     => 'leo',
					'datetime' => '1990-05-14T10:30:00',
					'city'     => 'delhi',
				)
			)
		);
		// The house lords are always a birth's, with or without one written.
		$this->assertNull(
			Renderer::render(
				'reading',
				array(
					'type'     => 'house_lords',
					'datetime' => '1990-05-14T10:30:00',
					'city'     => 'delhi',
				)
			)
		);
		$this->assertNull( Renderer::render( 'reading', array( 'type' => 'house_lords', 'sign' => 'leo' ) ) );
		foreach ( array( 'grahas', 'yogas', 'vimshottari', 'varshphal', 'life_areas', 'kundli' ) as $type ) {
			$this->assertNull( Renderer::render( 'reading', array( 'type' => $type, 'sign' => 'leo' ) ), $type );
		}
		$this->assertSame( array(), $socket->requests );
	}

	/**
	 * Two languages of one reading are two cache entries; the same reading
	 * asked twice is one.
	 */
	public function test_readings_are_cached_by_language(): void {
		$first  = Renderer::cache_key( 'reading', array( 'sign' => 'leo' ), 'en' );
		$second = Renderer::cache_key( 'reading', array( 'sign' => 'leo' ), 'en' );

		$this->assertSame( $first, $second );
		$this->assertNotSame( $first, Renderer::cache_key( 'reading', array( 'sign' => 'leo' ), 'hi' ) );
		$this->assertNotSame( $first, Renderer::cache_key( 'horoscope', array( 'sign' => 'leo' ), 'en' ) );
	}

	/**
	 * The attributes `Elements` would have handed over for a horoscope.
	 *
	 * @param array<string, string> $overrides What this test is about.
	 * @return array<string, string> The attributes.
	 */
	private function horoscope_atts( array $overrides = array() ): array {
		return array_merge(
			array(
				'sign'       => 'aries',
				'lang'       => 'en',
				'powered-by' => 'shown',
			),
			$overrides
		);
	}

	/**
	 * The attributes `Elements` would have handed over for a lagna reading.
	 *
	 * @param array<string, string> $overrides What this test is about.
	 * @return array<string, string> The attributes.
	 */
	private function reading_atts( array $overrides = array() ): array {
		return array_merge(
			array(
				'sign'       => 'leo',
				'lang'       => 'en',
				'powered-by' => 'shown',
			),
			$overrides
		);
	}
}
