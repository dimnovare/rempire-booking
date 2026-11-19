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
import { addDays, startOfDay } from "../tz";
import type { CalendarData, CalVisit } from "./calendar";

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
