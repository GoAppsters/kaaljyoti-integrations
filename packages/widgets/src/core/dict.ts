/**
 * A widget's own words (decision 24): a small `{ en, hi }` dictionary that
 * lives in the widget's chunk, read with {@link msg}. The shared chrome in
 * `i18n.ts` is downloaded by every page; words only one widget uses are not.
 */

import type { Lang } from './i18n.ts';

/** The same keys in both languages. */
export type Dict<K extends string> = {
  readonly en: Record<K, string>;
  readonly hi: Record<K, string>;
};

/** A word from a widget's own dictionary, `{name}` placeholders filled in. */
export function msg<K extends string>(
  dict: Dict<K>,
  lang: Lang,
  key: K,
  vars?: Record<string, string | number>,
): string {
  const text = dict[lang][key] ?? dict.en[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    vars[name] === undefined ? whole : String(vars[name]),
  );
}
