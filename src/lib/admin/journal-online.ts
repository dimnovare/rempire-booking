/**
 * «Изменить время для онлайн-записи», the sixth item behind a barber's head
 * in the journal (docs/altegio-pages.md, «Журнал»; Dim, 24.11.2026): for
 * one barber and one day, the hours in which clients may book him online.
 * Stored in staff_online_hours (043); no row is the usual, all his working
 * hours. The client's booking honours it (src/lib/availability.ts →
 * src/lib/slots.ts, onlyOnline); the salon's own bookings do not.
 *
 * The rules that need no database are cleanOnline (journal.ts): at most six
 * spans, in order, none over another, each inside his working day. The day
 * is read here as booking reads it: his dated day, else his weekly hours.
 *
 * Rights (src/lib/auth/rights.ts): as every change of a barber's day from
 * the journal, «Редактирование графика работы» (staff.schedule) and his
 * column among the ones the login sees (journal.staff), asked before
 * anything is read.
 */
import { can, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import { withTx } from "../db";
import { workWindows, type HoursRow } from "../slots";
import { isLocalDate } from "../tz";
import { cleanOnline } from "./journal";
import { localSpans, type Span } from "./schedule-plan";
import { isUuid } from "./visits";

export type OnlineInput = { staffId: string; date: string; spans: Span[] };

export type OnlineSaved =
  | { ok: true; spans: Span[] }
  | { ok: false; code: "forbidden" }
  /** staff, date, spans; «closed»: he does not work that day, so it has no online hours to set */
  | { ok: false; code: "invalid"; field: "staff" | "date" | "spans" | "closed" };

/** A span's end as the table keeps it: 24:00 is 23:59 there, as for a dated day (staff.ts, setDayOverride). */
const stored = (spans: Span[]): Span[] => spans.map(([a, b]) => [a, b === "24:00" ? "23:59" : b]);

/**
 * Set the hours clients may book this barber online on this day, or ([])
 * give him back all his working hours. Locks his row as a booking does, so
 * a booking made at the same moment sees the day before or after, never
 * half of it.
 */
export async function saveOnlineHours(business: Business, by: Holder & { id: string }, input: OnlineInput): Promise<OnlineSaved> {
  const staffId = String(input?.staffId ?? "");
  if (!can(by, "staff.schedule") || !can(by, "journal.staff", { staffId })) return { ok: false, code: "forbidden" };
  if (!isUuid(staffId)) return { ok: false, code: "invalid", field: "staff" };
  const date = String(input?.date ?? "");
  if (!isLocalDate(date)) return { ok: false, code: "invalid", field: "date" };
  if (!Array.isArray(input?.spans)) return { ok: false, code: "invalid", field: "spans" };
  const tz = business.timezone;
  return withTx<OnlineSaved>(async (tx) => {
    const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
    if (!st) return { ok: false, code: "invalid", field: "staff" };
    const [hours, [ov]] = await Promise.all([
      tx<HoursRow>(
        `select weekday, to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends,
                valid_from::text as valid_from, valid_to::text as valid_to
           from staff_hours where staff_id = $1`,
        [staffId],
      ),
      tx<{ intervals: Span[] }>("select intervals from staff_day_overrides where staff_id = $1 and day = $2::date", [staffId, date]),
    ]);
    const work = localSpans(workWindows(date, tz, hours, ov ? ov.intervals : null), date, tz);
    if (input.spans.length && !work.length) return { ok: false, code: "invalid", field: "closed" };
    const spans = cleanOnline(input.spans, work);
    if (!spans) return { ok: false, code: "invalid", field: "spans" };
    if (!spans.length) await tx("delete from staff_online_hours where staff_id = $1 and day = $2::date", [staffId, date]);
    else
      await tx(
        `insert into staff_online_hours (staff_id, day, spans) values ($1, $2::date, $3::jsonb)
         on conflict (staff_id, day) do update set spans = excluded.spans, updated_at = now()`,
        [staffId, date, JSON.stringify(stored(spans))],
      );
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'online_hours', $3::jsonb)`, [by.id, staffId, JSON.stringify({ date, spans })]);
    return { ok: true, spans };
  });
}
