import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKey, clearCache, memo } from '../src/core/cache.ts';

beforeEach(() => {
  clearCache();
});

describe('cacheKey', () => {
  it('is the same for the same body written in a different order', () => {
    const a = cacheKey('/panchang', { latitude: 28.6, longitude: 77.2, options: { x: 1, y: 2 } });
    const b = cacheKey('/panchang', { options: { y: 2, x: 1 }, longitude: 77.2, latitude: 28.6 });
    expect(a).toBe(b);
  });

  it('keeps array order, which the API treats as significant', () => {
    expect(cacheKey('/p', { language: ['en', 'hi'] })).not.toBe(
      cacheKey('/p', { language: ['hi', 'en'] }),
    );
  });

  it('separates two paths with the same body', () => {
    expect(cacheKey('/panchang', {})).not.toBe(cacheKey('/kundli', {}));
  });

  it('ignores undefined members, which JSON would drop anyway', () => {
    expect(cacheKey('/p', { a: 1, b: undefined })).toBe(cacheKey('/p', { a: 1 }));
  });
});

describe('memo', () => {
  it('shares one in-flight promise between callers', async () => {
    let resolve: (value: string) => void = () => {};
    const fn = vi.fn().mockImplementation(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );

    const first = memo('k', fn);
    const second = memo('k', fn);
    resolve('once');

    expect(await first).toBe('once');
    expect(await second).toBe('once');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps serving a settled value for the rest of the page load', async () => {
    const fn = vi.fn().mockResolvedValue(1);
    await memo('k', fn);
    await memo('k', fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('evicts a rejection so a retry can run', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');

    await expect(memo('k', fn)).rejects.toThrow('boom');
    await expect(memo('k', fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('forgets everything on clearCache', async () => {
    const fn = vi.fn().mockResolvedValue(1);
    await memo('k', fn);
    clearCache();
    await memo('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
