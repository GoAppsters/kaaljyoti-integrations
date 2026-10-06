/**
 * The ESM entry: everything, and nothing registered.
 *
 * Design decision 2 — a bundler or a framework stays in control, so importing
 * this module has no effect on `customElements` until `define()` is called.
 * The CDN build (`cdn.ts`) is the one that calls it for you.
 */

import { KjPanchang } from './elements/panchang.ts';
import { KjMuhurta } from './elements/muhurta.ts';
import { KjChart } from './elements/chart.ts';
import { KjKundliForm } from './elements/kundli-form.ts';
import { KjMatchForm } from './elements/match-form.ts';
import { KjHoroscope } from './elements/horoscope.ts';
import { KjReading } from './elements/reading.ts';
import { KjPanchangMonth } from './elements/panchang-month.ts';
import { KjCalendar } from './elements/calendar.ts';
import { KjTransits } from './elements/transits.ts';
import { KjEphemeris } from './elements/ephemeris.ts';
import { KjMoonSign } from './elements/moon-sign.ts';
import { KjLagna } from './elements/lagna.ts';
import { KjManglik } from './elements/manglik.ts';
import { KjSadeSati } from './elements/sade-sati.ts';
import { KjDasha } from './elements/dasha.ts';
import { KjVargas } from './elements/vargas.ts';
import { KjKp } from './elements/kp.ts';
import { KjStrength } from './elements/strength.ts';
import { KjLifeAreas } from './elements/life-areas.ts';
import { KjVarshphal } from './elements/varshphal.ts';
import { KjVimshottariReading } from './elements/vimshottari-reading.ts';

export {
  configure,
  getConfig,
  resetConfig,
  readScriptConfig,
  VERSION,
  CLIENT_TAG,
} from './core/config.ts';
export type {
  KjConfig,
  KjFont,
  KjPreset,
  KjTheme,
  PdfEdition,
  PlaceProvider,
  TimeFormat,
} from './core/config.ts';
export { PROXY_PREFERRED, SERVER_ONLY } from './core/call.ts';
export { request, setFetch } from './core/client.ts';
export type { KjResponse, KjRequestInit } from './core/client.ts';
export { KjError, CLIENT_ERROR_CODES } from './core/errors.ts';
export type { KjErrorDetail } from './core/errors.ts';
export { KjElement, esc, html } from './core/element.ts';
export { requiredPlan } from './core/ui.ts';
export type { KjState } from './core/element.ts';
export { PLACES, resolvePlace, findPlace } from './core/places.ts';
export type { Place, Coordinates, PlaceQuery } from './core/places.ts';
export { t, pick } from './core/i18n.ts';
export type { Lang, MessageKey } from './core/i18n.ts';
export { clock, window, dateLabel, isoDate, formatDegrees } from './core/format.ts';
export type { KjBirth } from './elements/chart.ts';
export type { KjMatchPair } from './elements/match-form.ts';
export type { HoroscopeDocument, HoroscopeBasis } from './elements/horoscope.ts';
export type {
  DashaPeriod,
  GrahaReading,
  HouseLord,
  ReadingDocument,
  ReadingType,
  YearPeriod,
  YogaReading,
} from './elements/reading.ts';
export type { Level, Summary } from './core/reports.ts';
export {
  KjPanchang,
  KjMuhurta,
  KjChart,
  KjKundliForm,
  KjMatchForm,
  KjHoroscope,
  KjReading,
  KjPanchangMonth,
  KjCalendar,
  KjTransits,
  KjEphemeris,
  KjMoonSign,
  KjLagna,
  KjManglik,
  KjSadeSati,
  KjDasha,
  KjVargas,
  KjKp,
  KjStrength,
  KjLifeAreas,
  KjVarshphal,
  KjVimshottariReading,
};

/** A `KjElement` subclass that knows its own tag. */
type KjElementClass = CustomElementConstructor & { readonly tag: string };

const ELEMENTS: readonly KjElementClass[] = [
  KjPanchang,
  KjMuhurta,
  KjChart,
  KjKundliForm,
  KjMatchForm,
  KjHoroscope,
  KjReading,
  KjPanchangMonth,
  KjCalendar,
  KjTransits,
  KjEphemeris,
  KjMoonSign,
  KjLagna,
  KjManglik,
  KjSadeSati,
  KjDasha,
  KjVargas,
  KjKp,
  KjStrength,
  KjLifeAreas,
  KjVarshphal,
  KjVimshottariReading,
];

/**
 * Register every element.
 *
 * Idempotent, and it has to be: two copies of the bundle on one page (a theme
 * and a plugin, say) would otherwise make the second one throw on a name the
 * first already took, and take the rest of that page's scripts down with it.
 */
export function define(): void {
  if (typeof customElements === 'undefined') return;
  for (const element of ELEMENTS) {
    if (!customElements.get(element.tag)) customElements.define(element.tag, element);
  }
}
