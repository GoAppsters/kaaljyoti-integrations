<?php // phpcs:disable WordPress.Files.FileName -- PSR-4: the file is named for the class it holds.
/**
 * The SDK's one network seam, answered by WordPress's own HTTP API.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Server;

use Kaaljyoti\Http\HttpClient;
use Kaaljyoti\Http\HttpRequest;
use Kaaljyoti\Http\HttpResponse;
use Kaaljyoti\Http\TransportException;

defined( 'ABSPATH' ) || exit;

/**
 * `Kaaljyoti\Http\HttpClient` over `wp_remote_request()`.
 *
 * The SDK bundles no HTTP client of its own (its design decision 1), which is
 * what lets the plugin ship it without a `vendor/` full of somebody else's
 * Guzzle. Everything about the request has already been decided by the time it
 * arrives here — where the key went, which headers, how the body was encoded —
 * so this class only translates one vocabulary into the other, and back.
 *
 * Two rules come from the interface and are worth stating:
 *
 *   * a `WP_Error` is a {@see TransportException}, never an invented status,
 *     because the SDK retries a dead socket on a different budget than a 500;
 *   * header names come back lower-cased, because that is what
 *     {@see HttpResponse} promises its readers.
 */
final class WpHttpClient implements HttpClient {

	/**
	 * Sends one request and returns what came back.
	 *
	 * @param HttpRequest $request The request the SDK's transport already decided.
	 * @return HttpResponse The answer, with its status, headers and body.
	 * @throws TransportException When WordPress got no answer at all.
	 */
	public function send( HttpRequest $request ): HttpResponse {
		$args = array(
			'method'    => $request->method,
			'headers'   => $request->headers,
			'timeout'   => $request->timeoutSeconds,
			// Certificate verification stays on, and the plugin never offers a
			// way to turn it off: a site that must talk to a host carrying its
			// own certificate has WordPress's `https_ssl_verify` filter, which
			// is the site owner's decision to make and not ours.
			'sslverify' => true,
		);

		if ( null !== $request->body ) {
			$args['body'] = $request->body;
		}

		$answer = wp_remote_request( $request->url, $args );

		if ( is_wp_error( $answer ) ) {
			$message = (string) $answer->get_error_message();

			// phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- not output: the SDK's transport reads this message and turns it into an error code; nothing prints it.
			throw new TransportException(
				// The URL never travels in the message. For a publishable key
				// the key is *in* the URL, and an exception message is the
				// thing that ends up in a log.
				self::without_url( $message, $request->url ),
				timedOut: self::is_timeout( (string) $answer->get_error_code(), $message )
			);
			// phpcs:enable WordPress.Security.EscapeOutput.ExceptionNotEscaped
		}

		return new HttpResponse(
			(int) wp_remote_retrieve_response_code( $answer ),
			self::headers( wp_remote_retrieve_headers( $answer ) ),
			(string) wp_remote_retrieve_body( $answer )
		);
	}

	/**
	 * Whether the deadline is what killed the request.
	 *
	 * This is the only signal the SDK's transport has for telling `timeout`
	 * from `network_error`, and WordPress spells it differently depending on
	 * which transport ran: cURL says "Operation timed out after 10000
	 * milliseconds", the streams transport raises `http_request_timeout`,
	 * and a slow body raises "Operation too slow".
	 *
	 * @param string $code    The `WP_Error` code.
	 * @param string $message The `WP_Error` message.
	 * @return bool True when this was a deadline rather than a dead socket.
	 */
	private static function is_timeout( string $code, string $message ): bool {
		$haystack = strtolower( $code . ' ' . $message );

		return str_contains( $haystack, 'timed out' )
			|| str_contains( $haystack, 'timeout' )
			|| str_contains( $haystack, 'operation too slow' );
	}

	/**
	 * The error message with the request URL taken out of it.
	 *
	 * @param string $message The `WP_Error` message.
	 * @param string $url     The URL that was asked for.
	 * @return string The message, with nothing secret left in it.
	 */
	private static function without_url( string $message, string $url ): string {
		return trim( str_replace( $url, '', $message ) );
	}

	/**
	 * The response headers as {@see HttpResponse} wants them.
	 *
	 * WordPress hands back a case-insensitive dictionary object, or a plain
	 * array from a transport or a test that built one; a header sent twice
	 * arrives as an array of values and the last one wins, which is what the
	 * SDK documents. None of the headers it reads is ever repeated.
	 *
	 * @param mixed $headers Whatever `wp_remote_retrieve_headers()` returned.
	 * @return array<string, string> Header names lower-cased.
	 */
	private static function headers( $headers ): array {
		if ( is_object( $headers ) && method_exists( $headers, 'getAll' ) ) {
			$headers = $headers->getAll();
		}

		if ( ! is_array( $headers ) ) {
			return array();
		}

		$clean = array();
		foreach ( $headers as $name => $value ) {
			if ( is_array( $value ) ) {
				$value = array() === $value ? '' : end( $value );
			}

			if ( is_scalar( $value ) || null === $value ) {
				$clean[ strtolower( (string) $name ) ] = (string) $value;
			}
		}

		return $clean;
	}
}
