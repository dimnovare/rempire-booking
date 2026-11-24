/**
 * «Настройки → Онлайн-запись» (Dim, round 15): what the page may set and
 * what its selects offer. No database and no Next.js: the form in the
 * browser offers the same values the server saves with
 * (src/lib/admin/online-settings.ts, which says what each one does).
 */
import { LIMITS, readSettings, type BusinessSettings } from "../settings";

/** The keys of businesses.settings the page changes, in the page's order. */
export const ONLINE_KEYS = ["slot_step_min", "min_notice_min", "horizon_days", "cancel_cutoff_min", "any_staff_on"] as const;
export type OnlineKey = (typeof ONLINE_KEYS)[number];
export type OnlineSettings = Pick<BusinessSettings, OnlineKey>;

/**
 * What the selects offer. A value saved before that is not among them
 * (a step of 25 minutes, say) is offered as well (`withValue`), so opening
 * the page never changes anything by itself.
 */
export const STEP_OPTIONS: readonly number[] = [5, 10, 15, 20, 30, 45, 60, 90, 120];
/** minutes; 0 is «Не выбрано» */
export const NOTICE_OPTIONS: readonly number[] = [0, 15, 30, 60, 120, 180, 240, 360, 720, 1440, 2880];
/**
 * Days ahead, at most HORIZON_MAX: the booking page asks /api/slots for the
 * whole horizon at once, and that answers 92 days at most.
 */
export const HORIZON_MAX = 90;
export const HORIZON_OPTIONS: readonly number[] = [7, 14, 21, 30, 45, 60, 90];
/** minutes, whole hours; 0 is «Без ограничений» */
export const CUTOFF_OPTIONS: readonly number[] = [0, 1, 2, 3, 4, 6, 12, 24, 48, 72].map((h) => h * 60);

/** The options with the saved value among them, in order. */
export const withValue = (list: readonly number[], v: number): number[] => (list.includes(v) ? [...list] : [...list, v].sort((a, b) => a - b));

/** The page's values out of businesses.settings as stored (the defaults where nothing valid is). */
export function onlineOf(raw: unknown): OnlineSettings {
  const s = readSettings(raw);
  return { slot_step_min: s.slot_step_min, min_notice_min: s.min_notice_min, horizon_days: s.horizon_days, cancel_cutoff_min: s.cancel_cutoff_min, any_staff_on: s.any_staff_on };
}

type NumKey = Exclude<OnlineKey, "any_staff_on">;

/**
 * Is `v` a value this key may hold? A whole number in readSettings' limits;
 * the step in fives, the horizon up to HORIZON_MAX, the cut-off in whole
 * hours (the visit page says it in hours); the switch true or false.
 */
export function validOnline(key: OnlineKey, v: unknown): boolean {
  if (key === "any_staff_on") return typeof v === "boolean";
  const [min, max] = LIMITS[key as NumKey];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return false;
  if (key === "slot_step_min") return v % 5 === 0;
  if (key === "horizon_days") return v <= HORIZON_MAX;
  if (key === "cancel_cutoff_min") return v % 60 === 0;
  return true;
}
