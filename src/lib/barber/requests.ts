/**
 * A barber's own time and prices (Phase B, B4; docs/phase-b.md).
 *
 * Every change he makes from /b/time is one staff_requests row
 * (009_staff_requests.sql). Renat's two switches (businesses.settings,
 * src/lib/settings.ts) say what happens to it:
 *   barber_self_time  breaks, days off, sick days, special time, weekly hours
 *   barber_self_price his price or time for a service
 * «now» applies it at once and the row is `applied`; «ask» keeps it
 * `requested` until Renat answers in the admin's «Запросы». Until Renat
 * answers his question 2: time now, prices ask.
 *
 * Days off that wait hold their time already (time_off.status =
 * 'requested', which online booking treats as taken), so no client books
 * into a vacation Renat has not answered yet. Taking something away (a
 * break, a vacation, special time) always applies at once.
 *
 * A barber works only on his own column: every function takes the staff id
 * from requireStaff() and checks it under the row lock. Renat or the front
 * desk looking at the app as a barber (`viewing`) is the admin: their
 * changes apply at once and send no push.
 */
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { cleanSpans } from "../admin/staff";
import { isUuid } from "../admin/visits";
import { withTx, type Querier } from "../db";
import { queuePush } from "../push";
import type { AnswerPayload, RequestPayload } from "../push-kinds";
import { SELF_KEYS, type SelfKey, type SelfMode } from "../settings";
import { addDays, isLocalDate, localParts, startOfDay, timeToMinutes, todayIn, zonedToUtc } from "../tz";
import { isRequestWhat, MAX_OFF_DAYS, MAX_SPANS, MAX_WEEKS, type OffKind, type RequestWhat, type WeekHours } from "./request-words";

export type Who = { userId: string; staffId: string; staffName: string; viewing: boolean };
export type RequestStatus = "requested" | "approved" | "declined" | "applied" | "withdrawn";

export type ChangeCode = "invalid" | "past" | "too_long" | "not_found" | "not_yours" | "same";
export type ChangeResult = { ok: true; id: string; status: "requested" | "applied"; visitsInside?: number } | { ok: false; code: ChangeCode };

const DAY = 86_400_000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOTE_MAX = 300;

const note = (s: unknown) => String(s ?? "").trim().slice(0, NOTE_MAX);
const isEnd = (s: string) => TIME_RE.test(s) || s === "24:00";
const endMin = (s: string) => (s === "24:00" ? 1440 : timeToMinutes(s));
/** The moment `date time` ends; «24:00» is the next midnight. */
const at = (date: string, time: string, tz: string) => (time === "24:00" ? startOfDay(addDays(date, 1), tz) : zonedToUtc(date, time, tz));
const ms = (d: Date | string) => new Date(d).getTime();

function mode(business: Business, who: Who, key: SelfKey): SelfMode {
  if (who.viewing) return "now";
  return business.settings[key] === "ask" ? "ask" : "now";
}

async function lockStaff(tx: Querier, business: Business, staffId: string): Promise<boolean> {
  if (!isUuid(staffId)) return false;
  const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
  return !!st;
}

/** Was this row made from his column's own login (not by Renat in the admin)? */
const byHisLogin = (col: string, staffParam: string) => `exists (select 1 from users u where u.id::text = ${col}::text and u.staff_id = ${staffParam})`;

async function insertRequest(
  tx: Querier,
  business: Business,
  who: Who,
  r: { what: RequestWhat; status: "requested" | "applied"; note?: string; timeOffId?: string | null },
): Promise<string> {
  const [row] = await tx<{ id: string }>(
    `insert into staff_requests (business_id, staff_id, kind, payload, note, status, time_off_id, created_by, decided_at)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, case when $6 = 'applied' then now() end) returning id`,
    [business.id, who.staffId, r.what.kind, JSON.stringify(r.what), note(r.note), r.status, r.timeOffId ?? null, who.userId],
  );
  await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff_request', $2, $3, $4::jsonb)`, [
    who.userId,
    row.id,
    r.status === "applied" ? "apply" : "request",
    JSON.stringify({ staff_id: who.staffId, ...r.what }),
  ]);
  return row.id;
}

/** Tell Renat: a request to answer, or a change already made. A break of his own is not worth a push. */
async function tellOwners(tx: Querier, business: Business, who: Who, requestId: string, status: "requested" | "applied", what: RequestWhat, visitsInside?: number) {
  if (who.viewing) return;
  if (status === "applied" && what.kind === "time_off" && what.offKind === "block") return;
  const payload: RequestPayload = { requestId, staff: who.staffName, status, tz: business.timezone, what, ...(visitsInside ? { visitsInside } : {}) };
  await queuePush(tx, { businessId: business.id, kind: "own_request", to: "owners", exceptUserId: who.userId, payload });
}

/** His visits still ahead inside [from, to): the answer warns about them. */
async function visitsInside(tx: Querier, staffId: string, from: number, to: number, now: number): Promise<number> {
  const [n] = await tx<{ n: number }>(
    `select count(*)::int as n from appointments
      where staff_id = $1 and status in ('pending', 'booked', 'arrived') and starts_at < $3 and blocked_until > greatest($2::timestamptz, $4::timestamptz)`,
    [staffId, new Date(from), new Date(to), new Date(now)],
  );
  return n?.n ?? 0;
}

// ---------------------------------------------------------------- days off

export type TimeOffInput =
  | { offKind: "block"; date: string; start: string; end: string; note?: string }
  | { offKind: "vacation" | "sick"; fromDate: string; toDate: string; note?: string };

/** The moments of a break or of whole days off, checked; or why not. */
export function timeOffSpan(input: TimeOffInput, tz: string, now: number): { from: number; to: number } | { code: ChangeCode } {
  const today = todayIn(tz, now);
  if (input?.offKind === "block") {
    const { date, start, end } = input;
    if (!isLocalDate(date) || !TIME_RE.test(String(start)) || !isEnd(String(end))) return { code: "invalid" };
    if (endMin(end) <= timeToMinutes(start)) return { code: "invalid" };
    if (date < today || date > addDays(today, 366)) return { code: "past" };
    const from = zonedToUtc(date, start, tz);
    const to = at(date, end, tz);
    if (to <= now) return { code: "past" };
    return { from, to };
  }
  if (input?.offKind === "vacation" || input?.offKind === "sick") {
    const { fromDate, toDate } = input;
    if (!isLocalDate(fromDate) || !isLocalDate(toDate) || toDate < fromDate) return { code: "invalid" };
    if (fromDate < today || fromDate > addDays(today, 366)) return { code: "past" };
    if (addDays(fromDate, MAX_OFF_DAYS - 1) < toDate) return { code: "too_long" };
    return { from: startOfDay(fromDate, tz), to: startOfDay(addDays(toDate, 1), tz) };
  }
  return { code: "invalid" };
}

/** A break, a vacation or sick days in his own column. */
export async function barberTimeOff(business: Business, who: Who, input: TimeOffInput, now = Date.now()): Promise<ChangeResult> {
  const span = timeOffSpan(input, business.timezone, now);
  if ("code" in span) return { ok: false, code: span.code };
  const offKind = input.offKind as OffKind;
  const m = mode(business, who, "barber_self_time");
  return withTx(async (tx) => {
    if (!(await lockStaff(tx, business, who.staffId))) return { ok: false as const, code: "not_found" as const };
    const [off] = await tx<{ id: string }>(
      `insert into time_off (staff_id, starts_at, ends_at, kind, status, note, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [who.staffId, new Date(span.from), new Date(span.to), offKind, m === "ask" ? "requested" : "approved", note(input.note), who.userId],
    );
    const inside = await visitsInside(tx, who.staffId, span.from, span.to, now);
    const what: RequestWhat = { kind: "time_off", action: "add", offKind, from: span.from, to: span.to };
    const status = m === "ask" ? "requested" : "applied";
    const id = await insertRequest(tx, business, who, { what, status, note: input.note, timeOffId: off.id });
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'time_off', $2, 'create', $3::jsonb)`, [
      who.userId,
      off.id,
      JSON.stringify({ staff_id: who.staffId, from: new Date(span.from).toISOString(), to: new Date(span.to).toISOString(), kind: offKind, by: "barber", request: id }),
    ]);
    await tellOwners(tx, business, who, id, status, what, inside);
    return { ok: true as const, id, status, visitsInside: inside };
  });
}

/**
 * Take a break or days off away. One still waiting for Renat is withdrawn;
 * one in force goes at once (he works more, nobody loses). Only what his own
 * login made: what Renat put in his column stays Renat's.
 */
export async function barberRemoveTimeOff(business: Business, who: Who, timeOffId: string, now = Date.now()): Promise<{ ok: true } | { ok: false; code: ChangeCode }> {
  if (!isUuid(timeOffId)) return { ok: false, code: "not_found" };
  return withTx(async (tx) => {
    if (!(await lockStaff(tx, business, who.staffId))) return { ok: false as const, code: "not_found" as const };
    const [t] = await tx<{ id: string; starts_at: Date; ends_at: Date; kind: OffKind; status: string; mine: boolean }>(
      `select t.id, t.starts_at, t.ends_at, t.kind, t.status, ${byHisLogin("t.created_by", "$2")} as mine
         from time_off t where t.id = $1 and t.staff_id = $2 and t.ends_at > $3 and t.status <> 'declined' for update of t`,
      [timeOffId, who.staffId, new Date(now)],
    );
    if (!t) return { ok: false as const, code: "not_found" as const };
    if (!t.mine && !who.viewing) return { ok: false as const, code: "not_yours" as const };
    // a waiting one: its request is withdrawn first (the delete clears time_off_id)
    if (t.status === "requested") await tx("update staff_requests set status = 'withdrawn', decided_at = now() where time_off_id = $1 and status = 'requested'", [t.id]);
    await tx("delete from time_off where id = $1", [t.id]);
    await tx(`insert into audit (actor, entity, entity_id, action, before) values ($1, 'time_off', $2, 'delete', $3::jsonb)`, [
      who.userId,
      t.id,
      JSON.stringify({ staff_id: who.staffId, from: ms(t.starts_at), to: ms(t.ends_at), kind: t.kind, status: t.status, by: who.viewing ? "admin" : "barber" }),
    ]);
    if (t.status === "requested") return { ok: true as const };
    const what: RequestWhat = { kind: "time_off", action: "remove", offKind: t.kind, from: ms(t.starts_at), to: ms(t.ends_at) };
    const id = await insertRequest(tx, business, who, { what, status: "applied" });
    await tellOwners(tx, business, who, id, "applied", what);
    return { ok: true as const };
  });
}

// ------------------------------------------------------------ special time

export type SpecialInput = { date: string; start: string; end: string; extraCents: number; weeks?: number; note?: string };

/** The same hours on the same weekday, `weeks` weeks in a row, on the salon's clock. */
export function specialSpans(date: string, start: string, end: string, weeks: number, tz: string): { from: number; to: number }[] {
  return Array.from({ length: weeks }, (_, i) => {
    const d = addDays(date, 7 * i);
    return { from: zonedToUtc(d, start, tz), to: at(d, end, tz) };
  });
}

/** Back from a request: the first span and the weeks give every span (moved one week at a time). */
function spansOf(what: Extract<RequestWhat, { kind: "special" }>, tz: string) {
  const a = localParts(what.from, tz);
  const b = localParts(what.to, tz);
  const endsNextDay = b.date !== a.date;
  return specialSpans(a.date, a.time, endsNextDay && b.time === "00:00" ? "24:00" : b.time, Math.max(1, what.weeks ?? 1), tz);
}

async function insertSpecial(tx: Querier, business: Business, staffId: string, spans: { from: number; to: number }[], extraCents: number, text: string, by: string, now: number): Promise<string[]> {
  const ids: string[] = [];
  for (const s of spans) {
    if (s.to <= now) continue;
    const [row] = await tx<{ id: string }>(
      `insert into special_time (business_id, staff_id, starts_at, ends_at, extra_cents, note, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [business.id, staffId, new Date(s.from), new Date(s.to), extraCents, text.slice(0, 200), by],
    );
    ids.push(row.id);
  }
  return ids;
}

/** Special time with its own extra, once or for a few weeks. */
export async function barberAddSpecial(business: Business, who: Who, input: SpecialInput, now = Date.now()): Promise<ChangeResult> {
  const tz = business.timezone;
  const today = todayIn(tz, now);
  const { date, start, end } = input ?? ({} as SpecialInput);
  const weeks = input?.weeks ?? 1;
  if (!isLocalDate(date) || !TIME_RE.test(String(start)) || !isEnd(String(end)) || endMin(end) <= timeToMinutes(start)) return { ok: false, code: "invalid" };
  if (!Number.isInteger(input.extraCents) || input.extraCents < 0 || input.extraCents > 100_000) return { ok: false, code: "invalid" };
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) return { ok: false, code: "invalid" };
  if (date < today || date > addDays(today, 366)) return { ok: false, code: "past" };
  const spans = specialSpans(date, start, end, weeks, tz);
  if (spans[0].to <= now) return { ok: false, code: "past" };
  const what: RequestWhat = { kind: "special", action: "add", from: spans[0].from, to: spans[0].to, extraCents: input.extraCents, ...(weeks > 1 ? { weeks } : {}) };
  const m = mode(business, who, "barber_self_time");
  return withTx(async (tx) => {
    if (!(await lockStaff(tx, business, who.staffId))) return { ok: false as const, code: "not_found" as const };
    const status = m === "ask" ? "requested" : "applied";
    if (status === "applied") await insertSpecial(tx, business, who.staffId, spans, input.extraCents, note(input.note), who.userId, now);
    const id = await insertRequest(tx, business, who, { what, status, note: input.note });
    await tellOwners(tx, business, who, id, status, what);
    return { ok: true as const, id, status };
  });
}

/** Take special time away; visits already booked in it stay as they are. Only his own. */
export async function barberRemoveSpecial(business: Business, who: Who, specialId: string, now = Date.now()): Promise<{ ok: true } | { ok: false; code: ChangeCode }> {
  if (!isUuid(specialId)) return { ok: false, code: "not_found" };
  return withTx(async (tx) => {
    if (!(await lockStaff(tx, business, who.staffId))) return { ok: false as const, code: "not_found" as const };
    const [s] = await tx<{ id: string; starts_at: Date; ends_at: Date; extra_cents: number; mine: boolean }>(
      `select x.id, x.starts_at, x.ends_at, x.extra_cents, ${byHisLogin("x.created_by", "$2")} as mine
         from special_time x where x.id = $1 and x.staff_id = $2 and x.business_id = $3 and x.ends_at > $4 for update of x`,
      [specialId, who.staffId, business.id, new Date(now)],
    );
    if (!s) return { ok: false as const, code: "not_found" as const };
    if (!s.mine && !who.viewing) return { ok: false as const, code: "not_yours" as const };
    await tx("delete from special_time where id = $1", [s.id]);
    await tx(`insert into audit (actor, entity, entity_id, action, before) values ($1, 'special_time', $2, 'delete', $3::jsonb)`, [
      who.userId,
      s.id,
      JSON.stringify({ staff_id: who.staffId, from: ms(s.starts_at), to: ms(s.ends_at), extra_cents: s.extra_cents, by: who.viewing ? "admin" : "barber" }),
    ]);
    const what: RequestWhat = { kind: "special", action: "remove", from: ms(s.starts_at), to: ms(s.ends_at), extraCents: s.extra_cents };
    const id = await insertRequest(tx, business, who, { what, status: "applied" });
    await tellOwners(tx, business, who, id, "applied", what);
    return { ok: true as const };
  });
}

// ------------------------------------------------------------ weekly hours

/** His weekly template, as the admin's «Часы» keeps it (the undated rows). */
export async function weeklyHours(q: Querier, staffId: string): Promise<WeekHours> {
  const rows = await q<{ weekday: number; starts: string; ends: string }>(
    `select weekday, to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends from staff_hours
      where staff_id = $1 and valid_from is null and valid_to is null order by weekday, starts`,
    [staffId],
  );
  const out: WeekHours = {};
  for (let wd = 1; wd <= 7; wd++) out[String(wd)] = rows.filter((r) => r.weekday === wd).map((r) => [r.starts, r.ends === "23:59" ? "24:00" : r.ends]);
  return out;
}

/** Seven days of spans, checked; the same shape the admin saves. */
export function cleanWeek(days: unknown): WeekHours | null {
  if (!days || typeof days !== "object") return null;
  const out: WeekHours = {};
  for (let wd = 1; wd <= 7; wd++) {
    const spans = cleanSpans((days as Record<string, unknown>)[String(wd)] ?? []);
    if (!spans || spans.length > MAX_SPANS) return null;
    out[String(wd)] = spans;
  }
  return out;
}

async function writeHours(tx: Querier, staffId: string, week: WeekHours) {
  await tx("delete from staff_hours where staff_id = $1 and valid_from is null and valid_to is null", [staffId]);
  for (let wd = 1; wd <= 7; wd++) {
    // staff_hours.ends is a time: 24:00 is kept as 23:59, as the admin does
    for (const [a, b] of week[String(wd)] ?? []) await tx("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, $2, $3, $4)", [staffId, wd, a, b === "24:00" ? "23:59" : b]);
  }
}

const sameWeek = (a: WeekHours, b: WeekHours) => [1, 2, 3, 4, 5, 6, 7].every((wd) => JSON.stringify(a[String(wd)] ?? []) === JSON.stringify(b[String(wd)] ?? []));

/** His weekly hours. Visits already booked stay where they are. A newer request replaces one still waiting. */
export async function barberSetHours(business: Business, who: Who, days: unknown, text?: string): Promise<ChangeResult> {
  const week = cleanWeek(days);
  if (!week) return { ok: false, code: "invalid" };
  const m = mode(business, who, "barber_self_time");
  return withTx(async (tx) => {
    if (!(await lockStaff(tx, business, who.staffId))) return { ok: false as const, code: "not_found" as const };
    if (sameWeek(week, await weeklyHours(tx, who.staffId))) return { ok: false as const, code: "same" as const };
    await tx("update staff_requests set status = 'withdrawn', decided_at = now() where staff_id = $1 and kind = 'hours' and status = 'requested'", [who.staffId]);
    const status = m === "ask" ? "requested" : "applied";
    if (status === "applied") {
      await writeHours(tx, who.staffId, week);
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'hours', $3::jsonb)`, [who.userId, who.staffId, JSON.stringify(week)]);
    }
    const what: RequestWhat = { kind: "hours", days: week };
    const id = await insertRequest(tx, business, who, { what, status, note: text });
    await tellOwners(tx, business, who, id, status, what);
    return { ok: true as const, id, status };
  });
}

// ------------------------------------------------------------------ prices

export type PriceInput = { serviceId: string; priceCents: number; durationMin: number; note?: string };

async function writePrice(tx: Querier, staffId: string, serviceId: string, cents: number, min: number) {
  // a «from–to» price whose top is now under the price would read wrong: drop the top
  await tx(
    `update staff_services set price_cents = $3, duration_min = $4,
            price_max_cents = case when price_max_cents is not null and price_max_cents <= $3 then null else price_max_cents end
      where staff_id = $1 and service_id = $2`,
    [staffId, serviceId, cents, min],
  );
}

/** His price or time for a service he does. A newer request for the same service replaces one still waiting. */
export async function barberSetPrice(business: Business, who: Who, input: PriceInput): Promise<ChangeResult> {
  const { serviceId, priceCents, durationMin } = input ?? ({} as PriceInput);
  if (!isUuid(serviceId)) return { ok: false, code: "not_found" };
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 1_000_000) return { ok: false, code: "invalid" };
  if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 720 || durationMin % 5 !== 0) return { ok: false, code: "invalid" };
  const m = mode(business, who, "barber_self_price");
  return withTx(async (tx) => {
    if (!(await lockStaff(tx, business, who.staffId))) return { ok: false as const, code: "not_found" as const };
    const [o] = await tx<{ name: L10n; cents: number; min: number }>(
      `select sv.name, coalesce(ss.price_cents, sv.price_cents) as cents, coalesce(ss.duration_min, sv.duration_min) as min
         from staff_services ss join services sv on sv.id = ss.service_id
        where ss.staff_id = $1 and ss.service_id = $2 and ss.active and sv.active and sv.business_id = $3 for update of ss`,
      [who.staffId, serviceId, business.id],
    );
    if (!o) return { ok: false as const, code: "not_found" as const };
    if (o.cents === priceCents && o.min === durationMin) return { ok: false as const, code: "same" as const };
    await tx(
      "update staff_requests set status = 'withdrawn', decided_at = now() where staff_id = $1 and kind = 'price' and status = 'requested' and payload ->> 'serviceId' = $2",
      [who.staffId, serviceId],
    );
    const status = m === "ask" ? "requested" : "applied";
    if (status === "applied") {
      await writePrice(tx, who.staffId, serviceId, priceCents, durationMin);
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'price', $3::jsonb)`, [
        who.userId,
        who.staffId,
        JSON.stringify({ serviceId, priceCents, durationMin }),
      ]);
    }
    const what: RequestWhat = { kind: "price", serviceId, service: o.name, fromCents: o.cents, toCents: priceCents, fromMin: o.min, toMin: durationMin };
    const id = await insertRequest(tx, business, who, { what, status, note: input.note });
    await tellOwners(tx, business, who, id, status, what);
    return { ok: true as const, id, status };
  });
}

// -------------------------------------------------------- withdraw, answer

/** He takes back a request Renat has not answered yet; a waiting day off frees its time. */
export async function barberWithdraw(business: Business, who: Who, requestId: string): Promise<boolean> {
  if (!isUuid(requestId)) return false;
  return withTx(async (tx) => {
    if (!(await lockStaff(tx, business, who.staffId))) return false;
    const [r] = await tx<{ id: string; time_off_id: string | null }>(
      "select id, time_off_id from staff_requests where id = $1 and staff_id = $2 and business_id = $3 and status = 'requested' for update",
      [requestId, who.staffId, business.id],
    );
    if (!r) return false;
    if (r.time_off_id) await tx("delete from time_off where id = $1 and status = 'requested'", [r.time_off_id]);
    await tx("update staff_requests set status = 'withdrawn', decided_at = now() where id = $1", [r.id]);
    await tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'staff_request', $2, 'withdraw')`, [who.userId, r.id]);
    return true;
  });
}

export type AnswerResult = { ok: true } | { ok: false; code: "not_found" | "done" | "gone" | "invalid" };

/** Renat's yes or no. A yes applies what was asked; a no frees a waiting day off. The barber gets a push. */
export async function answerRequest(business: Business, actor: string, requestId: string, answer: string, text?: string, now = Date.now()): Promise<AnswerResult> {
  if (!isUuid(requestId)) return { ok: false, code: "not_found" };
  if (answer !== "approved" && answer !== "declined") return { ok: false, code: "invalid" };
  return withTx(async (tx) => {
    const [r] = await tx<{ id: string; staff_id: string; payload: unknown; status: string; time_off_id: string | null; created_by: string | null }>(
      "select id, staff_id, payload, status, time_off_id, created_by from staff_requests where id = $1 and business_id = $2 for update",
      [requestId, business.id],
    );
    if (!r) return { ok: false as const, code: "not_found" as const };
    if (r.status !== "requested") return { ok: false as const, code: "done" as const };
    const what = r.payload;
    if (!isRequestWhat(what)) return { ok: false as const, code: "invalid" as const };
    await tx("select id from staff where id = $1 for update", [r.staff_id]);
    if (what.kind === "time_off") {
      const off = r.time_off_id
        ? await tx<{ id: string }>("update time_off set status = $2 where id = $1 and status = 'requested' returning id", [r.time_off_id, answer])
        : [];
      if (!off.length) {
        await tx("update staff_requests set status = 'withdrawn', decided_at = now() where id = $1", [r.id]);
        return { ok: false as const, code: "gone" as const };
      }
    } else if (answer === "approved") {
      if (what.kind === "special") await insertSpecial(tx, business, r.staff_id, spansOf(what, business.timezone), what.extraCents, "", r.created_by ?? "staff", now);
      else if (what.kind === "hours") {
        const week = cleanWeek(what.days);
        if (!week) return { ok: false as const, code: "invalid" as const };
        await writeHours(tx, r.staff_id, week);
      } else if (what.kind === "price") {
        await writePrice(tx, r.staff_id, what.serviceId, what.toCents, what.toMin);
      }
    }
    const answerNote = note(text);
    await tx("update staff_requests set status = $2, answer_note = $3, decided_by = $4, decided_at = now() where id = $1", [r.id, answer, answerNote, actor]);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff_request', $2, $3, $4::jsonb)`, [
      actor,
      r.id,
      answer === "approved" ? "approve" : "decline",
      JSON.stringify({ staff_id: r.staff_id, note: answerNote, ...what }),
    ]);
    const payload: AnswerPayload = { requestId: r.id, answer, tz: business.timezone, what, ...(answerNote ? { note: answerNote } : {}) };
    await queuePush(tx, { businessId: business.id, kind: "request_answer", to: { staffId: r.staff_id }, exceptUserId: actor, payload });
    return { ok: true as const };
  });
}

// ------------------------------------------------------------------ lists

export type RequestRow = {
  id: string;
  staffId: string;
  staffName: string;
  what: RequestWhat;
  note: string;
  status: RequestStatus;
  answerNote: string;
  createdAt: number;
  decidedAt: number | null;
  /** visits still ahead inside a day off, counted now */
  visitsInside: number;
};

/**
 * The requests: every one still waiting, then the rest of the last `days`
 * days, newest first. `staffId` narrows it to one barber (his own list).
 * A barber's own breaks that applied at once are left out: they are his day,
 * not news for anyone (the audit keeps them).
 */
export async function listRequests(q: Querier, businessId: string, opts: { staffId?: string; days?: number; now?: number } = {}): Promise<RequestRow[]> {
  const now = opts.now ?? Date.now();
  const since = new Date(now - (opts.days ?? 14) * DAY);
  const rows = await q<{
    id: string;
    staff_id: string;
    staff_name: string;
    payload: unknown;
    note: string;
    status: RequestStatus;
    answer_note: string;
    created_at: Date;
    decided_at: Date | null;
    inside: number | null;
  }>(
    `select r.id, r.staff_id, s.display_name as staff_name, r.payload, r.note, r.status, r.answer_note, r.created_at, r.decided_at,
            (select count(*)::int from appointments a join time_off t on t.id = r.time_off_id
              where a.staff_id = r.staff_id and a.status in ('pending', 'booked', 'arrived')
                and a.starts_at < t.ends_at and a.blocked_until > greatest(t.starts_at, $4::timestamptz)) as inside
       from staff_requests r join staff s on s.id = r.staff_id
      where r.business_id = $1 and ($2::uuid is null or r.staff_id = $2::uuid)
        and (r.status = 'requested' or r.created_at > $3)
        and not (r.status = 'applied' and r.kind = 'time_off' and r.payload ->> 'offKind' = 'block')
      order by (r.status = 'requested') desc, r.created_at desc
      limit 200`,
    [businessId, opts.staffId ?? null, since, new Date(now)],
  );
  return rows
    .filter((r) => isRequestWhat(r.payload))
    .map((r) => ({
      id: r.id,
      staffId: r.staff_id,
      staffName: r.staff_name,
      what: r.payload as RequestWhat,
      note: r.note,
      status: r.status,
      answerNote: r.answer_note,
      createdAt: ms(r.created_at),
      decidedAt: r.decided_at ? ms(r.decided_at) : null,
      visitsInside: r.inside ?? 0,
    }));
}

export const openRequestCount = async (q: Querier, businessId: string) =>
  (await q<{ n: number }>("select count(*)::int as n from staff_requests where business_id = $1 and status = 'requested'", [businessId]))[0]?.n ?? 0;

export type MyOff = { id: string; from: number; to: number; kind: OffKind; status: "requested" | "approved"; note: string; mine: boolean };
export type MySpecial = { id: string; from: number; to: number; extraCents: number; mine: boolean };
export type MyPrice = { serviceId: string; name: L10n; cents: number; min: number; waiting: { cents: number; min: number; requestId: string } | null };
export type MyTime = { off: MyOff[]; special: MySpecial[]; hours: WeekHours; prices: MyPrice[]; requests: RequestRow[]; modes: Record<SelfKey, SelfMode> };

/** Everything /b/time shows: what is ahead of him and what he asked for lately. */
export async function myTime(q: Querier, business: Business, staffId: string, now = Date.now()): Promise<MyTime> {
  const [off, special, hours, prices, requests] = await Promise.all([
    q<{ id: string; starts_at: Date; ends_at: Date; kind: OffKind; status: "requested" | "approved"; note: string; mine: boolean }>(
      `select t.id, t.starts_at, t.ends_at, t.kind, t.status, t.note, ${byHisLogin("t.created_by", "$1")} as mine
         from time_off t where t.staff_id = $1 and t.ends_at > $2 and t.status <> 'declined' order by t.starts_at limit 100`,
      [staffId, new Date(now)],
    ),
    q<{ id: string; starts_at: Date; ends_at: Date; extra_cents: number; mine: boolean }>(
      `select x.id, x.starts_at, x.ends_at, x.extra_cents, ${byHisLogin("x.created_by", "$1")} as mine
         from special_time x where x.staff_id = $1 and x.business_id = $3 and x.ends_at > $2 order by x.starts_at limit 100`,
      [staffId, new Date(now), business.id],
    ),
    weeklyHours(q, staffId),
    q<{ id: string; name: L10n; cents: number; min: number; sort: number }>(
      `select sv.id, sv.name, coalesce(ss.price_cents, sv.price_cents) as cents, coalesce(ss.duration_min, sv.duration_min) as min, sv.sort
         from staff_services ss join services sv on sv.id = ss.service_id
        where ss.staff_id = $1 and ss.active and sv.active and sv.business_id = $2 order by sv.sort, sv.slug`,
      [staffId, business.id],
    ),
    listRequests(q, business.id, { staffId, days: 30, now }),
  ]);
  const waiting = new Map<string, MyPrice["waiting"]>();
  for (const r of requests) if (r.status === "requested" && r.what.kind === "price" && !waiting.has(r.what.serviceId)) waiting.set(r.what.serviceId, { cents: r.what.toCents, min: r.what.toMin, requestId: r.id });
  return {
    off: off.map((t) => ({ id: t.id, from: ms(t.starts_at), to: ms(t.ends_at), kind: t.kind, status: t.status, note: t.note, mine: t.mine })),
    special: special.map((x) => ({ id: x.id, from: ms(x.starts_at), to: ms(x.ends_at), extraCents: x.extra_cents, mine: x.mine })),
    hours,
    prices: prices.map((p) => ({ serviceId: p.id, name: p.name, cents: p.cents, min: p.min, waiting: waiting.get(p.id) ?? null })),
    requests,
    modes: { barber_self_time: business.settings.barber_self_time, barber_self_price: business.settings.barber_self_price },
  };
}

// ---------------------------------------------------------------- switches

/** Renat's switch: «now» or «ask» for time or prices. Requests already waiting stay waiting. */
export async function setBarberSelf(business: Business, actor: string, key: string, value: string): Promise<boolean> {
  if (!(SELF_KEYS as readonly string[]).includes(key) || (value !== "now" && value !== "ask")) return false;
  return withTx(async (tx) => {
    const r = await tx<{ id: string }>("update businesses set settings = settings || jsonb_build_object($2::text, $3::text) where id = $1 returning id", [business.id, key, value]);
    if (!r.length) return false;
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'business', $2, 'settings', $3::jsonb)`, [actor, business.id, JSON.stringify({ [key]: value })]);
    return true;
  });
}
