"""`Kaaljyoti`, the client, and its namespaces."""

from __future__ import annotations

import urllib.parse
from collections.abc import Callable, Mapping, Sequence
from types import TracebackType
from typing import Any, Protocol, TypeVar

from kaaljyoti.generated._json import as_dict, as_list, as_str
from kaaljyoti.generated.models import (
    AshtakavargaDocument,
    BatchDocument,
    BatchMeta,
    BhavaBalaDocument,
    ChalitDocument,
    ChalitRequest,
    ChartDocument,
    CompareDocument,
    DailyPanchangDocument,
    DashaDocument,
    DashaRequest,
    EphemerisMonthDocument,
    EphemerisMonthRequest,
    EventsDocument,
    GrahaDrishtiDocument,
    HealthDocument,
    HoroscopeDocument,
    HoroscopeRequest,
    JaiminiAspectsDocument,
    JaiminiKarakamshaDocument,
    JaiminiKarakasDocument,
    JaiminiPadasDocument,
    KotaDocument,
    KpDocument,
    KundliChartRequest,
    KundliDocument,
    KundliReportDocument,
    KundliRequest,
    LifeAreasDocument,
    MaitriDocument,
    MatchAshtakootDocument,
    MatchAshtakootRequest,
    MatchBatchRequest,
    MatchCompareRequest,
    Meta,
    MuhurtaDocument,
    MuhurtaRequest,
    Nakshatra28Document,
    PaceDocument,
    PanchangMonthDocument,
    PanchangMonthRequest,
    PanchangRequest,
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
    ReadingYogasDocument,
    ReferenceMeta,
    ReportKundliRequest,
    ReportLagnaRequest,
    ReportNakshatraRequest,
    SadeSatiDocument,
    SadeSatiRequest,
    SarvatobhadraDocument,
    ShadbalaDocument,
    SpecialLagnasDocument,
    TimezoneDocument,
    TimezoneMeta,
    TransitEventsDocument,
    TransitEventsRequest,
    TransitNowDocument,
    TransitNowRequest,
    TransitScanDocument,
    TransitScanRequest,
    TripatakiDocument,
    VargasDocument,
    VargasRequest,
    VarshphalHarshaBalaDocument,
    VarshphalMuddaDocument,
    VarshphalReadingDocument,
    VarshphalRequest,
    VarshphalSahamsDocument,
    VarshphalTajikaDocument,
    VarshphalVarshaYearDocument,
    VikramSamvatDocument,
    VikramSamvatRequest,
    VimshottariReadingDocument,
    YogasDocument,
)
from kaaljyoti.generated.operations import operation
from kaaljyoti.http import HttpClient
from kaaljyoti.result import PdfFile, Result
from kaaljyoti.transport import Transport

__all__ = [
    "CalendarApi",
    "EphemerisApi",
    "JaiminiApi",
    "Kaaljyoti",
    "KpApi",
    "KundliApi",
    "MatchApi",
    "PanchangApi",
    "PdfApi",
    "ReportsApi",
    "TransitApi",
    "VarshphalApi",
]

D = TypeVar("D")


class _Request(Protocol):
    """Any generated request class: all the transport needs is its wire shape."""

    def to_dict(self) -> dict[str, Any]: ...


class _Section:
    """One namespace of the client: a transport and the shape most operations share.

    **No path string is typed twice.** Every method looks its path up in the
    generated operation table by `operationId`, so a renamed endpoint is a
    `KeyError` naming the id that is gone rather than a 404 in production, and
    the contract test walks the same table against `openapi/openapi.json`.
    """

    def __init__(self, transport: Transport) -> None:
        """Bind the namespace to the client's transport."""
        self._transport = transport

    def _document(
        self,
        operation_id: str,
        request: _Request,
        from_dict: Callable[[Mapping[str, Any]], D],
    ) -> Result[D, Meta]:
        """A POST that answers a document and the standard `meta`."""
        return self._transport.post(
            operation(operation_id).path,
            request.to_dict(),
            lambda json: from_dict(as_dict(json)),
            lambda json: Meta.from_dict(as_dict(json)),
        )


class KundliApi(_Section):
    """`kj.kundli` — the birth chart and the nineteen documents read from one.

    Every method here costs 1 credit, takes one generated request class and
    answers the envelope whole. `dasha` and `kota_chakra` are never cached.
    """

    def get(self, request: KundliRequest) -> Result[KundliDocument, Meta]:
        """`POST /v1/kundli` — positions, houses and the panchang at birth."""
        return self._document("postKundli", request, KundliDocument.from_dict)

    def chart(self, request: KundliChartRequest) -> Result[ChartDocument, Meta]:
        """`POST /v1/kundli/chart` — the chart document, with the markup in `svg`. Use
        `chart_svg()` for the markup alone.

        `first_house` rotates the chart: `lagna` (the default), a graha — `moon`
        draws the Chandra kundli — or `house_2` … `house_12` for bhavat bhavam.
        The document echoes `first_house`, names the sign drawn as house 1 in
        `first_house_sign` and says what the chart is in `title`.
        """
        return self._document("postKundliChart", request, ChartDocument.from_dict)

    def chart_svg(self, request: KundliChartRequest) -> Result[str, None]:
        """`POST /v1/kundli/chart` asked for as `image/svg+xml` — the markup itself.

        The same endpoint and the same call cost as `chart()`; only the
        `Accept` differs. Markup carries no envelope, so `meta` is `None`. A
        failure is an envelope whatever `Accept` asked for, so this raises the
        same `KaaljyotiError` as everything else.
        """
        return self._transport.post(
            operation("postKundliChart").path,
            request.to_dict(),
            as_str,
            None,
            Transport.ACCEPT_SVG,
        )

    def dasha(self, request: DashaRequest) -> Result[DashaDocument, Meta]:
        """`POST /v1/kundli/dasha` — the periods of one system. Never cached."""
        return self._document("postKundliDasha", request, DashaDocument.from_dict)

    def vargas(self, request: VargasRequest) -> Result[VargasDocument, Meta]:
        """`POST /v1/kundli/vargas` — the divisional charts."""
        return self._document("postKundliVargas", request, VargasDocument.from_dict)

    def chalit(self, request: ChalitRequest) -> Result[ChalitDocument, Meta]:
        """`POST /v1/kundli/chalit` — the bhava chalit cusps."""
        return self._document("postKundliChalit", request, ChalitDocument.from_dict)

    def yogas(self, request: KundliRequest) -> Result[YogasDocument, Meta]:
        """`POST /v1/kundli/yogas` — the yogas present, with the parts that make each one."""
        return self._document("postKundliYogas", request, YogasDocument.from_dict)

    def shadbala(self, request: KundliRequest) -> Result[ShadbalaDocument, Meta]:
        """`POST /v1/kundli/shadbala` — the six strengths, per planet."""
        return self._document("postKundliShadbala", request, ShadbalaDocument.from_dict)

    def bhava_bala(self, request: KundliRequest) -> Result[BhavaBalaDocument, Meta]:
        """`POST /v1/kundli/bhava-bala` — the house strengths."""
        return self._document("postKundliBhavaBala", request, BhavaBalaDocument.from_dict)

    def ashtakavarga(self, request: KundliRequest) -> Result[AshtakavargaDocument, Meta]:
        """`POST /v1/kundli/ashtakavarga` — bhinna and sarva."""
        return self._document("postKundliAshtakavarga", request, AshtakavargaDocument.from_dict)

    def graha_drishti(self, request: KundliRequest) -> Result[GrahaDrishtiDocument, Meta]:
        """`POST /v1/kundli/graha-drishti` — the planetary aspects."""
        return self._document("postKundliGrahaDrishti", request, GrahaDrishtiDocument.from_dict)

    def maitri(self, request: KundliRequest) -> Result[MaitriDocument, Meta]:
        """`POST /v1/kundli/maitri` — natural, temporal and compound friendship."""
        return self._document("postKundliMaitri", request, MaitriDocument.from_dict)

    def pace(self, request: KundliRequest) -> Result[PaceDocument, Meta]:
        """`POST /v1/kundli/pace` — placement and condition, per planet."""
        return self._document("postKundliPace", request, PaceDocument.from_dict)

    def special_lagnas(self, request: KundliRequest) -> Result[SpecialLagnasDocument, Meta]:
        """`POST /v1/kundli/special-lagnas` — bhava, hora, ghatika and the rest."""
        return self._document("postKundliSpecialLagnas", request, SpecialLagnasDocument.from_dict)

    def tripataki(self, request: KundliRequest) -> Result[TripatakiDocument, Meta]:
        """`POST /v1/kundli/tripataki` — the tripataki chakra."""
        return self._document("postKundliTripataki", request, TripatakiDocument.from_dict)

    def sarvatobhadra(self, request: KundliRequest) -> Result[SarvatobhadraDocument, Meta]:
        """`POST /v1/kundli/sarvatobhadra` — the sarvatobhadra chakra."""
        return self._document("postKundliSarvatobhadra", request, SarvatobhadraDocument.from_dict)

    def nakshatra28(self, request: KundliRequest) -> Result[Nakshatra28Document, Meta]:
        """`POST /v1/kundli/nakshatra28` — positions in the 28-nakshatra scheme."""
        return self._document("postKundliNakshatra28", request, Nakshatra28Document.from_dict)

    def sade_sati(self, request: SadeSatiRequest) -> Result[SadeSatiDocument, Meta]:
        """`POST /v1/kundli/sade-sati` — Saturn over the moon sign, in a window."""
        return self._document("postKundliSadeSati", request, SadeSatiDocument.from_dict)

    def events(self, request: SadeSatiRequest) -> Result[EventsDocument, Meta]:
        """`POST /v1/kundli/events` — what is coming, in a window."""
        return self._document("postKundliEvents", request, EventsDocument.from_dict)

    def kota_chakra(self, request: KundliRequest) -> Result[KotaDocument, Meta]:
        """`POST /v1/kundli/kota-chakra` — the kota chakra. Never cached."""
        return self._document("postKundliKotaChakra", request, KotaDocument.from_dict)


class PanchangApi(_Section):
    """`kj.panchang` — daily panchang, the day's windows, a month of panchang.

    `daily` and `month` are about a place and a day, not a person, so their
    requests take the place fields flat, with no `Birth`. `muhurta` takes
    either.
    """

    def daily(self, request: PanchangRequest) -> Result[DailyPanchangDocument, Meta]:
        """`POST /v1/panchang` — the five limbs for a place and a day."""
        return self._document("postPanchang", request, DailyPanchangDocument.from_dict)

    def muhurta(self, request: MuhurtaRequest) -> Result[MuhurtaDocument, Meta]:
        """`POST /v1/panchang/muhurta` — the day's windows, choghadiya and hora.

        Send either `birth` (the answer adds `tara_bala` and `chandra_bala`) or a
        place — `latitude`, `longitude`, optional `timezone`/`utc_offset` — with
        an optional `date`, as for `daily`.
        """
        return self._document("postPanchangMuhurta", request, MuhurtaDocument.from_dict)

    def month(self, request: PanchangMonthRequest) -> Result[PanchangMonthDocument, Meta]:
        """`POST /v1/panchang/month` — a month of daily panchangs. 20 credits, 10 a minute."""
        return self._document("postPanchangMonth", request, PanchangMonthDocument.from_dict)


class EphemerisApi(_Section):
    """`kj.ephemeris` — a month of graha positions at a place."""

    def month(self, request: EphemerisMonthRequest) -> Result[EphemerisMonthDocument, Meta]:
        """`POST /v1/ephemeris/month` — a month of positions, sidereal and tropical unless
        `system` narrows it. 20 credits, 10 a minute."""
        return self._document("postEphemerisMonth", request, EphemerisMonthDocument.from_dict)


class CalendarApi(_Section):
    """`kj.calendar` — Vikram Samvat."""

    def vikram_samvat(self, request: VikramSamvatRequest) -> Result[VikramSamvatDocument, Meta]:
        """`POST /v1/calendar/vikram-samvat` — samvat year, maasa, paksha, tithi."""
        return self._document("postCalendarVikramSamvat", request, VikramSamvatDocument.from_dict)


class JaiminiApi(_Section):
    """`kj.jaimini` — chara karakas, arudha padas, rashi drishti, karakamsha.

    The four sections are one document split four ways: asking for the second
    section of the same chart is a cache hit, and still costs its own call.
    """

    def karakas(self, request: KundliRequest) -> Result[JaiminiKarakasDocument, Meta]:
        """`POST /v1/jaimini/karakas` — the chara karakas."""
        return self._document("postJaiminiKarakas", request, JaiminiKarakasDocument.from_dict)

    def arudha_padas(self, request: KundliRequest) -> Result[JaiminiPadasDocument, Meta]:
        """`POST /v1/jaimini/arudha-padas` — arudha padas for the twelve houses."""
        return self._document("postJaiminiArudhaPadas", request, JaiminiPadasDocument.from_dict)

    def aspects(self, request: KundliRequest) -> Result[JaiminiAspectsDocument, Meta]:
        """`POST /v1/jaimini/aspects` — rashi drishti."""
        return self._document("postJaiminiAspects", request, JaiminiAspectsDocument.from_dict)

    def karakamsha(self, request: KundliRequest) -> Result[JaiminiKarakamshaDocument, Meta]:
        """`POST /v1/jaimini/karakamsha` — karakamsha lagna and what sits on it."""
        return self._document("postJaiminiKarakamsha", request, JaiminiKarakamshaDocument.from_dict)


class KpApi(_Section):
    """`kj.kp` — Krishnamurti Paddhati."""

    def chart(self, request: KundliRequest) -> Result[KpDocument, Meta]:
        """`POST /v1/kp/chart` — Placidus cusps with their sub-lords."""
        return self._document("postKpChart", request, KpDocument.from_dict)


class VarshphalApi(_Section):
    """`kj.varshphal` — the annual chart and what is read from it.

    Every method takes a `VarshphalRequest`, and the five sections are one
    document split five ways.
    """

    def get(self, request: VarshphalRequest) -> Result[VarshphalVarshaYearDocument, Meta]:
        """`POST /v1/varshphal` — the annual chart for a year."""
        return self._document("postVarshphal", request, VarshphalVarshaYearDocument.from_dict)

    def bala(self, request: VarshphalRequest) -> Result[VarshphalHarshaBalaDocument, Meta]:
        """`POST /v1/varshphal/bala` — harsha bala, panchavargiya and dwadasha."""
        return self._document("postVarshphalBala", request, VarshphalHarshaBalaDocument.from_dict)

    def sahams(self, request: VarshphalRequest) -> Result[VarshphalSahamsDocument, Meta]:
        """`POST /v1/varshphal/sahams` — the sahams for the year."""
        return self._document("postVarshphalSahams", request, VarshphalSahamsDocument.from_dict)

    def yogas(self, request: VarshphalRequest) -> Result[VarshphalTajikaDocument, Meta]:
        """`POST /v1/varshphal/yogas` — the tajika yogas."""
        return self._document("postVarshphalYogas", request, VarshphalTajikaDocument.from_dict)

    def dasha(self, request: VarshphalRequest) -> Result[VarshphalMuddaDocument, Meta]:
        """`POST /v1/varshphal/dasha` — mudda and patyayini."""
        return self._document("postVarshphalDasha", request, VarshphalMuddaDocument.from_dict)


class TransitApi(_Section):
    """`kj.transit` — the sky now, gochar over a window, and the events of a year."""

    def now(self, request: TransitNowRequest) -> Result[TransitNowDocument, Meta]:
        """`POST /v1/transit/now` — the sky at an instant. Never cached without an explicit `at`."""
        return self._document("postTransitNow", request, TransitNowDocument.from_dict)

    def scan(self, request: TransitScanRequest) -> Result[TransitScanDocument, Meta]:
        """`POST /v1/transit/scan` — gochar events in a window. 20 credits, 10 a minute, closed
        to publishable keys."""
        return self._document("postTransitScan", request, TransitScanDocument.from_dict)

    def events(self, request: TransitEventsRequest) -> Result[TransitEventsDocument, Meta]:
        """`POST /v1/transit/events` — the sign ingresses and stations of a `year`.

        The same for everyone, so there is no birth: a `year` (or a `from`…`to`
        window of at most 366 days) and a `timezone` for the local times.
        `moon`, `nakshatras` and `combustion` add more kinds. 20 credits, 10 a
        minute.
        """
        return self._document("postTransitEvents", request, TransitEventsDocument.from_dict)


class MatchApi(_Section):
    """`kj.match` — ashtakoot, a full comparison, and both in bulk."""

    def ashtakoot(self, request: MatchAshtakootRequest) -> Result[MatchAshtakootDocument, Meta]:
        """`POST /v1/match/ashtakoot` — the eight kootas and the total."""
        return self._document("postMatchAshtakoot", request, MatchAshtakootDocument.from_dict)

    def compare(self, request: MatchCompareRequest) -> Result[CompareDocument, Meta]:
        """`POST /v1/match/compare` — two charts side by side. Never cached."""
        return self._document("postMatchCompare", request, CompareDocument.from_dict)

    def batch(self, request: MatchBatchRequest) -> Result[BatchDocument, BatchMeta]:
        """`POST /v1/match/batch` — up to 100 pairs, 1 credit each.

        A pair that could not be answered comes back as `results[i].error`
        rather than as a raised exception: the other pairs were computed and
        charged, and raising would discard answers already paid for. Only the
        whole request failing — a bad key, a body over the 8 KB limit, the rate
        limit — raises.

        The `meta` is a `BatchMeta` rather than a `Meta`: there is no single
        timezone for a hundred pairs. Its `credits` is what the request cost, one
        per pair. 10 a minute, and closed to publishable keys.
        """
        return self._transport.post(
            operation("postMatchBatch").path,
            request.to_dict(),
            lambda json: BatchDocument.from_dict(as_dict(json)),
            lambda json: BatchMeta.from_dict(as_dict(json)),
        )


class ReportsApi(_Section):
    """`kj.reports` — readings of a lagna, a janma nakshatra, and a birth's own.

    The lagna and nakshatra readings take either a `birth`, whose lagna or
    nakshatra is read, or the `sign` / `nakshatra` itself, with no birth
    needed. The personal reports — the house lords, the grahas, the yogas, the
    Vimshottari dashas, the varshphal and the life areas — always take a
    `birth`. All of them are on every plan. The text comes back in every
    language of `options.language`, followed by a `disclaimer` that
    `options.disclaimer` can name an astrologer in or turn off. Each costs 5
    credits.
    """

    def lagna(self, request: ReportLagnaRequest) -> Result[ReadingLagnaDocument, Meta]:
        """`POST /v1/reports/lagna` — what the lagna says: temperament, strengths, cautions."""
        return self._document("postReportsLagna", request, ReadingLagnaDocument.from_dict)

    def nakshatra(self, request: ReportNakshatraRequest) -> Result[ReadingNakshatraDocument, Meta]:
        """`POST /v1/reports/nakshatra` — what the Moon's nakshatra at birth says."""
        return self._document("postReportsNakshatra", request, ReadingNakshatraDocument.from_dict)

    def house_lords(self, request: KundliRequest) -> Result[ReadingHouseLordsDocument, Meta]:
        """`POST /v1/reports/house-lords` — each house's lord, where it sits, and what that says.

        ```python
        answer = kj.reports.house_lords(KundliRequest(birth=birth))
        for lord in answer.data.house_lords or []:
            print(lord.house, lord.sign.name, lord.lord.name, lord.in_house, lord.entry.text.en)
            #  1 Gemini Mercury 9 Your lagna lord in the 9th, …
        ```

        Twelve entries in house order: the sign on the house, its lord, and the
        house (whole-sign, from the lagna) the lord sits in. The body is a
        `birth` and `options`, the same `KundliRequest` as `kundli.get`.
        """
        return self._document("postReportsHouseLords", request, ReadingHouseLordsDocument.from_dict)

    def grahas(self, request: KundliRequest) -> Result[ReadingGrahasDocument, Meta]:
        """`POST /v1/reports/grahas` — each graha's sign and house, and what it says in each.

        ```python
        answer = kj.reports.grahas(KundliRequest(birth=birth))
        for graha in answer.data.grahas or []:
            print(graha.graha.name, graha.sign.name, graha.house, graha.in_sign.text.en)
            #  Sun Aries 10 Your Sun is in Aries, the sign of its exaltation, …
        ```

        Nine entries, Sun to Ketu; the house is whole-sign, from the lagna.
        """
        return self._document("postReportsGrahas", request, ReadingGrahasDocument.from_dict)

    def yogas(self, request: KundliRequest) -> Result[ReadingYogasDocument, Meta]:
        """`POST /v1/reports/yogas` — the yogas that form in the chart, each with its reading.

        Each `YogaReading` has a `code` (`gaja_kesari`), a `category`, the
        grahas that make it (`participants`) and its `entry.text`.
        """
        return self._document("postReportsYogas", request, ReadingYogasDocument.from_dict)

    def vimshottari(self, request: KundliRequest) -> Result[VimshottariReadingDocument, Meta]:
        """`POST /v1/reports/vimshottari` — every mahadasha of the life, read.

        ```python
        answer = kj.reports.vimshottari(KundliRequest(birth=birth))
        now = next(p for p in answer.data.periods if p.current)
        print(now.lord.name, now.from_, now.to, now.level, now.text.en)
        ```

        Each `MahadashaReading` has its dates, a `level` — `favourable`,
        `mixed` or `care` — a text, the houses it acts on and its
        `antardashas`. `basis` is the reasoning, for you rather than the reader.
        """
        return self._document(
            "postReportsVimshottari", request, VimshottariReadingDocument.from_dict
        )

    def varshphal(self, request: VarshphalRequest) -> Result[VarshphalReadingDocument, Meta]:
        """`POST /v1/reports/varshphal` — the year from the birthday in `year`, read.

        ```python
        answer = kj.reports.varshphal(VarshphalRequest(birth=birth, year=2026))
        print(answer.data.summary.level, answer.data.summary.text.en)
        for area in answer.data.areas:
            print(area.area, area.level)  #  work mixed, money mixed, …
        ```

        A `summary`, seven areas (work, money, relationships, health,
        education, home, travel) and the year's periods (`months`, the mudda
        dasha) with their dates and levels, read by the Tajika rules.
        """
        return self._document("postReportsVarshphal", request, VarshphalReadingDocument.from_dict)

    def life_areas(self, request: KundliRequest) -> Result[LifeAreasDocument, Meta]:
        """`POST /v1/reports/life-areas` — eleven areas of life the chart shows, read.

        ```python
        answer = kj.reports.life_areas(KundliRequest(birth=birth))
        print(answer.data.summary.strongest)  #  ['foreign', 'marriage']
        for area in answer.data.areas:
            print(area.area, area.level, area.text.en)
        ```
        """
        return self._document("postReportsLifeAreas", request, LifeAreasDocument.from_dict)

    def kundli(self, request: ReportKundliRequest) -> Result[KundliReportDocument, Meta]:
        """`POST /v1/reports/kundli` — several of the reports above for one birth, at once.

        ```python
        answer = kj.reports.kundli(ReportKundliRequest(birth=birth, parts=["lagna", "vimshottari"]))
        print(answer.data.parts)  #  ['lagna', 'vimshottari']
        print(answer.meta.credits)  #  10
        ```

        `parts` names any of `lagna`, `nakshatra`, `life_areas`, `house_lords`,
        `grahas`, `yogas`, `vimshottari` and `varshphal` (default all eight);
        each comes back as its own route answers it. Without a `year` the
        varshphal is the one running now. Priced 5 credits per part.
        """
        return self._document("postReportsKundli", request, KundliReportDocument.from_dict)


def _as_pdf_file(value: Any) -> PdfFile:
    """The `PdfFile` the transport built from a PDF answer."""
    if not isinstance(value, PdfFile):
        raise TypeError(f"expected a PdfFile, got {type(value).__name__}")
    return value


class PdfApi(_Section):
    """`kj.pdf` — printable PDFs, answered as bytes.

    Each takes the JSON route's body plus the PDF fields (`template`,
    `branding`, and per route `chart_style`, `name`, …) and answers a
    `PdfFile`: the bytes, never decoded as text, with `filename` from
    `Content-Disposition` and `credits` from `X-KJ-Credits`. There is no
    envelope, so `meta` is `None`; `cached` says whether the 24-hour cache
    answered, which uses no PDF from the month's allowance but still costs the
    credits.

    Every paid plan (not Free, which raises `plan_required`), secret keys only:
    1,000 credits for a kundli and 500 for the others, and one PDF from the
    month's allowance each (Starter 50, Growth 200, Scale 500, Enterprise
    2,500), past which the error is `pdf_quota_exceeded`. `branding` in the
    body is Enterprise only — on any other plan it raises `plan_required`. A
    failure is the usual JSON error and raises a `KaaljyotiError`, never a PDF.
    """

    def _pdf(self, operation_id: str, request: _Request) -> Result[PdfFile, None]:
        return self._transport.post(
            operation(operation_id).path,
            request.to_dict(),
            _as_pdf_file,
            None,
            Transport.ACCEPT_PDF,
        )

    def kundli(self, request: PdfKundliRequest) -> Result[PdfFile, None]:
        """`POST /v1/pdf/kundli` — the birth chart, `basic` (default) or `professional` edition."""
        return self._pdf("postPdfKundli", request)

    def match(self, request: PdfMatchRequest) -> Result[PdfFile, None]:
        """`POST /v1/pdf/match` — the ashtakoot match: the kootas, both charts, mangal dosha."""
        return self._pdf("postPdfMatch", request)

    def varshphal(self, request: PdfVarshphalRequest) -> Result[PdfFile, None]:
        """`POST /v1/pdf/varshphal` — the annual chart for `year` and its reading."""
        return self._pdf("postPdfVarshphal", request)

    def panchang_month(self, request: PdfPanchangMonthRequest) -> Result[PdfFile, None]:
        """`POST /v1/pdf/panchang/month` — a month of panchang at a place, one day per row.

        `panchang_month` rather than `month`, because `kj.pdf.month` would not
        say a month of what.
        """
        return self._pdf("postPdfPanchangMonth", request)


class Kaaljyoti:
    """The Kaal Jyoti API, typed.

    ```python
    import os
    from kaaljyoti import Birth, Kaaljyoti, KundliRequest

    kj = Kaaljyoti(api_key=os.environ["KAALJYOTI_API_KEY"])
    answer = kj.kundli.get(
        KundliRequest(
            birth=Birth(
                datetime="1990-05-14T10:30:00",  # the clock on the wall at the place
                timezone="Asia/Kolkata",
                latitude=28.6139,
                longitude=77.209,
            )
        )
    )
    print(answer.data.lagna_sign.name, answer.meta.timezone.source)
    ```

    One method per endpoint, grouped the way the paths are: a caller who has
    seen `/v1/kundli/sade-sati` should be able to guess `kj.kundli.sade_sati`
    and be right. The names match the TypeScript, Dart and PHP clients, in
    snake_case.

    Every method returns the envelope — `data` and `meta` together. Every
    failure is a raised `KaaljyotiError` with a `code`; branch on
    `error.code`, never on the message.

    Usable as a context manager: leaving the block closes the HTTP client the
    SDK created for itself. A client you passed in stays yours.
    """

    kundli: KundliApi
    """The birth chart and the nineteen documents computed from one."""
    panchang: PanchangApi
    """Daily panchang, the day's windows, a month of panchang."""
    ephemeris: EphemerisApi
    """A month of graha positions."""
    calendar: CalendarApi
    """Vikram Samvat."""
    jaimini: JaiminiApi
    """Chara karakas, arudha padas, rashi drishti, karakamsha."""
    kp: KpApi
    """Krishnamurti Paddhati."""
    varshphal: VarshphalApi
    """The annual chart and what is read from it."""
    transit: TransitApi
    """The sky now, and gochar over a window."""
    match: MatchApi
    """Ashtakoot, a full comparison, and both in bulk."""
    reports: ReportsApi
    """Readings of a lagna and a janma nakshatra, and the personal reports of a birth."""
    pdf: PdfApi
    """Printable kundli, match, varshphal and monthly panchang PDFs, answered as bytes."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str | None = Transport.DEFAULT_BASE_URL,
        http_client: HttpClient | None = None,
        timeout_seconds: float = 30.0,
        max_retries: int = 2,
        client_tag: str | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        """Build a client. `api_key` is the only option without a default.

        - `api_key`: placed by its prefix — `kj_pub_…` travels as `?key=`,
          everything else as `Authorization: Bearer`. An empty key is refused
          before the network, as `invalid_key`. The SDK never reads the
          environment for you, so a process with two keys cannot pick the wrong
          one by accident.
        - `base_url`: default `https://api.kaaljyoti.com`; a trailing `/` or
          `/v1` is trimmed, so staging is one option and not a separate build.
        - `http_client`: your own `HttpClient` — an `HttpxClient`, a fake in a
          test. Default a new `UrllibClient`.
        - `timeout_seconds`: the deadline **per attempt**, not per call.
        - `max_retries`: the retry budget; `0` turns retrying off entirely.
        - `client_tag`: `X-KJ-Client`, default `sdk-python/<version>`, so a
          shell built on this SDK can attribute usage to itself.
        - `headers`: extra headers on every request — an `Origin` for a
          publishable key used from a server, say. Cannot override the key,
          `Accept`, `Content-Type` or the tag.
        """
        self._bind(
            Transport(
                api_key=api_key,
                base_url=base_url,
                http_client=http_client,
                timeout_seconds=timeout_seconds,
                max_retries=max_retries,
                client_tag=client_tag,
                headers=headers,
            )
        )

    @classmethod
    def with_transport(cls, transport: Transport) -> Kaaljyoti:
        """Build a client on a `Transport` you configured yourself.

        The reason to reach for this is a test that needs to replace the retry
        sleep or watch what went out; everything else is a keyword on the
        constructor.
        """
        client = cls.__new__(cls)
        client._bind(transport)
        return client

    def _bind(self, transport: Transport) -> None:
        self._transport = transport
        self.kundli = KundliApi(transport)
        self.panchang = PanchangApi(transport)
        self.ephemeris = EphemerisApi(transport)
        self.calendar = CalendarApi(transport)
        self.jaimini = JaiminiApi(transport)
        self.kp = KpApi(transport)
        self.varshphal = VarshphalApi(transport)
        self.transit = TransitApi(transport)
        self.match = MatchApi(transport)
        self.reports = ReportsApi(transport)
        self.pdf = PdfApi(transport)

    @property
    def transport(self) -> Transport:
        """The transport every namespace sends through."""
        return self._transport

    def close(self) -> None:
        """Close the HTTP client the SDK created for itself. One you passed in is left open."""
        self._transport.close()

    def __enter__(self) -> Kaaljyoti:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def health(self) -> Result[HealthDocument, None]:
        """`GET /v1/health` — liveness. Costs no credits.

        The one answer with no envelope around it, so `meta` is always `None`.
        It keeps answering while the service is disabled, which is what makes
        it the right thing to poll after a `service_disabled`.
        """
        return self._transport.get(
            operation("getHealth").path,
            {},
            lambda json: HealthDocument.from_dict(as_dict(json)),
            None,
        )

    def reference(
        self, list_name: str, language: str | Sequence[str] | None = None
    ) -> Result[list[dict[str, Any]], ReferenceMeta]:
        """`GET /v1/reference/{list}` — a static table. Costs no credits.

        ```python
        signs = kj.reference("signs", ["en", "hi"])
        signs.data[0]["name"]  # 'Aries'
        signs.meta.language    # ['en', 'hi']
        ```

        `list_name` is one of `ayanamsas`, `planets`, `signs`, `nakshatras`,
        `tithis`, `yogas`, `karanas`, `vargas`, `dasha-systems`,
        `house-systems`, `chalit-systems`, `transit-events`, `languages`,
        `credits`. `language` is joined with commas, because the parameter is
        one comma-separated field.

        `credits` is the price list in force: one `{route, credits}` row per
        metered route, with `per` (`pair` or `part`) on the two priced per unit.

        The rows are deliberately untyped: each table publishes its own columns
        — `{id, name}` for most, `{index, name}` for the ones the engine
        numbers — and the snapshot declares them open, so a class here would be
        a guess that goes stale.
        """
        languages = [language] if isinstance(language, str) else list(language or [])
        return self._transport.get(
            # The snapshot's `{list}` placeholder, filled in. Encoded because a
            # stray `/` in a caller's string must not invent a path segment.
            operation("getReferenceList").path.replace(
                "{list}", urllib.parse.quote(list_name, safe="")
            ),
            {"language": ",".join(languages) if languages else None},
            lambda json: [as_dict(row) for row in as_list(json)],
            # Both of `ReferenceMeta`'s fields are optional, so an absent
            # `meta` is an empty one rather than a `bad_response`.
            lambda json: ReferenceMeta.from_dict({} if json is None else as_dict(json)),
        )

    def timezone(
        self, lat: float, lon: float, datetime: str | None = None
    ) -> Result[TimezoneDocument, TimezoneMeta]:
        """`GET /v1/timezone` — the zone covering a point, and its offset then. Costs no credits.

        The cheapest way to fill in a `timezone` you would otherwise have to
        guess, and the way to get a *historical* offset: a March 1944 date in
        Delhi answers `+06:30`, India's war time
        (https://kaaljyoti.com/api/docs/timezones).

        `datetime` is a wall clock, `YYYY-MM-DDTHH:MM:SS`; leave it out for the
        offset in force now. `to_wall_clock()` writes one.
        """
        return self._transport.get(
            operation("getTimezone").path,
            # `repr` of a float is its shortest round-tripping form, `28.6139`.
            {"lat": repr(float(lat)), "lon": repr(float(lon)), "datetime": datetime},
            lambda json: TimezoneDocument.from_dict(as_dict(json)),
            lambda json: TimezoneMeta.from_dict({} if json is None else as_dict(json)),
        )

    def horoscope(self, request: HoroscopeRequest) -> Result[HoroscopeDocument, Meta]:
        """`POST /v1/horoscope` — a sign's day, week, month or year, as summaries. 5 credits.

        ```python
        answer = kj.horoscope(HoroscopeRequest(sign="aries", period="weekly"))
        print(answer.data.summary.level, answer.data.summary.text.en)
        for area in answer.data.areas:
            print(area.area, area.level, area.text.en)  #  work mixed This week, …
        ```

        One `summary` and five areas — work, money, relationships, health,
        education — over `period` (`daily`, the default, `weekly`, `monthly`
        or `yearly`) from `date`, today where `timezone` (default
        `Asia/Kolkata`) or `utc_offset` says. Each has a `level` —
        `favourable`, `mixed` or `care` — and a text; there are no scores.
        `basis` lists the transits behind it (`HoroscopeTransit`: the house
        from the sign, and `entered` / `leaves` when a graha changes sign
        inside the period), for you rather than the reader.
        """
        return self._transport.post(
            operation("postHoroscope").path,
            request.to_dict(),
            lambda json: HoroscopeDocument.from_dict(as_dict(json)),
            lambda json: Meta.from_dict(as_dict(json)),
        )

    def places(
        self,
        q: str,
        *,
        country: str | None = None,
        limit: int | None = None,
        language: str | Sequence[str] | None = None,
    ) -> Result[PlacesDocument, PlacesMeta]:
        """`GET /v1/places` — places whose name begins with `q`. Costs 1 credit per search.

        ```python
        mumbai = kj.places("Bombay", country="IN").data.places[0]
        mumbai.name, mumbai.timezone  # ('Mumbai', 'Asia/Kolkata')
        ```

        Each row carries the coordinates and the IANA zone, which is everything
        a `Birth` needs besides the clock.

        Best match first, then the most populous, in Latin or Devanagari
        script. `country` is two letters; `limit` is 1 to 25, default 10;
        `language` (`en`, `hi` or both) is joined with commas, as for
        `reference`. A search box should wait for the third character and a
        pause in typing, since every search costs a credit.
        """
        languages = [language] if isinstance(language, str) else list(language or [])
        return self._transport.get(
            operation("getPlaces").path,
            {
                "q": q,
                "country": country,
                "limit": None if limit is None else str(limit),
                "language": ",".join(languages) if languages else None,
            },
            lambda json: PlacesDocument.from_dict(as_dict(json)),
            lambda json: PlacesMeta.from_dict({} if json is None else as_dict(json)),
        )
