"""`Result`, the envelope every call answers, the `RateLimit` beside it, and `PdfFile`."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, TypeVar

__all__ = ["PdfFile", "RateLimit", "Result"]

T = TypeVar("T")
M = TypeVar("M")


@dataclass(frozen=True)
class RateLimit:
    """The rate-limit bucket as the gateway reported it on this answer.

    Each number is `None` when its header was absent — a proxy in front of the
    gateway, usually.
    """

    limit: int | None = None
    """`X-RateLimit-Limit`: requests allowed per window."""
    remaining: int | None = None
    """`X-RateLimit-Remaining`: requests left in this window."""
    reset: int | None = None
    """`X-RateLimit-Reset`: when the window resets, as the gateway wrote it."""


@dataclass(frozen=True)
class Result(Generic[T, M]):
    """The envelope, flattened by one level.

    `meta` is how an application answers a user who asks why a number is what
    it is, so it comes back with the data rather than being thrown away.

    ```python
    answer = kj.kundli.get(request)
    answer.data        # the calculation, typed per endpoint
    answer.meta        # ayanamsa, timezone, engine, compute_ms, language_fallback, credits
    answer.request_id  # X-KJ-Request-Id — quote it to support
    ```
    """

    data: T
    """The calculation, typed per endpoint — or the SVG or the PDF itself, when asked for."""
    meta: M
    """The envelope's `meta`: `Meta` for most calls, `None` for health, SVG and PDF.

    `BatchMeta` for `match.batch`, `ReferenceMeta` for `reference()`, `TimezoneMeta`
    for `timezone()`.
    """
    request_id: str | None = None
    """`X-KJ-Request-Id` — quote it to support."""
    plan: str | None = None
    """`X-KJ-Plan`: the plan this answer was served under."""
    cached: bool = False
    """`True` when the 24-hour cache answered. Costs the same credits."""
    credits: int | None = None
    """`X-KJ-Credits`: what this request cost — the same number as `meta.credits`,
    and the only one on an SVG or a PDF. `None` on the answers that are free
    (health, time zone, reference tables)."""
    credits_remaining: int | None = None
    """`X-KJ-Credits-Remaining`: credits left this month, credit packs included.
    Sent to secret keys only, so always `None` on a publishable key."""
    rate_limit: RateLimit = field(default_factory=RateLimit)
    """The bucket as it stands after this call."""


@dataclass(frozen=True)
class PdfFile:
    """A PDF, as the `/v1/pdf/*` routes answer one: the bytes and what the headers say about them.

    ```python
    answer = kj.pdf.kundli(PdfKundliRequest(birth=birth, name="Ravi Kumar"))
    Path(answer.data.filename or "kundli.pdf").write_bytes(answer.data.bytes)
    ```
    """

    bytes: bytes
    """The file itself, exactly as it came off the wire — never decoded as text."""
    content_type: str = "application/pdf"
    """`Content-Type`: `application/pdf`."""
    filename: str | None = None
    """From `Content-Disposition`: `kundli-ravi-kumar.pdf`, or after the date,
    year or month when the body had no `name`. `None` without the header."""
    credits: int | None = None
    """`X-KJ-Credits`: what the PDF cost (1,000 for a kundli, 500 for the others),
    or `None` without the header."""
