"use server";

/**
 * «Счета» (Phase C): every change goes through src/lib/billing and
 * src/lib/sales, which check what is allowed (a draft only while it is a
 * draft, an issued invoice never). Renat and the front desk use them;
 * the company, its numbers and the 17 % are the owner's.
 */
import { refresh } from "next/cache";
import { after } from "next/server";
import { requireAdmin, requireOwner } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { query } from "@/lib/db";
import { runOutbox } from "@/lib/outbox";
import {
  addDraftLine,
  copyInvoice,
  creditInvoice,
  discardDraft,
  dropDraftLine,
  invoiceById,
  issueInvoice,
  makeDrafts,
  openDraft,
  paidMoment,
  resendInvoice,
  setDraftNote,
  setDraftReceiver,
  setPaid,
  updateDraftLine,
  type LineInput,
} from "@/lib/billing/invoices";
import { saveIssuer, saveReceiver, setLastNumber, setRent, type IssuerInput, type ReceiverInput } from "@/lib/billing/parties";
import { findLineItems, pickedVat, type FoundItems, type LinePick } from "@/lib/billing/picker";
import { saveMoneySettings } from "@/lib/billing/settings";
import { retrySale, reverseSale } from "@/lib/sales";
import { localParts, todayIn } from "@/lib/tz";
import { adminLang } from "../../lang-server";

const str = (v: unknown, max = 400) => String(v ?? "").slice(0, max);
const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);

/** The invoice letter goes right after the response, not at the next cron run. */
function sendSoon(): void {
  try {
    after(async () => {
      try {
        await runOutbox(query);
      } catch (err) {
        console.error("[invoice] send after issue failed:", err instanceof Error ? err.message : err);
      }
    });
  } catch {
    /* not in a request: the cron sends it */
  }
}

/* ---------- C1: the company, receivers, rent ---------- */

export async function saveIssuerAction(id: string | null, f: IssuerInput): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  const { user, business } = await requireOwner();
  const r = await saveIssuer(
    business,
    id ? str(id, 64) : null,
    {
      legalName: str(f?.legalName),
      regCode: str(f?.regCode, 40),
      vatNumber: str(f?.vatNumber, 40),
      vatBp: int(f?.vatBp),
      address: str(f?.address),
      email: str(f?.email, 200),
      phone: str(f?.phone, 60),
      iban: str(f?.iban, 60),
      bankName: str(f?.bankName, 120),
      prefix: str(f?.prefix, 20),
      digits: int(f?.digits),
      yearly: f?.yearly === true,
      note: str(f?.note, 600),
      isDefault: f?.isDefault !== false,
      active: f?.active !== false,
    },
    user.id,
  );
  if (r.ok) refresh();
  return r;
}

export async function setLastNumberAction(issuerId: string, last: number): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireOwner();
  const r = await setLastNumber(business, str(issuerId, 64), int(last), user.id);
  if (r.ok) refresh();
  return r;
}

export async function saveMoneyAction(v: { commission_bp: number; commission_basis: string; billing_day: number }): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireOwner();
  const r = await saveMoneySettings(business, user.id, { commission_bp: int(v?.commission_bp), commission_basis: str(v?.commission_basis, 20), billing_day: int(v?.billing_day) });
  if (r.ok) refresh();
  return r;
}

export async function saveReceiverAction(id: string | null, f: ReceiverInput): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const r = await saveReceiver(
    business,
    id ? str(id, 64) : null,
    {
      staffId: f?.staffId ? str(f.staffId, 64) : null,
      issuerId: f?.issuerId ? str(f.issuerId, 64) : null,
      kind: str(f?.kind, 10),
      legalName: str(f?.legalName),
      regCode: str(f?.regCode, 40),
      vatNumber: str(f?.vatNumber, 40),
      address: str(f?.address),
      email: str(f?.email, 200),
      // left out, the phone stays as it is (saveReceiver)
      phone: f?.phone === undefined ? undefined : str(f.phone, 60),
      vatMode: str(f?.vatMode, 10),
      termsDays: int(f?.termsDays),
      locale: str(f?.locale, 4),
      active: f?.active !== false,
    },
    user.id,
  );
  if (r.ok) refresh();
  return r;
}

export async function setRentAction(staffId: string, amountCents: number, validFrom: string): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const r = await setRent(business, str(staffId, 64), int(amountCents), str(validFrom, 10), user.id);
  if (r.ok) refresh();
  return r;
}

/* ---------- C5: drafts and invoices ---------- */

export async function makeDraftsAction(month: string): Promise<{ made: number; exists: number; nothing: number; problems: string[] }> {
  const { user, business } = await requireAdmin();
  const r = await makeDrafts(business, str(month, 7), user.id);
  refresh();
  return { made: r.made, exists: r.exists, nothing: r.nothing, problems: r.problems.map((p) => p.receiver) };
}

/** «Новый счёт» → the receiver: the draft to open for him (the one he has, the month's, or a free one). */
export async function newInvoiceAction(receiverId: string): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const { user, business } = await requireAdmin();
  const r = await openDraft(business, str(receiverId, 40), user.id);
  if (!r.ok) return r;
  refresh();
  return { ok: true, id: r.id };
}

const line = (f: LineInput): LineInput => ({ text: str(f?.text, 300), qty: int(f?.qty), unitCents: int(f?.unitCents), discountCents: int(f?.discountCents ?? 0) });

/**
 * What a line's name can be picked from: the shop's products and the
 * salon's services, by a few letters (src/lib/billing/picker.ts). Read-only.
 */
export async function findLineItemsAction(text: string): Promise<FoundItems> {
  const { business } = await requireAdmin();
  return findLineItems(query, business.id, str(text, 80), await adminLang());
}

/** `pick`: the item the name was picked from, if it was; its VAT rate is then read on the server. */
export async function updateLineAction(lineId: string, f: LineInput, pick?: LinePick | null): Promise<{ ok: boolean; field?: string }> {
  const { user, business } = await requireAdmin();
  const picked = pick ? await pickedVat(query, business.id, pick) : null;
  const r = await updateDraftLine(business, str(lineId, 64), line(f), user.id, picked ?? undefined);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, field: r.code };
}

export async function dropLineAction(lineId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const r = await dropDraftLine(business, str(lineId, 64), user.id);
  if (r.ok) refresh();
  return r.ok;
}

export async function addLineAction(invoiceId: string, f: LineInput, pick?: LinePick | null): Promise<{ ok: boolean; field?: string }> {
  const { user, business } = await requireAdmin();
  const picked = pick ? await pickedVat(query, business.id, pick) : null;
  const r = await addDraftLine(business, str(invoiceId, 64), line(f), user.id, picked ?? undefined);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, field: r.code };
}

/**
 * Another receiver from a draft's card. A free draft moves to him. A
 * month's draft stays with its barber: then `open` is the other receiver's
 * own draft to go to, as «Новый счёт» would open it.
 */
export async function changeReceiverAction(invoiceId: string, receiverId: string): Promise<{ ok: true; open: string | null } | { ok: false; code: string }> {
  const { user, business } = await requireAdmin();
  const r = await setDraftReceiver(business, str(invoiceId, 64), str(receiverId, 64), user.id);
  if (r.ok) {
    refresh();
    return { ok: true, open: null };
  }
  if (r.code !== "not_free") return r;
  const other = await openDraft(business, str(receiverId, 64), user.id);
  if (!other.ok) return other;
  refresh();
  return { ok: true, open: other.id };
}

/** «Сделать копию счёта»: a new free draft with the same lines. */
export async function copyAction(invoiceId: string): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const { user, business } = await requireAdmin();
  const r = await copyInvoice(business, str(invoiceId, 64), user.id);
  if (r.ok) refresh();
  return r;
}

export async function setNoteAction(invoiceId: string, note: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await setDraftNote(business, str(invoiceId, 64), str(note, 600), user.id);
  if (ok) refresh();
  return ok;
}

export async function discardAction(invoiceId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await discardDraft(business, str(invoiceId, 64), user.id);
  if (ok) refresh();
  return ok;
}

export async function issueAction(invoiceId: string): Promise<{ ok: true; number: string } | { ok: false; code: string }> {
  const { user, business } = await requireAdmin();
  const r = await issueInvoice(business, str(invoiceId, 64), user.id);
  if (r.ok) {
    refresh();
    sendSoon();
  }
  return r;
}

/**
 * «Платежи»: the invoice paid in full on a day (today if none is given), or
 * the mark taken off. The day is between the invoice's own date and today.
 */
export async function setPaidAction(invoiceId: string, paid: boolean, paidOn?: string | null): Promise<{ ok: boolean; code?: "date" }> {
  const { user, business } = await requireAdmin();
  const id = str(invoiceId, 64);
  let at = Date.now();
  if (paid === true && paidOn) {
    const inv = await invoiceById(query, business.id, id);
    const moment = paidMoment(str(paidOn, 10), inv?.issuedOn ?? null, business.timezone);
    if (moment == null) return { ok: false, code: "date" };
    at = moment;
  }
  const ok = await setPaid(business, id, paid === true, user.id, at);
  if (ok) refresh();
  return { ok };
}

export async function creditAction(invoiceId: string): Promise<{ ok: true; id: string; number: string } | { ok: false; code: string }> {
  const { user, business } = await requireAdmin();
  const r = await creditInvoice(business, str(invoiceId, 64), user.id);
  if (r.ok) {
    refresh();
    sendSoon();
  }
  return r;
}

export async function resendAction(invoiceId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await resendInvoice(business, str(invoiceId, 64), user.id);
  if (ok) {
    refresh();
    sendSoon();
  }
  return ok;
}

/* ---------- sales: a minus row, a retry ---------- */

export async function reverseSaleAction(saleId: string, note: string): Promise<{ ok: boolean; code?: string }> {
  const { user, business } = await requireAdmin();
  // a product sale's own right (the invoices themselves stay with the login's side of the app);
  // with its period «today», only a sale made today is taken back
  const [sale] = await query<{ created_at: Date }>("select created_at from product_sales where id::text = $1 and business_id = $2", [str(saleId, 64), business.id]);
  const made = sale ? { date: localParts(new Date(sale.created_at).getTime(), business.timezone).date, today: todayIn(business.timezone) } : {};
  if (!can(user, "visit.sell.edit", made)) return { ok: false, code: "forbidden" };
  const r = await reverseSale(business, str(saleId, 64), user.id, str(note, 200));
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, code: r.code };
}

export async function retrySaleAction(saleId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!can(user, "visit.sell.edit")) return false;
  const ok = await retrySale(business, str(saleId, 64), user.id);
  if (ok) refresh();
  return ok;
}
