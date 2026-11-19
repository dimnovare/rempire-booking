/**
 * One «Book» tap → one appointment, or a clear reason why not.
 *
 * In one transaction: lock the barber's staff row, re-run the free-slot
 * check (hours, breaks, time off, buffers), find or add the client by phone,
 * insert the visit and its services. The appointments_no_overlap constraint
 * backs the check. The Idempotency-Key makes a double tap or a retry return
 * the first booking instead of a second one.
 *
 * «Запретить записываться через онлайн-запись» (the client's card in the
 * admin, clients.no_online): an online booking with that client's phone is
 * refused as «invalid» with no field, which the booking page shows as its
 * plain «Что-то пошло не так… позвоните в салон». It never says why. The
 * staff still book him (source «admin»).
 */
import { createHash, randomBytes } from "node:crypto";
import { loadAvailability, type Business } from "./availability";
import { visitClientTakes } from "./client-notify";
import { withTx, type Querier } from "./db";
import { isLocale, type Locale } from "./i18n";
import { normalizePhone } from "./phone";
import { pushVisitChange } from "./push";
import { localParts } from "./tz";

export type BookingInput = {
  serviceIds: string[];
  /** a staff id, or null for «anyone» */
  staffId: string | null;
  startsAt: string; // ISO moment
  name: string;
  phone: string;
  email?: string | null;
  comment?: string | null;
  locale: Locale;
  smsReminder: boolean;
  idempotencyKey: string;
  /**
   * the special-time extra the client was shown, in cents (for a window
   * priced in percent: that percent of the barber's price for these
   * services, as /api/slots gave it); the booking fails rather than charge another
   */
  extraCents?: number | null;
};

/** Set by the server route, never read from the request body. */
export type BookOptions = { source?: "online" | "admin"; now?: number };

export type BookedVisit = {
  id: string;
  staffId: string;
  startsAt: string;
  endsAt: string;
  totalCents: number;
  /** special-time extra, included in totalCents */
  extraCents: number;
  status: string;
};

export type BookingOutcome =
  | { ok: true; visit: BookedVisit; manageToken: string | null; replay: boolean }
  | { ok: false; code: BookingErrorCode; field?: string };

export type BookingErrorCode = "invalid" | "slot_taken" | "not_offered";

/** Confirmation letters to one e-mail address in 24 hours, at most. */
export const CONFIRMATIONS_PER_DAY = 5;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * No extra a client was shown is above this. An amount window stops at
 * 1000 €, but a percent window (up to 300 %) of a long visit can come to
 * more: five services at 10 000 € each, three times over. Only a bound on
 * the number sent; the booking still wants exactly the server's own amount.
 */
const MAX_SEEN_EXTRA_CENTS = 15_000_000;

type Clean = {
  serviceIds: string[];
  staffId: string | null;
  start: number;
  name: string;
  phone: string;
  email: string | null;
  comment: string;
  locale: Locale;
  smsReminder: boolean;
  idempotencyKey: string;
  extraCents: number | null;
  source: "online" | "admin";
};

/** Every field checked and copied by name; nothing else from the body gets through. */
export function validateBooking(input: BookingInput): { ok: true; value: Omit<Clean, "source"> } | { ok: false; field: string } {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 120) return { ok: false, field: "name" };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, field: "phone" };
  const emailRaw = String(input.email ?? "").trim();
  if (emailRaw && (emailRaw.length > 254 || !EMAIL_RE.test(emailRaw))) return { ok: false, field: "email" };
  const comment = String(input.comment ?? "").trim();
  if (comment.length > 1000) return { ok: false, field: "comment" };
  const ids = [...new Set(input.serviceIds ?? [])];
  if (!ids.length || ids.length > 5 || !ids.every((id) => UUID_RE.test(id))) return { ok: false, field: "services" };
  if (input.staffId !== null && !UUID_RE.test(String(input.staffId))) return { ok: false, field: "staff" };
  const start = Date.parse(input.startsAt);
  if (!Number.isFinite(start)) return { ok: false, field: "startsAt" };
  if (!isLocale(input.locale)) return { ok: false, field: "locale" };
  const key = String(input.idempotencyKey ?? "");
  if (key.length < 16 || key.length > 200) return { ok: false, field: "idempotencyKey" };
  const extra = input.extraCents ?? null;
  if (extra !== null && !(Number.isInteger(extra) && extra >= 0 && extra <= MAX_SEEN_EXTRA_CENTS)) return { ok: false, field: "extraCents" };
  return {
    ok: true,
    value: {
      serviceIds: ids,
      staffId: input.staffId === null ? null : String(input.staffId),
      start,
      name,
      phone,
      email: emailRaw ? emailRaw.toLowerCase() : null,
      comment,
      locale: input.locale,
      smsReminder: input.smsReminder === true,
      idempotencyKey: key,
      extraCents: extra,
    },
  };
}

type VisitRow = { id: string; staff_id: string; starts_at: Date; ends_at: Date; total_cents: number; extra_cents: number; status: string };
const visitOf = (r: VisitRow): BookedVisit => ({
  id: r.id,
  staffId: r.staff_id,
  startsAt: new Date(r.starts_at).toISOString(),
  endsAt: new Date(r.ends_at).toISOString(),
  totalCents: r.total_cents,
  extraCents: r.extra_cents,
  status: r.status,
});

/** The visit booked with this key, but only for the same phone: a key is no way to read someone else's visit. */
async function findByKey(q: Querier, businessId: string, key: string, phone: string): Promise<BookedVisit | null> {
  const [row] = await q<VisitRow & { phone_e164: string }>(
    `select a.id, a.staff_id, a.starts_at, a.ends_at, a.total_cents, a.extra_cents, a.status, c.phone_e164
       from appointments a join clients c on c.id = a.client_id
      where a.idempotency_key = $1 and a.business_id = $2`,
    [key, businessId],
  );
  if (!row) return null;
  if (row.phone_e164 !== phone) throw new KeyReused();
  return visitOf(row);
}

class KeyReused extends Error {}

/** Is this phone a client's who may not book online (clients.no_online)? */
async function bannedOnline(q: Querier, businessId: string, phone: string): Promise<boolean> {
  const [row] = await q<{ id: string }>(
    "select id from clients where business_id = $1 and no_online and (phone_e164 = $2 or phone2_e164 = $2) limit 1",
    [businessId, phone],
  );
  return !!row;
}

class SlotGone extends Error {}

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string })?.code;
}

/**
 * Book. `q` reads outside the transaction (the idempotency look-up and the
 * «anyone» candidates); the write itself always goes through withTx.
 */
export async function book(q: Querier, business: Business, input: BookingInput, opts: BookOptions = {}): Promise<BookingOutcome> {
  const v = validateBooking(input);
  if (!v.ok) return { ok: false, code: "invalid", field: v.field };
  const c: Clean = { ...v.value, source: opts.source ?? "online" };
  const now = opts.now ?? Date.now();
  try {
    return await bookClean(q, business, c, now);
  } catch (err) {
    if (err instanceof KeyReused) return { ok: false, code: "invalid", field: "idempotencyKey" };
    throw err;
  }
}

async function bookClean(q: Querier, business: Business, c: Clean, now: number): Promise<BookingOutcome> {
  const replay = async () => {
    const v = await findByKey(q, business.id, c.idempotencyKey, c.phone);
    return v ? ({ ok: true, visit: v, manageToken: null, replay: true } as const) : null;
  };

  const prior = await replay();
  if (prior) return prior;

  // a client the salon does not take online bookings from: either of his two phones.
  // No field and no code of its own: the answer is the one any refused request gets
  if (c.source === "online" && (await bannedOnline(q, business.id, c.phone))) return { ok: false, code: "invalid" };

  const date = localParts(c.start, business.timezone).date;
  const look = await loadAvailability(q, { business, serviceIds: c.serviceIds, staffId: c.staffId, from: date, days: 1, now });
  if (!look.quotes.length) return { ok: false, code: "not_offered", field: c.staffId ? "staff" : "services" };
  const slot = look.days[0]?.slots.find((s) => s.start === c.start);
  if (!slot) return (await replay()) ?? { ok: false, code: "slot_taken" };

  // The price the client saw stays the price: «anyone» only tries barbers
  // at the same special-time extra. slot.extras are money already: a
  // percent window is worked out per barber, from his price for these
  // services (src/lib/slots.ts), so the same «+50 %» is another amount for
  // a barber with another price, and he is not a candidate.
  const extra = c.extraCents ?? slot.extraCents;
  const candidates = slot.staffIds.filter((_, i) => slot.extras[i] === extra);

  // «Anyone»: the best barber first, the next one if that chair went in between.
  for (const staffId of candidates) {
    try {
      const out = await withTx((tx) => insertVisit(tx, business, c, staffId, c.staffId === null, now, extra));
      return { ok: true, visit: out.visit, manageToken: out.token, replay: false };
    } catch (err) {
      if (err instanceof SlotGone || pgCode(err) === "23P01") continue;
      if (pgCode(err) === "23505") {
        const again = await replay();
        if (again) return again;
      }
      throw err;
    }
  }
  // The same tap may have won the race on another request.
  return (await replay()) ?? { ok: false, code: "slot_taken" };
}

async function insertVisit(tx: Querier, business: Business, c: Clean, staffId: string, anyStaff: boolean, now: number, extra: number) {
  // One booking at a time per barber: the check below and the insert see the same chair.
  await tx("select id from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
  const date = localParts(c.start, business.timezone).date;
  const look = await loadAvailability(tx, { business, serviceIds: c.serviceIds, staffId, from: date, days: 1, now });
  const quote = look.quotes[0];
  const slot = look.days[0]?.slots.find((s) => s.start === c.start);
  // slot.extraCents is this barber's extra for quote.priceCents, read again
  // inside the lock: a window or a price changed in between is «slot gone»
  if (!quote || !slot || slot.extraCents !== extra) throw new SlotGone();

  const services = await tx<{ id: string; name: unknown; duration_min: number; price_cents: number }>(
    `select sv.id, sv.name,
            coalesce(ss.duration_min, sv.duration_min) as duration_min,
            coalesce(ss.price_cents, sv.price_cents) as price_cents
       from services sv join staff_services ss on ss.service_id = sv.id and ss.staff_id = $1
      where sv.id = any($2::uuid[])`,
    [staffId, c.serviceIds],
  );
  const ordered = c.serviceIds.map((id) => services.find((s) => s.id === id)!);
  const endsAt = c.start + quote.durationMin * 60_000;
  const blockedUntil = endsAt + quote.bufferMin * 60_000;

  const [client] = await tx<{ id: string }>(
    `insert into clients (business_id, name, phone_e164, email, locale, source)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (business_id, phone_e164) do update
        set email = coalesce(clients.email, excluded.email),
            locale = excluded.locale,
            updated_at = now()
     returning id`,
    [business.id, c.name, c.phone, c.email, c.locale, c.source],
  );

  const token = randomBytes(24).toString("base64url");
  const [row] = await tx<VisitRow>(
    `insert into appointments
       (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, source, any_staff,
        client_comment, reminder_min, total_cents, extra_cents, locale, manage_token_hash, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $16, $13, $14, $15)
     returning id, staff_id, starts_at, ends_at, total_cents, extra_cents, status`,
    [
      business.id,
      quote.locationId,
      staffId,
      client.id,
      new Date(c.start),
      new Date(endsAt),
      new Date(blockedUntil),
      c.source,
      anyStaff,
      c.comment,
      c.smsReminder ? business.settings.reminder_min : null,
      quote.priceCents + extra,
      c.locale,
      hashToken(token),
      c.idempotencyKey,
      extra,
    ],
  );
  for (const [position, s] of ordered.entries()) {
    await tx(
      `insert into appointment_services (appointment_id, position, service_id, name, duration_min, price_cents)
       values ($1, $2, $3, $4::jsonb, $5, $6)`,
      [row.id, position, s.id, JSON.stringify(s.name), s.duration_min, s.price_cents],
    );
  }
  await tx(
    `insert into audit (actor, entity, entity_id, action, after)
     values ($1, 'appointment', $2, 'create', $3::jsonb)`,
    [c.source === "admin" ? "admin" : "client", row.id, JSON.stringify({ staff_id: staffId, starts_at: new Date(c.start).toISOString(), any_staff: anyStaff, extra_cents: extra })],
  );
  // the route sends it right after the response
  if (c.email) await queueConfirmation(tx, business.id, row.id, c.email, c.locale, now);
  // Phase B: the barber, and Renat if he wants it, hear of an online booking by push
  if (c.source === "online") {
    await pushVisitChange(tx, { businessId: business.id, appointmentId: row.id, staffIds: [staffId], kind: "visit_new", owners: { kind: "own_online" }, actor: null, now });
  }
  return { visit: visitOf(row), token };
}

/**
 * A6: queue the confirmation letter in the visit's own transaction, so
 * neither is ever without the other. Its text, link and .ics are built at
 * send time (src/lib/outbox.ts). Online and admin bookings both use it.
 * The booking form is open to anyone, so one address gets at most
 * CONFIRMATIONS_PER_DAY letters a day; the visit is booked either way.
 * A client who takes no letters, or no confirmations (his card's
 * «Уведомления», src/lib/client-notify.ts), gets none queued.
 */
export async function queueConfirmation(tx: Querier, businessId: string, appointmentId: string, email: string, locale: Locale, now = Date.now()): Promise<boolean> {
  if (!(await visitClientTakes(tx, appointmentId, "email", "confirmation"))) return false;
  // parallel bookings to one address count one after another (held to commit)
  await tx("select pg_advisory_xact_lock(hashtext('confirm:' || $1))", [email]);
  const [recent] = await tx<{ n: number }>(
    "select count(*)::int as n from notifications where kind = 'confirmation' and recipient = $1 and created_at > $2",
    [email, new Date(now - 24 * 3_600_000)],
  );
  if (recent.n >= CONFIRMATIONS_PER_DAY) return false;
  await tx(
    `insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, send_at, created_at)
     values ($1, $2, 'email', 'confirmation', $3, $4, $5, $5)`,
    [businessId, appointmentId, email, locale, new Date(now)],
  );
  return true;
}

/** A moved letter waits this long, so a few quick moves send one letter. */
export const CHANGE_LETTER_DELAY_MS = 2 * 60_000;

/**
 * A6: tell the client the salon moved or cancelled their visit (Dim,
 * 17.11.2026). Call it in the change's own transaction, with the visit row
 * locked. The letter goes only to the address this visit's confirmation
 * went to, in its language: no address learns about a visit it was not
 * already told about. If the confirmation is still queued, it is built at
 * send time and already shows the change (or is skipped when cancelled),
 * so nothing more is queued. Like the confirmation, the letter is built at
 * send time from the visit as it is then (src/lib/outbox.ts). A client who
 * has this kind or all letters switched off gets none queued.
 */
export async function queueChangeLetter(
  tx: Querier,
  businessId: string,
  appointmentId: string,
  kind: "moved" | "cancelled",
  from: { startsAt: Date; staffId: string } | null,
  now = Date.now(),
): Promise<boolean> {
  if (!(await visitClientTakes(tx, appointmentId, "email", kind))) return false;
  const [conf] = await tx<{ recipient: string; locale: string; status: string }>(
    `select recipient, locale, status from notifications
      where appointment_id = $1 and kind = 'confirmation' and channel = 'email'
      order by created_at limit 1`,
    [appointmentId],
  );
  if (!conf || (conf.status !== "sent" && conf.status !== "sending")) return false;
  if (kind === "moved") {
    // one still waiting is built from the visit as it is when it goes, and
    // keeps the time the client was told first
    const [waiting] = await tx<{ id: string }>(
      "select id from notifications where appointment_id = $1 and kind = 'moved' and status = 'queued' limit 1",
      [appointmentId],
    );
    if (waiting) return false;
  } else {
    await tx("update notifications set status = 'cancelled', locked_until = null where appointment_id = $1 and kind = 'moved' and status = 'queued'", [appointmentId]);
  }
  const [staff] = from ? await tx<{ display_name: string }>("select display_name from staff where id = $1", [from.staffId]) : [];
  const payload = from ? { fromStart: from.startsAt.toISOString(), fromStaffId: from.staffId, fromStaff: staff?.display_name ?? "" } : {};
  await tx(
    `insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, payload, send_at, created_at)
     values ($1, $2, 'email', $3, $4, $5, $6::jsonb, $7, $8)`,
    [businessId, appointmentId, kind, conf.recipient, conf.locale, JSON.stringify(payload), new Date(now + (kind === "moved" ? CHANGE_LETTER_DELAY_MS : 0)), new Date(now)],
  );
  return true;
}
