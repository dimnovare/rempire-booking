/**
 * /admin/plaque: the QR plaque for the reception (Renat, Q&A page, 18.11.2026:
 * «Да, одна на салон», «ресепшн»). A sheet to print, A4, A5 or A6: the
 * salon's mark, «book online» in the three languages, the QR code of the
 * booking link and the link written out. Opened from «Настройки →
 * Онлайн-запись»; outside the admin's frame, so only the sheet prints.
 *
 * The code is drawn here, on the server, as one SVG path (src/lib/qr.ts). It
 * holds the client start page of SITE_URL, so it is printed once the
 * booking lives on rempire.ee; on staging the page says so, and the sheet
 * carries «do not print».
 */
import { connection } from "next/server";
import { Suspense } from "react";
import { onlineMay } from "@/lib/admin/online-settings";
import { requireAdmin } from "@/lib/auth/current";
import { qrOf } from "@/lib/qr";
import { siteUrl } from "@/lib/site";
import { testRun } from "@/lib/test-run";
import { NoRights } from "../(app)/no-rights";
import { Wait } from "../lang";
import { getA } from "../lang-server";
import { PlaqueView } from "./plaque-view";
import "./plaque.css";

export default function PlaquePage() {
  return (
    <Suspense fallback={<Wait />}>
      <Loaded />
    </Suspense>
  );
}

async function Loaded() {
  await connection();
  const A = await getA();
  const { user } = await requireAdmin();
  if (!onlineMay(user)) {
    return (
      <main className="adm-page">
        <NoRights />
      </main>
    );
  }
  const url = new URL("/", siteUrl());
  const qr = qrOf(url.href);
  return <PlaqueView link={url.href} host={url.host} size={qr.size} d={qr.d} test={testRun()} title={A.plaque.title} />;
}
