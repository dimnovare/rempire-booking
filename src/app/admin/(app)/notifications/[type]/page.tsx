/**
 * /admin/notifications/<type>: one message's page (board
 * «Notification-Type»): its switch, each channel with when it goes, the
 * reminder's «SMS, push or both», the SMS text with its variables, and a
 * preview of the SMS, the letter and the push as the client or the barber
 * gets them, from a made-up visit. «Сохранить» saves it all at once.
 */
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadNotify, loadSample, notifyMay, previews, typeDetail } from "@/lib/admin/notification-store";
import { isTypeKey } from "@/lib/admin/notifications";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { NoRights } from "../../no-rights";
import { TypeView } from "./type-view";

export default function NotificationTypePage({ params }: PageProps<"/admin/notifications/[type]">) {
  return (
    <main className="adm-page adm-wide ntf-page">
      <Suspense fallback={<Wait />}>
        <Loaded params={params} />
      </Suspense>
    </main>
  );
}

async function Loaded({ params }: { params: PageProps<"/admin/notifications/[type]">["params"] }) {
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const { type } = await params;
  if (!isTypeKey(type)) notFound();
  const may = notifyMay(user);
  if (!may.open) return <NoRights />;
  const ns = await loadNotify(query, business.id);
  const origin = siteUrl().origin;
  const sample = await loadSample(query, business, origin);
  return (
    <>
      <Title text={A.notif.types[type]} />
      <TypeView detail={typeDetail(ns, may, type)} sample={sample} previews={previews(type, sample, business, origin)} />
    </>
  );
}
