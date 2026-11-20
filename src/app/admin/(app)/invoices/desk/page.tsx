/**
 * /admin/invoices/desk «Рабочий стол»: the month's figures and the short
 * ways in, as the invoicing tool's dashboard (docs/isolta-pages.md): three
 * figures (this month, last month, overdue: how many and how much), four
 * tiles, and the latest events as the audit log and the outbox kept them
 * (issued, sent, paid, credited). Everything here is read from the
 * invoices themselves; a figure opens the list filtered the same way.
 */
import Link from "next/link";
import { Suspense } from "react";
import { TowerMark } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/current";
import { latestEvents } from "@/lib/billing/events";
import { sectionRows } from "@/lib/billing/export";
import { deskStats, type Sum } from "@/lib/billing/list";
import { listIssuers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { euroText } from "@/lib/money";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { eventLines, INV_ROOT, PartyIcon, ToolIcon } from "../common";
import { IvTop } from "../ui";

export default function DeskPage() {
  return (
    <main className="iv-page">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const [{ rows, today }, issuers, events] = await Promise.all([sectionRows(query, business), listIssuers(query, business.id), latestEvents(query, business.id, 12)]);
  const D = A.inv.desk;
  const st = deskStats(rows, today);
  const issuer = issuers.find((i) => i.isDefault) ?? issuers[0] ?? null;
  const lines = eventLines(A, events, business.timezone);
  const stat = (cls: string, title: string, href: string, s: Sum) => (
    <Link className={`iv-stat ${cls}`} href={href} prefetch={false}>
      <b>{title}</b>
      <dl>
        <div>
          <dt>{D.count}</dt>
          <dd>{s.count}</dd>
        </div>
        <div>
          <dt>{D.total}</dt>
          <dd>{euroText(s.grossCents)}</dd>
        </div>
      </dl>
    </Link>
  );
  const tile = (href: string, label: string, icon: React.ReactNode) => (
    <Link className="iv-tile" href={href} prefetch={false}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );

  return (
    <>
      <Title text={A.inv.menu.desk} />
      <IvTop title={A.inv.menu.desk} />
      <div className="iv-body">
        <div className="iv-desk-head">
          <span className="iv-logo" aria-hidden="true">
            <TowerMark />
          </span>
          <div>
            <b>{issuer?.legalName ?? "REMPIRE"}</b>
            {issuer?.email && <span className="iv-mute">{issuer.email}</span>}
          </div>
        </div>

        <div className="iv-stats">
          {stat("is-month", D.thisMonth, `${INV_ROOT}?from=${st.thisRange.from}&to=${st.thisRange.to}`, st.thisMonth)}
          {stat("is-last", D.lastMonth, `${INV_ROOT}?from=${st.lastRange.from}&to=${st.lastRange.to}`, st.lastMonth)}
          {stat("is-late", D.overdue, `${INV_ROOT}?status=overdue`, st.overdue)}
        </div>

        <nav className="iv-tiles" aria-label={A.inv.menu.desk}>
          {tile(`${INV_ROOT}/new`, A.inv.newInvoice, <ToolIcon name="plus" />)}
          {tile(INV_ROOT, D.showInvoices, <ToolIcon name="file" />)}
          {tile(`${INV_ROOT}/receivers?new=1`, D.newReceiver, <ToolIcon name="plus" />)}
          {tile(`${INV_ROOT}/receivers`, D.showReceivers, <PartyIcon size={20} />)}
        </nav>

        <section className="iv-card" aria-label={D.events}>
          <h2 className="iv-h6">{D.events}</h2>
          {lines.length === 0 ? (
            <p className="iv-mute">{D.noEvents}</p>
          ) : (
            <ul className="iv-events">
              {lines.map((e) => (
                <li key={e.key}>
                  <time>{e.when}</time>
                  <span>
                    {e.href ? (
                      <Link className="iv-link" href={e.href} prefetch={false}>
                        {e.text}
                      </Link>
                    ) : (
                      e.text
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
