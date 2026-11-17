/**
 * The client's change-or-cancel link: /{locale}/visit/{token}. The token is
 * a secret only the client has; the database keeps its sha-256: the booking
 * screen's in appointments.manage_token_hash, each letter's or SMS's own in
 * visit_links (006). Either one opens the visit.
 */
import { randomBytes } from "node:crypto";
import type { Business } from "./availability";
import { hashToken } from "./booking";
import { withTx, type Querier } from "./db";
import type { L10n } from "./catalog";

export type VisitView = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalCents: number;
  /** special-time extra, included in totalCents */
  extraCents: number;
  staffId: string;
  staffName: string;
  anyStaff: boolean;
  clientName: string;
  locale: string;
  reminder: boolean;
  services: { serviceId: string; name: L10n; durationMin: number; priceCents: number }[];
  location: { name: string; address: string; phone: string };
};

const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

// the visit a token opens: the booking screen's link or a message's own
const BY_TOKEN = `(select id from appointments where manage_token_hash = $1
                   union all
                   select appointment_id from visit_links where token_hash = $1
                   limit 1)`;

export async function findVisit(q: Querier, businessId: string, token: string): Promise<VisitView | null> {
  if (!TOKEN_RE.test(token)) return null;
  return loadVisit(q, `a.id = ${BY_TOKEN} and a.business_id = $2`, [hashToken(token), businessId]);
}

/** The same view by id, for messages built at send time. */
export async function visitById(q: Querier, id: string): Promise<VisitView | null> {
  return loadVisit(q, "a.id = $1", [id]);
}

/**
 * A new change-or-cancel link for a visit, for one message. Only its hash
 * is stored; the token goes out in the message and nowhere else.
 */
export async function mintVisitLink(q: Querier, appointmentId: string, purpose: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await q("insert into visit_links (token_hash, appointment_id, purpose) values ($1, $2, $3)", [hashToken(token), appointmentId, purpose]);
  return token;
}

async function loadVisit(q: Querier, where: string, params: unknown[]): Promise<VisitView | null> {
  const [row] = await q<{
    id: string;
    status: string;
    starts_at: Date;
    ends_at: Date;
    total_cents: number;
    extra_cents: number;
    staff_id: string;
    staff_name: string;
    any_staff: boolean;
    client_name: string;
    locale: string;
    reminder_min: number | null;
    loc_name: string;
    address: string;
    phone: string;
  }>(
    `select a.id, a.status, a.starts_at, a.ends_at, a.total_cents, a.extra_cents, a.staff_id, s.display_name as staff_name,
            a.any_staff, c.name as client_name, a.locale, a.reminder_min,
            l.name as loc_name, l.address, l.phone
       from appointments a
       join staff s on s.id = a.staff_id
       join clients c on c.id = a.client_id
       join locations l on l.id = a.location_id
      where ${where}`,
    params,
  );
  if (!row) return null;
  const services = await q<{ service_id: string; name: L10n; duration_min: number; price_cents: number }>(
    "select service_id, name, duration_min, price_cents from appointment_services where appointment_id = $1 order by position",
    [row.id],
  );
  return {
    id: row.id,
    status: row.status,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    totalCents: row.total_cents,
    extraCents: row.extra_cents,
    staffId: row.staff_id,
    staffName: row.staff_name,
    anyStaff: row.any_staff,
    clientName: row.client_name,
    locale: row.locale,
    reminder: row.reminder_min != null,
    services: services.map((s) => ({ serviceId: s.service_id, name: s.name, durationMin: s.duration_min, priceCents: s.price_cents })),
    location: { name: row.loc_name, address: row.address, phone: row.phone },
  };
}

export type CancelOutcome = "cancelled" | "already" | "too_late" | "not_found";

/** May the client still change or cancel it online? */
export function canChange(v: Pick<VisitView, "status" | "startsAt">, business: Business, now = Date.now()): boolean {
  return (v.status === "booked" || v.status === "pending") && Date.parse(v.startsAt) - now >= business.settings.cancel_cutoff_min * 60_000;
}

export async function cancelByClient(business: Business, token: string, now = Date.now()): Promise<CancelOutcome> {
  if (!TOKEN_RE.test(token)) return "not_found";
  return withTx(async (tx) => {
    const [row] = await tx<{ id: string; status: string; starts_at: Date; staff_id: string }>(
      `select id, status, starts_at, staff_id from appointments
        where id = ${BY_TOKEN} and business_id = $2 for update`,
      [hashToken(token), business.id],
    );
    if (!row) return "not_found";
    if (row.status === "cancelled") return "already";
    if (!canChange({ status: row.status, startsAt: new Date(row.starts_at).toISOString() }, business, now)) return "too_late";
    await tx(
      "update appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = 'client', updated_at = now() where id = $1",
      [row.id],
    );
    await tx(
      `insert into audit (actor, entity, entity_id, action, before, after)
       values ('client', 'appointment', $1, 'cancel', $2::jsonb, '{"status":"cancelled"}'::jsonb)`,
      [row.id, JSON.stringify({ status: row.status })],
    );
    return "cancelled";
  });
}
