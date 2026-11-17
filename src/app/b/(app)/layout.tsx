import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { VIEW_AS_COOKIE } from "@/lib/auth/cookie";
import { currentStaffUser } from "@/lib/auth/current";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { Ava } from "../../admin/icons";
import { getB } from "../lang-server";
import { InstallBanner } from "./install-banner";
import { BNav } from "./nav";

/**
 * The logged-in barber app: a thin bar on top (logo, whose day it is), the
 * four sections at the bottom, as in the admin on a phone. Each page checks
 * the login itself (requireStaff).
 */
export default function BarberApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-app bx-app">
      <header className="adm-top bx-top">
        <Link href="/b" className="adm-brand" aria-label="REMPIRE" prefetch={false}>
          <Logo />
        </Link>
        <Suspense fallback={null}>
          <Who />
        </Suspense>
      </header>
      <InstallBanner />
      <div className="adm-main">{children}</div>
      <BNav />
    </div>
  );
}

/** The barber whose day this is; for Renat, «Смотрю: …» and a way to change it. */
async function Who() {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user) return null;
  const B = await getB();
  const id = user.role === "staff" ? user.staffId : ((await cookies()).get(VIEW_AS_COOKIE)?.value ?? null);
  const [s] = id && /^[0-9a-f-]{36}$/i.test(id) ? await query<{ display_name: string; photo_url: string | null }>("select display_name, photo_url from staff where id = $1 and business_id = $2", [id, user.businessId]) : [];
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
              <span>{B.pick.viewing(s.display_name)}</span>
            </>
          ) : (
            <span>{B.pick.title}</span>
          )}
        </Link>
      )}
    </div>
  );
}
