/**
 * /admin/more «Ещё»: the fifth tab of a phone's bottom bar. The sections
 * that have no tab of their own (sections.tsx, `bar: false`), as large rows,
 * and «Продажа товара», which a wide screen has as a tile of its sidebar.
 * A wide screen has every section in the sidebar and no link to this page.
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { dbConfigured } from "@/lib/db";
import { NextIcon } from "../../icons";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { SECTIONS, SectionIcon } from "../sections";
import { SaleRow } from "./sale-row";

export default function MorePage() {
  return (
    <main className="adm-page adm-more">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user } = await requireAdmin();
  // a section the login has no right to is not listed
  const shown = (key: string) =>
    key === "clients" || key === "staff" || key === "services" ? canGroup(user, key) : key === "schedule" ? canGroup(user, "staff") : key === "records" ? can(user, "reports.bookings") : true;
  return (
    <>
      <h1 className="adm-h1">{A.more.title}</h1>
      <ul className="adm-list">
        {SECTIONS.filter((s) => !s.bar && shown(s.key)).map((s) => (
          <li key={s.href}>
            <Link className="adm-item" href={s.href} prefetch={false}>
              <span className="adm-more-ico">
                <SectionIcon name={s.icon} />
              </span>
              <span className="txt">
                <b>{A.nav[s.key]}</b>
              </span>
              <span className="adm-chev">
                <NextIcon />
              </span>
            </Link>
          </li>
        ))}
        {can(user, "visit.sell") && can(user, "visit.sell.create") && (
          <li>
            <SaleRow />
          </li>
        )}
      </ul>
    </>
  );
}
