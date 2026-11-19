/**
 * The admin's sections, in one place: the bar (nav.tsx) and the «Ещё» page
 * (more/page.tsx) read the same list. No hooks and no "use client": a
 * server page and the client bar both import it.
 *
 * A phone's bottom bar has room for five: the four with `bar` and «Ещё»,
 * which opens /admin/more with the rest as large rows. A new section
 * without `bar` shows up there by itself.
 *
 * From 900px the sections are the sidebar's menu (MENU below, sidebar.tsx):
 * an accordion, as in the product we follow (docs/reference-looks.md).
 */
export const SECTIONS = [
  { href: "/admin", key: "calendar", icon: "cal", bar: true },
  { href: "/admin/clients", key: "clients", icon: "cli", bar: true },
  { href: "/admin/staff", key: "staff", icon: "staff", bar: false },
  { href: "/admin/services", key: "services", icon: "svc", bar: false },
  // the shop's products, read through the shop link (docs/one-place.md)
  { href: "/admin/catalogue", key: "catalogue", icon: "box", bar: false },
  { href: "/admin/requests", key: "requests", icon: "req", bar: true },
  { href: "/admin/invoices", key: "invoices", icon: "inv", bar: true },
] as const;

/** «Ещё»: only in a phone's bar. Lit while one of the sections behind it is open. */
export const MORE = { href: "/admin/more", key: "more", icon: "more" } as const;

/** «Доступ» is about the person, not the work: it sits in the corner beside «Выйти» (AccountLink). */
export const ACCOUNT = { href: "/admin/account", key: "account", icon: "key" } as const;

/**
 * The sidebar's menu from 900px («Все разделы»): a row per section, or a
 * group that opens its pages under it. The calendar is not in it: the
 * yellow bar at the foot goes there. `key` and each page's `key` are words
 * of copy `nav`.
 */
export type MenuPage = { href: string; key: "clientBase" | "catalogue" };
export type MenuRow = { key: "clients" | "staff" | "services" | "goods" | "requests" | "invoices" | "account"; icon: string; href?: string; pages?: readonly MenuPage[] };
export const MENU: readonly MenuRow[] = [
  { key: "clients", icon: "cli", pages: [{ href: "/admin/clients", key: "clientBase" }] },
  { key: "staff", icon: "staff", href: "/admin/staff" },
  { key: "services", icon: "svc", href: "/admin/services" },
  { key: "goods", icon: "box", pages: [{ href: "/admin/catalogue", key: "catalogue" }] },
  { key: "requests", icon: "req", href: "/admin/requests" },
  { key: "invoices", icon: "inv", href: "/admin/invoices" },
  { key: "account", icon: "key", href: "/admin/account" },
];

/** Is this section the open one? The calendar is /admin itself. */
export const sectionOpen = (href: string, path: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

export function SectionIcon({ name, size = 22 }: { name: string; size?: number }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true, width: size, height: size } as const;
  if (name === "cal")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <rect x="3.5" y="5" width="17" height="15.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    );
  // a card with a person and two lines: the client base
  if (name === "cli")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <rect x="3" y="4.5" width="18" height="15" />
        <circle cx="8.5" cy="10.5" r="2.2" />
        <path d="M5 16.5c.4-1.8 1.8-2.8 3.5-2.8s3.1 1 3.5 2.8M14.5 9.5h4M14.5 13.5h4" />
      </svg>
    );
  if (name === "staff")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 010 6.4M18 14.4c2 .9 3.5 2.8 3.5 5.6" />
      </svg>
    );
  if (name === "svc")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="6.5" cy="17.5" r="3" />
        <circle cx="17.5" cy="17.5" r="3" />
        <path d="M8.6 15.4L19 3M15.4 15.4L5 3" />
      </svg>
    );
  // an inbox: what has come in and waits for an answer (the barbers' requests, Phase B)
  if (name === "req")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M3.5 13.5l2.6-8h11.8l2.6 8v6h-17zM3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5" />
      </svg>
    );
  // a sheet with lines and a total: the barbers' invoices (Phase C)
  if (name === "inv")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M5.5 3h13v18l-2.2-1.5-2.1 1.5-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5zM9 8h6M9 12h6M9 16h3" />
      </svg>
    );
  // a box: the shop's products
  if (name === "box")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5L12 12l8.5-4.5M12 12v9" />
      </svg>
    );
  // a shopping bag: a product sold
  if (name === "bag")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M5 8h14l-1 12.5H6zM9 8V6.5a3 3 0 016 0V8" />
      </svg>
    );
  // four squares: every section
  if (name === "all")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" />
      </svg>
    );
  // a star: «Избранное»
  if (name === "star")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
      </svg>
    );
  // three lines, as «Ещё» in the barber app
  if (name === "more")
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.2 11.8L20 3M16.5 6.5l3 3M14 9l2 2" />
    </svg>
  );
}
