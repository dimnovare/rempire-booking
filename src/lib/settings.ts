/**
 * Business settings: businesses.settings (jsonb) over these defaults.
 * Renat's open answers are switches here, not code (docs/phase-a.md).
 */
import { isBasis, type Basis } from "./money";
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
  /**
   * A barber's own changes from his app (Phase B, B4; Renat Q2): «now»
   * applies at once, «ask» waits for Renat in the admin's «Запросы».
   * time: breaks, days off, special time, weekly hours. price: his price
   * or time for a service. Until Renat answers: time now, prices ask.
   */
  barber_self_time: SelfMode;
  barber_self_price: SelfMode;
  /**
   * Phase C (docs/phase-c.md). The barber's share of a client sale, in
   * basis points (1700 = 17 %), and what it is taken from (Renat Q1; until
   * he answers, Dim's pick: the price paid without VAT). The day of the
   * month the drafts for the month before are made.
   */
  commission_bp: number;
  commission_basis: Basis;
  billing_day: number;
  /**
   * The reminder before a visit (docs/apps.md, step 4): by SMS, by a
   * notification on the client's phone, or both.
   *   sms   SMS only; clients are not offered the notification.
   *   push  the notification for a client who turned it on, and no SMS for
   *         him; everyone else still gets the SMS.
   *   both  the SMS as before, and the notification as well for a client
   *         who turned it on.
   * Until Dim and Renat choose: both, so nobody loses the SMS.
   */
  client_reminder: ReminderChannel;
};

export type ReminderChannel = "sms" | "push" | "both";
export const REMINDER_CHANNELS = ["sms", "push", "both"] as const;
export const isReminderChannel = (v: unknown): v is ReminderChannel => v === "sms" || v === "push" || v === "both";

export type SelfMode = "now" | "ask";
export const SELF_KEYS = ["barber_self_time", "barber_self_price"] as const;
export type SelfKey = (typeof SELF_KEYS)[number];
const isSelfMode = (v: unknown): v is SelfMode => v === "now" || v === "ask";

export const DEFAULT_SETTINGS: BusinessSettings = {
  slot_step_min: 15,
  horizon_days: 60,
  min_notice_min: 30,
  cancel_cutoff_min: 24 * 60,
  reminder_min: 120,
  barber_self_time: "now",
  barber_self_price: "ask",
  commission_bp: 1700,
  commission_basis: "net-paid",
  billing_day: 1,
  client_reminder: "both",
};

const LIMITS: Record<Exclude<keyof BusinessSettings, SelfKey | "commission_basis" | "client_reminder">, [number, number]> = {
  slot_step_min: [5, 120],
  horizon_days: [1, 366],
  min_notice_min: [0, 7 * 24 * 60],
  cancel_cutoff_min: [0, 7 * 24 * 60],
  reminder_min: [15, 48 * 60],
  commission_bp: [0, 5000],
  billing_day: [1, 28],
};

/** Defaults, overridden by every valid whole number in `raw`. */
export function readSettings(raw: unknown): BusinessSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v = (raw as Record<string, unknown>)[key];
    const [min, max] = LIMITS[key];
    if (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max) out[key] = v;
  }
  for (const key of SELF_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (isSelfMode(v)) out[key] = v;
  }
  const basis = (raw as Record<string, unknown>).commission_basis;
  if (isBasis(basis)) out.commission_basis = basis;
  const reminder = (raw as Record<string, unknown>).client_reminder;
  if (isReminderChannel(reminder)) out.client_reminder = reminder;
  return out;
}
