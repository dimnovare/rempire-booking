"use client";

import { usePathname } from "next/navigation";
import { AppBar } from "@/components/app-bar";
import { Title, useA } from "../lang";
import { useFrame } from "./frame";
import { ACCOUNT, MORE, SECTIONS, sectionOpen } from "./sections";

/**
 * A phone's bottom bar in the salon's half of the staff app: five tabs at
 * most, so that each stays one tap away and its word stays readable on a
 * 360px phone (src/components/app-bar.tsx). Which tabs is the login's own
 * list (src/lib/admin/app-nav.ts, through the frame): «Мой день» first for
 * a login linked to a barber, the salon's four otherwise, and «Ещё»
 * (/admin/more) last: the sections that have no tab of their own are listed
 * there, and «Ещё» is lit while one of them is open. A new section goes
 * behind «Ещё»; the bar never gets a sixth column.
 *
 * From 900px the bar is gone with the whole top bar: the sidebar has the
 * sections as its menu (sidebar.tsx). The browser tab's title is still
 * written here, on every width.
 */

/** The tabs; the current one is lit once the path is known (it streams in). */
export function Nav() {
  return <NavLinks path={usePathname()} />;
}

export function NavLinks({ path }: { path: string }) {
  const A = useA();
  // the login's own tabs, and whether requests wait for an answer
  const { bar, waiting } = useFrame();
  const here = [...SECTIONS, MORE, ACCOUNT].find((it) => sectionOpen(it.href, path));
  return (
    <>
      {/* the browser tab says where you are, in the login's language */}
      <Title text={here ? A.nav[here.key] : ""} />
      <AppBar label={A.sections} bar={bar} words={A.nav} path={path} half="admin" waiting={waiting > 0 ? A.app.waiting(waiting) : null} />
    </>
  );
}
