"""The SDK against the real gateway. Opt-in, and skipped by default.

Every other test replaces the socket, which proves that the client sends what
it means to send and not that the API answers it. This is the other half: it
runs against staging through the real `UrllibClient`, costs about fifty
credits, and is the thing to run after a snapshot regeneration or a gateway
deploy.

    KJ_SMOKE=1 KJ_API_KEY=kj_pub_… .venv/bin/pytest -m smoke

- `KJ_BASE_URL` — default `https://api-staging.kaaljyoti.com`.
- `KJ_ORIGIN` — default `http://localhost:3000`. Sent as `Origin` when the key
  is publishable, because a publishable key is only accepted from an origin it
  lists and a Python process sends no `Origin` of its own.
"""

from __future__ import annotations

import os

import pytest

from kaaljyoti import (
    Birth,
    CalculationOptions,
    Disclaimer,
    HoroscopeRequest,
    Kaaljyoti,
    KaaljyotiError,
    KundliChartRequest,
    KundliRequest,
    PanchangRequest,
    ReportKundliRequest,
    ReportLagnaRequest,
    ReportNakshatraRequest,
    VarshphalRequest,
)

pytestmark = pytest.mark.smoke

STAGING = "https://api-staging.kaaljyoti.com"
DEFAULT_ORIGIN = "http://localhost:3000"

BIRTH = Birth(
    datetime="1990-05-14T10:30:00",
    timezone="Asia/Kolkata",
    latitude=28.6139,
    longitude=77.209,
    place="New Delhi",
)


@pytest.fixture(scope="module")
def kj() -> Kaaljyoti:
    key = os.environ.get("KJ_API_KEY", "")
    if os.environ.get("KJ_SMOKE") != "1" or key == "":
        pytest.skip("set KJ_SMOKE=1 and KJ_API_KEY=kj_pub_… (or kj_test_…) to run this")
    origin = os.environ.get("KJ_ORIGIN") or DEFAULT_ORIGIN
    return Kaaljyoti(
        api_key=key,
        base_url=os.environ.get("KJ_BASE_URL") or STAGING,
        # The header the SDK cannot set for a caller: a browser sends it without
        # being asked, and the gateway checks a publishable key against the
        # origins it was created with.
        headers={"Origin": origin} if key.startswith("kj_pub_") else None,
    )


def test_health_answers_without_an_envelope(kj: Kaaljyoti) -> None:
    answer = kj.health()
    assert answer.data.status == "ok"
    assert answer.data.engine != ""
    assert answer.data.ephemeris != ""
    assert answer.data.ops > 0
    assert answer.meta is None


def test_a_reference_table_answers_in_both_languages_asked_for(kj: Kaaljyoti) -> None:
    answer = kj.reference("signs", ["en", "hi"])
    assert len(answer.data) == 12
    aries = answer.data[0]
    assert aries["id"] == "aries"
    assert set(aries["names"]) >= {"en", "hi"}
    assert answer.meta.language == ["en", "hi"]


def test_timezone_knows_the_war_time_offset(kj: Kaaljyoti) -> None:
    answer = kj.timezone(28.6139, 77.209, "1944-03-15T10:00:00")
    assert answer.data.name == "Asia/Kolkata"
    assert answer.data.utc_offset == "+06:30", "India ran on +06:30 during the war"
    assert answer.data.source == "derived"


def test_the_daily_panchang_answers_for_a_place_and_a_day(kj: Kaaljyoti) -> None:
    answer = kj.panchang.daily(
        PanchangRequest(
            latitude=28.6139, longitude=77.209, timezone="Asia/Kolkata", date="2026-09-22"
        )
    )
    assert answer.data.tithis
    assert answer.data.panchang.vara != ""
    assert answer.data.panchang.nakshatra.id != ""
    assert answer.meta.timezone.name == "Asia/Kolkata"
    assert answer.request_id is not None
    # The cost twice over: `meta.credits` and `X-KJ-Credits`.
    assert answer.meta.credits > 0
    assert answer.credits == answer.meta.credits
    # The balance goes to secret keys only, never to a page's key.
    if os.environ.get("KJ_API_KEY", "").startswith("kj_pub_"):
        assert answer.credits_remaining is None
    else:
        assert answer.credits_remaining is not None and answer.credits_remaining >= 0


def test_the_price_list_answers_for_free(kj: Kaaljyoti) -> None:
    answer = kj.reference("credits")
    prices = {row["route"]: row for row in answer.data}
    assert prices["/v1/kundli"]["credits"] > 0
    assert prices["/v1/match/batch"]["per"] == "pair"
    assert prices["/v1/reports/kundli"]["per"] == "part"
    # A free route is not metered, so there is no cost header on it.
    assert answer.credits is None


def test_a_kundli_answers_with_the_ascendant_the_docs_quote(kj: Kaaljyoti) -> None:
    answer = kj.kundli.get(
        KundliRequest(birth=BIRTH, options=CalculationOptions(language=["en", "hi"]))
    )
    assert answer.data.lagna_sign.id == "cancer"
    assert "hi" in (answer.data.lagna_sign.names or {})
    assert "sun" in answer.data.positions
    assert answer.meta.timezone.utc_offset == "+05:30"
    assert answer.meta.timezone.source == "given"


def test_a_chart_answers_as_markup_when_asked_for_as_svg(kj: Kaaljyoti) -> None:
    answer = kj.kundli.chart_svg(KundliChartRequest(birth=BIRTH, size=360))
    assert answer.data.startswith("<svg")
    assert "</svg>" in answer.data
    assert answer.meta is None
    assert answer.credits is not None and answer.credits > 0


def test_a_horoscope_answers_a_summary_and_five_areas(kj: Kaaljyoti) -> None:
    answer = kj.horoscope(HoroscopeRequest(sign="aries", date="2026-09-28"))
    assert answer.data.sign.id == "aries"
    assert answer.data.summary.level in {"favourable", "mixed", "care"}
    assert [area.area for area in answer.data.areas] == [
        "work", "money", "relationships", "health", "education"
    ]  # fmt: skip
    assert answer.data.basis
    assert answer.data.disclaimer is not None


def test_a_kundli_report_of_two_parts_is_priced_as_two(kj: Kaaljyoti) -> None:
    answer = kj.reports.kundli(ReportKundliRequest(birth=BIRTH, parts=["lagna", "yogas"]))
    assert answer.data.parts == ["lagna", "yogas"]
    # Two parts at 5 credits each, unless the price list has been changed.
    assert answer.meta.credits == 10


def test_the_personal_reports_answer_on_every_plan(kj: Kaaljyoti) -> None:
    dashas = kj.reports.vimshottari(KundliRequest(birth=BIRTH))
    assert len([p for p in dashas.data.periods if p.current]) == 1
    year = kj.reports.varshphal(VarshphalRequest(birth=BIRTH, year=2026))
    assert year.data.year == 2026
    assert len(year.data.areas) == 7


def test_a_lagna_reading_answers_in_both_languages(kj: Kaaljyoti) -> None:
    answer = kj.reports.lagna(
        ReportLagnaRequest(birth=BIRTH, options=CalculationOptions(language=["en", "hi"]))
    )
    assert answer.data.lagna is not None
    assert answer.data.lagna.sign.id == "cancer"
    assert answer.data.lagna.entry is not None
    assert answer.data.lagna.entry.text.en and answer.data.lagna.entry.text.hi


def test_a_nakshatra_reading_names_the_astrologer_or_drops_the_line(kj: Kaaljyoti) -> None:
    named = kj.reports.nakshatra(
        ReportNakshatraRequest(
            nakshatra="purva_phalguni",
            options=CalculationOptions(disclaimer=Disclaimer(name="Acharya Amit Verma")),
        )
    )
    assert named.data.disclaimer is not None
    assert "Acharya Amit Verma" in (named.data.disclaimer.en or "")
    off = kj.reports.nakshatra(
        ReportNakshatraRequest(
            nakshatra="purva_phalguni", options=CalculationOptions(disclaimer="off")
        )
    )
    assert off.data.disclaimer is None


def test_the_house_lords_answer_twelve_houses_in_order(kj: Kaaljyoti) -> None:
    answer = kj.reports.house_lords(
        KundliRequest(birth=BIRTH, options=CalculationOptions(language=["en", "hi"]))
    )
    lords = answer.data.house_lords
    assert lords is not None
    assert [lord.house for lord in lords] == list(range(1, 13))
    assert all(1 <= lord.in_house <= 12 for lord in lords)
    assert lords[0].sign.id == "cancer"
    assert lords[0].entry is not None
    assert lords[0].entry.text.en and lords[0].entry.text.hi


def test_a_place_search_finds_a_former_name(kj: Kaaljyoti) -> None:
    answer = kj.places("Bombay", country="IN", limit=3)
    assert answer.data.places
    assert answer.data.places[0].timezone == "Asia/Kolkata"


def test_a_contradiction_is_a_validation_error_with_the_field_named(kj: Kaaljyoti) -> None:
    # Both a zone and an offset: they can disagree, so the API refuses rather
    # than guessing which one was meant.
    both = Birth(
        datetime="1990-05-14T10:30:00",
        latitude=28.6139,
        longitude=77.209,
        timezone="Asia/Kolkata",
        utc_offset="+05:30",
    )
    with pytest.raises(KaaljyotiError) as caught:
        kj.kundli.get(KundliRequest(birth=both))
    error = caught.value
    assert error.code == "validation_error"
    assert error.status == 400
    assert error.is_retryable is False
    assert "#validation_error" in (error.docs or "")
