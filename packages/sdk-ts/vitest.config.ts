import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // The same substitution `scripts/build.mjs` makes, so the `X-KJ-Client`
  // asserted in the tests is the one the built bundle sends.
  define: { __KJ_SDK_VERSION__: JSON.stringify(pkg.version) },
  test: {
    name: 'sdk-ts',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
