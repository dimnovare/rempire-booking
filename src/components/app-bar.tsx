"use client";

/**
 * The one bottom bar of the staff app on a phone, for an owner or the front
 * desk (docs/apps.md, «One app for Renat»): the same five tabs on every
 * screen of both halves of the app, the salon's pages at /admin and the
 * login's own barber pages at /b. Which tabs a login has, where each goes
 * and which one is lit on a page is src/lib/admin/app-nav.ts; a barber's
 * own bar is the barber app's (src/app/b/(app)/nav.tsx).
 *
 * The two halves have their own root layouts, so a tab of the other half is
 * a plain link (a full page), one of this half a client-side one. The
 * words come from whoever draws the bar: each half has its own copy.
 */
import Link from "next/link";
import { litTab, TAB_HREF, type BarKey } from "@/lib/admin/app-nav";
import { SectionIcon } from "@/app/admin/(app)/sections";

const ICON: Record<BarKey, string> = { mine: "me", calendar: "cal", clients: "cli", reports: "rep", invoices: "inv", more: "more" };

export type AppBarProps = {
  /** the bar's name for a screen reader: «Разделы» */
  label: string;
  /** the login's tabs, in order */
  bar: readonly BarKey[];
  words: Record<BarKey, string>;
  /** the page that is open; "" while it is not known yet */
  path: string;
  /** which half draws the bar */
  half: "admin" | "b";
  /** «Запросов ждёт: 2», when requests wait for an answer: the dot on «Ещё», where «Запросы» is a row */
  waiting?: string | null;
  className?: string;
};

export function AppBar({ label, bar, words, path, half, waiting, className }: AppBarProps) {
  const lit = litTab(path, bar);
  return (
    <nav className={`adm-nav one-nav${className ? ` ${className}` : ""}`} aria-label={label}>
      {bar.map((k) => {
        const href = TAB_HREF[k];
        const inner = (
          <>
            <SectionIcon name={ICON[k]} />
            <span>{words[k]}</span>
            {k === "more" && waiting && <i className="one-dot" role="img" aria-label={waiting} title={waiting} />}
          </>
        );
        const current = lit === k ? "page" : undefined;
        return (href.startsWith("/b") ? "b" : "admin") === half ? (
          <Link key={k} href={href} aria-current={current} prefetch={false}>
            {inner}
          </Link>
        ) : (
          <a key={k} href={href} aria-current={current}>
            {inner}
          </a>
        );
      })}
    </nav>
  );
}
