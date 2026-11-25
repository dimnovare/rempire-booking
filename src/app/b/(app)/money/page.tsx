/**
 * /b/money?m=2026-11 «Мои расчёты» (Phase C, C4; the design board «Мои
 * расчёты», 25.11): the barber's own month. One big «К оплате REMPIRE» and
 * the sum line by line (sales, his 17 %, products for himself, the rent),
 * REMPIRE's invoices to him with the reference number to pay each with,
 * and his sales day by day. He sees only his own (requireStaff).
 * Without `m` it is this month, still running.
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/current";
import { monthMoments, type Invoice } from "@/lib/billing/invoices";
import { referenceNumber } from "@/lib/billing/reference";
import { monthStatement } from "@/lib/billing/statement";
import { dbConfigured, query } from "@/lib/db";
import { bpText, euroText } from "@/lib/money";
import { listSales, type Sale } from "@/lib/sales";
import { todayIn } from "@/lib/tz";
import type { Copy } from "../../copy";
import { cap, dateWords } from "../../copy.shared";
import { Wait } from "../../lang";
import { getB } from "../../lang-server";
import { Ic } from "../sell/icons";
import { Title } from "../title";
import { CopyRef } from "./copy-ref";

export default function MoneyPage({ searchParams }: PageProps<"/b/money">) {
  return (
    <Suspense fallback={<Wait />}>
      <Money searchParams={searchParams} />
    </Suspense>
  );
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const shift = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const dmy = (iso: string | null) => {
  const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return x ? `${x[3]}.${x[2]}.${x[1]}` : "";
};
const monthIx = (m: string) => Number(m.slice(5, 7)) - 1;
/** «2026 0112 7»: the bank's reference number in groups, easier to read; copied without the spaces. */
const grouped = (ref: string) => ref.replace(/(\d{4})(?=\d)/g, "$1 ");

/** «за октябрь» when the invoice is one whole month, else its dates. */
function periodText(i: Invoice, M: Copy["money"]): string {
  const from = i.periodFrom.slice(0, 10);
  const to = i.periodTo.slice(0, 10);
  const last = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).getUTCDate();
  if (from.endsWith("-01") && to === `${from.slice(0, 8)}${String(last).padStart(2, "0")}`) return M.forMonth(M.monthsFor[monthIx(from)]);
  return `${dmy(from)}–${dmy(to)}`;
}

async function Money({ searchParams }: { searchParams: PageProps<"/b/money">["searchParams"] }) {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { business, staff } = await requireStaff();
  const sp = await searchParams;
  const tz = business.timezone;
  const today = todayIn(tz);
  const thisMonth = today.slice(0, 7);
  const m = typeof sp.m === "string" && MONTH.test(sp.m) ? sp.m : thisMonth;
  const { from, to } = monthMoments(m, tz);
  const [st, sales] = await Promise.all([monthStatement(query, business, staff.id, m), listSales(query, staff.id, from, to)]);
  const M = B.money;
  const pct = bpText(business.settings.commission_bp);
  const prev = shift(m, -1);
  const next = shift(m, 1);
  // the month's own sales for himself, counted as the statement counts the client's (done, by quantity)
  const selfCount = sales.filter((s) => s.mode === "self" && s.status === "done").reduce((n, s) => n + s.qty, 0);
  // a draft is Renat's until he issues it: the barber sees that one is coming, not its lines
  const invoices = st.invoices.filter((i) => i.status !== "discarded");
  const toPay = invoices.filter((i) => i.kind === "invoice" && i.status === "issued");
  const rest = invoices.filter((i) => !toPay.includes(i));
  const days = byDay(sales, tz);

  return (
    <main className="adm-page bx-money">
      <Title text={M.title} />
      <h1 className="adm-h1">{M.title}</h1>

      {/* the months keep their places; the next one is greyed on this month, not gone */}
      <nav className="bx-mnav" aria-label={M.title}>
        <Link className="adm-btn adm-btn-line" href={`/b/money?m=${prev}`} title={M.prev} prefetch={false}>
          <Ic name="left" size={16} />
          {cap(M.months[monthIx(prev)])}
        </Link>
        <b>
          {cap(M.months[monthIx(m)])} {m.slice(0, 4)}
        </b>
        {m < thisMonth ? (
          <Link className="adm-btn adm-btn-line" href={`/b/money?m=${next}`} title={M.next} prefetch={false}>
            {cap(M.months[monthIx(next)])}
            <Ic name="right" size={16} />
          </Link>
        ) : (
          <span className="adm-btn adm-btn-line is-off" aria-disabled="true" title={M.next}>
            {cap(M.months[monthIx(next)])}
            <Ic name="right" size={16} />
          </span>
        )}
      </nav>

      <section className="adm-card">
        <span className="bx-owe-l">{M.owedFor(M.monthsFor[monthIx(m)])}</span>
        <p className="bx-owe-n">{euroText(st.owedCents)}</p>
        <dl className="bx-dl">
          <dt>{M.client(st.clientCount)}</dt>
          <dd>{euroText(st.clientCents)}</dd>
          <dt className="is-ok">{M.commission(pct)}</dt>
          <dd className="is-ok">{st.commissionCents ? `−${euroText(st.commissionCents)}` : euroText(0)}</dd>
          <dt>{M.self(selfCount)}</dt>
          <dd>{euroText(st.selfCents)}</dd>
          <dt>{M.rent}</dt>
          <dd>{euroText(st.rentCents)}</dd>
          <dt className="tot">{M.owed}</dt>
          <dd className="tot">{euroText(st.owedCents)}</dd>
        </dl>
        <div className="bx-owe-more">
          <div>
            <span>{M.open}</span>
            <span>{euroText(st.openCents)}</span>
          </div>
          <div>
            <span>{M.unbilled}</span>
            <span>{euroText(st.unbilledCents)}</span>
          </div>
        </div>
      </section>

      <section className="bx-sec">
        <h2 className="bx-ch">{M.invoices}</h2>
        {invoices.length === 0 && <p className="adm-meta">{M.noInvoices}</p>}
        {toPay.map((i) => {
          const ref = referenceNumber(i.number);
          return (
            <div key={i.id} className="adm-card bx-inv">
              <div className="bx-inv-head">
                <div>
                  <span className="num-row">
                    <b>№ {i.number}</b>
                    <span className="bx-tag amb">{M.status.due}</span>
                  </span>
                  <small>
                    {periodText(i, M)}
                    {i.dueOn ? ` · ${M.due(dateWords(i.dueOn.slice(0, 10), B.lang, { day: "numeric", month: "long" }))}` : ""}
                  </small>
                </div>
                <span>{euroText(i.grossCents)}</span>
              </div>
              {/* what he types in the bank's «viitenumber» field, as printed beside REMPIRE's IBAN */}
              {ref && (
                <div className="bx-ref">
                  <div>
                    <small>{M.reference}</small>
                    <b>{grouped(ref)}</b>
                  </div>
                  <CopyRef value={ref} />
                </div>
              )}
              <a className="adm-btn adm-btn-line" href={`/b/money/pdf/${i.id}`} target="_blank" rel="noopener">
                <Ic name="file" size={16} />
                {M.pdf}
              </a>
            </div>
          );
        })}
        {rest.length > 0 && (
          <ul className="bx-box bx-rows">
            {rest.map((i) => {
              const inner = (
                <>
                  <span className="txt">
                    <span className="tags">
                      <b>{i.number ? `№ ${i.number}` : M.status.draft}</b>
                      {i.number && <span className={`bx-tag${i.status === "paid" ? " ok" : ""}`}>{i.kind === "credit" ? M.credit : (M.status[i.status] ?? i.status)}</span>}
                    </span>
                    <small>{periodText(i, M)}</small>
                  </span>
                  <span className="end price">{euroText(i.grossCents)}</span>
                </>
              );
              return (
                <li key={i.id}>
                  {i.number ? (
                    <a className="bx-row" href={`/b/money/pdf/${i.id}`} target="_blank" rel="noopener">
                      {inner}
                      <span className="bx-chev">
                        <Ic name="right" size={18} />
                      </span>
                    </a>
                  ) : (
                    <div className="bx-row">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="bx-tip">{M.hint}</p>
      </section>

      <section className="bx-sec">
        <h2 className="bx-ch">{M.sales}</h2>
        {sales.length === 0 ? (
          <p className="adm-meta">{M.noSales}</p>
        ) : (
          <ul className="bx-box">
            {days.map((d) => (
              <DayRows key={d.date} day={d} B={B} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

type Day = { date: string; sales: Sale[]; count: number; cents: number };

/** His sales by the salon's day, newest first, each day with its count and sum (what stands: undone ones left out). */
function byDay(sales: Sale[], tz: string): Day[] {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: tz });
  const out: Day[] = [];
  for (const s of sales) {
    const date = f.format(new Date(s.createdAt));
    let d = out[out.length - 1];
    if (!d || d.date !== date) out.push((d = { date, sales: [], count: 0, cents: 0 }));
    d.sales.push(s);
    if (s.status !== "done") continue;
    d.cents += s.totalCents;
    if (!s.reversesId) d.count++;
  }
  return out;
}

function DayRows({ day, B }: { day: Day; B: Copy }) {
  const M = B.money;
  return (
    <>
      <li className="bx-dayh">
        <b>{dateWords(day.date, B.lang, { day: "numeric", month: "long" })}</b>
        <span>{M.dayHead(day.count, euroText(day.cents))}</span>
      </li>
      {day.sales.map((s) => (
        <li key={s.id} className={`bx-sale${s.status === "undone" ? " is-off" : ""}`}>
          <span className="txt">
            <span className="plain">
              {s.name} × {s.qty}
            </span>
            <small>
              {M.mode[s.mode] ?? s.mode}
              {s.commissionCents ? ` · ${M.yours(euroText(s.commissionCents))}` : ""}
              {s.reversesId ? ` · ${M.reversal}` : ""}
              {s.status === "undone" ? ` · ${M.undone}` : ""}
            </small>
          </span>
          <span className="end">{euroText(s.totalCents)}</span>
        </li>
      ))}
    </>
  );
}
