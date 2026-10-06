/**
 * `@kaaljyoti/sdk` — the typed client for the Kaal Jyoti API.
 *
 * ```ts
 * import { Kaaljyoti } from '@kaaljyoti/sdk';
 *
 * const kj = new Kaaljyoti({ apiKey: process.env.KAALJYOTI_API_KEY! });
 * const { data, meta } = await kj.kundli.get({ birth });
 * ```
 *
 * The generated `paths`/`components` are deliberately not re-exported: they
 * are an implementation detail `pnpm gen` may rewrite, and everything a
 * caller needs from them has a hand-picked name in `types.ts` (design
 * decision 10).
 */

export {
  Kaaljyoti,
  createClient,
  type CallOptions,
  type ChartOptions,
  type ChartJsonOptions,
  type ChartMethod,
  type PostMethod,
  type ReferenceOptions,
  type TimezoneQuery,
  type PlacesQuery,
  type KundliNamespace,
  type PanchangNamespace,
  type EphemerisNamespace,
  type CalendarNamespace,
  type JaiminiNamespace,
  type KpNamespace,
  type VarshphalNamespace,
  type TransitNamespace,
  type MatchNamespace,
  type ReportsNamespace,
  type PdfNamespace,
  type PdfMethod,
} from './client.ts';

export {
  createTransport,
  normaliseBaseUrl,
  filenameOf,
  DEFAULT_BASE_URL,
  HEALTH_PATH,
  VERSION,
  type ClientOptions,
  type PdfFile,
  type Query,
  type RateLimit,
  type RequestInitLike,
  type Result,
  type Transport,
} from './transport.ts';

export {
  KaaljyotiError,
  isKaaljyotiError,
  isRetryable,
  CLIENT_ERROR_CODES,
  type KaaljyotiErrorDetail,
} from './errors.ts';

export { toWallClock, fromWallClock, utcOffsetAt } from './wallclock.ts';

export type * from './types.ts';
