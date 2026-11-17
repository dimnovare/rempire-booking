import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { currentStaffUser } from "@/lib/auth/current";
import { dbConfigured, dbKind } from "@/lib/db";
import { A } from "../copy";
import { OutIcon } from "../icons";
import { logout } from "./account/actions";
import { Nav, NavLinks } from "./nav";

/**
 * The logged-in admin. One thin bar on top with «Выйти» on the right, on
 * every screen; the sections sit at the bottom on phones and in the top bar
 * from 900px. Each page checks the login itself.
 */
export default function AdminApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-app">
      <header className="adm-top">
        <a href="/admin" className="adm-brand" aria-label="REMPIRE">
          <Logo />
        </a>
        <Suspense fallback={<NavLinks path="" />}>
          <Nav />
        </Suspense>
        <Suspense fallback={null}>
          <Me />
        </Suspense>
      </header>
      <div className="adm-main">{children}</div>
    </div>
  );
}

/** «Демо», the e-mail (wide screens) and «Выйти». */
async function Me() {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user) return null;
  return (
    <div className="adm-me">
      {dbKind() === "pglite" && (
        <span className="adm-tag lime" title={A.demo}>
          {A.demoTag}
        </span>
      )}
      <span className="adm-email">{user.email}</span>
      <form action={logout}>
        <button className="adm-out">
          <OutIcon />
          {A.account.logout}
        </button>
      </form>
    </div>
  );
}
