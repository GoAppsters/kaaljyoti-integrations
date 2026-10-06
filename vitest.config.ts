import { defineConfig } from 'vitest/config';

// One vitest run for the whole workspace; each package keeps its own config.
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
