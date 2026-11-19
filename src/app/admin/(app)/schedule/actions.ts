"use server";

/**
 * «График работы»: the grid's changes. Each action checks the login itself
 * and copies its arguments by name; the page is refreshed when something
 * was written.
 *
 * Rights (src/lib/auth/rights.ts): every one of them is «Редактирование
 * графика работы», asked in src/lib/admin/schedule.ts, which is handed the
 * login.
 */
import { refresh } from "next/cache";
import { copySchedule, fillTemplate, saveDays, type Applied, type Span } from "@/lib/admin/schedule";
import { requireAdmin } from "@/lib/auth/current";

const str = (v: unknown) => (v == null ? "" : String(v));
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map(str) : []);
/** Breaks as they were typed: pairs of times; what each may be is checked where it is read. */
const spans = (v: unknown): Span[] => (Array.isArray(v) ? v.slice(0, 20).map((b) => (Array.isArray(b) ? [str(b[0]), str(b[1])] : ["", ""]) as Span) : []);

function done(r: Applied): Applied {
  if (r.ok && r.written > 0) refresh();
  return r;
}

/** «Сохранить»: the marked cells become that kind of day, all of them or none. */
export async function saveCellsAction(input: { cells: { staffId: string; date: string }[]; kind: string; from?: string; to?: string; breaks?: Span[] }): Promise<Applied> {
  const { user, business } = await requireAdmin();
  return done(
    await saveDays(business, user, {
      cells: Array.isArray(input?.cells) ? input.cells.slice(0, 5000).map((c) => ({ staffId: str(c?.staffId), date: str(c?.date) })) : [],
      kind: str(input?.kind),
      from: str(input?.from),
      to: str(input?.to),
      breaks: spans(input?.breaks),
    }),
  );
}

/** «Заполнить»: a template for a period, by weekdays or by shifts. */
export async function templateAction(input: { staffIds: string[]; mode: string; dateFrom: string; dateTo: string; weekdays?: number[]; on?: number; off?: number; from: string; to: string; breaks?: Span[] }): Promise<Applied> {
  const { user, business } = await requireAdmin();
  return done(
    await fillTemplate(business, user, {
      staffIds: strs(input?.staffIds, 200),
      mode: str(input?.mode),
      dateFrom: str(input?.dateFrom),
      dateTo: str(input?.dateTo),
      weekdays: Array.isArray(input?.weekdays) ? input.weekdays.slice(0, 14).map(Number) : [],
      on: Number(input?.on),
      off: Number(input?.off),
      from: str(input?.from),
      to: str(input?.to),
      breaks: spans(input?.breaks),
    }),
  );
}

/** «Скопировать график»: one barber's days onto others, for a period. */
export async function copyAction(input: { fromStaffId: string; toStaffIds: string[]; dateFrom: string; dateTo: string; breaks: boolean }): Promise<Applied> {
  const { user, business } = await requireAdmin();
  return done(
    await copySchedule(business, user, {
      fromStaffId: str(input?.fromStaffId),
      toStaffIds: strs(input?.toStaffIds, 200),
      dateFrom: str(input?.dateFrom),
      dateTo: str(input?.dateTo),
      breaks: input?.breaks === true,
    }),
  );
}
