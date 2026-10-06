"""Test doubles shared by the transport, client and contract tests."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from kaaljyoti import HttpClient, HttpRequest, HttpResponse, Kaaljyoti, Transport

PUB_KEY = "kj_pub_ccccccccccccccccccccccccccccccccccccccccccc"
SECRET_KEY = "kj_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"


def response(
    status: int = 200,
    body: Any = None,
    headers: Mapping[str, str] | None = None,
) -> HttpResponse:
    """An `HttpResponse`; a non-bytes body is JSON-encoded as UTF-8."""
    raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
    return HttpResponse(status=status, headers=dict(headers or {}), body=raw)


def envelope(data: Any, meta: Any = None, **headers: str) -> HttpResponse:
    """A 200 `{status: ok, data, meta}` envelope."""
    body: dict[str, Any] = {"status": "ok", "data": data}
    if meta is not None:
        body["meta"] = meta
    return response(200, body, headers)


class RecordingClient(HttpClient):
    """Answers from a queue and records every request.

    Each queued item is an `HttpResponse` to return or an exception to raise.
    When the queue runs dry the last answer repeats, so a retry test can queue
    one 429 and watch the transport spend its budget on it.
    """

    def __init__(self, *answers: HttpResponse | BaseException) -> None:
        self.answers: list[HttpResponse | BaseException] = list(answers)
        self.requests: list[HttpRequest] = []
        self.sleeps: list[float] = []
        self.closed = False

    def send(self, request: HttpRequest) -> HttpResponse:
        self.requests.append(request)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, BaseException):
            raise answer
        return answer

    def sleep(self, seconds: float) -> None:
        """A `sleep` for the transport that records instead of waiting."""
        self.sleeps.append(seconds)

    def close(self) -> None:
        self.closed = True

    @property
    def last(self) -> HttpRequest:
        return self.requests[-1]


def client(
    *answers: HttpResponse | BaseException,
    api_key: str = SECRET_KEY,
    **options: Any,
) -> tuple[Kaaljyoti, RecordingClient]:
    """A `Kaaljyoti` on a `RecordingClient`, with the retry sleep recorded."""
    http = RecordingClient(*answers)
    transport = Transport(api_key=api_key, http_client=http, sleep=http.sleep, **options)
    return Kaaljyoti.with_transport(transport), http
