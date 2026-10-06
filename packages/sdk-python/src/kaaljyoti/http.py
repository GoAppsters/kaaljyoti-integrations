"""The one seam between this SDK and the network.

The package has no runtime dependencies on purpose (design decision 1): HTTP is
a one-method protocol, `HttpClient`, with two implementations shipped here —
`UrllibClient` on the standard library, the default, and `HttpxClient` for an
application that already has an `httpx.Client` with its own proxies, pools and
event hooks — and whatever you write yourself (a queue of canned answers in a
test, a client with your company's tracing on it).

Implementing it is the whole contract:

```python
class MyClient:
    def send(self, request: HttpRequest) -> HttpResponse:
        try:
            status, headers, body = my_http.call(
                request.method, request.url, request.headers, request.body,
                timeout=request.timeout_seconds,
            )
        except my_http.Timeout as error:
            raise TransportError(str(error), timed_out=True) from error
        except my_http.Error as error:
            raise TransportError(str(error)) from error
        return HttpResponse(status, headers, body)
```

An implementation does not retry, does not touch the key or the headers and
does not interpret the body: the transport owns all of that, so every client
behaves identically.
"""

from __future__ import annotations

import http.client
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:  # pragma: no cover - typing only
    import httpx

__all__ = [
    "HttpClient",
    "HttpRequest",
    "HttpResponse",
    "HttpxClient",
    "TransportError",
    "UrllibClient",
]


@dataclass(frozen=True)
class HttpRequest:
    """One request, exactly as the transport decided it.

    A client sends this as it stands: the URL already carries the query (and
    a publishable key), and the headers already carry the key, `Accept` and
    `X-KJ-Client`.
    """

    method: str
    """`GET` or `POST`."""
    url: str
    """The absolute URL, query included."""
    headers: Mapping[str, str]
    """Every header to send, final."""
    body: bytes | None
    """The UTF-8 JSON body of a `POST`, `None` on a `GET`."""
    timeout_seconds: float
    """The deadline for this one attempt, not for the whole call."""


@dataclass(frozen=True)
class HttpResponse:
    """What came back, whatever the status.

    Header names are lower-cased on construction, because HTTP header names are
    case-insensitive and the gateway, Cloudflare and a corporate proxy each
    have their own preferred spelling of `X-KJ-Request-Id`. A client may pass
    them in any case.
    """

    status: int
    """The HTTP status code."""
    headers: Mapping[str, str] = field(default_factory=dict)
    """Response headers, keys lower-cased."""
    body: bytes = b""
    """The raw body, untouched.

    The transport decodes it as UTF-8, whatever `Content-Type` claims — except a
    successful PDF, which it hands on as these bytes and never decodes.
    """

    def __post_init__(self) -> None:
        # Frozen, so the normalised copy goes in through `object.__setattr__`;
        # doing it here means an `HttpClient` written by a user cannot get the
        # case wrong.
        object.__setattr__(self, "headers", {k.lower(): v for k, v in self.headers.items()})

    def header(self, name: str) -> str | None:
        """One header by name, in any case, or `None` when it is absent."""
        return self.headers.get(name.lower())

    @property
    def ok(self) -> bool:
        """Whether the status is 2xx."""
        return 200 <= self.status < 300


class TransportError(Exception):
    """There was no answer at all — a refused connection, DNS, a dropped socket, a deadline.

    An `HttpClient` raises this and never reports a dead socket as a response
    with an invented status: the transport retries a transport failure on a
    different budget from a `500`, and the caller is told `network_error` or
    `timeout` rather than a made-up refusal.
    """

    def __init__(self, message: str, *, timed_out: bool = False) -> None:
        super().__init__(message)
        self.timed_out = timed_out
        """`True` when the deadline ended the attempt: `timeout`, not `network_error`."""


@runtime_checkable
class HttpClient(Protocol):
    """Sends one request and returns what came back.

    Must raise `TransportError` when there is no answer, and must return an
    `HttpResponse` for every answer, a `4xx` or `5xx` included.
    """

    def send(self, request: HttpRequest) -> HttpResponse:
        """Send `request` once. No retries, no interpretation of the body."""
        ...


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Hands a 3xx back as it is instead of following it.

    The API never redirects; a redirect is a proxy or a mistyped `base_url`,
    and following it would re-send the key to wherever it points.
    """

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: object,
        code: int,
        msg: str,
        headers: object,
        newurl: str,
    ) -> None:
        return None


class UrllibClient:
    """The default client, on `urllib.request` from the standard library.

    Nothing to install and nothing to configure. One connection per request:
    the SDK's latency is the calculation at the far end, not a TLS handshake.
    Redirects are not followed.
    """

    def __init__(self, opener: urllib.request.OpenerDirector | None = None) -> None:
        """Build a client.

        `opener` is for a proxy or a custom TLS context — build it with
        `urllib.request.build_opener(ProxyHandler(...), HTTPSHandler(context=...))`.
        The default opener here refuses redirects; one you pass in is used as
        it stands.
        """
        self._opener = opener or urllib.request.build_opener(_NoRedirect())

    def send(self, request: HttpRequest) -> HttpResponse:
        """Send with `urllib`; an `HTTPError` is an answer, a `URLError` or a timeout is not."""
        req = urllib.request.Request(
            request.url,
            data=request.body,
            headers=dict(request.headers),
            method=request.method,
        )
        try:
            with self._opener.open(req, timeout=request.timeout_seconds) as answer:
                return HttpResponse(
                    status=int(answer.status),
                    headers=dict(answer.headers.items()),
                    body=answer.read(),
                )
        except urllib.error.HTTPError as error:
            # urllib raises for every status >= 400, but a 400 is the gateway
            # answering: its envelope carries the code the caller branches on.
            try:
                body = error.read()
            except (OSError, http.client.HTTPException):
                body = b""
            headers = dict(error.headers.items()) if error.headers is not None else {}
            return HttpResponse(status=int(error.code), headers=headers, body=body)
        except urllib.error.URLError as error:
            reason = error.reason
            timed_out = isinstance(reason, TimeoutError)
            raise TransportError(str(reason), timed_out=timed_out) from error
        except TimeoutError as error:
            # A deadline that expires while the body is being read arrives bare,
            # not wrapped in a `URLError`.
            raise TransportError("timed out", timed_out=True) from error
        except (OSError, http.client.HTTPException) as error:
            raise TransportError(str(error) or type(error).__name__) from error

    def close(self) -> None:
        """Nothing to release: `urllib` opens and closes a connection per request."""


class HttpxClient:
    """An adapter for an `httpx.Client` you already have.

    `pip install 'kaaljyoti[httpx]'`. httpx is imported only when this class is
    used, so the package itself never needs it. The `httpx.Client` stays yours:
    its proxies, limits and event hooks apply, and closing it is your call —
    `Kaaljyoti` never closes a client it was handed.
    """

    def __init__(self, client: httpx.Client) -> None:
        """Wrap `client`. Its own timeout is replaced per request by the SDK's `timeout_seconds`."""
        self._client = client

    def send(self, request: HttpRequest) -> HttpResponse:
        """Send with httpx; a `TimeoutException` is `timed_out`, other transport errors are not."""
        import httpx  # lazy: the module must import without httpx installed

        try:
            answer = self._client.request(
                request.method,
                request.url,
                headers=dict(request.headers),
                content=request.body,
                timeout=request.timeout_seconds,
                follow_redirects=False,
            )
        except httpx.TimeoutException as error:
            raise TransportError(str(error) or "timed out", timed_out=True) from error
        except httpx.TransportError as error:
            raise TransportError(str(error) or type(error).__name__) from error
        return HttpResponse(
            status=answer.status_code,
            headers=dict(answer.headers.items()),
            body=answer.content,
        )

    def close(self) -> None:
        """Close the wrapped `httpx.Client`. Only call this if you are done with it."""
        self._client.close()
