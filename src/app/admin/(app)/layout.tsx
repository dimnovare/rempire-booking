import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { SideSwitch } from "@/components/side-switch";
import { TestBanner } from "@/components/test-banner";
import { currentStaffUser } from "@/lib/auth/current";
import { dbConfigured, dbKind } from "@/lib/db";
import { OutIcon } from "../icons";
import { getA } from "../lang-server";
import { logout } from "./account/actions";
import { SaveToast } from "./autosave";
import { AccountLink, Nav, NavLinks } from "./nav";

/**
 * The logged-in admin. One thin bar on top with «Доступ» and «Выйти» on the
 * right, on every screen; the sections of the daily work sit at the bottom
 * on phones and in the top bar from 900px. Each page checks the login itself.
 *
 * It is the «Салон» side of the staff app (docs/apps.md): the side switch
 * sits beside the logo on a wide screen and in a row under the bar on a
 * phone, the same as in the barber app.
 */
export default function AdminApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-app">
      <TestBanner app="admin" report />
      <header className="adm-top">
        <a href="/admin" className="adm-brand" aria-label="REMPIRE">
          <Logo />
        </a>
        <Suspense fallback={null}>
          <Side where="bar" />
        </Suspense>
        <Suspense fallback={<NavLinks path="" />}>
          <Nav />
        </Suspense>
        <Suspense fallback={null}>
          <Me />
        </Suspense>
      </header>
      <Suspense fallback={null}>
        <Side where="row" />
      </Suspense>
      <div className="adm-main">{children}</div>
      <SaveToast />
    </div>
  );
}

async function Side({ where }: { where: "bar" | "row" }) {
  return <SideSwitch side="admin" where={where} words={(await getA()).side} />;
}

/** «Демо», the e-mail (wide screens), «Доступ» and «Выйти». */
async function Me() {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user) return null;
  const A = await getA();
  return (
    <div className="adm-me">
      {dbKind() === "pglite" && (
        <span className="adm-tag lime" title={A.demo}>
          {A.demoTag}
        </span>
      )}
      <span className="adm-email">{user.email}</span>
      <AccountLink />
      <form action={logout}>
        <button className="adm-out">
          <OutIcon />
          {A.account.logout}
        </button>
      </form>
    </div>
  );
}
