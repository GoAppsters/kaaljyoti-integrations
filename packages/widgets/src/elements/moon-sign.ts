/**
 * `<kj-moon-sign>` — the rashi and janma nakshatra finder (revamp §4, 10).
 *
 * A birth in, the Moon's sign, its degree in the sign, the nakshatra and its
 * pada out, and the nakshatra's reading under them. Two calls per birth:
 * `POST /v1/kundli` (the same body as the kundli form's, so a page with both
 * pays once) and `POST /v1/reports/nakshatra`, drawn by an inner
 * `<kj-reading type="nakshatra">`. `reading="off"` drops the reading and
 * its call.
 */

import { html, trusted } from '../core/element.ts';
import { msg, type Dict } from '../core/extra.ts';
import { pick, t, type Lang } from '../core/i18n.ts';
import { DISCLAIMER_ATTRIBUTES } from '../core/reports.ts';
import { isOff } from '../core/config.ts';
import { signHtml, tilesHtml, type Tile } from '../core/ui.ts';
import { CALC_ATTRIBUTES, KjBirthCalc, defineOnce } from './birth-calc.ts';
import type { KjBirth } from './chart.ts';
import type { Kundli } from './kundli-report.ts';
import { KjReading } from './reading.ts';

const M: Dict<'title' | 'submit' | 'rashi' | 'degree' | 'janma'> = {
  en: {
    title: 'Moon sign and nakshatra',
    submit: 'Find my moon sign',
    rashi: 'Moon sign (rashi)',
    degree: 'Moon in the sign',
    janma: 'Janma nakshatra',
  },
  hi: {
    title: 'चंद्र राशि और नक्षत्र',
    submit: 'मेरी राशि जानें',
    rashi: 'चंद्र राशि',
    degree: 'राशि में चंद्रमा',
    janma: 'जन्म नक्षत्र',
  },
};

/** The body every `/v1/kundli` in the package sends, so the page memo matches. */
export function kundliBody(birth: KjBirth): unknown {
  return { birth, options: { language: ['en', 'hi'] } };
}

/**
 * An inner `<kj-reading>` of `type` for the current birth, in the slot the
 * last paint made; the page's disclaimer attributes go with it.
 */
export function mountReading(
  host: KjMoonSign,
  root: ShadowRoot,
  type: string,
  extra: Record<string, string> = {},
): void {
  const slot = root.querySelector(`[data-reading-slot="${type}"]`);
  const birth = host.currentBirth;
  if (!slot || !birth) return;
  const reading = host.readingElement(type);
  reading.setAttribute('type', type);
  for (const name of DISCLAIMER_ATTRIBUTES) {
    const value = host.getAttribute(name);
    if (value) reading.setAttribute(name, value);
    else reading.removeAttribute(name);
  }
  for (const [name, value] of Object.entries(extra)) reading.setAttribute(name, value);
  reading.birth = birth;
  slot.append(reading);
}

/** @see KjBirthCalc */
export class KjMoonSign extends KjBirthCalc {
  static readonly tag: string = 'kj-moon-sign';

  static readonly observedAttributes = [...CALC_ATTRIBUTES, 'reading'];

  protected override primary = 'kundli';

  /** The birth the result is for, for {@link mountReading}. */
  get currentBirth(): KjBirth | null {
    return this.current;
  }

  /** The inner reading of `type`, created once. */
  readingElement(type: string): KjReading {
    return this.innerElement(`reading-${type}`, () => {
      defineOnce(KjReading);
      return document.createElement(KjReading.tag) as KjReading;
    });
  }

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override start(birth: KjBirth): void {
    this.need('kundli', '/kundli', kundliBody(birth));
  }

  protected override resultBody(lang: Lang): string {
    const pending = this.pending('kundli', 'tiles');
    if (pending) return pending;
    const kundli = this.ready<Kundli>('kundli') ?? {};
    const moon = kundli.moon_sign;
    const nakshatra = kundli.moon_nakshatra;
    const position = kundli.positions?.moon;
    const pada = kundli.panchang?.pada ?? position?.pada;
    const tiles: Tile[] = [
      {
        key: 'rashi',
        label: msg(M, lang, 'rashi'),
        value: signHtml(moon?.id, pick(moon?.names, moon?.name ?? '—', lang), 'm'),
        sub: position?.degrees_in_sign_dms
          ? html`${msg(M, lang, 'degree')} ${position.degrees_in_sign_dms}`
          : undefined,
      },
      {
        key: 'nakshatra',
        label: msg(M, lang, 'janma'),
        value: html`${pick(nakshatra?.names, nakshatra?.name ?? '—', lang)}`,
        sub: pada ? html`${t(lang, 'pada')} ${pada}` : undefined,
      },
    ];
    const reading = isOff(this.getAttribute('reading'))
      ? ''
      : '<div class="kj-slot kj-section" data-reading-slot="nakshatra"></div>';
    return html`${trusted(tilesHtml(tiles, 'moon'))}${trusted(reading)}`;
  }

  protected override mountInner(): void {
    if (!isOff(this.getAttribute('reading'))) mountReading(this, this.root, 'nakshatra');
  }
}
