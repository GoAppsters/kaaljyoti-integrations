# `kaaljyoti` (Python) — design decisions

**Date:** 24 September 2026 · **Status:** settled before code · **Scope:** Tier 2, the Python SDK (PyPI name `kaaljyoti`). Publication is owner-gated like every listing.

## What it is

```python
from kaaljyoti import Kaaljyoti, KundliRequest, Birth

kj = Kaaljyoti(api_key=os.environ["KAALJYOTI_API_KEY"])
answer = kj.kundli.get(KundliRequest(birth=Birth(datetime="1990-05-14T10:30:00", timezone="Asia/Kolkata", latitude=28.6139, longitude=77.209)))
print(answer.data.lagna_sign.name, answer.meta.timezone.source)
```

The same shape as the TypeScript, Dart and PHP SDKs: one client, a namespace per tag, a method per operation, typed requests and documents, the envelope returned whole.

## Layout

```
packages/sdk-python/
  pyproject.toml                 hatchling; requires-python >=3.10; no runtime dependencies; dev: pytest, mypy, ruff, httpx
  package.json                   pnpm hooks (gen, gen:check)
  tool/gen.mjs                   Node: openapi/openapi.json → src/kaaljyoti/generated/{models,operations,version}.py, then `ruff format`
  src/kaaljyoti/__init__.py      public names
  src/kaaljyoti/client.py        Kaaljyoti + namespaces
  src/kaaljyoti/transport.py     key placement, headers, timeout, retries, envelope → Result | KaaljyotiError
  src/kaaljyoti/http.py          HttpClient protocol, HttpRequest/HttpResponse, UrllibClient (default, stdlib), HttpxClient (optional adapter)
  src/kaaljyoti/errors.py, result.py, wallclock.py
  src/kaaljyoti/generated/       frozen dataclasses, LabelledId, operations table, version constants (committed; gen:check diffs)
  tests/                         pytest: models round-trip, transport with a recording client, contract walk of openapi.json, opt-in smoke
  examples/quickstart.py, README.md, CHANGELOG.md, LICENSE
```

## Decisions

1. **Zero runtime dependencies.** The default transport is `urllib.request` from the standard library; an `HttpxClient` adapter (sync) is provided for people who already use httpx, imported lazily so httpx is never required. The `HttpClient` protocol is the seam, as in PHP.

2. **Python 3.10 minimum**: `X | Y` unions, `dataclass(slots=True)`, `zoneinfo`.

3. **Generated frozen dataclasses**, our generator, the same naming tables and shape-based dedupe as the Dart and PHP generators so all four SDKs share class names. Field names are the wire names (already snake_case); a reserved word gets a trailing underscore (`from_`, `to`) with the wire name kept in the mapping. `from_dict(data)` / `to_dict()` (omits `None`), `LabelledId`, `additionalProperties` as `dict[str, T]`, open objects as `dict[str, Any]`, null-only fields as `Any`, `options.language` as `list[str]` serialised to a bare string when it has one entry. Type hints precise enough for `mypy --strict`.

4. **Envelope returned whole.** `Result[T, M]` generic dataclass: `data`, `meta`, `request_id`, `plan`, `cached`, `credits`, `credits_remaining`, `rate_limit`. `credits` (`X-KJ-Credits`: what the request cost, the same number as `meta.credits`) and `credits_remaining` (`X-KJ-Credits-Remaining`, which the API sends to secret keys only, so `None` on a publishable key) sit beside them, each `None` when its header is absent.

5. **Key placement, retries, errors** identical to the other SDKs: `kj_pub_` in `?key=`, otherwise Bearer; 429 on `Retry-After` up to `max_retries` (default 2, cap 30 s), `engine_error` and transport failures once; `KaaljyotiError(Exception)` with `code`, `status`, `field`, `docs`, `request_id`, `retry_after`, `is_retryable`; batch pair errors stay values. The sleep is injectable.

6. **`X-KJ-Client: sdk-python/<version>`**, overridable. Timeout 30 s.

7. **Wall clocks with `zoneinfo`.** `to_wall_clock(dt, zone)` converts an aware datetime to the wall clock at the place; `from_wall_clock(wall, utc_offset)` returns an aware UTC datetime; `format_wall_clock(naive_dt)`.

8. **SVG** via `kj.kundli.chart_svg(request)` → `Result[str, None]`; **PDFs** via `kj.pdf.kundli / match / varshphal / panchang_month(request)` → `Result[PdfFile, None]`: a frozen dataclass of the `bytes` (never decoded as text), `content_type`, `filename` from `Content-Disposition` (RFC 6266 `filename*` first) and `credits` from `X-KJ-Credits`, with `cached` read from `X-KJ-Cache`. A failed PDF is the usual JSON error and raises. `/v1/pdf/panchang/month` is `panchang_month` because `kj.pdf.month` would not say a month of what. Method names are snake_case (`bhava_bala`, `graha_drishti`, `special_lagnas`, `kota_chakra`, `sade_sati`, `vikram_samvat`, `arudha_padas`). All 58 operations of the snapshot, and the contract test proves every one has a method.

9. **Tests.** pytest with a `RecordingClient`; contract test walking `openapi/openapi.json`; fixtures round-trip; opt-in smoke (`KJ_SMOKE=1`, `KJ_API_KEY`; publishable keys add `Origin`). `mypy --strict` on `src/`, `ruff check` and `ruff format --check` clean.

10. **Versioning and publishing.** `0.1.0`, tag `sdk-python-v0.1.0`; `.github/workflows/publish-python.yml` builds with `python -m build` and publishes with PyPI trusted publishing on the tag, skipped until the PyPI project and its trusted publisher exist (owner-gated).

## Out of scope for 0.1.0

An async client, pydantic models, request validation.
