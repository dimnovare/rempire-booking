/** /b/pick: Renat or the front desk choose whose day to see (a barber never gets here). */
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireStaffUser } from "@/lib/auth/current";
import { staffToPick } from "@/lib/barber/account";
import { dbConfigured, query } from "@/lib/db";
import { Ava } from "../../../admin/icons";
import { getB } from "../../lang-server";
import { viewAs } from "../actions";

export default function PickPage() {
  return (
    <Suspense fallback={null}>
      <Pick />
    </Suspense>
  );
}

async function Pick() {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { user, business } = await requireStaffUser();
  if (user.role === "staff") redirect("/b");
  // his own day first, if this login is a barber too
  const all = await staffToPick(query, business.id);
  const list = [...all.filter((s) => s.id === user.staffId), ...all.filter((s) => s.id !== user.staffId)];
  return (
    <main className="adm-page">
      <title>{`${B.pick.title} · REMPIRE`}</title>
      <div>
        <h1 className="adm-h1">{B.pick.title}</h1>
        <p className="adm-meta">{B.pick.lead}</p>
      </div>
      {list.length === 0 && <p className="adm-meta">{B.pick.none}</p>}
      <ul className="bx-list">
        {list.map((s) => (
          <li key={s.id}>
            <form action={viewAs.bind(null, s.id)}>
              <button className="bx-row">
                <Ava src={s.photoUrl} name={s.name} />
                <span className="bx-row-main">
                  <b>{s.name}</b>
                  {s.id === user.staffId && <small>{B.pick.mine}</small>}
                  {!s.active && <small>{B.pick.off}</small>}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
