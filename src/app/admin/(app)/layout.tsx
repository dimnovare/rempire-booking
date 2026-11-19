import { Suspense } from "react";
import { TowerMark } from "@/components/brand";
import { TestBanner } from "@/components/test-banner";
import { barOf, offFor } from "@/lib/admin/app-nav";
import { listFavourites } from "@/lib/admin/favourites";
import { monthLoad } from "@/lib/admin/month-load";
import { currentStaffUser } from "@/lib/auth/current";
import { canUseAdmin } from "@/lib/auth/sessions";
import { countWaitingRequests } from "@/lib/barber/requests";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { testRun } from "@/lib/test-run";
import { todayIn } from "@/lib/tz";
import { getA } from "../lang-server";
import { SaveToast } from "./autosave";
import { FrameProvider } from "./frame";
import { Nav, NavLinks } from "./nav";
import { Sidebar } from "./sidebar";
import { whoAmI } from "./who";

/**
 * The logged-in admin: the salon's half of the one staff app (docs/apps.md,
 * «One app for Renat»). On a phone: one thin bar on top with the mark and
 * the name, and the login's tabs in a bar at the bottom, four of them and
 * «Ещё» (nav.tsx, src/components/app-bar.tsx). «Доступ» and «Выйти» are
 * rows of «Ещё». From 900px the top bar is gone and the sidebar on the left
 * holds everything (sidebar.tsx, admin.css): the month, the tiles and
 * «Избранное», or the menu of every section. Each page checks the login
 * itself.
 *
 * For a login linked to a barber the first tab is «Мой день», his own day
 * in the barber app's half (/b), which wears this same frame
 * (src/app/b/(app)/layout.tsx).
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
  const admin = !!user && canUseAdmin(user);
  // (a list that cannot be read is an empty one: the stars are an extra, the page is not; the dot likewise)
  const [favs, waiting] = admin ? await Promise.all([listFavourites(query, user.id).catch(() => []), countWaitingRequests(query, user.businessId).catch(() => 0)]) : [[], 0];
  return (
    // what the login has no right to is left out of the menus (each page refuses by itself as well)
    <FrameProvider favs={favs} off={user ? offFor(user) : []} bar={admin ? barOf(user) : undefined} waiting={waiting}>
      <header className="adm-top one-top">
        <a href="/admin" className="one-brand" aria-label="REMPIRE">
          <span className="one-mark">
            <TowerMark />
          </span>
          <span className="one-name">REMPIRE</span>
        </a>
        <Suspense fallback={null}>
          <Demo />
        </Suspense>
        <Suspense fallback={<NavLinks path="" />}>
          <Nav />
        </Suspense>
      </header>
      <Suspense fallback={<aside className="sb" />}>
        <Wide />
      </Suspense>
      <div className="adm-main">{children}</div>
      <SaveToast />
    </FrameProvider>
  );
}

/** The sidebar from 900px, with this month's load. */
async function Wide() {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user || !canUseAdmin(user)) return null;
  const business = await currentBusiness();
  if (!business || business.id !== user.businessId) return null;
  const today = todayIn(business.timezone);
  const [who, load] = await Promise.all([whoAmI(await getA(), user), monthLoad(query, business, today.slice(0, 7)).catch(() => null)]);
  return <Sidebar user={who} demo={dbKind() === "pglite"} today={today} load={load} report={testRun()} />;
}

/** A phone's corner: «Демо», on a local demo only. */
async function Demo() {
  if (!dbConfigured() || dbKind() !== "pglite") return null;
  const A = await getA();
  return (
    <div className="adm-me">
      <span className="adm-tag lime" title={A.demo}>
        {A.demoTag}
      </span>
    </div>
  );
}
