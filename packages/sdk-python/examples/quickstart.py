"""The quick start, runnable.

    pip install kaaljyoti
    KAALJYOTI_API_KEY=kj_test_… python examples/quickstart.py

Against staging instead of production:

    KAALJYOTI_API_KEY=kj_test_… KAALJYOTI_BASE_URL=https://api-staging.kaaljyoti.com \\
        python examples/quickstart.py

With a publishable key, also set `KAALJYOTI_ORIGIN` to one of the origins the
key lists: a Python process sends no `Origin` of its own.

It costs three credits — a kundli, a panchang and a chart — plus two free ones:
`health()` and `timezone()` are never charged.
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path

from kaaljyoti import (
    Birth,
    CalculationOptions,
    ChartStyle,
    Kaaljyoti,
    KaaljyotiError,
    KundliChartRequest,
    KundliRequest,
    PanchangRequest,
    format_wall_clock,
)


def main() -> int:
    api_key = os.environ.get("KAALJYOTI_API_KEY", "")
    if api_key == "":
        print(
            "Set KAALJYOTI_API_KEY first — https://kaaljyoti.com/api/dashboard/keys",
            file=sys.stderr,
        )
        return 1
    origin = os.environ.get("KAALJYOTI_ORIGIN")

    # The SDK does not read the environment for you: a process with two keys in
    # it must not be able to pick the wrong one by accident.
    kj = Kaaljyoti(
        api_key=api_key,
        base_url=os.environ.get("KAALJYOTI_BASE_URL") or None,
        headers={"Origin": origin} if origin else None,
    )

    try:
        health = kj.health()
        print(f"engine {health.data.engine}, {health.data.ops} operations\n")

        zone = kj.timezone(28.6139, 77.209)
        print(f"zone at the place {zone.data.name} {zone.data.utc_offset}\n")

        # `datetime` is the clock on the wall where the birth happened — not
        # UTC, not your server's zone. `format_wall_clock()` writes a datetime's
        # own fields out; `to_wall_clock()` converts an instant first.
        birth = Birth(
            datetime=format_wall_clock(datetime(1990, 5, 14, 10, 30)),
            latitude=28.6139,
            longitude=77.209,
            # Give `timezone` or `utc_offset`, or neither — never both.
            timezone="Asia/Kolkata",
            place="New Delhi",
        )

        kundli = kj.kundli.get(
            KundliRequest(birth=birth, options=CalculationOptions(language=["en", "hi"]))
        )
        data, meta = kundli.data, kundli.meta

        # `names` is filled only when more than one language was asked for; every
        # id also carries a stable `id` to switch on and a `name` to show.
        lagna_hi = (data.lagna_sign.names or {}).get("hi", data.lagna_sign.name)
        limit = kundli.rate_limit
        print(f"ascendant        {data.ascendant_dms}")
        print(f"lagna            {data.lagna_sign.name} ({lagna_hi})")
        print(f"moon             {data.moon_sign.name}, {data.moon_nakshatra.name}")
        tz = meta.timezone
        print(f"zone             {tz.name} {tz.utc_offset} ({tz.source})")
        print(f"cached           {'yes' if kundli.cached else 'no'}")
        print(f"request          {kundli.request_id}")
        remaining = "?" if limit.remaining is None else limit.remaining
        allowed = "?" if limit.limit is None else limit.limit
        print(f"rate limit       {remaining}/{allowed} left this minute\n")

        for planet, position in data.positions.items():
            retrograde = "retrograde" if position.is_retrograde else ""
            print(
                f"{planet:<10} {position.sign.name:<12} {position.nakshatra.name:<18} {retrograde}"
            )
        print()

        # A place and a day, not a person: no `Birth` here.
        panchang = kj.panchang.daily(
            PanchangRequest(
                latitude=28.6139,
                longitude=77.209,
                timezone="Asia/Kolkata",
                date=date.today().isoformat(),
            )
        )
        today = panchang.data.panchang
        print(
            f"today            {today.vara.name}, {today.tithi_name.name}, {today.nakshatra.name}"
        )

        # The same endpoint answers the document or the markup; this is the
        # markup, and it costs the same one credit.
        svg = kj.kundli.chart_svg(KundliChartRequest(birth=birth, style=ChartStyle.NORTH, size=360))
        # Written to the temp directory rather than beside this file: an example
        # should not leave anything behind in the checkout.
        chart = Path(tempfile.gettempdir()) / "kaaljyoti-chart.svg"
        chart.write_text(svg.data, encoding="utf-8")
        print(f"chart            {len(svg.data)} characters written to {chart}")
    except KaaljyotiError as error:
        # Branch on the code, never on the message: the codes are the contract
        # and the messages are free to get clearer between versions.
        where = f" at {error.field}" if error.field else ""
        print(f"{error.code} (HTTP {error.status}){where}: {error.message}", file=sys.stderr)
        if error.request_id is not None:
            print(f"request {error.request_id} — quote it to support", file=sys.stderr)
        if error.is_retryable:
            later = f" in {error.retry_after} s" if error.retry_after is not None else ""
            print(f"worth trying again{later}", file=sys.stderr)
        return 1
    finally:
        kj.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
