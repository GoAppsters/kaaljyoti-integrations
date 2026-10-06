/**
 * `<kj-manglik>` — the Mangal dosha checker, with the other doshas the chart
 * forms (revamp §4, 12).
 *
 * One call per birth, `POST /v1/kundli/yogas`: the yogas and doshas the
 * engine detects, each with a category, a code, an English `detail` and the
 * grahas in it. Mangal dosha comes first as the answer ("Manglik" / "Not
 * manglik"), with the house Mars is in and — when the engine says so — its
 * mitigation (Mars in its own or exalted sign). The other doshas follow;
 * the yogas that are not doshas are left to the kundli report.
 *
 * What the API says is what is shown: the engine checks Mars from the
 * lagna in the 1st, 2nd, 4th, 7th, 8th and 12th houses and notes one
 * mitigation, so the widget claims no other cancellation. The dosha names
 * are the engine's own (en and hi, from its i18n tables, since this route
 * names them in English only); the `detail` line is English, so a Hindi card
 * shows the grahas instead.
 */

import { html, trusted } from '../core/element.ts';
import { msg, type Dict } from '../core/extra.ts';
import { nameOf, type Labelled, type Lang } from '../core/i18n.ts';
import { houseOrdinal } from '../core/reports.ts';
import { badgeHtml, stateHtml } from '../core/ui.ts';
import { CALC_ATTRIBUTES, KjBirthCalc } from './birth-calc.ts';
import type { KjBirth } from './chart.ts';

const M: Dict<
  | 'title'
  | 'submit'
  | 'manglik'
  | 'not_manglik'
  | 'mars_in'
  | 'mitigated'
  | 'rule'
  | 'others'
  | 'none'
  | 'present'
  | 'grahas'
> = {
  en: {
    title: 'Manglik and dosha check',
    submit: 'Check doshas',
    manglik: 'Manglik: Mangal dosha is present',
    not_manglik: 'Not manglik: no Mangal dosha',
    mars_in: 'Mars is in the {house} house from the lagna.',
    mitigated: 'Mitigated: Mars is in its own or exalted sign.',
    rule: 'Checked from the lagna: Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house.',
    others: 'Other doshas in the chart',
    none: 'No other doshas found in this chart.',
    present: 'Present',
    grahas: 'Grahas',
  },
  hi: {
    title: 'मांगलिक और दोष विचार',
    submit: 'दोष देखें',
    manglik: 'मांगलिक: मंगल दोष है',
    not_manglik: 'मांगलिक नहीं: मंगल दोष नहीं है',
    mars_in: 'मंगल लग्न से {house} भाव में है।',
    mitigated: 'परिहार: मंगल अपनी या उच्च राशि में है।',
    rule: 'लग्न से विचार: मंगल प्रथम, द्वितीय, चतुर्थ, सप्तम, अष्टम या द्वादश भाव में।',
    others: 'कुंडली के अन्य दोष',
    none: 'इस कुंडली में कोई अन्य दोष नहीं मिला।',
    present: 'है',
    grahas: 'ग्रह',
  },
};

/** The engine's dosha names (`kj-engine/i18n`), for a route that sends English only. */
const DOSHA_NAMES: Record<string, [string, string]> = {
  mangal_dosha: ['Mangal Dosha', 'मंगल दोष'],
  kaal_sarp: ['Kaal Sarp Dosha', 'काल सर्प दोष'],
  kaal_sarp_partial: ['Partial Kaal Sarp', 'आंशिक काल सर्प'],
  guru_chandal: ['Guru-Chandal Dosha', 'गुरु-चांडाल दोष'],
  vish_yoga: ['Vish Yoga', 'विष योग'],
  angarak_dosha: ['Angarak Dosha', 'अंगारक दोष'],
  grahan_dosha: ['Grahan Dosha', 'ग्रहण दोष'],
  kemadruma: ['Kemadruma Yoga', 'केमद्रुम योग'],
  shakata: ['Shakata Yoga', 'शकट योग'],
};

/** One detected yoga or dosha of `POST /v1/kundli/yogas`. */
export interface DetectedYoga {
  category?: string | null;
  code?: string | null;
  /** English, the engine's. */
  detail?: string | null;
  name?: string | null;
  participants?: Labelled[] | null;
}

/** `data` of `POST /v1/kundli/yogas`. */
export interface YogasDocument {
  yogas?: DetectedYoga[] | null;
}

/** @see KjBirthCalc */
export class KjManglik extends KjBirthCalc {
  static readonly tag = 'kj-manglik';

  static readonly observedAttributes = [...CALC_ATTRIBUTES];

  protected override primary = 'yogas';

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override start(birth: KjBirth): void {
    this.need('yogas', '/kundli/yogas', { birth, options: { language: ['en', 'hi'] } });
  }

  protected override resultBody(lang: Lang): string {
    const pending = this.pending('yogas', 'lines');
    if (pending) return pending;
    const yogas = this.ready<YogasDocument>('yogas')?.yogas ?? [];
    const doshas = yogas.filter((yoga) => yoga.category === 'Dosha');
    const mangal = doshas.find((yoga) => yoga.code === 'mangal_dosha');
    return (
      this.mangalHtml(mangal, lang) +
      this.othersHtml(
        doshas.filter((yoga) => yoga !== mangal),
        lang,
      )
    );
  }

  /** The answer: manglik or not, where Mars is, and the mitigation the engine names. */
  private mangalHtml(mangal: DetectedYoga | undefined, lang: Lang): string {
    const detail = mangal?.detail ?? '';
    const house = Number(/house (\d{1,2})/.exec(detail)?.[1]);
    const lines = [
      mangal && house
        ? html`<p>${msg(M, lang, 'mars_in', { house: houseOrdinal(house, lang) })}</p>`
        : '',
      mangal && /mitigated/i.test(detail)
        ? html`<p><strong>${msg(M, lang, 'mitigated')}</strong></p>`
        : '',
    ].join('');
    return html`<div
        class="kj-verdict-box"
        part="verdict mangal"
        data-tone="${mangal ? 'care' : 'good'}"
        data-manglik="${mangal ? 'yes' : 'no'}"
      >
        <p class="kj-verdict-title">${msg(M, lang, mangal ? 'manglik' : 'not_manglik')}</p>
        ${trusted(lines)}
      </div>
      <p class="kj-note" part="rule">${msg(M, lang, 'rule')}</p>`;
  }

  /** The other doshas, each with its grahas (and the engine's line, in English). */
  private othersHtml(doshas: DetectedYoga[], lang: Lang): string {
    const body = doshas.length
      ? html`<ul class="kj-items" part="doshas">
          ${trusted(
            doshas
              .map((dosha) => {
                const code = dosha.code ?? '';
                const names = DOSHA_NAMES[code];
                const name = names ? names[lang === 'hi' ? 1 : 0] : (dosha.name ?? code);
                const grahas = (dosha.participants ?? []).map((g) => nameOf(g, lang)).join(', ');
                return html`<li class="kj-item" part="dosha dosha-${code}">
                  <p class="kj-item-head">
                    ${name} ${trusted(badgeHtml(msg(M, lang, 'present'), 'care'))}
                  </p>
                  ${trusted(
                    grahas
                      ? html`<p class="kj-muted">${msg(M, lang, 'grahas')}: ${grahas}</p>`
                      : '',
                  )}
                  ${trusted(lang === 'en' && dosha.detail ? html`<p>${dosha.detail}</p>` : '')}
                </li>`;
              })
              .join(''),
          )}
        </ul>`
      : stateHtml({ kind: 'empty', part: 'no-doshas', body: msg(M, lang, 'none') });
    return html`<section class="kj-section" part="other-doshas">
      <h3 class="kj-h3">${msg(M, lang, 'others')}</h3>
      ${trusted(body)}
    </section>`;
  }
}
