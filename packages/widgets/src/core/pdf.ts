/**
 * "Download PDF" on the kundli report and the match result (decision 27).
 *
 * The API prints a kundli or a match as a PDF (`POST /v1/pdf/kundli`,
 * `/v1/pdf/match`), on every paid plan (not Free) and never for a publishable
 * key. So a PDF always goes through the site's proxy (decision 23), and the
 * button is drawn only when the page says that proxy relays PDFs: `data-pdf`
 * on the script (or `configure({ pdf })`) names the kundli editions it
 * offers, and a proxy must be configured. `pdf="off"` on an element hides it
 * there; a list on the element narrows the editions.
 *
 * The answer is the PDF itself, not an envelope. It is saved with the
 * filename the API gave it (`Content-Disposition`), through an object URL;
 * a refusal is the API's envelope, relayed, and becomes the plan-required
 * card (`plan_required`), a plain line for the month's PDFs being used up
 * (`pdf_quota_exceeded`), or a generic line.
 *
 * This module is loaded with `import()` the first time a form has a bar to
 * draw (`pdf-offer.ts` decides that), so a site without PDFs never
 * downloads its words, its rules or its fetch. Its rules travel in the bar's
 * own `<style>` for the same reason, and it imports nothing at run time:
 * a module the element chunks share, imported from here too, would be split
 * out of their shared chunk into one more file for every page.
 */

import type { PdfEdition } from './config.ts';
import type { KjError } from './errors.ts';
import type { Lang } from './i18n.ts';
import pdfCss from '../styles/pdf.css';

type PdfKey =
  | 'download'
  | 'edition'
  | 'basic'
  | 'professional'
  | 'language'
  | 'en'
  | 'hi'
  | 'preparing'
  | 'saved'
  | 'quota'
  | 'rate'
  | 'failed'
  | 'label';

const M: Record<Lang, Record<PdfKey, string>> = {
  en: {
    download: 'Download PDF',
    edition: 'Edition',
    basic: 'Basic',
    professional: 'Professional',
    language: 'Language',
    en: 'English',
    hi: 'Hindi',
    preparing: 'Preparing the PDF…',
    saved: 'The PDF has been downloaded.',
    quota:
      'This site has made all the PDFs its plan includes this month. Please try again next month.',
    rate: 'Too many PDFs in a short time. Please wait a minute and try again.',
    failed: 'The PDF could not be made. Please try again.',
    label: 'PDF report',
  },
  hi: {
    download: 'PDF डाउनलोड करें',
    edition: 'संस्करण',
    basic: 'सामान्य',
    professional: 'विस्तृत',
    language: 'भाषा',
    en: 'अंग्रेज़ी',
    hi: 'हिन्दी',
    preparing: 'PDF तैयार हो रहा है…',
    saved: 'PDF डाउनलोड हो गया है।',
    quota: 'इस साइट ने इस महीने की सभी PDF बना ली हैं। कृपया अगले महीने फिर प्रयास करें।',
    rate: 'थोड़े समय में बहुत अधिक PDF। कृपया एक मिनट रुककर फिर प्रयास करें।',
    failed: 'PDF नहीं बन सका। कृपया फिर प्रयास करें।',
    label: 'PDF रिपोर्ट',
  },
};

/** Where a PDF request stands, per form. */
export interface PdfState {
  status: 'idle' | 'loading' | 'saved' | 'error';
  error?: KjError;
  /** The last choice, so a repaint keeps the selects where the reader left them. */
  choice?: PdfChoice;
}

/** What the reader chose on the bar. */
export interface PdfChoice {
  edition: PdfEdition;
  lang: Lang;
}

/** Text for markup: the five characters that matter, escaped. */
function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/** A word in the bar's language. */
function word(lang: Lang, key: PdfKey): string {
  return esc(M[lang][key]);
}

/** One `<option>`, selected or not. */
function option(value: string, label: string, selected: boolean): string {
  return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${label}</option>`;
}

/**
 * The bar: an edition select (only when there is a choice), a language
 * select, the button, and a line for what happened. `editions` empty draws
 * nothing. `kind` is `match` for the match PDF, which has no edition.
 * `planCard` is the form's own plan-required card for a plan refusal.
 */
export function pdfBarHtml(
  kind: 'kundli' | 'match',
  editions: readonly PdfEdition[],
  state: PdfState,
  lang: Lang,
  planCard = '',
): string {
  if (!editions.length) return '';
  const id = `kj-pdf-${kind}`;
  const picked = state.choice;
  const editionSelect =
    kind === 'kundli' && editions.length > 1
      ? `<label class="kj-pdf-field"><span class="kj-pdf-label">${word(lang, 'edition')}</span>` +
        `<select class="kj-select" id="${id}-edition" data-pdf-edition>` +
        editions.map((e) => option(e, word(lang, e), e === picked?.edition)).join('') +
        '</select></label>'
      : '';
  const chosenLang = picked?.lang ?? lang;
  const langSelect =
    `<label class="kj-pdf-field"><span class="kj-pdf-label">${word(lang, 'language')}</span>` +
    `<select class="kj-select" id="${id}-lang" data-pdf-lang>` +
    (['en', 'hi'] as const)
      .map((code) => option(code, word(lang, code), code === chosenLang))
      .join('') +
    '</select></label>';
  const busy = state.status === 'loading';
  const button =
    '<button type="button" class="kj-btn kj-btn-quiet" data-action="pdf" part="pdf-button"' +
    (busy ? ' disabled aria-busy="true"' : '') +
    `>${word(lang, busy ? 'preparing' : 'download')}</button>`;
  return (
    `<div class="kj-pdf" part="pdf" role="group" aria-label="${word(lang, 'label')}">` +
    `<style>${pdfCss}</style>` +
    `<div class="kj-pdf-row">${editionSelect}${langSelect}<div class="kj-pdf-go">${button}</div></div>` +
    pdfStatusHtml(state, lang, planCard) +
    '</div>'
  );
}

/** The line under the bar, or the plan card for a plan refusal. */
function pdfStatusHtml(state: PdfState, lang: Lang, planCard: string): string {
  if (state.status === 'saved') {
    return `<p class="kj-pdf-status" role="status" part="pdf-status">${word(lang, 'saved')}</p>`;
  }
  if (state.status !== 'error' || !state.error) return '';
  if (planCard) return planCard;
  const code = state.error.code;
  const key: PdfKey =
    code === 'pdf_quota_exceeded'
      ? 'quota'
      : code === 'rate_limited' || code === 'proxy_rate_limited'
        ? 'rate'
        : 'failed';
  return (
    `<p class="kj-notice kj-pdf-status" role="alert" part="pdf-error" data-code="${esc(code)}">` +
    `${word(lang, key)}</p>`
  );
}

/** The choice on a bar under `root`, with the defaults for a missing select. */
export function readPdfChoice(
  root: ParentNode,
  editions: readonly PdfEdition[],
  lang: Lang,
): PdfChoice {
  const edition = root.querySelector<HTMLSelectElement>('[data-pdf-edition]')?.value;
  const chosen = root.querySelector<HTMLSelectElement>('[data-pdf-lang]')?.value;
  return {
    edition: editions.includes(edition as PdfEdition)
      ? (edition as PdfEdition)
      : (editions[0] ?? 'basic'),
    lang: chosen === 'hi' || chosen === 'en' ? chosen : lang,
  };
}

/** `attachment; filename="kundli-ravi.pdf"` → `kundli-ravi.pdf`, or the fallback. */
export function pdfFileName(disposition: string | null, fallback: string): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  const name = match?.[1]?.trim() ?? '';
  return /^[\w.-]{1,120}\.pdf$/i.test(name) ? name : fallback;
}

/** What the proxy answered: the file, or the response to read a refusal from. */
export type PdfAnswer =
  { ok: true; blob: Blob; filename: string } | { ok: false; response: Response; envelope: unknown };

/**
 * `POST {proxy}` with `{ path, body }`. A network failure rejects; anything
 * that is not a PDF comes back with its parsed body for the caller to map.
 */
export async function fetchPdf(
  url: string,
  clientTag: string,
  path: string,
  body: unknown,
  fallbackName: string,
): Promise<PdfAnswer> {
  const response = await globalThis.fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/pdf, application/json',
      'Content-Type': 'application/json',
      'X-KJ-Client': clientTag,
    },
    body: JSON.stringify({ path, body }),
    credentials: 'same-origin',
  });
  const type = response.headers.get('Content-Type') ?? '';
  if (response.ok && /application\/pdf/i.test(type)) {
    return {
      ok: true,
      blob: await response.blob(),
      filename: pdfFileName(response.headers.get('Content-Disposition'), fallbackName),
    };
  }
  let envelope: unknown = null;
  try {
    envelope = await response.json();
  } catch {
    // Not an envelope: the proxy's HTML error page, or nothing.
  }
  return { ok: false, response, envelope };
}

/** Hand the file to the browser as a download. */
export function savePdf(blob: Blob, filename: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the browser to have started the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
