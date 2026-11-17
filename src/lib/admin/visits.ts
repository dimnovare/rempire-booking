/**
 * Renat's changes to the calendar: add, move, edit, cancel a visit; mark it
 * arrived, done or no-show; block time.
 *
 * Rules (the admin is the salon's own decision, so fewer than online):
 *   - two visits never share a chair: refused, always (the database's
 *     appointments_no_overlap backs the check);
 *   - outside the barber's hours or over his blocked time: allowed, but only
 *     after a second «yes» (force), as Altegio warns;
 *   - no minimum notice and no horizon: Renat may book a walk-in for now;
 *   - the price is the barber's own; a visit that starts in his special
 *     time gets that window's extra.
 * Every change takes the barber's staff row lock first (as src/lib/booking.ts)
 * and leaves an audit row with who did it.
 *
 * The barber app (Phase B) calls the same functions with a Scope: its
 * barber's staff id. A visit in another column is «not found», checked
 * under the row lock. A new, moved or cancelled visit is told by push to
 * the barber whose column it is (never to the one who made the change);
 * a barber's own move or cancel also to Renat (src/lib/push.ts).
 */
import type { Business } from "../availability";
import { queueChangeLetter, queueConfirmation } from "../booking";
import { query, withTx, type Querier } from "../db";
import { sendPushSoon } from "../outbox";
import { pushVisitChange } from "../push";
import { isLocale } from "../i18n";
import { normalizePhone } from "../phone";
import { pricedWindows, workWindows, type HoursRow, type Interval, type Special } from "../slots";
import { addDays, localParts, startOfDay } from "../tz";

export type AdminProblem = "invalid" | "overlap" | "outside_hours" | "time_off" | "not_offered" | "not_found" | "cancelled";

export type AdminOutcome =
  | { ok: true; id: string; start: number; end: number; totalCents: number; extraCents: number; replay?: boolean }
  | { ok: false; code: AdminProblem; field?: string };

export type AdminVisitInput = {
  staffId: string;
  start: number;
  serviceIds: string[];
  /** an existing client, or name (+ phone) for a new one; a walk-in may have no phone */
  clientId?: string | null;
  name?: string | null;
  phone?: string | null;
  comment?: string | null;
  staffNote?: string | null;
  smsReminder?: boolean;
  idempotencyKey: string;
  /** yes, outside the hours / over the block */
  force?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);
const MIN = 60_000;
// visits still to come; only these get a moved or cancelled letter
const LIVE_STATUSES = new Set(["pending", "booked"]);

class Problem extends Error {
  constructor(
    public code: AdminProblem,
    public field?: string,
  ) {
    super(code);
  }
}

const pgCode = (err: unknown) => (err as { code?: string })?.code;

type Line = { serviceId: string; name: unknown; durationMin: number; priceCents: number; bufferMin: number };

/** The barber's own time and price for each service, in the order asked. */
async function quoteLines(tx: Querier, businessId: string, staffId: string, serviceIds: string[]): Promise<Line[]> {
  const rows = await tx<{ id: string; name: unknown; duration_min: number; price_cents: number; buffer_after_min: number }>(
    `select sv.id, sv.name, coalesce(ss.duration_min, sv.duration_min) as duration_min,
            coalesce(ss.price_cents, sv.price_cents) as price_cents, sv.buffer_after_min
       from services sv join staff_services ss on ss.service_id = sv.id and ss.staff_id = $2 and ss.active
      where sv.business_id = $1 and sv.active and sv.id = any($3::uuid[])`,
    [businessId, staffId, serviceIds],
  );
  const out: Line[] = [];
  for (const id of serviceIds) {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new Problem("not_offered", "services");
    out.push({ serviceId: r.id, name: r.name, durationMin: r.duration_min, priceCents: r.price_cents, bufferMin: r.buffer_after_min });
  }
  return out;
}

/** One barber's working windows and special time on the local date of `at`. */
export async function staffDay(tx: Querier, business: Business, staffId: string, at: number): Promise<{ windows: Interval[]; special: Special[] }> {
  const tz = business.timezone;
  const date = localParts(at, tz).date;
  const d0 = startOfDay(date, tz);
  const d1 = startOfDay(addDays(date, 1), tz);
  const [hours, ov, sp] = await Promise.all([
    tx<HoursRow>(
      `select weekday, to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends,
              valid_from::text as valid_from, valid_to::text as valid_to from staff_hours where staff_id = $1`,
      [staffId],
    ),
    tx<{ intervals: [string, string][] }>("select intervals from staff_day_overrides where staff_id = $1 and day = $2::date", [staffId, date]),
    tx<{ starts_at: Date; ends_at: Date; extra_cents: number }>(
      "select starts_at, ends_at, extra_cents from special_time where staff_id = $1 and starts_at < $3 and ends_at > $2 order by starts_at, created_at",
      [staffId, new Date(d0), new Date(d1)],
    ),
  ]);
  return {
    windows: workWindows(date, tz, hours, ov[0] ? ov[0].intervals : null),
    special: sp.map((x) => ({ from: Math.max(new Date(x.starts_at).getTime(), d0), to: Math.min(new Date(x.ends_at).getTime(), d1), extraCents: x.extra_cents })),
  };
}

/**
 * Can the chair take [start, start + duration + buffer)? Throws «overlap»
 * always, «outside_hours» and «time_off» unless forced. Returns the extra.
 */
async function checkPlace(tx: Querier, business: Business, staffId: string, start: number, durationMin: number, bufferMin: number, ignoreId: string | null, force: boolean): Promise<number> {
  const end = start + durationMin * MIN;
  const chairEnd = end + bufferMin * MIN;
  const [clash] = await tx<{ id: string }>(
    `select id from appointments where staff_id = $1 and status <> 'cancelled' and ($4::uuid is null or id <> $4::uuid)
        and starts_at < $3 and blocked_until > $2 limit 1`,
    [staffId, new Date(start), new Date(chairEnd), ignoreId],
  );
  if (clash) throw new Problem("overlap");
  const day = await staffDay(tx, business, staffId, start);
  const priced = pricedWindows(day.windows, day.special);
  const extra = priced.find((w) => start >= w.from && start < w.to)?.extraCents ?? 0;
  if (force) return extra;
  const [off] = await tx<{ id: string }>(
    "select id from time_off where staff_id = $1 and status <> 'declined' and starts_at < $3 and ends_at > $2 limit 1",
    [staffId, new Date(start), new Date(end)],
  );
  if (off) throw new Problem("time_off");
  const fits = priced.some((w) => start >= w.from && end <= w.to) || [...day.windows, ...day.special.map((s) => [s.from, s.to] as Interval)].some(([a, b]) => start >= a && end <= b);
  if (!fits) throw new Problem("outside_hours");
  return extra;
}

async function lockStaff(tx: Querier, businessId: string, staffIds: string[]) {
  for (const id of [...new Set(staffIds)].sort()) {
    const [row] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [id, businessId]);
    if (!row) throw new Problem("invalid", "staff");
  }
}

async function audit(tx: Querier, actor: string, id: string, action: string, before: unknown, after: unknown) {
  await tx(`insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'appointment', $2, $3, $4::jsonb, $5::jsonb)`, [
    actor,
    id,
    action,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
  ]);
}

async function insertLines(tx: Querier, id: string, lines: Line[]) {
  for (const [position, l] of lines.entries()) {
    await tx(
      `insert into appointment_services (appointment_id, position, service_id, name, duration_min, price_cents)
       values ($1, $2, $3, $4::jsonb, $5, $6)`,
      [id, position, l.serviceId, JSON.stringify(l.name), l.durationMin, l.priceCents],
    );
  }
}

function cleanIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const out = [...new Set(ids.map(String))];
  return out.length >= 1 && out.length <= 8 && out.every(isUuid) ? out : null;
}

const text = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

async function wrap(fn: () => Promise<AdminOutcome>): Promise<AdminOutcome> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Problem) return { ok: false, code: err.code, field: err.field };
    if (pgCode(err) === "23P01") return { ok: false, code: "overlap" };
    throw err;
  }
}

/**
 * What a change may touch. The barber app (Phase B) passes its barber's
 * staff id: a visit in another column is «not found», checked under the
 * row lock, whatever id the phone sent.
 */
export type Scope = { onlyStaffId?: string };

/** A new visit from the admin (or a barber in his own column). */
export async function adminCreateVisit(business: Business, input: AdminVisitInput, actor: string, scope: Scope = {}): Promise<AdminOutcome> {
  if (!isUuid(input.staffId)) return { ok: false, code: "invalid", field: "staff" };
  if (scope.onlyStaffId && input.staffId !== scope.onlyStaffId) return { ok: false, code: "invalid", field: "staff" };
  if (!Number.isFinite(input.start)) return { ok: false, code: "invalid", field: "start" };
  const serviceIds = cleanIds(input.serviceIds);
  if (!serviceIds) return { ok: false, code: "invalid", field: "services" };
  const key = String(input.idempotencyKey ?? "");
  if (key.length < 16 || key.length > 200) return { ok: false, code: "invalid", field: "idempotencyKey" };
  const phoneRaw = text(input.phone, 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { ok: false, code: "invalid", field: "phone" };
  const clientId = input.clientId && isUuid(input.clientId) ? input.clientId : null;
  const name = text(input.name, 120).replace(/\s+/g, " ");
  if (!clientId && !name && !phone) return { ok: false, code: "invalid", field: "name" };
  const start = Math.round(input.start / MIN) * MIN;

  const replay = async (): Promise<AdminOutcome | null> => {
    const [r] = await query<{ id: string; starts_at: Date; ends_at: Date; total_cents: number; extra_cents: number }>(
      "select id, starts_at, ends_at, total_cents, extra_cents from appointments where idempotency_key = $1 and business_id = $2",
      [key, business.id],
    );
    return r ? { ok: true, id: r.id, start: new Date(r.starts_at).getTime(), end: new Date(r.ends_at).getTime(), totalCents: r.total_cents, extraCents: r.extra_cents, replay: true } : null;
  };
  const prior = await replay();
  if (prior) return prior;

  try {
    return await wrap(() =>
      withTx(async (tx) => {
        await lockStaff(tx, business.id, [input.staffId]);
        const [loc] = await tx<{ location_id: string }>("select location_id from staff where id = $1", [input.staffId]);
        const lines = await quoteLines(tx, business.id, input.staffId, serviceIds);
        const duration = lines.reduce((n, l) => n + l.durationMin, 0);
        const buffer = Math.max(0, ...lines.map((l) => l.bufferMin));
        const extra = await checkPlace(tx, business, input.staffId, start, duration, buffer, null, !!input.force);

        let cid = clientId;
        if (cid) {
          const [c] = await tx<{ id: string }>("select id from clients where id = $1 and business_id = $2", [cid, business.id]);
          if (!c) throw new Problem("invalid", "client");
        } else if (phone) {
          const [c] = await tx<{ id: string }>(
            `insert into clients (business_id, name, phone_e164, source) values ($1, $2, $3, 'admin')
             on conflict (business_id, phone_e164) do update set updated_at = now() returning id`,
            [business.id, name || phone, phone],
          );
          cid = c.id;
        } else {
          const [c] = await tx<{ id: string }>("insert into clients (business_id, name, source) values ($1, $2, 'admin') returning id", [business.id, name]);
          cid = c.id;
        }
        const [hasPhone] = await tx<{ phone_e164: string | null }>("select phone_e164 from clients where id = $1", [cid]);
        const end = start + duration * MIN;
        const total = lines.reduce((n, l) => n + l.priceCents, 0) + extra;
        const [row] = await tx<{ id: string }>(
          `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, source,
                                     client_comment, staff_note, reminder_min, total_cents, extra_cents, idempotency_key)
           values ($1, $2, $3, $4, $5, $6, $7, 'admin', $8, $9, $10, $11, $12, $13) returning id`,
          [
            business.id,
            loc.location_id,
            input.staffId,
            cid,
            new Date(start),
            new Date(end),
            new Date(end + buffer * MIN),
            text(input.comment, 1000),
            text(input.staffNote, 2000),
            input.smsReminder !== false && hasPhone?.phone_e164 ? business.settings.reminder_min : null,
            total,
            extra,
            key,
          ],
        );
        await insertLines(tx, row.id, lines);
        await audit(tx, actor, row.id, "create", null, { staff_id: input.staffId, starts_at: new Date(start).toISOString(), forced: !!input.force });
        // The confirmation letter (Dim, 17.11.2026), only to an e-mail from an
        // online booking this client then came to. Anyone can book online with
        // any phone and their own e-mail, and clients.email keeps the first one,
        // so the stored address proves nothing; until SMS proves the phone (A8),
        // a visit the client turned up to is the proof. The 5-minute cron sends
        // it, in the language of that booking.
        const [mail] = await tx<{ recipient: string; locale: string }>(
          `select n.recipient, n.locale
             from notifications n join appointments a on a.id = n.appointment_id
            where a.client_id = $1 and a.business_id = $2 and a.status in ('arrived', 'done')
              and n.kind = 'confirmation' and n.channel = 'email'
            order by a.starts_at desc limit 1`,
          [cid, business.id],
        );
        if (mail) await queueConfirmation(tx, business.id, row.id, mail.recipient, isLocale(mail.locale) ? mail.locale : "ru");
        await pushVisitChange(tx, { businessId: business.id, appointmentId: row.id, staffIds: [input.staffId], kind: "visit_new", actor });
        return { ok: true as const, id: row.id, start, end, totalCents: total, extraCents: extra };
      }),
    ).then(pushed);
  } catch (err) {
    if (pgCode(err) === "23505") {
      const again = await replay();
      if (again) return again;
    }
    throw err;
  }
}

export type VisitPatch = {
  staffId?: string;
  start?: number;
  serviceIds?: string[];
  staffNote?: string | null;
  comment?: string | null;
  force?: boolean;
};

/** Move a visit (time, barber) or change its services or notes, in one step. */
export async function adminUpdateVisit(business: Business, id: string, patch: VisitPatch, actor: string, scope: Scope = {}): Promise<AdminOutcome> {
  if (!isUuid(id)) return { ok: false, code: "not_found" };
  if (patch.staffId !== undefined && !isUuid(patch.staffId)) return { ok: false, code: "invalid", field: "staff" };
  if (patch.start !== undefined && !Number.isFinite(patch.start)) return { ok: false, code: "invalid", field: "start" };
  const newIds = patch.serviceIds === undefined ? null : cleanIds(patch.serviceIds);
  if (patch.serviceIds !== undefined && !newIds) return { ok: false, code: "invalid", field: "services" };

  return wrap(() =>
    withTx(async (tx) => {
      const [cur] = await tx<{ id: string; staff_id: string; starts_at: Date; ends_at: Date; status: string; total_cents: number; extra_cents: number; staff_note: string; client_comment: string }>(
        `select id, staff_id, starts_at, ends_at, status, total_cents, extra_cents, staff_note, client_comment
           from appointments where id = $1 and business_id = $2 for update`,
        [id, business.id],
      );
      if (!cur) throw new Problem("not_found");
      if (scope.onlyStaffId && cur.staff_id !== scope.onlyStaffId) throw new Problem("not_found");
      if (scope.onlyStaffId && patch.staffId !== undefined && patch.staffId !== scope.onlyStaffId) throw new Problem("invalid", "staff");
      if (cur.status === "cancelled") throw new Problem("cancelled");
      const staffId = patch.staffId ?? cur.staff_id;
      const start = patch.start !== undefined ? Math.round(patch.start / MIN) * MIN : new Date(cur.starts_at).getTime();
      await lockStaff(tx, business.id, [cur.staff_id, staffId]);

      const oldLines = await tx<{ service_id: string; name: unknown; duration_min: number; price_cents: number; buffer_after_min: number }>(
        `select l.service_id, l.name, l.duration_min, l.price_cents, sv.buffer_after_min
           from appointment_services l join services sv on sv.id = l.service_id
          where l.appointment_id = $1 order by l.position`,
        [id],
      );
      const requote = staffId !== cur.staff_id || (newIds !== null && newIds.join() !== oldLines.map((l) => l.service_id).join());
      const lines: Line[] = requote
        ? await quoteLines(tx, business.id, staffId, newIds ?? oldLines.map((l) => l.service_id))
        : oldLines.map((l) => ({ serviceId: l.service_id, name: l.name, durationMin: l.duration_min, priceCents: l.price_cents, bufferMin: l.buffer_after_min }));
      const duration = lines.reduce((n, l) => n + l.durationMin, 0);
      const buffer = Math.max(0, ...lines.map((l) => l.bufferMin));
      const moved = staffId !== cur.staff_id || start !== new Date(cur.starts_at).getTime();
      const extra = moved || requote ? await checkPlace(tx, business, staffId, start, duration, buffer, id, !!patch.force) : cur.extra_cents;
      const end = start + duration * MIN;
      const total = lines.reduce((n, l) => n + l.priceCents, 0) + extra;
      await tx(
        `update appointments set staff_id = $2, starts_at = $3, ends_at = $4, blocked_until = $5, total_cents = $6, extra_cents = $7,
                any_staff = any_staff and staff_id = $2, staff_note = $8, client_comment = $9, updated_at = now()
          where id = $1`,
        [id, staffId, new Date(start), new Date(end), new Date(end + buffer * MIN), total, extra, patch.staffNote == null ? cur.staff_note : text(patch.staffNote, 2000), patch.comment == null ? cur.client_comment : text(patch.comment, 1000)],
      );
      if (requote) {
        await tx("delete from appointment_services where appointment_id = $1", [id]);
        await insertLines(tx, id, lines);
      }
      await audit(
        tx,
        actor,
        id,
        moved ? "move" : "edit",
        { staff_id: cur.staff_id, starts_at: new Date(cur.starts_at).toISOString(), total_cents: cur.total_cents },
        { staff_id: staffId, starts_at: new Date(start).toISOString(), total_cents: total, forced: !!patch.force },
      );
      // a new time or barber for a visit still ahead: the client hears of it
      // (only at the address its confirmation went to; src/lib/booking.ts)
      const now = Date.now();
      if (moved && LIVE_STATUSES.has(cur.status) && new Date(cur.starts_at).getTime() > now && start > now) {
        await queueChangeLetter(tx, business.id, id, "moved", { startsAt: new Date(cur.starts_at), staffId: cur.staff_id }, now);
      }
      if (moved) {
        await pushVisitChange(tx, {
          businessId: business.id,
          appointmentId: id,
          staffIds: [cur.staff_id, staffId],
          kind: "visit_moved",
          owners: scope.onlyStaffId ? { kind: "own_barber", action: "moved" } : null,
          actor,
          extra: { fromStart: new Date(cur.starts_at).toISOString() },
          now,
        });
      }
      return { ok: true as const, id, start, end, totalCents: total, extraCents: extra };
    }),
  ).then(pushed);
}

/** After a change that may have queued a push: send it right after the response. */
function pushed<T extends { ok: boolean }>(out: T): T {
  if (out.ok) sendPushSoon();
  return out;
}

/**
 * Cancel a visit. From the barber app (scope set) it is an emergency
 * cancel: the reason is kept in the audit row and goes to Renat by push.
 */
export async function adminCancelVisit(
  business: Business,
  id: string,
  actor: string,
  scope: Scope & { reason?: string | null } = {},
): Promise<"cancelled" | "already" | "not_found"> {
  if (!isUuid(id)) return "not_found";
  const reason = text(scope.reason, 300);
  const out = await withTx(async (tx) => {
    const [cur] = await tx<{ status: string; starts_at: Date; staff_id: string }>(
      "select status, starts_at, staff_id from appointments where id = $1 and business_id = $2 for update",
      [id, business.id],
    );
    if (!cur) return "not_found";
    if (scope.onlyStaffId && cur.staff_id !== scope.onlyStaffId) return "not_found";
    if (cur.status === "cancelled") return "already";
    await tx("update appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, updated_at = now() where id = $1", [id, actor]);
    await audit(tx, actor, id, "cancel", { status: cur.status }, reason ? { status: "cancelled", reason } : { status: "cancelled" });
    if (LIVE_STATUSES.has(cur.status) && new Date(cur.starts_at).getTime() > Date.now()) {
      await queueChangeLetter(tx, business.id, id, "cancelled", null);
    }
    await pushVisitChange(tx, {
      businessId: business.id,
      appointmentId: id,
      staffIds: [cur.staff_id],
      kind: "visit_cancelled",
      owners: scope.onlyStaffId ? { kind: "own_barber", action: "cancelled" } : null,
      actor,
      extra: reason ? { reason } : {},
    });
    return "cancelled" as const;
  });
  if (out === "cancelled") sendPushSoon();
  return out;
}

export const VISIT_STATUSES = ["booked", "arrived", "done", "no_show"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export async function adminSetStatus(business: Business, id: string, status: string, actor: string, scope: Scope = {}): Promise<boolean> {
  if (!isUuid(id) || !(VISIT_STATUSES as readonly string[]).includes(status)) return false;
  return withTx(async (tx) => {
    const [cur] = await tx<{ status: string; staff_id: string }>("select status, staff_id from appointments where id = $1 and business_id = $2 for update", [id, business.id]);
    if (!cur || cur.status === "cancelled") return false;
    if (scope.onlyStaffId && cur.staff_id !== scope.onlyStaffId) return false;
    if (cur.status === status) return true;
    await tx("update appointments set status = $2, updated_at = now() where id = $1", [id, status]);
    await audit(tx, actor, id, "status", { status: cur.status }, { status });
    return true;
  });
}

export const BLOCK_KINDS = ["block", "vacation", "sick"] as const;

export type BlockResult = { ok: true; id: string; visitsInside: number } | { ok: false; field: string };

/** Blocked time: a break, a vacation, sick days. Visits inside it stay; the answer counts them. */
export async function addTimeOff(
  business: Business,
  input: { staffId: string; from: number; to: number; kind: string; note?: string | null },
  actor: string,
): Promise<BlockResult> {
  if (!isUuid(input.staffId)) return { ok: false, field: "staff" };
  if (!Number.isFinite(input.from) || !Number.isFinite(input.to) || input.to <= input.from) return { ok: false, field: "to" };
  if (input.to - input.from > 366 * 86_400_000) return { ok: false, field: "to" };
  if (!(BLOCK_KINDS as readonly string[]).includes(input.kind)) return { ok: false, field: "kind" };
  return withTx(async (tx) => {
    const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [input.staffId, business.id]);
    if (!st) return { ok: false as const, field: "staff" };
    const [row] = await tx<{ id: string }>(
      `insert into time_off (staff_id, starts_at, ends_at, kind, status, note, created_by)
       values ($1, $2, $3, $4, 'approved', $5, null) returning id`,
      [input.staffId, new Date(input.from), new Date(input.to), input.kind, text(input.note, 300)],
    );
    const [n] = await tx<{ n: number }>(
      "select count(*)::int as n from appointments where staff_id = $1 and status <> 'cancelled' and starts_at < $3 and blocked_until > $2",
      [input.staffId, new Date(input.from), new Date(input.to)],
    );
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'time_off', $2, 'create', $3::jsonb)`, [
      actor,
      row.id,
      JSON.stringify({ staff_id: input.staffId, from: new Date(input.from).toISOString(), to: new Date(input.to).toISOString(), kind: input.kind }),
    ]);
    return { ok: true as const, id: row.id, visitsInside: n.n };
  });
}

export async function removeTimeOff(business: Business, id: string, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return withTx(async (tx) => {
    const [row] = await tx<{ staff_id: string; starts_at: Date; ends_at: Date; kind: string }>(
      `select t.staff_id, t.starts_at, t.ends_at, t.kind from time_off t join staff s on s.id = t.staff_id
        where t.id = $1 and s.business_id = $2`,
      [id, business.id],
    );
    if (!row) return false;
    await tx("select id from staff where id = $1 for update", [row.staff_id]);
    await tx("delete from time_off where id = $1", [id]);
    await tx(`insert into audit (actor, entity, entity_id, action, before) values ($1, 'time_off', $2, 'delete', $3::jsonb)`, [actor, id, JSON.stringify(row)]);
    return true;
  });
}
