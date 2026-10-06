"""`KaaljyotiError`, the one exception type for every failure, API-side or not."""

from __future__ import annotations

from typing import Final

__all__ = ["KaaljyotiError"]


class KaaljyotiError(Exception):
    """One exception type for every failure, API-side or not.

    The docs' rule for callers is "branch on `code`, never on `message`"
    (https://kaaljyoti.com/api/docs/errors), and that rule is only keepable if
    every failure has a code — including the ones that never reached the API.
    So a dead socket is `network_error`, an expired deadline is `timeout`, and
    a proxy's HTML error page is `bad_response`; all of them arrive as this
    class, with the same fields, as a `validation_error` from the gateway.

    Nothing here ever carries the API key: this is the object an application
    logs, and a logged key is a leaked key.

    ```python
    try:
        answer = kj.kundli.get(request)
    except KaaljyotiError as error:
        if error.code == "validation_error":
            form.reject(error.field)
        elif error.is_retryable:
            queue.later(error.retry_after or 60, job)
        else:
            log.warning("%s %s %s", error.code, error.status, error.request_id)
    ```
    """

    NETWORK_ERROR: Final = "network_error"
    """The socket never answered — offline, DNS, a refused connection."""

    TIMEOUT: Final = "timeout"
    """The client's `timeout_seconds` elapsed before the answer did."""

    BAD_RESPONSE: Final = "bad_response"
    """An answer arrived, but it was not an envelope this SDK can read."""

    INVALID_KEY: Final = "invalid_key"
    """No key was configured; nothing was sent.

    Deliberately the API's own code rather than a new one: an empty key is
    refused here instead of a round trip away, and a caller should not have to
    handle two codes for the same mistake.
    """

    RATE_LIMITED: Final = "rate_limited"
    """The gateway's code for "you are going too fast"; obeyed on `Retry-After`."""

    ENGINE_ERROR: Final = "engine_error"
    """The gateway's code for a calculation that failed inside the engine."""

    RETRYABLE: Final[frozenset[str]] = frozenset(
        {RATE_LIMITED, ENGINE_ERROR, NETWORK_ERROR, TIMEOUT}
    )
    """Codes worth trying again, and the only ones.

    `rate_limited` and `engine_error` say "later"; `network_error` and
    `timeout` say "the question never got an answer". Everything else —
    `validation_error`, `invalid_key`, `quota_exceeded`, `pdf_quota_exceeded`,
    `plan_required`, `not_computable` — will refuse the identical request identically.
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status: int = 0,
        field: str | None = None,
        docs: str | None = None,
        request_id: str | None = None,
        retry_after: int | None = None,
    ) -> None:
        """Build an error. Every argument but `code` and `message` is optional."""
        super().__init__(message)
        self.code = code
        """The contract. Branch on this, never on the message.

        One of the API's own codes — `validation_error`, `invalid_key`,
        `key_revoked`, `quota_exceeded`, `pdf_quota_exceeded`, `forbidden_origin`,
        `plan_required`, `not_found`, `not_computable`, `rate_limited`,
        `engine_error`, `service_disabled` — or `network_error`, `timeout`, `bad_response` for
        failures that never reached it.
        """
        self.message = message
        """Human-readable, and free to get clearer between versions."""
        self.status = status
        """The HTTP status, or `0` when the request never got an answer."""
        self.field = field
        """Dotted path of the offending request field, e.g. `birth.utc_offset`."""
        self.docs = docs
        """Link to the errors page for this code."""
        self.request_id = request_id
        """`X-KJ-Request-Id` — the one thing support asks for."""
        self.retry_after = retry_after
        """Seconds the gateway asked us to wait, on a `429`.

        Exposed rather than only obeyed, because a caller who set
        `max_retries=0` is doing the waiting themselves.
        """

    @property
    def is_retryable(self) -> bool:
        """Whether sending the identical request again is worth anything.

        The SDK already retried these within its own budget, so `True` means
        the budget ran out, not that nothing was tried. Every endpoint is a
        pure calculation, which is what makes retrying a POST safe at all.
        """
        return self.code in self.RETRYABLE

    def __str__(self) -> str:
        parts = [self.code]
        if self.status != 0:
            parts.append(f"HTTP {self.status}")
        if self.field is not None:
            parts.append(f"field {self.field}")
        if self.request_id is not None:
            parts.append(f"request {self.request_id}")
        return f"{', '.join(parts)}: {self.message}"

    def __repr__(self) -> str:
        return (
            f"KaaljyotiError(code={self.code!r}, status={self.status}, "
            f"message={self.message!r}, field={self.field!r}, request_id={self.request_id!r})"
        )
