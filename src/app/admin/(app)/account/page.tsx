import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { listUsers } from "@/lib/auth/login";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { A } from "../../copy";
import { logout } from "./actions";
import { AddUserForm, PasswordForm, ToggleUser } from "./forms";

export const metadata = { title: A.account.title };

export default function AccountPage() {
  return (
    <main className="adm-page">
      <h1 className="adm-h1">{A.account.title}</h1>
      <Suspense fallback={<p className="adm-wait">{A.loading}</p>}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const owner = user.role === "owner";
  const [users, staff] = owner ? await Promise.all([listUsers(query, business.id), listStaff(query, business.id)]) : [[], []];
  const when = new Intl.DateTimeFormat("ru-RU", { timeZone: business.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <>
      <section className="adm-section">
        <h2 className="adm-h2">{A.account.me}</h2>
        <p>
          {user.email} · {A.account.roles[user.role]}
        </p>
        <PasswordForm hasPassword={user.hasPassword} />
        <form action={logout} style={{ marginTop: 14 }}>
          <button className="adm-btn adm-btn-ghost">{A.account.logout}</button>
        </form>
      </section>
      {owner && (
        <section className="adm-section">
          <h2 className="adm-h2">{A.account.users}</h2>
          <ul className="adm-mini">
            {users.map((u) => (
              <li key={u.id}>
                <span>
                  {u.email}
                  <small>
                    {" "}
                    · {A.account.roles[u.role]}
                    {u.staffId ? ` (${staff.find((s) => s.id === u.staffId)?.name ?? "?"})` : ""}
                    {!u.hasPassword ? ` · ${A.account.noPassword}` : ""} · {u.lastLoginAt ? when.format(Date.parse(u.lastLoginAt)) : A.account.never}
                    {!u.active ? ` · ${A.account.disabled}` : ""}
                  </small>
                </span>
                {u.id !== user.id && <ToggleUser id={u.id} active={u.active} />}
              </li>
            ))}
          </ul>
          <AddUserForm staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} />
        </section>
      )}
    </>
  );
}
