"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { A } from "../copy";

const ITEMS = [
  { href: "/admin", label: A.nav.calendar, icon: "cal" },
  { href: "/admin/staff", label: A.nav.staff, icon: "staff" },
  { href: "/admin/services", label: A.nav.services, icon: "svc" },
  { href: "/admin/account", label: A.nav.account, icon: "key" },
] as const;

function Icon({ name }: { name: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  if (name === "cal")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <rect x="3.5" y="5" width="17" height="15.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    );
  if (name === "staff")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 010 6.4M18 14.4c2 .9 3.5 2.8 3.5 5.6" />
      </svg>
    );
  if (name === "svc")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <circle cx="6.5" cy="17.5" r="3" />
        <circle cx="17.5" cy="17.5" r="3" />
        <path d="M8.6 15.4L19 3M15.4 15.4L5 3" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.2 11.8L20 3M16.5 6.5l3 3M14 9l2 2" />
    </svg>
  );
}

/** The sections; the current one is lit once the path is known (it streams in). */
export function Nav() {
  return <NavLinks path={usePathname()} />;
}

export function NavLinks({ path }: { path: string }) {
  return (
    <nav className="adm-nav" aria-label="Разделы">
      {ITEMS.map((it) => {
        const on = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined} prefetch={false}>
            <Icon name={it.icon} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
