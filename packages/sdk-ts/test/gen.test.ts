/**
 * The generated file is committed (design decision 10), so it can be missing
 * from a fresh clone or stale after an `openapi.json` refresh. `pnpm gen:check`
 * is the real guard in CI; this is the cheap one that fails the test run
 * rather than the build, so nobody spends an afternoon on a type error whose
 * actual cause is a file that was never generated.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generated = new URL('../src/generated/openapi.d.ts', import.meta.url);

describe('src/generated/openapi.d.ts', () => {
  const source = readFileSync(generated, 'utf8');

  it('exists and says it is generated', () => {
    expect(source).toContain('do not edit');
  });

  it('describes the paths the SDK calls', () => {
    expect(source).toContain('"/v1/kundli"');
    expect(source).toContain('"/v1/health"');
    expect(source).toContain('"/v1/reference/{list}"');
    expect(source).toContain('"/v1/horoscope"');
    expect(source).toContain('"/v1/reports/house-lords"');
    expect(source).toContain('"/v1/reports/life-areas"');
    expect(source).toContain('"/v1/reports/kundli"');
    expect(source).toContain('"/v1/pdf/kundli"');
    expect(source).toContain('"/v1/pdf/panchang/month"');
  });

  it('carries all 58 operations', () => {
    const paths = source.match(/^ {4}"\/v1\/[^"]+": \{$/gm) ?? [];
    expect(paths).toHaveLength(58);
  });
});
