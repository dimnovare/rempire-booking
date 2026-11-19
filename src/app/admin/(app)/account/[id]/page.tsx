/**
 * /admin/account/<login id>: one login's access rights («Доступ» → the
 * login; the owner, 19.11.2026). The screen is rights-view.tsx.
 *
 * Only for a login that itself holds «Управлять правами пользователей»
 * (src/lib/auth/rights.ts): anyone else gets the plain «no access» line,
 * and the actions refuse (account/actions.ts).
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { listUsers } from "@/lib/auth/login";
import { can } from "@/lib/auth/rights";
import { listRightsHistory, loadRights } from "@/lib/auth/rights-store";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { NoRights } from "../../no-rights";
import { RightsView } from "./rights-view";

export default function LoginRightsPage({ params }: PageProps<"/admin/account/[id]">) {
  return (
    <main className="adm-page adm-wide">
      <Suspense fallback={<Wait />}>
        <Loaded params={params} />
      </Suspense>
    </main>
  );
}

async function Loaded({ params }: Pick<PageProps<"/admin/account/[id]">, "params">) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  if (!can(user, "settings.users.rights")) return <NoRights />;
  const { id } = await params;
  const [rights, users, staff, history] = await Promise.all([
    loadRights(query, business.id, id),
    listUsers(query, business.id),
    listStaff(query, business.id),
    listRightsHistory(query, business.id, id),
  ]);
  const target = users.find((u) => u.id === id);
  if (!rights || !target) notFound();
  const barberOf = (staffId: string | null) => (staffId ? (staff.find((s) => s.id === staffId)?.name ?? null) : null);
  return (
    <>
      <Title text={A.rights.title} />
      <RightsView
        // a login's own form: another login starts from its own set
        key={target.id}
        target={{ id: target.id, email: target.email, name: target.name, you: target.id === user.id, barber: barberOf(target.staffId) }}
        initial={rights}
        logins={users
          .filter((u) => u.id !== target.id)
          .map((u) => ({ id: u.id, label: `${u.name || u.email}${barberOf(u.staffId) && u.role === "staff" ? ` (${barberOf(u.staffId)})` : ""} · ${A.account.roles[u.role]}` }))}
        // a barber who has left can still be named in a scope that was set before
        staff={staff.filter((s) => s.active || (Array.isArray(rights.values["journal.staff"]) && rights.values["journal.staff"].includes(s.id)) || (Array.isArray(rights.values["clients.show"]) && rights.values["clients.show"].includes(s.id))).map((s) => ({ id: s.id, name: s.name }))}
        history={history}
        owner={user.role === "owner"}
        mine={[...user.rights.on]}
        tz={business.timezone}
      />
    </>
  );
}
