/** /b/more: the login, language, notifications (B5), install, log out. */
import Link from "next/link";
import { Suspense } from "react";
import { requireStaffUser } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { getB } from "../../lang-server";
import { LangSwitch, LogoutButton } from "./controls";

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
