import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { html, KjElement } from '../src/core/element.ts';
import {
  configure,
  getConfig,
  parsePreset,
  parseTheme,
  readScriptConfig,
  resetConfig,
  type KjPreset,
  type KjTheme,
} from '../src/core/config.ts';

/**
 * Read from disk rather than imported: the rules are what is under test, and
 * reading the file keeps this independent of the `.css`-as-text plugin in
 * `vitest.config.ts` (which `match-form.test.ts` checks on its own).
 */
const baseCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/styles/base.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, ''); // the rules, not what the comments say about them

/** The smallest widget: the base class's theme handling is the subject. */
class KjThemeTest extends KjElement {
  static readonly observedAttributes = ['city'];
  loads = 0;

  protected override fetchData(): Promise<unknown> {
    this.loads++;
    return Promise.resolve({});
  }

  protected override render(): string {
    return html`<p>ok</p>`;
  }
}

customElements.define('kj-theme-test', KjThemeTest);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(attrs: Record<string, string> = {}): KjThemeTest {
  const element = document.createElement('kj-theme-test') as KjThemeTest;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

function script(data: Record<string, string>): HTMLScriptElement {
  const element = document.createElement('script');
  for (const [name, value] of Object.entries(data)) element.dataset[name] = value;
  return element;
}

beforeEach(() => {
  resetConfig();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('theme config', () => {
  it('defaults to auto', () => {
    expect(getConfig().theme).toBe('auto');
  });

  it('accepts the three modes', () => {
    for (const theme of ['light', 'dark', 'auto'] as const) {
      expect(configure({ theme }).theme).toBe(theme);
    }
  });

  it('turns an unknown value into auto', () => {
    configure({ theme: 'dark' });
    expect(configure({ theme: 'sepia' as KjTheme }).theme).toBe('auto');
  });

  it('parses only the three modes', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('Dark')).toBeUndefined();
    expect(parseTheme(null)).toBeUndefined();
  });

  it('reads data-theme from the script tag and drops what it does not know', () => {
    expect(readScriptConfig(script({ theme: 'dark' })).theme).toBe('dark');
    expect(readScriptConfig(script({ theme: 'light' })).theme).toBe('light');
    expect(readScriptConfig(script({ theme: 'neon' }))).not.toHaveProperty('theme');
    expect(readScriptConfig(script({}))).not.toHaveProperty('theme');
  });
});

describe('theme attribute', () => {
  it('leaves the markup alone when the configured theme is auto', () => {
    const element = mount();
    expect(element.hasAttribute('theme')).toBe(false);
  });

  it('reflects a configured non-auto theme onto the element', () => {
    configure({ theme: 'dark' });
    expect(mount().getAttribute('theme')).toBe('dark');
  });

  it('never overwrites a theme the page wrote', () => {
    configure({ theme: 'dark' });
    expect(mount({ theme: 'light' }).getAttribute('theme')).toBe('light');
    expect(mount({ theme: 'auto' }).getAttribute('theme')).toBe('auto');
  });

  it('asks for nothing when the theme changes', async () => {
    const element = mount({ city: 'delhi' });
    await settle();
    const before = element.loads;
    element.setAttribute('theme', 'dark');
    await settle();
    expect(element.loads).toBe(before);
  });
});

describe('base.css modes', () => {
  it('has a block per mode, with auto covering the missing attribute', () => {
    expect(baseCss).toContain(":host([theme='light'])");
    expect(baseCss).toContain(":host([theme='dark'])");
    expect(baseCss).toMatch(/:host\(:not\(\[theme\]\)\),\s*:host\(\[theme='auto'\]\)/);
  });

  it('draws light from the preset: classic keeps the cream card and the maroon', () => {
    const light = baseCss.slice(baseCss.indexOf(":host([theme='light'])"));
    const block = light.slice(0, light.indexOf('}'));
    expect(block).toContain('--kj-bg: var(--kj-p-ground);');
    expect(block).toContain('--kj-lagna: var(--kj-p-accent);');
    expect(block).toContain('--kj-planet-saturn: #2049b0;');
    const host = baseCss.slice(baseCss.indexOf(':host {'));
    const classic = host.slice(0, host.indexOf('}'));
    expect(classic).toContain('--kj-p-ground: #fcfaf4;');
    expect(classic).toContain('--kj-p-accent: #7a1f2b;');
    expect(classic).toContain('--kj-p-accent-dk: #e8b04a;');
  });

  it('gives auto a light-dark() path and a prefers-color-scheme fallback, light first', () => {
    const fallback = baseCss.indexOf('@media (prefers-color-scheme: dark)');
    const modern = baseCss.indexOf('light-dark(');
    const autoBlock = baseCss.indexOf(":host([theme='auto'])");
    expect(fallback).toBeGreaterThan(autoBlock);
    expect(modern).toBeGreaterThan(fallback);
    expect(baseCss).toContain('--kj-lagna: light-dark(var(--kj-p-accent), var(--kj-p-accent-dk))');
    expect(baseCss).toContain('--kj-bg: transparent');
    expect(baseCss).toContain('--kj-text: currentColor');
  });

  it('declares every default on :host, where a page rule on the element wins', () => {
    // No `:root`, no `!important`: `kj-panchang { --kj-bg: … }` in the page
    // is in the outer scope and beats any of these, whatever the mode.
    expect(baseCss).not.toMatch(/!important/);
    expect(baseCss).not.toMatch(/(^|[\s,}]):root\s*\{/);
    const declarations = baseCss.match(/^\s*--kj-[a-z-]+:/gm) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
  });
});

describe('presets', () => {
  it('defaults to classic and parses the four', () => {
    expect(getConfig().preset).toBe('classic');
    for (const preset of ['classic', 'modern', 'minimal', 'traditional'] as const) {
      expect(parsePreset(preset)).toBe(preset);
      expect(configure({ preset }).preset).toBe(preset);
    }
    expect(parsePreset('neon')).toBeUndefined();
    expect(configure({ preset: 'neon' as KjPreset }).preset).toBe('classic');
  });

  it('reads data-preset from the script tag', () => {
    expect(readScriptConfig(script({ preset: 'traditional' })).preset).toBe('traditional');
    expect(readScriptConfig(script({ preset: 'x' }))).not.toHaveProperty('preset');
  });

  it('reflects a configured preset, never over the page’s own', () => {
    expect(mount().hasAttribute('preset')).toBe(false);
    configure({ preset: 'modern' });
    expect(mount().getAttribute('preset')).toBe('modern');
    expect(mount({ preset: 'minimal' }).getAttribute('preset')).toBe('minimal');
  });

  it('has a block for each preset but classic, which is the :host default', () => {
    for (const preset of ['modern', 'minimal', 'traditional']) {
      expect(baseCss).toContain(`:host([preset='${preset}'])`);
    }
    // The traditional header: a gold rule and a saffron diamond.
    expect(baseCss).toContain(":host([preset='traditional']) .kj-head::before");
  });

  it('asks for nothing when the preset changes', async () => {
    const element = mount({ city: 'delhi' });
    await settle();
    const before = element.loads;
    element.setAttribute('preset', 'modern');
    await settle();
    expect(element.loads).toBe(before);
  });
});

describe('the card', () => {
  it('wraps every widget in a card with a body and a footer', async () => {
    const element = mount();
    await settle();
    const card = element.shadowRoot?.querySelector('article.kj-card[part="card"]');
    expect(card?.querySelector('[part="body"]')?.textContent).toContain('ok');
    expect(card?.querySelector('footer[part="footer"] [part="powered-by"]')).not.toBeNull();
  });

  it('draws no header for a widget without a title, and none for frame="none"', async () => {
    const element = mount({ frame: 'none' });
    await settle();
    expect(element.shadowRoot?.querySelector('[part="header"]')).toBeNull();
    expect(element.shadowRoot?.querySelector('[part="powered-by"]')).toBeNull();
  });

  it('uses heading="…" as the title', async () => {
    const element = mount({ heading: 'Aaj ka panchang' });
    await settle();
    expect(element.shadowRoot?.querySelector('[part="title"]')?.textContent).toBe(
      'Aaj ka panchang',
    );
  });

  it('sets Devanagari first and a taller line for Hindi', () => {
    expect(baseCss).toMatch(/\.kj-card:lang\(hi\) \{[^}]*--kj-p-deva[^}]*line-height: 1\.75/);
    expect(baseCss).toContain("'Noto Sans Devanagari', 'Mukta'");
  });

  it('stops the shimmer for reduced motion', () => {
    expect(baseCss).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.kj-sk\s*\{\s*animation: none/,
    );
  });
});

describe('page overrides', () => {
  it('lets an inline --kj-* on the element through in every mode', () => {
    for (const theme of ['light', 'dark', 'auto']) {
      const element = mount({ theme, style: '--kj-bg: #123456' });
      // happy-dom does not cascade shadow :host rules, so the assertion is
      // on what the page set: the element's own declaration is intact.
      expect(element.style.getPropertyValue('--kj-bg').trim()).toBe('#123456');
    }
  });
});
