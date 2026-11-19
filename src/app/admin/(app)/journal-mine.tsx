"use client";

/**
 * «Моё»: the panel beside a login's own column, from 900px, while the
 * journal shows «Мой день» (docs/apps.md, «One app for Renat»; the design
 * board «A: на компьютере»). On the page's ground with a 1px line on its
 * left, as the journal's other panel:
 *
 *   - who is in the chair now and until when, who is next
 *     (src/lib/admin/journal.ts, mineNow: the barber app's own rule), and
 *     today's count and sum, the sum only with the right to see sums;
 *   - the links to what is his alone: his hours (his own page under
 *     «Барберы»), his month under «Счета», and the client base on the
 *     clients who came to him.
 *
 * It is always about today, whatever day the journal shows.
 */
import Link from "next/link";
import { mineNow, type MineToday } from "@/lib/admin/journal";
import { eur } from "../copy";
import { useA } from "../lang";

export type MineLinks = { time: string | null; money: string | null; clients: string | null };

export function JournalMine({ today, links, now, tz }: { today: MineToday; links: MineLinks; now: number; tz: string }) {
  const A = useA();
  const M = A.app;
  const { chair, next } = mineNow(today.visits, now);
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const rows = [
    { key: "time", href: links.time, label: M.myTime },
    { key: "money", href: links.money, label: M.myMoney },
    { key: "clients", href: links.clients, label: M.myClients },
  ].filter((r): r is { key: string; href: string; label: string } => !!r.href);
  return (
    <aside className="jr-mine-side only-wide" aria-label={M.panel}>
      <h2>{M.panel}</h2>
      <dl className="jr-mine-card">
        <div data-row="chair">
          <dt>{M.chair}</dt>
          <dd>{chair ? M.until(chair.clientName, time.format(chair.end)) : M.nobody}</dd>
        </div>
        <div data-row="next">
          <dt>{M.next}</dt>
          <dd>{next ? [next.clientName, time.format(next.start), A.pick(next.service)].filter(Boolean).join(" · ") : M.noNext}</dd>
        </div>
        <div data-row="today">
          <dt>{M.today}</dt>
          <dd>
            {A.cal.visits(today.count)}
            {today.totalCents != null && ` · ${eur(today.totalCents)}`}
          </dd>
        </div>
      </dl>
      {rows.length > 0 && (
        <nav className="jr-mine-links" aria-label={M.panel}>
          {rows.map((r) => (
            <Link key={r.key} href={r.href} prefetch={false}>
              {r.label}
            </Link>
          ))}
        </nav>
      )}
    </aside>
  );
}
