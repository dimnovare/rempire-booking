/**
 * /b/money?m=2026-11 «Мои расчёты» (Phase C, C4): the barber's own month.
 * What he sold and took for himself, his 17 %, the rent, and REMPIRE's
 * invoices to him with their PDFs and the reference number to pay each
 * with. He sees only his own (requireStaff).
 * Without `m` it is this month, still running.
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/current";
import { monthMoments } from "@/lib/billing/invoices";
import { referenceNumber } from "@/lib/billing/reference";
import { monthStatement } from "@/lib/billing/statement";
import { dbConfigured, query } from "@/lib/db";
import { bpText, euroText } from "@/lib/money";
import { listSales } from "@/lib/sales";
import { todayIn } from "@/lib/tz";
import { NextIcon, PrevIcon } from "../../../admin/icons";
import { Wait } from "../../lang";
import { getB } from "../../lang-server";
import { Title } from "../title";

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

async function Money({ searchParams }: { searchParams: PageProps<"/b/money">["searchParams"] }) {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { business, staff } = await requireStaff();
  const sp = await searchParams;
  const tz = business.timezone;
  const today = todayIn(tz);
  const m = typeof sp.m === "string" && MONTH.test(sp.m) ? sp.m : today.slice(0, 7);
  const { from, to } = monthMoments(m, tz);
  const [st, sales] = await Promise.all([monthStatement(query, business, staff.id, m), listSales(query, staff.id, from, to)]);
  const M = B.money;
  const pct = bpText(business.settings.commission_bp);
  const label = new Intl.DateTimeFormat(B.lang === "et" ? "et-EE" : B.lang === "en" ? "en-GB" : "ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${m}-01T12:00:00Z`))
    .replace(" г.", "");
  // a draft is Renat's until he issues it: the barber sees that one is coming, not its lines
  const invoices = st.invoices.filter((i) => i.status !== "discarded");
  const day = (at: string) => dmy(new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(new Date(at)));

  return (
    <main className="adm-page bx-money">
      <Title text={M.title} />
      <h1 className="adm-h1">{M.title}</h1>
      <p className="adm-meta">{M.lead}</p>
      <div className="adm-inv-month">
        <Link className="adm-ibtn" href={`/b/money?m=${shift(m, -1)}`} aria-label={M.prev} prefetch={false}>
          <PrevIcon />
        </Link>
        <h2>{label}</h2>
        {m < today.slice(0, 7) && (
          <Link className="adm-ibtn" href={`/b/money?m=${shift(m, 1)}`} aria-label={M.next} prefetch={false}>
            <NextIcon />
          </Link>
        )}
      </div>

      <section className="adm-card">
        <ul className="adm-lines">
          <li>
            <span>{M.client(st.clientCount)}</span>
            <span>{euroText(st.clientCents)}</span>
          </li>
          <li className="is-sp">
            <span>{M.commission(pct)}</span>
            <span>{st.commissionCents ? `−${euroText(st.commissionCents)}` : euroText(0)}</span>
          </li>
          <li>
            <span>{M.self}</span>
            <span>{euroText(st.selfCents)}</span>
          </li>
          <li>
            <span>{M.rent}</span>
            <span>{euroText(st.rentCents)}</span>
          </li>
          <li className="tot">
            <span>{M.owed}</span>
            <span>{euroText(st.owedCents)}</span>
          </li>
        </ul>
        <p className="adm-meta">
          {M.open}: {euroText(st.openCents)} · {M.unbilled}: {euroText(st.unbilledCents)}
        </p>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">{M.invoices}</h2>
        {invoices.length === 0 ? (
          <p className="adm-meta">{M.noInvoices}</p>
        ) : (
          <ul className="adm-list bx-rows">
            {invoices.map((i) => (
              <li key={i.id} className="bx-sale">
                <span className="txt">
                  <span className="plain">
                    {i.number ?? M.status.draft}
                    {i.kind === "credit" ? ` · ${M.credit}` : ""}
                  </span>
                  <small>
                    {dmy(i.periodFrom)}–{dmy(i.periodTo)} · {M.status[i.status] ?? i.status}
                    {i.status === "issued" && i.kind === "invoice" && i.dueOn ? ` · ${M.due(dmy(i.dueOn))}` : ""}
                    {/* what he types in the bank's «viitenumber» field, as printed beside REMPIRE's IBAN */}
                    {i.kind === "invoice" && referenceNumber(i.number) ? ` · ${M.reference(referenceNumber(i.number))}` : ""}
                  </small>
                </span>
                <span className="end">{euroText(i.grossCents)}</span>
                {i.number && (
                  <a className="adm-btn adm-btn-ghost adm-btn-sm" href={`/b/money/pdf/${i.id}`} target="_blank" rel="noopener">
                    {M.pdf}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="adm-meta">{M.hint}</p>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">{M.sales}</h2>
        {sales.length === 0 ? (
          <p className="adm-meta">{M.noSales}</p>
        ) : (
          <ul className="adm-list bx-rows">
            {sales.map((s) => (
              <li key={s.id} className={`bx-sale${s.status === "undone" ? " is-off" : ""}`}>
                <span className="txt">
                  <span className="plain">
                    {s.name} × {s.qty}
                  </span>
                  <small>
                    {day(s.createdAt)} · {M.mode[s.mode] ?? s.mode}
                    {s.commissionCents ? ` · ${M.commission(pct)} ${euroText(s.commissionCents)}` : ""}
                    {s.reversesId ? ` · ${M.reversal}` : ""}
                    {s.status === "undone" ? ` · ${M.undone}` : ""}
                  </small>
                </span>
                <span className="end">{euroText(s.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
