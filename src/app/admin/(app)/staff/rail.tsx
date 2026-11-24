"use client";

/**
 * The barbers, each with today at a glance. On a phone this list is the
 * «Барберы» page and a tap opens the barber. From 900px the page itself
 * (/admin/staff) is the table of the admin we follow (table.tsx: «График
 * до», the switch «Онлайн-запись», the number of services); on a barber's
 * page the list stays on the left, so picking another barber is one click
 * and the page never changes under you.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useA } from "../../lang";
import { Ava, NextIcon, PlusIcon } from "../../icons";
import { Titled } from "../star";
import { StaffTable } from "./table";
import "./staff.css";

export type RailItem = {
  id: string;
  name: string;
  photoUrl: string | null;
  active: boolean;
  line: string;
  services: number;
  hidden: boolean;
  /** his role in the login's language */
  role: string;
  bookable: boolean;
  /** «График до», "YYYY-MM-DD" or null */
  scheduleUntil: string | null;
};

export function StaffRail({ items, today, mayEdit }: { items: RailItem[]; today: string; mayEdit: boolean }) {
  const A = useA();
  const path = usePathname();
  const index = path === "/admin/staff";
  const current = path.split("/")[3];
  const H = index ? "h1" : "h2";
  return (
    <aside className={`adm-rail${index ? " is-index" : ""}`} aria-label={A.staff.title}>
      <div className="adm-page-head">
        <Titled page="staff">
          <H className="adm-h1">{A.staff.title}</H>
        </Titled>
        <Link className="adm-btn adm-btn-line adm-btn-sm" href="/admin/staff/new">
          <PlusIcon size={14} />
          {A.visit.barber}
        </Link>
      </div>
      {/* the index from 900px is the table; a phone and a barber's page keep the list */}
      <ul className={`adm-list${index ? " only-narrow" : ""}`}>
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
      {index && <StaffTable items={items} today={today} mayEdit={mayEdit} />}
    </aside>
  );
}
