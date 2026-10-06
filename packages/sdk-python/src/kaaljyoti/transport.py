"""The one HTTP call in the package.

Every method on `Kaaljyoti` is a path, a body and a document type; all the
behaviour a caller would otherwise have to reimplement — where the key goes,
which failures are worth retrying, what a `Retry-After` means, which headers
carry the answer's provenance — happens once, here.

Four rules are not negotiable:

1. **The key's prefix decides where it travels.** `kj_pub_…` goes in `?key=`,
   because a browser cannot set `Authorization` cross-origin without a
   preflight the gateway does not grant; everything else goes in
   `Authorization: Bearer`, because the gateway refuses a secret key in a URL
   outright and a URL ends up in logs, history and referrers
   (https://kaaljyoti.com/api/docs/authentication).
2. **The envelope is not hidden.** `meta` comes back with the data.
3. **Retries are bounded and honest.** A 429 waits what it was told to wait;
   an `engine_error` and a dead socket each get one more try; a `400` gets
   none, because the identical body will be refused identically.
4. **Nothing escapes as a raw `ValueError` or a socket error.** A caller gets a
   `Result` or a `KaaljyotiError` with a `code`.
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
from collections.abc import Callable, Mapping
from typing import Any, Final, TypeVar, overload

from kaaljyoti.errors import KaaljyotiError
from kaaljyoti.generated.version import SDK_VERSION
from kaaljyoti.http import HttpClient, HttpRequest, HttpResponse, TransportError, UrllibClient
from kaaljyoti.result import PdfFile, RateLimit, Result

__all__ = ["Transport", "filename_of"]

T = TypeVar("T")
M = TypeVar("M")

_PUBLISHABLE_PREFIX: Final = "kj_pub_"
"""Publishable keys, and only these, may travel in a query string."""

_DEFAULT_RETRY_SECONDS: Final = 2
"""A 429 without a usable `Retry-After`; the gateway always sends one."""

_MAX_RETRY_SECONDS: Final = 30
"""Longest we will sit on a retry. Past this, the caller should decide."""

_CREDITS_HEADER: Final = "X-KJ-Credits"
"""What the request cost: the one place an SVG or a PDF, with no `meta`, says so."""

_CREDITS_REMAINING_HEADER: Final = "X-KJ-Credits-Remaining"
"""What is left of the month and the credit packs. Secret keys only."""

_EXTENDED_FILENAME: Final = re.compile(r"filename\*\s*=\s*utf-8''([^;]+)", re.IGNORECASE)
"""RFC 6266 `filename*=UTF-8''…`, the form that can carry a name in Devanagari."""

_PLAIN_FILENAME: Final = re.compile(r'filename\s*=\s*(?:"([^"]*)"|([^;\s]+))')
"""`filename="…"` or `filename=…`."""

_RESERVED_HEADERS: Final = frozenset({"accept", "authorization", "content-type", "x-kj-client"})
"""Headers the transport decides; a caller's `headers` cannot replace them."""


class Transport:
    """Key placement, headers, timeout, retries, and the envelope → `Result` | `KaaljyotiError`.

    Built by `Kaaljyoti` from its own options; there is no reason to construct
    one directly outside a test that needs to replace the retry sleep, and
    `Kaaljyoti.with_transport()` is the way in for that.
    """

    DEFAULT_BASE_URL: Final = "https://api.kaaljyoti.com"
    """Where the API lives when nobody says otherwise."""

    HEALTH_PATH: Final = "/v1/health"
    """`GET /v1/health` answers bare, not in the envelope."""

    ACCEPT_JSON: Final = "application/json"
    """`Accept` for every endpoint but the SVG variant of a chart and the PDFs."""

    ACCEPT_SVG: Final = "image/svg+xml"
    """`Accept` that asks `POST /v1/kundli/chart` for the markup itself."""

    ACCEPT_PDF: Final = "application/pdf"
    """`Accept` for the `/v1/pdf/*` routes, which answer the file's bytes."""

    def __init__(
        self,
        api_key: str,
        base_url: str | None = DEFAULT_BASE_URL,
        http_client: HttpClient | None = None,
        timeout_seconds: float = 30.0,
        max_retries: int = 2,
        client_tag: str | None = None,
        headers: Mapping[str, str] | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        """Build a transport.

        - `api_key`: `kj_live_…`, `kj_test_…` or `kj_pub_…`. Never logged, never in an
          exception. An empty key is refused on the first call, before the network.
        - `base_url`: a trailing `/` or `/v1` is trimmed.
        - `http_client`: default a new `UrllibClient`, which this transport then owns.
        - `timeout_seconds`: the deadline for one attempt, not for the whole call.
        - `max_retries`: the retry budget. Negative is read as `0`.
        - `client_tag`: `X-KJ-Client`, default `sdk-python/<version>`.
        - `headers`: extra headers on every request; cannot override the key,
          `Accept`, `Content-Type` or the tag. A `User-Agent` here replaces the
          default `kaaljyoti-python/<version>`.
        - `sleep`: how the transport waits between attempts, in seconds.
          Injectable so a test can assert what was waited for without waiting.
        """
        self._api_key = api_key or ""
        self.base_url = self.normalise_base_url(base_url)
        """The origin every path is appended to, already normalised."""
        self.timeout_seconds = float(timeout_seconds)
        """The deadline per attempt."""
        self.max_retries = max(0, int(max_retries))
        """How many extra attempts the retry policy may spend. `0` turns it off."""
        self.client_tag = client_tag or f"sdk-python/{SDK_VERSION}"
        """The `X-KJ-Client` value."""
        self._headers = {
            name: value
            for name, value in (headers or {}).items()
            if name.lower() not in _RESERVED_HEADERS
        }
        # Read once: a key that is not publishable is a secret key, whatever its prefix.
        self._publishable = self._api_key.startswith(_PUBLISHABLE_PREFIX)
        self._owns_http_client = http_client is None
        self._http: HttpClient = http_client if http_client is not None else UrllibClient()
        self._sleep = sleep

    @staticmethod
    def normalise_base_url(raw: str | None) -> str:
        """`https://api.kaaljyoti.com/v1/` and `https://api.kaaljyoti.com` mean the same thing.

        The `/v1` is trimmed too: paths carry their own version prefix, and a
        base URL that already had one would otherwise produce `/v1/v1/kundli`.
        """
        value = (raw or "").strip()
        if value == "":
            return Transport.DEFAULT_BASE_URL
        value = value.rstrip("/")
        if value.endswith("/v1"):
            value = value[:-3]
        return value.rstrip("/")

    @property
    def http_client(self) -> HttpClient:
        """The `HttpClient` requests go through."""
        return self._http

    def close(self) -> None:
        """Close the HTTP client if this transport created it; one you passed in stays yours."""
        if self._owns_http_client:
            closer = getattr(self._http, "close", None)
            if callable(closer):
                closer()

    @overload
    def post(
        self,
        path: str,
        body: Mapping[str, Any],
        decode: Callable[[Any], T],
        decode_meta: Callable[[Any], M],
        accept: str = ...,
    ) -> Result[T, M]: ...

    @overload
    def post(
        self,
        path: str,
        body: Mapping[str, Any],
        decode: Callable[[Any], T],
        decode_meta: None,
        accept: str = ...,
    ) -> Result[T, None]: ...

    def post(
        self,
        path: str,
        body: Mapping[str, Any],
        decode: Callable[[Any], Any],
        decode_meta: Callable[[Any], Any] | None,
        accept: str = ACCEPT_JSON,
    ) -> Result[Any, Any]:
        """Send a JSON body and read the envelope back.

        `decode` is handed `data` from the envelope — or, when `accept` is
        `ACCEPT_SVG` and the call succeeded, the body as a `str`, and when it is
        `ACCEPT_PDF`, a `PdfFile` of the body's bytes. `decode_meta`
        is handed `meta`; pass `None` for the answers that carry none, and
        `meta` on the result is `None`.

        `path` comes from the generated operation table, never typed by hand.
        Raises `KaaljyotiError` for every failure, including the ones that
        never left the process.
        """
        self._require_key()
        # `ensure_ascii=False` keeps Devanagari as UTF-8 bytes instead of
        # `\\uXXXX`: the API is UTF-8 throughout and a body is easier to read in
        # a log. An empty mapping is `{}`, which is what the API wants.
        encoded = json.dumps(dict(body), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return self._send(path, "POST", self._url(path), accept, encoded, decode, decode_meta)

    @overload
    def get(
        self,
        path: str,
        query: Mapping[str, str | None],
        decode: Callable[[Any], T],
        decode_meta: Callable[[Any], M],
    ) -> Result[T, M]: ...

    @overload
    def get(
        self,
        path: str,
        query: Mapping[str, str | None],
        decode: Callable[[Any], T],
        decode_meta: None,
    ) -> Result[T, None]: ...

    def get(
        self,
        path: str,
        query: Mapping[str, str | None],
        decode: Callable[[Any], Any],
        decode_meta: Callable[[Any], Any] | None,
    ) -> Result[Any, Any]:
        """Read an endpoint that takes its arguments in the query string.

        A `None` value in `query` leaves the parameter out entirely, which is
        not the same as sending it empty.
        """
        self._require_key()
        return self._send(
            path, "GET", self._url(path, query), self.ACCEPT_JSON, None, decode, decode_meta
        )

    def _require_key(self) -> None:
        # Fails before the network, so an unset key is a stack trace in the
        # caller's own code rather than a 401 a round trip away.
        if self._api_key == "":
            raise KaaljyotiError(
                KaaljyotiError.INVALID_KEY,
                "No API key configured",
                docs="https://kaaljyoti.com/api/docs/errors#invalid_key",
            )

    def _send(
        self,
        path: str,
        method: str,
        url: str,
        accept: str,
        body: bytes | None,
        decode: Callable[[Any], Any],
        decode_meta: Callable[[Any], Any] | None,
    ) -> Result[Any, Any]:
        request = HttpRequest(
            method=method,
            url=url,
            headers=self._headers_for(accept, has_body=body is not None),
            body=body,
            timeout_seconds=self.timeout_seconds,
        )

        # Each reason has its own budget: a 429 is the gateway pacing us and is
        # worth obeying repeatedly, while an `engine_error` or a dead socket is
        # worth exactly one more try before the caller hears about it.
        rate_limit_budget = self.max_retries
        engine_budget = min(1, self.max_retries)
        network_budget = min(1, self.max_retries)

        while True:
            try:
                response = self._http.send(request)
            except TransportError as error:
                if network_budget > 0:
                    network_budget -= 1
                    continue
                if error.timed_out:
                    raise KaaljyotiError(
                        KaaljyotiError.TIMEOUT, f"No answer within {self.timeout_seconds:g} s"
                    ) from error
                raise KaaljyotiError(KaaljyotiError.NETWORK_ERROR, str(error)) from error

            request_id = response.header("X-KJ-Request-Id")

            if response.status == 429 and rate_limit_budget > 0:
                rate_limit_budget -= 1
                self._sleep(float(_retry_delay_seconds(response.header("Retry-After"))))
                continue

            rate_limit = RateLimit(
                limit=_header_int(response, "X-RateLimit-Limit"),
                remaining=_header_int(response, "X-RateLimit-Remaining"),
                reset=_header_int(response, "X-RateLimit-Reset"),
            )
            plan = response.header("X-KJ-Plan")
            cached_header = response.header("X-KJ-Cache") == "hit"
            credits = _header_int(response, _CREDITS_HEADER)
            credits_remaining = _header_int(response, _CREDITS_REMAINING_HEADER)

            # A PDF is bytes, not text: decoding it as UTF-8 would corrupt it.
            # Like the SVG below, only a success is a file; a failure is an
            # envelope.
            if response.ok and accept == self.ACCEPT_PDF:
                file = PdfFile(
                    bytes=response.body,
                    content_type=response.header("Content-Type") or accept,
                    filename=filename_of(response.header("Content-Disposition")),
                    credits=credits,
                )
                return Result(
                    data=_decode(decode, file, response, request_id),
                    meta=None,
                    request_id=request_id,
                    plan=plan,
                    cached=cached_header,
                    credits=credits,
                    credits_remaining=credits_remaining,
                    rate_limit=rate_limit,
                )

            # A chart asked for as SVG comes back as the document itself — but
            # only when it succeeded. A failure is an envelope whatever
            # `Accept` said.
            if response.ok and accept != self.ACCEPT_JSON:
                text = _utf8(response, request_id)
                return Result(
                    data=_decode(decode, text, response, request_id),
                    meta=None,
                    request_id=request_id,
                    plan=plan,
                    cached=cached_header,
                    credits=credits,
                    credits_remaining=credits_remaining,
                    rate_limit=rate_limit,
                )

            try:
                parsed: Any = json.loads(_utf8(response, request_id))
            except ValueError as error:
                # An HTML error page from a proxy, a truncated body, an empty 502.
                raise KaaljyotiError(
                    KaaljyotiError.BAD_RESPONSE,
                    "Response was not JSON",
                    status=response.status,
                    request_id=request_id,
                ) from error

            envelope: dict[str, Any] | None = parsed if isinstance(parsed, dict) else None

            if (envelope is not None and envelope.get("status") == "error") or not response.ok:
                failure = _error_from(envelope, response, request_id)
                # One more try for our own fault, none for the caller's.
                if failure.code == KaaljyotiError.ENGINE_ERROR and engine_budget > 0:
                    engine_budget -= 1
                    continue
                raise failure

            # Health is the one answer with no envelope around it: it must keep
            # working while the service is disabled, so it carries no `meta`.
            if path == self.HEALTH_PATH:
                return Result(
                    data=_decode(decode, parsed, response, request_id),
                    meta=None,
                    request_id=request_id,
                    plan=plan,
                    cached=cached_header,
                    credits=credits,
                    credits_remaining=credits_remaining,
                    rate_limit=rate_limit,
                )

            if envelope is None or envelope.get("status") != "ok" or "data" not in envelope:
                raise KaaljyotiError(
                    KaaljyotiError.BAD_RESPONSE,
                    "Response was not a Kaal Jyoti envelope",
                    status=response.status,
                    request_id=request_id,
                )

            meta_raw = envelope.get("meta")
            return Result(
                data=_decode(decode, envelope["data"], response, request_id),
                meta=None
                if decode_meta is None
                else _decode(decode_meta, meta_raw, response, request_id),
                request_id=request_id,
                plan=plan,
                # `meta.cached` is the gateway's own word for it; the header is
                # the only signal on the answers that carry no meta.
                cached=(isinstance(meta_raw, dict) and meta_raw.get("cached") is True)
                or cached_header,
                credits=credits,
                credits_remaining=credits_remaining,
                rate_limit=rate_limit,
            )

    def _url(self, path: str, query: Mapping[str, str | None] | None = None) -> str:
        parameters = {name: value for name, value in (query or {}).items() if value is not None}
        if self._publishable:
            parameters["key"] = self._api_key
        if not parameters:
            return self.base_url + path
        # RFC 3986 percent-encoding (`%20`, `%2C`), as the other SDKs write it.
        encoded = urllib.parse.urlencode(parameters, quote_via=urllib.parse.quote)
        return f"{self.base_url}{path}?{encoded}"

    def _headers_for(self, accept: str, *, has_body: bool) -> dict[str, str]:
        # The caller's headers go in first, already stripped of the reserved
        # names in any case, so nothing they pass can replace the key, the
        # client tag or the `Accept` this call depends on.
        headers = dict(self._headers)
        # Cloudflare in front of the gateway refuses the stdlib's default
        # `Python-urllib/3.x` signature (error 1010) before the gateway sees the
        # request, so the SDK names itself. A caller's own `User-Agent` wins.
        if not any(name.lower() == "user-agent" for name in headers):
            headers["User-Agent"] = f"kaaljyoti-python/{SDK_VERSION}"
        # Only on a body: a `Content-Type` on a GET buys a CORS preflight in a
        # browser and says nothing true about the request.
        if has_body:
            headers["Content-Type"] = self.ACCEPT_JSON
        headers["Accept"] = accept
        headers["X-KJ-Client"] = self.client_tag
        if not self._publishable:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers


def filename_of(header: str | None) -> str | None:
    """The file name in a `Content-Disposition`, or `None`.

    The RFC 6266 `filename*=UTF-8''…` form wins over the plain one when both
    are there, because it is the one that can carry a name in Devanagari.
    """
    if header is None:
        return None
    extended = _EXTENDED_FILENAME.search(header)
    if extended is not None:
        try:
            return urllib.parse.unquote_to_bytes(extended.group(1).strip()).decode("utf-8")
        except UnicodeDecodeError:
            pass  # A malformed escape: fall through to the plain parameter.
    plain = _PLAIN_FILENAME.search(header)
    if plain is None:
        return None
    name = plain.group(1) if plain.group(1) is not None else plain.group(2)
    return name or None


def _utf8(response: HttpResponse, request_id: str | None) -> str:
    """The body as text. Always UTF-8: the API writes nothing else, whatever a header says."""
    try:
        return response.body.decode("utf-8")
    except UnicodeDecodeError as error:
        raise KaaljyotiError(
            KaaljyotiError.BAD_RESPONSE,
            "Response was not UTF-8",
            status=response.status,
            request_id=request_id,
        ) from error


def _decode(
    decoder: Callable[[Any], T], value: Any, response: HttpResponse, request_id: str | None
) -> T:
    """Run a generated `from_dict` and turn its complaint into a `bad_response`.

    The generated readers raise `KaaljyotiFormatError` (a `ValueError`) naming
    the type they wanted; a payload the schema did not promise is the API's
    problem or ours, never an exception the caller has to interpret.
    """
    try:
        return decoder(value)
    except (ValueError, TypeError, KeyError, AttributeError) as error:
        raise KaaljyotiError(
            KaaljyotiError.BAD_RESPONSE,
            f"Response did not match the schema: {error}",
            status=response.status,
            request_id=request_id,
        ) from error


def _retry_delay_seconds(header: str | None) -> int:
    """Seconds to wait, from a `Retry-After` header that may be anything."""
    if header is None:
        return _DEFAULT_RETRY_SECONDS
    try:
        seconds = int(header.strip())
    except ValueError:
        return _DEFAULT_RETRY_SECONDS
    if seconds <= 0:
        return _DEFAULT_RETRY_SECONDS
    return min(seconds, _MAX_RETRY_SECONDS)


def _header_int(response: HttpResponse, name: str) -> int | None:
    """A header as an integer, or `None` when it was absent or unreadable."""
    raw = response.header(name)
    if raw is None:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        return None


def _error_from(
    envelope: dict[str, Any] | None, response: HttpResponse, request_id: str | None
) -> KaaljyotiError:
    """The gateway's own error, with what the headers add to it."""
    detail = envelope.get("error") if envelope is not None else None
    body: dict[str, Any] = detail if isinstance(detail, dict) else {}
    code = body.get("code")
    message = body.get("message")
    field = body.get("field")
    docs = body.get("docs")
    retry_after = response.header("Retry-After")
    return KaaljyotiError(
        code if isinstance(code, str) else KaaljyotiError.BAD_RESPONSE,
        message if isinstance(message, str) else "Request failed",
        status=response.status,
        field=field if isinstance(field, str) else None,
        docs=docs if isinstance(docs, str) else None,
        request_id=request_id,
        retry_after=None if retry_after is None else _retry_delay_seconds(retry_after),
    )
