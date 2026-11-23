/**
 * The client's card in the barber app (Phase B, B6; docs/phase-b.md): only
 * for a client who has a visit in this barber's column, and only his own
 * visits with that client. The shared note (clients.staff_note) is one per
 * client: every barber and Renat read and write the same one (Dim, round 5).
 * The visit's own note (appointments.staff_note) is his visit's only.
 *
 * With a login (`who`) its rights are asked (src/lib/auth/rights.ts): the
 * card needs the clients' data in a visit and the column's clients to be
 * its to see; the phone, the note and the past visits each have a right.
 */
import { can, maskPhone, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { isUuid } from "../admin/visits";
import { withTx, type Querier } from "../db";
import { localParts, todayIn } from "../tz";
import { columnClientsSeen, isMyClient } from "./book";

export const NOTE_MAX = 1000;

export type CardVisit = {
  id: string;
  start: number;
  status: string;
  totalCents: number;
  services: { serviceId: string; name: L10n }[];
};

export type ClientCard = {
  id: string;
  name: string;
  phone: string | null;
  /** the phone is whole, so it can be called; false: masked (no right to the card's phone) */
  callable: boolean;
  note: string;
  /** his visits with this client still to come, soonest first */
  ahead: CardVisit[];
  /** his visits with this client that are over, newest first (at most `PAST_MAX`) */
  past: CardVisit[];
  /** all of them, cancelled ones left out */
  count: number;
  noShows: number;
};

export const PAST_MAX = 20;
const ms = (d: Date | string) => new Date(d).getTime();
const clean = (s: unknown) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, NOTE_MAX);

/** The card, or null when this client has never had a visit in his column. */
export async function clientCard(q: Querier, business: Business, staffId: string, clientId: string, now = Date.now(), who?: Holder): Promise<ClientCard | null> {
  if (who && (!can(who, "visit.client_data") || !columnClientsSeen(who, staffId))) return null;
  if (!isUuid(staffId) || !(await isMyClient(q, business.id, staffId, clientId))) return null;
  const [c] = await q<{ id: string; name: string; phone_e164: string | null; staff_note: string }>(
    "select id, name, phone_e164, staff_note from clients where id = $1 and business_id = $2",
    [clientId, business.id],
  );
  if (!c) return null;
  const rows = await q<{ id: string; starts_at: Date; status: string; total_cents: number; services: { serviceId: string; name: L10n }[] | null }>(
    `select a.id, a.starts_at, a.status, a.total_cents,
            (select json_agg(json_build_object('serviceId', l.service_id, 'name', sv.name) order by l.position)
               from appointment_services l join services sv on sv.id = l.service_id where l.appointment_id = a.id) as services
       from appointments a
      where a.business_id = $1 and a.staff_id = $2 and a.client_id = $3 and a.status <> 'cancelled'
      order by a.starts_at desc
      limit 200`,
    [business.id, staffId, clientId],
  );
  const visits = rows.map((r) => ({ id: r.id, start: ms(r.starts_at), status: r.status, totalCents: r.total_cents, services: r.services ?? [] }));
  const isAhead = (v: CardVisit) => v.start >= now && (v.status === "booked" || v.status === "pending");
  // the visits that are over are his history with the client: «Просмотр истории посещений клиента»
  const history = !who || can(who, "clients.history");
  const ahead = visits.filter(isAhead).reverse();
  return {
    id: c.id,
    name: c.name,
    phone: !who || can(who, "clients.card_contacts") ? c.phone_e164 : maskPhone(c.phone_e164),
    callable: !who || can(who, "clients.card_contacts"),
    note: !who || can(who, "clients.note") ? c.staff_note : "",
    ahead,
    past: history ? visits.filter((v) => !isAhead(v)).slice(0, PAST_MAX) : [],
    count: history ? visits.length : ahead.length,
    noShows: history ? visits.filter((v) => v.status === "no_show").length : 0,
  };
}

/** The shared note about a client of his. Everyone who sees the client sees it. */
export async function setClientNote(business: Business, staffId: string, actor: string, clientId: string, note: unknown, who?: Holder): Promise<boolean> {
  if (who && (!can(who, "clients.note.edit") || !columnClientsSeen(who, staffId))) return false;
  const text = clean(note);
  return withTx(async (tx) => {
    if (!(await isMyClient(tx, business.id, staffId, clientId))) return false;
    // an anonymised client gets no note again (src/lib/admin/clients.ts, anonymiseClient)
    const [c] = await tx<{ staff_note: string }>("select staff_note from clients where id = $1 and business_id = $2 and anonymised_at is null for update", [clientId, business.id]);
    if (!c) return false;
    if (c.staff_note === text) return true;
    await tx("update clients set staff_note = $2, updated_at = now() where id = $1", [clientId, text]);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'client', $2, 'note', $3::jsonb)`, [actor, clientId, JSON.stringify({ by: "barber", staff_id: staffId, length: text.length })]);
    return true;
  });
}

/** The note on one of his own visits. */
export async function setVisitNote(business: Business, staffId: string, actor: string, visitId: string, note: unknown, who?: Holder): Promise<boolean> {
  if (!isUuid(visitId) || !isUuid(staffId)) return false;
  const text = clean(note);
  return withTx(async (tx) => {
    const [a] = await tx<{ staff_note: string; status: string; starts_at: Date }>(
      "select staff_note, status, starts_at from appointments where id = $1 and business_id = $2 and staff_id = $3 for update",
      [visitId, business.id, staffId],
    );
    if (!a) return false;
    if (a.staff_note === text) return true;
    if (who) {
      // «Изменять комментарий», of a visit in a column he sees; one the client has come to has its own right
      const at = { date: localParts(new Date(a.starts_at).getTime(), business.timezone).date, today: todayIn(business.timezone) };
      if (!can(who, "journal.staff", { staffId }) || !can(who, "visit.edit.comment", at)) return false;
      if ((a.status === "arrived" || a.status === "done") && !can(who, "visit.edit.arrived", at)) return false;
    }
    await tx("update appointments set staff_note = $2, updated_at = now() where id = $1", [visitId, text]);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'appointment', $2, 'note', $3::jsonb)`, [actor, visitId, JSON.stringify({ by: "barber", length: text.length })]);
    return true;
  });
}
