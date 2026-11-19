"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Title, useA } from "../lang";
import { useFrame } from "./frame";
import { ACCOUNT, MORE, SECTIONS, SectionIcon, sectionOpen } from "./sections";

/**
 * The sections of the daily work (sections.tsx) as a phone's bottom bar,
 * with five tabs at most, so that each stays one tap away and its word
 * stays readable on a 360px phone. The fifth is «Ещё» (/admin/more): the
 * sections that have no tab of their own are listed there, and «Ещё» is lit
 * while one of them is open. A new section goes behind «Ещё»; the bar never
 * gets a sixth column. The styles hide `in-more` (admin.css).
 *
 * From 900px the bar is gone with the whole top bar: the sidebar has the
 * sections as its menu (sidebar.tsx). The browser tab's title is still
 * written here, on every width.
 */

/** The sections; the current one is lit once the path is known (it streams in). */
export function Nav() {
  return <NavLinks path={usePathname()} />;
}

export function NavLinks({ path }: { path: string }) {
  const A = useA();
  // a section the login has no right to is not offered
  const { off } = useFrame();
  const on = (href: string) => sectionOpen(href, path);
  const here = [...SECTIONS, MORE, ACCOUNT].find((it) => on(it.href));
  // behind «Ещё» on a phone: its own page, or a section without a tab
  const inMore = on(MORE.href) || SECTIONS.some((it) => !it.bar && on(it.href));
  return (
    <>
      {/* the browser tab says where you are, in the login's language */}
      <Title text={here ? A.nav[here.key] : ""} />
      <nav className="adm-nav" aria-label={A.sections}>
        {SECTIONS.filter((it) => !off.includes(it.key)).map((it) => (
          <Link key={it.href} href={it.href} className={it.bar ? undefined : "in-more"} aria-current={on(it.href) ? "page" : undefined} prefetch={false}>
            <SectionIcon name={it.icon} />
            <span>{A.nav[it.key]}</span>
          </Link>
        ))}
        <Link href={MORE.href} className="is-more" aria-current={inMore ? "page" : undefined} prefetch={false}>
          <SectionIcon name={MORE.icon} />
          <span>{A.nav[MORE.key]}</span>
        </Link>
      </nav>
    </>
  );
}

/** «Доступ» in the top bar's corner: the logins, the password, the language. Lit while it is open. */
export function AccountLink() {
  const A = useA();
  const on = usePathname().startsWith(ACCOUNT.href);
  return (
    <Link href={ACCOUNT.href} className="adm-acc" aria-current={on ? "page" : undefined} prefetch={false}>
      <SectionIcon name={ACCOUNT.icon} />
      <span>{A.nav[ACCOUNT.key]}</span>
    </Link>
  );
}
