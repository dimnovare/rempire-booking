/**
 * C1: who is on an invoice and what a chair costs (docs/phase-c.md).
 *
 *   - Issuers: REMPIRE's company (or companies), the seller on the invoice.
 *     One is the default. Its number series: prefix, optional year, digits;
 *     the last number Isolta used is set once, and never goes back.
 *   - Receivers: a barber's FIE or OÜ, or a person, with its own VAT setup
 *     (decision 13). A barber has at most one active receiver; his sales and
 *     rent go to it.
 *   - Chair rent: an amount per month from a date on. A change is a new row
 *     from its own date, so an old month keeps its rent.
 *
 * Nothing here is deleted: a receiver or issuer is switched off. Every
 * change leaves an audit row with who made it.
 */
import type { Business } from "../availability";
import { withTx, type Querier } from "../db";
import { isUuid } from "../admin/visits";

export type Issuer = {
  id: string;
  legalName: string;
  regCode: string;
  vatNumber: string;
  vatBp: number;
  address: string;
  email: string;
  phone: string;
  iban: string;
  bankName: string;
  prefix: string;
  digits: number;
  yearly: boolean;
  note: string;
  isDefault: boolean;
  active: boolean;
  /** the last number handed out in the current series (this year, or year 0) */
  lastNumber: number;
};

export type ReceiverKind = "person" | "fie" | "ou";

export type Receiver = {
  id: string;
  staffId: string | null;
  staffName: string | null;
  issuerId: string | null;
  kind: ReceiverKind;
  legalName: string;
  regCode: string;
  vatNumber: string;
  address: string;
  email: string;
  vatMode: "vat" | "none";
  termsDays: number;
  locale: "ru" | "et" | "en";
  active: boolean;
};

export type Rent = { id: string; staffId: string; amountCents: number; validFrom: string };

type Fail = { ok: false; field: string };
type Ok = { ok: true; id: string };

const s = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VAT_NO = /^[A-Z]{2}[0-9A-Z]{2,13}$/;
const IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9 ]{8,36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The serial number as printed: «RB2026-0042», «1045». */
export function formatNumber(i: Pick<Issuer, "prefix" | "digits" | "yearly">, year: number, n: number): string {
  return `${i.prefix}${i.yearly ? `${year}-` : ""}${String(n).padStart(i.digits, "0")}`;
}

/** Which counter row a series uses: the year, or 0 for one that never starts again. */
export const counterYear = (i: Pick<Issuer, "yearly">, year: number) => (i.yearly ? year : 0);

/* ---------- issuers ---------- */

type IssuerRow = {
  id: string;
  legal_name: string;
  reg_code: string;
  vat_number: string;
  vat_bp: number;
  address: string;
  email: string;
  phone: string;
  iban: string;
  bank_name: string;
  prefix: string;
  digits: number;
  yearly: boolean;
  note: string;
  is_default: boolean;
  active: boolean;
  last: number | null;
};

const issuerOf = (r: IssuerRow): Issuer => ({
  id: r.id,
  legalName: r.legal_name,
  regCode: r.reg_code,
  vatNumber: r.vat_number,
  vatBp: r.vat_bp,
  address: r.address,
  email: r.email,
  phone: r.phone,
  iban: r.iban,
  bankName: r.bank_name,
  prefix: r.prefix,
  digits: r.digits,
  yearly: r.yearly,
  note: r.note,
  isDefault: r.is_default,
  active: r.active,
  lastNumber: r.last ?? 0,
});

export async function listIssuers(q: Querier, businessId: string, year = new Date().getUTCFullYear()): Promise<Issuer[]> {
  const rows = await q<IssuerRow>(
    `select i.*, c.last from invoice_issuers i
       left join invoice_counters c on c.issuer_id = i.id and c.year = case when i.yearly then $2 else 0 end
      where i.business_id = $1 order by i.is_default desc, i.active desc, i.legal_name`,
    [businessId, year],
  );
  return rows.map(issuerOf);
}

export async function issuerById(q: Querier, businessId: string, id: string): Promise<Issuer | null> {
  if (!isUuid(id)) return null;
  const [r] = await q<IssuerRow>(`select i.*, null::int as last from invoice_issuers i where i.id = $1 and i.business_id = $2`, [id, businessId]);
  return r ? issuerOf(r) : null;
}

export type IssuerInput = {
  legalName: string;
  regCode: string;
  vatNumber: string;
  vatBp: number;
  address: string;
  email: string;
  phone: string;
  iban: string;
  bankName: string;
  prefix: string;
  digits: number;
  yearly: boolean;
  note: string;
  isDefault: boolean;
  active: boolean;
};

export function cleanIssuer(input: IssuerInput): { ok: true; v: IssuerInput } | Fail {
  const v: IssuerInput = {
    legalName: s(input.legalName, 160),
    regCode: s(input.regCode, 20),
    vatNumber: s(input.vatNumber, 20).toUpperCase().replace(/\s/g, ""),
    vatBp: Number(input.vatBp),
    address: s(input.address, 300),
    email: s(input.email, 254).toLowerCase(),
    phone: s(input.phone, 40),
    iban: s(input.iban, 42).toUpperCase(),
    bankName: s(input.bankName, 80),
    prefix: s(input.prefix, 12),
    digits: Number(input.digits),
    yearly: input.yearly === true,
    note: s(input.note, 300),
    isDefault: input.isDefault === true,
    active: input.active !== false,
  };
  if (!v.legalName) return { ok: false, field: "legalName" };
  if (v.vatNumber && !VAT_NO.test(v.vatNumber)) return { ok: false, field: "vatNumber" };
  if (!Number.isInteger(v.vatBp) || v.vatBp < 0 || v.vatBp > 10000) return { ok: false, field: "vatBp" };
  if (v.email && !EMAIL.test(v.email)) return { ok: false, field: "email" };
  if (v.iban && !IBAN.test(v.iban)) return { ok: false, field: "iban" };
  if (!/^[A-Za-z0-9/-]{0,12}$/.test(v.prefix)) return { ok: false, field: "prefix" };
  if (!Number.isInteger(v.digits) || v.digits < 0 || v.digits > 8) return { ok: false, field: "digits" };
  if (v.isDefault && !v.active) return { ok: false, field: "active" };
  return { ok: true, v };
}

export async function saveIssuer(business: Business, id: string | null, input: IssuerInput, actor: string): Promise<Ok | Fail> {
  const c = cleanIssuer(input);
  if (!c.ok) return c;
  const v = c.v;
  return withTx(async (tx) => {
    const [{ n }] = await tx<{ n: number }>("select count(*)::int as n from invoice_issuers where business_id = $1", [business.id]);
    // the first company is the default, whatever was ticked
    const isDefault = v.isDefault || n === 0 || (!!id && n === 1);
    if (isDefault) await tx("update invoice_issuers set is_default = false where business_id = $1 and is_default and id is distinct from $2::uuid", [business.id, id]);
    const params = [business.id, v.legalName, v.regCode, v.vatNumber, v.vatBp, v.address, v.email, v.phone, v.iban, v.bankName, v.prefix, v.digits, v.yearly, v.note, isDefault, v.active];
    let rowId: string;
    if (id) {
      if (!isUuid(id)) return { ok: false as const, field: "id" };
      const [row] = await tx<{ id: string }>(
        `update invoice_issuers set legal_name = $2, reg_code = $3, vat_number = $4, vat_bp = $5, address = $6, email = $7, phone = $8,
                iban = $9, bank_name = $10, prefix = $11, digits = $12, yearly = $13, note = $14, is_default = $15, active = $16, updated_at = now()
          where id = $17 and business_id = $1 returning id`,
        [...params, id],
      );
      if (!row) return { ok: false as const, field: "id" };
      // the default stays a live company
      if (!isDefault) {
        const [d] = await tx<{ n: number }>("select count(*)::int as n from invoice_issuers where business_id = $1 and is_default", [business.id]);
        if (!d.n) await tx("update invoice_issuers set is_default = true where id = $1", [id]);
      }
      rowId = row.id;
    } else {
      const [row] = await tx<{ id: string }>(
        `insert into invoice_issuers (business_id, legal_name, reg_code, vat_number, vat_bp, address, email, phone, iban, bank_name, prefix, digits, yearly, note, is_default, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning id`,
        params,
      );
      rowId = row.id;
    }
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice_issuer', $2, $3, $4::jsonb)`, [actor, rowId, id ? "edit" : "create", JSON.stringify({ legalName: v.legalName, prefix: v.prefix, isDefault })]);
    return { ok: true as const, id: rowId };
  });
}

/**
 * The last number already used in this series (Isolta's, to continue it).
 * It only goes up: a number handed out once is never handed out again.
 */
export async function setLastNumber(business: Business, issuerId: string, last: number, actor: string, year = new Date().getUTCFullYear()): Promise<{ ok: true } | Fail> {
  if (!Number.isInteger(last) || last < 0 || last > 99_999_999) return { ok: false, field: "lastNumber" };
  return withTx(async (tx) => {
    const issuer = await issuerById(tx, business.id, issuerId);
    if (!issuer) return { ok: false as const, field: "id" };
    const y = counterYear(issuer, year);
    const [row] = await tx<{ last: number }>(
      `insert into invoice_counters (issuer_id, year, last) values ($1, $2, $3)
       on conflict (issuer_id, year) do update set last = excluded.last where invoice_counters.last <= excluded.last
       returning last`,
      [issuerId, y, last],
    );
    if (!row) return { ok: false as const, field: "lastNumber" };
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice_issuer', $2, 'last_number', $3::jsonb)`, [actor, issuerId, JSON.stringify({ year: y, last })]);
    return { ok: true as const };
  });
}

/* ---------- receivers ---------- */

type ReceiverRow = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  issuer_id: string | null;
  kind: ReceiverKind;
  legal_name: string;
  reg_code: string;
  vat_number: string;
  address: string;
  email: string;
  vat_mode: "vat" | "none";
  terms_days: number;
  locale: "ru" | "et" | "en";
  active: boolean;
};

const receiverOf = (r: ReceiverRow): Receiver => ({
  id: r.id,
  staffId: r.staff_id,
  staffName: r.staff_name,
  issuerId: r.issuer_id,
  kind: r.kind,
  legalName: r.legal_name,
  regCode: r.reg_code,
  vatNumber: r.vat_number,
  address: r.address,
  email: r.email,
  vatMode: r.vat_mode,
  termsDays: r.terms_days,
  locale: r.locale,
  active: r.active,
});

const RECEIVER_SQL = `select r.*, s.display_name as staff_name from invoice_receivers r left join staff s on s.id = r.staff_id`;

export async function listReceivers(q: Querier, businessId: string): Promise<Receiver[]> {
  const rows = await q<ReceiverRow>(`${RECEIVER_SQL} where r.business_id = $1 order by r.active desc, s.sort nulls last, r.legal_name`, [businessId]);
  return rows.map(receiverOf);
}

export async function receiverById(q: Querier, businessId: string, id: string): Promise<Receiver | null> {
  if (!isUuid(id)) return null;
  const [r] = await q<ReceiverRow>(`${RECEIVER_SQL} where r.id = $1 and r.business_id = $2`, [id, businessId]);
  return r ? receiverOf(r) : null;
}

/** The barber's one active receiver, or null. */
export async function receiverForStaff(q: Querier, staffId: string): Promise<Receiver | null> {
  const [r] = await q<ReceiverRow>(`${RECEIVER_SQL} where r.staff_id = $1 and r.active`, [staffId]);
  return r ? receiverOf(r) : null;
}

export type ReceiverInput = {
  staffId: string | null;
  issuerId: string | null;
  kind: string;
  legalName: string;
  regCode: string;
  vatNumber: string;
  address: string;
  email: string;
  vatMode: string;
  termsDays: number;
  locale: string;
  active: boolean;
};

export async function saveReceiver(business: Business, id: string | null, input: ReceiverInput, actor: string): Promise<Ok | Fail> {
  const kind = (["person", "fie", "ou"] as const).find((k) => k === input.kind);
  if (!kind) return { ok: false, field: "kind" };
  const legalName = s(input.legalName, 160);
  if (!legalName) return { ok: false, field: "legalName" };
  const regCode = s(input.regCode, 20);
  // an FIE or OÜ is in the business register; a person may have no code on it
  if (kind !== "person" && !/^\d{6,12}$/.test(regCode)) return { ok: false, field: "regCode" };
  const vatNumber = s(input.vatNumber, 20).toUpperCase().replace(/\s/g, "");
  if (vatNumber && !VAT_NO.test(vatNumber)) return { ok: false, field: "vatNumber" };
  const email = s(input.email, 254).toLowerCase();
  // the invoice goes by e-mail (decision 19)
  if (!EMAIL.test(email)) return { ok: false, field: "email" };
  const vatMode = input.vatMode === "none" ? "none" : "vat";
  const termsDays = Number(input.termsDays);
  if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 120) return { ok: false, field: "termsDays" };
  const locale = (["ru", "et", "en"] as const).find((l) => l === input.locale) ?? "et";
  const active = input.active !== false;
  const staffId = input.staffId ? String(input.staffId) : null;
  const issuerId = input.issuerId ? String(input.issuerId) : null;
  if ((staffId && !isUuid(staffId)) || (issuerId && !isUuid(issuerId))) return { ok: false, field: staffId && !isUuid(staffId) ? "staffId" : "issuerId" };

  return withTx(async (tx) => {
    if (staffId) {
      const [st] = await tx("select 1 from staff where id = $1 and business_id = $2", [staffId, business.id]);
      if (!st) return { ok: false as const, field: "staffId" };
      if (active) {
        // a barber bills to one company: another active one for him is switched off
        await tx("update invoice_receivers set active = false, updated_at = now() where staff_id = $1 and active and id is distinct from $2::uuid", [staffId, id]);
      }
    }
    if (issuerId) {
      const [is] = await tx("select 1 from invoice_issuers where id = $1 and business_id = $2", [issuerId, business.id]);
      if (!is) return { ok: false as const, field: "issuerId" };
    }
    const params = [business.id, staffId, issuerId, kind, legalName, regCode, vatNumber, s(input.address, 300), email, vatMode, termsDays, locale, active];
    let rowId: string;
    if (id) {
      if (!isUuid(id)) return { ok: false as const, field: "id" };
      const [row] = await tx<{ id: string }>(
        `update invoice_receivers set staff_id = $2, issuer_id = $3, kind = $4, legal_name = $5, reg_code = $6, vat_number = $7, address = $8,
                email = $9, vat_mode = $10, terms_days = $11, locale = $12, active = $13, updated_at = now()
          where id = $14 and business_id = $1 returning id`,
        [...params, id],
      );
      if (!row) return { ok: false as const, field: "id" };
      rowId = row.id;
    } else {
      const [row] = await tx<{ id: string }>(
        `insert into invoice_receivers (business_id, staff_id, issuer_id, kind, legal_name, reg_code, vat_number, address, email, vat_mode, terms_days, locale, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        params,
      );
      rowId = row.id;
    }
    // the audit keeps what changed, not the address or codes themselves
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice_receiver', $2, $3, $4::jsonb)`, [actor, rowId, id ? "edit" : "create", JSON.stringify({ kind, staffId, vatMode, termsDays, active })]);
    return { ok: true as const, id: rowId };
  });
}

/* ---------- chair rent ---------- */

export async function listRents(q: Querier, businessId: string): Promise<Rent[]> {
  const rows = await q<{ id: string; staff_id: string; amount_cents: number; valid_from: string }>(
    `select id, staff_id, amount_cents, to_char(valid_from, 'YYYY-MM-DD') as valid_from from chair_rents where business_id = $1 order by staff_id, valid_from desc`,
    [businessId],
  );
  return rows.map((r) => ({ id: r.id, staffId: r.staff_id, amountCents: r.amount_cents, validFrom: r.valid_from }));
}

/** The rent in force on a day (the 1st of the month it bills), or null. */
export async function rentOn(q: Querier, staffId: string, day: string): Promise<Rent | null> {
  const [r] = await q<{ id: string; staff_id: string; amount_cents: number; valid_from: string }>(
    `select id, staff_id, amount_cents, to_char(valid_from, 'YYYY-MM-DD') as valid_from from chair_rents
      where staff_id = $1 and valid_from <= $2::date order by valid_from desc limit 1`,
    [staffId, day],
  );
  return r ? { id: r.id, staffId: r.staff_id, amountCents: r.amount_cents, validFrom: r.valid_from } : null;
}

/**
 * A barber's rent from a date on. The same date again replaces that row's
 * amount (a typo), unless an issued invoice already billed a month from it.
 */
export async function setRent(business: Business, staffId: string, amountCents: number, validFrom: string, actor: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(staffId)) return { ok: false, field: "staffId" };
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 10_000_000) return { ok: false, field: "amountCents" };
  if (!DATE.test(validFrom) || Number.isNaN(Date.parse(validFrom))) return { ok: false, field: "validFrom" };
  return withTx(async (tx) => {
    const [st] = await tx("select 1 from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
    if (!st) return { ok: false as const, field: "staffId" };
    const [billed] = await tx(
      `select 1 from invoice_lines l join invoices i on i.id = l.invoice_id
        where i.staff_id = $1 and l.kind = 'rent' and l.rent_month >= $2::date and i.status in ('issued', 'paid') limit 1`,
      [staffId, validFrom],
    );
    if (billed) return { ok: false as const, field: "billed" };
    await tx(
      `insert into chair_rents (business_id, staff_id, amount_cents, valid_from, created_by) values ($1, $2, $3, $4::date, $5)
       on conflict (staff_id, valid_from) do update set amount_cents = excluded.amount_cents, created_by = excluded.created_by, created_at = now()`,
      [business.id, staffId, amountCents, validFrom, isUuid(actor) ? actor : null],
    );
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'chair_rent', $2, 'set', $3::jsonb)`, [actor, staffId, JSON.stringify({ amountCents, validFrom })]);
    return { ok: true as const };
  });
}
