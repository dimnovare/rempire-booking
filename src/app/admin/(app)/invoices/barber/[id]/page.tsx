/**
 * /admin/invoices/barber/<staffId>?m=2026-10: one barber's month (C4 in the
 * admin; the design board «Расчёт барбера», Dim 26.11.2026). It reads as
 * the barber's own «Мои расчёты» (src/app/b/(app)/money): what he owes
 * REMPIRE for the month and that sum line by line, then where the money
 * stands (the month's invoice, what is issued and not paid, sales in no
 * invoice and of which months); the month's invoice; his sales day by day,
 * each with «⋯» → «Сторно» for one that was wrong (sales-view.tsx). In the
 * section's frame it is a page of «Отчёты»: the month's table links here.
 * Without `m` it is the month before this one, the one being invoiced.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { monthMoments } from "@/lib/billing/invoices";
import { listStatus } from "@/lib/billing/list";
import { receiverForStaff } from "@/lib/billing/parties";
import { monthStatement } from "@/lib/billing/statement";
import { dbConfigured, query } from "@/lib/db";
import { bpText, euroText } from "@/lib/money";
import { listSales, type Sale } from "@/lib/sales";
import { todayIn } from "@/lib/tz";
import type { Copy } from "../../../../copy";
import { cap } from "../../../../copy.shared";
import { NextIcon, PrevIcon } from "../../../../icons";
import { Title, Wait } from "../../../../lang";
import { getA } from "../../../../lang-server";
import { dayOf, dmy, INV_ROOT, pickMonth, shift, StatusTag } from "../../common";
import { IvTop } from "../../ui";
import { monthWords, salesByDay } from "./days";
import { SalesList, type SaleRow } from "./sales-view";

export default function BarberMoneyPage({ params, searchParams }: PageProps<"/admin/invoices/barber/[id]">) {
  return (
    <main className="iv-page iv-bm">
      <Suspense fallback={<Wait />}>
        <Loaded params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type P = PageProps<"/admin/invoices/barber/[id]">;

/** «2026-11» → 10, the month's place in a list of twelve */
const ix = (m: string) => Number(m.slice(5, 7)) - 1;
/** what stands on a sale and is not the usual («в магазине» and a booking-only minus row say nothing) */
const SYNC_TAGGED = new Set(["queued", "sending", "failed", "test"]);
/** the month's own invoice still holds the month (a credited one does not) */
const LIVE = new Set(["draft", "issued", "paid"]);

async function Loaded({ params, searchParams }: { params: P["params"]; searchParams: P["searchParams"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [staff] = await query<{ id: string; name: string }>("select id, display_name as name from staff where id = $1 and business_id = $2", [id, business.id]);
  if (!staff) notFound();
  const tz = business.timezone;
  const today = todayIn(tz);
  const thisMonth = today.slice(0, 7);
  const m = pickMonth(sp.m, today);
  const { from, to } = monthMoments(m, tz);
  const [st, sales, receiver] = await Promise.all([monthStatement(query, business, staff.id, m), listSales(query, staff.id, from, to), receiverForStaff(query, staff.id)]);
  const M = A.inv.bm;
  const year = m.slice(0, 4);
  const forM = M.monthsFor[ix(m)];
  const prev = shift(m, -1);
  const next = shift(m, 1);
  const base = `${INV_ROOT}/barber/${staff.id}`;
  const inv = st.monthInvoice;
  const invStatus = inv ? (listStatus(inv, today) ?? inv.status) : "";
  // the cron makes the month's draft on the billing day of the month after (planInvoiceDrafts), for a receiver with something to bill
  const draftDay = `${next}-${String(business.settings.billing_day).padStart(2, "0")}`;
  const draftComing = !inv && !!receiver && today < draftDay && (st.rentCents > 0 || st.unbilledMonths.length > 0);
  const sub = [receiver?.legalName ?? M.noReceiver, st.rentCents ? M.rentMonth(euroText(st.rentCents)) : ""].filter(Boolean).join(" · ");
  const minus = (c: number) => (c > 0 ? `−${euroText(c)}` : euroText(-c));
  const days = salesByDay(sales, tz).map((d) => ({ date: d.date, head: M.day(d.date), sum: M.dayHead(d.count, euroText(d.cents)), rows: d.sales.map((s) => saleRow(A, s)) }));

  return (
    <>
      <Title text={`${staff.name} · ${A.inv.statement}`} />
      <IvTop title={staff.name} sub={sub}>
        <Link className="iv-bm-back" href={`${INV_ROOT}/reports?m=${m}`} prefetch={false}>
          <PrevIcon size={16} />
          {A.inv.menu.reports}
        </Link>
      </IvTop>
      <div className="iv-body">
        {/* the months keep their places; the next one is greyed on this month, not gone */}
        <nav className="iv-bm-months" aria-label={A.inv.grans.month}>
          <Link className="iv-btn" href={`${base}?m=${prev}`} title={A.inv.prev} prefetch={false}>
            <PrevIcon size={16} />
            {cap(M.months[ix(prev)])}
          </Link>
          <h2>
            {cap(M.months[ix(m)])} {year}
          </h2>
          {m < thisMonth ? (
            <Link className="iv-btn" href={`${base}?m=${next}`} title={A.inv.next} prefetch={false}>
              {cap(M.months[ix(next)])}
              <NextIcon size={16} />
            </Link>
          ) : (
            <span className="iv-btn" aria-disabled="true" title={A.inv.next}>
              {cap(M.months[ix(next)])}
              <NextIcon size={16} />
            </span>
          )}
        </nav>

        <div className="iv-bm-grid">
          <section className="iv-card iv-bm-owe" aria-labelledby="iv-bm-owe">
            <div className="iv-bm-owe-head">
              <h2 id="iv-bm-owe">{M.owedFor(forM)}</h2>
              <p>{euroText(st.owedCents)}</p>
            </div>
            <dl className="iv-bm-dl">
              <dt>{M.client(st.clientCount)}</dt>
              <dd>{euroText(st.clientCents)}</dd>
              <dt className="is-ok">{M.commission(bpText(business.settings.commission_bp))}</dt>
              <dd className="is-ok">{minus(st.commissionCents)}</dd>
              <dt>{M.self(st.selfCount)}</dt>
              <dd>{euroText(st.selfCents)}</dd>
              <dt>{M.rent}</dt>
              <dd>{euroText(st.rentCents)}</dd>
              <dt className="tot">{M.total}</dt>
              <dd className="tot">{euroText(st.owedCents)}</dd>
            </dl>
            {/* where that money stands: the month's invoice, then the barber's whole account */}
            <dl className="iv-bm-where">
              {inv && LIVE.has(inv.status) && (
                <div>
                  <dt>{M.inInvoice(forM, A.inv.status[invStatus] ?? invStatus)}</dt>
                  <dd>{euroText(inv.grossCents)}</dd>
                </div>
              )}
              <div>
                <dt>{M.open(monthWords(st.openMonths.map((r) => r.month), M.months, year))}</dt>
                <dd>{euroText(st.openCents)}</dd>
              </div>
              <div>
                <dt>{M.unbilled(monthWords(st.unbilledMonths.map((r) => r.month), M.months, year))}</dt>
                <dd>{euroText(st.unbilledCents)}</dd>
              </div>
            </dl>
          </section>

          <section className="iv-card iv-bm-inv" aria-labelledby="iv-bm-inv">
            <h2 id="iv-bm-inv">{M.invoiceFor(forM)}</h2>
            {inv ? (
              <>
                <div className="iv-bm-inv-head">
                  <div>
                    <span className="iv-bm-inv-no">
                      <b>{inv.number ?? M.noNumber}</b>
                      <StatusTag A={A} status={invStatus} />
                    </span>
                    <small>
                      {[`${dmy(inv.periodFrom)}–${dmy(inv.periodTo)}`, inv.sentAt ? M.sent(dayOf(inv.sentAt, tz)) : "", inv.dueOn && inv.status === "issued" ? M.due(dmy(inv.dueOn)) : ""].filter(Boolean).join(" · ")}
                    </small>
                  </div>
                  <span className="iv-bm-inv-sum">{euroText(inv.grossCents)}</span>
                </div>
                <Link className="iv-btn is-main" href={`${INV_ROOT}/${inv.id}`} prefetch={false}>
                  {M.openInvoice}
                </Link>
              </>
            ) : (
              <p>
                {M.noInvoice(forM)}
                {draftComing && ` ${M.draftOn(M.day(draftDay))}`}
              </p>
            )}
            {/* older ones: the receiver's own page, opened on its tab «Счета»; the list has no filter by address */}
            <p className="iv-mute iv-bm-older">
              {receiver ? (
                <>
                  {M.older[0]}
                  <Link className="iv-link" href={`${INV_ROOT}/receivers/${receiver.id}?tab=invoices`} prefetch={false}>
                    {receiver.legalName}
                  </Link>
                  {M.older[1]}
                </>
              ) : (
                <Link className="iv-link" href={INV_ROOT} prefetch={false}>
                  {M.olderAll}
                </Link>
              )}
            </p>
          </section>
        </div>

        <section className="iv-card iv-bm-sales" aria-labelledby="iv-bm-sales">
          <h2 id="iv-bm-sales">{M.salesFor(forM)}</h2>
          {days.length === 0 ? <p className="iv-mute">{A.inv.noSales}</p> : <SalesList days={days} />}
        </section>
      </div>
    </>
  );
}

/** One sale as its row says it: what, to whom and the barber's part, and only the states that are not the usual. */
function saleRow(A: Copy, s: Sale): SaleRow {
  const tags: SaleRow["tags"] = [];
  if (s.status === "undone") tags.push({ text: A.inv.undone });
  if (s.reversesId || s.reversedBy) tags.push({ text: A.inv.reversal, warn: true });
  if (SYNC_TAGGED.has(s.syncStatus) && A.inv.sync[s.syncStatus]) tags.push({ text: A.inv.sync[s.syncStatus], warn: s.syncStatus === "failed" });
  return {
    id: s.id,
    what: `${s.name} × ${s.qty}`,
    sub: [
      A.inv.mode[s.mode] ?? s.mode,
      s.commissionCents ? A.inv.bm.barber(euroText(s.commissionCents)) : "",
      // the client, when the front desk named him («Продажа товара»)
      s.clientName ? `${A.sale.client}: ${s.clientName}` : "",
      s.noPurchase ? A.inv.noPurchase : "",
      s.note,
    ]
      .filter(Boolean)
      .join(" · "),
    total: euroText(s.totalCents),
    off: s.status === "undone",
    tags,
    reversible: s.status === "done" && !s.reversesId && !s.reversedBy,
  };
}
