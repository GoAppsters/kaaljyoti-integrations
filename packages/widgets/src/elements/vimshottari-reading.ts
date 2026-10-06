/**
 * `<kj-vimshottari-reading>` — the Vimshottari periods of a life, read
 * (revamp §4, 20).
 *
 * The birth form, and under it each mahadasha from birth to eighty as a
 * heading with its dates, its level and one reading, the running one
 * marked. One call, `POST /v1/reports/vimshottari`, drawn by an inner
 * `<kj-reading type="vimshottari">`. A written report, on every plan, at 5
 * credits. For the periods
 * as a timeline without the reading, `<kj-dasha>`.
 */

import { msg, type Dict } from '../core/extra.ts';
import type { Lang } from '../core/i18n.ts';
import { KjMoonSign, mountReading } from './moon-sign.ts';

const M: Dict<'title' | 'submit'> = {
  en: { title: 'Vimshottari dasha reading', submit: 'Read my dashas' },
  hi: { title: 'विंशोत्तरी दशा फल', submit: 'मेरी दशाएँ पढ़ें' },
};

/** @see KjBirthCalc */
export class KjVimshottariReading extends KjMoonSign {
  static override readonly tag: string = 'kj-vimshottari-reading';

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
    return '<div class="kj-slot" data-reading-slot="vimshottari"></div>';
  }

  protected override mountInner(): void {
    mountReading(this, this.root, 'vimshottari');
  }
}
