"use client";

/**
 * «Статистика»: what he spent in a period. Two dates on top (the card opens
 * on this month and the eleven before it), then three cards: the sum of
 * each month as bars, his services and his barbers, each with how many
 * times and how much. The same visits as «Продано»: begun, neither
 * cancelled nor a no-show.
 *
 * The chart is drawn here as plain SVG, with no library: a bar a month, the
 * sum above the tallest, three lines to read the height by. Its numbers are
 * also in the bars' own titles and in the tables beside it.
 */
import { useRef, useState } from "react";
import type { ClientStats } from "@/lib/admin/client-card";
import { eur } from "../../../copy";
import { useA } from "../../../lang";
import { clientStatsAction } from "../actions";
import { useCard } from "./parts";

export function StatsTab({ initial, today }: { initial: ClientStats; today: string }) {
  const A = useA();
  const K = A.clients.card;
  const card = useCard();
  const [stats, setStats] = useState(initial);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const ask = async (a: string, b: string) => {
    // a date half typed is not asked for
    if (!a || !b) return;
    const n = ++seq.current;
    setBusy(true);
    setFailed(false);
    const r = await clientStatsAction(card.id, a, b).catch(() => null);
    if (n !== seq.current) return;
    setBusy(false);
    if (!r) return setFailed(true);
    // as the server read the two dates: the right way round, not too long
    setStats(r);
    setFrom(r.from);
    setTo(r.to);
  };

  return (
    <div className="cc-scroll">
      <div className="cc-bar cc-period" role="group" aria-label={K.period}>
        <label className="cc-field">
          <span>{K.from}</span>
          <input
            type="date"
            value={from}
            max={today}
            onChange={(e) => {
              setFrom(e.target.value);
              void ask(e.target.value, to);
            }}
          />
        </label>
        <label className="cc-field">
          <span>{K.to}</span>
          <input
            type="date"
            value={to}
            max={today}
            onChange={(e) => {
              setTo(e.target.value);
              void ask(from, e.target.value);
            }}
          />
        </label>
      </div>
      {failed && (
        <p className="adm-err" role="alert">
          {A.error}
        </p>
      )}
      <div className={`cc-stats${busy ? " is-busy" : ""}`}>
        <section className="cc-stat cc-stat-wide" aria-label={K.revenue}>
          <h2 className="cc-h">{K.revenue}</h2>
          <p className="cc-stat-total">{K.soldFor(eur(stats.totalCents), stats.visits)}</p>
          {stats.visits === 0 ? <p className="cc-meta">{K.statsNone}</p> : <Chart months={stats.months} />}
        </section>
        <section className="cc-stat" aria-label={K.services}>
          <h2 className="cc-h">{K.services}</h2>
          <Rows head={K.cols.service} rows={stats.services.map((s) => ({ key: s.id, name: A.pick(s.name), count: s.count, cents: s.cents }))} />
        </section>
        <section className="cc-stat" aria-label={K.barbers}>
          <h2 className="cc-h">{K.barbers}</h2>
          <Rows head={K.cols.barber} rows={stats.staff.map((s) => ({ key: s.id, name: s.name, count: s.count, cents: s.cents }))} />
        </section>
      </div>
    </div>
  );
}

function Rows({ head, rows }: { head: string; rows: { key: string; name: string; count: number; cents: number }[] }) {
  const K = useA().clients.card;
  if (!rows.length) return <p className="cc-meta">{K.statsNone}</p>;
  return (
    <table className="cc-table cc-rows">
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col" className="n">
            {K.count}
          </th>
          <th scope="col" className="n">
            {K.sum}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.name}</td>
            <td className="n">{r.count}</td>
            <td className="n">{eur(r.cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The top of the scale: the first round number at or above the tallest bar, in euros. */
function scaleTop(maxCents: number): number {
  const eurMax = Math.max(1, maxCents / 100);
  const pow = 10 ** Math.floor(Math.log10(eurMax));
  const step = [1, 2, 2.5, 5, 10].find((k) => k * pow >= eurMax) ?? 10;
  return step * pow;
}

const H = 200;
const TOP = 16;
const BASE = 168;
const LEFT = 48;
/** The room the bars share: with the scale on the left the chart is 800 wide, as the drawer's column. */
const ROOM = 744;

function Chart({ months }: { months: ClientStats["months"] }) {
  const A = useA();
  const K = A.clients.card;
  const short = new Intl.DateTimeFormat(A.intl, { timeZone: "UTC", month: "short" });
  const full = new Intl.DateTimeFormat(A.intl, { timeZone: "UTC", month: "long", year: "numeric" });
  const at = (m: string) => Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
  const top = scaleTop(Math.max(...months.map((m) => m.cents)));
  // a year fills the width; a longer period gets narrower bars, then the chart scrolls sideways
  const slot = Math.min(96, Math.max(28, Math.floor(ROOM / months.length)));
  const width = LEFT + months.length * slot + 8;
  const y = (cents: number) => BASE - ((cents / 100) / top) * (BASE - TOP);
  // with many months a label for every second or third one, so they do not run together
  const every = Math.ceil(40 / slot);
  return (
    <div className="cc-chart">
      <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label={K.revenue}>
        {[0, 0.5, 1].map((k) => (
          <g key={k}>
            <line x1={LEFT} x2={width} y1={y(top * 100 * k)} y2={y(top * 100 * k)} className="grid" />
            <text x={LEFT - 8} y={y(top * 100 * k) + 4} textAnchor="end" className="tick">
              {eur(Math.round(top * 100 * k))}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = LEFT + i * slot + 8;
          const january = m.month.endsWith("-01");
          return (
            <g key={m.month}>
              {m.cents > 0 && (
                <rect x={x} y={y(m.cents)} width={slot - 16} height={BASE - y(m.cents)} rx="3" className="bar">
                  <title>{K.monthSum(full.format(at(m.month)), eur(m.cents))}</title>
                </rect>
              )}
              {(i % every === 0 || january) && (
                <text x={x + (slot - 16) / 2} y={BASE + 16} textAnchor="middle" className="tick">
                  {short.format(at(m.month)).replace(".", "")}
                  {(january || i === 0) && <tspan> {m.month.slice(2, 4)}</tspan>}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
