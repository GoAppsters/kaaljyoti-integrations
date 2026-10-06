/**
 * The daily widgets' words — the panchang, the muhurta, the calendar and the
 * month (decision 24's rule for a widget's own words, shared by four): the
 * limbs, the day's windows, the sun's times. Out of `i18n.ts`, so the pages
 * of the birth calculators and the reports do not carry them.
 */

import { msg, type Dict } from './dict.ts';
import type { Lang } from './i18n.ts';

const DAILY = {
  en: {
    karana: 'Karana',
    paksha: 'Paksha',
    vara: 'Weekday',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    masa: 'Masa',
    samvat: 'Samvat',
    rahu_kaal: 'Rahu kaal',
    yamaganda: 'Yamaganda',
    gulika_kaal: 'Gulika kaal',
    abhijit: 'Abhijit muhurta',
    brahma_muhurta: 'Brahma muhurta',
    disha_shool: 'Disha shool',
    vikram_samvat: 'Vikram Samvat',
    then: 'then',
    // A limb that runs past midnight ends on a clock that belongs to the next
    // civil day, and `09:09` alone reads as this morning. @see untilText
    tomorrow: 'tomorrow',
    title_panchang: 'Panchang',
    title_muhurta: 'Muhurta and choghadiya',
    day_timeline: 'The day at a glance',
    choghadiya: 'Choghadiya',
    day_part: 'Day',
  },
  hi: {
    karana: 'करण',
    paksha: 'पक्ष',
    vara: 'वार',
    sunrise: 'सूर्योदय',
    sunset: 'सूर्यास्त',
    masa: 'मास',
    samvat: 'संवत्',
    rahu_kaal: 'राहु काल',
    yamaganda: 'यमगण्ड',
    gulika_kaal: 'गुलिक काल',
    abhijit: 'अभिजित मुहूर्त',
    brahma_muhurta: 'ब्रह्म मुहूर्त',
    disha_shool: 'दिशा शूल',
    vikram_samvat: 'विक्रम संवत्',
    then: 'फिर',
    tomorrow: 'कल',
    title_panchang: 'पंचांग',
    title_muhurta: 'मुहूर्त और चौघड़िया',
    day_timeline: 'एक नज़र में दिन',
    choghadiya: 'चौघड़िया',
    day_part: 'दिन',
  },
} satisfies Dict<string>;

/** A key of {@link DAILY}. */
export type DailyKey = keyof typeof DAILY.en;

/** A daily widget's word, `{name}` placeholders filled in. */
export function dt(lang: Lang, key: DailyKey, vars?: Record<string, string>): string {
  return msg(DAILY as Dict<DailyKey>, lang, key, vars);
}
