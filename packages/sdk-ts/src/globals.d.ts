/**
 * What the bundler supplies and TypeScript cannot see.
 *
 * The version is a string literal esbuild substitutes (`define`), so the
 * shipped bundle neither reads `package.json` at run time nor carries a copy
 * of it — a `require('./package.json')` in a library is a file read in every
 * consumer's process and a broken build in every bundler that does not
 * resolve JSON. `vitest.config.ts` makes the same substitution so that the
 * tag under test is the tag the built bundle sends.
 */

/** Injected by `scripts/build.mjs` (and by vitest) from `package.json`. */
declare const __KJ_SDK_VERSION__: string;
