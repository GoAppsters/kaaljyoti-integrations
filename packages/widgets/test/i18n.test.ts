import { describe, expect, it } from 'vitest';
import { msg } from '../src/core/dict.ts';
import { HOROSCOPE_WORDS } from '../src/elements/horoscope.ts';
import { masaName, nameOf, pick, t } from '../src/core/i18n.ts';
import {
  GRAHAS,
  NAKSHATRAS,
  SIGNS,
  areaName,
  houseOrdinal,
  known,
  levelHtml,
  tableName,
  textOf,
} from '../src/core/reports.ts';
import panchang from './fixtures/panchang.json';
import kundli from './fixtures/kundli.json';

describe('t', () => {
  it('answers in both languages', () => {
    expect(t('en', 'tithi')).toBe('Tithi');
    expect(t('hi', 'tithi')).toBe('तिथि');
    expect(t('en', 'submit')).toBe('Show kundli');
    expect(t('hi', 'submit')).toBe('कुंडली देखें');
  });

  it('fills the {origin} placeholder', () => {
    expect(t('en', 'forbidden_origin', { origin: 'https://example.com' })).toContain(
      'https://example.com',
    );
    expect(t('hi', 'forbidden_origin', { origin: 'https://example.com' })).toContain(
      'https://example.com',
    );
  });

  it('leaves a placeholder alone when nothing was supplied for it', () => {
    expect(t('en', 'forbidden_origin')).toContain('{origin}');
  });
});

describe('pick', () => {
  it('takes the name for the language out of the response', () => {
    const nakshatra = panchang.data.panchang.nakshatra;
    expect(pick(nakshatra.names, nakshatra.name, 'en')).toBe('Shravana');
    expect(pick(nakshatra.names, nakshatra.name, 'hi')).toBe('श्रवण');
  });

  it('falls back to the response’s English name', () => {
    expect(pick(undefined, 'Cancer', 'hi')).toBe('Cancer');
    expect(pick({ en: 'Cancer' }, 'Cancer', 'hi')).toBe('Cancer');
  });
});

describe('the panchang names', () => {
  it('reads what the API labels from an index', () => {
    const day = panchang.data.panchang;
    expect(nameOf(day.tithi_name, 'hi')).toBe('एकादशी');
    expect(nameOf(day.yoga_name, 'hi')).toBe('अतिगण्ड');
    expect(nameOf(day.karana_name, 'hi')).toBe('विष्टि');
    expect(nameOf(day.paksha, 'hi')).toBe('शुक्ल');
    expect(nameOf(day.vara, 'hi')).toBe('मंगलवार');
    expect(nameOf(day.vara, 'en')).toBe('Mangalavara');
    expect(masaName(panchang.data.masa.month_name, false, 'hi')).toBe('भाद्रपद');
  });

  it('reads the kundli fixture’s Krishna paksha and Somavara', () => {
    const day = kundli.data.panchang;
    expect(nameOf(day.paksha, 'hi')).toBe('कृष्ण');
    expect(nameOf(day.vara, 'hi')).toBe('सोमवार');
    expect(nameOf(day.karana_name, 'hi')).toBe('कौलव');
  });

  it('prefixes an adhik maasa', () => {
    const shravana = {
      id: 'shravana',
      name: 'Shravana',
      names: { en: 'Shravana', hi: 'श्रावण' },
    };
    expect(masaName(shravana, true, 'hi')).toBe('अधिक श्रावण');
    expect(masaName(shravana, true, 'en')).toBe('Adhik Shravana');
    expect(masaName(shravana, false, 'en')).toBe('Shravana');
  });

  it('falls back to `name`, and to nothing for a missing field', () => {
    expect(nameOf({ id: 'ekadashi', name: 'Ekadashi' }, 'hi')).toBe('Ekadashi');
    expect(nameOf(null, 'hi')).toBe('');
    expect(masaName(undefined, true, 'hi')).toBe('');
  });
});

describe('the report chrome', () => {
  it('puts the house where each language wants it', () => {
    expect(msg(HOROSCOPE_WORDS, 'en', 'in_house', { n: '6th' })).toBe('in your 6th house');
    expect(msg(HOROSCOPE_WORDS, 'hi', 'in_house', { n: 'षष्ठ' })).toBe('आपके षष्ठ भाव में');
  });

  it('says a house lord’s heading in each language', () => {
    const en = { house: '1st', sign: 'Gemini', lord: 'Mercury', in: '9th' };
    const hi = { house: 'प्रथम', sign: 'मिथुन', lord: 'बुध', in: 'नवम' };
    expect(t('en', 'house_lord_heading', en)).toBe('1st house · Gemini · lord Mercury in the 9th');
    expect(t('hi', 'house_lord_heading', hi)).toBe('प्रथम भाव · मिथुन · भावेश बुध नवम भाव में');
    expect(t('hi', 'house_lords')).toBe('भावेश');
  });

  it('counts houses as ordinals', () => {
    expect([1, 2, 3, 4, 11, 12].map((n) => houseOrdinal(n, 'en'))).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
    ]);
    expect(houseOrdinal(6, 'hi')).toBe('षष्ठ');
    expect(houseOrdinal(12, 'hi')).toBe('द्वादश');
  });

  it('names the periods, the areas and the levels in both languages', () => {
    expect(msg(HOROSCOPE_WORDS, 'en', 'period_weekly')).toBe('Weekly');
    expect(msg(HOROSCOPE_WORDS, 'hi', 'period_weekly')).toBe('साप्ताहिक');
    expect(t('en', 'area_relationships')).toBe('Relationships');
    expect(t('hi', 'area_money')).toBe('धन');
    expect(t('en', 'level_care')).toBe('Needs care');
    expect(t('hi', 'level_favourable')).toBe('अनुकूल');
    expect(t('hi', 'varshphal', { year: '2026' })).toBe('वर्षफल 2026');
  });

  it('names every area the reports send, and passes an unknown one through', () => {
    for (const area of ['work', 'education', 'home', 'travel', 'self', 'foreign', 'career']) {
      expect(areaName(area, 'en')).not.toBe(area);
      expect(areaName(area, 'hi')).toMatch(/[\u0900-\u097F]/);
    }
    expect(areaName('marriage', 'en')).toBe('Marriage and partnership');
    expect(areaName('spirituality', 'en')).toBe('spirituality');
  });

  it('draws a level as a badge, and nothing for a level it does not know', () => {
    expect(levelHtml('mixed', 'en')).toContain('kj-level-mixed');
    expect(levelHtml('mixed', 'hi')).toContain('मिश्रित');
    expect(levelHtml('great', 'en')).toBe('');
  });
});

describe('the bundled report names', () => {
  it('match the engine’s ids and spellings', () => {
    expect(SIGNS.map(([id]) => id)).toHaveLength(12);
    expect(NAKSHATRAS).toHaveLength(27);
    expect(tableName(SIGNS, 'scorpio', 'hi')).toBe('वृश्चिक');
    expect(tableName(NAKSHATRAS, 'uttara_bhadrapada', 'en')).toBe('Uttara Bhadrapada');
    expect(tableName(GRAHAS, 'jupiter', 'hi')).toBe('गुरु');
    expect(known(SIGNS, ' Leo ')).toBe('leo');
    expect(known(NAKSHATRAS, 'abhijit')).toBeNull();
  });

  it('reads text keyed by language, falling back to what there is', () => {
    expect(textOf({ en: 'One', hi: 'एक' }, 'hi')).toBe('एक');
    expect(textOf({ en: 'One' }, 'hi')).toBe('One');
    expect(textOf(undefined, 'en')).toBe('');
  });
});
