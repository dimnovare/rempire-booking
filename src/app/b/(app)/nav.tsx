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
  if (name === "week")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <rect x="3.5" y="5" width="17" height="15.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" />
      </svg>
    );
  if (name === "time")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** The four sections; the current one is lit. */
export function BNav() {
  const B = useB();
  const path = usePathname() ?? "";
  const items = [
    { href: "/b", label: B.nav.day, icon: "day", on: path === "/b" },
    { href: "/b/week", label: B.nav.week, icon: "week", on: path.startsWith("/b/week") },
    { href: "/b/time", label: B.nav.time, icon: "time", on: path.startsWith("/b/time") },
    { href: "/b/more", label: B.nav.more, icon: "more", on: path.startsWith("/b/more") || path.startsWith("/b/pick") },
  ];
  return (
    <nav className="adm-nav bx-nav" aria-label={B.nav.more}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={it.on ? "page" : undefined} prefetch={false}>
          <Icon name={it.icon} />
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
