/**
 * Whether a form draws the "Download PDF" bar (decision 27), and the request
 * itself: the bar, its words and its rules are `pdf.ts`, which a form loads
 * with `import()` only when {@link pdfEditions} says yes.
 */

import { errorFromEnvelope, type Envelope } from './client.ts';
import { CLIENT_TAG, getConfig, isOff, safeProxyUrl, type PdfEdition } from './config.ts';
import { CLIENT_ERROR_CODES, KjError } from './errors.ts';
import type * as PdfModule from './pdf.ts';

/**
 * The PDF editions a list names, in a fixed order: `basic`, `professional`
 * (spaces or commas between them). `on`, `true` and `yes` are the basic
 * edition; anything else, `off` included, is none.
 */
export function parsePdfEditions(raw: string | null | undefined): PdfEdition[] {
  const words = (raw ?? '')
    .trim()
    .toLowerCase()
    .split(/[\s,]+/);
  if (words.length === 1 && /^(on|true|yes|1)$/.test(words[0] ?? '')) return ['basic'];
  return (['basic', 'professional'] as const).filter((edition) => words.includes(edition));
}

/**
 * The element's proxy, as `call.ts` reads it. Not imported from there: a
 * module the daily widgets share, imported here as well, would be split into
 * a chunk of its own and cost every page a request.
 */
function proxyOf(el: Element): string | undefined {
  return safeProxyUrl(el.getAttribute('proxy')) ?? getConfig().proxyUrl;
}

/**
 * The editions this element offers: its `pdf` attribute, else the page's
 * `data-pdf` — and none at all without a proxy to send them through.
 */
export function pdfEditions(el: Element): PdfEdition[] {
  if (!proxyOf(el)) return [];
  const own = el.getAttribute('pdf');
  if (own !== null) {
    if (isOff(own)) return [];
    const offered = parsePdfEditions(getConfig().pdf.join(' '));
    // An element can narrow what the site offers, never widen it.
    return parsePdfEditions(own).filter((edition) => offered.includes(edition));
  }
  return parsePdfEditions(getConfig().pdf.join(' '));
}

/** The PDF module, as the forms hold it once loaded. */
export type PdfKit = typeof PdfModule;

let kit: Promise<PdfKit> | null = null;

/** `pdf.ts`, loaded once per page. */
export function loadPdfKit(): Promise<PdfKit> {
  kit ??= import('./pdf.ts');
  return kit;
}

/**
 * One PDF through the element's proxy: the file, or a `KjError` — the
 * relayed envelope's (`plan_required`, `pdf_quota_exceeded`, the proxy's own
 * codes), or `network_error` / `bad_response`.
 */
export async function requestPdf(
  el: Element,
  pdf: PdfKit,
  path: '/pdf/kundli' | '/pdf/match',
  body: unknown,
  fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
  const proxy = proxyOf(el);
  if (!proxy) throw new KjError(CLIENT_ERROR_CODES.proxyRequired, `${path} needs a server proxy`);
  let answer: Awaited<ReturnType<PdfKit['fetchPdf']>>;
  try {
    answer = await pdf.fetchPdf(
      new URL(proxy, document.baseURI).href,
      CLIENT_TAG,
      path,
      body,
      fallbackName,
    );
  } catch (cause) {
    throw new KjError(CLIENT_ERROR_CODES.network, cause instanceof Error ? cause.message : 'fetch');
  }
  if (answer.ok) return answer;
  const envelope = answer.envelope as Envelope | null;
  if (envelope?.status === 'error') throw errorFromEnvelope(envelope, answer.response);
  throw new KjError(CLIENT_ERROR_CODES.badResponse, 'The PDF answer was not a PDF', {
    status: answer.response.status,
  });
}

/** The PDF template matching a preset: the four share their names. */
export function pdfTemplate(el: Element): string | undefined {
  const preset = (el.getAttribute('preset') ?? getConfig().preset).trim().toLowerCase();
  return ['classic', 'modern', 'minimal', 'traditional'].includes(preset) ? preset : undefined;
}

/** A name for the cover: trimmed to what the API takes, or nothing. */
export function pdfName(name: string): string | undefined {
  return name.trim().slice(0, 120) || undefined;
}
