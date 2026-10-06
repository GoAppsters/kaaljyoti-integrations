import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { html, KjElement } from '../src/core/element.ts';
import { configure, resetConfig } from '../src/core/config.ts';
import { KjError } from '../src/core/errors.ts';

/** A widget with every moving part exposed, so the base class is the subject. */
class KjTest extends KjElement {
  static readonly observedAttributes = ['city', 'lang', 'powered-by'];

  /** How many times `load()` reached the request. */
  loads = 0;
  failWith: KjError | null = null;
  answer: unknown = { ok: true };
  /** Resolves the pending request when set, to test the loading state. */
  gate: Promise<void> | null = null;

  protected override async fetchData(): Promise<unknown> {
    this.loads++;
    if (this.gate) await this.gate;
    if (this.failWith) throw this.failWith;
    return this.answer;
  }

  protected override render(): string {
    return html`<p class="kj-value">${this.getAttribute('city')} ${this.t('tithi')}</p>`;
  }

  /** `notePlan` is protected; the plan normally arrives with a response. */
  setPlan(plan: string | null): void {
    this.notePlan(plan);
  }

  get markup(): string {
    return this.shadowRoot?.innerHTML ?? '';
  }
}

customElements.define('kj-test', KjTest);

/** Let queued microtasks and settled promises run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(attrs: Record<string, string> = {}): KjTest {
  const element = document.createElement('kj-test') as KjTest;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

beforeEach(() => {
  resetConfig();
  configure({ key: 'kj_pub_test', lang: 'en' });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('KjElement lifecycle', () => {
  it('paints the loading state before the answer arrives', async () => {
    let open: () => void = () => {};
    const element = document.createElement('kj-test') as KjTest;
    element.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    document.body.append(element);

    expect(element.getAttribute('data-state')).toBe('loading');
    expect(element.markup).toContain('Loading…');

    open();
    await settle();
    expect(element.getAttribute('data-state')).toBe('ready');
  });

  it('renders and fires a bubbling, composed kj-ready', async () => {
    const seen: unknown[] = [];
    document.addEventListener('kj-ready', (event) => seen.push((event as CustomEvent).detail));

    const element = mount({ city: 'delhi' });
    await settle();

    expect(element.markup).toContain('delhi Tithi');
    expect(seen).toEqual([{ ok: true }]);
  });

  it('renders a translated error with its code, and fires kj-error', async () => {
    const errors: KjError[] = [];
    document.addEventListener('kj-error', (event) =>
      errors.push((event as CustomEvent<KjError>).detail),
    );

    const element = mount();
    element.failWith = new KjError('quota_exceeded', 'Quota exceeded', { status: 402 });
    await element['load']();

    const line = element.shadowRoot?.querySelector('[data-code]');
    expect(line?.getAttribute('data-code')).toBe('quota_exceeded');
    expect(line?.textContent).toContain('used up its credits');
    expect(element.getAttribute('data-state')).toBe('error');
    expect(errors.at(-1)?.code).toBe('quota_exceeded');
  });

  it('falls back to the generic line for a code it has no translation for', async () => {
    const element = mount();
    element.failWith = new KjError('validation_error', 'Invalid input', { status: 400 });
    await element['load']();

    const line = element.shadowRoot?.querySelector('[data-code]');
    expect(line?.getAttribute('data-code')).toBe('validation_error');
    expect(line?.textContent).toContain('Something went wrong');
  });

  it('escapes response text but keeps the stylesheet across repaints', async () => {
    const element = mount({ city: '<img src=x onerror=alert(1)>' });
    await settle();

    expect(element.markup).toContain('&lt;img');
    expect(element.markup).not.toContain('<img');
  });
});

describe('attribute changes', () => {
  it('coalesces three attribute changes into one reload', async () => {
    const element = mount({ city: 'delhi' });
    await settle();
    expect(element.loads).toBe(1);

    element.setAttribute('city', 'mumbai');
    element.setAttribute('city', 'jaipur');
    element.setAttribute('city', 'varanasi');
    await settle();

    expect(element.loads).toBe(2);
    expect(element.markup).toContain('varanasi');
  });

  it('re-renders a language change without fetching again', async () => {
    const element = mount({ city: 'delhi' });
    await settle();

    element.setAttribute('lang', 'hi');
    await settle();

    expect(element.loads).toBe(1);
    expect(element.markup).toContain('तिथि');
  });

  it('ignores changes made before the element is connected', async () => {
    const element = document.createElement('kj-test') as KjTest;
    element.setAttribute('city', 'delhi');
    element.setAttribute('city', 'mumbai');
    expect(element.loads).toBe(0);

    document.body.append(element);
    await settle();
    expect(element.loads).toBe(1);
  });
});

describe('powered by', () => {
  it('is shown by default', async () => {
    const element = mount();
    await settle();
    expect(element.markup).toContain('Powered by Kaal Jyoti');
  });

  it('stays on free and starter even when the page asks to hide it', async () => {
    const element = mount({ 'powered-by': 'hidden' });
    element.setPlan('starter');
    await element['load']();
    expect(element.markup).toContain('Powered by Kaal Jyoti');
  });

  it('is hidden once a paid plan has answered', async () => {
    const element = mount({ 'powered-by': 'hidden' });
    element.setPlan('growth');
    await element['load']();
    expect(element.markup).not.toContain('Powered by Kaal Jyoti');
  });

  it('honours data-powered-by from the script tag the same way', async () => {
    configure({ poweredBy: 'hidden' });
    const element = mount();
    element.setPlan('enterprise');
    await element['load']();
    expect(element.markup).not.toContain('Powered by Kaal Jyoti');
  });

  it('in opt-in mode (the WordPress plugin) is hidden on every plan unless shown is asked', async () => {
    configure({ creditOptIn: true, poweredBy: 'hidden' });
    const free = mount();
    free.setPlan('free');
    await free['load']();
    expect(free.markup).not.toContain('Powered by Kaal Jyoti');

    const optedIn = mount({ 'powered-by': 'shown' });
    optedIn.setPlan('free');
    await optedIn['load']();
    expect(optedIn.markup).toContain('Powered by Kaal Jyoti');
  });

  it('translates the footer', async () => {
    const element = mount({ lang: 'hi' });
    await settle();
    expect(element.markup).toContain('काल ज्योति');
  });
});
