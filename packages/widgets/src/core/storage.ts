/**
 * "Remember the last entry on this device" for the birth forms.
 *
 * `localStorage`, and nothing else: the entry never leaves the visitor's
 * browser, and a widget has no server of its own to send it to anyway. Every
 * access is wrapped, because storage throws in a private window, with site
 * data blocked, in some embedded web views and when it is full — and a form
 * that failed to open because it could not read a convenience would be the
 * worst possible trade.
 *
 * Opt out per element with `remember="off"`, per page with
 * `data-remember="off"` on the script, or `configure({ remember: false })`.
 * An opted-out form also forgets what an earlier visit stored.
 */

/** One key per form and side, versioned so a later shape can ignore this one. */
const PREFIX = 'kj:birth:v2:';

/** Stored values are strings only; anything else is dropped on the way in. */
export type Remembered = Record<string, string>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** What was stored under `slot`, or `null` — never throws. */
export function recall(slot: string): Remembered | null {
  try {
    const raw = storage()?.getItem(PREFIX + slot);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Remembered = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.length <= 200) out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

/** Store `values` under `slot`; a failure is silent. */
export function remember(slot: string, values: Remembered): void {
  try {
    storage()?.setItem(PREFIX + slot, JSON.stringify(values));
  } catch {
    // Full, blocked or private: the form works the same without it.
  }
}

/** Drop `slot`; a failure is silent. */
export function forget(slot: string): void {
  try {
    storage()?.removeItem(PREFIX + slot);
  } catch {
    // Nothing to do.
  }
}
