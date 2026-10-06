"""Wall clocks: formatting, zone conversion, and back to an instant."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from kaaljyoti import format_wall_clock, from_wall_clock, to_wall_clock, utc_offset_at

UTC = timezone.utc


def test_format_reads_the_fields_as_they_stand() -> None:
    assert format_wall_clock(datetime(1990, 5, 14, 10, 30)) == "1990-05-14T10:30:00"
    assert format_wall_clock(datetime(1990, 5, 14, 10, 30, 5, 999_999)) == "1990-05-14T10:30:05"
    # An aware datetime is not converted: its own fields are written.
    aware = datetime(1990, 5, 14, 10, 30, tzinfo=ZoneInfo("America/New_York"))
    assert format_wall_clock(aware) == "1990-05-14T10:30:00"
    assert format_wall_clock(datetime(812, 1, 2, 3, 4, 5)) == "0812-01-02T03:04:05"


def test_to_wall_clock_in_kolkata() -> None:
    instant = datetime(1990, 5, 14, 5, 0, tzinfo=UTC)
    assert to_wall_clock(instant, "Asia/Kolkata") == "1990-05-14T10:30:00"


def test_to_wall_clock_knows_the_war_time_offset() -> None:
    instant = datetime(1944, 3, 15, 10, 0, tzinfo=UTC)
    assert to_wall_clock(instant, "Asia/Kolkata") == "1944-03-15T16:30:00"


def test_to_wall_clock_in_new_york_across_dst() -> None:
    # 2026-03-08 02:00 EST → 03:00 EDT.
    before = datetime(2026, 3, 8, 6, 59, tzinfo=UTC)
    after = datetime(2026, 3, 8, 7, 1, tzinfo=UTC)
    assert to_wall_clock(before, "America/New_York") == "2026-03-08T01:59:00"
    assert to_wall_clock(after, "America/New_York") == "2026-03-08T03:01:00"
    assert to_wall_clock(datetime(2026, 7, 1, 16, tzinfo=UTC), "America/New_York") == (
        "2026-07-01T12:00:00"
    )
    assert to_wall_clock(datetime(2026, 12, 1, 17, tzinfo=UTC), "America/New_York") == (
        "2026-12-01T12:00:00"
    )


def test_to_wall_clock_from_another_zone() -> None:
    kolkata = datetime(1990, 5, 14, 10, 30, tzinfo=ZoneInfo("Asia/Kolkata"))
    assert to_wall_clock(kolkata, "America/New_York") == "1990-05-14T01:00:00"


def test_to_wall_clock_refuses_a_naive_datetime_and_an_unknown_zone() -> None:
    with pytest.raises(ValueError, match="naive"):
        to_wall_clock(datetime(1990, 5, 14, 10, 30), "Asia/Kolkata")
    with pytest.raises(ValueError, match="IANA"):
        to_wall_clock(datetime(1990, 5, 14, tzinfo=UTC), "Asia/Delhi")


def test_from_wall_clock_with_a_positive_offset() -> None:
    instant = from_wall_clock("1990-05-14T10:30:00", "+05:30")
    assert instant == datetime(1990, 5, 14, 5, 0, tzinfo=UTC)
    assert instant.tzinfo == UTC


def test_from_wall_clock_with_a_negative_offset() -> None:
    assert from_wall_clock("2026-07-01T12:00:00", "-04:00") == datetime(2026, 7, 1, 16, tzinfo=UTC)


def test_from_wall_clock_reads_milliseconds() -> None:
    instant = from_wall_clock("1990-05-14T10:30:00.5", "+00:00")
    assert instant == datetime(1990, 5, 14, 10, 30, 0, 500_000, tzinfo=UTC)


@pytest.mark.parametrize(
    ("wall", "offset"),
    [
        ("1990-05-14 10:30:00", "+05:30"),
        ("1990-05-14T10:30", "+05:30"),
        ("1990-05-14T10:30:00Z", "+05:30"),
        ("1990-02-30T10:30:00", "+05:30"),
        ("1990-05-14T10:30:00", "+5:30"),
        ("1990-05-14T10:30:00", "-0500"),
        ("1990-05-14T10:30:00", "Asia/Kolkata"),
    ],
)
def test_from_wall_clock_refuses_malformed_input(wall: str, offset: str) -> None:
    with pytest.raises(ValueError):
        from_wall_clock(wall, offset)


def test_a_wall_clock_round_trips() -> None:
    for zone in ("Asia/Kolkata", "America/New_York", "Australia/Adelaide", "UTC"):
        instant = datetime(2026, 9, 24, 3, 17, 42, tzinfo=UTC)
        wall = to_wall_clock(instant, zone)
        assert from_wall_clock(wall, utc_offset_at(instant, zone)) == instant, zone


def test_utc_offset_at() -> None:
    assert utc_offset_at(datetime(1990, 5, 14, 5, tzinfo=UTC), "Asia/Kolkata") == "+05:30"
    assert utc_offset_at(datetime(1944, 3, 15, 10, tzinfo=UTC), "Asia/Kolkata") == "+06:30"
    assert utc_offset_at(datetime(2026, 7, 1, tzinfo=UTC), "America/New_York") == "-04:00"
    assert utc_offset_at(datetime(2026, 12, 1, tzinfo=UTC), "America/New_York") == "-05:00"
    assert utc_offset_at(datetime(2026, 1, 1, tzinfo=UTC), "Asia/Kathmandu") == "+05:45"


def test_utc_offset_at_truncates_local_mean_time_seconds() -> None:
    # India ran on Madras time, +05:21:10, until 1906.
    assert utc_offset_at(datetime(1900, 1, 1, tzinfo=UTC), "Asia/Kolkata") == "+05:21"
    # A negative LMT keeps its sign: Dublin, -00:25:21 before 1916.
    assert utc_offset_at(datetime(1900, 1, 1, tzinfo=UTC), "Europe/Dublin") == "-00:25"


def test_utc_offset_at_refuses_a_naive_datetime() -> None:
    with pytest.raises(ValueError):
        utc_offset_at(datetime(2026, 1, 1), "Asia/Kolkata")
    aware = datetime(2026, 1, 1, tzinfo=timezone(timedelta(hours=1)))
    assert utc_offset_at(aware, "Europe/London") == "+00:00"
