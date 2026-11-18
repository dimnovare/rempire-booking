/**
 * The staff app's side switch (docs/apps.md): «Мой день | Салон», for Renat
 * and the front desk, in the same place on both sides. A barber has one
 * side and never sees it.
 *
 *   - «Мой день» is his own day in the barber app, if his login is linked
 *     to a barber (Renat cuts too). Without a link it reads «Барбер» and
 *     opens the barber he looked at last, or the list to pick one.
 *   - «Салон» is the admin. A dot on it says requests wait for an answer.
 *
 * Rendered twice by each shell: in the top bar on a wide screen (`bar`) and
 * as a row under it on a phone or a tablet upright (`row`); the styles show
 * one of them. Plain links: the two sides have their own root layouts.
 */
import { cache } from "react";
import { currentStaffUser } from "@/lib/auth/current";
import type { Side } from "@/lib/auth/side";
import { countWaitingRequests } from "@/lib/barber/requests";
import { dbConfigured, query } from "@/lib/db";

export type SideWords = { label: string; mine: string; barber: string; salon: string; waiting: (n: number) => string };

// once per request, however many places show the switch
const waiting = cache((businessId: string) => countWaitingRequests(query, businessId).catch(() => 0));

export async function SideSwitch({ side, words, where }: { side: Side; words: SideWords; where: "bar" | "row" }) {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user || user.role === "staff") return null;
  const n = await waiting(user.businessId);
  return (
    <nav className={`adm-side adm-side-${where}`} aria-label={words.label}>
      <a href={user.staffId ? "/b/mine" : "/b"} aria-current={side === "b" ? "page" : undefined}>
        {user.staffId ? words.mine : words.barber}
      </a>
      <a href="/admin" aria-current={side === "admin" ? "page" : undefined}>
        {words.salon}
        {n > 0 && <span className="adm-side-dot" role="img" aria-label={words.waiting(n)} title={words.waiting(n)} />}
      </a>
    </nav>
  );
}
