"use server";

/**
 * The journal's own changes of a barber's days, from the menu behind his
 * head (journal-hours.tsx): «Добавить рабочие дни», «Убрать рабочие дни»
 * and «Изменить время для онлайн-записи». Each checks the login itself and
 * copies its arguments by name; the journal is refreshed when something
 * was written. One day's hours and «Добавить сотрудника в расписание» are
 * the schedule's own cells (schedule/actions.ts, saveCellsAction).
 *
 * Rights (src/lib/auth/rights.ts): «Редактирование графика работы» and the
 * barber's column, asked in src/lib/admin/schedule.ts and journal-online.ts,
 * which are handed the login.
 */
import { refresh } from "next/cache";
import { MARK_DAYS_MAX } from "@/lib/admin/journal";
import { saveOnlineHours, type OnlineSaved } from "@/lib/admin/journal-online";
import { markDays, type Applied, type Span } from "@/lib/admin/schedule";
import { requireAdmin } from "@/lib/auth/current";

const str = (v: unknown) => (v == null ? "" : String(v));
/** Spans as they were typed: pairs of times; what each may be is checked where it is read. */
const spans = (v: unknown): Span[] => (Array.isArray(v) ? v.slice(0, 20).map((b) => (Array.isArray(b) ? [str(b[0]), str(b[1])] : ["", ""]) as Span) : []);

/** «Добавить рабочие дни» (kind "work", with the hours) or «Убрать рабочие дни» (kind "off"): one barber's picked days. */
export async function markDaysAction(input: { staffId: string; dates: string[]; kind: string; from?: string; to?: string; breaks?: Span[] }): Promise<Applied> {
  const { user, business } = await requireAdmin();
  const r = await markDays(business, user, {
    staffId: str(input?.staffId),
    // one more than may be marked, so too many is refused rather than cut
    dates: Array.isArray(input?.dates) ? input.dates.slice(0, MARK_DAYS_MAX + 1).map(str) : [],
    kind: str(input?.kind),
    from: str(input?.from),
    to: str(input?.to),
    breaks: spans(input?.breaks),
  });
  if (r.ok && r.written > 0) refresh();
  return r;
}

/** «Изменить время для онлайн-записи»: the hours clients may book him online that day; none: all his working hours. */
export async function onlineHoursAction(input: { staffId: string; date: string; spans: Span[] }): Promise<OnlineSaved> {
  const { user, business } = await requireAdmin();
  // (no list at all is refused there, never read as «all his hours»)
  const list = Array.isArray(input?.spans) ? spans(input.spans) : (null as unknown as Span[]);
  const r = await saveOnlineHours(business, user, { staffId: str(input?.staffId), date: str(input?.date), spans: list });
  if (r.ok) refresh();
  return r;
}
