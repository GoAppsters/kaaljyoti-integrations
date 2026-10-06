import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunkUrl, createLoader, loaderBase, type ChunkModule } from '../src/core/loader.ts';
import { needsPaidPlan, requiredPlan, timelineHtml, wallMinutes } from '../src/core/ui.ts';

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

let seq = 0;

/** A fake chunk for a fresh tag, so every test registers its own element. */
function chunkFor(tag: string) {
  class Element extends HTMLElement {
    static readonly tag = tag;
  }
  const module: ChunkModule = {
    configureFromDataset: vi.fn(),
    configure: vi.fn(),
    element: Element,
  };
  return module;
}

function setup(tags: string[]) {
  const modules = Object.fromEntries(tags.map((tag) => [tag, chunkFor(tag)]));
  const chunks = Object.fromEntries(tags.map((tag) => [tag, `${tag}-ABC123.js`]));
  const importer = vi.fn((url: string) => {
    const tag = tags.find((candidate) => url.endsWith(`/${candidate}-ABC123.js`));
    return tag ? Promise.resolve(modules[tag]!) : Promise.reject(new Error(`404 ${url}`));
  });
  const loader = createLoader({
    base: 'https://cdn.example.com/widgets/',
    chunks,
    dataset: { key: 'kj_pub_x', lang: 'hi' },
    importer,
  });
  return { loader, importer, modules };
}

const unique = (name: string) => `kj-${name}-${++seq}`;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('chunk URLs', () => {
  it('resolves chunks against the loader’s own directory, not the page', () => {
    expect(
      loaderBase({ src: 'https://cdn.kaaljyoti.com/widgets/v1.js?ver=3' }, 'https://site.test/a/b'),
    ).toBe('https://cdn.kaaljyoti.com/widgets/');
    expect(chunkUrl('https://cdn.kaaljyoti.com/widgets/', 'kj-panchang-X.js')).toBe(
      'https://cdn.kaaljyoti.com/widgets/kj-panchang-X.js',
    );
  });

  it('works for a WordPress plugin and a copy on another CDN alike', () => {
    expect(
      loaderBase(
        { src: 'https://blog.test/wp-content/plugins/kaal-jyoti/assets/widgets/v1.js?ver=0.2.0' },
        'https://blog.test/',
      ),
    ).toBe('https://blog.test/wp-content/plugins/kaal-jyoti/assets/widgets/');
    expect(
      loaderBase(
        { src: 'https://static.example.net/themes/abc/assets/kj-widgets-v1.js?v=17' },
        'https://shop.test/',
      ),
    ).toBe('https://static.example.net/themes/abc/assets/');
  });

  it('prefers data-chunks, for a page whose optimiser moved the script', () => {
    expect(
      loaderBase(
        { src: 'https://site.test/cache/all.js', dataset: { chunks: '/wp-content/kj' } },
        'https://site.test/page/',
      ),
    ).toBe('https://site.test/wp-content/kj/');
  });

  it('falls back to the document without a script', () => {
    expect(loaderBase(null, 'https://site.test/page/x.html')).toBe('https://site.test/page/');
  });
});

describe('the loader', () => {
  it('loads only the chunks the page has tags for, and configures them from data-*', async () => {
    const [panchang, kundli] = [unique('panchang'), unique('kundli')];
    document.body.innerHTML = `<${panchang}></${panchang}>`;
    const { loader, importer, modules } = setup([panchang, kundli]);
    loader.scan();
    await settle();

    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith(`https://cdn.example.com/widgets/${panchang}-ABC123.js`);
    expect(modules[panchang]!.configureFromDataset).toHaveBeenCalledWith({
      key: 'kj_pub_x',
      lang: 'hi',
    });
    expect(customElements.get(panchang)).toBe(modules[panchang]!.element);
    expect(customElements.get(kundli)).toBeUndefined();
  });

  it('loads a chunk once, however many tags and scans', async () => {
    const tag = unique('chart');
    document.body.innerHTML = `<${tag}></${tag}><${tag}></${tag}>`;
    const { loader, importer } = setup([tag]);
    loader.scan();
    loader.scan();
    void loader.load(tag);
    await settle();
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('watches the page for tags added later', async () => {
    const tag = unique('muhurta');
    const { loader, importer } = setup([tag]);
    loader.start();
    expect(importer).not.toHaveBeenCalled();
    document.body.insertAdjacentHTML('beforeend', `<div><${tag}></${tag}></div>`);
    await settle();
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('passes a later configure() to loaded and future chunks', async () => {
    const [first, second] = [unique('horoscope'), unique('reading')];
    document.body.innerHTML = `<${first}></${first}>`;
    const { loader, modules } = setup([first, second]);
    loader.scan();
    await settle();
    loader.configure({ theme: 'dark' });
    expect(modules[first]!.configure).toHaveBeenCalledWith({ theme: 'dark' });
    await loader.load(second);
    expect(modules[second]!.configure).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('define() loads and registers every element', async () => {
    const tags = [unique('a'), unique('b')];
    const { loader } = setup(tags);
    await loader.define();
    for (const tag of tags) expect(customElements.get(tag)).toBeDefined();
  });

  it('warns once and retries later when a chunk fails to load', async () => {
    const tag = unique('broken');
    document.body.innerHTML = `<${tag}></${tag}>`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const importer = vi.fn().mockRejectedValue(new Error('CORS'));
    const loader = createLoader({
      base: 'https://cdn.example.com/',
      chunks: { [tag]: 'x.js' },
      dataset: {},
      importer,
    });
    loader.scan();
    await settle();
    loader.scan();
    await settle();
    expect(importer).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('design-system helpers', () => {
  it('reads the plan out of the API’s refusal', () => {
    expect(
      requiredPlan(
        'per-request branding is available on the Enterprise plan; you are on Scale. Set your branding once',
      ),
    ).toBe('Enterprise');
    // Any paid plan lifts the Free plan's PDF refusal: there is none to name.
    const free = 'PDFs are available on every paid plan; you are on Free';
    expect(requiredPlan(free)).toBeNull();
    expect(needsPaidPlan(free)).toBe(true);
    expect(requiredPlan('publishable keys cannot call this route')).toBeNull();
    expect(needsPaidPlan('publishable keys cannot call this route')).toBe(false);
  });

  it('places the timeline by wall-clock components, in any reader’s zone', () => {
    expect(wallMinutes('2026-09-30T06:17:16.257')! - wallMinutes('2026-09-30T00:00')!).toBe(377);
    const bar = timelineHtml({
      sunrise: '2026-09-30T06:00:00',
      sunset: '2026-09-30T18:00:00',
      nextSunrise: '2026-10-01T06:00:00',
      lanes: [[{ start: '2026-09-30T12:00', end: '2026-09-30T18:00', tone: 'bad', label: 'x' }]],
      lang: 'en',
    });
    expect(bar).toContain('left:25.00%;width:25.00%');
    // Sunset tick in the middle; the night shaded from there.
    expect(bar).toContain('left:50.00%;right:0');
  });
});
