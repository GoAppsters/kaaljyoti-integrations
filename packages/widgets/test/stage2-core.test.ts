import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROXY_PREFERRED, SERVER_ONLY, call } from '../src/core/call.ts';
import { clearCache } from '../src/core/cache.ts';
import { request } from '../src/core/client.ts';
import {
  configure,
  getConfig,
  readDatasetConfig,
  resetConfig,
  safeProxyUrl,
} from '../src/core/config.ts';
import { msg } from '../src/core/dict.ts';
import { KjError } from '../src/core/errors.ts';
import {
  addMonths,
  isMonth,
  monthLabel,
  signOf,
  weekday,
  withDefaultPlace,
} from '../src/core/extra.ts';
import { KjPanchang } from '../src/elements/panchang.ts';
import { KjTransits } from '../src/elements/transits.ts';
import { json, mount, settle, stubFetch } from './support.ts';

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', baseUrl: 'https://api-staging.kaaljyoti.com', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('the proxy option (decision 23)', () => {
  it('reads data-proxy, data-proxy-all and data-proxy-docs off the script tag', () => {
    expect(
      readDatasetConfig({
        proxy: '/wp-json/kaaljyoti/v1/proxy',
        proxyAll: '',
        proxyDocs: 'https://example.com/docs',
      }),
    ).toMatchObject({
      proxyUrl: '/wp-json/kaaljyoti/v1/proxy',
      proxyAll: true,
      proxyDocsUrl: 'https://example.com/docs',
    });
    expect(readDatasetConfig({ proxy: 'javascript:alert(1)', proxyAll: 'off' })).toEqual({});
  });

  it('takes an http(s) URL or a site path, and nothing else', () => {
    expect(safeProxyUrl('https://shop.example/proxy')).toBe('https://shop.example/proxy');
    expect(safeProxyUrl('/wp-admin/admin-ajax.php?action=kaaljyoti_proxy')).toBe(
      '/wp-admin/admin-ajax.php?action=kaaljyoti_proxy',
    );
    expect(safeProxyUrl('//evil.example/x')).toBeUndefined();
    expect(safeProxyUrl('javascript:alert(1)')).toBeUndefined();
    configure({ proxyUrl: 'data:text/html,x' });
    expect(getConfig().proxyUrl).toBeUndefined();
  });

  it('lists the routes closed to publishable keys, and the months that prefer a proxy', () => {
    expect([...SERVER_ONLY]).toEqual(['/transit/scan']);
    expect([...PROXY_PREFERRED].sort()).toEqual(['/ephemeris/month', '/panchang/month']);
  });

  it('sends a month direct with the publishable key when the page has no proxy', async () => {
    const { calls } = stubFetch();
    const answer = await call<{ month: string }>(null, '/panchang/month', { month: '2026-10' });
    expect(answer.data.month).toBe('2026-10');
    expect(calls[0]!.proxied).toBe(false);
    expect(calls[0]!.url).toContain('/v1/panchang/month?key=kj_pub_test');
  });

  it('refuses a server-only route with no proxy, before the network', async () => {
    const { fetchMock } = stubFetch();
    const error = await call(null, '/transit/scan', { from: '2026-10-01' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(KjError);
    expect((error as KjError).code).toBe('proxy_required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts {path, body} to the proxy, with no key, and reads the envelope it relays', async () => {
    configure({ proxyUrl: '/proxy' });
    const { fetchMock } = stubFetch();
    const answer = await call<{ month: string }>(null, '/panchang/month', { month: '2026-10' });
    expect(answer.data.month).toBe('2026-10');
    expect(answer.plan).toBe('growth');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(new URL('/proxy', document.baseURI).href);
    expect(url).not.toContain('key=');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-KJ-Client']).toMatch(/^widgets\//);
    expect(JSON.parse(String(init.body))).toEqual({
      path: '/panchang/month',
      body: { month: '2026-10' },
    });
  });

  it('prefers the element’s proxy attribute to the page’s', async () => {
    configure({ proxyUrl: '/page-proxy' });
    const { fetchMock } = stubFetch();
    const el = document.createElement('div');
    el.setAttribute('proxy', '/element-proxy');
    await call(el, '/ephemeris/month', { month: '2026-10' });
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/element-proxy');
  });

  it('sends every other route direct with the key, proxy or not', async () => {
    configure({ proxyUrl: '/proxy' });
    const { calls } = stubFetch();
    await call(null, '/transit/now', { latitude: 1, longitude: 2 });
    expect(calls[0]!.proxied).toBe(false);
    expect(calls[0]!.url).toContain('key=kj_pub_test');
  });

  it('with proxyAll, sends everything through the proxy and needs no key', async () => {
    resetConfig();
    configure({ proxyUrl: '/proxy', proxyAll: true });
    const { calls } = stubFetch();
    await request('/kundli', { birth: {} });
    expect(calls[0]!.proxied).toBe(true);
    expect(calls[0]!.path).toBe('/kundli');
  });

  it('maps a proxy’s own error envelope to a KjError like the API’s', async () => {
    configure({ proxyUrl: '/proxy' });
    stubFetch({
      '/panchang/month': () =>
        json({ status: 'error', error: { code: 'proxy_path_not_allowed', message: 'no' } }, 403),
    });
    const error = (await call(null, '/panchang/month', {}).catch((e: unknown) => e)) as KjError;
    expect(error.code).toBe('proxy_path_not_allowed');
    expect(error.status).toBe(403);
  });
});

describe('the font option', () => {
  it('reads data-font and configure({ font })', () => {
    expect(readDatasetConfig({ font: 'inherit' })).toEqual({ font: 'inherit' });
    expect(readDatasetConfig({ font: 'comic' })).toEqual({});
    configure({ font: 'inherit' });
    expect(getConfig().font).toBe('inherit');
  });

  it('puts font="inherit" on an element, and the page’s stack with Devanagari behind it', async () => {
    configure({ font: 'inherit' });
    stubFetch();
    document.body.style.fontFamily = 'Georgia, serif';
    const el = mount<KjPanchang>(KjPanchang, { city: 'delhi', lang: 'hi' });
    await settle();
    expect(el.getAttribute('font')).toBe('inherit');
    const style = el.shadowRoot!.querySelector('.kj-card')?.getAttribute('style') ?? '';
    expect(style).toContain('--kj-font-inherited-hi:');
    expect(style).toContain('Noto Sans Devanagari');
    document.body.style.fontFamily = '';
  });

  it('leaves the design system’s own faces alone by default', async () => {
    stubFetch();
    const el = mount<KjPanchang>(KjPanchang, { city: 'delhi' });
    await settle();
    expect(el.hasAttribute('font')).toBe(false);
    expect(el.shadowRoot!.querySelector('.kj-card')?.hasAttribute('style')).toBe(false);
  });
});

describe('the page’s scheme under the auto theme', () => {
  it('reads light text as a dark page, and dark text as a light one', async () => {
    stubFetch();
    document.body.style.color = 'rgb(240, 240, 240)';
    const dark = mount<KjPanchang>(KjPanchang, { city: 'delhi' });
    document.body.style.color = 'rgb(20, 20, 20)';
    const light = mount<KjPanchang>(KjPanchang, { city: 'delhi' });
    await settle();
    expect(dark.getAttribute('data-scheme')).toBe('dark');
    expect(light.getAttribute('data-scheme')).toBe('light');
    document.body.style.color = '';
  });
});

describe('each widget’s own sheet', () => {
  it('adopts the shared sheet, the element’s own and, with a table and signs, theirs', async () => {
    stubFetch();
    const el = mount<KjTransits>(KjTransits, {});
    await settle();
    await settle();
    const sheets = el.shadowRoot!.adoptedStyleSheets;
    expect(sheets.length).toBe(4);
  });
});

describe('the stage-2 helpers', () => {
  it('reads a widget’s own words, with placeholders', () => {
    const dict = { en: { hi: 'Hello {name}' }, hi: { hi: 'नमस्ते {name}' } };
    expect(msg(dict, 'en', 'hi', { name: 'Asha' })).toBe('Hello Asha');
    expect(msg(dict, 'hi', 'hi', { name: 'आशा' })).toBe('नमस्ते आशा');
  });

  it('does month and calendar arithmetic on components only', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-10')).toBe(true);
    expect(weekday('2026-10-01')).toBe(4);
    expect(monthLabel('2026-10', 'en')).toBe('October 2026');
    expect(monthLabel('2026-10', 'hi')).toBe('अक्तूबर 2026');
    expect(signOf(99.1)).toBe('cancer');
    expect(signOf(-1)).toBe('pisces');
  });

  it('defaults a place to New Delhi only when none is named', () => {
    const el = document.createElement('div');
    expect(withDefaultPlace(el).getAttribute('city')).toBe('delhi');
    el.setAttribute('lat', '19');
    expect(withDefaultPlace(el).getAttribute('city')).toBeNull();
  });
});
