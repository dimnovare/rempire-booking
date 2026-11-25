/**
 * /admin/settings/online «Онлайн-запись», a page of «Настройки» beside
 * «Бренд», «Контакты» and «Галерея» (Dim, round 15): how clients book
 * online, as the salon's Altegio sets it (docs/altegio-pages.md, Part 4 C
 * «Онлайн-запись»). The values are businesses.settings
 * (src/lib/admin/online-settings.ts); the form is online-view.tsx. Only a
 * login with the switch of the group «Онлайн-запись»; anyone else gets
 * NoRights.
 */
import { connection } from "next/server";
import { Suspense } from "react";
import { onlineMay, onlineOf } from "@/lib/admin/online-settings";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { testRun } from "@/lib/test-run";
import { Wait } from "../../../lang";
import { adminLang, getA } from "../../../lang-server";
import { NoRights } from "../../no-rights";
import { OnlineView } from "./online-view";

export default function OnlinePage() {
  return (
    <main className="adm-page adm-wide adm-loc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  // a login and the salon's settings as they are now: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  if (!onlineMay(user)) return <NoRights />;
  // the booking page in the admin's language: what a client sees once a change is saved;
  // the link clients get (and the plaque's QR code): the start, where each client's own language opens
  return <OnlineView initial={onlineOf(business.settings)} view={`/${await adminLang()}`} link={new URL("/", siteUrl()).href} test={testRun()} />;
}
