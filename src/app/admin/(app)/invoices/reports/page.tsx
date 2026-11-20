/**
 * /admin/invoices/reports?m=2026-10 «Отчёты» → «Месяц по барберам» (Phase
 * C, C5 and C6; it was the tab «Месяц» at /admin/invoices/month, which
 * leads here now): the month per barber (sold, commission, rent, invoiced,
 * paid, open), «Сделать черновики», the month's invoices and drafts, the
 * CSV for the accountant, and the sales the shop did not take. Without `m`
 * it is last month: the one being invoiced.
 *
 * The other report, by receiver for a period, is reports/receivers.
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { listInvoices } from "@/lib/billing/invoices";
import { listStatus } from "@/lib/billing/list";
import { listIssuers } from "@/lib/billing/parties";
import { monthOverview } from "@/lib/billing/statement";
import { dbConfigured, query } from "@/lib/db";
import { euroText } from "@/lib/money";
import { failedSales } from "@/lib/sales";
import { todayIn } from "@/lib/tz";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { dayOf, dmy, INV_ROOT, MonthNav, pickMonth, StatusTag } from "../common";
import { FailedSales, MakeDrafts } from "../month-view";
import { IvTop } from "../ui";
import { RepTabs } from "./tabs";

export default function ReportsPage({ searchParams }: PageProps<"/admin/invoices/reports">) {
  return (
    <main className="iv-page">
      <Suspense fallback={<Wait />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin/invoices/reports">["searchParams"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const sp = await searchParams;
  const tz = business.timezone;
  const today = todayIn(tz);
  const m = pickMonth(sp.m, today);
  const [rows, invoices, issuers, failed] = await Promise.all([monthOverview(query, business, m), listInvoices(query, business.id, { month: m }), listIssuers(query, business.id), failedSales(query, business.id)]);
  const live = invoices.filter((i) => i.status !== "discarded");
  const byStaff = new Map<string, typeof live>();
  for (const i of live) if (i.staffId) byStaff.set(i.staffId, [...(byStaff.get(i.staffId) ?? []), i]);
  const C = A.inv.cols;
  const total = (k: "clientCents" | "commissionCents" | "selfCents" | "rentCents" | "owedCents" | "invoicedCents" | "paidCents" | "openCents") => rows.reduce((s, r) => s + r[k], 0);
  const minus = (c: number) => (c ? `−${euroText(c)}` : euroText(0));
  const status = (i: (typeof live)[number]) => listStatus(i, today) ?? i.status;

  return (
    <>
      <Title text={A.inv.menu.reports} />
      <IvTop title={A.inv.menu.reports} />
      <div className="iv-body">
        <RepTabs A={A} here="month" />
        <MonthNav A={A} m={m} base={`${INV_ROOT}/reports`} />

        {!issuers.length ? (
          <p className="iv-warn">
            <Link className="iv-link" href={`${INV_ROOT}/settings`}>
              {A.inv.noIssuer}
            </Link>
          </p>
        ) : (
          <MakeDrafts month={m} hint={A.inv.autoDrafts(business.settings.billing_day)} />
        )}

        {/* the month per barber: a table on a wide screen, a list on a phone */}
        {rows.length === 0 ? (
          <p className="iv-empty">{A.inv.noRows}</p>
        ) : (
          <>
            <div className="adm-inv-scroll only-wide">
              <table className="adm-inv-table">
                <thead>
                  <tr>
                    <th>{C.barber}</th>
                    <th>{C.client}</th>
                    <th>{C.commission}</th>
                    <th>{C.self}</th>
                    <th>{C.rent}</th>
                    <th>{C.owed}</th>
                    <th>{C.invoiced}</th>
                    <th>{C.paid}</th>
                    <th>{C.open}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.staffId}>
                      <td>
                        <Link href={`${INV_ROOT}/barber/${r.staffId}?m=${m}`} prefetch={false}>
                          {r.staffName}
                        </Link>
                        <small>{r.receiverName ?? <span className="adm-tag warn">{A.inv.noReceiver}</span>}</small>
                      </td>
                      <td>{euroText(r.clientCents)}</td>
                      <td>{minus(r.commissionCents)}</td>
                      <td>{euroText(r.selfCents)}</td>
                      <td>{euroText(r.rentCents)}</td>
                      <td className="b">{euroText(r.owedCents)}</td>
                      <td>{r.draftCents && !r.invoicedCents ? <StatusTag A={A} status="draft" /> : euroText(r.invoicedCents)}</td>
                      <td>{euroText(r.paidCents)}</td>
                      <td className={r.openCents ? "b" : ""}>{euroText(r.openCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td>{euroText(total("clientCents"))}</td>
                    <td>{minus(total("commissionCents"))}</td>
                    <td>{euroText(total("selfCents"))}</td>
                    <td>{euroText(total("rentCents"))}</td>
                    <td>{euroText(total("owedCents"))}</td>
                    <td>{euroText(total("invoicedCents"))}</td>
                    <td>{euroText(total("paidCents"))}</td>
                    <td>{euroText(total("openCents"))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <ul className="iv-list only-narrow">
              {rows.map((r) => (
                <li key={r.staffId}>
                  <Link href={`${INV_ROOT}/barber/${r.staffId}?m=${m}`} prefetch={false}>
                    <span className="txt">
                      <b>{r.staffName}</b>
                      <small>
                        {C.client} {euroText(r.clientCents)} · {C.commission} {minus(r.commissionCents)} · {C.rent} {euroText(r.rentCents)}
                        {r.selfCents ? ` · ${C.self} ${euroText(r.selfCents)}` : ""}
                      </small>
                      <span className="tags">
                        {!r.receiverName && <span className="adm-tag warn">{A.inv.noReceiver}</span>}
                        {(byStaff.get(r.staffId) ?? []).map((i) => (
                          <StatusTag key={i.id} A={A} status={status(i)} />
                        ))}
                        {r.failedSales > 0 && <span className="adm-tag warn">{A.inv.failed}</span>}
                      </span>
                    </span>
                    <span className="end">{euroText(r.owedCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <section className="adm-cards">
          <div className="adm-card">
            <h2 className="iv-h6">{A.inv.invoices}</h2>
            {live.length === 0 ? (
              <p className="iv-mute">{A.inv.noInvoices}</p>
            ) : (
              <ul className="adm-list">
                {live.map((i) => (
                  <li key={i.id}>
                    <Link className="adm-item" href={`${INV_ROOT}/${i.id}`} prefetch={false}>
                      <span className="txt">
                        <span className="plain">
                          {i.number ?? A.inv.draft} · {i.receiverName}
                        </span>
                        <small>
                          {dmy(i.issuedOn)}
                          {i.emailStatus === "failed" ? ` · ${A.inv.mail.failed}` : ""}
                        </small>
                        <span className="tags">
                          <StatusTag A={A} status={status(i)} />
                        </span>
                      </span>
                      <span className="end price">{euroText(i.grossCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="adm-card">
            <h2 className="iv-h6">{A.inv.csv}</h2>
            <div className="iv-acts">
              <a className="iv-btn" href={`${INV_ROOT}/csv?m=${m}&kind=invoices`} download>
                {A.inv.csvInvoices}
              </a>
              <a className="iv-btn" href={`${INV_ROOT}/csv?m=${m}&kind=lines`} download>
                {A.inv.csvLines}
              </a>
            </div>
          </div>

          {failed.length > 0 && (
            <FailedSales rows={failed.map((s) => ({ id: s.id, staffName: s.staffName, name: s.name, qty: s.qty, total: euroText(s.totalCents), at: dayOf(s.createdAt, tz), error: s.syncError ?? "" }))} />
          )}
        </section>
      </div>
    </>
  );
}
