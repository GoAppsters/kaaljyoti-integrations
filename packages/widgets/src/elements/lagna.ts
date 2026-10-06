/**
 * `<kj-lagna>` — the ascendant calculator (revamp §4, 11).
 *
 * The lagna, the ascendant's degree in it and the Moon sign beside it, and
 * the lagna reading under them. Two calls per birth: `POST /v1/kundli`
 * (shared with the kundli form and `<kj-moon-sign>` by the page memo) and
 * `POST /v1/reports/lagna`, drawn by an inner `<kj-reading type="lagna">`.
 * `reading="off"` drops the reading and its call.
 */

import { html, trusted } from '../core/element.ts';
import { inSign, msg, type Dict } from '../core/extra.ts';
import { pick, t, type Lang } from '../core/i18n.ts';
import { isOff } from '../core/config.ts';
import { formatDegrees } from '../core/format.ts';
import { signHtml, tilesHtml, type Tile } from '../core/ui.ts';
import { KjMoonSign, kundliBody, mountReading } from './moon-sign.ts';
import type { KjBirth } from './chart.ts';
import type { Kundli } from './kundli-report.ts';

const M: Dict<'title' | 'submit' | 'lagna' | 'degree'> = {
  en: {
    title: 'Lagna (ascendant)',
    submit: 'Find my lagna',
    lagna: 'Lagna (ascendant)',
    degree: 'Ascendant at {deg} in the sign',
  },
  hi: {
    title: 'लग्न',
    submit: 'मेरा लग्न जानें',
    lagna: 'लग्न',
    degree: 'लग्न राशि के {deg} पर',
  },
};

/** @see KjBirthCalc */
export class KjLagna extends KjMoonSign {
  static override readonly tag: string = 'kj-lagna';

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
    const lagna = kundli.lagna_sign;
    const moon = kundli.moon_sign;
    const degree =
      typeof kundli.ascendant === 'number'
        ? inSign(kundli.ascendant)
        : formatDegrees(kundli.ascendant_dms);
    const tiles: Tile[] = [
      {
        key: 'lagna',
        label: msg(M, lang, 'lagna'),
        value: signHtml(lagna?.id, pick(lagna?.names, lagna?.name ?? '—', lang), 'm'),
        sub: html`${msg(M, lang, 'degree', { deg: degree })}`,
      },
      {
        key: 'rashi',
        label: t(lang, 'moonsign'),
        value: signHtml(moon?.id, pick(moon?.names, moon?.name ?? '—', lang), 'm'),
      },
    ];
    const reading = isOff(this.getAttribute('reading'))
      ? ''
      : '<div class="kj-slot kj-section" data-reading-slot="lagna"></div>';
    return html`${trusted(tilesHtml(tiles, 'lagna'))}${trusted(reading)}`;
  }

  protected override mountInner(): void {
    if (!isOff(this.getAttribute('reading'))) mountReading(this, this.root, 'lagna');
  }
}
