"use client";

/**
 * «Счета» in its own frame (the owner, 19.11.2026): from 900px the section's
 * sidebar stands where the salon's was, to the design board «Счета, список»:
 * 260px of indigo, our mark and «REMPIRE», the section's six pages as 48px
 * rows (the open one darker) and, at the foot, «В салон» back to the
 * journal. The salon's month, tiles and menu are not shown here.
 *
 * sidebar.tsx shows it for every address under /admin/invoices. A phone has
 * no sidebar: the same six pages are a row of chips under a page's title
 * (ui.tsx, IvTop).
 */
import Link from "next/link";
import { TowerMark } from "@/components/brand";
import { useA } from "../../lang";
import { INV_PAGES, InvIcon, invPageOf } from "./common";

export function InvoiceSide({ path, demo }: { path: string; demo: boolean }) {
  const A = useA();
  const here = invPageOf(path);
  return (
    <aside className="sb iv-side" aria-label={A.frame.sidebar}>
      <div className="iv-brand">
        <span className="iv-mark">
          <TowerMark />
        </span>
        <span>REMPIRE</span>
        {demo && (
          <span className="adm-tag lime" title={A.demo}>
            {A.demoTag}
          </span>
        )}
      </div>
      <nav className="iv-nav" aria-label={A.inv.title}>
        {INV_PAGES.map((p) => (
          <Link key={p.key} href={p.href} prefetch={false} aria-current={here === p.key ? "page" : undefined}>
            <InvIcon name={p.key} />
            <span>{A.inv.menu[p.key]}</span>
          </Link>
        ))}
      </nav>
      <div className="iv-foot">
        <Link href="/admin" prefetch={false}>
          <InvIcon name="back" />
          <span>{A.inv.toSalon}</span>
        </Link>
      </div>
    </aside>
  );
}
