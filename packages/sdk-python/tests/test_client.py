"""The client's namespaces over a recording HTTP client."""

from __future__ import annotations

import json
import urllib.parse
from pathlib import Path
from typing import Any

import pytest

import kaaljyoti.transport
from kaaljyoti import (
    AreaSummary,
    BatchDocument,
    BatchMeta,
    Birth,
    CalculationOptions,
    ChartDocument,
    ChartStyle,
    Disclaimer,
    GrahaReading,
    HoroscopeDocument,
    HoroscopeRequest,
    HoroscopeTransit,
    Kaaljyoti,
    KaaljyotiError,
    KundliChartRequest,
    KundliDocument,
    KundliReportDocument,
    KundliRequest,
    LifeArea,
    MahadashaReading,
    MatchBatchRequest,
    MatchBatchRequestPairsItem,
    Meta,
    PanchangRequest,
    PdfFile,
    PdfKundliRequest,
    PdfMatchRequest,
    PdfPanchangMonthRequest,
    PdfVarshphalRequest,
    PlacesDocument,
    PlacesMeta,
    ReadingGrahasDocument,
    ReadingHouseLordsDocument,
    ReadingLagnaDocument,
    ReadingNakshatraDocument,
    ReadingSummary,
    ReferenceMeta,
    ReportKundliRequest,
    ReportLagnaRequest,
    ReportNakshatraRequest,
    Result,
    TimezoneDocument,
    TransportError,
    VarshphalPeriod,
    VarshphalRequest,
    YogaReading,
    operation,
)
from support import PUB_KEY, RecordingClient, client, envelope, response

HERE = Path(__file__).parent
BIRTH = Birth(
    datetime="1990-05-14T10:30:00",
    timezone="Asia/Kolkata",
    latitude=28.6139,
    longitude=77.209,
    place="New Delhi",
)


def fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((HERE / "fixtures" / f"{name}.json").read_text("utf-8"))
    return data


def query(url: str) -> dict[str, list[str]]:
    return urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)


def test_kundli_get_answers_a_typed_document() -> None:
    kj, http = client(response(200, fixture("kundli")))
    answer = kj.kundli.get(
        KundliRequest(birth=BIRTH, options=CalculationOptions(ayanamsa="lahiri", language=["en"]))
    )
    assert isinstance(answer, Result)
    assert isinstance(answer.data, KundliDocument)
    assert isinstance(answer.meta, Meta)
    assert answer.data.ascendant_dms == "99°02'48.2\""
    assert answer.data.lagna_sign.name == "Cancer"
    assert answer.meta.timezone.utc_offset == "+05:30"
    assert http.last.url.endswith(operation("postKundli").path)
    sent = json.loads(http.last.body or b"")
    # A lone language is written as a bare string, as the API documents it.
    assert sent["options"] == {"ayanamsa": "lahiri", "language": "en"}
    assert sent["birth"]["place"] == "New Delhi"
    assert "utc_offset" not in sent["birth"]


def test_chart_answers_the_document_and_chart_svg_the_markup() -> None:
    raw = fixture("chart")
    kj, http = client(response(200, raw))
    request = KundliChartRequest(birth=BIRTH, style=ChartStyle.NORTH, size=360)
    document = kj.kundli.chart(request)
    assert isinstance(document.data, ChartDocument)
    assert document.data.style == "north"
    assert document.data.svg.startswith("<svg")
    assert http.last.headers["Accept"] == "application/json"
    chart_request = http.last

    markup: str = raw["data"]["svg"]
    kj, http = client(response(200, markup.encode("utf-8"), {"Content-Type": "image/svg+xml"}))
    svg = kj.kundli.chart_svg(request)
    assert svg.data == markup
    assert svg.meta is None
    assert http.last.headers["Accept"] == "image/svg+xml"
    # Same endpoint, same body: only `Accept` differs.
    assert http.last.url == chart_request.url
    assert http.last.body == chart_request.body


def test_chart_sends_first_house_and_reads_back_what_it_was_drawn_as() -> None:
    kj, http = client(response(200, fixture("chart")))
    answer = kj.kundli.chart(KundliChartRequest(birth=BIRTH, first_house="lagna"))
    assert json.loads(http.last.body or b"")["first_house"] == "lagna"
    assert answer.data.first_house == "lagna"
    assert answer.data.first_house_sign.id == "cancer"
    assert answer.data.title == "Lagna chart"


def test_reference_joins_languages_and_reads_an_empty_meta() -> None:
    rows = [{"id": "aries", "name": "Aries", "names": {"en": "Aries", "hi": "मेष"}}]
    kj, http = client(envelope(rows))
    answer = kj.reference("signs", ["en", "hi"])
    assert http.last.method == "GET"
    assert urllib.parse.urlsplit(http.last.url).path == "/v1/reference/signs"
    assert query(http.last.url)["language"] == ["en,hi"]
    assert "%2C" in http.last.url
    assert answer.data[0]["names"]["hi"] == "मेष"
    # No `meta` on the wire: both of ReferenceMeta's fields are optional.
    assert answer.meta == ReferenceMeta()


def test_reference_takes_a_bare_language_or_none_and_encodes_the_list_name() -> None:
    kj, http = client(envelope([], {"engine": "0.2.0", "language": ["hi"]}))
    answer = kj.reference("signs", "hi")
    assert query(http.last.url)["language"] == ["hi"]
    assert answer.meta.language == ["hi"]
    kj.reference("dasha-systems")
    assert "language" not in query(http.last.url)
    kj.reference("a/b")
    assert urllib.parse.urlsplit(http.last.url).path == "/v1/reference/a%2Fb"


def test_timezone_sends_its_arguments_in_the_query() -> None:
    kj, http = client(
        envelope(
            {"name": "Asia/Kolkata", "utc_offset": "+06:30", "source": "derived"},
            {"datetime": "1944-03-15T10:00:00"},
        )
    )
    answer = kj.timezone(28.6139, 77.209, "1944-03-15T10:00:00")
    assert isinstance(answer.data, TimezoneDocument)
    assert answer.data.utc_offset == "+06:30"
    assert answer.meta.datetime == "1944-03-15T10:00:00"
    assert query(http.last.url) == {
        "lat": ["28.6139"],
        "lon": ["77.209"],
        "datetime": ["1944-03-15T10:00:00"],
    }
    kj.timezone(28.6139, 77.209)
    assert "datetime" not in query(http.last.url)


def test_places_sends_its_arguments_in_the_query() -> None:
    row = {
        "id": 1275339,
        "name": "Mumbai",
        "names": {"en": "Mumbai", "hi": "मुंबई"},
        "region": "Maharashtra",
        "country": "IN",
        "country_name": "India",
        "latitude": 19.07283,
        "longitude": 72.88261,
        "timezone": "Asia/Kolkata",
        "population": 12691836,
    }
    kj, http = client(
        envelope({"places": [row]}, {"query": "Bombay", "language": ["en", "hi"], "count": 1})
    )
    answer = kj.places("Bombay", country="IN", limit=5, language=["en", "hi"])
    assert isinstance(answer.data, PlacesDocument)
    assert isinstance(answer.meta, PlacesMeta)
    mumbai = answer.data.places[0]
    assert (mumbai.name, mumbai.timezone, mumbai.latitude) == ("Mumbai", "Asia/Kolkata", 19.07283)
    assert mumbai.names == {"en": "Mumbai", "hi": "मुंबई"}
    assert answer.meta.count == 1
    assert http.last.method == "GET"
    assert urllib.parse.urlsplit(http.last.url).path == operation("getPlaces").path
    assert query(http.last.url) == {
        "q": ["Bombay"],
        "country": ["IN"],
        "limit": ["5"],
        "language": ["en,hi"],
    }
    kj, http = client(envelope({"places": []}))
    assert kj.places("Delhi").meta == PlacesMeta()
    assert query(http.last.url) == {"q": ["Delhi"]}


def test_horoscope_sends_the_sign_and_period_and_reads_the_summaries() -> None:
    kj, http = client(response(200, fixture("horoscope")))
    answer = kj.horoscope(
        HoroscopeRequest(sign="aries", period="daily", date="2026-09-28", timezone="Asia/Kolkata")
    )
    assert http.last.method == "POST"
    assert http.last.url.endswith(operation("postHoroscope").path)
    assert json.loads(http.last.body or b"") == {
        "sign": "aries",
        "period": "daily",
        "date": "2026-09-28",
        "timezone": "Asia/Kolkata",
    }
    assert isinstance(answer.data, HoroscopeDocument)
    assert isinstance(answer.meta, Meta)
    data = answer.data
    assert data.sign.id == "aries"
    assert (data.from_, data.to) == ("2026-09-27T18:30:00.000Z", "2026-09-28T18:30:00.000Z")
    assert isinstance(data.summary, ReadingSummary)
    assert data.summary.level == "care"
    assert data.summary.text.en and data.summary.text.hi
    assert [(a.area, a.level) for a in data.areas] == [
        ("work", "mixed"),
        ("money", "care"),
        ("relationships", "care"),
        ("health", "mixed"),
        ("education", "care"),
    ]
    assert all(isinstance(a, AreaSummary) for a in data.areas)
    # The transits behind it: the Moon leaves Pisces during the day, so it is
    # there twice, the two stays meeting at one instant.
    moons = [t for t in data.basis if t.graha.id == "moon"]
    assert all(isinstance(t, HoroscopeTransit) for t in moons)
    leaving, entering = moons
    assert (leaving.sign.id, leaving.house, leaving.nature) == ("pisces", 12, "unfavourable")
    assert (entering.sign.id, entering.house, entering.leaves) == ("aries", 1, None)
    assert leaving.leaves == entering.entered == "2026-09-28T04:46:38.438Z"
    assert next(t for t in data.basis if t.graha.id == "saturn").retrograde is True
    assert data.disclaimer is not None
    assert data.disclaimer.en == (
        "These predictions are indicative. For a reading of your own chart, consult an astrologer."
    )


def _personal(name: str) -> tuple[Kaaljyoti, Any]:
    return client(response(200, fixture(name)))


BIRTH_1990 = Birth(
    datetime="1990-05-14T10:30:00",
    timezone="Asia/Kolkata",
    latitude=28.6139,
    longitude=77.209,
    place="New Delhi",
)


def test_reports_grahas_reads_nine_grahas() -> None:
    kj, http = _personal("reading-grahas")
    answer = kj.reports.grahas(KundliRequest(birth=BIRTH_1990))
    assert http.last.url.endswith(operation("postReportsGrahas").path)
    assert isinstance(answer.data, ReadingGrahasDocument)
    grahas = answer.data.grahas or []
    assert [g.graha.id for g in grahas] == [
        "sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"
    ]  # fmt: skip
    sun = grahas[0]
    assert isinstance(sun, GrahaReading)
    assert (sun.sign.id, sun.house) == ("aries", 10)
    assert (sun.in_sign.text.en or "").startswith("Your Sun is in Aries")
    assert sun.in_house.text.hi
    assert answer.meta.engine == "0.10.1"


def test_reports_yogas_names_each_by_code() -> None:
    kj, http = _personal("reading-yogas")
    answer = kj.reports.yogas(KundliRequest(birth=BIRTH_1990))
    assert http.last.url.endswith(operation("postReportsYogas").path)
    yogas = answer.data.yogas or []
    assert isinstance(yogas[0], YogaReading)
    assert (yogas[0].code, yogas[0].category) == ("gaja_kesari", "Chandra")
    assert [p.id for p in yogas[0].participants] == ["jupiter", "moon"]
    assert yogas[0].name is not None
    assert (yogas[0].name.en, yogas[0].name.hi) == ("Gaja-Kesari Yoga", "गजकेसरी योग")


def test_reports_kundli_answers_the_parts_asked_for() -> None:
    kj, http = _personal("reading-kundli")
    answer = kj.reports.kundli(
        ReportKundliRequest(birth=BIRTH_1990, parts=["lagna", "yogas", "vimshottari", "varshphal"])
    )
    assert http.last.url.endswith(operation("postReportsKundli").path)
    assert json.loads(http.last.body or b"")["parts"] == [
        "lagna", "yogas", "vimshottari", "varshphal"
    ]  # fmt: skip
    data = answer.data
    assert isinstance(data, KundliReportDocument)
    assert data.parts == ["lagna", "yogas", "vimshottari", "varshphal"]
    assert data.lagna is not None and data.lagna.sign.id == "cancer"
    assert data.yogas and data.yogas[0].code == "gaja_kesari"
    assert data.vimshottari is not None
    assert len([p for p in data.vimshottari.periods if p.current]) == 1
    # No year was sent: the API reads the one running now.
    assert data.varshphal is not None and data.varshphal.year == 2026
    # Four parts at 5 credits each.
    assert answer.meta.credits == 20


def test_reports_vimshottari_marks_the_current_mahadasha() -> None:
    kj, http = _personal("reading-vimshottari")
    answer = kj.reports.vimshottari(KundliRequest(birth=BIRTH_1990))
    assert http.last.url.endswith(operation("postReportsVimshottari").path)
    periods = answer.data.periods
    assert all(isinstance(p, MahadashaReading) for p in periods)
    assert [p.lord.id for p in periods] == [
        "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn"
    ]  # fmt: skip
    assert [(p.lord.id, p.level) for p in periods if p.current] == [("mars", "mixed")]
    assert periods[0].antardashas


def test_reports_varshphal_sends_the_year() -> None:
    kj, http = _personal("reading-varshphal")
    answer = kj.reports.varshphal(VarshphalRequest(birth=BIRTH_1990, year=2026))
    assert http.last.url.endswith(operation("postReportsVarshphal").path)
    assert json.loads(http.last.body or b"")["year"] == 2026
    data = answer.data
    assert data.year == 2026
    assert data.summary.level == "mixed"
    assert [a.area for a in data.areas] == [
        "work", "money", "relationships", "health", "education", "home", "travel"
    ]  # fmt: skip
    assert len(data.months) == 10
    assert isinstance(data.months[0], VarshphalPeriod)
    assert data.months[0].lord.id == "venus"


def test_reports_life_areas_reads_eleven_areas() -> None:
    kj, http = _personal("reading-life-areas")
    answer = kj.reports.life_areas(KundliRequest(birth=BIRTH_1990))
    assert http.last.url.endswith(operation("postReportsLifeAreas").path)
    data = answer.data
    assert data.summary.strongest == ["foreign", "marriage"]
    assert data.summary.needs_care == ["children", "fortune"]
    assert len(data.areas) == 11
    assert isinstance(data.areas[0], LifeArea)
    assert (data.areas[0].area, data.areas[0].level) == ("self", "favourable")


def test_a_month_with_no_credits_left_raises_quota_exceeded() -> None:
    refusal = {
        "status": "error",
        "error": {
            "code": "quota_exceeded",
            "message": (
                "you have used all 1,000 credits for this month (1,000 included in the Free plan)"
            ),
            "docs": "https://kaaljyoti.com/api/docs/errors#quota_exceeded",
        },
    }
    kj, _ = client(response(402, refusal))
    with pytest.raises(KaaljyotiError) as raised:
        kj.reports.life_areas(KundliRequest(birth=BIRTH_1990))
    assert raised.value.code == "quota_exceeded"
    assert raised.value.status == 402


def test_reports_lagna_reads_a_sign_in_both_languages() -> None:
    kj, http = client(response(200, fixture("reading-lagna")))
    answer = kj.reports.lagna(
        ReportLagnaRequest(sign="leo", options=CalculationOptions(language=["en", "hi"]))
    )
    assert http.last.url.endswith(operation("postReportsLagna").path)
    assert json.loads(http.last.body or b"") == {
        "sign": "leo",
        "options": {"language": ["en", "hi"]},
    }
    assert isinstance(answer.data, ReadingLagnaDocument)
    lagna = answer.data.lagna
    assert lagna is not None
    assert lagna.sign.id == "leo"
    assert lagna.sign.names == {"en": "Leo", "hi": "सिंह"}
    assert lagna.entry.text.en and lagna.entry.text.hi
    assert answer.data.disclaimer is not None
    assert answer.data.disclaimer.en is not None
    assert answer.data.disclaimer.en.startswith("These predictions are indicative.")


def test_reports_nakshatra_sends_a_named_disclaimer() -> None:
    kj, http = client(response(200, fixture("reading-nakshatra")))
    answer = kj.reports.nakshatra(
        ReportNakshatraRequest(
            nakshatra="purva_phalguni",
            options=CalculationOptions(
                disclaimer=Disclaimer(name="Acharya Amit Verma", url="https://kaaljyoti.com")
            ),
        )
    )
    assert http.last.url.endswith(operation("postReportsNakshatra").path)
    assert json.loads(http.last.body or b"") == {
        "nakshatra": "purva_phalguni",
        "options": {"disclaimer": {"name": "Acharya Amit Verma", "url": "https://kaaljyoti.com"}},
    }
    assert isinstance(answer.data, ReadingNakshatraDocument)
    reading = answer.data.nakshatra
    assert reading is not None
    assert reading.nakshatra.id == "purva_phalguni"
    assert reading.entry.text.en
    assert answer.data.disclaimer is not None
    assert answer.data.disclaimer.en == (
        "These predictions are indicative. For a reading of your own chart, consult "
        "Acharya Amit Verma (https://kaaljyoti.com)."
    )


def test_reports_house_lords_reads_twelve_houses_in_order() -> None:
    kj, http = client(response(200, fixture("reading-house-lords")))
    birth = Birth(
        datetime="1987-03-18T12:06:00",
        timezone="Asia/Kolkata",
        latitude=28.6139,
        longitude=77.209,
    )
    answer = kj.reports.house_lords(
        KundliRequest(birth=birth, options=CalculationOptions(language=["en", "hi"]))
    )
    assert http.last.method == "POST"
    assert http.last.url.endswith(operation("postReportsHouseLords").path)
    assert json.loads(http.last.body or b"") == {
        "birth": {
            "datetime": "1987-03-18T12:06:00",
            "timezone": "Asia/Kolkata",
            "latitude": 28.6139,
            "longitude": 77.209,
        },
        "options": {"language": ["en", "hi"]},
    }
    assert isinstance(answer.data, ReadingHouseLordsDocument)
    assert isinstance(answer.meta, Meta)
    lords = answer.data.house_lords
    assert lords is not None
    assert [lord.house for lord in lords] == list(range(1, 13))
    # Gemini rising: Mercury rules the 1st and sits in the 9th.
    first = lords[0]
    assert (first.sign.id, first.lord.id, first.in_house) == ("gemini", "mercury", 9)
    assert first.lord.names == {"en": "Mercury", "hi": "बुध"}
    for lord in lords:
        assert lord.entry.text.en and lord.entry.text.hi
    assert answer.data.disclaimer is not None
    assert "सांकेतिक" in (answer.data.disclaimer.hi or "")
    assert answer.meta.engine == "0.5.0"


def test_the_disclaimer_can_be_turned_off() -> None:
    recorded = fixture("reading-lagna")
    kj, http = client(envelope({"lagna": recorded["data"]["lagna"]}, recorded["meta"]))
    answer = kj.reports.lagna(
        ReportLagnaRequest(sign="leo", options=CalculationOptions(disclaimer="off"))
    )
    assert json.loads(http.last.body or b"")["options"] == {"disclaimer": "off"}
    assert answer.data.disclaimer is None


def batch_envelope() -> dict[str, Any]:
    ashtakoot = {
        "bride_mangal_dosha": False,
        "groom_mangal_dosha": True,
        "kootas": [
            {"koota": {"id": "varna", "name": "Varna"}, "max_points": 1, "points": 1},
        ],
        "mangal_dosha_mismatch": True,
        "total": 24.5,
        "verdict": "good",
    }
    return {
        "status": "ok",
        "data": {
            "results": [
                {"index": 0, "data": ashtakoot},
                {
                    "index": 1,
                    "error": {
                        "code": "validation_error",
                        "message": "Invalid input",
                        "field": "pairs.1.groom.latitude",
                    },
                },
            ]
        },
        "meta": {
            "cached": False,
            "ayanamsa": {"id": "lahiri"},
            "engine": "0.2.0",
            "compute_ms": 4,
            "language_fallback": [],
            "credits": 2,
        },
    }


def test_batch_keeps_a_pair_error_as_a_value() -> None:
    kj, http = client(response(200, batch_envelope()))
    answer = kj.match.batch(
        MatchBatchRequest(
            pairs=[
                MatchBatchRequestPairsItem(bride=BIRTH, groom=BIRTH),
                MatchBatchRequestPairsItem(bride=BIRTH, groom=BIRTH),
            ]
        )
    )
    assert isinstance(answer.data, BatchDocument)
    assert isinstance(answer.meta, BatchMeta)
    assert answer.meta.credits == 2
    first, second = answer.data.results
    assert first.error is None and first.data is not None
    assert first.data.total == 24.5
    assert second.data is None
    assert second.error is not None
    assert second.error.code == "validation_error"
    assert second.error.field == "pairs.1.groom.latitude"
    assert http.last.url.endswith("/v1/match/batch")
    assert len(json.loads(http.last.body or b"")["pairs"]) == 2


# The first bytes of every PDF, and enough of one to prove nothing re-encodes it.
PDF_BYTES = bytes([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37, 0x0A, 0xE2, 0xE3, 0xCF, 0xD3])


def pdf(**headers: str) -> Any:
    return response(
        200,
        PDF_BYTES,
        {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="kundli-ravi-kumar.pdf"',
            "X-KJ-Credits": "1000",
            "X-KJ-Credits-Remaining": "49000",
            "X-KJ-Cache": "miss",
            "X-KJ-Request-Id": "97f48252-8b54-4a7e-9e81-eb06d5a3ce02",
            **headers,
        },
    )


def test_pdf_kundli_returns_the_bytes_untouched_with_the_file_name_and_the_cost() -> None:
    kj, http = client(pdf())
    answer = kj.pdf.kundli(PdfKundliRequest(birth=BIRTH, name="Ravi Kumar", edition="basic"))
    assert isinstance(answer.data, PdfFile)
    assert answer.data.bytes == PDF_BYTES
    assert answer.data.content_type == "application/pdf"
    assert answer.data.filename == "kundli-ravi-kumar.pdf"
    assert answer.data.credits == 1000
    assert answer.credits == 1000
    assert answer.credits_remaining == 49000
    assert answer.meta is None
    assert answer.cached is False
    assert answer.request_id == "97f48252-8b54-4a7e-9e81-eb06d5a3ce02"
    assert http.last.url == "https://api.kaaljyoti.com/v1/pdf/kundli"
    assert http.last.headers["Accept"] == "application/pdf"
    assert http.last.headers["Content-Type"] == "application/json"
    assert json.loads(http.last.body or b"")["name"] == "Ravi Kumar"


def test_pdf_reports_a_cache_hit_from_the_header_the_only_place_it_can_be() -> None:
    kj, _ = client(pdf(**{"X-KJ-Cache": "hit"}))
    answer = kj.pdf.match(PdfMatchRequest(bride=BIRTH, groom=BIRTH, name="Sita"))
    assert answer.cached is True


def test_pdf_answers_none_for_the_headers_a_proxy_stripped() -> None:
    kj, http = client(response(200, PDF_BYTES, {"Content-Type": "application/pdf"}))
    answer = kj.pdf.varshphal(PdfVarshphalRequest(birth=BIRTH, year=2026))
    assert answer.data.filename is None
    assert answer.data.credits is None
    assert answer.credits is None
    assert answer.credits_remaining is None
    assert http.last.url.endswith("/v1/pdf/varshphal")


def test_pdf_raises_the_json_error_a_refused_pdf_answers_with() -> None:
    refusal = {
        "status": "error",
        "error": {
            "code": "pdf_quota_exceeded",
            "message": "This month's PDFs are used up.",
            "docs": "https://kaaljyoti.com/api/docs/errors#pdf_quota_exceeded",
        },
    }
    kj, http = client(response(402, refusal))
    with pytest.raises(KaaljyotiError) as caught:
        kj.pdf.panchang_month(
            PdfPanchangMonthRequest(latitude=25.3176, longitude=82.9739, month="2026-10")
        )
    assert caught.value.code == "pdf_quota_exceeded"
    assert caught.value.status == 402
    assert http.last.url.endswith("/v1/pdf/panchang/month")


def test_errors_propagate_out_of_every_namespace() -> None:
    kj, _ = client(response(400, fixture("error")))
    with pytest.raises(KaaljyotiError) as caught:
        kj.panchang.daily(PanchangRequest(latitude=1.0, longitude=2.0))
    assert caught.value.field == "options.language"
    kj, _ = client(TransportError("down"), max_retries=0)
    with pytest.raises(KaaljyotiError) as caught:
        kj.match.batch(MatchBatchRequest(pairs=[]))
    assert caught.value.code == KaaljyotiError.NETWORK_ERROR


def test_the_constructor_takes_keyword_arguments_only() -> None:
    with pytest.raises(TypeError):
        Kaaljyoti("kj_test_x")  # type: ignore[misc]


def test_the_constructor_wires_its_options_into_the_transport() -> None:
    http = RecordingClient(response(200, fixture("kundli")))
    kj = Kaaljyoti(
        api_key=PUB_KEY,
        base_url="https://api-staging.kaaljyoti.com/v1/",
        http_client=http,
        timeout_seconds=7,
        max_retries=0,
        client_tag="demo/1",
        headers={"Origin": "http://localhost:3000"},
    )
    kj.kundli.get(KundliRequest(birth=BIRTH))
    sent = http.last
    assert sent.url.startswith("https://api-staging.kaaljyoti.com/v1/kundli?key=")
    assert sent.timeout_seconds == 7
    assert sent.headers["X-KJ-Client"] == "demo/1"
    assert sent.headers["Origin"] == "http://localhost:3000"
    assert kj.transport.max_retries == 0


def test_a_context_manager_leaves_an_injected_client_open() -> None:
    http = RecordingClient(response(200, fixture("kundli")))
    with Kaaljyoti(api_key="kj_test_x", http_client=http) as kj:
        kj.kundli.get(KundliRequest(birth=BIRTH))
    assert http.closed is False


def test_a_context_manager_closes_the_client_the_sdk_created(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created: list[RecordingClient] = []

    def factory() -> RecordingClient:
        made = RecordingClient(response(200, fixture("kundli")))
        created.append(made)
        return made

    monkeypatch.setattr(kaaljyoti.transport, "UrllibClient", factory)
    with Kaaljyoti(api_key="kj_test_x") as kj:
        kj.kundli.get(KundliRequest(birth=BIRTH))
        assert created[0].closed is False
    assert created[0].closed is True


def test_namespaces_can_be_pulled_out() -> None:
    kj, http = client(response(200, fixture("kundli")))
    kundli = kj.kundli
    kundli.get(KundliRequest(birth=BIRTH))
    assert len(http.requests) == 1
