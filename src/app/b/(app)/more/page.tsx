/** /b/more: the login, language, notifications (B5), install, log out. */
import Link from "next/link";
import { Suspense } from "react";
import { requireStaffUser } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { listDevices, pushConfigured, pushPublicKey } from "@/lib/push";
import { kindsFor, wants } from "@/lib/push-kinds";
import { getB } from "../../lang-server";
import { LangSwitch, LogoutButton } from "./controls";
import { PushPanel } from "./push-panel";

export default function MorePage() {
  return (
    <Suspense fallback={null}>
      <More />
    </Suspense>
  );
}

async function More() {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { user } = await requireStaffUser();
  const M = B.more;
  const [devices, [me]] = await Promise.all([listDevices(query, user.id), query<{ notify: Record<string, unknown> }>("select notify from users where id = $1", [user.id])]);
  const kinds = kindsFor(user.role, !!user.staffId).map((kind) => ({ kind, on: wants(me?.notify, kind) }));
  return (
    <main className="adm-page">
      <title>{`${M.title} · REMPIRE`}</title>
      <h1 className="adm-h1">{M.title}</h1>

      <section className="adm-card">
        <h2 className="adm-h2">{M.me}</h2>
        <p className="bx-strong">{user.name || user.email}</p>
        {user.name && <p className="adm-meta">{user.email}</p>}
        {user.role !== "staff" && (
          <div className="adm-btns-col">
            <Link href="/b/pick" className="adm-btn adm-btn-ghost" prefetch={false}>
              {B.pick.title}
            </Link>
            <a href="/admin" className="adm-btn adm-btn-ghost">
              {M.toAdmin}
            </a>
          </div>
        )}
      </section>

      <PushPanel configured={pushConfigured()} publicKey={pushPublicKey()} endpoints={devices.map((d) => d.endpoint)} kinds={kinds} owner={user.role !== "staff"} />

      <section className="adm-card">
        <h2 className="adm-h2">{M.language}</h2>
        <LangSwitch current={isLocale(user.locale) ? user.locale : "ru"} />
      </section>

      <section className="adm-card">
        <Link href="/b/install" className="adm-btn adm-btn-ghost" prefetch={false}>
          {M.install}
        </Link>
        <LogoutButton />
        <p className="adm-meta">{M.logoutHint}</p>
      </section>
    </main>
  );
}
