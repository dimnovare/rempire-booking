/**
 * /admin/invoices/barber/<staffId>?m=2026-10: one barber's month (C4 in the
 * admin): what he sold, took for himself, the 17 %, rent, his invoices, and
 * each sale with «Сторно» for one that was wrong.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { monthMoments } from "@/lib/billing/invoices";
import { monthStatement } from "@/lib/billing/statement";
import { dbConfigured, query } from "@/lib/db";
import { euroText } from "@/lib/money";
import { listSales } from "@/lib/sales";
import { todayIn } from "@/lib/tz";
import { PrevIcon } from "../../../../icons";
import { Title, Wait } from "../../../../lang";
import { getA } from "../../../../lang-server";
import { dayOf, dmy, MonthNav, pickMonth, StatusTag } from "../../common";
import { SalesList } from "./sales-view";

export default function BarberMoneyPage({ params, searchParams }: PageProps<"/admin/invoices/barber/[id]">) {
  return (
    <main className="adm-page adm-wide adm-inv">
      <Suspense fallback={<Wait />}>
        <Loaded params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type P = PageProps<"/admin/invoices/barber/[id]">;

async function Loaded({ params, searchParams }: { params: P["params"]; searchParams: P["searchParams"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [staff] = await query<{ id: string; name: string }>("select id, display_name as name from staff where id = $1 and business_id = $2", [id, business.id]);
  if (!staff) notFound();
  const tz = business.timezone;
  const m = pickMonth(sp.m, todayIn(tz));
  const { from, to } = monthMoments(m, tz);
  const [st, sales] = await Promise.all([monthStatement(query, business, staff.id, m), listSales(query, staff.id, from, to)]);
  const S = A.inv.sums;
  return (
    <>
      <Title text={`${staff.name} · ${A.inv.statement}`} />
      <Link className="adm-back" href={`/admin/invoices?m=${m}`}>
        <PrevIcon />
        {A.inv.title}
      </Link>
      <h1 className="adm-h1">{staff.name}</h1>
      <MonthNav A={A} m={m} base={`/admin/invoices/barber/${staff.id}`} />
      <section className="adm-cards">
        <div className="adm-card">
          <h2 className="adm-card-h">{A.inv.statement}</h2>
          <ul className="adm-lines">
            <li>
              <span>{S.client(st.clientCount)}</span>
              <span>{euroText(st.clientCents)}</span>
            </li>
            <li className="is-sp">
              <span>{S.commission}</span>
              <span>{st.commissionCents ? `−${euroText(st.commissionCents)}` : euroText(0)}</span>
            </li>
            <li>
              <span>{S.self}</span>
              <span>{euroText(st.selfCents)}</span>
            </li>
            <li>
              <span>{S.rent}</span>
              <span>{euroText(st.rentCents)}</span>
            </li>
            <li className="tot">
              <span>{S.owed}</span>
              <span>{euroText(st.owedCents)}</span>
            </li>
          </ul>
          <p className="adm-meta">
            {S.open}: {euroText(st.openCents)} · {S.unbilled}: {euroText(st.unbilledCents)}
          </p>
        </div>

        <div className="adm-card">
          <h2 className="adm-card-h">{A.inv.title}</h2>
          {st.invoices.length === 0 ? (
            <p className="adm-meta">{A.inv.noInvoices}</p>
          ) : (
            <ul className="adm-list">
              {st.invoices.map((i) => (
                <li key={i.id}>
                  <Link className="adm-item" href={`/admin/invoices/${i.id}`} prefetch={false}>
                    <span className="txt">
                      <span className="plain">{i.number ?? A.inv.draft}</span>
                      <small>
                        {i.kind === "credit" ? `${A.inv.credit} · ` : ""}
                        {dmy(i.periodFrom)}–{dmy(i.periodTo)}
                      </small>
                      <span className="tags">
                        <StatusTag A={A} status={i.status} />
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
          <h2 className="adm-card-h">{A.inv.sales}</h2>
          {sales.length === 0 ? (
            <p className="adm-meta">{A.inv.noSales}</p>
          ) : (
            <SalesList
              rows={sales.map((s) => ({
                id: s.id,
                name: s.name,
                qty: s.qty,
                mode: s.mode,
                total: euroText(s.totalCents),
                commission: s.commissionCents ? euroText(s.commissionCents) : "",
                at: dayOf(s.createdAt, tz),
                status: s.status,
                sync: s.syncStatus,
                reversal: s.reversesId !== null,
                reversed: s.reversedBy !== null,
                note: [s.noPurchase ? A.inv.noPurchase : "", s.note].filter(Boolean).join(" · "),
              }))}
            />
          )}
        </div>
      </section>
    </>
  );
}
