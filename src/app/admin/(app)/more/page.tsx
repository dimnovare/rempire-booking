/**
 * /admin/more «Ещё»: the fifth tab of a phone's bottom bar. The sections
 * that have no tab of their own (sections.tsx, `bar: false`), as large rows.
 * A wide screen has every section in the sidebar and no link to this page.
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { NextIcon } from "../../icons";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { SECTIONS, SectionIcon } from "../sections";

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
  await requireAdmin();
  return (
    <>
      <h1 className="adm-h1">{A.more.title}</h1>
      <ul className="adm-list">
        {SECTIONS.filter((s) => !s.bar).map((s) => (
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
      </ul>
    </>
  );
}
