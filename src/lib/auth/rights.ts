/**
 * The one door: `can(user, right, scope?)` answers every «may this login do
 * that?» (the owner, 19.11.2026). Server actions, routes and pages ask it;
 * a screen only hides what the server would refuse anyway.
 *
 * A login's rights are data (users.rights_preset, rights, rights_values;
 * 020_rights.sql): the role preset it was last filled from, the switches
 * that are on, and the few values. A right answers yes only when
 *   - our system has its function (`built` in rights-catalogue.ts),
 *   - its group's switch is on,
 *   - it and every right it is nested under are on,
 *   - and, with a scope, its value covers what is asked: that barber's
 *     column, that day, that client's barbers.
 *
 * users.role stays the coarse gate (which side of the app opens); it is
 * derived from the preset when rights are saved (rights-store.ts).
 *
 * No Next.js and no database here: the same function runs in a test.
 */
import { addDays } from "../tz";
import { GROUP_KEYS, GROUPS, groupKey, RIGHTS, rightDef, type GroupKey, type RightKey, type RightValue, type RightValues, type RoleCode } from "./rights-catalogue";

export type { RightKey };

export type Rights = {
  preset: RoleCode;
  /** the switches that are on: rights and group switches («group:journal») */
  on: ReadonlySet<string>;
  values: RightValues;
};

/** Whoever asks: a logged-in user, or just what of him the door needs. */
export type Holder = { role: "owner" | "admin" | "staff"; staffId: string | null; rights: Rights; id?: string };

export type Scope = {
  /** a barber's column (journal.staff), or the barber a client came to (clients.show) */
  staffId?: string;
  /** the barbers a client has had a visit with (clients.show) */
  staffIds?: readonly string[];
  /** the salon's local day the thing is on, YYYY-MM-DD, with `today` (journal.history, and a right with a period) */
  date?: string;
  today?: string;
  /** many at once (clients.delete: the bulk delete stays the owner's, as before the rights) */
  bulk?: boolean;
};

const NO_RIGHTS: Rights = { preset: "VW", on: new Set(), values: {} };

/** A stored scope: «all», or the barbers chosen. Anything else is nobody. */
export function scopeOf(v: RightValue | undefined): "all" | readonly string[] {
  if (v === "all") return "all";
  return Array.isArray(v) ? v : [];
}

/** Is it switched on, with its group and everything it is nested under? Its value is not asked. */
function isOn(r: Rights, key: RightKey): boolean {
  const def = rightDef(key);
  if (!def || !def.built) return false;
  if (def.group !== "single" && !r.on.has(groupKey(def.group))) return false;
  for (let k: RightKey | null = key; k; k = rightDef(k)?.parent ?? null) if (!r.on.has(k)) return false;
  return true;
}

/**
 * The earliest local day a login may look at, or null: no limit.
 * `journal.history` holds the days back; 0 is today only.
 */
export function historyFrom(user: Holder | null | undefined, today: string): string | null {
  const v = user?.rights.values["journal.history"];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? addDays(today, -v) : null;
}

export function can(user: Holder | null | undefined, key: RightKey, scope: Scope = {}): boolean {
  const r = user?.rights ?? NO_RIGHTS;
  if (!user || !isOn(r, key)) return false;
  const def = rightDef(key)!;
  if (def.value === "scope") {
    const who = scopeOf(r.values[key]);
    if (who !== "all") {
      if (scope.staffId !== undefined && !who.includes(scope.staffId)) return false;
      if (scope.staffIds !== undefined && !scope.staffIds.some((id) => who.includes(id))) return false;
    }
  }
  if (key === "journal.history" && scope.date !== undefined && scope.today !== undefined) {
    const from = historyFrom(user, scope.today);
    if (from !== null && scope.date < from) return false;
  }
  // a period («today»: nothing dated before today) is the right's own or one it is nested under
  if (scope.date !== undefined && scope.today !== undefined && scope.date < scope.today) {
    for (let k: RightKey | null = key; k; k = rightDef(k)?.parent ?? null) if (rightDef(k)?.period && r.values[k] === "today") return false;
  }
  // deleting many clients at once was the owner's alone before the rights, and stays so
  if (key === "clients.delete" && scope.bulk && user.role !== "owner") return false;
  return true;
}

/** Is this group's switch on? (The section itself: «Клиенты», «Услуги», «Сотрудники».) */
export function canGroup(user: Holder | null | undefined, group: GroupKey): boolean {
  return !!user && GROUPS[group].built && (group === "single" || user.rights.on.has(groupKey(group)));
}

/** Whose columns a login sees: «all», or the chosen barbers'; nobody's while the right or its group is off. */
export function seenStaff(user: Holder | null | undefined): "all" | readonly string[] {
  return user && isOn(user.rights, "journal.staff") ? scopeOf(user.rights.values["journal.staff"]) : [];
}

/** Whose clients a login sees: «all», or those of the chosen barbers; nobody's while the right or its group is off. */
export function seenClients(user: Holder | null | undefined): "all" | readonly string[] {
  return user && isOn(user.rights, "clients.show") ? scopeOf(user.rights.values["clients.show"]) : [];
}

/* ---------- what is shown instead of a hidden phone or e-mail ---------- */

/** «+3725•••••45»: enough to tell two numbers apart, not enough to call. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const p = String(phone);
  if (p.length <= 7) return "•".repeat(p.length);
  return `${p.slice(0, 5)}${"•".repeat(p.length - 7)}${p.slice(-2)}`;
}

/** «a•••@example.test» */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at < 1 ? "•••" : `${email[0]}•••${email.slice(at)}`;
}

/* ---------- a set as it is stored and edited ---------- */

export type StoredRights = { preset: RoleCode; on: string[]; values: RightValues };

const KNOWN = new Set<string>([...RIGHTS.map((r) => r.key as string), ...GROUP_KEYS.filter((g) => g !== "single").map((g) => groupKey(g) as string)]);

function cleanValue(def: { value: "scope" | "history" | null; period: boolean }, v: unknown): RightValue {
  if (def.value === "scope") {
    if (Array.isArray(v)) return [...new Set(v.map(String))].filter((s) => /^[0-9a-f-]{36}$/i.test(s)).sort();
    return "all";
  }
  if (def.value === "history") return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3660 ? v : null;
  return v === "today" ? "today" : "all";
}

/**
 * A set as it may be stored: only keys the catalogue knows, each once; a
 * right goes with its group's switch and with what it is nested under (a
 * child of something that is off is dropped, so what is stored is what
 * counts); a right with a value is on exactly while its group is; every
 * value is of its kind.
 */
export function normalizeRights(input: { preset: RoleCode; on: readonly unknown[]; values?: unknown }): StoredRights {
  const asked = new Set((Array.isArray(input.on) ? input.on : []).map(String).filter((k) => KNOWN.has(k)));
  const on = new Set<string>();
  for (const g of GROUP_KEYS) if (g !== "single" && asked.has(groupKey(g))) on.add(groupKey(g));
  // the list's order has a parent before its children
  for (const r of RIGHTS) {
    const groupOn = r.group === "single" || on.has(groupKey(r.group));
    if (!groupOn) continue;
    if (r.value) on.add(r.key);
    else if (asked.has(r.key) && (!r.parent || on.has(r.parent))) on.add(r.key);
  }
  const raw = (input.values && typeof input.values === "object" ? input.values : {}) as Record<string, unknown>;
  const values: RightValues = {};
  for (const r of RIGHTS) if (r.value || r.period) values[r.key] = cleanValue(r, raw[r.key]);
  return { preset: input.preset, on: [...on], values };
}

export const toRights = (s: StoredRights): Rights => ({ preset: s.preset, on: new Set(s.on), values: s.values });

/** How many of a group's rights are on, as the screen counts them: «N из M прав». */
export function countOn(on: ReadonlySet<string> | readonly string[], group: GroupKey): number {
  const set = on instanceof Set ? on : new Set(on as readonly string[]);
  return RIGHTS.filter((r) => r.group === group && set.has(r.key)).length;
}

const sameValue = (a: RightValue | undefined, b: RightValue | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed between two sets: the keys that went on, the keys that went off, the values that are other now. */
export function diffRights(before: StoredRights, after: StoredRights): { on: string[]; off: string[]; values: string[] } {
  const a = new Set(before.on);
  const b = new Set(after.on);
  return {
    on: after.on.filter((k) => !a.has(k)).sort(),
    off: before.on.filter((k) => !b.has(k)).sort(),
    values: [...new Set([...Object.keys(before.values), ...Object.keys(after.values)])].filter((k) => !sameValue(before.values[k], after.values[k])).sort(),
  };
}

/** Is value `b` no wider than `a`? (What a login that is not an owner may hand out: nothing beyond its own.) */
export function valueWithin(kind: "scope" | "history" | "period", a: RightValue | undefined, b: RightValue | undefined): boolean {
  if (kind === "scope") {
    const mine = scopeOf(a);
    const theirs = scopeOf(b);
    if (mine === "all") return true;
    return theirs !== "all" && theirs.every((id) => mine.includes(id));
  }
  if (kind === "history") {
    if (a == null) return true;
    return typeof b === "number" && typeof a === "number" && b <= a;
  }
  return a !== "today" || b === "today";
}
