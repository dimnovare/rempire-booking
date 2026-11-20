/**
 * «Изменения данных»: the change log (decision 29, docs/kickoff.md; the
 * change log of the tool we follow, docs/altegio-pages.md, «Изменения
 * данных»). A row is one row of `audit` (001_core.sql): when, what was
 * changed (the object, named as the page shows it: a visit by its time, a
 * client by his name, an invoice by its number), who changed it, what was
 * done, and what changed, field by field, before → after.
 *
 * The authors, as the code writes them (grep `insert into audit`):
 *   a login's id        that login, by its name (a login deleted since: «gone»);
 *   «client»            the client himself, on the booking page or his visit link;
 *   «admin», «barber»   the salon, from before the login was named on the row;
 *   «cron»              the app on its own (the monthly invoice drafts);
 *   «isolta-import»     the invoices brought in from the old tool's export;
 *   anything else       the app.
 *
 * Only the owner sees it: no switch of the rights list matches it, and it
 * shows every login's work. A phone or an e-mail address inside a row is
 * masked unless the login sees the client base's contacts
 * (clients.list_contacts).
 *
 * No Next.js here: the page, its action and the tests call the same code.
 */
import type { Business } from "../availability";
import type { Querier } from "../db";
import { can, maskEmail, maskPhone, type Holder } from "../auth/rights";
import { isLocale, type Locale } from "../i18n";
import { addDays, zonedToUtc } from "../tz";
import type { ChangeFilter } from "./change-filter";

/** A value of a field as the page formats it in the reader's language. */
export type ChangeValue =
  | { t: "text"; v: string }
  /** a moment, ms */
  | { t: "time"; v: number }
  /** an amount, cents */
  | { t: "money"; v: number }
  | { t: "bool"; v: boolean }
  | { t: "list"; v: string[] }
  | { t: "none" };

export type ChangeField = { key: string; before: ChangeValue | null; after: ChangeValue | null };

export type ChangeAuthorKind = "login" | "gone" | "client" | "salon" | "barber" | "import" | "system";

export type ChangeRow = {
  id: string;
  at: number;
  entity: string;
  entityId: string | null;
  action: string;
  author: { kind: ChangeAuthorKind; name: string | null };
  /** the object as it is now: a name (a client's, a barber's, a service's, a login's, a product's), a moment (a visit's start, a review's day), a number (an invoice's); all null when it is gone */
  object: { name: string | null; at: number | null; number: string | null };
  /** what changed: a field per key of the row's before and after */
  fields: ChangeField[];
};

export type ChangeList = { total: number; page: number; pages: number; rows: ChangeRow[] };

export type ChangesMay = { open: boolean; contacts: boolean };

/** The owner's alone (users.role, as requireOwner asks it); the contacts inside whole with the client base's right. */
export function changesMay(who: Holder | null | undefined): ChangesMay {
  const open = !!who && who.role === "owner";
  return { open, contacts: open && can(who, "clients.list_contacts") };
}

const NONE: ChangeList = { total: 0, page: 1, pages: 0, rows: [] };
const UUID_SQL = "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** the keys whose value is a barber's id: shown by his name */
const STAFF_KEYS = new Set(["staff_id", "staffId", "fromStaffId"]);
/** the keys whose value is a phone or an address, whatever it looks like */
const CONTACT_KEYS = new Set(["phone", "phone2", "phone_e164", "phone2_e164", "email", "recipient"]);
const MONEY_RE = /(_cents|Cents)$|^gross$/;
const TEXT_MAX = 160;

/** A text value, uuid-safe: a phone (a «+» and digits, or seven digits in a row) and an e-mail address inside it masked. */
function maskText(s: string): string {
  if (UUID_RE.test(s)) return s;
  return s
    .replace(/[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m) ?? "•••")
    .replace(/\+\d[\d ]{5,}\d|\b\d{7,}\b/g, (m) => maskPhone(m.replace(/\s+/g, "")) ?? "•••");
}

function cut(s: string): string {
  return s.length > TEXT_MAX ? `${s.slice(0, TEXT_MAX - 1)}…` : s;
}

/** One value of a field, as the page will show it; contacts masked unless `contacts`. */
function valueOf(key: string, v: unknown, staff: ReadonlyMap<string, string>, contacts: boolean): ChangeValue {
  if (v === null || v === undefined || v === "") return { t: "none" };
  if (typeof v === "boolean") return { t: "bool", v };
  if (typeof v === "number") return MONEY_RE.test(key) ? { t: "money", v } : { t: "text", v: String(v) };
  const text = (s: string) => {
    if (contacts) return cut(s);
    if (CONTACT_KEYS.has(key)) return (s.includes("@") ? maskEmail(s) : maskPhone(s)) ?? "•••";
    return cut(maskText(s));
  };
  if (typeof v === "string") {
    if (STAFF_KEYS.has(key) && staff.has(v)) return { t: "text", v: staff.get(v)! };
    if (ISO_RE.test(v) && !Number.isNaN(Date.parse(v))) return { t: "time", v: Date.parse(v) };
    return { t: "text", v: text(v) };
  }
  if (Array.isArray(v)) return { t: "list", v: v.map((x) => (typeof x === "string" ? text(x) : x && typeof x === "object" ? text(JSON.stringify(x)) : String(x))) };
  return { t: "text", v: text(JSON.stringify(v)) };
}

const asObject = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Field by field: every key of before and after, in before's order and then after's new ones. */
export function changeFields(before: unknown, after: unknown, staff: ReadonlyMap<string, string>, contacts: boolean): ChangeField[] {
  const b = asObject(before);
  const a = asObject(after);
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  return keys.map((key) => ({
    key,
    before: b && key in b ? valueOf(key, b[key], staff, contacts) : null,
    after: a && key in a ? valueOf(key, a[key], staff, contacts) : null,
  }));
}

/** Who made a change, from the row's actor and the login it names. */
export function authorOf(actor: string, name: string | null, email: string | null): ChangeRow["author"] {
  if (name || email) return { kind: "login", name: name || (email ?? "").split("@")[0] };
  if (UUID_RE.test(actor)) return { kind: "gone", name: null };
  if (actor === "client") return { kind: "client", name: null };
  if (actor === "admin") return { kind: "salon", name: null };
  if (actor === "barber") return { kind: "barber", name: null };
  if (actor === "isolta-import") return { kind: "import", name: null };
  return { kind: "system", name: null };
}

const uuidOf = (expr: string) => `(case when ${expr} ~* ${UUID_SQL} then (${expr})::uuid end)`;

/** Every login of the business, for the author filter: the inactive ones too, they may have changed something. */
export async function changeAuthors(q: Querier, businessId: string): Promise<{ id: string; name: string }[]> {
  const rows = await q<{ id: string; name: string | null; email: string }>("select id, name, email from users where business_id = $1 order by lower(coalesce(nullif(name, ''), email)), id", [businessId]);
  return rows.map((r) => ({ id: r.id, name: r.name || r.email.split("@")[0] }));
}

/**
 * One page of the log for this filter, newest first. `who` null: no cut
 * (the tests); a login that is not the owner gets nothing. `locale` names a
 * service in the reader's language.
 */
export async function listChanges(
  q: Querier,
  business: Pick<Business, "id" | "timezone">,
  f: ChangeFilter,
  who: Holder | null = null,
  locale: Locale = "ru",
): Promise<ChangeList> {
  if (who && !changesMay(who).open) return NONE;
  const contacts = !who || can(who, "clients.list_contacts");
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  // one salon (001): the log has no business of its own
  let where = "true";
  if (f.from) where += ` and au.at >= ${p(new Date(zonedToUtc(f.from, "00:00", business.timezone)).toISOString())}::timestamptz`;
  if (f.to) where += ` and au.at < ${p(new Date(zonedToUtc(addDays(f.to, 1), "00:00", business.timezone)).toISOString())}::timestamptz`;
  if (f.entity) where += ` and au.entity = ${p(f.entity)}`;
  if (f.author === "client") where += " and au.actor = 'client'";
  else if (f.author === "system") where += ` and au.actor <> 'client' and au.actor !~* ${UUID_SQL}`;
  else if (f.author) where += ` and au.actor = ${p(f.author)}`;

  const [head] = await q<{ n: number }>(`select count(*)::int as n from audit au where ${where}`, params);
  const total = Number(head?.n ?? 0);
  if (!total) return { ...NONE, page: f.page };
  const pages = Math.ceil(total / f.size);
  const page = Math.min(f.page, pages);
  const biz = p(business.id);
  const lang = p(isLocale(locale) ? locale : "ru");
  const rows = await q<{
    id: string;
    at: Date | string;
    actor: string;
    entity: string;
    entity_id: string | null;
    action: string;
    before: unknown;
    after: unknown;
    author_name: string | null;
    author_email: string | null;
    visit_at: Date | string | null;
    client_name: string | null;
    staff_name: string | null;
    service_name: string | null;
    login_name: string | null;
    login_email: string | null;
    review_at: Date | string | null;
    review_name: string | null;
    sale_name: string | null;
    invoice_number: string | null;
    party_name: string | null;
  }>(
    `select au.id::text as id, au.at, au.actor, au.entity, au.entity_id, au.action, au.before, au.after,
            u.name as author_name, u.email as author_email,
            ap.starts_at as visit_at, cl.name as client_name, st.display_name as staff_name,
            coalesce(sv.name->>${lang}::text, sv.name->>'ru', sv.name->>'et', sv.name->>'en') as service_name,
            ou.name as login_name, ou.email as login_email,
            rv.created_at as review_at, rv.author_name as review_name, ps.name as sale_name,
            iv.number as invoice_number, coalesce(ir.legal_name, ii.legal_name) as party_name
       from audit au
       left join users u on u.business_id = ${biz}::uuid and u.id::text = au.actor
       left join appointments ap on au.entity = 'appointment' and ap.id = au.entity_id
       left join clients cl on au.entity = 'client' and cl.id = au.entity_id
       left join special_time sp on au.entity = 'special_time' and sp.id = au.entity_id
       left join time_off tf on au.entity = 'time_off' and tf.id = au.entity_id
       left join staff_requests sr on au.entity = 'staff_request' and sr.id = au.entity_id
       left join product_sales ps on au.entity = 'product_sale' and ps.id = au.entity_id
       left join invoices iv on au.entity = 'invoice' and iv.id = au.entity_id
       left join invoice_receivers ir on au.entity = 'invoice_receiver' and ir.id = au.entity_id
       left join invoice_issuers ii on au.entity = 'invoice_issuer' and ii.id = au.entity_id
       left join services sv on au.entity = 'service' and sv.id = au.entity_id
       left join users ou on au.entity = 'user' and ou.id = au.entity_id
       left join reviews rv on au.entity = 'review' and rv.id = au.entity_id
       left join staff st on st.id = (case
              when au.entity in ('staff', 'chair_rent') then au.entity_id
              when au.entity = 'appointment' then ap.staff_id
              when au.entity = 'special_time' then coalesce(sp.staff_id, ${uuidOf("au.after->>'staffId'")})
              when au.entity = 'time_off' then coalesce(tf.staff_id, ${uuidOf("au.before->>'staff_id'")}, ${uuidOf("au.after->>'staffId'")})
              when au.entity = 'staff_request' then sr.staff_id
              when au.entity = 'product_sale' then ps.staff_id
              when au.entity = 'invoice' then iv.staff_id
              when au.entity = 'invoice_receiver' then ir.staff_id
            end)
      where ${where}
      order by au.at desc, au.id desc
      limit ${p(f.size)} offset ${p((page - 1) * f.size)}`,
    params,
  );
  const staff = new Map((await q<{ id: string; display_name: string }>("select id, display_name from staff where business_id = $1", [business.id])).map((s) => [s.id, s.display_name]));
  const ms = (v: Date | string | null) => (v == null ? null : new Date(v).getTime());
  return {
    total,
    page,
    pages,
    rows: rows.map((r) => {
      const name =
        r.entity === "client"
          ? r.client_name
          : r.entity === "service"
            ? r.service_name
            : r.entity === "user"
              ? r.login_name || (r.login_email ? r.login_email.split("@")[0] : null)
              : r.entity === "review"
                ? r.review_name
                : r.entity === "product_sale"
                  ? r.sale_name
                  : r.entity === "invoice_receiver" || r.entity === "invoice_issuer"
                    ? r.party_name
                    : r.staff_name;
      return {
        id: r.id,
        at: ms(r.at)!,
        entity: r.entity,
        entityId: r.entity_id,
        action: r.action,
        author: authorOf(r.actor, r.author_name, r.author_email),
        object: {
          // a name typed as a phone is masked like one
          name: name == null ? null : contacts ? name : maskText(name),
          at: r.entity === "appointment" ? ms(r.visit_at) : r.entity === "review" ? ms(r.review_at) : null,
          number: r.entity === "invoice" ? r.invoice_number : null,
        },
        fields: changeFields(r.before, r.after, staff, contacts),
      };
    }),
  };
}
