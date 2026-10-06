/**
 * The zodiac sign icons (decision 29): the themes, the site's own images and
 * their URL rules, the configuration, and the placeholder every widget
 * prints.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KjHoroscope } from '../src/elements/horoscope.ts';
import { KjTransits } from '../src/elements/transits.ts';
import { clearCache } from '../src/core/cache.ts';
import { configure, getConfig, readScriptConfig, resetConfig } from '../src/core/config.ts';
import {
  SIGN_IDS,
  attachSigns,
  customImage,
  iconSvg,
  parseSignTheme,
  readSignIcons,
  safeImageUrl,
  signTheme,
} from '../src/core/signs.ts';
import { signHtml, signIcon } from '../src/core/ui.ts';
import { mount, settle, stubFetch } from './support.ts';

if (!customElements.get(KjHoroscope.tag)) customElements.define(KjHoroscope.tag, KjHoroscope);
if (!customElements.get(KjTransits.tag)) customElements.define(KjTransits.tag, KjTransits);

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

/** A shadow root with the given placeholders, drawn by the module. */
function drawn(markup: string, attrs: Record<string, string> = {}, icons?: unknown) {
  const host = document.createElement('div');
  for (const [name, value] of Object.entries(attrs)) host.setAttribute(name, value);
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = markup;
  attachSigns(root, host, () => icons);
  return { host, root };
}

describe('the placeholder', () => {
  it('is an empty, hidden span named by the sign, in three sizes', () => {
    expect(signIcon('leo').replace(/\s+/g, ' ').replace(' >', '>')).toBe(
      '<span class="kj-zi" data-zi="leo" part="sign-icon" aria-hidden="true"></span>',
    );
    expect(signIcon('leo', 'l')).toContain('class="kj-zi kj-zi-l"');
    expect(signIcon('leo', 'l')).toContain('part="sign-icon sign-icon-l"');
    expect(signIcon('leo', 'm')).toContain('class="kj-zi kj-zi-m"');
    expect(signIcon(null)).toBe('');
    expect(signHtml('aries', 'Aries <b>')).toMatch(/<\/span>Aries &lt;b&gt;$/);
    // An id from a response is escaped like any other value.
    expect(signIcon('"><script>')).not.toContain('<script>');
  });
});

describe('themes', () => {
  it('reads a theme name, and nothing else', () => {
    expect(parseSignTheme(' Glyph ')).toBe('glyph');
    expect(parseSignTheme('devanagari')).toBe('devanagari');
    expect(parseSignTheme('emoji')).toBeUndefined();
    expect(parseSignTheme(null)).toBeUndefined();
  });

  it('takes the element’s attribute, an ancestor’s, the configuration, else element', () => {
    const outer = document.createElement('section');
    outer.setAttribute('sign-icons', 'glyph');
    const inner = document.createElement('div');
    outer.append(inner);
    expect(signTheme(inner, undefined)).toBe('glyph');
    inner.setAttribute('sign-icons', 'devanagari');
    expect(signTheme(inner, 'glyph')).toBe('devanagari');
    const lone = document.createElement('div');
    expect(signTheme(lone, undefined)).toBe('element');
    expect(signTheme(lone, 'glyph')).toBe('glyph');
    expect(signTheme(lone, 'https://cdn.example.com/{sign}.png')).toBe('custom');
    expect(signTheme(lone, { aries: 'https://cdn.example.com/a.png' })).toBe('custom');
    expect(signTheme(lone, 'nonsense')).toBe('element');
    // A map that names a default theme keeps its images for `custom` only.
    expect(signTheme(lone, { theme: 'glyph', leo: 'https://x.example/l.png' })).toBe('glyph');
    expect(signTheme(lone, { theme: 'bogus', leo: 'https://x.example/l.png' })).toBe('custom');
  });

  it('follows the host of a shadow root: a reading inside the report follows the report', () => {
    const report = document.createElement('div');
    report.setAttribute('sign-icons', 'devanagari');
    const root = report.attachShadow({ mode: 'open' });
    const reading = document.createElement('div');
    root.append(reading);
    expect(signTheme(reading, undefined)).toBe('devanagari');
  });

  it('draws each built-in theme, and a compact symbol inline', () => {
    const tile = iconSvg(4, 'element', false);
    expect(tile).toContain('<rect class="zb"');
    expect(tile).toContain('class="zf"');
    expect(tile).toContain('class="zk"');
    expect(iconSvg(4, 'glyph', false)).toContain('class="zr"');
    expect(iconSvg(4, 'devanagari', false)).toContain('>सिंह</text>');
    // Inline: the symbol alone, for every theme.
    for (const theme of ['element', 'devanagari'] as const) {
      const small = iconSvg(4, theme, true);
      expect(small).not.toContain('<rect');
      expect(small).not.toContain('<text');
      expect(small).toContain('class="zk"');
    }
    expect(iconSvg(4, 'glyph', true)).toContain('class="zg"');
  });

  it('colours the twelve by element: fire, earth, air, water in turn', () => {
    const markup = SIGN_IDS.map((id) => signIcon(id, 'l')).join('');
    const { root } = drawn(markup);
    const elements = [...root.querySelectorAll('.kj-zi')].map((span) =>
      span.getAttribute('data-el'),
    );
    expect(elements).toEqual([
      'fire',
      'earth',
      'air',
      'water',
      'fire',
      'earth',
      'air',
      'water',
      'fire',
      'earth',
      'air',
      'water',
    ]);
    expect(root.querySelectorAll('.kj-zi svg')).toHaveLength(12);
  });

  it('leaves an unknown sign empty, and marks it so it is not asked again', () => {
    const { root } = drawn(signIcon('ophiuchus'));
    const span = root.querySelector('.kj-zi');
    expect(span?.innerHTML).toBe('');
    expect(span?.getAttribute('data-el')).toBe('');
  });

  it('draws what a repaint adds, and redraws all when `sign-icons` changes', async () => {
    const { host, root } = drawn(signIcon('leo', 'l'));
    root.innerHTML = signIcon('virgo', 'l') + signIcon('libra');
    await settle();
    expect(root.querySelectorAll('.kj-zi svg')).toHaveLength(2);
    expect(root.querySelector('.kj-zi')?.getAttribute('data-theme')).toBe('element');
    host.setAttribute('sign-icons', 'devanagari');
    await settle();
    expect(root.querySelector('.kj-zi-l text')?.textContent).toBe('कन्या');
    expect(root.querySelector('.kj-zi-l')?.getAttribute('data-theme')).toBe('devanagari');
  });
});

describe('the site’s own images', () => {
  it('allows https and paths on this site, nothing else', () => {
    expect(safeImageUrl('https://cdn.example.com/leo.png')).toBe('https://cdn.example.com/leo.png');
    expect(safeImageUrl('/wp-content/uploads/leo.png')).toBe('/wp-content/uploads/leo.png');
    expect(safeImageUrl('signs/leo.svg')).toBe('signs/leo.svg');
    for (const bad of [
      'http://example.com/leo.png',
      '//evil.example/leo.png',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'https://x.example/a.png" onerror="alert(1)',
      'https://',
      '',
      42,
    ]) {
      expect(safeImageUrl(bad)).toBeUndefined();
    }
  });

  it('fills a template’s {sign}, reads a map, and has nothing for a missing sign', () => {
    expect(customImage('https://cdn.example.com/signs/{sign}.svg', 'leo')).toBe(
      'https://cdn.example.com/signs/leo.svg',
    );
    expect(customImage('https://cdn.example.com/no-placeholder.svg', 'leo')).toBeUndefined();
    expect(customImage({ leo: 'https://x.example/l.png' }, 'leo')).toBe('https://x.example/l.png');
    expect(customImage({ leo: 'https://x.example/l.png' }, 'virgo')).toBeUndefined();
    expect(customImage({ toString: 'https://x.example/t.png' }, 'toString')).toBe(
      'https://x.example/t.png',
    );
    expect(customImage({}, 'constructor')).toBeUndefined();
  });

  it('reads a JSON map from `data-sign-icons`, keeping only the twelve ids', () => {
    expect(readSignIcons('{"leo":"https://x.example/l.png","evil":"https://x.example/e"}')).toEqual(
      { leo: 'https://x.example/l.png' },
    );
    expect(readSignIcons('{broken')).toBeUndefined();
    expect(readSignIcons('{"theme":"devanagari","leo":"/l.png"}')).toEqual({
      leo: '/l.png',
      theme: 'devanagari',
    });
    expect(readSignIcons('{"theme":"<b>","leo":"/l.png"}')).toEqual({ leo: '/l.png' });
    expect(readSignIcons(' glyph ')).toBe('glyph');
    expect(readSignIcons(['a'])).toBeUndefined();
  });

  it('draws an <img> with alt text, never the file inlined', () => {
    const { root } = drawn(
      signIcon('leo', 'l') + signIcon('virgo', 'l'),
      { 'sign-icons': 'custom' },
      { leo: 'https://cdn.example.com/leo.svg' },
    );
    const image = root.querySelector<HTMLImageElement>('[data-zi="leo"] img');
    expect(image?.getAttribute('src')).toBe('https://cdn.example.com/leo.svg');
    expect(image?.alt).toBe('Leo');
    expect(root.querySelector('[data-zi="leo"] svg')).toBeNull();
    // Virgo has no image: the default theme.
    expect(root.querySelector('[data-zi="virgo"]')?.getAttribute('data-theme')).toBe('element');
    expect(root.querySelector('[data-zi="virgo"] rect')).not.toBeNull();
  });

  it('falls back to the default theme when an image fails, and refuses http', () => {
    const { root } = drawn(
      signIcon('leo', 'l') + signIcon('aries', 'l'),
      {},
      {
        leo: 'https://cdn.example.com/missing.png',
        aries: 'http://cdn.example.com/aries.png',
      },
    );
    root.querySelector('[data-zi="leo"] img')?.dispatchEvent(new Event('error'));
    expect(root.querySelector('[data-zi="leo"] img')).toBeNull();
    expect(root.querySelector('[data-zi="leo"] rect')).not.toBeNull();
    expect(root.querySelector('[data-zi="aries"] img')).toBeNull();
  });

  it('uses a map’s images where an element asks for custom, the map’s theme elsewhere', () => {
    const icons = { theme: 'glyph', leo: 'https://cdn.example.com/leo.png' };
    const plain = drawn(signIcon('leo', 'l'), {}, icons);
    expect(plain.root.querySelector('img')).toBeNull();
    expect(plain.root.querySelector('.kj-zi')?.getAttribute('data-theme')).toBe('glyph');
    const custom = drawn(signIcon('leo', 'l'), { 'sign-icons': 'custom' }, icons);
    expect(custom.root.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.com/leo.png',
    );
  });

  it('names a Hindi image in Hindi', () => {
    const { root } = drawn(
      `<div lang="hi">${signIcon('aquarius', 'l')}</div>`,
      {},
      'https://cdn.example.com/{sign}.png',
    );
    expect(root.querySelector('img')?.alt).toBe('कुम्भ');
  });
});

describe('configuration', () => {
  it('takes a theme, a template or a map, from configure() and data-sign-icons', () => {
    expect(getConfig().signIcons).toBeUndefined();
    configure({ signIcons: ' glyph ' });
    expect(getConfig().signIcons).toBe('glyph');
    configure({ signIcons: { leo: 'https://x.example/l.png' } });
    expect(getConfig().signIcons).toEqual({ leo: 'https://x.example/l.png' });
    const script = document.createElement('script');
    script.dataset.signIcons = 'https://cdn.example.com/{sign}.png';
    expect(readScriptConfig(script).signIcons).toBe('https://cdn.example.com/{sign}.png');
  });
});

describe('in the widgets', () => {
  it('draws the picker in the configured theme, and hides the Hindi name under a seal', async () => {
    stubFetch();
    configure({ signIcons: 'devanagari' });
    const element = mount<KjHoroscope>(KjHoroscope, { lang: 'hi' });
    await settle();
    const first = element.shadowRoot?.querySelector('[data-sign="aries"]');
    expect(first?.querySelector('.kj-zi-l text')?.textContent).toBe('मेष');
    expect(first?.querySelector('.kj-sign-name')?.textContent).toBe('मेष');
  });

  it('loads the icons for a table the first time one is drawn', async () => {
    stubFetch();
    const element = mount<KjTransits>(KjTransits, { 'sign-icons': 'glyph' });
    await settle();
    await settle();
    const icons = element.shadowRoot?.querySelectorAll('tbody .kj-zi') ?? [];
    expect(icons.length).toBeGreaterThan(9);
    expect([...icons].every((icon) => icon.querySelector('svg .zg'))).toBe(true);
  });
});
