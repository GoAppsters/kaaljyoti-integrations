<?php
/**
 * Just enough of WordPress's REST request and response for the proxy's
 * adapter, and of `WP_Error` for a failed call. Declared only when WordPress
 * itself is not loaded.
 *
 * @package KaalJyoti\WP
 */

// phpcs:disable Generic.Files.OneObjectStructurePerFile.MultipleFound, WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound -- stand-ins for WordPress's own classes, under their names.

declare(strict_types=1);

if ( ! class_exists( 'WP_REST_Request' ) ) {
	/**
	 * A request: a body, query parameters and headers.
	 */
	class WP_REST_Request {

		/**
		 * The request.
		 *
		 * @param string                $body    The raw body.
		 * @param array<string, string> $params  Query parameters.
		 * @param array<string, string> $headers Headers, keyed as WordPress keys them (lower case, `_` for `-`).
		 * @param string                $route   The matched route.
		 */
		public function __construct(
			private string $body = '',
			private array $params = array(),
			private array $headers = array(),
			private string $route = '/kaaljyoti/v1/proxy'
		) {
		}

		/**
		 * The raw body.
		 *
		 * @return string The body.
		 */
		public function get_body(): string {
			return $this->body;
		}

		/**
		 * One parameter.
		 *
		 * @param string $name The name.
		 * @return mixed The value, or null.
		 */
		public function get_param( string $name ) {
			return $this->params[ $name ] ?? null;
		}

		/**
		 * One header.
		 *
		 * @param string $name The name, as WordPress keys it.
		 * @return string|null The value, or null.
		 */
		public function get_header( string $name ): ?string {
			return $this->headers[ $name ] ?? null;
		}

		/**
		 * The route.
		 *
		 * @return string The route.
		 */
		public function get_route(): string {
			return $this->route;
		}
	}
}

if ( ! class_exists( 'WP_REST_Response' ) ) {
	/**
	 * A response: data, a status and headers.
	 */
	class WP_REST_Response {

		/**
		 * Headers set on it.
		 *
		 * @var array<string, string>
		 */
		public array $headers = array();

		/**
		 * The response.
		 *
		 * @param mixed $data   The data.
		 * @param int   $status The HTTP status.
		 */
		public function __construct( public $data = null, public int $status = 200 ) {
		}

		/**
		 * Sets one header.
		 *
		 * @param string $name  The name.
		 * @param string $value The value.
		 * @return void
		 */
		public function header( string $name, string $value ): void {
			$this->headers[ $name ] = $value;
		}

		/**
		 * The data.
		 *
		 * @return mixed The data.
		 */
		public function get_data() {
			return $this->data;
		}

		/**
		 * The status.
		 *
		 * @return int The status.
		 */
		public function get_status(): int {
			return $this->status;
		}

		/**
		 * The headers.
		 *
		 * @return array<string, string> The headers.
		 */
		public function get_headers(): array {
			return $this->headers;
		}
	}
}

if ( ! class_exists( 'WP_Error' ) ) {
	/**
	 * A failure, with a code and a message.
	 */
	class WP_Error {

		/**
		 * The error.
		 *
		 * @param string $code    The code.
		 * @param string $message The message.
		 */
		public function __construct( private string $code = '', private string $message = '' ) {
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
	}
}
