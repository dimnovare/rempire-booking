/**
 * /b/more: the login, language, notifications (B5), install, log out.
 *
 * For an owner or the front desk on his own (not looking at a barber's
 * app) it is «Уведомления», a row of the one app's «Ещё» (docs/apps.md,
 * «One app for Renat»): this device's notifications and the install guide
 * only. The language, the logins and the way out are rows of «Ещё» itself.
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireStaffUser } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { listDevices, pushConfigured, pushPublicKey } from "@/lib/push";
import { kindsFor, wants } from "@/lib/push-kinds";
import { barberFrame } from "../../frame-server";
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
  const [devices, [me], frame] = await Promise.all([listDevices(query, user.id), query<{ notify: Record<string, unknown> }>("select notify from users where id = $1", [user.id]), barberFrame()]);
  const kinds = kindsFor(user.role, !!user.staffId).map((kind) => ({ kind, on: wants(me?.notify, kind) }));
  const push = <PushPanel configured={pushConfigured()} publicKey={pushPublicKey()} endpoints={devices.map((d) => d.endpoint)} kinds={kinds} owner={user.role !== "staff"} />;
  const install = (
    <Link href="/b/install" className="adm-btn adm-btn-ghost" prefetch={false}>
      {M.install}
    </Link>
  );

  // the one app: only what belongs to this device
  if (frame?.kind === "own" || frame?.kind === "salon")
    return (
      <main className="adm-page">
        <title>{`${B.push.title} · REMPIRE`}</title>
        <h1 className="adm-h1">{B.push.title}</h1>
        {push}
        <section className="adm-card">{install}</section>
      </main>
    );

  return (
    <main className="adm-page">
      <title>{`${M.title} · REMPIRE`}</title>
      <h1 className="adm-h1">{M.title}</h1>

      <section className="adm-card">
        <h2 className="adm-h2">{M.me}</h2>
        <p className="bx-strong">{user.name || user.email}</p>
        {user.name && <p className="adm-meta">{user.email}</p>}
        {/* an owner or the front desk in a barber's app: the way back to the salon */}
        {user.role !== "staff" && (
          <div className="adm-btns-col">
            <a href="/admin" className="adm-btn adm-btn-ghost">
              {M.toAdmin}
            </a>
          </div>
        )}
      </section>

      {/* Phase C: his sales, 17 %, rent and invoices */}
      <section className="adm-card">
        <Link href="/b/money" className="adm-btn adm-btn-line" prefetch={false}>
          {B.money.title}
        </Link>
        <p className="adm-meta">{B.money.lead}</p>
      </section>

      {push}

      <section className="adm-card">
        <h2 className="adm-h2">{M.language}</h2>
        <LangSwitch current={isLocale(user.locale) ? user.locale : "ru"} />
      </section>

      <section className="adm-card">
        {install}
        <LogoutButton />
        <p className="adm-meta">{M.logoutHint}</p>
      </section>
    </main>
  );
}
