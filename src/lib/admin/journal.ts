/**
 * The journal's own rules: the admin's day calendar in the look of the
 * product we follow (docs/reference-looks.md, «The journal»). No database
 * and no Node, so the server, the browser and the tests share them:
 *
 *   - who gets a column on a day;
 *   - a visit's look: the strip says who made it, the body its state;
 *   - the day's numbers.
 *
 * The hours the grid shows are in grid.ts (daySpan).
 */
import type { L10n } from "../catalog";
import { addDays, startOfDay } from "../tz";
import type { CalendarData, CalStaff, CalVisit } from "./calendar";

/**
 * The barbers who get a column on a day, in the list's order: the ones who
 * work it (working hours, or special time, which is hours too), and anyone
 * with a visit on it. A barber who is off and has nobody has no column; one
 * who no longer works has it only for a visit.
 * Time off does not take the column away: a vacation or a break is shown in
 * it, where it can be opened and removed.
 */
export function dayStaff(data: Pick<CalendarData, "tz" | "staff" | "work" | "visits" | "special">, date: string): string[] {
  const day0 = startOfDay(date, data.tz);
  const day1 = startOfDay(addDays(date, 1), data.tz);
  const visited = new Set(data.visits.filter((v) => v.start < day1 && v.end > day0).map((v) => v.staffId));
  const special = new Set(data.special.filter((x) => x.from < day1 && x.to > day0).map((x) => x.staffId));
  return data.staff
    .filter((s) => visited.has(s.id) || (s.active && ((data.work[s.id]?.[date] ?? []).length > 0 || special.has(s.id))))
    .map((s) => s.id);
}

/** Who made a visit: the client online, or the salon (the admin, a barber, the import). */
export type Maker = "online" | "staff";

/** The four states a visit is shown in; the status filter has a tick for each. */
export const VISIT_STATES = ["online", "staff", "came", "noshow"] as const;
export type VisitState = (typeof VISIT_STATES)[number];
export const isVisitState = (v: unknown): v is VisitState => (VISIT_STATES as readonly unknown[]).includes(v);

export const makerOf = (source: string): Maker => (source === "online" ? "online" : "staff");

/**
 * Our statuses onto the four states:
 *   no_show          did not come;
 *   arrived, done    came (he is in the chair, or the visit is over);
 *   pending, booked  waiting, by who made it.
 * A cancelled visit is never on the grid.
 */
export function visitState(status: string, source: string): VisitState {
  if (status === "no_show") return "noshow";
  if (status === "arrived" || status === "done") return "came";
  return makerOf(source);
}

/** The colours measured in the product we follow (docs/altegio-pages.md, «Журнал», «Colours»). */
export const STRIP: Record<Maker, string> = { online: "#907b9f", staff: "#1ab394" };
export const BODY: Record<VisitState, string> = {
  online: "rgba(195,165,214,.8)",
  staff: "rgba(134,223,205,.8)",
  came: "rgba(255,153,88,.8)",
  noshow: "rgba(255,107,107,.8)",
};
export const NAME: Record<VisitState, string> = { online: "#765c88", staff: "#4b7b72", came: "#854e0e", noshow: "#7a1f1f" };

export type VisitLook = { maker: Maker; state: VisitState; strip: string; body: string; name: string };

/** A visit's card: the strip by who made it, the body and the client's name by its state. */
export function visitLook(status: string, source: string): VisitLook {
  const maker = makerOf(source);
  const state = visitState(status, source);
  return { maker, state, strip: STRIP[maker], body: BODY[state], name: NAME[state] };
}

export type DayNumbers = {
  /** different clients with a visit that day */
  clients: number;
  /** every visit of the day: what the cards on the grid come to */
  bookedCents: number;
  /** the visits that came (arrived or done) */
  doneCents: number;
};

/**
 * One local day's numbers from its visits: the ones that start that day and
 * are not cancelled. A no-show is still a booking, so it counts as booked
 * and never as done.
 */
export function dayNumbers(visits: Pick<CalVisit, "start" | "status" | "clientId" | "totalCents">[], date: string, tz: string): DayNumbers {
  const day0 = startOfDay(date, tz);
  const day1 = startOfDay(addDays(date, 1), tz);
  const mine = visits.filter((v) => v.start >= day0 && v.start < day1 && v.status !== "cancelled");
  const sum = (list: typeof mine) => list.reduce((n, v) => n + v.totalCents, 0);
  return {
    clients: new Set(mine.map((v) => v.clientId)).size,
    bookedCents: sum(mine),
    doneCents: sum(mine.filter((v) => v.status === "arrived" || v.status === "done")),
  };
}

/* ---------- «Добавить сотрудника в расписание» ---------- */

/**
 * The barbers the window offers on a day, in the list's order: the active
 * ones with no working hours that day (a barber on vacation still has his
 * hours, shown as time off in his column). Any day, not only one nobody
 * works: the person-plus is always in the bar of the admin we follow.
 */
export function addableStaff(data: Pick<CalendarData, "staff" | "work">, date: string): CalStaff[] {
  return data.staff.filter((s) => s.active && !(data.work[s.id]?.[date] ?? []).length);
}

/* ---------- «Добавить рабочие дни» / «Убрать рабочие дни» ---------- */

/** Days one «Добавить рабочие дни» or «Убрать рабочие дни» marks, at most: two months (schedule.ts, markDays). */
export const MARK_DAYS_MAX = 62;

/* ---------- «Изменить время для онлайн-записи» ---------- */

/** A piece of a day by the wall clock: «12:00»–«15:00»; an end may be «24:00» (schedule-plan.ts, Span). */
type Span = [string, string];

/** Online spans in one day, at most: as many as a dated day holds (staff.ts, cleanSpans). */
export const ONLINE_SPANS_MAX = 6;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (t: string) => (t === "24:00" ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
/** «23:59» is how a day that runs to midnight is stored (staff.ts, setDayOverride): it is midnight here. */
const endOf = (t: string) => (t === "23:59" ? 1440 : minutesOf(t));

/**
 * The hours clients may book a barber online on one day, as the journal's
 * window sends them, checked against his working hours that day (`work`,
 * wall-clock spans; a gap between two is a break):
 *   - [] is «all his working hours», the usual, and needs no hours;
 *   - otherwise at most six spans, each a start before its end, none over
 *     another, sorted; each one inside his working day, from its first
 *     start to its last end. A span may run over a break: nobody is booked
 *     in a break anyway, so the time clients get is the spans' overlap with
 *     his hours (slots.ts, onlyOnline);
 *   - a day he does not work has no online hours to set.
 * Null when any of that fails.
 */
export function cleanOnline(spans: unknown, work: readonly Span[]): Span[] | null {
  if (!Array.isArray(spans) || spans.length > ONLINE_SPANS_MAX) return null;
  if (!spans.length) return [];
  if (!work.length) return null;
  const lo = Math.min(...work.map(([a]) => minutesOf(a)));
  const hi = Math.max(...work.map(([, b]) => endOf(b)));
  const out: Span[] = [];
  for (const s of spans) {
    if (!Array.isArray(s) || s.length !== 2) return null;
    const [a, b] = s.map(String);
    if (!TIME_RE.test(a) || !(TIME_RE.test(b) || b === "24:00")) return null;
    if (minutesOf(b) <= minutesOf(a) || minutesOf(a) < lo || minutesOf(b) > hi) return null;
    out.push([a, b]);
  }
  out.sort((x, y) => minutesOf(x[0]) - minutesOf(y[0]));
  for (let i = 1; i < out.length; i++) if (minutesOf(out[i][0]) < minutesOf(out[i - 1][1])) return null;
  return out;
}

/** «12:00–15:00, 16:00–19:00» */
export const spansText = (spans: readonly Span[]) => spans.map(([a, b]) => `${a}–${b === "23:59" ? "24:00" : b}`).join(", ");

/* ---------- «Моё»: the panel beside a login's own column ---------- */

/** One of today's visits in the login's own column, as the panel «Моё» needs it. */
export type MineVisit = { id: string; start: number; end: number; status: string; clientName: string; service: L10n | null };

/** Today in the login's own column: its visits in order, how many count, and their sum (null without the right to see sums). */
export type MineToday = { visits: MineVisit[]; count: number; totalCents: number | null };

/**
 * Who is in the chair and who is next, as the barber app's «Дальше» has it
 * (src/lib/barber/gaps.ts, nextVisit): of the visits still to end, the first
 * one that has begun or is marked «Пришёл» is in the chair, and the one
 * after it is next. A visit that is over, done, a no-show or cancelled is
 * neither.
 */
export function mineNow(visits: MineVisit[], now: number): { chair: MineVisit | null; next: MineVisit | null } {
  const live = visits.filter((v) => (v.status === "booked" || v.status === "arrived" || v.status === "pending") && v.end > now).sort((a, b) => a.start - b.start);
  const chair = live.find((v) => v.status === "arrived" || v.start <= now) ?? null;
  const next = live.find((v) => v !== chair && (!chair || v.start >= chair.start)) ?? null;
  return { chair, next };
}
