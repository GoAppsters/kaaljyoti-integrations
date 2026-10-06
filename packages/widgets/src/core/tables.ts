/**
 * Tables that fit their card (see `styles/tables.css`): the stacked layout's
 * labels, and the scroll hint for the tables that keep scrolling.
 *
 * It imports nothing at run time, so the elements with tables share it
 * without moving any shared module into a chunk of its own (decision 27's
 * note on weight).
 */

import tablesCss from '../styles/tables.css';
import type { Lang } from './i18n.ts';

let sheet: CSSStyleSheet | null = null;

/**
 * Tables that fit, in this shadow root: the rules adopted, and every body
 * cell of a stackable table (`kj-stack-<n>`) given its column's heading as
 * `data-label`, now and after every repaint. The kundli form calls it with
 * `import()` when its first report opens, so its page does not carry it.
 */
export function attachTables(root: ShadowRoot): void {
  try {
    sheet ??= new CSSStyleSheet();
    if (!sheet.cssRules.length) sheet.replaceSync(tablesCss);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } catch {
    // No constructable sheets: a <style> of its own, which a repaint keeps
    // because the elements paint into a child of the root, not the root.
    const style = document.createElement('style');
    style.textContent = tablesCss;
    root.prepend(style);
  }
  const run = (): void => {
    for (const table of root.querySelectorAll('table[class*="kj-stack-"]')) {
      const heads = [...table.querySelectorAll('thead th')].map(
        (th) => th.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      );
      for (const row of table.querySelectorAll('tbody tr')) {
        let column = 0;
        for (const cell of row.children) {
          if (!cell.hasAttribute('data-label'))
            cell.setAttribute('data-label', heads[column] ?? '');
          column += Number(cell.getAttribute('colspan')) || 1;
        }
      }
    }
  };
  run();
  // Attribute changes are not observed, so labelling does not wake it again.
  new MutationObserver(run).observe(root, { childList: true, subtree: true });
}

const HINT: Record<Lang, string> = {
  en: 'Scroll the table sideways to see every column.',
  hi: 'सभी कॉलम देखने के लिए तालिका को बगल में खिसकाएँ।',
};

/** The line under a table that keeps scrolling, shown below `below` ems of card. */
export function scrollHintHtml(lang: Lang, below: 44 | 56): string {
  return `<p class="kj-scroll-hint kj-hint-${below}" part="scroll-hint">${HINT[lang]}</p>`;
}
