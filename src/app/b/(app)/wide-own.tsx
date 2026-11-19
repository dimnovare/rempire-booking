"use client";

/**
 * A wide screen (from 900px) has no phone-wide pages for an owner or the
 * front desk who cuts too (docs/apps.md, «One app for Renat»): there «Мой
 * день» is the journal with «Мой день» chosen, and his time, his sums and a
 * product sale are the salon's own pages. So each of his barber pages sends
 * a wide screen on to its place in the salon, also when a tablet is turned
 * on its side. The page that holds this device's notifications stays: the
 * salon has no other place for it.
 *
 * The width is known only in the browser, so the start (/b/start) cannot
 * decide this: it sends such a login to /b, and /b does the rest here.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { MINE_KEY, rememberMine } from "../../admin/(app)/tab-state";

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export function WideOwn({ time, money }: { time: string; money: string }) {
  const path = usePathname() ?? "";
  const mine = path === "/b" || under(path, "/b/week");
  const to = mine || under(path, "/b/sell") ? "/admin" : under(path, "/b/time") ? time : under(path, "/b/money") ? money : null;

  useEffect(() => {
    if (!to) return;
    const wide = window.matchMedia("(min-width: 900px)");
    const go = () => {
      if (!wide.matches) return;
      if (mine) {
        // he asked for his day: the journal opens on it, in this tab and on this device
        try {
          window.sessionStorage.setItem(MINE_KEY, "1");
        } catch {
          /* private mode: the device's choice below still says so */
        }
        rememberMine(true);
      }
      window.location.replace(to);
    };
    go();
    wide.addEventListener("change", go);
    return () => wide.removeEventListener("change", go);
  }, [to, mine]);

  // nothing of the phone page is drawn on a wide screen while it leaves
  return to ? <style>{"@media (min-width: 900px) { .bx-app .adm-main, .bx-app .adm-nav { visibility: hidden; } }"}</style> : null;
}
