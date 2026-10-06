/**
 * Things the bundler supplies that TypeScript cannot see.
 *
 * Both of these exist so the shipped file has no runtime cost: the version is
 * a string literal esbuild substitutes (`define`), and the shared stylesheet
 * is inlined by the text loader rather than fetched at run time, which would
 * be a second network round trip before a widget can paint.
 */

/** Injected by `scripts/build.mjs` (and by vitest) from `package.json`. */
declare const __KJ_VERSION__: string;

declare module '*.css' {
  /** The stylesheet's source, loaded as text. */
  const css: string;
  export default css;
}
