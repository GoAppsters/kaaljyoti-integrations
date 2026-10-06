"""Wall clocks and instants, and the conversion between them.

The docs' time-zone page (https://kaaljyoti.com/api/docs/timezones) opens by
saying that more wrong answers come from this than from everything else
combined, and that almost all of them are one mistake: sending an instant where
a wall clock belongs. A birth time is a wall clock — `1990-05-14T10:30:00`
means half past ten *where the birth happened* — and the UTC time of that
moment is the birth time only in London and five and a half hours out in
India. That is not a rounding error: it moves the ascendant by most of the
zodiac.

```python
from datetime import datetime, timezone
from kaaljyoti import Birth, to_wall_clock

birth = Birth(
    datetime=to_wall_clock(datetime(1990, 5, 14, 5, 0, tzinfo=timezone.utc), "Asia/Kolkata"),
    timezone="Asia/Kolkata",
    latitude=28.6139,
    longitude=77.209,
)
```

Python ships `zoneinfo`, so an instant and the zone it happened in give the
clock that was on the wall. Zone *names* are still worth asking the API for
(`kj.timezone(lat, lon)`) when all you have is a pair of coordinates.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Final
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

__all__ = ["format_wall_clock", "from_wall_clock", "to_wall_clock", "utc_offset_at"]

_WALL_CLOCK: Final = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$")
"""`YYYY-MM-DDTHH:MM:SS`, no zone attached, as `birth.datetime` wants it."""

_UTC_OFFSET: Final = re.compile(r"^([+-])(\d{2}):(\d{2})$")
"""`+05:30`, `-04:00`, as `birth.utc_offset` and `meta.timezone` write it."""


def format_wall_clock(dt: datetime) -> str:
    """The wall clock a datetime's own fields spell, `YYYY-MM-DDTHH:MM:SS`.

    ```python
    format_wall_clock(datetime(1990, 5, 14, 10, 30))  # '1990-05-14T10:30:00'
    ```

    **The fields are read as they stand and no zone conversion happens**, even
    on an aware datetime — which is right when they already are the clock at
    the place, as a date and a time typed into a form are. A datetime that is
    an instant from somewhere else is not, so convert it with `to_wall_clock()`.

    Sub-second precision is dropped: the API accepts milliseconds and no birth
    record has them.
    """
    # Written out by hand rather than with `strftime`, whose `%Y` does not pad
    # years before 1000 on every platform.
    return (
        f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}T{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}"
    )


def to_wall_clock(dt: datetime, zone: str) -> str:
    """The wall clock an instant showed in a zone.

    ```python
    to_wall_clock(datetime(1990, 5, 14, 5, 0, tzinfo=timezone.utc), "Asia/Kolkata")
    # '1990-05-14T10:30:00'
    ```

    The conversion to reach for when the time came from anywhere but a human
    typing it: a database column in UTC, another API, a device clock in another
    country. The zone database answers for the date given, so a 1944 Indian
    birth gets the war-time `+06:30` rather than today's `+05:30`.

    Raises `ValueError` for a naive `dt` — it names no instant, and guessing
    the machine's zone is exactly the mistake this function exists to prevent —
    and for a zone name `zoneinfo` does not know.
    """
    _require_aware(dt)
    return format_wall_clock(dt.astimezone(_zone(zone)))


def from_wall_clock(wall: str, utc_offset: str) -> datetime:
    """The instant a wall clock was, given the offset it was on, as an aware UTC datetime.

    The offset is the one thing a wall clock does not carry, so it has to come
    from somewhere: `meta.timezone.utc_offset` on an answer, or
    `kj.timezone(...)` before the call.

    ```python
    from_wall_clock("1990-05-14T10:30:00", "+05:30")
    # datetime(1990, 5, 14, 5, 0, tzinfo=timezone.utc)
    ```

    Raises `ValueError` when either argument is malformed. A `-0500`, an
    `Asia/Kolkata` or a `+5:30` here would otherwise become a plausible but
    wrong instant, and a silently wrong chart is worse than an exception.
    """
    if _WALL_CLOCK.match(wall) is None:
        raise ValueError(f'"{wall}" is not a wall clock (YYYY-MM-DDTHH:MM:SS)')
    match = _UTC_OFFSET.match(utc_offset)
    if match is None:
        raise ValueError(f'"{utc_offset}" is not a UTC offset (+HH:MM)')
    sign = -1 if match.group(1) == "-" else 1
    offset = timedelta(hours=int(match.group(2)), minutes=int(match.group(3))) * sign
    # The shape is proven, so the parse can only fail on an impossible date
    # (`1990-02-30`), which `strptime` reports as a `ValueError` itself. The
    # fraction is read by hand: Python 3.10's `fromisoformat` takes exactly
    # three or six digits, and the API accepts one to three.
    naive = datetime.strptime(wall[:19], "%Y-%m-%dT%H:%M:%S")
    fraction = wall[20:]
    if fraction:
        naive = naive.replace(microsecond=int(fraction.ljust(6, "0")))
    return naive.replace(tzinfo=timezone(offset)).astimezone(timezone.utc)


def utc_offset_at(dt: datetime, zone: str) -> str:
    """The offset a zone was on at an instant, as the API writes one: `+05:30`.

    ```python
    utc_offset_at(datetime(1944, 3, 15, 10, tzinfo=timezone.utc), "Asia/Kolkata")  # '+06:30'
    ```

    Fills `birth.utc_offset` when you would rather pin the offset than name the
    zone. Seconds are truncated, as the API's own database does with the
    pre-1906 local mean times. Raises `ValueError` for a naive `dt` or an
    unknown zone.
    """
    _require_aware(dt)
    offset = dt.astimezone(_zone(zone)).utcoffset()
    total = int(offset.total_seconds()) if offset is not None else 0
    sign = "-" if total < 0 else "+"
    minutes = abs(total) // 60
    return f"{sign}{minutes // 60:02d}:{minutes % 60:02d}"


def _require_aware(dt: datetime) -> None:
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError(
            "a naive datetime names no instant; attach its zone (tzinfo=...) first, "
            "or use format_wall_clock() if its fields already are the clock at the place"
        )


def _zone(zone: str) -> ZoneInfo:
    # `ZoneInfoNotFoundError` is a `KeyError`, which reads like a bug in the
    # caller's dict rather than a bad argument; one exception type for every
    # bad input here is easier to catch.
    try:
        return ZoneInfo(zone)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError(f'"{zone}" is not an IANA time zone') from error
