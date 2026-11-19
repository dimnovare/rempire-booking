import Link from "next/link";
import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { listUsers } from "@/lib/auth/login";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { PRESETS, isRoleCode } from "@/lib/auth/rights-catalogue";
import { backfillRights } from "@/lib/auth/rights-store";
import { dbConfigured, query } from "@/lib/db";
import { OutIcon } from "../../icons";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { Fold } from "../fold";
import { Titled } from "../star";
import { logout } from "./actions";
import { AddUserForm, LinkStaff, MyLang, PasswordForm, ToggleUser } from "./forms";

export default function AccountPage() {
  return (
    <main className="adm-page adm-wide">
      {/* the language needs the request, so the heading waits with the rest */}
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

/**
 * Three cards: my login, everyone's logins, a new login. One under another
 * on a phone, side by side on a wide screen. The logins are for a login
 * with «Управлять пользователями» (src/lib/auth/rights.ts): a new one
 * needs the right to invite, switching one off the right to remove, and
 * «Права» (a login's own page, [id]/) the right to manage rights.
 */
async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const owner = can(user, "settings.users");
  const mayInvite = can(user, "settings.users.invite");
  const mayRemove = can(user, "settings.users.remove");
  const mayRights = can(user, "settings.users.rights");
  // every login has its set before the list names its role (a login from before the rights gets it now)
  if (owner) await backfillRights(query, business.id);
  const [users, staff, presets] = owner
    ? await Promise.all([listUsers(query, business.id), listStaff(query, business.id), query<{ id: string; rights_preset: string | null }>("select id, rights_preset from users where business_id = $1", [business.id])])
    : [[], [], []];
  const roleOf = (id: string, role: string) => {
    const p = presets.find((x) => x.id === id)?.rights_preset;
    // a barber's login reads «Барбер», as before; the other roles by their preset's name
    return role !== "staff" && isRoleCode(p) ? PRESETS[p][A.lang] : A.account.roles[role];
  };
  // the barbers a login can be: the working ones, and the one it already is
  const linkable = (staffId: string | null) => staff.filter((s) => s.active || s.id === staffId).map((s) => ({ id: s.id, name: s.name }));
  const when = new Intl.DateTimeFormat(A.intl, { timeZone: business.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <>
      <Titled page="account">
        <h1 className="adm-h1">{A.account.title}</h1>
      </Titled>
      <div className="adm-cards">
        <section className={`adm-card${owner ? "" : " adm-card-narrow"}`}>
          <h2 className="adm-card-h">{A.account.me}</h2>
          <div className="adm-who-row">
            <span>{user.email}</span>
            <span className="adm-tag lime">{isRoleCode(user.rights.preset) && user.role !== "staff" ? PRESETS[user.rights.preset][A.lang] : A.account.roles[user.role]}</span>
          </div>
          {/* each login has its own language; the names are in their own language so anyone finds theirs */}
          <div className="adm-field">
            <span>{A.langLabel}</span>
            <MyLang />
          </div>
          {/* this device's notifications live in the barber app's half (/b/more); a phone has the row on «Ещё», a wide screen this link */}
          <a className="adm-btn adm-btn-ghost only-wide" href="/b/more">
            {A.more.notify}: {A.more.notifyHint}
          </a>
          <form action={logout}>
            <button className="adm-btn adm-btn-ghost">
              <OutIcon size={18} />
              {A.account.logoutHere}
            </button>
          </form>
          <Fold title={user.hasPassword ? A.account.changePassword : A.account.setPassword}>
            <PasswordForm hasPassword={user.hasPassword} />
          </Fold>
        </section>
        {owner && (
          <>
            <section className="adm-card">
              <h2 className="adm-card-h">{A.account.users}</h2>
              <ul className="adm-mini adm-users">
                {users.map((u) => (
                  <li key={u.id} className={u.active ? undefined : "is-off"}>
                    <span className="tx">
                      <span>{u.email}</span>
                      <small>
                        {roleOf(u.id, u.role)}
                        {u.role === "staff" && u.staffId ? ` ${staff.find((s) => s.id === u.staffId)?.name ?? "?"}` : ""}
                        {u.id === user.id ? ` · ${A.account.you}` : ""}
                        {!u.hasPassword ? ` · ${A.account.noPassword}` : ""} · {u.lastLoginAt ? when.format(Date.parse(u.lastLoginAt)) : A.account.never}
                        {!u.active ? ` · ${A.account.disabled}` : ""}
                      </small>
                      {/* Renat cuts too: his login is linked to his barber, so the app opens on his own day */}
                      {u.role !== "staff" && u.active && <LinkStaff key={u.staffId ?? ""} id={u.id} email={u.email} staffId={u.staffId} staff={linkable(u.staffId)} />}
                    </span>
                    <span className="adm-user-acts">
                      {/* the login's own page: its rights */}
                      {mayRights && (
                        <Link className="adm-txt lime" href={`/admin/account/${u.id}`} prefetch={false} aria-label={`${A.rights.open}: ${u.email}`}>
                          {A.rights.open}
                        </Link>
                      )}
                      {u.id !== user.id && mayRemove && <ToggleUser id={u.id} active={u.active} />}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {mayInvite && (
              <section className="adm-card">
                <h2 className="adm-card-h">{A.account.addUser}</h2>
                <AddUserForm staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} />
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
