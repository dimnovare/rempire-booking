/**
 * What every «Счета» page shares: the section's six pages, the month
 * switcher, the status pill, the date formats, an event's words and the
 * section's own icons. No server-only code and no hooks: the server pages
 * and the client views both use it.
 */
import Link from "next/link";
import type { BillingEvent } from "@/lib/billing/events";
import { euroText } from "@/lib/money";
import type { Copy } from "../../copy";
import { NextIcon, PrevIcon } from "../../icons";

/* ---------- the section's pages (the sidebar from 900px, a row of chips on a phone) ---------- */

export const INV_ROOT = "/admin/invoices";
export const INV_PAGES = [
  { key: "desk", href: "/admin/invoices/desk" },
  { key: "list", href: "/admin/invoices" },
  { key: "receivers", href: "/admin/invoices/receivers" },
  { key: "items", href: "/admin/invoices/items" },
  { key: "reports", href: "/admin/invoices/reports" },
  { key: "settings", href: "/admin/invoices/settings" },
] as const;
export type InvPage = (typeof INV_PAGES)[number]["key"];

/** Is this address inside the section? */
export const inInvoices = (path: string) => path === INV_ROOT || path.startsWith(`${INV_ROOT}/`);

/** The page of the section an address belongs to: one invoice is under «Счета», a barber's month under «Отчёты». */
export function invPageOf(path: string): InvPage {
  const rest = path.slice(INV_ROOT.length + 1).split("/")[0];
  if (rest === "desk" || rest === "receivers" || rest === "items" || rest === "reports" || rest === "settings") return rest;
  return rest === "barber" ? "reports" : "list";
}

/* ---------- months and dates ---------- */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `?m=2026-10` if it is a month, otherwise the month before `today` (the one being invoiced). */
export function pickMonth(m: unknown, today: string): string {
  if (typeof m === "string" && MONTH.test(m)) return m;
  const [y, mo] = today.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

export function shift(m: string, by: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const monthDate = (m: string) => new Date(`${m}-01T12:00:00Z`);

/** «2026-11-03» → «03.11.2026» */
export const dmy = (iso: string | null | undefined) => {
  const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return x ? `${x[3]}.${x[2]}.${x[1]}` : "";
};

/** A moment in the business's zone, «03.11.2026». */
export const dayOf = (at: string | null | undefined, tz: string) => (at ? dmy(new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(new Date(at))) : "");

export function MonthNav({ A, m, base }: { A: Copy; m: string; base: string }) {
  return (
    <div className="adm-inv-month">
      <Link className="adm-ibtn" href={`${base}?m=${shift(m, -1)}`} aria-label={A.inv.prev} prefetch={false}>
        <PrevIcon />
      </Link>
      <h2>{A.inv.month(monthDate(m))}</h2>
      <Link className="adm-ibtn" href={`${base}?m=${shift(m, 1)}`} aria-label={A.inv.next} prefetch={false}>
        <NextIcon />
      </Link>
    </div>
  );
}

/* ---------- the status ---------- */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const statusWord = (A: Copy, status: string) => cap(A.inv.status[status] ?? status);

/** The status as the list shows it: an outlined pill in the status's colour. */
export function StatusTag({ A, status }: { A: Copy; status: string }) {
  return <span className={`inv-st st-${status}`}>{statusWord(A, status)}</span>;
}

/**
 * «Платежи» on a sent invoice (mark it paid, take the mark off). Dim,
 * decisions round 10 (20.11.2026): hidden until Renat asks; in six years
 * not one payment was recorded in Isolta. The action and the «paid» status
 * stay, so switching it back on is this one line.
 */
export const PAYMENTS_SHOWN = false;

/* ---------- an event's words ---------- */

export function eventText(A: Copy, e: BillingEvent): string {
  const E = A.inv.event;
  const n = e.number ?? "";
  switch (e.kind) {
    case "issued":
      return e.credit ? E.creditIssued(n) : E.issued(n);
    case "sent":
      return E.sent(n, e.email ?? "");
    case "mail_failed":
      return E.mail_failed(n, e.email ?? "");
    case "opened":
      return E.opened(n, e.email ?? "");
    case "paid":
      return E.paid(n);
    case "unpaid":
      return E.unpaid(n);
    case "credited":
      return E.credited(n, e.other?.number ?? "");
    case "resend":
      // the address it went to this time: the receiver's current e-mail
      return E.resend(n, e.email ?? "");
    case "imported":
      return E.imported(n);
    case "receiver_new":
      return E.receiver_new;
    case "receiver_edit":
      return E.receiver_edit;
    case "rent":
      return E.rent(e.cents == null ? "" : euroText(e.cents));
  }
}

/** What a view needs of an event: when (as words), what, and the invoice it opens. */
export type EventLine = { key: string; when: string; text: string; href: string | null };

export function eventLines(A: Copy, events: BillingEvent[], tz: string, link = true): EventLine[] {
  return events.map((e, i) => ({ key: `${e.at}:${e.kind}:${i}`, when: A.inv.when(new Date(e.at), tz), text: eventText(A, e), href: link && e.invoiceId ? `${INV_ROOT}/${e.invoiceId}` : null }));
}

/* ---------- icons: our own, 24px strokes ---------- */

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
type I = { size?: number };

/** A page of the section, for the sidebar. */
export function InvIcon({ name, size = 22 }: { name: InvPage | "back"; size?: number }) {
  const d: Record<string, string> = {
    desk: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
    list: "M5.5 3h13v18l-2.2-1.5-2.1 1.5-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5zM9 8h6M9 12h6M9 16h3",
    receivers: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.6 2.9-6 6.500-6s6.5 2.400 6.5 6M16 4.800a3.5 3.5 0 010 6.400",
    items: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
    reports: "M5 19V9M12 19V5M19 19v-7",
    settings: "M12 9a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.100 2.100M16.300 16.300l2.100 2.100M5.6 18.400l2.100-2.100M16.300 7.700l2.100-2.100",
    back: "M10 6l-6 6 6 6M4 12h16",
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...P}>
      <path d={d[name]} />
    </svg>
  );
}

/** A company (a house with windows) or a private person. */
export function PartyIcon({ person, size = 24 }: { person?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...P}>
      {person ? <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4.500 20.500c0-4 3.400-6.500 7.500-6.500s7.500 2.500 7.500 6.500" /> : <path d="M4 20V6l8-3v17M12 9l8 2v9M3 20h18M7 9h2M7 13h2M15 14h2" />}
    </svg>
  );
}

export const SearchGlass = ({ size = 20 }: I) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...P}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

/** The arrow of a sorted column: down is «the largest first». */
export const SortArrow = ({ size = 16 }: I) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...P}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

export const ToolIcon = ({ name, size = 20 }: { name: "file" | "fileAdd" | "personAdd" | "sheet" | "note" | "copy" | "bin" | "pdf" | "print" | "mail" | "pay" | "credit" | "eye" | "pencil" | "plus"; size?: number }) => {
  const d: Record<string, string> = {
    file: "M6 3h8l4 4v14H6zM14 3v4h4",
    fileAdd: "M6 3h8l4 4v14H6zM14 3v4h4M12 10.500v6M9 13.500h6",
    personAdd: "M9.500 11a3.500 3.500 0 100-7 3.500 3.500 0 000 7zM3 20c0-3.600 2.900-6 6.500-6s6.500 2.400 6.500 6M19 8v6M16 11h6",
    sheet: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
    note: "M5 4h14v12l-4 4H5zM15 20v-4h4M8 9h8M8 13h5",
    copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    bin: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6",
    pdf: "M12 4v11M7 11l5 5 5-5M5 20h14",
    print: "M7 9V4h10v5M7 17H4V9h16v8h-3M7 14h10v6H7z",
    mail: "M3.500 6h17v12h-17zM3.500 7l8.500 6 8.500-6",
    pay: "M3.500 7h17v10h-17zM3.500 11h17M7 14.500h3",
    credit: "M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-3",
    eye: "M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12zM12 14.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5z",
    pencil: "M4 20l1-4L16 5l3 3L8 19zM14 7l3 3",
    plus: "M12 5v14M5 12h14",
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...P}>
      <path d={d[name]} />
    </svg>
  );
};
