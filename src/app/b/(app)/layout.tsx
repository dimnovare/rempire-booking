import Link from "next/link";
import { Suspense } from "react";
import { Logo, TowerMark } from "@/components/brand";
import { TestBanner } from "@/components/test-banner";
import { barOf } from "@/lib/admin/app-nav";
import { canGroup } from "@/lib/auth/rights";
import { countWaitingRequests } from "@/lib/barber/requests";
import { dbKind, query } from "@/lib/db";
import { COPY as ADMIN_COPY } from "../../admin/copy";
import { Ava } from "../../admin/icons";
import { barberFrame } from "../frame-server";
import { barberLang, getB } from "../lang-server";
import { InstallBanner } from "./install-banner";
import { BNav } from "./nav";
import { OwnBar } from "./own-bar";
import { WideOwn } from "./wide-own";

/**
 * The logged-in barber app: the barber's half of the one staff app
 * (docs/apps.md, «One app for Renat»). Each page checks the login itself
 * (requireStaff); who is logged in decides the bars around it
 * (../frame-server.ts):
 *
 *   - a barber: a thin bar on top (logo, his name) and his five sections at
 *     the bottom, as before;
 *   - an owner or the front desk looking at a barber's app (opened from
 *     «Барберы»): the barber's bars, and under the top one a line that says
 *     whose app this is and leads back to the salon;
 *   - an owner or the front desk on his own pages («Мой день», his time,
 *     his sums): the one app's frame, the same top bar and the same bottom
 *     bar as in the salon's half, so «Мой день» is a tab and not another
 *     app. On a wide screen these pages hand over to the salon's
 *     (wide-own.tsx).
 */
export default function BarberApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-app bx-app">
      <TestBanner app="b" report />
      <Suspense fallback={<header className="adm-top bx-top" />}>
        <Top />
      </Suspense>
      <InstallBanner />
      <div className="adm-main">{children}</div>
      <Suspense fallback={null}>
        <Bottom />
      </Suspense>
    </div>
  );
}

async function Top() {
  const [f, B] = await Promise.all([barberFrame(), getB()]);
  const demo = dbKind() === "pglite" ? <span className="adm-tag lime">{B.demo}</span> : null;
  // the one app's top bar: the mark and the name only, as in the salon's half
  if (f && (f.kind === "own" || f.kind === "salon")) {
    const brand = (
      <>
        <span className="one-mark">
          <TowerMark />
        </span>
        <span className="one-name">REMPIRE</span>
      </>
    );
    return (
      <header className="adm-top bx-top one-top">
        {f.kind === "own" ? (
          <Link href="/b" className="one-brand" aria-label="REMPIRE" prefetch={false}>
            {brand}
          </Link>
        ) : (
          <a href="/admin" className="one-brand" aria-label="REMPIRE">
            {brand}
          </a>
        )}
        {demo && <div className="adm-me">{demo}</div>}
      </header>
    );
  }
  return (
    <>
      <header className="adm-top bx-top">
        <Link href="/b" className="adm-brand" aria-label="REMPIRE" prefetch={false}>
          <Logo />
        </Link>
        <div className="adm-me bx-who">
          {demo}
          {/* the barber whose app this is */}
          {f?.staff && (
            <span className="bx-me">
              <Ava src={f.staff.photoUrl} name={f.staff.name} className="bx-ava" />
              <b>{f.staff.name}</b>
            </span>
          )}
        </div>
      </header>
      {f?.kind === "support" && f.staff && (
        // an owner or the front desk in a barber's app: whose it is, and the way back (a salon page ends it: src/proxy.ts)
        <a className="bx-as" href={canGroup(f.user, "staff") ? `/admin/staff/${f.staff.id}` : "/admin"}>
          <span>{B.pick.viewing(f.staff.name)}</span>
          <b>{B.pick.back}</b>
        </a>
      )}
    </>
  );
}

async function Bottom() {
  const f = await barberFrame();
  if (!f || f.kind === "barber" || f.kind === "support") return <BNav />;
  const A = ADMIN_COPY[await barberLang()];
  const waiting = await countWaitingRequests(query, f.user.businessId).catch(() => 0);
  return (
    <>
      <OwnBar label={A.sections} bar={barOf(f.user)} words={A.nav} waiting={waiting > 0 ? A.app.waiting(waiting) : null} />
      {f.kind === "own" && f.staff && (
        <WideOwn time={canGroup(f.user, "staff") ? `/admin/staff/${f.staff.id}` : "/admin"} money={`/admin/invoices/barber/${f.staff.id}`} />
      )}
    </>
  );
}
