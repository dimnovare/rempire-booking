import Link from "next/link";
import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { A } from "../../copy";

export const metadata = { title: A.staff.title };

export default function StaffPage() {
  return (
    <main className="adm-page">
      <div className="adm-page-head">
        <h1 className="adm-h1">{A.staff.title}</h1>
        <Link className="adm-btn adm-btn-line adm-btn-sm" href="/admin/staff/new">
          + {A.add}
        </Link>
      </div>
      <Suspense fallback={<p className="adm-wait">{A.loading}</p>}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const staff = await listStaff(query, business.id);
  return (
    <ul className="adm-list">
      {staff.map((s) => (
        <li key={s.id}>
          <Link className={`adm-item${s.active ? "" : " is-off"}`} href={`/admin/staff/${s.id}`}>
            <span className="ava">{s.photoUrl ? <img src={s.photoUrl} alt="" /> : s.name.charAt(0)}</span>
            <span className="txt">
              <b>
                {s.name}
                {!s.active ? <span className="adm-tag">{A.staff.off}</span> : !s.bookable ? <span className="adm-tag">{A.staff.hidden}</span> : null}
              </b>
              <small>{A.staff.servicesN(s.services)}</small>
            </span>
            <span className="end">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
