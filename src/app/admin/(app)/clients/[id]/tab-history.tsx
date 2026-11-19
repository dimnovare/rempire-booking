"use client";

/**
 * «История визитов»: every visit he has had or has ahead, with any barber,
 * newest first, under a line for each day. A filter picks all of them, the
 * ones ahead, the ones behind or the cancelled ones. A visit's row says
 * who and when, how it ended (a coloured dot and the calendar's own word),
 * what was done and what it cost; its link opens that day in the calendar.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientVisit } from "@/lib/admin/clients";
import { localParts } from "@/lib/tz";
import { eur } from "../../../copy";
import { Ava } from "../../../icons";
import { useA } from "../../../lang";
import { useCard, useFmt } from "./parts";

const FILTERS = ["all", "ahead", "past", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

const fits = (v: ClientVisit, f: Filter) => (f === "all" ? true : f === "ahead" ? v.ahead : f === "cancelled" ? v.status === "cancelled" : !v.ahead && v.status !== "cancelled");

export function HistoryTab({ visits, capped }: { visits: ClientVisit[]; capped: number }) {
  const A = useA();
  const C = A.clients;
  const K = C.card;
  const { tz } = useCard();
  const fmt = useFmt(tz);
  const [filter, setFilter] = useState<Filter>("all");

  // newest first, a group per day of the salon's calendar
  const days = useMemo(() => {
    const out: { date: string; at: number; visits: ClientVisit[] }[] = [];
    for (const v of [...visits].filter((x) => fits(x, filter)).sort((a, b) => b.start - a.start)) {
      const date = localParts(v.start, tz).date;
      const last = out[out.length - 1];
      if (last?.date === date) last.visits.push(v);
      else out.push({ date, at: v.start, visits: [v] });
    }
    return out;
  }, [visits, filter, tz]);

  return (
    <div className="cc-scroll">
      <div className="cc-bar">
        <select className="cc-pick" aria-label={K.show} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {K.filters[f]}
            </option>
          ))}
        </select>
      </div>
      {visits.length === 0 ? (
        <p className="cc-meta">{C.noHistory}</p>
      ) : days.length === 0 ? (
        <p className="cc-meta">{K.noneShown}</p>
      ) : (
        <table className="cc-table cc-visits">
          <thead>
            <tr>
              <th scope="col">{K.cols.barber}</th>
              <th scope="col">{K.cols.status}</th>
              <th scope="col">{K.cols.service}</th>
              <th scope="col" className="n">
                {K.cols.cost}
              </th>
            </tr>
          </thead>
          {days.map((d) => (
            <tbody key={d.date}>
              <tr className="cc-day">
                <th scope="rowgroup" colSpan={4}>
                  {fmt.longDay(d.at)}
                </th>
              </tr>
              {d.visits.map((v) => (
                <tr key={v.id} className={`cc-visit st-${v.status}`}>
                  <td className="who">
                    <div className="cc-who">
                      <Ava src={v.staffPhoto} name={v.staffName} />
                      <span>
                        <b>{v.staffName}</b>
                        <span>
                          {fmt.time(v.start)}–{fmt.time(v.end)}
                        </span>
                        <Link href={`/admin?d=${d.date}`} prefetch={false} title={C.inCalendar}>
                          {K.toDay}
                        </Link>
                      </span>
                    </div>
                  </td>
                  <td className="st">
                    <span className={`cc-dot st-${v.status}`} aria-hidden="true" />
                    {A.visit.status[v.status] ?? v.status}
                  </td>
                  <td className="svc">{v.services.map((s) => A.pick(s)).filter(Boolean).join(", ") || "—"}</td>
                  <td className="n sum">{eur(v.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
      {capped > 0 && <p className="cc-meta">{C.capped(capped)}</p>}
    </div>
  );
}
