/**
 * The birth fields both forms draw (design system, "The birth form"): an
 * optional name and gender, the date as day / month / year, the time as
 * hour / minute (and AM/PM, unless `time-format="24"`), and one type-ahead
 * place search as the primary place field — the resolved place, its
 * coordinates and its zone shown under it once picked, and still editable
 * behind "Edit coordinates".
 *
 * Selects, not `<input type="date">` / `type="time"`: the native pickers
 * differ on every phone and browser (a year wheel that starts at today, a
 * 24-hour clock where the visitor thinks in AM/PM), and a birth is a date
 * decades back that the visitor already knows digit by digit.
 *
 * `<kj-kundli-form>` draws one set; `<kj-match-form>` draws two, one per
 * fieldset. Every function takes a *scope* (the shadow root, or one
 * fieldset) rather than an element, so the same `data-field` names can appear
 * twice in one shadow root without the two sets reading each other's inputs.
 */

import { html, trusted } from '../core/html.ts';
import type { TimeFormat } from '../core/config.ts';
import { pick, t, type Lang, type MessageKey } from '../core/i18n.ts';
import { MONTHS_LONG, clock, dateLabel } from '../core/format.ts';
import { findPlace, resolvePlace } from '../core/places.ts';
import type { KjBirth } from './chart.ts';

/** What a form knows about what a visitor has typed into one set. */
export interface BirthValues {
  name: string;
  gender: string;
  day: string;
  month: string;
  year: string;
  /** As in the select: `1`–`12` with {@link ampm}, or `0`–`23`. */
  hour: string;
  minute: string;
  /** `am` / `pm` in the 12-hour form. */
  ampm: string;
  /** What is in the place search box. */
  q: string;
  lat: string;
  lon: string;
  /** The picked place's zone: `/v1/places` gives one, Google and Photon do not. */
  tz: string;
  /** The picked place's name, for the request's `place` label. */
  label: string;
}

/** The fields a set reads and writes, in markup order. */
export const FIELDS = [
  'name',
  'gender',
  'day',
  'month',
  'year',
  'hour',
  'minute',
  'ampm',
  'q',
  'lat',
  'lon',
  'tz',
  'label',
] as const;

/** Which field group a validation message belongs to. */
export type BirthError = 'date' | 'time' | 'place';

/** A set with nothing typed and no place chosen yet. */
export function emptyBirthValues(): BirthValues {
  return {
    name: '',
    gender: '',
    day: '',
    month: '',
    year: '',
    hour: '',
    minute: '',
    ampm: '',
    q: '',
    lat: '',
    lon: '',
    tz: '',
    label: '',
  };
}

/** The earliest year the year select offers. */
const FIRST_YEAR = 1900;

function options(values: readonly (readonly [string, string])[], placeholder: string): string {
  return (
    html`<option value="">${placeholder}</option>` +
    values.map(([value, label]) => html`<option value="${value}">${label}</option>`).join('')
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One set of fields, as markup.
 *
 * `prefix` makes the element ids (and so the `for` of each label) unique in a
 * shadow root that has two sets.
 */
export function birthFieldsHtml(
  prefix: string,
  lang: Lang,
  format: TimeFormat,
  compact = false,
): string {
  const label = (key: MessageKey) => t(lang, key);
  const optional = html`<span class="kj-opt">(${label('optional')})</span>`;
  const thisYear = new Date().getFullYear();

  const days = Array.from({ length: 31 }, (_, i) => [String(i + 1), String(i + 1)] as const);
  const months = MONTHS_LONG[lang].map((name, i) => [String(i + 1), name] as const);
  const years = Array.from(
    { length: thisYear - FIRST_YEAR + 1 },
    (_, i) => [String(thisYear - i), String(thisYear - i)] as const,
  );
  const hours =
    format === '24'
      ? Array.from({ length: 24 }, (_, i) => [String(i), pad(i)] as const)
      : Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1)] as const);
  const minutes = Array.from({ length: 60 }, (_, i) => [String(i), pad(i)] as const);

  const ampm =
    format === '24'
      ? ''
      : html`<select
          class="kj-select"
          id="${prefix}-ampm"
          data-field="ampm"
          aria-label="${label('am')}/${label('pm')}"
        >
          ${trusted(
            options(
              [
                ['am', label('am')],
                ['pm', label('pm')],
              ],
              `${label('am')}/${label('pm')}`,
            ),
          )}
        </select>`;

  return html`<div class="kj-field">
      <label class="kj-label" for="${prefix}-name">${label('name')} ${trusted(optional)}</label>
      <input
        class="kj-input"
        id="${prefix}-name"
        data-field="name"
        type="text"
        maxlength="60"
        autocomplete="name"
      />
    </div>
    ${trusted(
      compact
        ? ''
        : html`<div class="kj-field">
            <label class="kj-label" for="${prefix}-gender"
              >${label('gender')} ${trusted(optional)}</label
            >
            <select class="kj-select" id="${prefix}-gender" data-field="gender">
              ${trusted(
                options(
                  [
                    ['male', label('gender_male')],
                    ['female', label('gender_female')],
                  ],
                  '—',
                ),
              )}
            </select>
          </div>`,
    )}
    <fieldset class="kj-field kj-span" data-group="date">
      <legend>${label('date_of_birth')}</legend>
      <div class="kj-trio">
        <select class="kj-select" id="${prefix}-day" data-field="day" aria-label="${label('day')}">
          ${trusted(options(days, label('day')))}
        </select>
        <select
          class="kj-select"
          id="${prefix}-month"
          data-field="month"
          aria-label="${label('month')}"
        >
          ${trusted(options(months, label('month')))}
        </select>
        <select
          class="kj-select"
          id="${prefix}-year"
          data-field="year"
          aria-label="${label('year')}"
        >
          ${trusted(options(years, label('year')))}
        </select>
      </div>
      <p class="kj-field-error" id="${prefix}-date-error" data-error="date" hidden></p>
    </fieldset>
    <fieldset class="kj-field kj-span" data-group="time">
      <legend>${label('time_of_birth')}</legend>
      <div class="${format === '24' ? 'kj-duo' : 'kj-trio'}">
        <select
          class="kj-select"
          id="${prefix}-hour"
          data-field="hour"
          aria-label="${label('hour')}"
        >
          ${trusted(options(hours, label('hour')))}
        </select>
        <select
          class="kj-select"
          id="${prefix}-minute"
          data-field="minute"
          aria-label="${label('minute')}"
        >
          ${trusted(options(minutes, label('minute')))}
        </select>
        ${trusted(ampm)}
      </div>
      <p class="kj-field-error" id="${prefix}-time-error" data-error="time" hidden></p>
    </fieldset>
    <div class="kj-field kj-span" data-coords data-group="place">
      <label class="kj-label" for="${prefix}-q">${label('birth_place')}</label>
      <div class="kj-search">
        <input
          class="kj-input"
          id="${prefix}-q"
          data-field="q"
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-expanded="false"
          aria-controls="${prefix}-list"
          aria-describedby="${prefix}-resolved"
          placeholder="${label('place_hint')}"
        />
        <ul id="${prefix}-list" class="kj-suggest" role="listbox" data-suggest hidden></ul>
      </div>
      <p class="kj-resolved" id="${prefix}-resolved" data-resolved hidden></p>
      <details class="kj-coords" data-coords-edit>
        <summary>${label('edit_coords')}</summary>
        <div class="kj-coords-grid">
          <div class="kj-field">
            <label class="kj-label" for="${prefix}-lat">${label('latitude')}</label>
            <input
              class="kj-input"
              id="${prefix}-lat"
              data-field="lat"
              type="number"
              inputmode="decimal"
              step="any"
              min="-90"
              max="90"
            />
          </div>
          <div class="kj-field">
            <label class="kj-label" for="${prefix}-lon">${label('longitude')}</label>
            <input
              class="kj-input"
              id="${prefix}-lon"
              data-field="lon"
              type="number"
              inputmode="decimal"
              step="any"
              min="-180"
              max="180"
            />
          </div>
          <div class="kj-field kj-span">
            <label class="kj-label" for="${prefix}-tz"
              >${label('timezone')} ${trusted(optional)}</label
            >
            <input
              class="kj-input"
              id="${prefix}-tz"
              data-field="tz"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Asia/Kolkata"
            />
          </div>
        </div>
      </details>
      <input type="hidden" data-field="label" />
      <p class="kj-field-error" id="${prefix}-place-error" data-error="place" hidden></p>
    </div>`;
}

/** The fields in `scope` into `values`; the DOM is the truth between repaints. */
export function readBirthValues(scope: ParentNode, values: BirthValues): void {
  for (const field of FIELDS) {
    const input = scope.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-field="${field}"]`,
    );
    if (input) values[field] = input.value;
  }
}

/** `values` back into a freshly painted set, and the resolved-place line. */
export function applyBirthValues(scope: ParentNode, values: BirthValues, lang: Lang): void {
  for (const field of FIELDS) {
    const input = scope.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-field="${field}"]`,
    );
    if (input) input.value = values[field];
  }
  showResolved(scope, values, lang);
}

/** `28.6139° N, 77.2090° E`. */
function coordinatesText(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

/**
 * The line under the search box: the place picked, its coordinates and its
 * zone — or nothing, while there are no usable coordinates.
 */
export function showResolved(scope: ParentNode, values: BirthValues, lang: Lang): void {
  const line = scope.querySelector<HTMLElement>('[data-resolved]');
  if (!line) return;
  const place = resolvePlace({ lat: values.lat, lon: values.lon, timezone: values.tz });
  if (!place) {
    line.hidden = true;
    line.innerHTML = '';
    return;
  }
  const name = values.label || values.q;
  line.innerHTML =
    (name ? html`<strong>${name}</strong>` : '') +
    html`<span class="kj-time">${coordinatesText(place.latitude, place.longitude)}</span>
      <span>${t(lang, 'timezone')}: ${place.timezone || t(lang, 'tz_derived')}</span>`;
  line.hidden = false;
}

/**
 * One birth as a line: `Asha · 14 May 1990, 10:30 · Varanasi`. The name
 * only when one was given; the place's name, else its coordinates.
 */
export function birthSummary(name: string, birth: KjBirth, lang: Lang): string {
  const parts: string[] = [];
  if (name.trim()) parts.push(name.trim());
  parts.push(`${dateLabel(birth.datetime, lang)}, ${clock(birth.datetime, lang)}`);
  parts.push(birth.place || coordinatesText(birth.latitude, birth.longitude));
  return parts.join(' · ');
}

/**
 * The form after a submit (owner review, stage 2): one line per birth and
 * an "Edit details" button that opens the form again. The form itself stays
 * in the DOM, hidden, so what was typed survives.
 */
export function collapsedHtml(lines: readonly string[], lang: Lang): string {
  return html`<div class="kj-collapsed" part="collapsed" tabindex="-1">
    <div class="kj-collapsed-lines">
      ${trusted(lines.map((line) => html`<p part="birth-summary">${line}</p>`).join(''))}
    </div>
    <button
      type="button"
      class="kj-btn kj-btn-quiet kj-btn-small"
      part="edit"
      data-action="edit"
      aria-expanded="false"
    >
      ${t(lang, 'edit_details')}
    </button>
  </div>`;
}

/**
 * Bring the result under a collapsed form into view, and the keyboard focus
 * with it: the submit button the focus was on is hidden now.
 */
export function revealResult(root: ShadowRoot): void {
  const target = root.querySelector<HTMLElement>('.kj-collapsed');
  const result = root.querySelector<HTMLElement>('[data-result]');
  try {
    target?.focus({ preventScroll: true });
  } catch {
    // Old engines take no options; the focus is a nicety.
  }
  try {
    const smooth = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    (target ?? result)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  } catch {
    // Not every engine takes the options object; the result is there anyway.
  }
}

/** Show (or clear) one group's validation message, and mark its fields. */
export function showErrors(scope: ParentNode, errors: ReadonlySet<BirthError>, lang: Lang): void {
  const keys: Record<BirthError, MessageKey> = {
    date: 'err_date',
    time: 'err_time',
    place: 'err_place',
  };
  for (const group of ['date', 'time', 'place'] as const) {
    const message = scope.querySelector<HTMLElement>(`[data-error="${group}"]`);
    const on = errors.has(group);
    if (message) {
      message.hidden = !on;
      message.textContent = on ? t(lang, keys[group]) : '';
    }
    const box = scope.querySelector(`[data-group="${group}"]`);
    box?.querySelectorAll('select, input:not([type="hidden"])').forEach((field) => {
      if (group === 'place' && (field as HTMLElement).dataset.field !== 'q') return;
      if (on) {
        field.setAttribute('aria-invalid', 'true');
        if (message?.id) field.setAttribute('aria-errormessage', message.id);
      } else {
        field.removeAttribute('aria-invalid');
        field.removeAttribute('aria-errormessage');
      }
    });
  }
}

/** A real calendar date, or `null`. Calendar arithmetic only; no zone is involved. */
function isoOf(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (y < FIRST_YEAR || y > 2400 || m < 1 || m > 12 || d < 1) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

/** `HH:MM` out of the time selects, or `null` while it is incomplete. */
export function timeOf(values: BirthValues, format: TimeFormat): string | null {
  if (values.hour === '' || values.minute === '') return null;
  let hour = Number(values.hour);
  const minute = Number(values.minute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  if (format === '12') {
    if (values.ampm !== 'am' && values.ampm !== 'pm') return null;
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (values.ampm === 'pm' ? 12 : 0);
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

/** `HH:MM` back into the selects of `format`. */
export function setTime(values: BirthValues, time: string, format: TimeFormat): void {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return;
  const hour = Number(match[1]);
  values.minute = String(Number(match[2]));
  if (format === '24') {
    values.hour = String(hour);
    values.ampm = '';
  } else {
    values.hour = String(hour % 12 === 0 ? 12 : hour % 12);
    values.ampm = hour < 12 ? 'am' : 'pm';
  }
}

/** What {@link buildBirth} makes of one set. */
export type BuiltBirth =
  { birth: KjBirth; errors?: undefined } | { birth?: undefined; errors: Set<BirthError> };

/**
 * A birth out of one set, or the groups that stop it being one.
 *
 * A `/v1/places` pick (or a bundled city) sends its zone; a Google or Photon
 * pick and typed coordinates send none, so the API derives it from the
 * coordinates and a visitor is not asked for something they do not know
 * (decision 8). A zone typed under "Edit coordinates" is sent as typed and
 * the API checks it.
 */
export function buildBirth(values: BirthValues, format: TimeFormat): BuiltBirth {
  const errors = new Set<BirthError>();
  const date = isoOf(values.day, values.month, values.year);
  if (!date) errors.add('date');
  const time = timeOf(values, format);
  if (!time) errors.add('time');
  const place = resolvePlace({ lat: values.lat, lon: values.lon, timezone: values.tz });
  if (!place) errors.add('place');
  if (errors.size || !date || !time || !place) return { errors };

  const birth: KjBirth = {
    datetime: `${date}T${time}:00`,
    latitude: place.latitude,
    longitude: place.longitude,
  };
  if (place.timezone) birth.timezone = place.timezone;
  // The picked place's name; typed coordinates have dropped it, and are not
  // the place in the search box any more.
  const label = values.label.trim().slice(0, 120);
  if (label) birth.place = label;
  return { birth };
}

/** A bundled city (`city="delhi"`) as a picked place, for an empty set. */
export function presetPlace(values: BirthValues, city: string | null, lang: Lang): void {
  const found = findPlace(city);
  if (!found || values.q || values.lat) return;
  values.q = pick(found.names, found.name, lang);
  values.label = found.name;
  values.lat = String(found.latitude);
  values.lon = String(found.longitude);
  values.tz = found.timezone;
}

/** What is remembered of a set: everything but the raw time selects. */
export function storedValues(values: BirthValues, format: TimeFormat): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of FIELDS) {
    if (field !== 'hour' && field !== 'minute' && field !== 'ampm' && values[field]) {
      out[field] = values[field];
    }
  }
  const time = timeOf(values, format);
  if (time) out.time = time;
  return out;
}

/** A remembered set back into `values`, the time split for `format`. */
export function restoreValues(
  values: BirthValues,
  stored: Record<string, string>,
  format: TimeFormat,
): void {
  for (const field of FIELDS) {
    const value = stored[field];
    if (typeof value === 'string' && field !== 'hour' && field !== 'minute' && field !== 'ampm') {
      values[field] = value;
    }
  }
  if (stored.time) setTime(values, stored.time, format);
}
