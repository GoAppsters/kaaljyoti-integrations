/**
 * `<kj-life-areas>` — the life-areas report for a birth (revamp §4, 18).
 *
 * The birth form, and under it the synthesized reading of eleven areas of
 * life: one summary, then a card per area with its level (a word, never a
 * score). One call, `POST /v1/reports/life-areas`, drawn by an inner
 * `<kj-reading type="life_areas">`. A written report, on every plan, at 5
 * credits.
 */

import { msg, type Dict } from '../core/extra.ts';
import type { Lang } from '../core/i18n.ts';
import { KjMoonSign, mountReading } from './moon-sign.ts';

const M: Dict<'title' | 'submit'> = {
  en: { title: 'Life areas', submit: 'Read my chart' },
  hi: { title: 'जीवन के क्षेत्र', submit: 'मेरी कुंडली पढ़ें' },
};

/** @see KjBirthCalc */
export class KjLifeAreas extends KjMoonSign {
  static override readonly tag: string = 'kj-life-areas';

  /** The inner reading announces itself; this element fires no `kj-ready`. */
  protected override primary = '';

  protected override cardTitle(): string {
    return msg(M, this.activeLang, 'title');
  }

  protected override submitLabel(): string {
    return msg(M, this.activeLang, 'submit');
  }

  protected override start(): void {
    // The inner reading makes the one call.
  }

  protected override resultBody(_lang: Lang): string {
    return '<div class="kj-slot" data-reading-slot="life_areas"></div>';
  }

  protected override mountInner(): void {
    mountReading(this, this.root, 'life_areas');
  }
}
