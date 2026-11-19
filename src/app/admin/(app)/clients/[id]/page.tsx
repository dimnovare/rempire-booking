/**
 * /admin/clients/<id>: one client. His numbers, his fields, his categories
 * and the shared note (card.tsx; each part saves by itself), then every
 * visit he has had or has ahead, with any barber. A visit opens its day in
 * the calendar (/admin?d=…).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientDetail, clientLabels, LABEL_MAX, LABELS_MAX, NOTE_MAX, VISITS_MAX } from "@/lib/admin/clients";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { localParts } from "@/lib/tz";
import { eur } from "../../../copy";
import { NextIcon, PrevIcon } from "../../../icons";
import { Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { ClientCard } from "./card";

export default function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  return (
    <main className="adm-page adm-wide adm-cl">
      <Suspense fallback={<Wait />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/clients/[id]">["params"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const { id } = await params;
  const [d, used] = await Promise.all([clientDetail(query, business, id), clientLabels(query, business.id)]);
  if (!d) notFound();
  const C = A.clients;
  const tz = business.timezone;
  const day = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
  const weekday = new Intl.DateTimeFormat(A.intl, { timeZone: tz, weekday: "short" });
  const time = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const date = (at: number | null) => (at == null ? "—" : day.format(at));

  return (
    <>
      <Link className="adm-back" href="/admin/clients">
        <PrevIcon />
        {C.title}
      </Link>
      <div className="cl-hero">
        <h1 className="adm-h1">{d.name}</h1>
        <p className="adm-meta">
          {C.since(day.format(d.createdAt))} · {A.visit.source[d.source] ?? d.source}
        </p>
        {d.phone && (
          <a className="adm-phone" href={`tel:${d.phone}`}>
            {d.phone} · {A.visit.call}
          </a>
        )}
      </div>
      <dl className="cl-stats">
        <div>
          <dt>{C.cols.visits}</dt>
          <dd>{d.visits}</dd>
        </div>
        <div>
          <dt>{C.cols.sold}</dt>
          <dd>{eur(d.soldCents)}</dd>
        </div>
        <div>
          <dt>{C.cols.last}</dt>
          <dd>{date(d.lastVisit)}</dd>
        </div>
        <div>
          <dt>{C.cols.first}</dt>
          <dd>{date(d.firstVisit)}</dd>
        </div>
      </dl>

      {/* a card per client: its fields start from this client */}
      <ClientCard
        key={d.id}
        id={d.id}
        initial={{ name: d.name, phone: d.phone ?? "", email: d.email ?? "", locale: d.locale, sms: !d.smsOptOut, mail: !d.emailOptOut, labels: d.labels, note: d.note }}
        used={used}
        limits={{ note: NOTE_MAX, label: LABEL_MAX, labels: LABELS_MAX }}
      />

      <section className="adm-section" aria-label={C.history}>
        <h2 className="adm-card-h">{C.history}</h2>
        {d.history.length === 0 ? (
          <p className="adm-meta">{C.noHistory}</p>
        ) : (
          <ul className="cl-visits">
            {d.history.map((v) => (
              <li key={v.id}>
                <Link className={`cl-visit st-${v.status}`} href={`/admin?d=${localParts(v.start, tz).date}`} title={C.inCalendar} prefetch={false}>
                  <span className="txt">
                    <b>
                      {weekday.format(v.start)}, {day.format(v.start)}, {time.format(v.start)}
                    </b>
                    <small>{[v.staffName, ...v.services.map((s) => A.pick(s))].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="end">
                    <span className={`adm-tag cl-st st-${v.status}`}>{A.visit.status[v.status] ?? v.status}</span>
                    <b>{eur(v.totalCents)}</b>
                  </span>
                  <span className="adm-chev">
                    <NextIcon />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {d.history.length >= VISITS_MAX && <p className="adm-meta">{C.capped(VISITS_MAX)}</p>}
      </section>
    </>
  );
}
