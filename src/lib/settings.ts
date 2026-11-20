/**
 * Business settings: businesses.settings (jsonb) over these defaults.
 * Renat's open answers are switches here, not code (docs/phase-a.md).
 */
import { isBasis, type Basis } from "./money";
export type BusinessSettings = {
  /** Start times are on this grid, counted from the start of the barber's day, plus a start where a visit ends (Altegio's «Оптимальный», src/lib/slots.ts). Dim, 20.11.2026: 30, as in Altegio. */
  slot_step_min: number;
  /** How far ahead a client can book. */
  horizon_days: number;
  /** The earliest a client can book from now. 0 = any start still ahead (Dim, 20.11.2026: none, as in Altegio). */
  min_notice_min: number;
  /** A client can change or cancel online until this long before. 0 = at any time before the visit (Renat, 19.11.2026: as in Altegio). */
  cancel_cutoff_min: number;
  /** The SMS reminder goes this long before the visit. */
  reminder_min: number;
  /** The e-mail reminder goes this long before the visit (Altegio's type 1: 12 hours; src/lib/outbox.ts). */
  reminder_email_min: number;
  /**
   * Altegio's «on / off» per type (docs/altegio-pages.md, «Уведомления, per
   * type») for the client messages added 20.11.2026 (Dim: «All three now,
   * as Altegio does»). Each is on until switched off; src/lib/outbox.ts
   * plans none of a type that is off and drops one queued before.
   *   email_reminder_on  the reminder by e-mail, reminder_email_min before;
   *   birthday_on        the greeting at 10:00 on the client's birthday;
   *   no_show_on         «Приглашение недошедших», when a visit is marked
   *                      «Не пришёл».
   */
  email_reminder_on: boolean;
  birthday_on: boolean;
  no_show_on: boolean;
  /*
   * Not here any more: barber_self_time and barber_self_price, the two
   * salon-wide switches for a barber's own changes. Since 19.11.2026 each
   * login has its own rights («Доступ» → the login), started from those
   * two as they stood. The keys stay in businesses.settings and are read
   * once, by the backfill alone (src/lib/auth/rights-store.ts).
   */
  /**
   * Phase C (docs/phase-c.md). The barber's share of a client sale, in
   * basis points (1700 = 17 %), and what it is taken from: Renat, 18.11,
   * the regular price with VAT, even after a discount («gross-list»). The
   * day of the month the drafts for the month before are made.
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

/** The client messages' on / off switches (above). */
export const MESSAGE_SWITCHES = ["email_reminder_on", "birthday_on", "no_show_on"] as const;
export type MessageSwitch = (typeof MESSAGE_SWITCHES)[number];

export type ReminderChannel = "sms" | "push" | "both";
export const REMINDER_CHANNELS = ["sms", "push", "both"] as const;
export const isReminderChannel = (v: unknown): v is ReminderChannel => v === "sms" || v === "push" || v === "both";

export const DEFAULT_SETTINGS: BusinessSettings = {
  slot_step_min: 30,
  horizon_days: 60,
  min_notice_min: 0,
  cancel_cutoff_min: 0,
  reminder_min: 120,
  reminder_email_min: 720,
  email_reminder_on: true,
  birthday_on: true,
  no_show_on: true,
  commission_bp: 1700,
  commission_basis: "gross-list",
  billing_day: 1,
  client_reminder: "both",
};

const LIMITS: Record<Exclude<keyof BusinessSettings, "commission_basis" | "client_reminder" | MessageSwitch>, [number, number]> = {
  slot_step_min: [5, 120],
  horizon_days: [1, 366],
  min_notice_min: [0, 7 * 24 * 60],
  cancel_cutoff_min: [0, 7 * 24 * 60],
  reminder_min: [15, 48 * 60],
  reminder_email_min: [15, 48 * 60],
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
  const basis = (raw as Record<string, unknown>).commission_basis;
  if (isBasis(basis)) out.commission_basis = basis;
  const reminder = (raw as Record<string, unknown>).client_reminder;
  if (isReminderChannel(reminder)) out.client_reminder = reminder;
  for (const key of MESSAGE_SWITCHES) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}
