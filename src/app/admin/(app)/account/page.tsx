import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { listUsers } from "@/lib/auth/login";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { A } from "../../copy";
import { OutIcon } from "../../icons";
import { Fold } from "../fold";
import { logout } from "./actions";
import { AddUserForm, PasswordForm, ToggleUser } from "./forms";

export const metadata = { title: A.account.title };

export default function AccountPage() {
  return (
    <main className="adm-page adm-wide">
      <h1 className="adm-h1">{A.account.title}</h1>
      <Suspense fallback={<p className="adm-wait">{A.loading}</p>}>
        <Loaded />
      </Suspense>
    </main>
  );
}

/** Three cards: my login, everyone's logins, a new login. One under another on a phone, side by side on a wide screen. */
async function Loaded() {
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const owner = user.role === "owner";
  const [users, staff] = owner ? await Promise.all([listUsers(query, business.id), listStaff(query, business.id)]) : [[], []];
  const when = new Intl.DateTimeFormat("ru-RU", { timeZone: business.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <div className="adm-cards">
      <section className={`adm-card${owner ? "" : " adm-card-narrow"}`}>
        <h2 className="adm-card-h">{A.account.me}</h2>
        <div className="adm-who-row">
          <span>{user.email}</span>
          <span className="adm-tag lime">{A.account.roles[user.role]}</span>
        </div>
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
                      {A.account.roles[u.role]}
                      {u.staffId ? ` ${staff.find((s) => s.id === u.staffId)?.name ?? "?"}` : ""}
                      {u.id === user.id ? ` · ${A.account.you}` : ""}
                      {!u.hasPassword ? ` · ${A.account.noPassword}` : ""} · {u.lastLoginAt ? when.format(Date.parse(u.lastLoginAt)) : A.account.never}
                      {!u.active ? ` · ${A.account.disabled}` : ""}
                    </small>
                  </span>
                  {u.id !== user.id && <ToggleUser id={u.id} active={u.active} />}
                </li>
              ))}
            </ul>
          </section>
          <section className="adm-card">
            <h2 className="adm-card-h">{A.account.addUser}</h2>
            <AddUserForm staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} />
          </section>
        </>
      )}
    </div>
  );
}
