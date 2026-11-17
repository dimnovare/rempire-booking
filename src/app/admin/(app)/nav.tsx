"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Title, useA } from "../lang";

const ITEMS = [
  { href: "/admin", key: "calendar", icon: "cal" },
  { href: "/admin/staff", key: "staff", icon: "staff" },
  { href: "/admin/services", key: "services", icon: "svc" },
  { href: "/admin/requests", key: "requests", icon: "req" },
  { href: "/admin/account", key: "account", icon: "key" },
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
  // an inbox: what has come in and waits for an answer (the barbers' requests, Phase B)
  if (name === "req")
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" {...p}>
        <path d="M3.5 13.5l2.6-8h11.8l2.6 8v6h-17zM3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5" />
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
  const A = useA();
  const on = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const here = ITEMS.find((it) => on(it.href));
  return (
    <>
      {/* the browser tab says where you are, in the login's language */}
      <Title text={here ? A.nav[here.key] : ""} />
      <nav className="adm-nav" aria-label={A.sections}>
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} aria-current={on(it.href) ? "page" : undefined} prefetch={false}>
            <Icon name={it.icon} />
            <span>{A.nav[it.key]}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
