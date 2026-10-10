/**
 * `<kj-reading>` — what a lagna, a janma nakshatra, the house lords, the
 * grahas, the yogas, the dashas, a year or the areas of life say about a
 * person.
 *
 * `type="lagna"` asks `POST /v1/reports/lagna`, `type="nakshatra"` asks
 * `POST /v1/reports/nakshatra`, and either takes one of three things:
 *
 *   * a preset id — `sign="leo"` or `nakshatra="rohini"` — for a "know your
 *     lagna" page that needs no birth details at all;
 *   * a birth, in `<kj-chart>`'s attributes (`datetime`, `lat`/`lon` or
 *     `city`, `timezone`, `place`), or set in one go through `.birth` — which
 *     is how `<kj-kundli-form readings>` uses it;
 *   * neither, and then a picker, and no call until the reader picks.
 *
 * The other types are personal reports and need a birth — there is nothing
 * to pick, so without one they show the chart's `no_birth` line:
 *
 *   * `house_lords` — twelve items in house order, "1st house · Gemini · lord
 *     Mercury in the 9th", then the reading;
 *   * `grahas` — nine items, "Sun · Aries · 10th house", then what the graha
 *     says in that sign and in that house;
 *   * `yogas` — each yoga that forms, its name (the API's), the grahas in it
 *     and the text;
 *   * `vimshottari` — each mahadasha as a heading with its dates, a level
 *     badge and the text, the running one marked; the antardashas the answer
 *     also carries are not shown;
 *   * `varshphal` — the year from the birthday in `year` (default: the one
 *     running now, from the last birthday): a summary, seven life areas and
 *     the year's periods as a compact row of dates;
 *   * `life_areas` — the summary line and one card per area of life;
 *   * `kundli` — several of these in one call (`POST /v1/reports/kundli`,
 *     priced 5 credits per part): `parts` names them (default all), each
 *     drawn by its own renderer in the API's order, with one disclaimer.
 *
 * They are on every plan, at 5 credits each (the kundli report 5 per part).
 * What the API gives as
 * `basis` — the reasons, for the site — is never drawn.
 *
 * One call per reading. Both languages come back in the one answer, so a
 * `lang` flip repaints (decision 10). The answer ends with the disclaimer
 * line unless `disclaimer="off"`.
 */

import { cacheKey, memo } from '../core/cache.ts';
import { request } from '../core/client.ts';
import { KjElement, html, trusted } from '../core/element.ts';
import { KjError } from '../core/errors.ts';
import { clock, dateLabel } from '../core/format.ts';
import { badgeHtml, signHtml, skeletonHtml } from '../core/ui.ts';
import { t, type Labelled, type Lang, type MessageKey } from '../core/i18n.ts';
import {
  GRAHAS,
  NAKSHATRAS,
  SIGNS,
  areasHtml,
  disclaimerHtml,
  houseOrdinal,
  known,
  labelled,
  levelHtml,
  rangeText,
  reportOptions,
  summaryHtml,
  tableName,
  textOf,
  type AnswerZone,
  type ReportText,
  type Summary,
} from '../core/reports.ts';
import { readBirth, writeBirth, type KjBirth } from './chart.ts';

/** The types, and the route each one asks. */
const PATHS = {
  lagna: '/reports/lagna',
  nakshatra: '/reports/nakshatra',
  house_lords: '/reports/house-lords',
  grahas: '/reports/grahas',
  yogas: '/reports/yogas',
  vimshottari: '/reports/vimshottari',
  varshphal: '/reports/varshphal',
  life_areas: '/reports/life-areas',
  kundli: '/reports/kundli',
} as const;

/** The parts `type="kundli"` can ask for, in the order the API draws them. */
const PARTS = [
  'lagna',
  'nakshatra',
  'life_areas',
  'house_lords',
  'grahas',
  'yogas',
  'vimshottari',
  'varshphal',
] as const;
type Part = (typeof PARTS)[number];

/** `type`: which reading. */
export type ReadingType = keyof typeof PATHS;

/** One house of the house-lords reading. */
export interface HouseLord {
  house: number;
  sign: Labelled;
  lord: Labelled;
  in_house: number;
  entry: { text: ReportText };
}

/** One graha of the grahas reading. */
export interface GrahaReading {
  graha: Labelled;
  sign: Labelled;
  house: number;
  in_sign: { text: ReportText };
  in_house: { text: ReportText };
}

/** One yoga of the yogas reading. */
export interface YogaReading {
  code: string;
  /** The yoga's name, keyed by language (API 0.10.1). */
  name?: ReportText;
  category: string;
  participants: Labelled[];
  entry: { text: ReportText };
}

/** One mahadasha; its `antardashas` are in the answer and not drawn. */
export interface DashaPeriod {
  lord: Labelled;
  from: string;
  to: string;
  current: boolean;
  level: string;
  text: ReportText;
}

/** One period of the varshphal year (mudda dasha). */
export interface YearPeriod {
  lord: Labelled;
  from: string;
  to: string;
  level: string;
}

/** `data` of the report routes, as far as this element reads it. */
export interface ReadingDocument {
  lagna?: { sign: Labelled; entry: { text: ReportText } };
  nakshatra?: { nakshatra: Labelled; entry: { text: ReportText } };
  house_lords?: HouseLord[];
  grahas?: GrahaReading[];
  yogas?: YogaReading[];
  /** Vimshottari: the mahadashas. */
  periods?: DashaPeriod[];
  /** Varshphal. */
  year?: number;
  from?: string;
  to?: string;
  months?: YearPeriod[];
  /** Varshphal and life areas; the life areas' summary has no level. */
  summary?: Summary;
  areas?: Summary[];
  /** `type="kundli"`: the parts, in order, and each part's own answer. */
  parts?: Part[];
  vimshottari?: ReadingDocument;
  varshphal?: ReadingDocument;
  life_areas?: ReadingDocument;
  disclaimer?: ReportText;
}

/** @see KjElement */
export class KjReading extends KjElement {
  static readonly tag = 'kj-reading';

  static readonly observedAttributes = [
    'type',
    'sign',
    'nakshatra',
    'year',
    'parts',
    'datetime',
    'timezone',
    'lat',
    'lon',
    'city',
    'place',
    'disclaimer',
    'disclaimer-name',
    'disclaimer-url',
    'lang',
    'powered-by',
  ];

  /**
   * Whether this element is drawing its own picker. Decided once, on the
   * first connect with nothing to read: a reader's pick sets the attribute
   * the picker then keeps showing, so it must not disappear on the pick.
   */
  private picking = false;

  private listening = false;

  /** The zone the answer's instants are read in: `meta.timezone`. */
  private zone: AnswerZone | null = null;

  override connectedCallback(): void {
    if (!this.listening) {
      this.listening = true;
      this.root.addEventListener('change', (event) => {
        const select = event.target as HTMLSelectElement | null;
        if (select?.dataset.pick) this.setAttribute(this.kind, select.value);
      });
    }
    if (!this.personal && !this.chosen && !this.birth) this.picking = true;
    super.connectedCallback();
  }

  /** `lagna` unless the page named another type: `house-lords`, `life areas` and `life_areas` alike. */
  private get type(): ReadingType {
    const raw =
      this.getAttribute('type')
        ?.trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_') ?? '';
    return raw in PATHS ? (raw as ReadingType) : 'lagna';
  }

  /** A report about one birth, with no picker: all but the lagna and the nakshatra. */
  private get personal(): boolean {
    return this.type !== 'lagna' && this.type !== 'nakshatra';
  }

  /**
   * The `year` attribute, when it is a four-digit year. Which years are
   * answered is the API's to say (its supported range).
   */
  private get givenYear(): number | null {
    const raw = this.getAttribute('year') ?? '';
    return /^\d{4}$/.test(raw) ? Number(raw) : null;
  }

  /**
   * The varshphal's year: `year`, or the one running now — this year from
   * the birthday on, the year before until then, never before the birth.
   */
  private get year(): number {
    const given = this.givenYear;
    if (given) return given;
    const now = new Date();
    const born = this.birth?.datetime ?? '';
    const monthDay = born.slice(5, 10);
    const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const year = now.getFullYear() - (monthDay && today < monthDay ? 1 : 0);
    return Math.max(year, Number(born.slice(0, 4)) || year);
  }

  /** `parts` for `type="kundli"`: the known ones named, in the API's order; none means all eight. */
  private get parts(): Part[] {
    const asked = (this.getAttribute('parts') ?? '')
      .toLowerCase()
      .replace(/-/g, '_')
      .split(/[\s,]+/);
    return PARTS.filter((part) => asked.includes(part));
  }

  /** The attribute a preset id lives in: `sign` for a lagna. */
  private get kind(): 'sign' | 'nakshatra' {
    return this.type === 'nakshatra' ? 'nakshatra' : 'sign';
  }

  private get table() {
    return this.type === 'lagna' ? SIGNS : NAKSHATRAS;
  }

  /** The preset or picked id, when it is one the API knows; never for a personal report. */
  private get chosen(): string | null {
    if (this.personal) return null;
    return known(this.table, this.getAttribute(this.kind));
  }

  /** The birth in the attributes, as `<kj-chart>` reads it. */
  get birth(): KjBirth | null {
    return readBirth(this);
  }

  /** Set the birth in one go; the base coalesces the changes into one load. */
  set birth(value: KjBirth | null) {
    writeBirth(this, value);
  }

  /**
   * Nothing to read: the picker is the ready state, with no `kj-ready`. The
   * personal reports have no picker, so they load anyway and say what is
   * missing.
   */
  protected override load(): Promise<void> {
    if (this.personal || this.chosen || this.birth) return super.load();
    this.data = null;
    this.state = 'ready';
    this.paint();
    return Promise.resolve();
  }

  protected override async fetchData(): Promise<ReadingDocument> {
    const path = PATHS[this.type];
    if (this.personal && !this.birth) {
      throw new KjError('no_birth', `No birth on <kj-reading type="${this.type}">`);
    }
    // A picked id wins over a birth: the reader asked for it just now.
    const chosen = this.chosen;
    const body: Record<string, unknown> = {
      ...(chosen ? { [this.kind]: chosen } : { birth: this.birth }),
      options: reportOptions(this),
    };
    if (this.type === 'varshphal') body.year = this.year;
    // The kundli report works out the running year itself when none is given.
    if (this.type === 'kundli') {
      // Always by name: the API's default grew to ten parts (engine 0.17.0),
      // two of which this widget does not draw, and a part not drawn must
      // not be billed.
      const parts = this.parts;
      body.parts = parts.length ? parts : [...PARTS];
      const year = this.givenYear;
      if (year) body.year = year;
    }
    const answer = await memo(cacheKey(path, body), () => request<ReadingDocument>(path, body));
    this.zone = (answer.meta as { timezone?: AnswerZone } | null)?.timezone ?? null;
    return answer.data;
  }

  /** What each type is called in the card's header. */
  private get titleKey(): MessageKey {
    const type = this.type;
    if (type === 'kundli') return 'title_kundli';
    if (type === 'varshphal') return 'title_reading';
    return type as MessageKey;
  }

  protected override heading(): { title: string; subtitle?: string } {
    const birth = this.birth;
    const lang = this.activeLang;
    const subtitle = birth
      ? [`${dateLabel(birth.datetime, lang)}, ${clock(birth.datetime, lang)}`, birth.place ?? '']
          .filter(Boolean)
          .join(' · ')
      : undefined;
    return { title: this.t(this.titleKey), subtitle };
  }

  protected override footerNote(): string {
    const doc = this.data as ReadingDocument | null;
    return disclaimerHtml(doc?.disclaimer, this.activeLang);
  }

  /** The picker stays while a reading loads. */
  protected override loadingHtml(): string {
    const skeleton = skeletonHtml('lines', this.t('loading'));
    return this.picking ? this.pickerHtml(this.activeLang) + skeleton : skeleton;
  }

  protected override render(): string {
    const lang = this.activeLang;
    const doc = this.data as ReadingDocument | null;
    if (this.personal) {
      const type = this.type;
      return type === 'kundli' ? this.kundliHtml(doc, lang) : this.partHtml(type, doc, lang);
    }
    const body = doc ? this.signHtml(this.type as 'lagna' | 'nakshatra', doc, lang) : '';
    return html`${trusted(this.picking ? this.pickerHtml(lang) : '')} ${trusted(body)}`;
  }

  /** One report's body, without the card or the disclaimer. */
  private partHtml(type: ReadingType, doc: ReadingDocument | null, lang: Lang): string {
    if (type === 'lagna' || type === 'nakshatra') return doc ? this.signHtml(type, doc, lang) : '';
    if (type === 'house_lords') return this.houseLordsHtml(doc, lang);
    if (type === 'grahas') return this.grahasHtml(doc, lang);
    if (type === 'yogas') return this.yogasHtml(doc, lang);
    if (type === 'vimshottari') return this.dashasHtml(doc, lang);
    if (type === 'varshphal') return this.yearHtml(doc, lang);
    return summaryHtml(doc?.summary, lang) + areasHtml(doc?.areas, lang);
  }

  /**
   * `type="kundli"`: each part the answer lists, in its order, drawn by that
   * part's own renderer under its name; the one disclaimer follows.
   */
  private kundliHtml(doc: ReadingDocument | null, lang: Lang): string {
    return (doc?.parts ?? [])
      .map((part) => {
        // A list part answers the list itself; the others their own document.
        const value = (doc as Record<string, unknown>)[part];
        const own = (Array.isArray(value) ? { [part]: value } : value) as ReadingDocument;
        const titled = part !== 'lagna' && part !== 'nakshatra' && part !== 'varshphal';
        return html`<section class="kj-part" part="section section-${part}">
          ${trusted(titled ? html`<h3 class="kj-reading-title" part="section-heading">${t(lang, part as MessageKey)}</h3>` : '')}
          ${trusted(this.partHtml(part, part === 'lagna' || part === 'nakshatra' ? doc : own, lang))}
        </section>`;
      })
      .join('');
  }

  /** "Lagna · Leo" or "Nakshatra · Rohini", and the reading. */
  private signHtml(type: 'lagna' | 'nakshatra', doc: ReadingDocument, lang: Lang): string {
    const reading = type === 'lagna' ? doc.lagna : doc.nakshatra;
    if (!reading) return '';
    const named = type === 'lagna' ? doc.lagna?.sign : doc.nakshatra?.nakshatra;
    const name = labelled(named, type === 'lagna' ? SIGNS : NAKSHATRAS, lang);
    return html`<div class="kj-reading-head" part="heading">
        <p class="kj-reading-title">
          ${t(lang, type)} ·
          ${trusted(type === 'lagna' ? signHtml(named?.id, name, 'm') : html`${name}`)}
        </p>
      </div>
      <div class="kj-prose">${trusted(paragraphs(textOf(reading.entry?.text, lang)))}</div>`;
  }

  /** A list of report items, `<ol>` with the type's name as its label. */
  private listHtml(label: string, items: string[]): string {
    return html`<ol class="kj-items kj-house-lords" part="list" aria-label="${label}">
      ${trusted(items.join(''))}
    </ol>`;
  }

  /** One item: a heading and one or more paragraphs. */
  private itemHtml(
    part: string,
    heading: string,
    texts: string[],
    extra = '',
    current = false,
  ): string {
    return html`<li class="kj-item kj-house-lord${current ? ' kj-current' : ''}" part="${part}">
      <p class="kj-item-head" part="heading">${heading} ${trusted(extra)}</p>
      ${trusted(texts.map((text) => html`<p part="text">${text}</p>`).join(''))}
    </li>`;
  }

  /** "1st house · Gemini · lord Mercury in the 9th", and the reading. */
  private houseLordsHtml(doc: ReadingDocument | null, lang: Lang): string {
    const items = (doc?.house_lords ?? []).map((lord) =>
      this.itemHtml(
        'house',
        t(lang, 'house_lord_heading', {
          house: houseOrdinal(lord.house, lang),
          sign: labelled(lord.sign, SIGNS, lang),
          lord: labelled(lord.lord, GRAHAS, lang),
          in: houseOrdinal(lord.in_house, lang),
        }),
        [textOf(lord.entry?.text, lang)],
      ),
    );
    return this.listHtml(t(lang, 'house_lords'), items);
  }

  /** "Sun · Aries · 10th house", the sign's reading and the house's. */
  private grahasHtml(doc: ReadingDocument | null, lang: Lang): string {
    const items = (doc?.grahas ?? []).map((graha) =>
      this.itemHtml(
        `graha graha-${graha.graha?.id ?? ''}`,
        t(lang, 'graha_heading', {
          graha: labelled(graha.graha, GRAHAS, lang),
          sign: labelled(graha.sign, SIGNS, lang),
          house: houseOrdinal(graha.house, lang),
        }),
        [textOf(graha.in_sign?.text, lang), textOf(graha.in_house?.text, lang)],
      ),
    );
    return this.listHtml(t(lang, 'grahas'), items);
  }

  /** Each yoga's name, the grahas that make it, and the text; or a line saying none form. */
  private yogasHtml(doc: ReadingDocument | null, lang: Lang): string {
    const yogas = doc?.yogas ?? [];
    if (doc && !yogas.length) return html`<p part="text">${t(lang, 'no_yogas')}</p>`;
    const items = yogas.map((yoga) => {
      const who = (yoga.participants ?? []).map((graha) => labelled(graha, GRAHAS, lang));
      const extra = who.length
        ? html`<span class="kj-muted" part="participants">${who.join(', ')}</span>`
        : '';
      return this.itemHtml(
        `yoga yoga-${yoga.code}`,
        textOf(yoga.name, lang) || yoga.code.replace(/_/g, ' '),
        [textOf(yoga.entry?.text, lang)],
        extra,
      );
    });
    return this.listHtml(t(lang, 'yogas'), items);
  }

  /** Each mahadasha: its name and dates, its level, its text; the running one marked. */
  private dashasHtml(doc: ReadingDocument | null, lang: Lang): string {
    const items = (doc?.periods ?? []).map((period) => {
      const current = period.current ? badgeHtml(t(lang, 'current'), 'current') : '';
      return this.itemHtml(
        `dasha dasha-${period.lord?.id ?? ''}${period.current ? ' dasha-current' : ''}`,
        t(lang, 'mahadasha', { lord: labelled(period.lord, GRAHAS, lang) }),
        [textOf(period.text, lang)],
        html`${trusted(levelHtml(period.level, lang))} ${trusted(current)}
          <span class="kj-muted" part="when">
            ${rangeText(period.from, period.to, this.zone, lang)}
          </span>`,
        period.current,
      );
    });
    return this.listHtml(t(lang, 'vimshottari'), items);
  }

  /** The year: its dates, the summary, seven areas, and its periods as a row of chips. */
  private yearHtml(doc: ReadingDocument | null, lang: Lang): string {
    if (!doc) return '';
    const months = (doc.months ?? [])
      .map(
        (month) =>
          html`<li class="kj-chip kj-level-${month.level}" part="month">
            <strong>${labelled(month.lord, GRAHAS, lang)}</strong>
            <span class="kj-time">${rangeText(month.from, month.to, this.zone, lang)}</span>
          </li>`,
      )
      .join('');
    return html`<div class="kj-reading-head" part="heading">
        <p class="kj-reading-title">
          ${t(lang, 'varshphal', { year: String(doc.year ?? this.year) })}
        </p>
        <span class="kj-muted" part="span">${rangeText(doc.from, doc.to, this.zone, lang)}</span>
      </div>
      ${trusted(summaryHtml(doc.summary, lang))} ${trusted(areasHtml(doc.areas, lang))}
      ${trusted(
        months
          ? html`<h3 class="kj-h3 kj-section" part="months-heading">${t(lang, 'months')}</h3>
              <ul class="kj-chips" part="months">
                ${trusted(months)}
              </ul>`
          : '',
      )}`;
  }

  /** A `<select>` of the twelve signs or the twenty-seven nakshatras. */
  private pickerHtml(lang: Lang): string {
    const prompt = t(lang, this.type === 'lagna' ? 'choose_sign' : 'choose_nakshatra');
    const options = this.table
      .map(([id]) => html`<option value="${id}">${tableName(this.table, id, lang)}</option>`)
      .join('');
    return html`<div class="kj-form kj-section" part="picker">
      <div class="kj-field">
        <label class="kj-label" for="kj-pick">${prompt}</label>
        <select class="kj-select" id="kj-pick" data-pick="${this.kind}">
          <option value="" disabled>—</option>
          ${trusted(options)}
        </select>
      </div>
    </div>`;
  }

  /** The choice goes back into a freshly painted picker as a value, not markup. */
  protected override paint(): void {
    super.paint();
    const select = this.root.querySelector<HTMLSelectElement>('[data-pick]');
    if (select) select.value = this.chosen ?? '';
  }
}

/** Report text as paragraphs: the API separates them with a blank line. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => html`<p part="text">${paragraph}</p>`)
    .join('');
}
