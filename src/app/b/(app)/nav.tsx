"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useB } from "../lang";

function Icon({ name }: { name: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  if (name === "day")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <rect x="3.5" y="5" width="17" height="15.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4M8 14h3" />
      </svg>
    );
  if (name === "time")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    );
  // a barcode: «Продать», the shop's products (Phase C)
  if (name === "sell")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <path d="M3.5 7V4.5h3M17.5 4.5h3V7M20.5 17v2.5h-3M6.5 19.5h-3V17M7.5 8v8M10.5 8v8M13 8v8M16.5 8v8" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/**
 * The four sections; the current one is lit. «Мои расчёты» sits under «Ещё».
 * The week has no tab: «День | Неделя» sits in the same dark bar of the day
 * and of the week (own-head.tsx), as the journal we follow has them side by
 * side (Dim, round 13). The tab is «Мой день», as in Renat's bar, and stays
 * lit on the week (Dim, 26.11.2026: option А).
 */
export function BNav() {
  const B = useB();
  const path = usePathname() ?? "";
  const items = [
    { href: "/b", label: B.nav.day, icon: "day", on: path === "/b" || path.startsWith("/b/week") },
    { href: "/b/time", label: B.nav.time, icon: "time", on: path.startsWith("/b/time") },
    { href: "/b/sell", label: B.nav.sell, icon: "sell", on: path.startsWith("/b/sell") },
    { href: "/b/more", label: B.nav.more, icon: "more", on: path.startsWith("/b/more") || path.startsWith("/b/pick") || path.startsWith("/b/money") },
  ];
  return (
    <nav className="adm-nav bx-nav" aria-label={B.nav.label}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={it.on ? "page" : undefined} prefetch={false}>
          <Icon name={it.icon} />
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
