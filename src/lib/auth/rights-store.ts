/**
 * A login's rights in the database (020_rights.sql): read, the one-time
 * backfill, save, copy and the history. The door itself is rights.ts.
 *
 * **The backfill.** Until 19.11.2026 a login's role and two salon-wide
 * switches (businesses.settings: barber_self_time, barber_self_price)
 * decided everything. `legacyRights` writes that down as a set, exactly:
 * what an owner, the front desk and a barber could do the day before. It
 * runs once for every login that has no set yet (users.rights is null):
 * the first time any login of the business is read after the migration,
 * and for a login added later. **This file is the only place that still
 * reads the two switches**; nothing asks them once a login has its set.
 *
 * **Saving** keeps four rules, whatever the screen sent:
 *   - only a login that holds «Управлять правами пользователей» saves;
 *   - a login that is not an owner hands out only what it holds itself
 *     (a switch it lacks stays as it was; a value no wider than its own),
 *     and never touches an owner's login or makes an owner;
 *   - nobody takes away his own right to manage rights;
 *   - the last owner stays an owner.
 * users.role follows the preset: «Владелец» → owner, «Специалист» → staff
 * (it needs a barber to be), the other six → admin.
 *
 * Every save writes one audit row (entity «user», action «rights») with
 * the keys that went on and off: that is the rights' history.
 */
import type { Business } from "../availability";
import { withTx, type Querier } from "../db";
import { GROUPS, isRoleCode, presetRights, PRESETS, rightDef, RIGHTS, groupKey, type GroupKey, type RightValue, type RoleCode } from "./rights-catalogue";
import { can, diffRights, normalizeRights, toRights, valueWithin, type Holder, type StoredRights } from "./rights";
import type { Role } from "./sessions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------- the backfill: yesterday's behaviour, written down ---------- */

/** The two salon-wide switches for barbers, as they stood when the rights came. Read here and nowhere else. */
export type LegacySwitches = { barber_self_time?: unknown; barber_self_price?: unknown };

/**
 * What only the owner's login could do: the logins, the export, the salon's
 * own settings. «Настройки локации» (built 20.11.2026) is among them: until
 * then the salon's page changed only by SQL, which the front desk never had.
 * So are «SMS-» and «Email-уведомления» (the page «Уведомления», 20.11.2026),
 * which go with «Настройки локации» (033_notification_rights.sql), and the
 * page's door «Типы уведомлений» (038_category_and_notify_types_rights.sql).
 */
const OWNER_ONLY: readonly string[] = ["clients.export", "settings.users", "settings.users.remove", "settings.users.invite", "settings.users.rights", "settings.system", "settings.location", "notify.types", "notify.sms", "notify.email"];

/**
 * What a barber's login could do in the barber app: his own column with
 * its phones and totals, his visits (book, move, note, status, cancel with
 * a reason), his clients' card and the shared note, his own sales.
 */
const BARBER: readonly string[] = [
  "journal.phones",
  "journal.move",
  "journal.stats",
  "visit.client_data",
  "visit.client_create",
  "visit.client_list",
  "visit.client_list.phones",
  "visit.create",
  "visit.edit",
  "visit.edit.arrived",
  "visit.edit.staff_time",
  "visit.edit.comment",
  "visit.delete",
  "visit.delete.arrived",
  "visit.sell",
  "visit.sell.create",
  "visit.sell.edit",
  "clients.card_contacts",
  "clients.note",
  "clients.note.edit",
  "clients.history",
];

/** A preset's part that is not ours to decide: the group switches, and the rights whose function we do not have. */
const lockedPart = (code: RoleCode) => presetRights(code).on.filter((k) => k.startsWith("group:") || !rightDef(k)?.built);

/**
 * The set a login starts with: what its role could do before the rights.
 *   owner  everything: the «Владелец» preset as it is;
 *   admin  everything but the owner's own (OWNER_ONLY), under «Администратор»;
 *   staff  the barber app as it was (BARBER), his own column and clients,
 *          no limit on past days; his time applies at once
 *          (journal.schedule), his prices and times likewise
 *          (services.staff), unless the salon's old switch said «ask»
 *          (Renat, 18.11.2026: a barber changes all four himself). Under
 *          «Специалист».
 * The rights we have no function for follow the preset, so the screen
 * reads as that role does in the list.
 */
export function legacyRights(role: Role, switches: LegacySwitches | null | undefined, staffId: string | null): StoredRights {
  if (role === "owner") return normalizeRights({ preset: "OW", ...presetRights("OW") });
  if (role === "admin") {
    const built = RIGHTS.filter((r) => r.built && !OWNER_ONLY.includes(r.key)).map((r) => r.key as string);
    return normalizeRights({ preset: "AD", on: [...lockedPart("AD"), groupKey("staff"), groupKey("services"), ...built], values: presetRights("AD").values });
  }
  // a barber: «now» unless the switch said «ask». Time started as «now», prices as «ask», until Renat's
  // answer (18.11.2026): a barber changes his schedule, days off, prices and times himself, so both «now»;
  // 030_barbers_change_own.sql removed the switches
  const timeNow = switches?.barber_self_time !== "ask";
  const priceNow = switches?.barber_self_price !== "ask";
  const mine = staffId ? [staffId] : [];
  return normalizeRights({
    preset: "SP",
    on: [...lockedPart("SP"), groupKey("clients"), ...BARBER, ...(timeNow ? ["journal.schedule"] : []), ...(priceNow ? [groupKey("services"), "services.staff"] : [])],
    values: { ...presetRights("SP").values, "journal.staff": mine, "journal.history": null, "clients.show": mine },
  });
}

/** A login as its role was before the rights: for a test, and for what a new login of that role starts with. */
export function legacyHolder(role: Role, id: string, staffId: string | null = null, switches: LegacySwitches | null = null): Holder & { id: string } {
  return { id, role, staffId, rights: toRights(legacyRights(role, switches, staffId)) };
}

type UserRow = { id: string; business_id: string; role: Role; staff_id: string | null; active: boolean; rights_preset: string | null; rights: string[] | null; rights_values: unknown };

const storedOf = (u: Pick<UserRow, "rights_preset" | "rights" | "rights_values">): StoredRights | null =>
  u.rights && isRoleCode(u.rights_preset) ? normalizeRights({ preset: u.rights_preset, on: u.rights, values: u.rights_values }) : null;

async function writeSet(q: Querier, userId: string, s: StoredRights): Promise<void> {
  await q("update users set rights_preset = $2, rights = $3::text[], rights_values = $4::jsonb where id = $1", [userId, s.preset, s.on, JSON.stringify(s.values)]);
}

/**
 * Give every login of the business that has no set yet the one its role
 * had (`legacyRights`). Returns how many it wrote. Safe to call again: a
 * login that has a set is never touched.
 */
export async function backfillRights(q: Querier, businessId: string): Promise<number> {
  const users = await q<UserRow>("select id, business_id, role, staff_id, active, rights_preset, rights, rights_values from users where business_id = $1 and rights is null", [businessId]);
  if (!users.length) return 0;
  const [biz] = await q<{ settings: LegacySwitches | null }>("select settings from businesses where id = $1", [businessId]);
  for (const u of users) {
    const s = legacyRights(u.role, biz?.settings, u.staff_id);
    await q("update users set rights_preset = $2, rights = $3::text[], rights_values = $4::jsonb where id = $1 and rights is null", [u.id, s.preset, s.on, JSON.stringify(s.values)]);
  }
  return users.length;
}

/** One login's set, backfilled first if it has none. Null: no such login in this business. */
export async function loadRights(q: Querier, businessId: string, userId: string): Promise<StoredRights | null> {
  if (!UUID_RE.test(String(userId))) return null;
  const read = () => q<UserRow>("select id, business_id, role, staff_id, active, rights_preset, rights, rights_values from users where id = $1 and business_id = $2 and deleted_at is null", [userId, businessId]);
  let [u] = await read();
  if (!u) return null;
  if (!u.rights) {
    await backfillRights(q, businessId);
    [u] = await read();
  }
  return u ? storedOf(u) : null;
}

/** A login of the business with its rights, as the door wants it (`can(holder, …)`). Null: no such login. */
export async function loadHolder(q: Querier, businessId: string, userId: string): Promise<(Holder & { id: string }) | null> {
  const s = await loadRights(q, businessId, userId);
  if (!s) return null;
  const [u] = await q<{ role: Role; staff_id: string | null }>("select role, staff_id from users where id = $1 and business_id = $2", [userId, businessId]);
  return u ? { id: userId, role: u.role, staffId: u.staff_id, rights: toRights(s) } : null;
}

/** The set as rows gave it, for src/lib/auth/sessions.ts. Null: not backfilled yet. */
export const rightsFromRow = (row: { rights_preset: string | null; rights: string[] | null; rights_values: unknown }) => {
  const s = storedOf(row);
  return s ? toRights(s) : null;
};

/* ---------- saving ---------- */

export type RightsInput = { preset: unknown; on: unknown; values?: unknown };

export type RightsSaved =
  | { ok: true; role: Role; changed: boolean }
  | { ok: false; code: "forbidden" | "not_found" | "preset" | "owner_only" | "own_right" | "last_owner" | "needs_barber" }
  /** `keys`: what the saver does not hold himself, so cannot hand out */
  | { ok: false; code: "beyond"; keys: string[] };

/** Does this key do anything here? A right we have the function for, or the switch of a group that has one. */
const works = (key: string) => (key.startsWith("group:") ? !!GROUPS[key.slice(6) as GroupKey]?.built : !!rightDef(key)?.built);

/**
 * What a login that is not an owner may not hand out: every switch that
 * would go on and it does not hold, and every value that would be wider
 * than its own. Empty for an owner. Only what works here is counted: a
 * right whose function we do not have gives nobody anything, and a role's
 * preset carries dozens of them.
 */
export function beyondOwn(actor: Holder, before: StoredRights, next: StoredRights): string[] {
  if (actor.role === "owner") return [];
  const had = new Set(before.on);
  const out = next.on.filter((k) => works(k) && !had.has(k) && !actor.rights.on.has(k));
  for (const r of RIGHTS) {
    const kind = r.value ?? (r.period ? "period" : null);
    if (!kind || !r.built) continue;
    const a: RightValue | undefined = actor.rights.on.has(r.key) || r.period ? actor.rights.values[r.key] : kind === "scope" ? [] : 0;
    if (JSON.stringify(before.values[r.key] ?? null) !== JSON.stringify(next.values[r.key] ?? null) && !valueWithin(kind, a, next.values[r.key])) out.push(r.key);
  }
  return [...new Set(out)].sort();
}

/**
 * May this login add a login of that role? An owner may add anyone. Anyone
 * else adds no owner, and only a login whose starting set (what its role
 * had before the rights) he holds whole himself.
 */
export async function mayAddLogin(q: Querier, businessId: string, actor: Holder, role: Role, staffId: string | null): Promise<boolean> {
  if (actor.role === "owner") return true;
  if (role === "owner") return false;
  const [biz] = await q<{ settings: LegacySwitches | null }>("select settings from businesses where id = $1", [businessId]);
  const start = legacyRights(role, biz?.settings, staffId);
  return beyondOwn(actor, { preset: start.preset, on: [], values: {} }, start).length === 0;
}

/**
 * What a new login of a role starts with («Доступ» → «Новый вход», which
 * offers the rights page's eight roles; Dim, 25.11.2026). «Владелец»,
 * «Администратор» and «Специалист» start as those roles did before the
 * rights (`legacyRights`, what `backfillRights` writes); the other five
 * with their preset. Null: the adder may not hand it out, by
 * `mayAddLogin`'s rule (no owner unless he is one, and nothing he does not
 * hold himself).
 */
export async function startingSet(q: Querier, businessId: string, actor: Holder, code: RoleCode, staffId: string | null): Promise<StoredRights | null> {
  const role = PRESETS[code].role;
  if (actor.role !== "owner" && role === "owner") return null;
  const [biz] = await q<{ settings: LegacySwitches | null }>("select settings from businesses where id = $1", [businessId]);
  const set = code === "OW" || code === "AD" || code === "SP" ? legacyRights(role, biz?.settings, staffId) : normalizeRights({ preset: code, ...presetRights(code) });
  if (actor.role === "owner") return set;
  return beyondOwn(actor, { preset: set.preset, on: [], values: {} }, set).length ? null : set;
}

/** Write a new login's starting set (`startingSet`) over what its role gave it. */
export async function writeStartingSet(q: Querier, businessId: string, userId: string, set: StoredRights): Promise<void> {
  await q("update users set rights_preset = $3, rights = $4::text[], rights_values = $5::jsonb where id = $1 and business_id = $2", [userId, businessId, set.preset, set.on, JSON.stringify(set.values)]);
}

/** The whole set of one login, written at once. */
export async function saveRights(business: Business, actor: Holder & { id: string }, targetId: string, input: RightsInput): Promise<RightsSaved> {
  if (!can(actor, "settings.users.rights")) return { ok: false, code: "forbidden" };
  if (!UUID_RE.test(String(targetId))) return { ok: false, code: "not_found" };
  if (!isRoleCode(input?.preset)) return { ok: false, code: "preset" };
  const preset = input.preset;
  const next = normalizeRights({ preset, on: Array.isArray(input.on) ? input.on : [], values: input.values });
  const role = PRESETS[preset].role;
  return withTx<RightsSaved>(async (tx) => {
    await backfillRights(tx, business.id);
    const [t] = await tx<UserRow>("select id, business_id, role, staff_id, active, rights_preset, rights, rights_values from users where id = $1 and business_id = $2 and deleted_at is null for update", [targetId, business.id]);
    const before = t ? storedOf(t) : null;
    if (!t || !before) return { ok: false, code: "not_found" };
    // an owner's login, and making an owner, are an owner's alone
    if (actor.role !== "owner" && (t.role === "owner" || role === "owner")) return { ok: false, code: "owner_only" };
    const beyond = beyondOwn(actor, before, next);
    if (beyond.length) return { ok: false, code: "beyond", keys: beyond };
    if (t.id === actor.id && !can({ role, staffId: t.staff_id, rights: toRights(next) }, "settings.users.rights")) return { ok: false, code: "own_right" };
    if (t.role === "owner" && role !== "owner" && t.active) {
      const [others] = await tx<{ n: number }>("select count(*)::int as n from users where business_id = $1 and role = 'owner' and active and id <> $2", [business.id, t.id]);
      if (others.n === 0) return { ok: false, code: "last_owner" };
    }
    if (role === "staff" && !t.staff_id) return { ok: false, code: "needs_barber" };
    const d = diffRights(before, next);
    const changed = d.on.length + d.off.length + d.values.length > 0 || before.preset !== next.preset || t.role !== role;
    if (!changed) return { ok: true, role, changed: false };
    await writeSet(tx, t.id, next);
    await tx("update users set role = $2, updated_at = now() where id = $1", [t.id, role]);
    await tx(`insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'user', $2, 'rights', $3::jsonb, $4::jsonb)`, [
      actor.id,
      t.id,
      JSON.stringify({ preset: before.preset, role: t.role }),
      JSON.stringify({ preset: next.preset, role, on: d.on, off: d.off, values: Object.fromEntries(d.values.map((k) => [k, next.values[k] ?? null])) }),
    ]);
    return { ok: true, role, changed: true };
  });
}

/**
 * Another login's set, to fill this login's form with («Скопировать
 * права»). Nothing is written: the form is then saved as any other, under
 * the same rules. «His own column» stays his own: where the source's
 * scope names the barber the source is, the copy names the barber the
 * target is.
 */
export async function rightsToCopy(q: Querier, businessId: string, fromId: string, toId: string): Promise<StoredRights | null> {
  const src = await loadRights(q, businessId, fromId);
  if (!src) return null;
  const rows = await q<{ id: string; staff_id: string | null }>("select id, staff_id from users where business_id = $1 and id = any($2::uuid[])", [businessId, [fromId, toId].filter((id) => UUID_RE.test(String(id)))]);
  const from = rows.find((r) => r.id === fromId)?.staff_id ?? null;
  const to = rows.find((r) => r.id === toId)?.staff_id ?? null;
  if (!rows.some((r) => r.id === toId)) return null;
  const values = { ...src.values };
  if (from && to && from !== to) {
    for (const [k, v] of Object.entries(values)) if (Array.isArray(v)) values[k] = [...new Set(v.map((id) => (id === from ? to : id)))].sort();
  }
  return normalizeRights({ preset: src.preset, on: src.on, values });
}

/* ---------- the history ---------- */

export type RightsChange = {
  id: string;
  at: number;
  /** who saved it: his name or e-mail; empty when that login is gone */
  by: string;
  presetFrom: string | null;
  presetTo: string | null;
  on: string[];
  off: string[];
  /** the keys whose value changed */
  values: string[];
};

/** A login's rights history, newest first: the audit rows its saves wrote. */
export async function listRightsHistory(q: Querier, businessId: string, userId: string, limit = 50): Promise<RightsChange[]> {
  if (!UUID_RE.test(String(userId))) return [];
  const rows = await q<{ id: string; at: Date; by_name: string | null; by_email: string | null; before: { preset?: string } | null; after: { preset?: string; on?: string[]; off?: string[]; values?: Record<string, unknown> } | null }>(
    `select a.id::text as id, a.at, w.name as by_name, coalesce(w.deleted_was->>'email', w.email) as by_email, a.before, a.after
       from audit a join users u on u.id = a.entity_id and u.business_id = $1
       left join users w on w.id::text = a.actor
      where a.entity = 'user' and a.action = 'rights' and a.entity_id = $2
      order by a.at desc, a.id desc limit $3`,
    [businessId, userId, Math.max(1, Math.min(200, limit))],
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).getTime(),
    by: r.by_name || r.by_email || "",
    presetFrom: r.before?.preset ?? null,
    presetTo: r.after?.preset ?? null,
    on: Array.isArray(r.after?.on) ? r.after.on : [],
    off: Array.isArray(r.after?.off) ? r.after.off : [],
    values: r.after?.values && typeof r.after.values === "object" ? Object.keys(r.after.values) : [],
  }));
}
