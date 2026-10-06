<?php
/**
 * The server proxy: the allowlist, the checks, the cache, the rate limit, the
 * relay, and the secret key staying on the server.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Actions;
use Brain\Monkey\Filters;
use Brain\Monkey\Functions;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Proxy;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

#[CoversClass( Proxy::class )]
final class ProxyTest extends TestCase {

	/** A secret key no answer, header or page may ever carry. */
	private const SECRET = 'kj_test_s3cr3tDoNotLeak_0123456789';

	/** A valid nonce, as the stand-in `wp_verify_nonce()` accepts it. */
	private const NONCE = 'good-nonce';

	/**
	 * What `wp_remote_post()` was asked, newest last.
	 *
	 * @var array<int, array{0: string, 1: array<string, mixed>}>
	 */
	private array $posts = array();

	/**
	 * The transients, in memory.
	 *
	 * @var array<string, mixed>
	 */
	private array $transients = array();

	/**
	 * What the API answers next: a WordPress HTTP array, or a `WP_Error`.
	 *
	 * @var mixed
	 */
	private $answer;

	/**
	 * A site with a secret key, the proxy on, PDFs on in both editions.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->posts      = array();
		$this->transients = array();
		$this->answer     = self::api( 200, self::month_envelope() );

		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'secret_key'      => self::SECRET,
				// Left by an earlier build; no longer read (see ApiBaseTest).
				'base_url'        => 'https://api-staging.kaaljyoti.com',
				'pdf'             => true,
				'pdf_editions'    => array( 'basic', 'professional' ),
			)
		);

		Functions\when( 'wp_verify_nonce' )->alias( static fn( $nonce, $action ): bool => self::NONCE === $nonce && 'wp_rest' === $action );
		Functions\when( 'wp_create_nonce' )->justReturn( self::NONCE );
		Functions\when( 'wp_hash' )->alias( static fn( string $data ): string => md5( 'salt|' . $data ) );
		Functions\when( 'rest_url' )->alias( static fn( string $path = '' ): string => 'https://example.test/wp-json/' . ltrim( $path, '/' ) );
		Functions\when( 'add_query_arg' )->alias( static fn( string $key, string $value, string $url ): string => $url . ( str_contains( $url, '?' ) ? '&' : '?' ) . $key . '=' . rawurlencode( $value ) );
		Functions\when( 'is_wp_error' )->alias( static fn( $thing ): bool => $thing instanceof \WP_Error );

		$transients = &$this->transients;
		Functions\when( 'get_transient' )->alias(
			static function ( string $key ) use ( &$transients ) {
				return $transients[ $key ] ?? false;
			}
		);
		Functions\when( 'set_transient' )->alias(
			static function ( string $key, $value ) use ( &$transients ): bool {
				$transients[ $key ] = $value;

				return true;
			}
		);

		$posts  = &$this->posts;
		$answer = &$this->answer;
		Functions\when( 'wp_remote_post' )->alias(
			static function ( string $url, array $args ) use ( &$posts, &$answer ) {
				$posts[] = array( $url, $args );

				return $answer;
			}
		);
		Functions\when( 'wp_remote_retrieve_response_code' )->alias( static fn( $response ) => $response['response']['code'] ?? '' );
		Functions\when( 'wp_remote_retrieve_body' )->alias( static fn( $response ) => $response['body'] ?? '' );
		Functions\when( 'wp_remote_retrieve_header' )->alias(
			static function ( $response, string $name ) {
				foreach ( $response['headers'] ?? array() as $key => $value ) {
					if ( strtolower( $key ) === strtolower( $name ) ) {
						return $value;
					}
				}

				return '';
			}
		);
	}

	// ---------------------------------------------------------------------
	// Hooks and the URL the page is given
	// ---------------------------------------------------------------------

	/**
	 * The route is registered on `rest_api_init`, and the raw output filter.
	 */
	public function test_hooks_register_the_route_and_the_raw_output(): void {
		Proxy::hooks();

		$this->assertNotFalse( Actions\has( 'rest_api_init', array( Proxy::class, 'register_route' ) ) );
		$this->assertNotFalse( Filters\has( 'rest_pre_serve_request', array( Proxy::class, 'serve' ) ) );

		$routes = array();
		Functions\when( 'register_rest_route' )->alias(
			static function ( string $namespace, string $route, array $args ) use ( &$routes ): bool {
				$routes[] = array( $namespace, $route, $args );

				return true;
			}
		);
		Proxy::register_route();

		$this->assertSame( 'kaaljyoti/v1', $routes[0][0] );
		$this->assertSame( '/proxy', $routes[0][1] );
		$this->assertSame( 'POST', $routes[0][2]['methods'] );
	}

	/**
	 * The page is given the endpoint with a nonce, and never the key.
	 */
	public function test_the_url_carries_a_nonce_and_no_key(): void {
		$this->assertSame( 'https://example.test/wp-json/kaaljyoti/v1/proxy?_wpnonce=' . self::NONCE, Proxy::url() );
		$this->assertStringNotContainsString( 'kj_', Proxy::url() );

		$this->given_settings(
			array(
				'secret_key'  => self::SECRET,
				'proxy_nonce' => false,
			)
		);
		$this->assertSame( 'https://example.test/wp-json/kaaljyoti/v1/proxy', Proxy::url() );
	}

	/**
	 * Off without a secret key, off when switched off, and PDFs only when on.
	 */
	public function test_enabled_needs_a_secret_key_and_the_switch(): void {
		$this->assertTrue( Proxy::enabled() );
		$this->assertSame( array( '/panchang/month', '/ephemeris/month', '/pdf/kundli', '/pdf/match' ), Proxy::allowed_paths() );

		$this->given_settings( array( 'secret_key' => '' ) );
		$this->assertFalse( Proxy::enabled() );
		$this->assertSame( array(), Proxy::allowed_paths() );
		$this->assertSame( array(), Proxy::pdf_editions() );

		$this->given_settings(
			array(
				'secret_key' => self::SECRET,
				'proxy'      => false,
			)
		);
		$this->assertFalse( Proxy::enabled() );

		$this->given_settings( array( 'secret_key' => self::SECRET ) );
		$this->assertSame( Proxy::MONTH_PATHS, Proxy::allowed_paths() );
	}

	// ---------------------------------------------------------------------
	// Refusals before the API is called
	// ---------------------------------------------------------------------

	/**
	 * Without a secret key nothing is relayed.
	 */
	public function test_no_secret_key_is_a_503_and_no_call(): void {
		$this->given_settings( array( 'secret_key' => '' ) );

		$result = $this->send( self::month_request() );

		$this->assertRefused( $result, 503, 'proxy_error' );
		$this->assertSame( array(), $this->posts );
	}

	/**
	 * Only the allowlisted routes are relayed.
	 *
	 * @param string $path A route the proxy must refuse.
	 */
	#[DataProvider( 'refused_paths' )]
	public function test_a_path_off_the_allowlist_is_refused( string $path ): void {
		$result = $this->send(
			array(
				'path' => $path,
				'body' => self::month_body(),
			)
		);

		$this->assertRefused( $result, 403, 'proxy_path_not_allowed' );
		$this->assertSame( array(), $this->posts );
	}

	/**
	 * Routes a publishable key reaches anyway, heavy ones, account routes and tricks.
	 *
	 * @return array<string, array{0: string}>
	 */
	public static function refused_paths(): array {
		return array(
			'panchang'        => array( '/panchang' ),
			'transit scan'    => array( '/transit/scan' ),
			'match batch'     => array( '/match/batch' ),
			'traversal'       => array( '/panchang/month/../../keys' ),
			'full URL'        => array( 'https://evil.example/v1/panchang/month' ),
			'with the prefix' => array( '/v1/panchang/month' ),
			'varshphal pdf'   => array( '/pdf/varshphal' ),
			'empty'           => array( '' ),
		);
	}

	/**
	 * With PDF downloads off, the PDF routes are off the list.
	 */
	public function test_pdfs_are_refused_when_switched_off(): void {
		$this->given_settings(
			array(
				'secret_key' => self::SECRET,
				'pdf'        => false,
			)
		);

		$this->assertRefused( $this->send( self::kundli_pdf_request() ), 403, 'proxy_path_not_allowed' );
	}

	/**
	 * A missing or wrong nonce is refused; the setting turns the check off.
	 */
	public function test_the_nonce_is_checked(): void {
		$this->assertRefused( $this->send( self::month_request(), array( 'nonce' => '' ) ), 403, 'proxy_forbidden' );
		$this->assertRefused( $this->send( self::month_request(), array( 'nonce' => 'stale' ) ), 403, 'proxy_forbidden' );
		$this->assertSame( array(), $this->posts );

		$this->given_settings(
			array(
				'secret_key'  => self::SECRET,
				'proxy_nonce' => false,
			)
		);
		$this->assertSame( 200, $this->send( self::month_request(), array( 'nonce' => '' ) )['status'] );
	}

	/**
	 * A request that says it comes from another site is refused.
	 */
	public function test_another_origin_is_refused(): void {
		$this->assertRefused( $this->send( self::month_request(), array( 'origin' => 'https://evil.example' ) ), 403, 'proxy_forbidden' );
		$this->assertSame( 200, $this->send( self::month_request(), array( 'origin' => 'https://example.test' ) )['status'] );
		$this->assertSame( 200, $this->send( self::month_request(), array( 'origin' => '' ) )['status'] );
	}

	/**
	 * A PDF must name this site's origin: an empty one passes for a month,
	 * but a script that leaves it out gets no PDF.
	 */
	public function test_a_pdf_needs_this_sites_origin(): void {
		$this->answer = self::pdf_answer();

		$this->assertRefused( $this->send( self::kundli_pdf_request(), array( 'origin' => '' ) ), 403, 'proxy_forbidden' );
		$this->assertRefused( $this->send( self::kundli_pdf_request(), array( 'origin' => 'https://evil.example' ) ), 403, 'proxy_forbidden' );
		$this->assertSame( array(), $this->posts );

		$this->assertSame( 200, $this->send( self::kundli_pdf_request(), array( 'origin' => 'https://example.test' ) )['status'] );
	}

	/**
	 * A body over 16 KB is refused unread.
	 */
	public function test_a_body_over_16_kb_is_refused(): void {
		$raw = (string) wp_json_encode(
			array(
				'path' => '/panchang/month',
				'body' => array_merge( self::month_body(), array( 'place' => str_repeat( 'x', Proxy::MAX_BODY ) ) ),
			)
		);

		$result = Proxy::handle( $raw, self::context() );

		$this->assertRefused( $result, 413, 'proxy_error' );
		$this->assertSame( array(), $this->posts );
	}

	/**
	 * Not JSON, or JSON of the wrong shape, or the wrong content type.
	 */
	public function test_a_malformed_request_is_refused(): void {
		$this->assertRefused( Proxy::handle( 'not json', self::context() ), 400, 'proxy_bad_request' );
		$this->assertRefused( Proxy::handle( '{"body":{}}', self::context() ), 400, 'proxy_bad_request' );
		$this->assertRefused(
			Proxy::handle( (string) wp_json_encode( self::month_request() ), array_merge( self::context(), array( 'content_type' => 'text/plain' ) ) ),
			415,
			'proxy_bad_request'
		);
	}

	/**
	 * A body the route does not take is refused rather than relayed.
	 *
	 * @param array<string, mixed> $body A broken month body.
	 */
	#[DataProvider( 'broken_month_bodies' )]
	public function test_a_broken_month_body_is_refused( array $body ): void {
		$this->assertRefused(
			$this->send(
				array(
					'path' => '/panchang/month',
					'body' => $body,
				)
			),
			400,
			'proxy_bad_request'
		);
		$this->assertSame( array(), $this->posts );
	}

	/**
	 * Month bodies with something wrong in them.
	 *
	 * @return array<string, array{0: array<string, mixed>}>
	 */
	public static function broken_month_bodies(): array {
		$good = self::month_body();

		return array(
			'no month'          => array( array_diff_key( $good, array( 'month' => 1 ) ) ),
			'bad month'         => array( array_merge( $good, array( 'month' => '2026-13' ) ) ),
			'latitude a string' => array( array_merge( $good, array( 'latitude' => '28.6' ) ) ),
			'latitude too far'  => array( array_merge( $good, array( 'latitude' => 95 ) ) ),
			'bad zone'          => array( array_merge( $good, array( 'timezone' => 'Asia/Kolkata; DROP' ) ) ),
		);
	}

	// ---------------------------------------------------------------------
	// The relay
	// ---------------------------------------------------------------------

	/**
	 * A month goes to the API with the secret key as a bearer token, the
	 * body rebuilt, and the answer comes back as it was.
	 */
	public function test_a_month_is_relayed_with_the_secret_key(): void {
		$this->answer = self::api(
			200,
			self::month_envelope(),
			array(
				'X-KJ-Plan'              => 'growth',
				'X-KJ-Request-Id'        => 'req_123',
				'X-KJ-Credits'           => '20',
				'X-KJ-Credits-Remaining' => '199412',
			)
		);

		$result = $this->send(
			array(
				'path' => '/panchang/month',
				'body' => array_merge( self::month_body(), array( 'extra' => 'dropped' ) ),
			)
		);

		list( $url, $args ) = $this->posts[0];
		// The stored `base_url` from an earlier build is ignored: production.
		$this->assertSame( 'https://api.kaaljyoti.com/v1/panchang/month', $url );
		$this->assertSame( 'Bearer ' . self::SECRET, $args['headers']['Authorization'] );
		$this->assertSame( 'application/json', $args['headers']['Content-Type'] );
		$this->assertSame( 'widgets/0.1.0', $args['headers']['X-KJ-Client'] );
		$this->assertSame( 0, $args['redirection'] );
		$this->assertStringNotContainsString( 'key=', $url );

		$sent = json_decode( $args['body'], true );
		$this->assertSame(
			array(
				'latitude'  => 28.6139,
				'longitude' => 77.209,
				'timezone'  => 'Asia/Kolkata',
				'place'     => 'New Delhi',
				'month'     => '2026-10',
				'options'   => array( 'language' => array( 'en', 'hi' ) ),
			),
			$sent
		);

		$this->assertSame( 200, $result['status'] );
		$this->assertSame( self::month_envelope(), $result['body'] );
		$this->assertSame( 'growth', $result['headers']['X-KJ-Plan'] );
		$this->assertSame( 'req_123', $result['headers']['X-KJ-Request-Id'] );
		// The account's balance is told to the secret key, and stays here.
		$this->assertArrayNotHasKey( 'X-KJ-Credits-Remaining', $result['headers'] );
		$this->assertStringNotContainsString( '199412', (string) wp_json_encode( $result['headers'] ) );
		$this->assertSame( 'nosniff', $result['headers']['X-Content-Type-Options'] );
		$this->assertSecretAbsent( $result );
	}

	/**
	 * The ephemeris keeps its zodiac, and refuses one it does not know.
	 */
	public function test_the_ephemeris_keeps_its_system(): void {
		$this->send(
			array(
				'path' => '/ephemeris/month',
				'body' => array_merge( self::month_body(), array( 'system' => 'tropical' ) ),
			)
		);
		$this->assertSame( 'tropical', json_decode( $this->posts[0][1]['body'], true )['system'] );

		$this->assertRefused(
			$this->send(
				array(
					'path' => '/ephemeris/month',
					'body' => array_merge( self::month_body(), array( 'system' => 'draconic' ) ),
				)
			),
			400,
			'proxy_bad_request'
		);
	}

	/**
	 * A 200 month is cached; the second ask is served without a call and
	 * without counting against the visitor's minute.
	 */
	public function test_a_month_is_cached(): void {
		$this->send( self::month_request() );
		$this->assertCount( 1, $this->posts );

		$key = Proxy::cache_key( '/panchang/month', Proxy::clean_body( '/panchang/month', self::month_body() ) );
		$this->assertArrayHasKey( $key, $this->transients );
		$this->assertStringStartsWith( Proxy::CACHE_PREFIX, $key );

		$again = $this->send( self::month_request() );
		$this->assertCount( 1, $this->posts );
		$this->assertSame( 200, $again['status'] );
		$this->assertSame( self::month_envelope(), $again['body'] );
		$this->assertSame( 'hit', $again['headers']['X-KJ-Proxy'] );
	}

	/**
	 * A refusal is relayed but never cached.
	 */
	public function test_a_refusal_is_relayed_and_not_cached(): void {
		$refusal      = '{"status":"error","error":{"code":"quota_exceeded","message":"this request costs 20 credits, more than is left of this month\'s 50,000 (50,000 included in the Starter plan)"}}';
		$this->answer = self::api( 402, $refusal, array( 'X-KJ-Plan' => 'starter' ) );

		$result = $this->send( self::month_request() );

		$this->assertSame( 402, $result['status'] );
		$this->assertSame( $refusal, $result['body'] );
		$this->assertSame( 'starter', $result['headers']['X-KJ-Plan'] );
		$this->assertSame( array(), array_filter( array_keys( $this->transients ), static fn( $key ) => str_starts_with( $key, Proxy::CACHE_PREFIX ) ) );
	}

	/**
	 * The API's own 429 keeps its `Retry-After`.
	 */
	public function test_the_apis_rate_limit_is_relayed(): void {
		$this->answer = self::api( 429, '{"status":"error","error":{"code":"rate_limited","message":"slow down"}}', array( 'Retry-After' => '7' ) );

		$result = $this->send( self::month_request() );

		$this->assertSame( 429, $result['status'] );
		$this->assertSame( '7', $result['headers']['Retry-After'] );
	}

	/**
	 * A dead socket is a 502 whose message carries nothing from the failure.
	 */
	public function test_a_transport_failure_is_a_502_without_details(): void {
		$this->answer = new \WP_Error( 'http_request_failed', 'cURL error 7: https://api-staging.kaaljyoti.com/v1/panchang/month Bearer ' . self::SECRET );

		$result = $this->send( self::month_request() );

		$this->assertRefused( $result, 502, 'proxy_error' );
		$this->assertSecretAbsent( $result );
		$this->assertStringNotContainsString( 'cURL', $result['body'] );
	}

	/**
	 * An answer that is not the API's envelope is a 502.
	 */
	public function test_a_non_json_answer_is_a_502(): void {
		$this->answer = self::api( 502, '<html>Bad gateway</html>' );

		$this->assertRefused( $this->send( self::month_request() ), 502, 'proxy_error' );
	}

	// ---------------------------------------------------------------------
	// Rate limits
	// ---------------------------------------------------------------------

	/**
	 * Ten months a minute by default; the eleventh is a 429 with a wait.
	 */
	public function test_months_are_limited_per_visitor(): void {
		for ( $month = 1; $month <= 10; $month++ ) {
			$result = $this->send( self::month_request( sprintf( '2026-%02d', $month ) ) );
			$this->assertSame( 200, $result['status'], 'request ' . $month );
		}

		$limited = $this->send( self::month_request( '2026-11' ) );
		$this->assertRefused( $limited, 429, 'proxy_rate_limited' );
		$this->assertGreaterThan( 0, (int) $limited['headers']['Retry-After'] );
		$this->assertLessThanOrEqual( 60, (int) $limited['headers']['Retry-After'] );
		$this->assertCount( 10, $this->posts );

		// Another visitor has their own minute.
		$this->assertSame( 200, $this->send( self::month_request( '2026-11' ), array( 'ip' => '198.51.100.9' ) )['status'] );
	}

	/**
	 * The limit's transient is keyed by a hash, never by the address.
	 */
	public function test_the_rate_limit_key_holds_no_address(): void {
		$this->send( self::month_request() );

		$keys = array_filter( array_keys( $this->transients ), static fn( $key ) => str_starts_with( $key, Proxy::RATE_PREFIX ) );
		$this->assertCount( 1, $keys );
		$this->assertStringNotContainsString( '203.0.113.5', (string) reset( $keys ) );
	}

	/**
	 * PDFs have their own, smaller limit, set in the settings.
	 */
	public function test_pdfs_have_their_own_limit(): void {
		$this->given_settings(
			array(
				'secret_key'   => self::SECRET,
				'pdf'          => true,
				'pdf_editions' => array( 'basic' ),
				'rate_pdf'     => 2,
			)
		);
		$this->answer = self::pdf_answer();

		$this->assertSame( 200, $this->send( self::kundli_pdf_request() )['status'] );
		$this->assertSame( 200, $this->send( self::kundli_pdf_request() )['status'] );
		$this->assertRefused( $this->send( self::kundli_pdf_request() ), 429, 'proxy_rate_limited' );

		// The month bucket is untouched.
		$this->answer = self::api( 200, self::month_envelope() );
		$this->assertSame( 200, $this->send( self::month_request() )['status'] );
	}

	/**
	 * Every address in one IPv6 /64 is one visitor; the next /64 is another.
	 */
	public function test_an_ipv6_visitor_is_counted_by_its_64(): void {
		for ( $i = 1; $i <= 10; $i++ ) {
			$ip     = sprintf( '2001:db8:aa:bb::%x', $i );
			$result = $this->send( self::month_request( sprintf( '2026-%02d', $i ) ), array( 'ip' => $ip ) );
			$this->assertSame( 200, $result['status'], 'request ' . $i );
		}

		$this->assertRefused( $this->send( self::month_request( '2026-11' ), array( 'ip' => '2001:db8:aa:bb:ffff:1:2:3' ) ), 429, 'proxy_rate_limited' );
		$this->assertSame( 200, $this->send( self::month_request( '2026-11' ), array( 'ip' => '2001:db8:aa:bc::1' ) )['status'] );
	}

	/**
	 * What the limit counts by: an IPv4 address as it is, IPv6 by its /64.
	 */
	public function test_the_rate_subject(): void {
		$this->assertSame( '203.0.113.5', Proxy::rate_subject( '203.0.113.5' ) );
		$this->assertSame( '2001:db8:aa:bb::/64', Proxy::rate_subject( '2001:db8:aa:bb:1:2:3:4' ) );
		$this->assertSame( '2001:db8:aa:bb::/64', Proxy::rate_subject( '2001:DB8:AA:BB::9' ) );
		$this->assertSame( '', Proxy::rate_subject( '' ) );
		$this->assertSame( 'not-an-ip', Proxy::rate_subject( 'not-an-ip' ) );
	}

	/**
	 * The site's day has a cap per bucket, whatever the visitors' addresses,
	 * with the wait until 00:00 UTC.
	 */
	public function test_the_site_has_a_daily_cap_per_bucket(): void {
		Filters\expectApplied( 'kaal_jyoti_proxy_daily_cap' )->andReturnUsing(
			static fn( int $cap, string $bucket ): int => 'month' === $bucket ? 3 : $cap
		);

		for ( $i = 1; $i <= 3; $i++ ) {
			$result = $this->send( self::month_request( sprintf( '2026-%02d', $i ) ), array( 'ip' => '198.51.100.' . $i ) );
			$this->assertSame( 200, $result['status'], 'request ' . $i );
		}

		$capped = $this->send( self::month_request( '2026-04' ), array( 'ip' => '198.51.100.99' ) );
		$this->assertRefused( $capped, 429, 'proxy_rate_limited' );
		$wait = (int) $capped['headers']['Retry-After'];
		$this->assertGreaterThan( 0, $wait );
		$this->assertLessThanOrEqual( DAY_IN_SECONDS, $wait );
		$this->assertSame( 0, ( time() + $wait ) % DAY_IN_SECONDS, 'the wait ends at 00:00 UTC' );
		$this->assertCount( 3, $this->posts );

		// A month already cached is still served: the cap counts API calls.
		$this->assertSame( 200, $this->send( self::month_request( '2026-01' ), array( 'ip' => '198.51.100.99' ) )['status'] );

		// The PDF bucket has its own.
		$this->answer = self::pdf_answer();
		$this->assertSame( 200, $this->send( self::kundli_pdf_request() )['status'] );
	}

	/**
	 * The default caps, and zero turning a cap off.
	 */
	public function test_the_daily_cap_defaults_and_off(): void {
		$this->assertSame(
			array(
				'month' => 500,
				'pdf'   => 50,
			),
			Proxy::DAILY_CAPS
		);

		Filters\expectApplied( 'kaal_jyoti_proxy_daily_cap' )->andReturn( 0 );
		$this->assertSame( 0, Proxy::daily_cap( 'pdf' ) );
		$this->assertSame( array(), array_filter( array_keys( $this->transients ), static fn( $key ) => str_starts_with( $key, Proxy::CAP_PREFIX ) ) );
	}

	/**
	 * With a persistent object cache the counters are `wp_cache_incr()`,
	 * atomic, and no transient is written.
	 */
	public function test_the_counters_use_the_object_cache_when_there_is_one(): void {
		$cache = array();
		Functions\when( 'wp_using_ext_object_cache' )->justReturn( true );
		Functions\when( 'wp_cache_add' )->alias(
			static function ( string $key, $value, string $group ) use ( &$cache ): bool {
				if ( isset( $cache[ $group . ':' . $key ] ) ) {
					return false;
				}
				$cache[ $group . ':' . $key ] = $value;

				return true;
			}
		);
		Functions\when( 'wp_cache_incr' )->alias(
			static function ( string $key, int $by, string $group ) use ( &$cache ) {
				if ( ! isset( $cache[ $group . ':' . $key ] ) ) {
					return false;
				}
				$cache[ $group . ':' . $key ] += $by;

				return $cache[ $group . ':' . $key ];
			}
		);
		Functions\when( 'wp_cache_get' )->alias(
			static fn( string $key, string $group ) => $cache[ $group . ':' . $key ] ?? false
		);

		for ( $i = 1; $i <= 10; $i++ ) {
			$this->assertSame( 200, $this->send( self::month_request( sprintf( '2026-%02d', $i ) ) )['status'], 'request ' . $i );
		}
		$limited = $this->send( self::month_request( '2026-11' ) );
		$this->assertRefused( $limited, 429, 'proxy_rate_limited' );
		$this->assertLessThanOrEqual( 60, (int) $limited['headers']['Retry-After'] );

		$counters = array_filter( array_keys( $this->transients ), static fn( $key ) => str_starts_with( $key, Proxy::RATE_PREFIX ) || str_starts_with( $key, Proxy::CAP_PREFIX ) );
		$this->assertSame( array(), $counters, 'no counter in a transient' );
		$this->assertSame( 10, $cache[ Proxy::COUNTER_GROUP . ':' . Proxy::CAP_PREFIX . 'month_' . gmdate( 'Ymd' ) ] );
	}

	/**
	 * An object cache that will not count falls back to the transient.
	 */
	public function test_a_cache_that_will_not_count_falls_back_to_transients(): void {
		Functions\when( 'wp_using_ext_object_cache' )->justReturn( true );
		Functions\when( 'wp_cache_add' )->justReturn( false );
		Functions\when( 'wp_cache_incr' )->justReturn( false );

		$this->assertSame( 200, $this->send( self::month_request() )['status'] );
		$this->assertNotSame( array(), array_filter( array_keys( $this->transients ), static fn( $key ) => str_starts_with( $key, Proxy::RATE_PREFIX ) ) );
	}

	// ---------------------------------------------------------------------
	// PDFs
	// ---------------------------------------------------------------------

	/**
	 * A kundli PDF is streamed back as the file, under the API's name, and
	 * the body sent is the one the route takes — no branding, no sections.
	 */
	public function test_a_kundli_pdf_is_streamed_with_its_filename(): void {
		$this->given_settings(
			array(
				'secret_key'      => self::SECRET,
				'pdf'             => true,
				'pdf_editions'    => array( 'basic', 'professional' ),
				'disclaimer'      => 'astrologer',
				'disclaimer_name' => 'Acharya Amit',
				'disclaimer_url'  => 'https://kaaljyoti.com',
			)
		);
		$this->answer = self::pdf_answer();

		$request                            = self::kundli_pdf_request();
		$request['body']['edition']         = 'professional';
		$request['body']['branding']        = array( 'name' => 'Not ours' );
		$request['body']['sections']        = array( 'details' );
		$request['body']['vargas']          = array( 'd1', 'd9', 'd10' );
		$request['body']['options']['disclaimer'] = 'off';

		$result = $this->send( $request );

		$this->assertSame( 200, $result['status'] );
		$this->assertSame( '%PDF-1.7 fake', $result['body'] );
		$this->assertSame( 'application/pdf', $result['headers']['Content-Type'] );
		$this->assertSame( 'attachment; filename="kundli-asha.pdf"', $result['headers']['Content-Disposition'] );
		$this->assertSame( 'private, no-store', $result['headers']['Cache-Control'] );

		list( $url, $args ) = $this->posts[0];
		// This site is on production: no base URL is stored.
		$this->assertSame( 'https://api.kaaljyoti.com/v1/pdf/kundli', $url );
		$this->assertSame( 60, $args['timeout'] );
		$sent = json_decode( $args['body'], true );
		$this->assertSame( array( 'birth', 'options', 'edition', 'name', 'template', 'chart_style' ), array_keys( $sent ) );
		$this->assertSame( 'professional', $sent['edition'] );
		$this->assertSame( 'hi', $sent['options']['language'] );
		// The site's disclaimer, not the page's.
		$this->assertSame(
			array(
				'name' => 'Acharya Amit',
				'url'  => 'https://kaaljyoti.com',
			),
			$sent['options']['disclaimer']
		);
		$this->assertSecretAbsent( $result );
	}

	/**
	 * An edition the site does not offer is refused; no edition is the first offered.
	 */
	public function test_the_edition_must_be_offered(): void {
		$this->given_settings(
			array(
				'secret_key'   => self::SECRET,
				'pdf'          => true,
				'pdf_editions' => array( 'basic' ),
			)
		);
		$this->answer = self::pdf_answer();

		$request                    = self::kundli_pdf_request();
		$request['body']['edition'] = 'professional';
		$this->assertRefused( $this->send( $request ), 400, 'proxy_bad_request' );

		unset( $request['body']['edition'] );
		$this->send( $request );
		$this->assertSame( 'basic', json_decode( $this->posts[0][1]['body'], true )['edition'] );
	}

	/**
	 * A match PDF takes both births and both names.
	 */
	public function test_a_match_pdf_is_relayed(): void {
		$this->answer = self::pdf_answer( 'attachment; filename="match-asha-ravi.pdf"' );

		$result = $this->send(
			array(
				'path' => '/pdf/match',
				'body' => array(
					'bride'        => self::birth(),
					'groom'        => self::birth(),
					'options'      => array( 'language' => 'en' ),
					'name'         => 'Asha',
					'partner_name' => 'Ravi',
					'template'     => 'modern',
					'edition'      => 'professional',
				),
			)
		);

		$this->assertSame( 'attachment; filename="match-asha-ravi.pdf"', $result['headers']['Content-Disposition'] );
		$sent = json_decode( $this->posts[0][1]['body'], true );
		$this->assertSame( array( 'bride', 'groom', 'options', 'name', 'partner_name', 'template' ), array_keys( $sent ) );
		$this->assertArrayNotHasKey( 'edition', $sent );
	}

	/**
	 * A filename that is not a plain `.pdf` name is replaced.
	 *
	 * @param string $disposition The API's header.
	 * @param string $expected    The name the visitor gets.
	 */
	#[DataProvider( 'dispositions' )]
	public function test_the_filename_is_kept_only_when_plain( string $disposition, string $expected ): void {
		$this->assertSame( $expected, Proxy::file_name( $disposition, '/pdf/kundli' ) );
	}

	/**
	 * Headers the API might send.
	 *
	 * @return array<string, array{0: string, 1: string}>
	 */
	public static function dispositions(): array {
		return array(
			'plain'     => array( 'attachment; filename="kundli-ravi-kumar.pdf"', 'kundli-ravi-kumar.pdf' ),
			'unquoted'  => array( 'attachment; filename=kundli.pdf', 'kundli.pdf' ),
			'traversal' => array( 'attachment; filename="../../wp-config.php"', 'kundli.pdf' ),
			'quote'     => array( 'attachment; filename="a\\"b.pdf"', 'kundli.pdf' ),
			'none'      => array( '', 'kundli.pdf' ),
		);
	}

	/**
	 * The API refusing a PDF on the plan, or over the month's PDFs, is relayed
	 * as JSON for the widget's plan card and its plain line.
	 *
	 * @param int    $status The API's status.
	 * @param string $code   The API's code.
	 */
	#[DataProvider( 'pdf_refusals' )]
	public function test_a_pdf_refusal_is_relayed_as_json( int $status, string $code ): void {
		$body         = '{"status":"error","error":{"code":"' . $code . '","message":"…"}}';
		$this->answer = self::api( $status, $body );

		$result = $this->send( self::kundli_pdf_request() );

		$this->assertSame( $status, $result['status'] );
		$this->assertSame( $body, $result['body'] );
		$this->assertStringStartsWith( 'application/json', $result['headers']['Content-Type'] );
	}

	/**
	 * What the API says to a PDF it will not print.
	 *
	 * @return array<string, array{0: int, 1: string}>
	 */
	public static function pdf_refusals(): array {
		return array(
			'plan'  => array( 403, 'plan_required' ),
			'quota' => array( 402, 'pdf_quota_exceeded' ),
		);
	}

	// ---------------------------------------------------------------------
	// The REST adapter and the raw output
	// ---------------------------------------------------------------------

	/**
	 * The REST callback reads the body, the nonce and the headers, and
	 * answers with the relay's status, headers and raw body.
	 */
	public function test_the_rest_callback_wraps_the_relay(): void {
		$_SERVER['REMOTE_ADDR'] = '203.0.113.5';
		Functions\when( 'wp_unslash' )->returnArg( 1 );

		$request = new \WP_REST_Request(
			(string) wp_json_encode( self::month_request() ),
			array( '_wpnonce' => self::NONCE ),
			array(
				'content_type' => 'application/json',
				'origin'       => 'https://example.test',
				'x_kj_client'  => 'widgets/0.1.0',
			)
		);

		$response = Proxy::handle_rest( $request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( self::month_envelope(), $response->get_data() );
		$this->assertSame( 'nosniff', $response->get_headers()['X-Content-Type-Options'] );
	}

	/**
	 * The relay's body is written as it is, for our route only.
	 */
	public function test_serve_writes_the_raw_body_for_the_proxy_route_only(): void {
		$response = new \WP_REST_Response( '%PDF-1.7 fake', 200 );

		ob_start();
		$served = Proxy::serve( false, $response, new \WP_REST_Request() );
		$this->assertSame( '%PDF-1.7 fake', ob_get_clean() );
		$this->assertTrue( $served );

		ob_start();
		$this->assertFalse( Proxy::serve( false, $response, new \WP_REST_Request( '', array(), array(), '/wp/v2/posts' ) ) );
		$this->assertSame( '', ob_get_clean() );

		$this->assertFalse( Proxy::serve( false, new \WP_REST_Response( array( 'a' => 1 ) ), new \WP_REST_Request() ) );
	}

	// ---------------------------------------------------------------------
	// The page
	// ---------------------------------------------------------------------

	/**
	 * The script tag carries the proxy's URL and the PDF editions, never the
	 * secret key; without a key it carries neither.
	 */
	public function test_the_script_tag_advertises_the_proxy_without_the_key(): void {
		$tag = Assets::script_attributes( '<script src="v1.js"></script>', Assets::SCRIPT_HANDLE );

		$this->assertStringContainsString( ' data-proxy="https://example.test/wp-json/kaaljyoti/v1/proxy?_wpnonce=' . self::NONCE . '"', $tag );
		$this->assertStringContainsString( ' data-pdf="basic professional"', $tag );
		$this->assertStringNotContainsString( self::SECRET, $tag );
		$this->assertStringNotContainsString( 'kj_test_', $tag );

		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'secret_key'      => '',
				'pdf'             => true,
			)
		);
		$tag = Assets::script_attributes( '<script src="v1.js"></script>', Assets::SCRIPT_HANDLE );
		$this->assertStringNotContainsString( 'data-proxy=', $tag );
		$this->assertStringNotContainsString( 'data-pdf=', $tag );
		// The no-proxy card still has somewhere to send the site owner.
		$this->assertStringContainsString( ' data-proxy-docs="https://kaaljyoti.com/api/docs/wordpress#proxy"', $tag );
	}

	// ---------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------

	/**
	 * Sends a request through the proxy with a good context.
	 *
	 * @param array<string, mixed> $request  `{path, body}`.
	 * @param array<string, mixed> $override Context to change.
	 * @return array{status: int, headers: array<string, string>, body: string}
	 */
	private function send( array $request, array $override = array() ): array {
		return Proxy::handle( (string) wp_json_encode( $request ), array_merge( self::context(), $override ) );
	}

	/**
	 * The context a widget on this site sends.
	 *
	 * @return array<string, string>
	 */
	private static function context(): array {
		return array(
			'nonce'        => self::NONCE,
			'origin'       => 'https://example.test',
			'content_type' => 'application/json',
			'client'       => 'widgets/0.1.0',
			'ip'           => '203.0.113.5',
		);
	}

	/**
	 * A month body, as the widget sends it.
	 *
	 * @return array<string, mixed>
	 */
	private static function month_body(): array {
		return array(
			'latitude'  => 28.6139,
			'longitude' => 77.209,
			'timezone'  => 'Asia/Kolkata',
			'place'     => 'New Delhi',
			'month'     => '2026-10',
			'options'   => array( 'language' => array( 'en', 'hi' ) ),
		);
	}

	/**
	 * A month request.
	 *
	 * @param string $month The month.
	 * @return array<string, mixed>
	 */
	private static function month_request( string $month = '2026-10' ): array {
		return array(
			'path' => '/panchang/month',
			'body' => array_merge( self::month_body(), array( 'month' => $month ) ),
		);
	}

	/**
	 * A birth, as the forms send it.
	 *
	 * @return array<string, mixed>
	 */
	private static function birth(): array {
		return array(
			'datetime'  => '1990-05-14T10:30:00',
			'latitude'  => 25.3176,
			'longitude' => 82.9739,
			'timezone'  => 'Asia/Kolkata',
			'place'     => 'Varanasi',
		);
	}

	/**
	 * A kundli PDF request, as the kundli report sends it.
	 *
	 * @return array<string, mixed>
	 */
	private static function kundli_pdf_request(): array {
		return array(
			'path' => '/pdf/kundli',
			'body' => array(
				'birth'       => self::birth(),
				'options'     => array( 'language' => 'hi' ),
				'edition'     => 'basic',
				'name'        => 'Asha',
				'template'    => 'traditional',
				'chart_style' => 'south',
			),
		);
	}

	/**
	 * The API's month answer, as text.
	 *
	 * @return string
	 */
	private static function month_envelope(): string {
		return '{"status":"ok","data":{"month":"2026-10","days":[{"date":"2026-10-01","tithi":{"number":5}}]},"meta":{"engine":"0.14.2"}}';
	}

	/**
	 * A WordPress HTTP answer.
	 *
	 * @param int                   $status  The status.
	 * @param string                $body    The body.
	 * @param array<string, string> $headers Headers.
	 * @return array<string, mixed>
	 */
	private static function api( int $status, string $body, array $headers = array() ): array {
		return array(
			'response' => array( 'code' => $status ),
			'headers'  => array_merge( array( 'Content-Type' => 'application/json' ), $headers ),
			'body'     => $body,
		);
	}

	/**
	 * A PDF answer.
	 *
	 * @param string $disposition The `Content-Disposition` header.
	 * @return array<string, mixed>
	 */
	private static function pdf_answer( string $disposition = 'attachment; filename="kundli-asha.pdf"' ): array {
		return array(
			'response' => array( 'code' => 200 ),
			'headers'  => array(
				'Content-Type'        => 'application/pdf',
				'Content-Disposition' => $disposition,
			),
			'body'     => '%PDF-1.7 fake',
		);
	}

	/**
	 * A refusal with this status and code, in the envelope.
	 *
	 * @param array{status: int, headers: array<string, string>, body: string} $result The answer.
	 * @param int                                                           $status The status.
	 * @param string                                                        $code   The code.
	 */
	private function assertRefused( array $result, int $status, string $code ): void {
		$this->assertSame( $status, $result['status'] );
		$body = json_decode( $result['body'], true );
		$this->assertSame( 'error', $body['status'] ?? null );
		$this->assertSame( $code, $body['error']['code'] ?? null );
		$this->assertSecretAbsent( $result );
	}

	/**
	 * Nothing in an answer carries the secret key.
	 *
	 * @param array{status: int, headers: array<string, string>, body: string} $result The answer.
	 */
	private function assertSecretAbsent( array $result ): void {
		$this->assertStringNotContainsString( self::SECRET, $result['body'] );
		$this->assertStringNotContainsString( self::SECRET, implode( "\n", $result['headers'] ) );
	}
}
