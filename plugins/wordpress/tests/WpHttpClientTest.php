<?php
/**
 * The SDK's request and response, in WordPress's vocabulary.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Server\WpHttpClient;
use Kaaljyoti\Http\HttpRequest;
use Kaaljyoti\Http\TransportException;
use PHPUnit\Framework\Attributes\CoversClass;

#[CoversClass( WpHttpClient::class )]
final class WpHttpClientTest extends TestCase {

	/**
	 * What `wp_remote_request()` was called with, newest last.
	 *
	 * @var array<int, array{0: string, 1: array<string, mixed>}>
	 */
	private array $calls = array();

	/**
	 * Nothing real is sent.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->calls = array();

		Functions\when( 'is_wp_error' )->alias(
			static fn( $thing ): bool => is_object( $thing ) && method_exists( $thing, 'get_error_code' )
		);
	}

	/**
	 * Everything the SDK decided is handed to WordPress unchanged.
	 */
	public function test_the_request_is_mapped(): void {
		$this->given_answer( array(), 200, array(), '' );

		( new WpHttpClient() )->send( $this->request() );

		list( $url, $args ) = $this->calls[0];

		$this->assertSame( 'https://api.kaaljyoti.com/v1/panchang', $url );
		$this->assertSame( 'POST', $args['method'] );
		$this->assertSame( array( 'Accept' => 'application/json' ), $args['headers'] );
		$this->assertSame( '{"latitude":28.6}', $args['body'] );
		$this->assertSame( 10.0, $args['timeout'] );
		$this->assertTrue( $args['sslverify'] );
	}

	/**
	 * A request with no body does not send an empty one.
	 */
	public function test_a_bodyless_request_carries_no_body(): void {
		$this->given_answer( array(), 200, array(), '' );

		( new WpHttpClient() )->send( $this->request( null, 'GET' ) );

		$this->assertArrayNotHasKey( 'body', $this->calls[0][1] );
	}

	/**
	 * The status, the headers and the bytes come back as the SDK reads them.
	 */
	public function test_the_response_is_mapped(): void {
		$this->given_answer(
			array(),
			201,
			array(
				'Content-Type' => 'application/json',
				'X-KJ-Plan'    => 'growth',
			),
			'{"status":"ok"}'
		);

		$response = ( new WpHttpClient() )->send( $this->request() );

		$this->assertSame( 201, $response->status );
		$this->assertSame( '{"status":"ok"}', $response->body );
		// Lower-cased, which is what `header()` looks the name up as.
		$this->assertSame( 'growth', $response->header( 'X-KJ-Plan' ) );
		$this->assertSame( 'application/json', $response->headers['content-type'] );
		$this->assertTrue( $response->isOk() );
	}

	/**
	 * WordPress hands headers back as a case-insensitive dictionary object.
	 */
	public function test_a_header_dictionary_is_read(): void {
		$dictionary = new class() {
			/**
			 * The headers, as the object holds them.
			 *
			 * @return array<string, string> The headers.
			 */
			public function getAll(): array { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.MethodNameInvalid -- the name WordPress's own class uses.
				return array( 'X-KJ-Request-Id' => 'req_1' );
			}
		};

		$this->given_answer( array(), 200, $dictionary, '' );

		$this->assertSame( 'req_1', ( new WpHttpClient() )->send( $this->request() )->header( 'x-kj-request-id' ) );
	}

	/**
	 * A header sent twice keeps the last value.
	 */
	public function test_a_repeated_header_keeps_the_last_value(): void {
		$this->given_answer( array(), 200, array( 'X-KJ-Plan' => array( 'free', 'growth' ) ), '' );

		$this->assertSame( 'growth', ( new WpHttpClient() )->send( $this->request() )->header( 'x-kj-plan' ) );
	}

	/**
	 * A dead socket is a transport failure, never an invented status.
	 */
	public function test_a_wp_error_becomes_a_transport_exception(): void {
		$this->given_error( 'http_request_failed', 'Could not resolve host' );

		try {
			( new WpHttpClient() )->send( $this->request() );
			$this->fail( 'Expected a TransportException.' );
		} catch ( TransportException $error ) {
			$this->assertFalse( $error->timedOut );
			$this->assertSame( 'Could not resolve host', $error->getMessage() );
		}
	}

	/**
	 * cURL says so in the message…
	 */
	public function test_a_timeout_is_flagged_from_the_message(): void {
		$this->given_error( 'http_request_failed', 'cURL error 28: Operation timed out after 10000 milliseconds' );

		try {
			( new WpHttpClient() )->send( $this->request() );
			$this->fail( 'Expected a TransportException.' );
		} catch ( TransportException $error ) {
			$this->assertTrue( $error->timedOut );
		}
	}

	/**
	 * …and the streams transport says so in the code.
	 */
	public function test_a_timeout_is_flagged_from_the_code(): void {
		$this->given_error( 'http_request_timeout', 'No answer' );

		try {
			( new WpHttpClient() )->send( $this->request() );
			$this->fail( 'Expected a TransportException.' );
		} catch ( TransportException $error ) {
			$this->assertTrue( $error->timedOut );
		}
	}

	/**
	 * The URL never travels in the message: for a publishable key it is the key.
	 */
	public function test_the_url_is_kept_out_of_the_message(): void {
		$url = 'https://api.kaaljyoti.com/v1/panchang?key=kj_pub_secret';
		$this->given_error( 'http_request_failed', 'Failed to open ' . $url );

		try {
			( new WpHttpClient() )->send( $this->request( '{}', 'POST', $url ) );
			$this->fail( 'Expected a TransportException.' );
		} catch ( TransportException $error ) {
			$this->assertStringNotContainsString( 'kj_pub_secret', $error->getMessage() );
			$this->assertSame( 'Failed to open', $error->getMessage() );
		}
	}

	/**
	 * One request, shaped the way the SDK's transport builds them.
	 *
	 * @param string|null $body   The encoded body.
	 * @param string      $method The verb.
	 * @param string|null $url    The URL, when a test cares.
	 * @return HttpRequest The request.
	 */
	private function request( ?string $body = '{"latitude":28.6}', string $method = 'POST', ?string $url = null ): HttpRequest {
		return new HttpRequest(
			method: $method,
			url: $url ?? 'https://api.kaaljyoti.com/v1/panchang',
			headers: array( 'Accept' => 'application/json' ),
			body: $body,
			timeoutSeconds: 10.0,
		);
	}

	/**
	 * Makes `wp_remote_request()` answer, and records what it was asked.
	 *
	 * @param array<string, mixed> $answer  What the function returns.
	 * @param int                  $status  The status to retrieve.
	 * @param mixed                $headers The headers to retrieve.
	 * @param string               $body    The body to retrieve.
	 * @return void
	 */
	private function given_answer( array $answer, int $status, $headers, string $body ): void {
		$calls = &$this->calls;

		Functions\when( 'wp_remote_request' )->alias(
			static function ( string $url, array $args ) use ( &$calls, $answer ) {
				$calls[] = array( $url, $args );

				return $answer;
			}
		);

		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( $status );
		Functions\when( 'wp_remote_retrieve_headers' )->justReturn( $headers );
		Functions\when( 'wp_remote_retrieve_body' )->justReturn( $body );
	}

	/**
	 * Makes `wp_remote_request()` answer with a `WP_Error`.
	 *
	 * @param string $code    The error code.
	 * @param string $message The error message.
	 * @return void
	 */
	private function given_error( string $code, string $message ): void {
		$error = new class( $code, $message ) {
			/**
			 * @param string $code    The error code.
			 * @param string $message The error message.
			 */
			public function __construct( private string $code, private string $message ) {
			}

			/**
			 * The code.
			 *
			 * @return string The code.
			 */
			public function get_error_code(): string {
				return $this->code;
			}

			/**
			 * The message.
			 *
			 * @return string The message.
			 */
			public function get_error_message(): string {
				return $this->message;
			}
		};

		Functions\when( 'wp_remote_request' )->justReturn( $error );
	}
}
