import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { SideSwitch } from "@/components/side-switch";
import { TestBanner } from "@/components/test-banner";
import { barberAppStaffId, currentStaffUser } from "@/lib/auth/current";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { Ava } from "../../admin/icons";
import { getB } from "../lang-server";
import { InstallBanner } from "./install-banner";
import { BNav } from "./nav";

/**
 * The logged-in barber app: a thin bar on top (logo, whose day it is), the
 * four sections at the bottom, as in the admin on a phone. Each page checks
 * the login itself (requireStaff).
 *
 * It is the «Мой день» side of the staff app (docs/apps.md). Renat and the
 * front desk get the side switch here too, in the same place as in the
 * admin; a barber never sees it.
 */
export default function BarberApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-app bx-app">
      <TestBanner app="b" report />
      <header className="adm-top bx-top">
        <Link href="/b" className="adm-brand" aria-label="REMPIRE" prefetch={false}>
          <Logo />
        </Link>
        <Suspense fallback={null}>
          <Side where="bar" />
        </Suspense>
        <Suspense fallback={null}>
          <Who />
        </Suspense>
      </header>
      <Suspense fallback={null}>
        <Side where="row" />
      </Suspense>
      <InstallBanner />
      <div className="adm-main">{children}</div>
      <BNav />
    </div>
  );
}

async function Side({ where }: { where: "bar" | "row" }) {
  return <SideSwitch side="b" where={where} words={(await getB()).side} />;
}

/**
 * The barber whose day this is. For Renat and the front desk it is a way to
 * change it: his own name on his own day, «Смотрю: …» on another barber's.
 */
async function Who() {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user) return null;
  const B = await getB();
  const id = await barberAppStaffId(user);
  const [s] = id ? await query<{ id: string; display_name: string; photo_url: string | null }>("select id, display_name, photo_url from staff where id = $1 and business_id = $2", [id, user.businessId]) : [];
  return (
    <div className="adm-me bx-who">
      {dbKind() === "pglite" && <span className="adm-tag lime">{B.demo}</span>}
      {user.role === "staff" ? (
        s && (
          <span className="bx-me">
            <Ava src={s.photo_url} name={s.display_name} className="bx-ava" />
            <b>{s.display_name}</b>
          </span>
        )
      ) : (
        <Link href="/b/pick" className="bx-me bx-viewing" prefetch={false}>
          {s ? (
            <>
              <Ava src={s.photo_url} name={s.display_name} className="bx-ava" />
              <span>{s.id === user.staffId ? s.display_name : B.pick.viewing(s.display_name)}</span>
            </>
          ) : (
            <span>{B.pick.title}</span>
          )}
        </Link>
      )}
    </div>
  );
}
