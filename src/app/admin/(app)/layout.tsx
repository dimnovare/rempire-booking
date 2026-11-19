import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { SideSwitch } from "@/components/side-switch";
import { TestBanner } from "@/components/test-banner";
import { listFavourites } from "@/lib/admin/favourites";
import { monthLoad } from "@/lib/admin/month-load";
import { currentStaffUser } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { canUseAdmin } from "@/lib/auth/sessions";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { testRun } from "@/lib/test-run";
import { todayIn } from "@/lib/tz";
import { OutIcon } from "../icons";
import { getA } from "../lang-server";
import { logout } from "./account/actions";
import { SaveToast } from "./autosave";
import { FrameProvider } from "./frame";
import { AccountLink, Nav, NavLinks } from "./nav";
import { Sidebar } from "./sidebar";

/**
 * The logged-in admin. On a phone: one thin bar on top with «Доступ» and
 * «Выйти» on the right, and the sections of the daily work in a bar at the
 * bottom, four of them and «Ещё» (nav.tsx, sections.tsx). From 900px the
 * top bar is gone and the sidebar on the left holds everything
 * (sidebar.tsx, admin.css): the month, the tiles and «Избранное», or the
 * menu of every section. Each page checks the login itself.
 *
 * It is the «Салон» side of the staff app (docs/apps.md): the side switch
 * sits under the logo in the sidebar on a wide screen and in a row under
 * the bar on a phone, the same as in the barber app.
 *
 * Around all of it, the frame (frame.tsx): the login's starred pages and
 * the drawers that the sidebar's tiles open.
 */
export default function AdminApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-app">
      <TestBanner app="admin" report />
      <Suspense fallback={null}>
        <Framed>{children}</Framed>
      </Suspense>
    </div>
  );
}

/** The login's starred pages come first: the star beside a page's title is right from the start. */
async function Framed({ children }: { children: React.ReactNode }) {
  const user = dbConfigured() ? await currentStaffUser() : null;
  // (a list that cannot be read is an empty one: the stars are an extra, the page is not)
  const favs = user && canUseAdmin(user) ? await listFavourites(query, user.id).catch(() => []) : [];
  // what the login has no right to is left out of the menus (each page refuses by itself as well)
  const off = user
    ? [
        ...(["clients", "staff", "services"] as const).filter((g) => !canGroup(user, g)),
        // «График работы» goes with the section «Сотрудники», «Записи» with its own right
        ...(canGroup(user, "staff") ? [] : ["schedule"]),
        ...(can(user, "reports.bookings") ? [] : ["records"]),
        ...(can(user, "visit.sell") && can(user, "visit.sell.create") ? [] : ["sale"]),
      ]
    : [];
  return (
    <FrameProvider favs={favs} off={off}>
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
      <Suspense fallback={null}>
        <Side where="row" />
      </Suspense>
      <Suspense fallback={<aside className="sb" />}>
        <Wide />
      </Suspense>
      <div className="adm-main">{children}</div>
      <SaveToast />
    </FrameProvider>
  );
}

async function Side({ where }: { where: "bar" | "row" }) {
  return <SideSwitch side="admin" where={where} words={(await getA()).side} />;
}

/** The sidebar from 900px, with this month's load. */
async function Wide() {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user || !canUseAdmin(user)) return null;
  const business = await currentBusiness();
  if (!business || business.id !== user.businessId) return null;
  const today = todayIn(business.timezone);
  return (
    <Sidebar
      user={{ name: user.name, email: user.email }}
      demo={dbKind() === "pglite"}
      today={today}
      load={await monthLoad(query, business, today.slice(0, 7)).catch(() => null)}
      report={testRun()}
      side={<Side where="bar" />}
    />
  );
}

/** A phone's corner: «Демо», «Доступ» and «Выйти». */
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
