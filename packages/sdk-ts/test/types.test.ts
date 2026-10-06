/**
 * Drift between `types.ts` and the snapshot, caught at build time.
 *
 * `pnpm typecheck` compiles this file, so every assignment below is an
 * assertion: a recorded answer the API really sent must still fit the type
 * the SDK says it has. If a field is renamed in `openapi.json` and `pnpm gen`
 * regenerates, these stop compiling — which is the point, and is cheaper than
 * finding out from a caller. The runtime expectations exist so that the file
 * is also a test rather than only a compilation unit; vitest typecheck mode
 * is not configured for this workspace.
 */

import { describe, expect, it } from 'vitest';
import type {
  BirthInput,
  CalculationOptions,
  ChartDocument,
  DailyPanchangDocument,
  ErrorEnvelope,
  HealthDocument,
  KundliDocument,
  KundliRequest,
  LabelledId,
  MatchBatchRequest,
  Meta,
  DashaRequest,
  DisclaimerOption,
  HoroscopeRequest,
  AreaSummary,
  GrahaReading,
  HoroscopeDocument,
  HoroscopeTransit,
  LifeArea,
  LifeAreasDocument,
  MahadashaReading,
  ReadingGrahasDocument,
  ReadingSummary,
  ReadingYogasDocument,
  ReportVarshphalRequest,
  VarshphalPeriod,
  VarshphalReadingDocument,
  VimshottariReadingDocument,
  YogaReading,
  HouseLord,
  ReadingHouseLordsDocument,
  ReportHouseLordsRequest,
  Place,
  ReadingLagnaDocument,
  ReadingNakshatraDocument,
  ReportLagnaRequest,
  ReportNakshatraRequest,
  MuhurtaDocument,
  MuhurtaRequest,
  ReferenceList,
  TimezoneDocument,
  Ayanamsa,
  HouseSystem,
  PdfKundliOptions,
  PdfKundliRequest,
  Varga,
  VargasRequest,
} from '../src/types.ts';
import kundliFixture from './fixtures/kundli.json';
import panchangFixture from './fixtures/panchang.json';
import muhurtaFixture from './fixtures/muhurta.json';
import chartFixture from './fixtures/chart.json';
import errorFixture from './fixtures/error.json';
import horoscopeFixture from './fixtures/horoscope.json';
import lagnaFixture from './fixtures/reading-lagna.json';
import houseLordsFixture from './fixtures/reading-house-lords.json';
import nakshatraFixture from './fixtures/reading-nakshatra.json';
import grahasFixture from './fixtures/reading-grahas.json';
import yogasFixture from './fixtures/reading-yogas.json';
import vimshottariFixture from './fixtures/reading-vimshottari.json';
import varshphalFixture from './fixtures/reading-varshphal.json';
import lifeAreasFixture from './fixtures/reading-life-areas.json';

/**
 * The labelled fields are asserted on deliberately: the snapshot describes
 * the body the gateway sends, `{ id, name, names? }` where an id was named
 * (`LabelledId`), and these are the assignments that would stop compiling if
 * a snapshot were ever cut from a gateway that had forgotten to say so.
 */
describe('recorded answers still fit their types', () => {
  it('kundli', () => {
    const data = kundliFixture.data as unknown as KundliDocument;
    const meta = kundliFixture.meta as unknown as Meta;
    const lagna: LabelledId = data.lagna_sign;
    const sun = data.positions['sun'];
    expect(lagna.id).toBe('cancer');
    expect(lagna.names?.['hi']).toBe('कर्क');
    expect(sun?.planet.id).toBe('sun');
    expect(sun?.nakshatra.name).toBe('Krittika');
    expect(data.yogas[0]?.participants[0]?.id).toBe('jupiter');
    expect(data.birth.timezone_name).toBe('Asia/Kolkata');
    expect(data.house_cusps).toHaveLength(12);
    expect(meta.timezone.source).toBe('given');
  });

  it('panchang', () => {
    const data = panchangFixture.data as unknown as DailyPanchangDocument;
    const karana: LabelledId = data.panchang.karana_name;
    const vara: LabelledId = data.panchang.vara;
    expect(karana.id).toBe('vishti');
    expect(karana.names?.['hi']).toBe('विष्टि');
    expect(vara.id).toBe('mangalavara');
    expect(data.masa.month_name.names?.['hi']).toBe('भाद्रपद');
    expect(data.tithis[1]?.name.id).toBe('dwadashi');
    expect(data.tithis[1]?.paksha.id).toBe('shukla');
    expect(data.panchang.pada).toBe(1);
    expect(data.panchang.nakshatra.id).toBe('shravana');
    expect(data.lagna_sign.name).toBe('Scorpio');
  });

  it('muhurta', () => {
    const data = muhurtaFixture.data as unknown as MuhurtaDocument;
    expect(data.abhijit_applies).toBe(true);
  });

  it('chart', () => {
    const data = chartFixture.data as unknown as ChartDocument;
    expect(data.svg.startsWith('<svg')).toBe(true);
    expect(data.style).toBe('north');
  });

  it('readings', () => {
    const lagna = lagnaFixture.data as unknown as ReadingLagnaDocument;
    const nakshatra = nakshatraFixture.data as unknown as ReadingNakshatraDocument;
    const sign: LabelledId | undefined = lagna.lagna?.sign;
    expect(sign?.id).toBe('leo');
    expect(lagna.lagna?.entry.text.hi).toMatch(/[ऀ-ॿ]/);
    expect(nakshatra.nakshatra?.nakshatra.id).toBe('purva_phalguni');
    expect(nakshatra.disclaimer?.en).toContain('Acharya Amit Verma');
  });

  it('house lords', () => {
    const data = houseLordsFixture.data as unknown as ReadingHouseLordsDocument;
    const lords: HouseLord[] = data.house_lords ?? [];
    expect(lords).toHaveLength(12);
    expect(lords[6]?.sign.names?.['hi']).toBe('धनु');
    expect(lords[6]?.in_house).toBe(10);
    expect(lords[6]?.entry.text.hi).toMatch(/[ऀ-ॿ]/);
  });

  it('horoscope', () => {
    const data = horoscopeFixture.data as unknown as HoroscopeDocument;
    const summary: ReadingSummary = data.summary;
    const areas: AreaSummary[] = data.areas;
    const moon: HoroscopeTransit[] = data.basis.filter((t) => t.graha.id === 'moon');
    expect(summary.text.hi).toMatch(/[ऀ-ॿ]/);
    expect(areas).toHaveLength(5);
    expect(moon).toHaveLength(2);
    expect(data.sign.names?.['hi']).toBe('मेष');
  });

  it('grahas and yogas', () => {
    const grahas: GrahaReading[] =
      (grahasFixture.data as unknown as ReadingGrahasDocument).grahas ?? [];
    const yogas: YogaReading[] = (yogasFixture.data as unknown as ReadingYogasDocument).yogas ?? [];
    expect(grahas[1]?.sign.names?.['hi']).toBe('धनु');
    expect(grahas[1]?.in_house.text.en).toBeTruthy();
    expect(yogas[0]?.participants[0]?.names?.['hi']).toBe('गुरु');
  });

  it('vimshottari, varshphal and life areas', () => {
    const periods: MahadashaReading[] = (
      vimshottariFixture.data as unknown as VimshottariReadingDocument
    ).periods;
    const year = varshphalFixture.data as unknown as VarshphalReadingDocument;
    const months: VarshphalPeriod[] = year.months;
    const areas: LifeArea[] = (lifeAreasFixture.data as unknown as LifeAreasDocument).areas;
    expect(periods.find((p) => p.current)?.lord.id).toBe('mars');
    expect(months[0]?.level).toBe('favourable');
    expect(year.summary.text.en).toBeTruthy();
    expect(areas.map((a) => a.area)).toContain('career');
  });

  it('error', () => {
    const envelope = errorFixture as unknown as ErrorEnvelope;
    expect(envelope.status).toBe('error');
    expect(envelope.error.code).toBe('validation_error');
    expect(envelope.error.field).toBe('options.language');
  });
});

describe('hand-written values still fit their request types', () => {
  it('a birth is a wall clock plus a place', () => {
    const birth: BirthInput = {
      datetime: '1990-05-14T10:30:00',
      timezone: 'Asia/Kolkata',
      latitude: 28.6139,
      longitude: 77.209,
      place: 'New Delhi',
    };
    const options: CalculationOptions = {
      ayanamsa: 'lahiri',
      language: ['en', 'hi'],
    };
    const request: KundliRequest = { birth, options };

    expect(request.birth.latitude).toBeCloseTo(28.6139, 4);
    expect(request.options?.ayanamsa).toBe('lahiri');
  });

  it('only the kundli PDF takes a house system', () => {
    const birth: BirthInput = { datetime: '1990-05-14T10:30:00', latitude: 28.6, longitude: 77.2 };
    // The API answers 400 to `options.house_system` anywhere but the kundli PDF.
    // @ts-expect-error -- the shared options have no `house_system`
    const shared: CalculationOptions = { house_system: 'whole_sign' };
    const system: HouseSystem = 'kp';
    const options: PdfKundliOptions = { language: ['en'], house_system: system };
    const pdf: PdfKundliRequest = { birth, options };
    // A `CalculationOptions` is still a valid `PdfKundliOptions`.
    const plain: PdfKundliOptions = { ayanamsa: 'lahiri' } satisfies CalculationOptions;

    expect(shared).toBeDefined();
    expect(pdf.options?.house_system).toBe('kp');
    expect(plain.house_system).toBeUndefined();
  });

  it('the ayanamsa, varga and dasha levels are the closed lists the API documents', () => {
    const ayanamsa: Ayanamsa = 'krishnamurti';
    // @ts-expect-error -- not an ayanamsa the API lists
    const unknown: Ayanamsa = 'not_an_ayanamsa';
    const vargas: Varga[] = ['d1', 'd9', 'd60'];
    // @ts-expect-error -- d5 is not a varga
    const d5: Varga = 'd5';
    const request: VargasRequest = {
      birth: { datetime: '1990-05-14T10:30:00', latitude: 28.6, longitude: 77.2 },
      vargas,
      options: { ayanamsa },
    };
    const levels: NonNullable<DashaRequest['levels']>[] = [1, 2, 3, 4, 5];
    // @ts-expect-error -- six levels is one too many
    const six: NonNullable<DashaRequest['levels']> = 6;

    expect([unknown, d5, six]).toHaveLength(3);
    expect(request.vargas).toEqual(['d1', 'd9', 'd60']);
    expect(levels).toHaveLength(5);
  });

  it('a muhurta takes a birth, or a place and a date', () => {
    const byBirth: MuhurtaRequest = {
      birth: { datetime: '1990-05-14T10:30:00', latitude: 28.6, longitude: 77.2 },
    };
    const byPlace: MuhurtaRequest = {
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
      date: '2026-09-22',
    };
    expect(byBirth.birth).toBeDefined();
    expect(byPlace.birth).toBeUndefined();
  });

  it('a dasha goes to five levels, the deep ones inside a window', () => {
    const request: DashaRequest = {
      birth: { datetime: '1990-05-14T10:30:00', latitude: 28.6, longitude: 77.2 },
      system: 'chara',
      levels: 5,
      from: '2026-09-01T00:00:00Z',
      to: '2026-10-01T00:00:00Z',
    };
    expect(request.levels).toBe(5);
  });

  it('a batch is a list of pairs of births', () => {
    const one: BirthInput = { datetime: '1990-05-14T10:30:00', latitude: 28.6, longitude: 77.2 };
    const request: MatchBatchRequest = { pairs: [{ bride: one, groom: one }] };
    expect(request.pairs).toHaveLength(1);
  });

  it('a reading takes a birth, or the sign or nakshatra itself', () => {
    const byBirth: ReportLagnaRequest = {
      birth: { datetime: '1990-05-14T10:30:00', latitude: 28.6, longitude: 77.2 },
    };
    const bySign: ReportLagnaRequest = { sign: 'leo', options: { language: ['en', 'hi'] } };
    const byNakshatra: ReportNakshatraRequest = { nakshatra: 'purva_phalguni' };
    expect(byBirth.sign).toBeUndefined();
    expect(bySign.sign).toBe('leo');
    expect(byNakshatra.nakshatra).toBe('purva_phalguni');
  });

  it('the house lords want a birth and nothing to pick', () => {
    const request: ReportHouseLordsRequest = {
      birth: { datetime: '1987-03-18T12:06:00', latitude: 28.6139, longitude: 77.209 },
      options: { language: 'hi', disclaimer: 'off' },
    };
    expect(request.birth.latitude).toBe(28.6139);
  });

  it('a varshphal reading is a birth and a year', () => {
    const request: ReportVarshphalRequest = {
      birth: { datetime: '1990-05-14T10:30:00', latitude: 28.6139, longitude: 77.209 },
      year: 2026,
    };
    expect(request.year).toBe(2026);
  });

  it('a horoscope is a sign and a period, and the disclaimer takes three forms', () => {
    const named: DisclaimerOption = { name: 'Acharya Amit Verma', url: 'https://kaaljyoti.com' };
    const forms: DisclaimerOption[] = ['default', 'off', named];
    const request: HoroscopeRequest = {
      sign: 'aries',
      period: 'weekly',
      date: '2026-09-28',
      utc_offset: '+05:30',
      options: { disclaimer: named },
    };
    expect(forms).toHaveLength(3);
    expect(request.period).toBe('weekly');
  });

  it('a place carries the zone a birth wants', () => {
    const place: Place = {
      id: 1261481,
      name: 'New Delhi',
      region: 'Delhi',
      country: 'IN',
      country_name: 'India',
      latitude: 28.63576,
      longitude: 77.22445,
      timezone: 'Asia/Kolkata',
      population: 317797,
    };
    const birth: BirthInput = {
      datetime: '1990-05-14T10:30:00',
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
    };
    expect(birth.timezone).toBe('Asia/Kolkata');
  });

  it('a reference list is one of the twelve tables', () => {
    const lists: ReferenceList[] = [
      'ayanamsas',
      'planets',
      'dasha-systems',
      'languages',
      'credits',
    ];
    expect(lists).toContain('planets');
  });

  it('health and timezone answer their own shapes', () => {
    const health: HealthDocument = {
      status: 'ok',
      engine: '0.2.0',
      ephemeris: 'kaaljyoti-ephemeris 0.1.1',
      ops: 42,
      uptime_s: 900,
    };
    const timezone: TimezoneDocument = {
      name: 'Asia/Kolkata',
      utc_offset: '+06:30',
      source: 'derived',
    };
    expect(health.ops).toBe(42);
    expect(timezone.source).toBe('derived');
  });
});
