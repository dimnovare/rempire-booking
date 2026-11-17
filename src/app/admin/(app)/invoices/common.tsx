/**
 * What every «Счета» page shares: the three tabs, the month switcher, the
 * status tag and the date format. No server-only code: the client views
 * use it too.
 */
import Link from "next/link";
import type { Copy } from "../../copy";
import { NextIcon, PrevIcon } from "../../icons";

export type Tab = "month" | "receivers" | "company";

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

export function InvTabs({ A, here, m }: { A: Copy; here: Tab; m?: string }) {
  const q = m ? `?m=${m}` : "";
  const tabs: [Tab, string][] = [
    ["month", `/admin/invoices${q}`],
    ["receivers", "/admin/invoices/receivers"],
    ["company", "/admin/invoices/company"],
  ];
  return (
    <nav className="adm-seg adm-inv-tabs" aria-label={A.inv.title}>
      {tabs.map(([t, href]) => (
        <Link key={t} href={href} aria-current={here === t ? "page" : undefined} prefetch={false}>
          {A.inv.tabs[t]}
        </Link>
      ))}
    </nav>
  );
}

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

export function StatusTag({ A, status }: { A: Copy; status: string }) {
  const tone = status === "paid" ? " lime" : status === "draft" ? " warn" : "";
  return <span className={`adm-tag${tone}`}>{A.inv.status[status] ?? status}</span>;
}
