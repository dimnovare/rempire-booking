/**
 * /admin/invoices/desk «Рабочий стол», laid out as the invoicing tool's own
 * dashboard (docs/isolta-pages.md, part D; docs/reference-looks.md): no
 * white bar and no visible title, the company at the top, then
 *   - three figures (this month, last month, overdue: how many and how
 *     much; each opens the list filtered the same way) and five tiles, with
 *     the month's card at the right: how many barbers get a month's invoice
 *     and whether the month being invoiced has its drafts yet, and the way
 *     to «Отчёты», where «Сделать черновики» is;
 *   - «Неоплаченные счета» (the longest overdue first, and what all of them
 *     come to) and the latest events as the audit log and the outbox kept
 *     them (issued, sent, paid, credited).
 * The figures and the unpaid ones are the list's own rows (sectionRows,
 * src/lib/billing/list.ts). A phone keeps the section's bar with its row of
 * chips: without it the section's pages are nowhere there.
 */
import Link from "next/link";
import { Suspense } from "react";
import { TowerMark } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/current";
import { latestEvents } from "@/lib/billing/events";
import { sectionRows } from "@/lib/billing/export";
import { monthInvoices } from "@/lib/billing/invoices";
import { deskStats, deskUnpaid, type Sum } from "@/lib/billing/list";
import { listIssuers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { euroText } from "@/lib/money";
import { todayIn } from "@/lib/tz";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { dmy, eventLines, INV_ROOT, InvIcon, monthDate, pickMonth, ToolIcon } from "../common";
import { IvTop } from "../ui";
import { UnpaidTable } from "./unpaid";

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
  // the month being invoiced: the one before today
  const m = pickMonth(undefined, todayIn(business.timezone));
  const [{ rows, today }, issuers, events, plan] = await Promise.all([sectionRows(query, business), listIssuers(query, business.id), latestEvents(query, business.id, 12), monthInvoices(query, business.id, m)]);
  const D = A.inv.desk;
  const monthWord = A.inv.month(monthDate(m));
  const planTitle = D.monthTitle(monthWord);
  const st = deskStats(rows, today);
  const owed = deskUnpaid(rows, 5);
  const issuer = issuers.find((i) => i.isDefault) ?? issuers[0] ?? null;
  // «Сделать черновики» needs the company the invoices are issued from, as on «Отчёты»
  const canMake = issuers.length > 0;
  const made = plan.drafts + plan.issued;
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
      <span className="ico" aria-hidden="true">
        {icon}
      </span>
      <span className="txt">{label}</span>
    </Link>
  );

  return (
    <>
      <Title text={A.inv.menu.desk} />
      {/* a phone: the section's bar with its chips; from 900px the page has no bar, and its title is for screen readers */}
      <div className="only-narrow">
        <IvTop title={A.inv.menu.desk} />
      </div>
      <div className="iv-desk">
        <h1 className="sr only-wide">{A.inv.menu.desk}</h1>

        <div className="iv-desk-head">
          <span className="iv-desk-logo" aria-hidden="true">
            <TowerMark />
          </span>
          <div>
            <b>{issuer?.legalName ?? "REMPIRE"}</b>
            {issuer?.email && <span>{issuer.email}</span>}
          </div>
        </div>

        <div className="iv-desk-row">
          <div className="iv-desk-main">
            <div className="iv-stats">
              {stat("is-month", D.thisMonth, `${INV_ROOT}?from=${st.thisRange.from}&to=${st.thisRange.to}`, st.thisMonth)}
              {stat("is-last", D.lastMonth, `${INV_ROOT}?from=${st.lastRange.from}&to=${st.lastRange.to}`, st.lastMonth)}
              {stat("is-late", D.overdue, `${INV_ROOT}?status=overdue`, st.overdue)}
            </div>
            <nav className="iv-tiles" aria-label={A.inv.menu.desk}>
              {tile(`${INV_ROOT}/new`, A.inv.newInvoice, <ToolIcon name="fileAdd" size={24} />)}
              {tile(INV_ROOT, D.showInvoices, <InvIcon name="list" size={24} />)}
              {tile(`${INV_ROOT}/reports`, D.report, <InvIcon name="reports" size={24} />)}
              {tile(`${INV_ROOT}/receivers?new=1`, D.newReceiver, <ToolIcon name="personAdd" size={24} />)}
              {tile(`${INV_ROOT}/receivers`, D.showReceivers, <InvIcon name="receivers" size={24} />)}
            </nav>
          </div>

          <section className="iv-plan" aria-label={planTitle}>
            <div className="iv-plan-head">
              <h2>{planTitle}</h2>
            </div>
            <p className="iv-plan-body">
              {D.monthText(plan.barbers, plan.drafts, plan.issued, monthWord)}
              {canMake && plan.barbers > 0 && made < plan.barbers && ` ${A.inv.autoDrafts(business.settings.billing_day)}`}
              {!canMake && (
                <>
                  {" "}
                  <Link className="iv-link" href={`${INV_ROOT}/settings`} prefetch={false}>
                    {A.inv.noIssuer}
                  </Link>
                </>
              )}
            </p>
            {canMake && (
              <Link className="iv-btn is-main" href={`${INV_ROOT}/reports?m=${m}`} prefetch={false}>
                <InvIcon name="reports" size={20} />
                {D.openMonth}
              </Link>
            )}
          </section>
        </div>

        <div className="iv-desk-row3">
          <section className="iv-desk-card is-unpaid" aria-label={D.unpaid}>
            <h2>{D.unpaid}</h2>
            <UnpaidTable
              rows={owed.rows.map((r) => ({ id: r.id, receiver: r.receiver, due: dmy(r.due), total: euroText(r.grossCents) }))}
              sum={euroText(owed.all.grossCents)}
              allHref={`${INV_ROOT}?status=${owed.overdue > 0 || owed.all.count === 0 ? "overdue" : "issued"}`}
            />
          </section>

          <section className="iv-desk-card is-events" aria-label={D.events}>
            <h2>{D.events}</h2>
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
      </div>
    </>
  );
}
