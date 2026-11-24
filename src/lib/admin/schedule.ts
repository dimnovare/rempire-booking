/**
 * «График работы»: the month grid of shifts, read and changed (the owner,
 * 19.11.2026; docs/altegio-pages.md, «График работы»). Its rules that need
 * no database are in schedule-plan.ts.
 *
 *   loadSchedule    each barber's days for the grid: what booking sees of
 *                   the day (`effectiveDay`), how many visits it has;
 *   saveDays        the marked cells: a working day with its hours and
 *                   breaks, a day off, a vacation day or a sick day;
 *   fillTemplate    «По дням недели» or «По сменам» over a period;
 *   copySchedule    one barber's days to other barbers, for a period;
 *   markDays        the journal's «Добавить рабочие дни» / «Убрать рабочие
 *                   дни»: one barber's picked days, as a template writes.
 *
 * **What is written.** A working day and a day off are dated overrides
 * (staff_day_overrides: the day's own spans, or none), exactly what a
 * barber's page calls «Особые дни». A vacation or a sick day is time off
 * for that whole day (time_off, approved), the same rows the barber's page
 * lists. Giving a marked day any kind first takes the vacation or the sick
 * leave off that one day (a longer one is cut around it); breaks blocked in
 * the calendar stay where they are. A template and a copy write dated days
 * only: nobody's vacation is given or taken. The weekly hours are never
 * touched here.
 *
 * **Visits are never cut.** A day with a visit cannot become a day off, a
 * vacation or a sick day, and its hours cannot shrink from under a visit
 * that sits in them (`cutVisits`). The marked cells are all or nothing: the
 * answer names the days and how many visits each has. A template and a
 * copy leave such a day as it was and say which they skipped.
 *
 * Rights (src/lib/auth/rights.ts): every change is «Редактирование графика
 * работы» (staff.schedule, with its group «Сотрудники»), asked here. The
 * grid itself is the section «Сотрудники», asked by the page.
 *
 * **Whose days.** A login sees and changes only the barbers whose column it
 * sees in the journal («Просматривать расписание и записи сотрудников»,
 * journal.staff: all, or the chosen ones). The grid has no row for the
 * others, so nothing of theirs is drawn, counted or summed. A change that
 * names one of them is refused as «forbidden» before anything is read:
 * every barber of the marked cells, every barber of a template, and for a
 * copy the barber it is taken from and each one it is given to. The
 * refusal says nothing of his days or his visits.
 */
import { can, seenStaff, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { withTx, type Querier } from "../db";
import { mergeIntervals, subtractIntervals, workWindows, type HoursRow, type Interval } from "../slots";
import { addDays, isLocalDate, startOfDay, todayIn } from "../tz";
import { cutVisits, daysBetween, daySpans, effectiveDay, endOfNextMonth, isDayKind, localSpans, shiftDays, SHIFT_RUN_MAX, weekdayDays, type DayKind, type Span } from "./schedule-plan";
import { MARK_DAYS_MAX } from "./journal";
import { cleanSpans } from "./staff";
import { isUuid } from "./visits";

export type { DayKind, Span };

export type ScheduleCell = {
  kind: DayKind;
  /** the working time left that day, by the wall clock; a gap between two spans is a break */
  spans: Span[];
  /** how long that is, in real minutes */
  minutes: number;
  /** visits that day that are not cancelled */
  visits: number;
};

export type ScheduleStaff = {
  id: string;
  name: string;
  role: L10n;
  photoUrl: string | null;
  /** date → the day */
  cells: Record<string, ScheduleCell>;
};

export type ScheduleData = { tz: string; dates: string[]; staff: ScheduleStaff[] };

type OffRow = { id: string; staff_id: string; starts_at: Date; ends_at: Date; kind: string; status: string; note: string; created_by: string | null };
type State = {
  hours: (HoursRow & { staff_id: string })[];
  overrides: { staff_id: string; day: string; intervals: Span[] }[];
  off: OffRow[];
  visits: { staff_id: string; starts_at: Date; ends_at: Date }[];
};

const MIN = 60_000;
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
const AWAY = new Set(["vacation", "sick"]);

/** What the days from `from` to `to` are made of, for these barbers: hours, dated days, time off, visits. */
async function loadState(q: Querier, staffIds: string[], from: string, to: string, tz: string): Promise<State> {
  const a = new Date(startOfDay(from, tz));
  const b = new Date(startOfDay(addDays(to, 1), tz));
  const [hours, overrides, off, visits] = await Promise.all([
    q<HoursRow & { staff_id: string }>(
      `select staff_id, weekday, to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends,
              valid_from::text as valid_from, valid_to::text as valid_to
         from staff_hours where staff_id = any($1::uuid[])`,
      [staffIds],
    ),
    q<{ staff_id: string; day: string; intervals: Span[] }>(
      "select staff_id, day::text as day, intervals from staff_day_overrides where staff_id = any($1::uuid[]) and day between $2::date and $3::date",
      [staffIds, from, to],
    ),
    q<OffRow>(
      `select id, staff_id, starts_at, ends_at, kind, status, note, created_by from time_off
        where staff_id = any($1::uuid[]) and status <> 'declined' and starts_at < $3 and ends_at > $2
        order by starts_at, id`,
      [staffIds, a, b],
    ),
    q<{ staff_id: string; starts_at: Date; ends_at: Date }>(
      "select staff_id, starts_at, ends_at from appointments where staff_id = any($1::uuid[]) and status <> 'cancelled' and starts_at >= $2 and starts_at < $3",
      [staffIds, a, b],
    ),
  ]);
  return { hours, overrides, off, visits };
}

/** One barber's day out of the state: what booking sees of it, and what stands behind an empty day. */
function dayOf(s: State, staffId: string, date: string, tz: string): { windows: Interval[]; kind: DayKind; visits: Interval[] } {
  const d0 = startOfDay(date, tz);
  const d1 = startOfDay(addDays(date, 1), tz);
  const ov = s.overrides.find((o) => o.staff_id === staffId && o.day === date);
  const off = s.off.filter((t) => t.staff_id === staffId && ms(t.starts_at) < d1 && ms(t.ends_at) > d0);
  const windows = effectiveDay(
    date,
    tz,
    s.hours.filter((h) => h.staff_id === staffId),
    ov ? ov.intervals : null,
    off.map((t) => [ms(t.starts_at), ms(t.ends_at)] as Interval),
  );
  const away = windows.length ? undefined : off.find((t) => AWAY.has(t.kind));
  const visits = s.visits.filter((v) => v.staff_id === staffId && ms(v.starts_at) >= d0 && ms(v.starts_at) < d1).map((v) => [ms(v.starts_at), ms(v.ends_at)] as Interval);
  return { windows, kind: windows.length ? "work" : away ? (away.kind as DayKind) : "off", visits };
}

/**
 * The grid: every working barber and each of his days in `dates` (in
 * order, one after another). With a login: only the barbers whose column
 * it sees in the journal. The others have no row, so the page cannot draw,
 * count or sum anything of theirs.
 */
export async function loadSchedule(q: Querier, business: Business, dates: string[], who?: Holder): Promise<ScheduleData> {
  const tz = business.timezone;
  const seen = who ? seenStaff(who) : "all";
  const staffRows = (
    await q<{ id: string; display_name: string; role: L10n; photo_url: string | null }>("select id, display_name, role, photo_url from staff where business_id = $1 and active order by sort, display_name", [business.id])
  ).filter((s) => seen === "all" || seen.includes(s.id));
  if (!dates.length || !staffRows.length) return { tz, dates, staff: staffRows.map((s) => ({ id: s.id, name: s.display_name, role: s.role, photoUrl: s.photo_url, cells: {} })) };
  const state = await loadState(q, staffRows.map((s) => s.id), dates[0], dates[dates.length - 1], tz);
  return {
    tz,
    dates,
    staff: staffRows.map((s) => {
      const cells: Record<string, ScheduleCell> = {};
      for (const date of dates) {
        const d = dayOf(state, s.id, date, tz);
        cells[date] = { kind: d.kind, spans: localSpans(d.windows, date, tz), minutes: d.windows.reduce((n, [a, b]) => n + Math.round((b - a) / MIN), 0), visits: d.visits.length };
      }
      return { id: s.id, name: s.display_name, role: s.role, photoUrl: s.photo_url, cells };
    }),
  };
}

/* ---------- changes ---------- */

/** One day as it should become. `spans` only for a working day. */
export type DayPlan = { staffId: string; date: string; kind: DayKind; spans: Span[] };
/** A day that was refused or skipped: it has visits the change would cut. */
export type Refused = { staffId: string; date: string; visits: number };

export type Applied =
  | { ok: true; written: number; skipped: Refused[] }
  | { ok: false; code: "forbidden" }
  | { ok: false; code: "invalid"; field: string }
  /** the marked cells: nothing was written, these days have visits */
  | { ok: false; code: "visits"; refused: Refused[] };

/** Days in one change, at most (a template for every barber over its longest period fits). */
export const PLANS_MAX = 4000;

const bad = (field: string): Applied => ({ ok: false, code: "invalid", field });
const NO: Applied = { ok: false, code: "forbidden" };

/**
 * May this login change these barbers' days? The right to change the
 * schedule, and each of them a barber whose column it sees. Asked before
 * anything is read: an id it does not see is refused whether or not there
 * is such a barber.
 */
function mayChange(by: Holder, staffIds: readonly unknown[]): boolean {
  return can(by, "staff.schedule") && staffIds.every((id) => can(by, "journal.staff", { staffId: String(id ?? "") }));
}

/** A span's end as the table keeps it: 24:00 is 23:59 there (staff.ts, setDayOverride). */
const stored = (spans: Span[]): Span[] => spans.map(([a, b]) => [a, b === "24:00" ? "23:59" : b]);

/**
 * Write the days. `strict` (the marked cells): one day with visits it
 * would cut refuses them all, and a day that is written loses its vacation
 * or sick leave first. Otherwise (a template, a copy) a day with such
 * visits is left as it was and named in `skipped`, and only dated days are
 * written: a vacation stays where it is, over whatever the day now says.
 *
 * `until` (a template): the period's last day. A barber of the change whose
 * «График до» (migration 042) is earlier gets it moved there, in the same
 * transaction, with an audit row of its own; one with none keeps none (no
 * limit is wider than any date), one with a later date keeps his.
 */
async function applyDays(business: Business, by: Holder & { id: string }, plans: DayPlan[], strict: boolean, via: string, until?: string): Promise<Applied> {
  // whatever called this: the right, and every barber named is one the login sees
  if (!mayChange(by, plans.map((p) => p.staffId))) return NO;
  if (!plans.length) return bad("days");
  if (plans.length > PLANS_MAX) return bad("days");
  const tz = business.timezone;
  // one plan a day: the last one said wins
  const byKey = new Map<string, DayPlan>();
  for (const p of plans) {
    if (!isUuid(p.staffId)) return bad("staff");
    if (!isLocalDate(p.date)) return bad("date");
    if (!isDayKind(p.kind)) return bad("kind");
    let spans: Span[] = [];
    if (p.kind === "work") {
      const clean = cleanSpans(p.spans);
      if (!clean || !clean.length) return bad("spans");
      spans = clean;
    }
    byKey.set(`${p.staffId}:${p.date}`, { staffId: p.staffId, date: p.date, kind: p.kind, spans });
  }
  const list = [...byKey.values()].sort((a, b) => a.staffId.localeCompare(b.staffId) || a.date.localeCompare(b.date));
  const staffIds = [...new Set(list.map((p) => p.staffId))].sort();
  const first = list.reduce((d, p) => (p.date < d ? p.date : d), list[0].date);
  const last = list.reduce((d, p) => (p.date > d ? p.date : d), list[0].date);

  return withTx<Applied>(async (tx) => {
    // the barbers of this business, locked in one order: booking takes the same lock around its own check
    const found = await tx<{ id: string }>("select id from staff where business_id = $1 and id = any($2::uuid[]) order by id for update", [business.id, staffIds]);
    if (found.length !== staffIds.length) return bad("staff");
    const state = await loadState(tx, staffIds, first, last, tz);

    const refused: Refused[] = [];
    const go: DayPlan[] = [];
    for (const p of list) {
      const now = dayOf(state, p.staffId, p.date, tz);
      let cut: number;
      if (p.kind === "work") {
        // the day as it will be: its new spans, less the time off that stays on it (the breaks blocked in the
        // calendar; a vacation too, unless the marked cells take it off the day)
        const d0 = startOfDay(p.date, tz);
        const d1 = startOfDay(addDays(p.date, 1), tz);
        const blocks = state.off.filter((t) => t.staff_id === p.staffId && !(strict && AWAY.has(t.kind)) && ms(t.starts_at) < d1 && ms(t.ends_at) > d0).map((t) => [ms(t.starts_at), ms(t.ends_at)] as Interval);
        const after = subtractIntervals(workWindows(p.date, tz, [], p.spans), mergeIntervals(blocks));
        cut = cutVisits(now.visits, now.windows, after);
      } else cut = now.visits.length;
      if (cut > 0) refused.push({ staffId: p.staffId, date: p.date, visits: cut });
      else go.push(p);
    }
    if (strict && refused.length) return { ok: false, code: "visits", refused };

    for (const staffId of staffIds) {
      const mine = go.filter((p) => p.staffId === staffId);
      if (!mine.length) continue;
      if (strict) await clearAway(tx, state, staffId, mine.map((p) => p.date), tz);
      for (const p of mine) {
        if (AWAY.has(p.kind)) continue;
        await tx(
          `insert into staff_day_overrides (staff_id, day, intervals, note) values ($1, $2::date, $3::jsonb, '')
           on conflict (staff_id, day) do update set intervals = excluded.intervals`,
          [staffId, p.date, JSON.stringify(stored(p.spans))],
        );
      }
      // a run of days in a row is one row of time off
      for (const kind of ["vacation", "sick"] as const) {
        const days = mine.filter((p) => p.kind === kind).map((p) => p.date);
        for (let i = 0; i < days.length; ) {
          let j = i;
          while (j + 1 < days.length && days[j + 1] === addDays(days[j], 1)) j++;
          await tx(`insert into time_off (staff_id, starts_at, ends_at, kind, status, note, created_by) values ($1, $2, $3, $4, 'approved', '', null)`, [
            staffId,
            new Date(startOfDay(days[i], tz)),
            new Date(startOfDay(addDays(days[j], 1), tz)),
            kind,
          ]);
          i = j + 1;
        }
      }
      const kinds = [...new Set(mine.map((p) => p.kind))];
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'schedule', $3::jsonb)`, [
        by.id,
        staffId,
        JSON.stringify({ via, days: mine.length, from: mine[0].date, to: mine[mine.length - 1].date, kinds }),
      ]);
    }
    if (until) {
      const behind = await tx<{ id: string; was: string }>(
        "select id, schedule_until::text as was from staff where business_id = $1 and id = any($2::uuid[]) and schedule_until < $3::date order by id",
        [business.id, staffIds, until],
      );
      for (const s of behind) {
        await tx("update staff set schedule_until = $2::date where id = $1", [s.id, until]);
        await tx(`insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'staff', $2, 'edit', $3::jsonb, $4::jsonb)`, [
          by.id,
          s.id,
          JSON.stringify({ schedule_until: s.was }),
          JSON.stringify({ schedule_until: until, via }),
        ]);
      }
    }
    return { ok: true, written: go.length, skipped: strict ? [] : refused };
  });
}

/**
 * Take the vacation and the sick leave off these days of one barber: a row
 * that covers more than the days is cut around them (its first piece keeps
 * the row, the others are new rows of the same kind), one that lies inside
 * them goes.
 */
async function clearAway(tx: Querier, state: State, staffId: string, dates: string[], tz: string): Promise<void> {
  const days = mergeIntervals(dates.map((d) => [startOfDay(d, tz), startOfDay(addDays(d, 1), tz)] as Interval));
  for (const t of state.off) {
    if (t.staff_id !== staffId || !AWAY.has(t.kind)) continue;
    const whole: Interval = [ms(t.starts_at), ms(t.ends_at)];
    const left = subtractIntervals([whole], days);
    if (left.length === 1 && left[0][0] === whole[0] && left[0][1] === whole[1]) continue;
    if (!left.length) {
      await tx("delete from time_off where id = $1", [t.id]);
      continue;
    }
    await tx("update time_off set starts_at = $2, ends_at = $3 where id = $1", [t.id, new Date(left[0][0]), new Date(left[0][1])]);
    for (const [a, b] of left.slice(1)) {
      await tx(`insert into time_off (staff_id, starts_at, ends_at, kind, status, note, created_by) values ($1, $2, $3, $4, $5, $6, $7)`, [staffId, new Date(a), new Date(b), t.kind, t.status, t.note, t.created_by]);
    }
  }
}

/** The marked cells, as the panel sends them. */
export type CellsInput = {
  cells: { staffId: string; date: string }[];
  kind: string;
  /** a working day: its start, its end and the breaks inside */
  from?: string;
  to?: string;
  breaks?: Span[];
};

/** «Сохранить»: every marked cell becomes that day, or none does. */
export async function saveDays(business: Business, by: Holder & { id: string }, input: CellsInput): Promise<Applied> {
  const cells = Array.isArray(input?.cells) ? input.cells : [];
  if (!mayChange(by, cells.map((c) => c?.staffId))) return NO;
  if (!isDayKind(input?.kind)) return bad("kind");
  if (!cells.length) return bad("days");
  const spans = input.kind === "work" ? daySpans(input.from, input.to, input.breaks ?? []) : [];
  if (!spans) return bad("spans");
  return applyDays(business, by, cells.map((c) => ({ staffId: String(c?.staffId ?? ""), date: String(c?.date ?? ""), kind: input.kind as DayKind, spans })), true, "cells");
}

/** A template for a period, as the panel sends it. */
export type TemplateInput = {
  staffIds: string[];
  mode: string;
  /** the period, both days in */
  dateFrom: string;
  dateTo: string;
  /** «По дням недели»: ISO weekdays, 1 Monday … 7 Sunday */
  weekdays?: number[];
  /** «По сменам»: so many days on, so many off */
  on?: number;
  off?: number;
  /** the hours of a working day, and its breaks */
  from: string;
  to: string;
  breaks?: Span[];
};

/**
 * «По дням недели»: the ticked weekdays of the period become working days
 * with these hours; the other days stay as they are. «По сменам»: so many
 * days on with these hours, then so many days off, from the period's first
 * day. A day with visits the change would cut is left alone and named.
 * A barber's «График до» earlier than the period's last day moves to it.
 */
export async function fillTemplate(business: Business, by: Holder & { id: string }, input: TemplateInput): Promise<Applied> {
  const staffIds = Array.isArray(input?.staffIds) ? [...new Set(input.staffIds.map(String))] : [];
  if (!mayChange(by, staffIds)) return NO;
  if (!staffIds.length || staffIds.length > 100 || !staffIds.every(isUuid)) return bad("staff");
  const dates = daysBetween(input.dateFrom, input.dateTo);
  if (!dates) return bad("period");
  const spans = daySpans(input.from, input.to, input.breaks ?? []);
  if (!spans) return bad("spans");
  let days: { date: string; work: boolean }[];
  if (input.mode === "weekdays") {
    const wd = Array.isArray(input.weekdays) ? [...new Set(input.weekdays.map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= 7) : [];
    if (!wd.length) return bad("weekdays");
    days = weekdayDays(dates, wd).map((date) => ({ date, work: true }));
    if (!days.length) return bad("weekdays");
  } else if (input.mode === "shifts") {
    const on = Number(input.on);
    const off = Number(input.off);
    if (!Number.isInteger(on) || on < 1 || on > SHIFT_RUN_MAX) return bad("on");
    if (!Number.isInteger(off) || off < 1 || off > SHIFT_RUN_MAX) return bad("off");
    days = shiftDays(dates, on, off);
  } else return bad("mode");
  const plans: DayPlan[] = [];
  for (const staffId of staffIds) for (const d of days) plans.push({ staffId, date: d.date, kind: d.work ? "work" : "off", spans: d.work ? spans : [] });
  // «График до» follows the template to the period's end (Dim, round 15)
  return applyDays(business, by, plans, false, input.mode, dates[dates.length - 1]);
}

/** «Скопировать график», as its window sends it. */
export type CopyInput = { fromStaffId: string; toStaffIds: string[]; dateFrom: string; dateTo: string; breaks: boolean };

/**
 * One barber's days onto other barbers, for a period from today on that
 * ends by the last day of next month. A day he works is copied with its
 * hours (and its breaks, if asked; else as one piece from its start to its
 * end); a day he does not work, for whatever reason, becomes a day off.
 * Only dated days are written: nobody's vacation is given or taken. A day
 * with visits the copy would cut is left alone and named. The login must
 * see the barber it copies from and every barber it copies to.
 */
export async function copySchedule(business: Business, by: Holder & { id: string }, input: CopyInput, now = Date.now()): Promise<Applied> {
  const from = String(input?.fromStaffId ?? "");
  const asked = Array.isArray(input?.toStaffIds) ? [...new Set(input.toStaffIds.map(String))] : [];
  // the barber it is taken from is read, each one it is given to is written: all of them must be the login's to see
  if (!mayChange(by, [from, ...asked])) return NO;
  if (!isUuid(from)) return bad("staff");
  const to = asked.filter((id) => id !== from);
  if (!to.length || to.length > 100 || !to.every(isUuid)) return bad("to");
  const today = todayIn(business.timezone, now);
  const dates = daysBetween(input.dateFrom, input.dateTo);
  if (!dates || dates[0] < today || dates[dates.length - 1] > endOfNextMonth(today)) return bad("period");
  const tz = business.timezone;
  const plans = await withTx(async (tx) => {
    const [src] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2", [from, business.id]);
    if (!src) return null;
    const state = await loadState(tx, [from], dates[0], dates[dates.length - 1], tz);
    const out: DayPlan[] = [];
    for (const date of dates) {
      const spans = localSpans(dayOf(state, from, date, tz).windows, date, tz);
      // (a day cut into more pieces than a dated day holds is copied as one piece too)
      const kept: Span[] = (input.breaks === true && spans.length <= 6) || spans.length < 2 ? spans : [[spans[0][0], spans[spans.length - 1][1]]];
      for (const staffId of to) out.push({ staffId, date, kind: kept.length ? "work" : "off", spans: kept });
    }
    return out;
  });
  if (!plans) return bad("staff");
  return applyDays(business, by, plans, false, "copy");
}

/** «Добавить рабочие дни» / «Убрать рабочие дни», as the journal's window sends them. */
export type MarkInput = {
  staffId: string;
  /** the days picked in its month, in any order */
  dates: string[];
  /** "work": they become working days with these hours; "off": days off */
  kind: string;
  from?: string;
  to?: string;
  breaks?: Span[];
};

/**
 * The journal's «Добавить рабочие дни» and «Убрать рабочие дни» (the head
 * menu of the admin we follow; Dim, 24.11.2026): one barber's picked days
 * become working days with these hours and breaks, or days off. Written as
 * a template is: dated days only, so a vacation stays where it is, and a
 * day whose visits the change would cut (any visit, for a day off) is left
 * as it was and named in `skipped`; the other days are written.
 */
export async function markDays(business: Business, by: Holder & { id: string }, input: MarkInput): Promise<Applied> {
  const staffId = String(input?.staffId ?? "");
  if (!mayChange(by, [staffId])) return NO;
  if (input?.kind !== "work" && input?.kind !== "off") return bad("kind");
  const dates = Array.isArray(input.dates) ? [...new Set(input.dates.map(String))] : [];
  if (!dates.length || dates.length > MARK_DAYS_MAX) return bad("days");
  const spans = input.kind === "work" ? daySpans(input.from, input.to, input.breaks ?? []) : [];
  if (!spans) return bad("spans");
  const kind: DayKind = input.kind === "work" ? "work" : "off";
  return applyDays(business, by, dates.map((date) => ({ staffId, date, kind, spans })), false, kind === "work" ? "journal-add" : "journal-remove");
}
