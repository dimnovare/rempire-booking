/**
 * Business settings: businesses.settings (jsonb) over these defaults.
 * Renat's open answers are switches here, not code (docs/phase-a.md).
 */
export type BusinessSettings = {
  /** Start times are on this grid, counted from local midnight. */
  slot_step_min: number;
  /** How far ahead a client can book. */
  horizon_days: number;
  /** The earliest a client can book from now. */
  min_notice_min: number;
  /** A client can change or cancel online until this long before. Q7: 24 h placeholder. */
  cancel_cutoff_min: number;
  /** The SMS reminder goes this long before the visit. */
  reminder_min: number;
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  slot_step_min: 15,
  horizon_days: 60,
  min_notice_min: 30,
  cancel_cutoff_min: 24 * 60,
  reminder_min: 120,
};

const LIMITS: Record<keyof BusinessSettings, [number, number]> = {
  slot_step_min: [5, 120],
  horizon_days: [1, 366],
  min_notice_min: [0, 7 * 24 * 60],
  cancel_cutoff_min: [0, 7 * 24 * 60],
  reminder_min: [15, 48 * 60],
};

/** Defaults, overridden by every valid whole number in `raw`. */
export function readSettings(raw: unknown): BusinessSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(LIMITS) as (keyof BusinessSettings)[]) {
    const v = (raw as Record<string, unknown>)[key];
    const [min, max] = LIMITS[key];
    if (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max) out[key] = v;
  }
  return out;
}
