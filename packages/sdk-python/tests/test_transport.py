"""The transport: key placement, headers, retries and the envelope."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import pytest

from kaaljyoti import (
    SDK_VERSION,
    Birth,
    HttpClient,
    HttpRequest,
    HttpxClient,
    Kaaljyoti,
    KaaljyotiError,
    KundliChartRequest,
    KundliDocument,
    KundliRequest,
    Meta,
    Transport,
    TransportError,
    UrllibClient,
)
from kaaljyoti.transport import filename_of
from support import PUB_KEY, SECRET_KEY, RecordingClient, client, envelope, response

HERE = Path(__file__).parent
BIRTH = Birth(
    datetime="1990-05-14T10:30:00", timezone="Asia/Kolkata", latitude=28.6139, longitude=77.209
)
REQUEST = KundliRequest(birth=BIRTH)


def fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((HERE / "fixtures" / f"{name}.json").read_text("utf-8"))
    return data


def kundli_answer(**headers: str) -> Any:
    raw = fixture("kundli")
    return response(200, raw, headers)


def query(request: HttpRequest) -> dict[str, list[str]]:
    return urllib.parse.parse_qs(urllib.parse.urlsplit(request.url).query)


# --- key placement -------------------------------------------------------------------------------


def test_a_secret_key_travels_as_bearer_and_never_in_the_url() -> None:
    kj, http = client(kundli_answer(), api_key=SECRET_KEY)
    kj.kundli.get(REQUEST)
    sent = http.last
    assert sent.headers["Authorization"] == f"Bearer {SECRET_KEY}"
    assert SECRET_KEY not in sent.url
    assert "key" not in query(sent)


def test_a_live_key_is_a_secret_key_too() -> None:
    kj, http = client(kundli_answer(), api_key="kj_live_abc")
    kj.kundli.get(REQUEST)
    assert http.last.headers["Authorization"] == "Bearer kj_live_abc"
    assert "?" not in http.last.url


def test_a_publishable_key_travels_in_the_query_and_never_in_authorization() -> None:
    kj, http = client(kundli_answer(), api_key=PUB_KEY)
    kj.kundli.get(REQUEST)
    sent = http.last
    assert query(sent)["key"] == [PUB_KEY]
    assert "Authorization" not in sent.headers
    assert all(name.lower() != "authorization" for name in sent.headers)


def test_a_caller_header_cannot_put_a_publishable_key_in_authorization() -> None:
    kj, http = client(kundli_answer(), api_key=PUB_KEY, headers={"authorization": "Bearer nope"})
    kj.kundli.get(REQUEST)
    assert all(name.lower() != "authorization" for name in http.last.headers)


def test_an_empty_key_is_invalid_key_before_the_network() -> None:
    kj, http = client(kundli_answer(), api_key="")
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert caught.value.code == KaaljyotiError.INVALID_KEY
    assert caught.value.status == 0
    assert http.requests == []


# --- headers and URL -----------------------------------------------------------------------------


def test_a_post_sends_json_accept_and_the_client_tag() -> None:
    kj, http = client(kundli_answer())
    kj.kundli.get(REQUEST)
    sent = http.last
    assert sent.method == "POST"
    assert sent.url == "https://api.kaaljyoti.com/v1/kundli"
    assert sent.headers["Content-Type"] == "application/json"
    assert sent.headers["Accept"] == "application/json"
    assert sent.headers["X-KJ-Client"] == f"sdk-python/{SDK_VERSION}"
    assert sent.headers["User-Agent"] == f"kaaljyoti-python/{SDK_VERSION}"
    assert sent.timeout_seconds == 30.0
    assert sent.body is not None
    assert json.loads(sent.body.decode("utf-8")) == REQUEST.to_dict()


def test_a_get_carries_no_content_type_and_no_body() -> None:
    kj, http = client(response(200, fixture_health()))
    kj.health()
    assert http.last.method == "GET"
    assert http.last.body is None
    assert "Content-Type" not in http.last.headers


def test_the_client_tag_and_timeout_can_be_overridden() -> None:
    kj, http = client(kundli_answer(), client_tag="wordpress/1.2.3", timeout_seconds=5)
    kj.kundli.get(REQUEST)
    assert http.last.headers["X-KJ-Client"] == "wordpress/1.2.3"
    assert http.last.timeout_seconds == 5.0


def test_extra_headers_are_merged_but_cannot_replace_the_reserved_ones() -> None:
    kj, http = client(
        kundli_answer(),
        headers={
            "Origin": "https://example.com",
            "accept": "text/html",
            "X-KJ-Client": "spoof",
            "Authorization": "Bearer other",
        },
    )
    kj.kundli.get(REQUEST)
    sent = http.last.headers
    assert sent["Origin"] == "https://example.com"
    assert sent["Accept"] == "application/json"
    assert sent["X-KJ-Client"] == f"sdk-python/{SDK_VERSION}"
    assert sent["Authorization"] == f"Bearer {SECRET_KEY}"
    assert "accept" not in sent


def test_a_caller_user_agent_replaces_the_default() -> None:
    kj, http = client(kundli_answer(), headers={"user-agent": "my-app/2"})
    kj.kundli.get(REQUEST)
    assert http.last.headers["user-agent"] == "my-app/2"
    assert "User-Agent" not in http.last.headers


@pytest.mark.parametrize(
    ("raw", "normalised"),
    [
        (None, "https://api.kaaljyoti.com"),
        ("", "https://api.kaaljyoti.com"),
        ("https://api.kaaljyoti.com/", "https://api.kaaljyoti.com"),
        ("https://api.kaaljyoti.com/v1", "https://api.kaaljyoti.com"),
        ("https://api.kaaljyoti.com/v1/", "https://api.kaaljyoti.com"),
        ("  https://api-staging.kaaljyoti.com//  ", "https://api-staging.kaaljyoti.com"),
        ("http://localhost:8787/v1", "http://localhost:8787"),
    ],
)
def test_the_base_url_is_normalised(raw: str | None, normalised: str) -> None:
    assert Transport.normalise_base_url(raw) == normalised
    kj, http = client(kundli_answer(), base_url=raw)
    kj.kundli.get(REQUEST)
    assert http.last.url == f"{normalised}/v1/kundli"


# --- the envelope --------------------------------------------------------------------------------


def test_an_envelope_becomes_a_typed_result_with_the_header_fields() -> None:
    kj, http = client(
        kundli_answer(
            **{
                "X-KJ-Request-Id": "req_123",
                "X-KJ-Plan": "growth",
                "X-KJ-Credits": "1",
                "X-KJ-Credits-Remaining": "199412",
                "X-RateLimit-Limit": "60",
                "X-RateLimit-Remaining": "59",
                "X-RateLimit-Reset": "1790000000",
            }
        )
    )
    answer = kj.kundli.get(REQUEST)
    assert isinstance(answer.data, KundliDocument)
    assert isinstance(answer.meta, Meta)
    assert answer.data.lagna_sign.id == "cancer"
    assert answer.meta.timezone.source == "given"
    assert answer.request_id == "req_123"
    assert answer.plan == "growth"
    assert answer.cached is False
    assert answer.credits == 1
    assert answer.credits_remaining == 199412
    assert answer.meta.credits == 1
    assert answer.rate_limit.limit == 60
    assert answer.rate_limit.remaining == 59
    assert answer.rate_limit.reset == 1790000000


def test_missing_headers_leave_the_fields_none() -> None:
    kj, _ = client(kundli_answer())
    answer = kj.kundli.get(REQUEST)
    assert answer.request_id is None
    assert answer.plan is None
    assert (answer.credits, answer.credits_remaining) == (None, None)
    assert (answer.rate_limit.limit, answer.rate_limit.remaining) == (None, None)


def test_a_publishable_key_is_told_the_cost_but_not_what_is_left() -> None:
    # The gateway never sends `X-KJ-Credits-Remaining` to a `kj_pub_…` key.
    kj, _ = client(kundli_answer(**{"X-KJ-Credits": "1"}), api_key=PUB_KEY)
    answer = kj.kundli.get(REQUEST)
    assert answer.credits == 1
    assert answer.credits_remaining is None


def test_cached_comes_from_meta_or_from_the_cache_header() -> None:
    raw = fixture("kundli")
    raw["meta"]["cached"] = True
    kj, _ = client(response(200, raw))
    assert kj.kundli.get(REQUEST).cached is True
    kj, _ = client(kundli_answer(**{"X-KJ-Cache": "hit"}))
    assert kj.kundli.get(REQUEST).cached is True
    kj, _ = client(kundli_answer(**{"X-KJ-Cache": "miss"}))
    assert kj.kundli.get(REQUEST).cached is False


def test_the_error_fixture_becomes_a_kaaljyoti_error() -> None:
    kj, _ = client(response(400, fixture("error"), {"x-kj-request-id": "req_err"}))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    error = caught.value
    assert error.code == "validation_error"
    assert error.status == 400
    assert error.message == "Invalid input"
    assert error.field == "options.language"
    assert error.docs == "https://kaaljyoti.com/api/docs/errors#validation_error"
    assert error.request_id == "req_err"
    assert error.retry_after is None
    assert error.is_retryable is False
    assert "validation_error" in str(error)
    assert SECRET_KEY not in str(error) and SECRET_KEY not in repr(error)


def test_an_error_status_without_an_envelope_is_bad_response() -> None:
    kj, _ = client(response(502, {"unexpected": True}))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert caught.value.code == KaaljyotiError.BAD_RESPONSE
    assert caught.value.status == 502


def test_a_body_that_is_not_json_is_bad_response() -> None:
    kj, _ = client(response(502, b"<html>Bad gateway</html>", {"X-KJ-Request-Id": "r1"}))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert caught.value.code == KaaljyotiError.BAD_RESPONSE
    assert caught.value.status == 502
    assert caught.value.request_id == "r1"
    assert caught.value.is_retryable is False


def test_a_200_that_is_not_an_envelope_is_bad_response() -> None:
    kj, _ = client(response(200, {"hello": "world"}))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert caught.value.code == KaaljyotiError.BAD_RESPONSE


def test_a_document_the_schema_did_not_promise_is_bad_response_not_a_value_error() -> None:
    kj, _ = client(envelope({"ascendant": "not a number"}, fixture("kundli")["meta"]))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert caught.value.code == KaaljyotiError.BAD_RESPONSE
    assert "schema" in caught.value.message
    assert isinstance(caught.value.__cause__, ValueError)


def test_bodies_are_decoded_as_utf8_whatever_the_header_says() -> None:
    raw = json.dumps({"status": "ok", "data": [{"id": "aries", "name": "मेष"}]}).encode("utf-8")
    kj, _ = client(response(200, raw, {"Content-Type": "application/json; charset=latin-1"}))
    assert kj.reference("signs", "hi").data[0]["name"] == "मेष"


def fixture_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "0.14.2",
        "ephemeris": "kaaljyoti-ephemeris 0.1.1",
        "ops": 42,
        "uptime_s": 12,
    }


def test_health_answers_bare_with_no_meta() -> None:
    kj, http = client(response(200, fixture_health()))
    answer = kj.health()
    assert answer.data.status == "ok"
    assert answer.data.engine == "0.14.2"
    assert answer.data.ephemeris == "kaaljyoti-ephemeris 0.1.1"
    assert answer.data.ops == 42
    assert answer.meta is None
    assert http.last.url == "https://api.kaaljyoti.com/v1/health"


def test_svg_is_the_body_as_utf8_text_with_no_meta() -> None:
    markup = '<svg xmlns="http://www.w3.org/2000/svg"><text>मेष</text></svg>'
    kj, http = client(
        response(
            200,
            markup.encode("utf-8"),
            {"Content-Type": "image/svg+xml", "X-KJ-Credits": "1"},
        ),
    )
    answer = kj.kundli.chart_svg(KundliChartRequest(birth=BIRTH, size=360))
    assert answer.data == markup
    assert answer.meta is None
    # No `meta` on markup: the header is the only place the cost is.
    assert answer.credits == 1
    assert http.last.headers["Accept"] == "image/svg+xml"


def test_a_failed_svg_call_is_still_an_envelope_error() -> None:
    kj, _ = client(response(400, fixture("error")))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.chart_svg(KundliChartRequest(birth=BIRTH))
    assert caught.value.code == "validation_error"


def test_a_pdf_is_the_body_as_bytes_never_as_text() -> None:
    # Every byte value, so a UTF-8 decode anywhere on the way would show.
    every_byte = bytes(range(256))
    kj, http = client(
        response(
            200,
            every_byte,
            {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="panchang-2026-10.pdf"',
                "X-KJ-Credits": "500",
            },
        )
    )
    answer = kj.transport.post(
        "/v1/pdf/panchang/month", {}, lambda file: file, None, Transport.ACCEPT_PDF
    )
    assert answer.data.bytes == every_byte
    assert answer.data.filename == "panchang-2026-10.pdf"
    assert answer.data.credits == 500
    assert answer.credits == 500
    assert answer.meta is None
    assert http.last.headers["Accept"] == "application/pdf"
    assert http.last.headers["Content-Type"] == "application/json"


def test_a_failed_pdf_call_is_still_an_envelope_error_and_is_retried_like_any_other() -> None:
    kj, http = client(rate_limited("0"), response(400, fixture("error")))
    with pytest.raises(KaaljyotiError) as caught:
        kj.transport.post("/v1/pdf/kundli", {}, lambda file: file, None, Transport.ACCEPT_PDF)
    assert caught.value.code == "validation_error"
    assert len(http.requests) == 2


def test_filename_of_reads_the_quoted_file_name_the_gateway_sends() -> None:
    assert filename_of('attachment; filename="kundli-ravi-kumar.pdf"') == "kundli-ravi-kumar.pdf"


def test_filename_of_reads_an_unquoted_one() -> None:
    assert filename_of("attachment; filename=match-2026.pdf") == "match-2026.pdf"


def test_filename_of_prefers_the_rfc_6266_form_which_can_carry_devanagari() -> None:
    header = (
        'attachment; filename="kundli.pdf"; '
        "filename*=UTF-8''kundli-%E0%A4%B0%E0%A4%B5%E0%A4%BF.pdf"
    )
    assert filename_of(header) == "kundli-रवि.pdf"
    assert filename_of("attachment; filename*=utf-8''a%20b.pdf") == "a b.pdf"


def test_filename_of_is_none_without_a_header_or_a_file_name_in_it() -> None:
    assert filename_of(None) is None
    assert filename_of("attachment") is None
    assert filename_of('attachment; filename=""') is None


# --- retries -------------------------------------------------------------------------------------


def rate_limited(retry_after: str | None) -> Any:
    headers = {"Retry-After": retry_after} if retry_after is not None else {}
    body = {"status": "error", "error": {"code": "rate_limited", "message": "Slow down"}}
    return response(429, body, headers)


def test_a_429_waits_what_retry_after_says_then_succeeds() -> None:
    kj, http = client(rate_limited("3"), kundli_answer())
    answer = kj.kundli.get(REQUEST)
    assert answer.data.lagna_sign.id == "cancer"
    assert http.sleeps == [3.0]
    assert len(http.requests) == 2


def test_a_429_stops_after_max_retries_and_reports_retry_after() -> None:
    kj, http = client(rate_limited("5"))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert http.sleeps == [5.0, 5.0]
    assert len(http.requests) == 3
    error = caught.value
    assert error.code == KaaljyotiError.RATE_LIMITED
    assert error.status == 429
    assert error.retry_after == 5
    assert error.is_retryable is True


@pytest.mark.parametrize(
    ("header", "waited"),
    [(None, 2.0), ("", 2.0), ("soon", 2.0), ("0", 2.0), ("-4", 2.0), ("600", 30.0), (" 7 ", 7.0)],
)
def test_retry_after_is_defaulted_and_capped(header: str | None, waited: float) -> None:
    kj, http = client(rate_limited(header), kundli_answer())
    kj.kundli.get(REQUEST)
    assert http.sleeps == [waited]


def test_max_retries_zero_turns_retrying_off() -> None:
    kj, http = client(rate_limited("9"), max_retries=0)
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert http.sleeps == []
    assert len(http.requests) == 1
    assert caught.value.retry_after == 9


def engine_error() -> Any:
    body = {"status": "error", "error": {"code": "engine_error", "message": "Engine failed"}}
    return response(500, body)


def test_an_engine_error_is_retried_once() -> None:
    kj, http = client(engine_error(), kundli_answer())
    assert kj.kundli.get(REQUEST).data.lagna_sign.id == "cancer"
    assert len(http.requests) == 2
    assert http.sleeps == []


def test_a_second_engine_error_is_raised() -> None:
    kj, http = client(engine_error())
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert len(http.requests) == 2
    assert caught.value.code == KaaljyotiError.ENGINE_ERROR
    assert caught.value.status == 500
    assert caught.value.is_retryable is True


def test_a_validation_error_is_never_retried() -> None:
    kj, http = client(response(400, fixture("error")))
    with pytest.raises(KaaljyotiError):
        kj.kundli.get(REQUEST)
    assert len(http.requests) == 1


def test_a_transport_error_is_retried_once() -> None:
    kj, http = client(TransportError("connection refused"), kundli_answer())
    assert kj.kundli.get(REQUEST).data.lagna_sign.id == "cancer"
    assert len(http.requests) == 2


def test_a_second_transport_error_is_network_error() -> None:
    kj, http = client(TransportError("connection refused"))
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert len(http.requests) == 2
    error = caught.value
    assert error.code == KaaljyotiError.NETWORK_ERROR
    assert error.status == 0
    assert "connection refused" in error.message
    assert isinstance(error.__cause__, TransportError)
    assert error.is_retryable is True


def test_a_timed_out_transport_error_is_timeout() -> None:
    kj, http = client(TransportError("timed out", timed_out=True), timeout_seconds=2.5)
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert len(http.requests) == 2
    assert caught.value.code == KaaljyotiError.TIMEOUT
    assert "2.5" in caught.value.message


def test_budgets_are_spent_per_reason() -> None:
    kj, http = client(
        TransportError("reset"),
        engine_error(),
        rate_limited("1"),
        rate_limited("1"),
        kundli_answer(),
    )
    assert kj.kundli.get(REQUEST).data.lagna_sign.id == "cancer"
    assert len(http.requests) == 5
    assert http.sleeps == [1.0, 1.0]


# --- UrllibClient against a real socket ----------------------------------------------------------


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - the stdlib's name
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        if self.path.startswith("/fail"):
            payload = json.dumps(fixture("error")).encode("utf-8")
            self.send_response(400)
            self.send_header("X-KJ-Request-Id", "req_local")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path.startswith("/pdf"):
            payload = bytes(range(256))
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path.startswith("/redirect"):
            self.send_response(302)
            self.send_header("Location", "/elsewhere")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        echo = json.dumps(
            {"path": self.path, "auth": self.headers.get("Authorization"), "body": body.decode()}
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("X-KJ-Request-Id", "req_ok")
        self.send_header("Content-Length", str(len(echo)))
        self.end_headers()
        self.wfile.write(echo)

    def log_message(self, format: str, *args: Any) -> None:
        pass


@pytest.fixture
def local_server() -> Iterator[str]:
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def _request(url: str) -> HttpRequest:
    return HttpRequest(
        method="POST",
        url=url,
        headers={"Authorization": "Bearer x", "Content-Type": "application/json"},
        body=b'{"a":1}',
        timeout_seconds=5,
    )


def test_urllib_client_returns_a_2xx_answer(local_server: str) -> None:
    answer = UrllibClient().send(_request(f"{local_server}/ok"))
    assert answer.status == 200
    assert answer.header("X-KJ-Request-Id") == "req_ok"
    assert json.loads(answer.body) == {"path": "/ok", "auth": "Bearer x", "body": '{"a":1}'}


def test_urllib_client_maps_http_error_to_a_response(local_server: str) -> None:
    answer = UrllibClient().send(_request(f"{local_server}/fail"))
    assert answer.status == 400
    assert answer.headers["x-kj-request-id"] == "req_local"
    assert json.loads(answer.body)["error"]["code"] == "validation_error"


def test_urllib_client_keeps_a_binary_body_byte_for_byte(local_server: str) -> None:
    answer = UrllibClient().send(_request(f"{local_server}/pdf"))
    assert answer.status == 200
    assert answer.body == bytes(range(256))


def test_urllib_client_does_not_follow_redirects(local_server: str) -> None:
    answer = UrllibClient().send(_request(f"{local_server}/redirect"))
    assert answer.status == 302


def test_urllib_client_raises_transport_error_on_a_refused_connection() -> None:
    with pytest.raises(TransportError) as caught:
        UrllibClient().send(_request("http://127.0.0.1:9/nothing-listens"))
    assert caught.value.timed_out is False


def test_urllib_client_marks_a_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def slow(*args: Any, **kwargs: Any) -> Any:
        raise urllib.error.URLError(TimeoutError("timed out"))

    http = UrllibClient()
    monkeypatch.setattr(http._opener, "open", slow)
    with pytest.raises(TransportError) as caught:
        http.send(_request("http://127.0.0.1:1/"))
    assert caught.value.timed_out is True


def test_the_full_stack_over_urllib_maps_a_400(local_server: str) -> None:
    transport = Transport(api_key=SECRET_KEY, base_url=f"{local_server}/fail")
    kj = Kaaljyoti.with_transport(transport)
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(REQUEST)
    assert caught.value.code == "validation_error"
    assert caught.value.request_id == "req_local"


def test_httpx_client_maps_answers_and_failures() -> None:
    httpx = pytest.importorskip("httpx")

    def handler(request: Any) -> Any:
        if request.url.path == "/timeout":
            raise httpx.ReadTimeout("slow", request=request)
        if request.url.path == "/down":
            raise httpx.ConnectError("refused", request=request)
        return httpx.Response(400, headers={"X-KJ-Request-Id": "r"}, json=fixture("error"))

    adapter = HttpxClient(httpx.Client(transport=httpx.MockTransport(handler)))
    answer = adapter.send(_request("http://example.test/fail"))
    assert answer.status == 400
    assert answer.header("x-kj-request-id") == "r"
    with pytest.raises(TransportError) as caught:
        adapter.send(_request("http://example.test/timeout"))
    assert caught.value.timed_out is True
    with pytest.raises(TransportError) as caught:
        adapter.send(_request("http://example.test/down"))
    assert caught.value.timed_out is False
    adapter.close()


def test_httpx_client_keeps_a_binary_body_byte_for_byte() -> None:
    httpx = pytest.importorskip("httpx")

    def handler(request: Any) -> Any:
        return httpx.Response(
            200, headers={"Content-Type": "application/pdf"}, content=bytes(range(256))
        )

    adapter = HttpxClient(httpx.Client(transport=httpx.MockTransport(handler)))
    assert adapter.send(_request("http://example.test/v1/pdf/kundli")).body == bytes(range(256))
    adapter.close()


def test_recording_client_is_an_http_client() -> None:
    assert isinstance(RecordingClient(response()), HttpClient)
    assert isinstance(UrllibClient(), HttpClient)
