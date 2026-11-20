"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { periodOf, receiversReport, type ListRow } from "@/lib/billing/list";
import { euroText } from "@/lib/money";
import { useA } from "../../../../lang";
import { dmy, INV_ROOT, PartyIcon } from "../../common";
import { IvTop, Period, type PeriodValue } from "../../ui";
import { RepTabs } from "../tabs";

/** The period, «без НДС | с НДС», four figures, and a row per receiver invoiced in it. */
export function ReceiversReportView({ rows, today }: { rows: ListRow[]; today: string }) {
  const A = useA();
  const R = A.inv.rep;
  const [period, setPeriod] = useState<PeriodValue>(() => ({ gran: "month", ...periodOf("month", today) }));
  const [vat, setVat] = useState(true);
  const rep = useMemo(() => receiversReport(rows, period.from, period.to), [rows, period.from, period.to]);
  const sum = (s: { netCents: number; grossCents: number }) => euroText(vat ? s.grossCents : s.netCents);
  const stat = (label: string, value: React.ReactNode) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <>
      <IvTop title={A.inv.menu.reports} />
      <div className="iv-body">
        <RepTabs A={A} here="receivers" />
        <div className="iv-tools">
          <Period value={period} today={today} onChange={setPeriod} />
        </div>
        <div className="iv-rep-bar">
          <div className="iv-seg" role="group" aria-label={A.inv.vat}>
            <button type="button" aria-pressed={!vat} onClick={() => setVat(false)}>
              {R.net}
            </button>
            <button type="button" aria-pressed={vat} onClick={() => setVat(true)}>
              {R.gross}
            </button>
          </div>
          <dl className="iv-rep-stat" aria-label={period.from || period.to ? R.range(dmy(period.from), dmy(period.to)) : R.allTime}>
            {stat(R.stat.receivers, rep.receivers)}
            {stat(R.stat.invoices, rep.invoices)}
            {stat(R.stat.credits, rep.credits)}
            {stat(R.stat.total, sum(rep.total))}
          </dl>
        </div>
        <p className="iv-count" role="status">
          {period.from || period.to ? R.range(dmy(period.from), dmy(period.to)) : R.allTime}
        </p>
        {rep.rows.length === 0 ? (
          <p className="iv-empty">{R.none}</p>
        ) : (
          <div className="iv-tablewrap">
            <table className="iv-table iv-rep-table">
              <thead>
                <tr>
                  <th scope="col" aria-label={A.inv.rcv.kind} />
                  <th scope="col">{R.cols.name}</th>
                  <th scope="col" className="n">
                    {R.cols.invoices}
                  </th>
                  <th scope="col" className="n">
                    {R.cols.credits}
                  </th>
                  <th scope="col" className="n">
                    {R.cols.sold}
                  </th>
                  <th scope="col" className="n">
                    {R.cols.credited}
                  </th>
                  <th scope="col" className="n">
                    {R.cols.total}
                  </th>
                  <th scope="col" className="n">
                    {R.cols.last}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rep.rows.map((r) => (
                  <tr key={r.receiverId}>
                    <td className="ico">
                      <span className="iv-tile-ico is-round" aria-hidden="true">
                        <PartyIcon person={r.person} size={20} />
                      </span>
                    </td>
                    <td className="b">
                      <Link href={`${INV_ROOT}/receivers/${r.receiverId}`} prefetch={false}>
                        {r.name}
                      </Link>
                    </td>
                    <td className="n">{r.invoices}</td>
                    <td className="n">{r.credits}</td>
                    <td className="n">{sum(r.sold)}</td>
                    <td className="n">{sum(r.credited)}</td>
                    <td className="n">{sum(r.total)}</td>
                    <td className="n">
                      {r.last && (
                        <Link className="iv-link" href={`${INV_ROOT}/${r.last.id}`} prefetch={false}>
                          {r.last.number}, {dmy(r.last.date)}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
