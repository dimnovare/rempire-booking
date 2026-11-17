"use client";

/**
 * The barbers, each with today at a glance. On a phone this list is the
 * «Барберы» page and a tap opens the barber. From 900px it stays on the
 * left on every barber page, so picking another barber is one click and
 * the page never changes under you.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { A } from "../../copy";
import { Ava, NextIcon, PlusIcon } from "../../icons";

export type RailItem = { id: string; name: string; photoUrl: string | null; active: boolean; line: string; services: number; hidden: boolean };

export function StaffRail({ items }: { items: RailItem[] }) {
  const path = usePathname();
  const index = path === "/admin/staff";
  const current = path.split("/")[3];
  const H = index ? "h1" : "h2";
  return (
    <aside className={`adm-rail${index ? " is-index" : ""}`} aria-label={A.staff.title}>
      <div className="adm-page-head">
        <H className="adm-h1">{A.staff.title}</H>
        <Link className="adm-btn adm-btn-line adm-btn-sm" href="/admin/staff/new">
          <PlusIcon size={14} />
          {A.visit.barber}
        </Link>
      </div>
      <ul className="adm-list">
        {items.map((s) => (
          <li key={s.id}>
            <Link className={`adm-item${s.active ? "" : " is-off"}`} href={`/admin/staff/${s.id}`} aria-current={s.id === current ? "page" : undefined}>
              <Ava src={s.photoUrl} name={s.name} />
              <span className="txt">
                <b>{s.name}</b>
                <small>{s.line}</small>
                <span className="tags">
                  <span className="adm-tag">{A.staff.servicesN(s.services)}</span>
                  {s.hidden && <span className="adm-tag warn">{A.staff.hidden}</span>}
                </span>
              </span>
              <span className="adm-chev">
                <NextIcon />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
