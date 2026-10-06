"""The client against the snapshot it was generated from.

Reads `openapi/openapi.json`, calls every operation through the public client
with a minimal request, and asserts that what went out matches what the
document says: the same verb, the same path, no query parameter the document
did not declare — and, for a secret key, no `key` in the URL at all, which is
the mistake the gateway refuses outright.

The table below is written by hand on purpose. An operation added to the API
and forgotten here fails the "every operation is exercised" assertion, which is
the only way a missing method gets noticed before a user notices.
"""

from __future__ import annotations

import json
import re
import urllib.parse
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from kaaljyoti import (
    OPERATIONS,
    Birth,
    ChalitRequest,
    DashaRequest,
    EphemerisMonthRequest,
    HoroscopeRequest,
    HouseSystem,
    HttpRequest,
    Kaaljyoti,
    KaaljyotiError,
    KundliChartRequest,
    KundliRequest,
    MatchAshtakootRequest,
    MatchBatchRequest,
    MatchBatchRequestPairsItem,
    MatchCompareRequest,
    MuhurtaRequest,
    PanchangMonthRequest,
    PanchangRequest,
    PdfKundliOptions,
    PdfKundliRequest,
    PdfMatchRequest,
    PdfPanchangMonthRequest,
    PdfVarshphalRequest,
    ReportKundliRequest,
    ReportLagnaRequest,
    ReportNakshatraRequest,
    SadeSatiRequest,
    TransitEventsRequest,
    TransitNowRequest,
    TransitScanRequest,
    Transport,
    VargasRequest,
    VarshphalRequest,
    VikramSamvatRequest,
    operation,
)
from support import PUB_KEY, SECRET_KEY, RecordingClient, response

OPENAPI = Path(__file__).parent.parent.parent.parent / "openapi" / "openapi.json"

BIRTH = Birth(
    datetime="1990-05-14T10:30:00", timezone="Asia/Kolkata", latitude=28.6139, longitude=77.209
)
KUNDLI = KundliRequest(birth=BIRTH)
WINDOW = SadeSatiRequest(birth=BIRTH)
VARSHPHAL = VarshphalRequest(birth=BIRTH, year=2026)
LAT, LON, ZONE = 28.6139, 77.209, "Asia/Kolkata"
PDF_KUNDLI = PdfKundliRequest(
    birth=BIRTH,
    name="Ravi Kumar",
    edition="professional",
    template="modern",
    vargas=["d1", "d9"],
    options=PdfKundliOptions(language=["en", "hi"], house_system=HouseSystem.KP),
)
PDF_MATCH = PdfMatchRequest(bride=BIRTH, groom=BIRTH, name="Sita", partner_name="Ram")
PDF_VARSHPHAL = PdfVarshphalRequest(birth=BIRTH, year=2026, name="Ravi Kumar", chart_style="south")
PDF_MONTH = PdfPanchangMonthRequest(
    latitude=LAT, longitude=LON, timezone=ZONE, month="2026-09", template="minimal"
)

# One call on the client per `operationId`. `kundli.chart_svg` is deliberately
# absent: it is the same operation as `kundli.chart` with a different `Accept`,
# and test_client covers the difference.
CALLS: dict[str, Callable[[Kaaljyoti], object]] = {
    "getHealth": lambda kj: kj.health(),
    "getReferenceList": lambda kj: kj.reference("signs", ["en", "hi"]),
    "getTimezone": lambda kj: kj.timezone(LAT, LON),
    "getPlaces": lambda kj: kj.places("Delhi", country="IN", limit=5, language=["en", "hi"]),
    "postKundli": lambda kj: kj.kundli.get(KUNDLI),
    "postKundliChart": lambda kj: kj.kundli.chart(KundliChartRequest(birth=BIRTH)),
    "postKundliDasha": lambda kj: kj.kundli.dasha(DashaRequest(birth=BIRTH, system="vimshottari")),
    "postKundliVargas": lambda kj: kj.kundli.vargas(VargasRequest(birth=BIRTH)),
    "postKundliChalit": lambda kj: kj.kundli.chalit(ChalitRequest(birth=BIRTH)),
    "postKundliYogas": lambda kj: kj.kundli.yogas(KUNDLI),
    "postKundliShadbala": lambda kj: kj.kundli.shadbala(KUNDLI),
    "postKundliBhavaBala": lambda kj: kj.kundli.bhava_bala(KUNDLI),
    "postKundliAshtakavarga": lambda kj: kj.kundli.ashtakavarga(KUNDLI),
    "postKundliGrahaDrishti": lambda kj: kj.kundli.graha_drishti(KUNDLI),
    "postKundliMaitri": lambda kj: kj.kundli.maitri(KUNDLI),
    "postKundliPace": lambda kj: kj.kundli.pace(KUNDLI),
    "postKundliSpecialLagnas": lambda kj: kj.kundli.special_lagnas(KUNDLI),
    "postKundliTripataki": lambda kj: kj.kundli.tripataki(KUNDLI),
    "postKundliSarvatobhadra": lambda kj: kj.kundli.sarvatobhadra(KUNDLI),
    "postKundliNakshatra28": lambda kj: kj.kundli.nakshatra28(KUNDLI),
    "postKundliSadeSati": lambda kj: kj.kundli.sade_sati(WINDOW),
    "postKundliEvents": lambda kj: kj.kundli.events(WINDOW),
    "postKundliKotaChakra": lambda kj: kj.kundli.kota_chakra(KUNDLI),
    "postPanchang": lambda kj: kj.panchang.daily(
        PanchangRequest(latitude=LAT, longitude=LON, timezone=ZONE)
    ),
    "postPanchangMuhurta": lambda kj: kj.panchang.muhurta(MuhurtaRequest(birth=BIRTH)),
    "postPanchangMonth": lambda kj: kj.panchang.month(
        PanchangMonthRequest(latitude=LAT, longitude=LON, month="2026-09", timezone=ZONE)
    ),
    "postEphemerisMonth": lambda kj: kj.ephemeris.month(
        EphemerisMonthRequest(latitude=LAT, longitude=LON, month="2026-09", timezone=ZONE)
    ),
    "postCalendarVikramSamvat": lambda kj: kj.calendar.vikram_samvat(
        VikramSamvatRequest(
            datetime="2026-09-22T12:00:00", latitude=LAT, longitude=LON, timezone=ZONE
        )
    ),
    "postJaiminiKarakas": lambda kj: kj.jaimini.karakas(KUNDLI),
    "postJaiminiArudhaPadas": lambda kj: kj.jaimini.arudha_padas(KUNDLI),
    "postJaiminiAspects": lambda kj: kj.jaimini.aspects(KUNDLI),
    "postJaiminiKarakamsha": lambda kj: kj.jaimini.karakamsha(KUNDLI),
    "postKpChart": lambda kj: kj.kp.chart(KUNDLI),
    "postVarshphal": lambda kj: kj.varshphal.get(VARSHPHAL),
    "postVarshphalBala": lambda kj: kj.varshphal.bala(VARSHPHAL),
    "postVarshphalSahams": lambda kj: kj.varshphal.sahams(VARSHPHAL),
    "postVarshphalYogas": lambda kj: kj.varshphal.yogas(VARSHPHAL),
    "postVarshphalDasha": lambda kj: kj.varshphal.dasha(VARSHPHAL),
    "postTransitNow": lambda kj: kj.transit.now(
        TransitNowRequest(latitude=LAT, longitude=LON, timezone=ZONE)
    ),
    "postTransitEvents": lambda kj: kj.transit.events(TransitEventsRequest(year=2026)),
    "postTransitScan": lambda kj: kj.transit.scan(
        TransitScanRequest(birth=BIRTH, from_="2026-01-01", to="2026-12-31")
    ),
    "postMatchAshtakoot": lambda kj: kj.match.ashtakoot(
        MatchAshtakootRequest(bride=BIRTH, groom=BIRTH)
    ),
    "postMatchCompare": lambda kj: kj.match.compare(
        MatchCompareRequest(birth=BIRTH, partner=BIRTH)
    ),
    "postMatchBatch": lambda kj: kj.match.batch(
        MatchBatchRequest(pairs=[MatchBatchRequestPairsItem(bride=BIRTH, groom=BIRTH)])
    ),
    "postReportsLagna": lambda kj: kj.reports.lagna(ReportLagnaRequest(birth=BIRTH)),
    "postReportsNakshatra": lambda kj: kj.reports.nakshatra(
        ReportNakshatraRequest(nakshatra="ashwini")
    ),
    "postReportsHouseLords": lambda kj: kj.reports.house_lords(KUNDLI),
    "postReportsGrahas": lambda kj: kj.reports.grahas(KUNDLI),
    "postReportsYogas": lambda kj: kj.reports.yogas(KUNDLI),
    "postReportsVimshottari": lambda kj: kj.reports.vimshottari(KUNDLI),
    "postReportsVarshphal": lambda kj: kj.reports.varshphal(VARSHPHAL),
    "postReportsLifeAreas": lambda kj: kj.reports.life_areas(KUNDLI),
    "postReportsKundli": lambda kj: kj.reports.kundli(
        ReportKundliRequest(birth=BIRTH, parts=["lagna", "yogas"])
    ),
    "postHoroscope": lambda kj: kj.horoscope(HoroscopeRequest(sign="aries")),
    # PDFs — the bytes, not an envelope. The stub's JSON is read as bytes too.
    "postPdfKundli": lambda kj: kj.pdf.kundli(PDF_KUNDLI),
    "postPdfMatch": lambda kj: kj.pdf.match(PDF_MATCH),
    "postPdfVarshphal": lambda kj: kj.pdf.varshphal(PDF_VARSHPHAL),
    "postPdfPanchangMonth": lambda kj: kj.pdf.panchang_month(PDF_MONTH),
}


def snapshot() -> dict[str, dict[str, Any]]:
    """Every operation the snapshot documents: verb, path and declared query parameters."""
    document = json.loads(OPENAPI.read_text("utf-8"))
    found: dict[str, dict[str, Any]] = {}
    for path, by_method in document["paths"].items():
        for verb, op in by_method.items():
            found[op["operationId"]] = {
                "method": verb.upper(),
                "path": path,
                "parameters": [
                    p["name"] for p in op.get("parameters", []) if p.get("in") == "query"
                ],
            }
    return found


def run_every_operation(api_key: str) -> dict[str, HttpRequest]:
    """Calls every operation once and returns what went out, by `operationId`."""
    sent: dict[str, HttpRequest] = {}
    for op_id, call in CALLS.items():
        # An empty envelope: enough for the transport to accept, never enough
        # for a generated document to read. The request is what this test is
        # about, so a `bad_response` on the way back is expected.
        http = RecordingClient(response(200, {"status": "ok", "data": {}, "meta": {}}))
        kj = Kaaljyoti.with_transport(
            Transport(api_key=api_key, http_client=http, max_retries=0, sleep=http.sleep)
        )
        try:
            call(kj)
        except KaaljyotiError as error:
            assert error.code == KaaljyotiError.BAD_RESPONSE, f"{op_id}: {error}"
        assert len(http.requests) == 1, op_id
        sent[op_id] = http.last
    return sent


def path_pattern(path: str) -> re.Pattern[str]:
    """`/v1/reference/{list}` as a pattern a concrete path must match."""
    return re.compile("^" + "[^/]+".join(re.escape(p) for p in re.split(r"\{[^}]+\}", path)) + "$")


def test_the_generated_table_is_the_snapshot_operation_for_operation() -> None:
    documented = {f"{o['method']} {o['path']} ({i})" for i, o in snapshot().items()}
    assert {str(op) for op in OPERATIONS} == documented
    assert len(OPERATIONS) == len(documented)


def test_the_one_hard_coded_path_in_the_transport_is_still_the_health_path() -> None:
    assert operation("getHealth").path == Transport.HEALTH_PATH


def test_every_operation_the_api_documents_has_a_method_on_the_client() -> None:
    assert sorted(CALLS) == sorted(snapshot())


@pytest.fixture(scope="module")
def sent_with_pub_key() -> dict[str, HttpRequest]:
    return run_every_operation(PUB_KEY)


@pytest.fixture(scope="module")
def sent_with_secret_key() -> dict[str, HttpRequest]:
    return run_every_operation(SECRET_KEY)


def test_every_operation_goes_to_the_verb_and_path_the_document_names(
    sent_with_pub_key: dict[str, HttpRequest],
) -> None:
    documented = snapshot()
    assert len(sent_with_pub_key) == len(documented), "every operation is called exactly once"
    for op_id, op in documented.items():
        request = sent_with_pub_key[op_id]
        assert request.method == op["method"], op_id
        path = urllib.parse.urlsplit(request.url).path
        assert path_pattern(op["path"]).match(path), f"{op_id} went to {path}, not {op['path']}"


def test_no_query_parameter_the_document_did_not_declare_beyond_the_key(
    sent_with_pub_key: dict[str, HttpRequest],
) -> None:
    for op_id, op in snapshot().items():
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(sent_with_pub_key[op_id].url).query)
        for name in query:
            assert name == "key" or name in op["parameters"], f'{op_id} sent "{name}"'
        # A publishable key travels in the query, because a browser cannot send the header.
        assert query["key"] == [PUB_KEY], op_id
        assert "Authorization" not in sent_with_pub_key[op_id].headers, op_id


def test_a_secret_key_is_never_in_a_url_on_any_operation(
    sent_with_secret_key: dict[str, HttpRequest],
) -> None:
    for op_id, request in sent_with_secret_key.items():
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(request.url).query)
        assert "key" not in query, op_id
        assert SECRET_KEY not in request.url, op_id
        assert request.headers["Authorization"] == f"Bearer {SECRET_KEY}", op_id


def test_a_post_carries_a_json_body_and_a_get_carries_none(
    sent_with_secret_key: dict[str, HttpRequest],
) -> None:
    for op_id, op in snapshot().items():
        request = sent_with_secret_key[op_id]
        if op["method"] == "GET":
            assert request.body is None, op_id
            assert "Content-Type" not in request.headers, op_id
        else:
            assert request.body is not None, op_id
            assert isinstance(json.loads(request.body.decode("utf-8")), dict), op_id
            assert request.headers["Content-Type"] == "application/json", op_id


def test_a_pdf_operation_asks_for_the_pdf_and_every_other_for_json(
    sent_with_secret_key: dict[str, HttpRequest],
) -> None:
    for op in OPERATIONS:
        expected = Transport.ACCEPT_PDF if op.tag == "PDF" else Transport.ACCEPT_JSON
        assert sent_with_secret_key[op.id].headers["Accept"] == expected, op.id
