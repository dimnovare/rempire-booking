/**
 * /admin/clients/<id>: one client's card (the owner, 19.11.2026: every
 * field and seven tabs of the tool we follow; docs/reference-looks.md,
 * «Клиенты»). From 900px it is a 900px drawer over the list, which the
 * layout keeps behind it; on a phone it is the page.
 *
 * /admin/clients/<id>?tab=history   a tab has its own address (read by drawer.tsx)
 *
 * Everything the seven tabs show comes with the page, read at once; an
 * action that changes something asks for the page again (drawer.tsx).
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientReach, clientStats, defaultStatsPeriod, FILE_EXTS, FILE_MAX_BYTES, FILES_MAX, listComments, listFiles, listMessages, COMMENT_MAX, MESSAGE_MAX } from "@/lib/admin/client-card";
import { CARD_NO_MAX, clientDetail, clientLabels, LABEL_MAX, LABELS_MAX, NOTE_MAX, VISITS_MAX } from "@/lib/admin/clients";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { smsTransport } from "@/lib/sms";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { cardFieldsOf, notifyFieldsOf } from "../card-fields";
import { ClientDrawer } from "./drawer";

export default function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  return (
    <Suspense
      fallback={
        <section className="cc cc-wait" aria-busy="true">
          <Wait />
        </section>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/clients/[id]">, "params">) {
  if (!dbConfigured()) return <p className="adm-wait">{(await getA()).noDb}</p>;
  const { user, business } = await requireAdmin();
  const { id } = await params;
  const now = Date.now();
  const tz = business.timezone;
  const [d, used, comments, files, messages, reach, stats] = await Promise.all([
    clientDetail(query, business, id, now),
    clientLabels(query, business.id),
    listComments(query, business.id, id),
    listFiles(query, business.id, id),
    listMessages(query, business.id, id),
    clientReach(query, business, id, now),
    clientStats(query, business, id, defaultStatsPeriod(tz, now), now),
  ]);
  if (!d || !reach || !stats) notFound();

  return (
    <ClientDrawer
      // a card per client: its forms start from this client
      key={d.id}
      id={d.id}
      name={d.name}
      tz={tz}
      today={todayIn(tz, now)}
      card={cardFieldsOf(d)}
      used={used}
      limits={{ note: NOTE_MAX, label: LABEL_MAX, labels: LABELS_MAX, cardNo: CARD_NO_MAX, comment: COMMENT_MAX, message: MESSAGE_MAX }}
      photoV={d.photoV}
      comments={comments}
      // anyone's comment, by Renat and the front desk (src/lib/admin/client-card.ts)
      canDeleteComments={user.role === "owner" || user.role === "admin"}
      numbers={{ soldCents: d.soldCents, soldVisits: d.soldVisits, firstVisit: d.firstVisit, lastVisit: d.lastVisit }}
      history={d.history}
      capped={d.history.length >= VISITS_MAX ? VISITS_MAX : 0}
      stats={stats}
      messages={messages}
      reach={reach}
      // no provider yet in production: an SMS waits in the queue (src/lib/sms.ts)
      smsReady={smsTransport() !== "disabled"}
      notify={notifyFieldsOf(d)}
      files={files}
      fileRules={{ exts: [...FILE_EXTS], maxBytes: FILE_MAX_BYTES, max: FILES_MAX }}
    />
  );
}
