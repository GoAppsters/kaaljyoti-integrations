<?php
/**
 * The socket, replaced by a queue.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests\Support;

use Kaaljyoti\Http\HttpClient;
use Kaaljyoti\Http\HttpRequest;
use Kaaljyoti\Http\HttpResponse;
use Kaaljyoti\Http\TransportException;
use LogicException;

/**
 * Answers the SDK from a list, and keeps what went out.
 *
 * The renderer's tests run a real `Kaaljyoti\Client` over one of these, so the
 * whole path — the request body, the envelope, the models — is the shipping
 * one and only the wire is a fixture. A client built with an empty queue is
 * how a test says "the API must not be called at all".
 */
final class FakeHttpClient implements HttpClient {

	/**
	 * Every request that was sent, in order.
	 *
	 * @var HttpRequest[]
	 */
	public array $requests = array();

	/**
	 * What the socket will do, in order.
	 *
	 * @var array<int, HttpResponse|TransportException>
	 */
	private array $queue;

	/**
	 * @param HttpResponse|TransportException ...$answers What each send answers with.
	 */
	public function __construct( HttpResponse|TransportException ...$answers ) {
		$this->queue = array_values( $answers );
	}

	/**
	 * Sends one request.
	 *
	 * @param HttpRequest $request The request.
	 * @return HttpResponse The next queued answer.
	 * @throws TransportException When the queue says the socket died.
	 * @throws LogicException When nothing was queued.
	 */
	public function send( HttpRequest $request ): HttpResponse {
		$this->requests[] = $request;

		$next = array_shift( $this->queue );
		if ( null === $next ) {
			throw new LogicException( 'FakeHttpClient: the API was called and nothing was queued.' );
		}

		if ( $next instanceof TransportException ) {
			throw $next;
		}

		return $next;
	}

	/**
	 * A JSON answer.
	 *
	 * @param string                $body    The body, already encoded.
	 * @param int                   $status  The HTTP status.
	 * @param array<string, string> $headers Extra headers, lower-cased.
	 * @return HttpResponse The answer.
	 */
	public static function json( string $body, int $status = 200, array $headers = array() ): HttpResponse {
		return new HttpResponse(
			$status,
			array_merge( array( 'content-type' => 'application/json' ), $headers ),
			$body
		);
	}

	/**
	 * A drawn chart: the document itself, with no envelope around it.
	 *
	 * @param string                $svg     The markup.
	 * @param array<string, string> $headers Extra headers, lower-cased.
	 * @return HttpResponse The answer.
	 */
	public static function svg( string $svg, array $headers = array() ): HttpResponse {
		return new HttpResponse(
			200,
			array_merge( array( 'content-type' => 'image/svg+xml' ), $headers ),
			$svg
		);
	}

	/**
	 * One of the API's error envelopes.
	 *
	 * @param string $code   The error code.
	 * @param int    $status The HTTP status.
	 * @return HttpResponse The answer.
	 */
	public static function failure( string $code, int $status = 422 ): HttpResponse {
		$body = wp_json_encode(
			array(
				'status' => 'error',
				'error'  => array(
					'code'    => $code,
					'message' => 'No.',
				),
			)
		);

		return self::json( (string) $body, $status );
	}

	/**
	 * A fixture from `tests/fixtures`.
	 *
	 * @param string $name The file name, without the extension.
	 * @return array<string, mixed> The decoded document.
	 */
	public static function fixture( string $name ): array {
		$path = dirname( __DIR__ ) . '/fixtures/' . $name . '.json';
		$json = (string) file_get_contents( $path );

		return (array) json_decode( $json, true, 512, JSON_THROW_ON_ERROR );
	}

	/**
	 * A fixture, as the bytes the API would have sent.
	 *
	 * @param string $name The file name, without the extension.
	 * @return string The body.
	 */
	public static function fixture_body( string $name ): string {
		$path = dirname( __DIR__ ) . '/fixtures/' . $name . '.json';

		return (string) file_get_contents( $path );
	}
}
