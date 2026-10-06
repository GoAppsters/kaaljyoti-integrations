"""The generated models against recorded staging envelopes and the snapshot."""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import Any

import pytest

import kaaljyoti
from kaaljyoti import (
    OPENAPI_VERSION,
    OPERATIONS,
    SDK_VERSION,
    Ayanamsa,
    Birth,
    CalculationOptions,
    ChartDocument,
    ChartStyle,
    DailyPanchangDocument,
    DashaRequest,
    Disclaimer,
    ErrorBody,
    HoroscopeDocument,
    HouseSystem,
    JaiminiAspectsDocumentAspectsItem,
    KaaljyotiFormatError,
    KundliDocument,
    KundliReportDocument,
    KundliRequest,
    LabelledId,
    LifeAreasDocument,
    MaitriDocument,
    Meta,
    MuhurtaDocument,
    MuhurtaRequest,
    PdfKundliOptions,
    PdfKundliRequest,
    ReadingGrahasDocument,
    ReadingHouseLordsDocument,
    ReadingLagnaDocument,
    ReadingNakshatraDocument,
    ReadingYogasDocument,
    TransitScanDocumentNatalPoints,
    Varga,
    VargasRequest,
    VarshphalReadingDocument,
    VimshottariReadingDocument,
    operation,
)

HERE = Path(__file__).parent
OPENAPI = HERE.parent.parent.parent / "openapi" / "openapi.json"


def fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((HERE / "fixtures" / f"{name}.json").read_text("utf-8"))
    return data


def strip_none(value: Any) -> Any:
    """`value` with every `None` object member removed, recursively.

    `to_dict()` leaves out every field that is `None`, because the gateway
    omits keys it has nothing to say about and a request must not send
    `"timezone": null`. The recorded envelopes do carry explicit nulls (a
    `null`-only field such as choghadiya's `planet`), so the original is
    compared with those keys dropped: same information, same wire shape.
    """
    if isinstance(value, dict):
        return {k: strip_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [strip_none(v) for v in value]
    return value


DOCUMENTS = [
    ("kundli", KundliDocument),
    ("panchang", DailyPanchangDocument),
    ("muhurta", MuhurtaDocument),
    ("chart", ChartDocument),
    ("horoscope", HoroscopeDocument),
    ("reading-lagna", ReadingLagnaDocument),
    ("reading-nakshatra", ReadingNakshatraDocument),
    ("reading-house-lords", ReadingHouseLordsDocument),
    ("reading-grahas", ReadingGrahasDocument),
    ("reading-yogas", ReadingYogasDocument),
    ("reading-vimshottari", VimshottariReadingDocument),
    ("reading-varshphal", VarshphalReadingDocument),
    ("reading-life-areas", LifeAreasDocument),
    ("reading-kundli", KundliReportDocument),
]


@pytest.mark.parametrize(("name", "cls"), DOCUMENTS)
def test_documents_read_and_round_trip(name: str, cls: Any) -> None:
    envelope = fixture(name)
    document = cls.from_dict(envelope["data"])
    assert isinstance(document, cls)
    assert document.to_dict() == strip_none(envelope["data"])


@pytest.mark.parametrize("name", [name for name, _ in DOCUMENTS])
def test_meta_reads_and_round_trips(name: str) -> None:
    meta = fixture(name)["meta"]
    parsed = Meta.from_dict(meta)
    assert isinstance(parsed.engine, str)
    assert parsed.to_dict() == strip_none(meta)


def test_kundli_is_typed_all_the_way_down() -> None:
    kundli = KundliDocument.from_dict(fixture("kundli")["data"])

    assert isinstance(kundli.lagna_sign, LabelledId)
    assert kundli.lagna_sign.id == "cancer"
    assert kundli.lagna_sign.name == "Cancer"
    assert kundli.lagna_sign.names is not None
    assert kundli.lagna_sign.names["hi"] == "कर्क"
    assert all(
        unicodedata.name(ch).startswith("DEVANAGARI") for ch in kundli.lagna_sign.names["hi"]
    )

    sun = kundli.positions["sun"]
    assert sun.planet.id == "sun"
    assert isinstance(sun.longitude, float)
    assert isinstance(sun.pada, int)
    assert isinstance(sun.is_retrograde, bool)


def test_panchang_carries_both_tithis_of_the_day() -> None:
    panchang = DailyPanchangDocument.from_dict(fixture("panchang")["data"])
    assert len(panchang.tithis) == 2
    assert panchang.tithis[1].name.id == "dwadashi"
    assert panchang.tithis[1].paksha.id == "shukla"
    assert panchang.lagna_sign.id == "scorpio"
    window = panchang.abhijit_muhurta
    assert window is not None
    assert window.start < window.end


def test_panchang_names_are_labelled_from_their_index() -> None:
    panchang = DailyPanchangDocument.from_dict(fixture("panchang")["data"])
    day = panchang.panchang
    assert isinstance(day.tithi_name, LabelledId)
    assert day.tithi_name.id == "ekadashi"
    assert day.tithi_name.names == {"en": "Ekadashi", "hi": "एकादशी"}
    assert day.vara.id == "mangalavara"
    assert day.paksha.id == "shukla"
    assert day.yoga_name.id == "atiganda"
    assert day.karana_name.id == "vishti"
    assert panchang.masa.month_name.names is not None
    assert panchang.masa.month_name.names["hi"] == "भाद्रपद"


def test_muhurta_takes_a_birth_or_a_place() -> None:
    by_place = MuhurtaRequest(latitude=28.6139, longitude=77.209, date="2026-09-22")
    assert by_place.to_dict() == {"latitude": 28.6139, "longitude": 77.209, "date": "2026-09-22"}
    by_birth = MuhurtaRequest(
        birth=Birth(datetime="1990-05-14T10:30:00", latitude=28.6139, longitude=77.209)
    )
    assert set(by_birth.to_dict()) == {"birth"}


def test_the_disclaimer_option_is_a_string_or_a_disclaimer() -> None:
    named = CalculationOptions(disclaimer=Disclaimer(name="Acharya Amit Verma"))
    assert named.to_dict() == {"disclaimer": {"name": "Acharya Amit Verma"}}
    assert CalculationOptions(disclaimer="off").to_dict() == {"disclaimer": "off"}
    assert CalculationOptions().to_dict() == {}
    wire = {"disclaimer": {"name": "A", "url": "https://kaaljyoti.com"}}
    assert CalculationOptions.from_dict(wire).disclaimer == Disclaimer(
        name="A", url="https://kaaljyoti.com"
    )
    assert CalculationOptions.from_dict({"disclaimer": "default"}).disclaimer == "default"


def test_chart_document_carries_the_svg() -> None:
    chart = ChartDocument.from_dict(fixture("chart")["data"])
    assert chart.svg.startswith("<svg")
    assert chart.style == ChartStyle.NORTH


def test_error_body_reads_the_error_envelope() -> None:
    envelope = fixture("error")
    body = ErrorBody.from_dict(envelope)
    assert body.status == "error"
    assert body.error.code == "validation_error"
    assert body.error.field == "options.language"
    assert body.error.docs.endswith("#validation_error")
    assert body.to_dict() == envelope


def test_requests_send_exactly_the_quick_start_body() -> None:
    request = KundliRequest(
        birth=Birth(
            datetime="1990-05-14T10:30:00",
            timezone="Asia/Kolkata",
            latitude=28.6139,
            longitude=77.209,
        ),
        options=CalculationOptions(language=["en", "hi"]),
    )
    body = request.to_dict()
    assert body == {
        "birth": {
            "datetime": "1990-05-14T10:30:00",
            "latitude": 28.6139,
            "longitude": 77.209,
            "timezone": "Asia/Kolkata",
        },
        # Two languages go out as the array…
        "options": {"language": ["en", "hi"]},
    }
    # Required fields first, then the optional ones, each in schema order.
    assert list(body["birth"]) == ["datetime", "latitude", "longitude", "timezone"]
    assert KundliRequest.from_dict(body) == request


def test_a_single_language_is_written_as_a_string() -> None:
    # …and one goes out as the bare string the API documents.
    options = CalculationOptions(language=["hi"], ayanamsa=Ayanamsa.KRISHNAMURTI)
    assert options.to_dict() == {"ayanamsa": "krishnamurti", "language": "hi"}
    # Read back, the bare string is a one-element list again.
    assert CalculationOptions.from_dict({"language": "hi"}).language == ["hi"]


def test_only_the_kundli_pdf_takes_a_house_system() -> None:
    # The API answers 400 to `options.house_system` anywhere but the kundli PDF,
    # so the shared options do not offer it.
    assert "house_system" not in CalculationOptions.__dataclass_fields__
    options = PdfKundliOptions(language=["en"], house_system=HouseSystem.WHOLE_SIGN)
    request = PdfKundliRequest(
        birth=Birth(datetime="1990-05-14T10:30:00", latitude=28.6, longitude=77.2), options=options
    )
    assert request.to_dict()["options"] == {"language": "en", "house_system": "whole_sign"}
    assert PdfKundliRequest.from_dict(request.to_dict()) == request
    assert HouseSystem.VALUES == ("whole_sign", "placidus", "porphyry", "equal", "sripati", "kp")


def test_the_closed_enums_are_spelled_once_as_plain_strings() -> None:
    assert len(Ayanamsa.VALUES) == 47
    assert Ayanamsa.LAHIRI == "lahiri"
    assert Ayanamsa.ARYABHATA_522 == "aryabhata_522"
    assert Varga.VALUES[0] == Varga.D1 == "d1"
    assert Varga.D60 in Varga.VALUES
    assert len(Varga.VALUES) == 16
    # The fields stay `str`: a slug the caller already holds goes in as it is.
    assert CalculationOptions(ayanamsa="raman").to_dict() == {"ayanamsa": "raman"}
    assert VargasRequest(
        birth=Birth(datetime="1990-05-14T10:30:00", latitude=28.6, longitude=77.2),
        vargas=[Varga.D9, "d10"],
    ).to_dict()["vargas"] == ["d9", "d10"]
    assert (
        DashaRequest(
            birth=Birth(datetime="1990-05-14T10:30:00", latitude=28.6, longitude=77.2),
            system="vimshottari",
            levels=3,
        ).to_dict()["levels"]
        == 3
    )


def test_map_documents_subscript_through() -> None:
    maitri = MaitriDocument.from_dict(
        {"sun": {"moon": {"compound": "friend", "natural": "friend", "temporary": "neutral"}}}
    )
    assert maitri["sun"]["moon"].natural == "friend"
    assert maitri.get("mars") is None
    assert maitri.to_dict() == {
        "sun": {"moon": {"compound": "friend", "natural": "friend", "temporary": "neutral"}}
    }


def test_renamed_fields_keep_their_wire_key() -> None:
    def sign(slug: str) -> dict[str, Any]:
        return {"id": slug, "name": slug.title()}

    wire = {
        "from": sign("aries"),
        "from_sign": sign("aries"),
        "to": sign("leo"),
        "to_sign": sign("leo"),
    }
    item = JaiminiAspectsDocumentAspectsItem.from_dict(wire)
    assert item.from_.id == "aries"
    assert JaiminiAspectsDocumentAspectsItem._WIRE == {"from_": "from"}
    assert item.to_dict() == wire

    planets = [
        "Jupiter",
        "Ketu",
        "Lagna",
        "Mars",
        "Mercury",
        "Moon",
        "Rahu",
        "Saturn",
        "Sun",
        "Venus",
    ]
    points = {name: float(i) for i, name in enumerate(planets)}
    natal = TransitScanDocumentNatalPoints.from_dict(points)
    assert natal.sun == 8.0
    assert natal.to_dict() == points


def test_operations_match_the_snapshot() -> None:
    document = json.loads(OPENAPI.read_text("utf-8"))
    ids = [
        op["operationId"]
        for item in document["paths"].values()
        for op in item.values()
        if isinstance(op, dict) and "operationId" in op
    ]
    assert len(OPERATIONS) == 58
    assert [op.id for op in OPERATIONS] == ids
    assert operation("postKundli").request_type == "KundliRequest"
    assert operation("postKundli").document_type == "KundliDocument"
    assert operation("getReferenceList").document_type is None
    # A PDF answers bytes, not a JSON document.
    assert operation("postPdfKundli").request_type == "PdfKundliRequest"
    assert operation("postPdfKundli").document_type is None
    for op in OPERATIONS:
        for name in (op.request_type, op.document_type):
            if name is not None:
                assert hasattr(kaaljyoti, name), name
    assert document["info"]["version"] == OPENAPI_VERSION
    assert SDK_VERSION == "0.1.0"
    with pytest.raises(KeyError):
        operation("postNothing")


def test_a_wrong_type_raises_a_format_error() -> None:
    with pytest.raises(KaaljyotiFormatError, match="expected a number, got str"):
        Birth.from_dict({"datetime": "1990-05-14T10:30:00", "latitude": "north", "longitude": 0})
    with pytest.raises(KaaljyotiFormatError, match="expected a string, got None"):
        Birth.from_dict({"latitude": 0, "longitude": 0})
    data = fixture("kundli")["data"]
    with pytest.raises(KaaljyotiFormatError, match="expected an object"):
        KundliDocument.from_dict({**data, "lagna_sign": "cancer"})
    with pytest.raises(KaaljyotiFormatError, match="expected an integer, got bool"):
        KundliDocument.from_dict({**data, "ayanamsa_id": True})
    # A format error is a `ValueError`, so generic handlers still catch it.
    assert issubclass(KaaljyotiFormatError, ValueError)


def test_models_are_frozen() -> None:
    birth = Birth(datetime="1990-05-14T10:30:00", latitude=0.0, longitude=0.0)
    with pytest.raises(AttributeError):
        birth.latitude = 1.0  # type: ignore[misc]
