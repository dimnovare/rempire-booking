import Link from "next/link";
import type { Copy } from "../../../copy";
import { INV_ROOT } from "../common";

/** The two reports: the month per barber, and the receivers for a period. */
export function RepTabs({ A, here }: { A: Copy; here: "month" | "receivers" }) {
  const tabs = [
    ["month", `${INV_ROOT}/reports`],
    ["receivers", `${INV_ROOT}/reports/receivers`],
  ] as const;
  return (
    <nav className="iv-tabs" aria-label={A.inv.menu.reports}>
      {tabs.map(([key, href]) => (
        <Link key={key} href={href} prefetch={false} aria-current={here === key ? "page" : undefined}>
          {A.inv.rep.tabs[key]}
        </Link>
      ))}
    </nav>
  );
}
