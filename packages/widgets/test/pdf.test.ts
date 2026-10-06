/**
 * "Download PDF" on the kundli report and the match result (decision 27):
 * drawn only when the page's proxy relays PDFs, sent through that proxy,
 * saved under the API's filename, and a refusal shown the way a plan
 * refusal is everywhere else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/core/cache.ts';
import { configure, getConfig, readDatasetConfig, resetConfig } from '../src/core/config.ts';
import { pdfFileName } from '../src/core/pdf.ts';
import { pdfEditions } from '../src/core/pdf-offer.ts';
import { KjKundliForm } from '../src/elements/kundli-form.ts';
import { KjMatchForm } from '../src/elements/match-form.ts';
import ashtakoot from './fixtures/ashtakoot.json';
import { fillBirth, json, mount, settle, stubFetch, submitForm, text } from './support.ts';

const PDF_BYTES = '%PDF-1.7\n%fake\n';

function pdfAnswer(name = 'kundli-asha.pdf'): Response {
  return new Response(PDF_BYTES, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}

const PAID_REQUIRED = {
  status: 'error',
  error: {
    code: 'plan_required',
    message: 'PDFs are available on every paid plan; you are on Free',
  },
};

const PDF_QUOTA = {
  status: 'error',
  error: {
    code: 'pdf_quota_exceeded',
    message: 'you have made all 50 PDFs included in the Starter plan this month',
  },
};

let saved: { href: string; download: string }[] = [];

beforeEach(() => {
  resetConfig();
  clearCache();
  configure({ key: 'kj_pub_test', baseUrl: 'https://api.test' });
  document.body.innerHTML = '';
  saved = [];
  // happy-dom has no object URLs and no downloads: record what would be saved.
  URL.createObjectURL = vi.fn(() => 'blob:kj-test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ href: this.href, download: this.download });
  });
  try {
    localStorage.clear();
  } catch {
    // Storage may be unavailable; the forms guard it themselves.
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function submittedKundli(attrs: Record<string, string> = {}): Promise<KjKundliForm> {
  const element = mount<KjKundliForm>(KjKundliForm, attrs);
  await settle();
  fillBirth(element.shadowRoot!);
  submitForm(element.shadowRoot!);
  await settle();
  return element;
}

async function submittedMatch(attrs: Record<string, string> = {}): Promise<KjMatchForm> {
  const element = mount<KjMatchForm>(KjMatchForm, attrs);
  await settle();
  const root = element.shadowRoot!;
  fillBirth(root.querySelector('[data-side="bride"]')!);
  fillBirth(root.querySelector('[data-side="groom"]')!);
  submitForm(root);
  await settle();
  return element;
}

function pdfButton(element: HTMLElement): HTMLButtonElement | null {
  return element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="pdf"]');
}

describe('the PDF option', () => {
  it('reads data-pdf as a list of editions, and on as the basic one', () => {
    const offered = (pdf: string) => {
      resetConfig();
      configure({ ...readDatasetConfig({ pdf }), proxyUrl: '/proxy' });
      return pdfEditions(document.createElement('div'));
    };
    expect(offered('basic professional')).toEqual(['basic', 'professional']);
    expect(offered('Professional,basic')).toEqual(['basic', 'professional']);
    expect(offered('on')).toEqual(['basic']);
    expect(offered('off')).toEqual([]);
    expect(offered('deluxe')).toEqual([]);
    expect(readDatasetConfig({}).pdf).toBeUndefined();
    configure({ pdf: ['professional'] });
    expect(getConfig().pdf).toEqual(['professional']);
  });

  it('offers nothing without a proxy, and lets an element narrow but never widen', () => {
    const element = document.createElement('div');
    configure({ pdf: ['basic'] });
    expect(pdfEditions(element)).toEqual([]);
    configure({ proxyUrl: '/proxy' });
    expect(pdfEditions(element)).toEqual(['basic']);
    element.setAttribute('pdf', 'basic professional');
    expect(pdfEditions(element)).toEqual(['basic']);
    element.setAttribute('pdf', 'off');
    expect(pdfEditions(element)).toEqual([]);
  });

  it('keeps the API’s filename, and only a safe one', () => {
    expect(pdfFileName('attachment; filename="kundli-ravi-kumar.pdf"', 'x.pdf')).toBe(
      'kundli-ravi-kumar.pdf',
    );
    expect(pdfFileName('attachment; filename="../../evil.sh"', 'kundli.pdf')).toBe('kundli.pdf');
    expect(pdfFileName(null, 'match.pdf')).toBe('match.pdf');
  });
});

describe('<kj-kundli-form> Download PDF', () => {
  it('draws no button when the page has no PDF proxy', async () => {
    stubFetch();
    configure({ proxyUrl: '/proxy' });
    const element = await submittedKundli();
    expect(element.shadowRoot!.querySelector('[part~="result"]')).not.toBeNull();
    expect(pdfButton(element)).toBeNull();
  });

  it('sends the birth, edition, language, name and template through the proxy and saves the file', async () => {
    const { calls } = stubFetch({ '/pdf/kundli': () => pdfAnswer() });
    configure({
      proxyUrl: '/wp-json/kaal-jyoti/v1/proxy?_wpnonce=abc',
      pdf: ['basic', 'professional'],
    });
    const element = await submittedKundli({ preset: 'traditional', 'chart-style': 'south' });
    const root = element.shadowRoot!;

    const edition = root.querySelector<HTMLSelectElement>('[data-pdf-edition]')!;
    expect([...edition.options].map((option) => option.value)).toEqual(['basic', 'professional']);
    edition.value = 'professional';
    root.querySelector<HTMLSelectElement>('[data-pdf-lang]')!.value = 'hi';
    pdfButton(element)!.click();
    await settle();

    const call = calls.find((c) => c.path === '/pdf/kundli')!;
    expect(call.proxied).toBe(true);
    expect(call.url).toContain('/wp-json/kaal-jyoti/v1/proxy?_wpnonce=abc');
    expect(call.url).not.toContain('kj_pub_test');
    expect(call.body).toMatchObject({
      edition: 'professional',
      options: { language: 'hi' },
      name: 'Asha',
      template: 'traditional',
      chart_style: 'south',
    });
    expect((call.body.birth as { latitude: number }).latitude).toBeCloseTo(25.3176);
    expect(saved).toEqual([{ href: 'blob:kj-test', download: 'kundli-asha.pdf' }]);
    expect(text(root.querySelector('[part="pdf-status"]'))).toContain('downloaded');
    // The choice survives the repaint.
    expect(root.querySelector<HTMLSelectElement>('[data-pdf-edition]')!.value).toBe('professional');
  });

  it('shows one edition without a select', async () => {
    stubFetch({ '/pdf/kundli': () => pdfAnswer() });
    configure({ proxyUrl: '/proxy', pdf: ['basic'] });
    const element = await submittedKundli();
    expect(element.shadowRoot!.querySelector('[data-pdf-edition]')).toBeNull();
    pdfButton(element)!.click();
    await settle();
    expect(saved).toHaveLength(1);
  });

  it('shows the plan card when the site’s plan has no PDFs', async () => {
    stubFetch({ '/pdf/kundli': () => json(PAID_REQUIRED, 403) });
    configure({ proxyUrl: '/proxy', pdf: ['basic'] });
    const element = await submittedKundli();
    pdfButton(element)!.click();
    await settle();
    const card = element.shadowRoot!.querySelector('.kj-pdf [part~="plan-required"]');
    expect(card).not.toBeNull();
    expect(text(card)).toContain('Available on a paid plan');
    expect(saved).toHaveLength(0);
  });

  it('says so plainly when the month’s PDFs are used up', async () => {
    stubFetch({ '/pdf/kundli': () => json(PDF_QUOTA, 402) });
    configure({ proxyUrl: '/proxy', pdf: ['basic'] });
    const element = await submittedKundli();
    pdfButton(element)!.click();
    await settle();
    const line = element.shadowRoot!.querySelector('[part="pdf-error"]');
    expect(line?.getAttribute('data-code')).toBe('pdf_quota_exceeded');
    expect(text(line)).toContain('next month');
  });

  it('is off on an element that says pdf="off"', async () => {
    stubFetch();
    configure({ proxyUrl: '/proxy', pdf: ['basic'] });
    const element = await submittedKundli({ pdf: 'off' });
    expect(pdfButton(element)).toBeNull();
  });
});

describe('<kj-match-form> Download PDF', () => {
  it('sends both births and both names through the proxy', async () => {
    const { calls } = stubFetch({
      '/match/ashtakoot': () => json(ashtakoot),
      '/pdf/match': () => pdfAnswer('match-asha-asha.pdf'),
    });
    configure({ proxyUrl: '/proxy', pdf: ['professional'] });
    const element = await submittedMatch({ lang: 'hi' });
    const root = element.shadowRoot!;
    expect(root.querySelector('[data-pdf-edition]')).toBeNull();
    expect(root.querySelector<HTMLSelectElement>('[data-pdf-lang]')!.value).toBe('hi');
    pdfButton(element)!.click();
    await settle();

    const call = calls.find((c) => c.path === '/pdf/match')!;
    expect(call.proxied).toBe(true);
    expect(call.body).toMatchObject({
      options: { language: 'hi' },
      name: 'Asha',
      partner_name: 'Asha',
    });
    expect(call.body).not.toHaveProperty('edition');
    expect(call.body.bride).toBeDefined();
    expect(call.body.groom).toBeDefined();
    expect(saved).toEqual([{ href: 'blob:kj-test', download: 'match-asha-asha.pdf' }]);
  });

  it('has no button without a PDF proxy', async () => {
    stubFetch({ '/match/ashtakoot': () => json(ashtakoot) });
    const element = await submittedMatch();
    expect(element.shadowRoot!.querySelector('[part="score"]')).not.toBeNull();
    expect(pdfButton(element)).toBeNull();
  });
});
