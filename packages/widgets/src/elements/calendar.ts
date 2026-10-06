/**
 * `<kj-calendar>` — the Hindu calendar date converter (revamp §4, 4): a
 * date in, its Vikram Samvat year, masa in both reckonings, paksha, tithi,
 * vara and nakshatra out.
 *
 * Two calls per date: `POST /v1/panchang` for the day (tithi, paksha,
 * nakshatra, vara and the sunrise — shared with a `<kj-panchang>` for the
 * same place and day by the page memo), then `POST /v1/calendar/vikram-samvat`
 * at that sunrise, for the masa in both the purnimanta and the amanta
 * reckoning. The day is the civil day from sunrise, as a panchang reckons
 * it. The place defaults to New Delhi (`city`, or `lat`/`lon`, as on
 * `<kj-panchang>`), and the date to today there (`date="YYYY-MM-DD"`).
 */

import { call } from '../core/call.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { EXTRA_CSS, msg, withDefaultPlace, type Dict } from '../core/extra.ts';
import { MONTHS_LONG, clock, dateLabel, isoDate } from '../core/format.ts';
import { masaName, nameOf, t, type Labelled, type Lang } from '../core/i18n.ts';
import {
  fetchPanchang,
  panchangBody,
  placeLabel,
  type PanchangDocument,
} from '../core/panchang-request.ts';
import { tilesHtml, type Tile } from '../core/ui.ts';
import { dt } from '../core/daily-words.ts';

const M: Dict<
  | 'title'
  | 'date'
  | 'convert'
  | 'samvat'
  | 'purnimanta'
  | 'amanta'
  | 'tithi_sunrise'
  | 'until'
  | 'then'
  | 'reckonings'
  | 'err_date'
  | 'line'
> = {
  en: {
    title: 'Hindu calendar',
    date: 'Date',
    convert: 'Convert',
    samvat: 'Vikram Samvat',
    purnimanta: 'Masa (purnimanta)',
    amanta: 'Masa (amanta)',
    tithi_sunrise: 'Tithi at sunrise',
    until: 'until {time}',
    then: 'then {name}',
    reckonings:
      'Purnimanta months end on the full moon (north India); amanta months on the new moon (south and west India). The day is reckoned from sunrise.',
    err_date: 'Choose a valid date.',
    line: '{masa} {paksha} {tithi}, Vikram Samvat {year}',
  },
  hi: {
    title: 'हिंदू पंचांग तिथि',
    date: 'तारीख़',
    convert: 'बदलें',
    samvat: 'विक्रम संवत',
    purnimanta: 'मास (पूर्णिमांत)',
    amanta: 'मास (अमांत)',
    tithi_sunrise: 'सूर्योदय की तिथि',
    until: '{time} तक',
    then: 'फिर {name}',
    reckonings:
      'पूर्णिमांत मास पूर्णिमा पर पूरा होता है (उत्तर भारत), अमांत मास अमावस्या पर (दक्षिण और पश्चिम भारत)। दिन सूर्योदय से गिना जाता है।',
    err_date: 'सही तारीख़ चुनें।',
    line: '{masa} {paksha} {tithi}, विक्रम संवत {year}',
  },
};

/** One reckoning of `POST /v1/calendar/vikram-samvat`. */
export interface Reckoning {
  is_adhik?: boolean;
  month_index?: number;
  month_name?: Labelled | null;
  samvat_year?: number;
  system?: string;
}

/** `data` of `POST /v1/calendar/vikram-samvat`. */
export interface VikramSamvatDocument {
  amanta?: Reckoning | null;
  purnimanta?: Reckoning | null;
}

interface CalendarData {
  day: PanchangDocument;
  samvat: VikramSamvatDocument | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** @see KjElement */
export class KjCalendar extends KjElement {
  static readonly tag = 'kj-calendar';

  static override styles = EXTRA_CSS;

  static readonly observedAttributes = [
    'date',
    'city',
    'lat',
    'lon',
    'timezone',
    'place',
    'lang',
    'powered-by',
  ];

  private listening = false;

  private invalid = false;

  override connectedCallback(): void {
    if (!this.listening) {
      this.listening = true;
      this.root.addEventListener('submit', (event) => {
        event.preventDefault();
        this.onConvert();
      });
    }
    super.connectedCallback();
  }

  protected override async fetchData(): Promise<CalendarData> {
    const place = withDefaultPlace(this);
    const day = await fetchPanchang(place);
    const body = panchangBody(place);
    const date = day.data.at?.slice(0, 10) ?? body?.date ?? '';
    // The masa at sunrise, as the day is reckoned; noon if there is no sunrise.
    const at = day.data.sunrise?.slice(0, 19) || (date ? `${date}T12:00:00` : '');
    if (!body || !at) return { day: day.data, samvat: null };
    const samvatBody = {
      datetime: at,
      latitude: body.latitude,
      longitude: body.longitude,
      ...(body.timezone ? { timezone: body.timezone } : {}),
      ...(body.place ? { place: body.place } : {}),
      options: body.options,
    };
    const samvat = await call<VikramSamvatDocument>(this, '/calendar/vikram-samvat', samvatBody);
    return { day: day.data, samvat: samvat.data };
  }

  protected override heading(): { title: string; subtitle?: string } {
    const lang = this.activeLang;
    const data = this.data as CalendarData | null;
    const parts = [placeLabel(withDefaultPlace(this), lang)];
    if (data?.day.at) parts.push(dateLabel(data.day.at, lang));
    return { title: msg(M, lang, 'title'), subtitle: parts.filter(Boolean).join(' · ') };
  }

  /** The date the card shows: the answer's, else the attribute, else nothing. */
  private shownDate(): string {
    const data = this.data as CalendarData | null;
    const given = this.getAttribute('date');
    return data?.day.at?.slice(0, 10) ?? (isoDate(given) ? (given as string) : '');
  }

  /** Day / month / year selects and the button; the shown date filled in. */
  private formHtml(lang: Lang): string {
    const date = this.shownDate();
    const [y, m, d] = date ? date.split('-').map(Number) : [0, 0, 0];
    const select = (field: string, label: string, values: [number, string][], value: number) =>
      html`<select class="kj-select" data-date="${field}" aria-label="${label}">
        ${trusted(
          values
            .map(
              ([v, text]) =>
                html`<option value="${v}" ${trusted(v === value ? 'selected' : '')}>
                  ${text}
                </option>`,
            )
            .join(''),
        )}
      </select>`;
    const days = Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)] as [number, string]);
    const months = MONTHS_LONG[lang].map((name, i) => [i + 1, name] as [number, string]);
    const thisYear = new Date().getFullYear();
    const years = Array.from(
      { length: thisYear + 20 - 1900 + 1 },
      (_, i) => [thisYear + 20 - i, String(thisYear + 20 - i)] as [number, string],
    );
    return html`<form class="kj-form kj-section" part="form" novalidate>
      <fieldset class="kj-field" data-group="date">
        <legend>${msg(M, lang, 'date')}</legend>
        <div class="kj-trio">
          ${trusted(select('day', t(lang, 'day'), days, d ?? 0))}
          ${trusted(select('month', t(lang, 'month'), months, m ?? 0))}
          ${trusted(select('year', t(lang, 'year'), years, y ?? 0))}
        </div>
        ${trusted(
          this.invalid
            ? html`<p class="kj-field-error" role="alert">${msg(M, lang, 'err_date')}</p>`
            : '',
        )}
      </fieldset>
      <div class="kj-actions">
        <button class="kj-btn" type="submit" part="submit">${msg(M, lang, 'convert')}</button>
      </div>
    </form>`;
  }

  /** A valid date becomes the `date` attribute, which loads it (2 calls). */
  private onConvert(): void {
    const value = (field: string) =>
      Number(this.root.querySelector<HTMLSelectElement>(`[data-date="${field}"]`)?.value);
    const d = value('day');
    const m = value('month');
    const y = value('year');
    const check = new Date(Date.UTC(y, m - 1, d));
    const valid = Number.isInteger(y) && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
    this.invalid = !valid;
    if (!valid) {
      this.paint();
      return;
    }
    this.setAttribute('date', `${y}-${pad(m)}-${pad(d)}`);
  }

  protected override loadingHtml(): string {
    return this.formHtml(this.activeLang) + super.loadingHtml();
  }

  protected override errorHtml(failure = this.failure): string {
    return this.formHtml(this.activeLang) + super.errorHtml(failure);
  }

  protected override render(): string {
    const data = this.data as CalendarData | null;
    const lang = this.activeLang;
    if (!data) return this.formHtml(lang);
    const { day, samvat } = data;
    const purnimanta = samvat?.purnimanta ?? null;
    const amanta = samvat?.amanta ?? null;
    const tithis = day.tithis ?? [];
    const first = tithis[0];
    const paksha = nameOf(first?.paksha ?? day.panchang?.paksha, lang);
    const tithi = nameOf(first?.name ?? day.panchang?.tithi_name, lang);
    const year = purnimanta?.samvat_year ?? day.masa?.samvat_year ?? null;
    const masa =
      masaName(purnimanta?.month_name, purnimanta?.is_adhik, lang) ||
      masaName(day.masa?.month_name, day.masa?.is_adhik, lang);

    const then = tithis[1]
      ? `, ${msg(M, lang, 'then', { name: nameOf(tithis[1].name, lang) })}`
      : '';
    const tiles: Tile[] = [
      {
        key: 'samvat',
        label: msg(M, lang, 'samvat'),
        value: html`${year ?? '—'}`,
      },
      {
        key: 'purnimanta',
        label: msg(M, lang, 'purnimanta'),
        value: html`${masaName(purnimanta?.month_name, purnimanta?.is_adhik, lang) || '—'}`,
      },
      {
        key: 'amanta',
        label: msg(M, lang, 'amanta'),
        value: html`${masaName(amanta?.month_name, amanta?.is_adhik, lang) || '—'}`,
      },
      {
        key: 'paksha',
        label: dt(lang, 'paksha'),
        value: html`${paksha || '—'}`,
      },
      {
        key: 'tithi',
        label: msg(M, lang, 'tithi_sunrise'),
        value: html`${tithi || '—'}`,
        sub: first?.ends
          ? html`${msg(M, lang, 'until', { time: clock(first.ends, lang) })}${then}`
          : undefined,
      },
      {
        key: 'vara',
        label: dt(lang, 'vara'),
        value: html`${nameOf(day.panchang?.vara, lang) || '—'}`,
      },
      {
        key: 'nakshatra',
        label: t(lang, 'nakshatra'),
        value: html`${nameOf(day.panchang?.nakshatra, lang) || '—'}`,
      },
    ];
    const line =
      masa && tithi && year
        ? html`<p class="kj-lead" part="line">
            <strong>${dateLabel(day.at, lang)}</strong>:
            ${msg(M, lang, 'line', { masa, paksha, tithi, year })}
          </p>`
        : '';
    return html`${trusted(this.formHtml(lang))} ${trusted(line)}
      ${trusted(tilesHtml(tiles, 'calendar'))}
      <p class="kj-note" part="reckonings">${msg(M, lang, 'reckonings')}</p>`;
  }
}
