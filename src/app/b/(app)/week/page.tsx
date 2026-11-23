/**
 * /b/week: the barber's week (B2), Monday to Sunday: each day's hours, its
 * visits in one line each, the day's and the week's money. A day opens
 * in «День». No tab of its own: «День | Неделя» on the day and here.
 * /b/week?d=2026-11-17   the week of that day
 */
import Link from "next/link";
import { Suspense } from "react";
import { weekStart } from "@/lib/admin/grid";
import { requireStaff } from "@/lib/auth/current";
import { barberDaysFor, barberMay, loadBarberDays } from "@/lib/barber/day";
import { COUNTED, coversDay, hoursText } from "@/lib/barber/gaps";
import { dbConfigured, query } from "@/lib/db";
import { addDays, isLocalDate, todayIn } from "@/lib/tz";
import { NextIcon, PrevIcon } from "../../../admin/icons";
import { cap, dateWords, eur, hm, pick3 } from "../../copy.shared";
import { Wait } from "../../lang";
import { getB } from "../../lang-server";
import { NoRights } from "../may";
import { OwnSeg } from "../own-head";
import { Title } from "../title";

export default function WeekPage({ searchParams }: PageProps<"/b/week">) {
  return (
    <Suspense fallback={<Wait />}>
      <Week searchParams={searchParams} />
    </Suspense>
  );
}

async function Week({ searchParams }: { searchParams: PageProps<"/b/week">["searchParams"] }) {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { user, business, staff } = await requireStaff();
  const sp = await searchParams;
  const tz = business.timezone;
  const today = todayIn(tz);
  const may = barberMay(user, staff.id, today);
  if (!may.see) return <NoRights />;
  const from = weekStart(isLocalDate(sp.d) ? sp.d : today);
  // cut to what the login may see: its history limit, and sums only with «Показывать статистику»
  const days = barberDaysFor(user, staff.id, await loadBarberDays(query, business, staff.id, from, 7), today);
  const count = days.reduce((n, d) => n + d.count, 0);
  const total = days.reduce((n, d) => n + d.totalCents, 0);
  const range = `${dateWords(from, B.lang, { day: "numeric", month: "short" })} – ${dateWords(addDays(from, 6), B.lang, { day: "numeric", month: "short" })}`;
  const isThis = days.some((d) => d.date === today);
  // an owner or the front desk on his own column: «Мой день», a tab of the one app, with its own head (docs/apps.md)
  const own = user.role !== "staff" && staff.id === user.staffId;
  const WeekTitle = own ? "h2" : "h1";

  return (
    <main className={`adm-page bx-week${own ? " is-own" : ""}`}>
      <Title text={own ? B.own.title : B.nav.week} />
      {own && (
        <header className="bx-own-head">
          <div>
            <h1 className="adm-h1">{B.own.title}</h1>
            <p className="bx-own-line">
              {range} · {B.day.visits(count)}
              {may.stats && ` · ${eur(total)}`}
            </p>
          </div>
          <OwnSeg view="week" date={isThis ? today : from} today={today} words={B.own} />
        </header>
      )}
      {/* a barber's way back to his day: the week has no tab of its own (Dim, round 13) */}
      {!own && (
        <div className="bx-week-seg">
          <OwnSeg view="week" date={isThis ? today : from} today={today} words={B.own} />
        </div>
      )}
      <nav className="bx-wnav" aria-label={B.week.title}>
        <Link href={`/b/week?d=${addDays(from, -7)}`} className="adm-ibtn" aria-label={B.day.prevWeek} prefetch={false} replace>
          <PrevIcon />
        </Link>
        <div>
          <WeekTitle className="adm-h1">{B.week.title}</WeekTitle>
          <p className="adm-meta">{range}</p>
        </div>
        <Link href={`/b/week?d=${addDays(from, 7)}`} className="adm-ibtn" aria-label={B.day.nextWeek} prefetch={false} replace>
          <NextIcon />
        </Link>
      </nav>
      {!isThis && (
        <Link href="/b/week" className="adm-txt lime" prefetch={false} replace>
          {B.day.toToday}
        </Link>
      )}
      {/* «Мой день» has the week's count and sum in its head */}
      {!own && (
        <p className="bx-sum">
          <span>{B.week.total}</span>
          <span>
            {B.day.visits(count)}
            {may.stats && (
              <>
                {" "}
                · <b>{eur(total)}</b>
              </>
            )}
          </span>
        </p>
      )}
      <ol className="bx-wk">
        {days.map((d) => {
          const whole = d.blocks.find((b) => coversDay(b, d.date, tz));
          const hours = hoursText(d.windows, tz);
          const shown = d.visits.filter((v) => COUNTED.has(v.status) || v.status === "no_show");
          return (
            <li key={d.date} className={`${d.date === today ? "is-today" : ""}${d.windows.length ? "" : " is-off"}`}>
              <Link href={d.date === today ? "/b" : `/b?d=${d.date}`} prefetch={false}>
                <span className="bx-wk-head">
                  <b>{cap(dateWords(d.date, B.lang))}</b>
                  {d.count > 0 && may.stats && <span>{eur(d.totalCents)}</span>}
                </span>
                <small>
                  {whole ? `${B.day.kinds[whole.kind] ?? whole.kind} · ${B.day.allDay}` : hours || B.week.off}
                  {d.count > 0 ? ` · ${B.day.visits(d.count)}` : ""}
                </small>
                {shown.length > 0 && (
                  <span className="bx-wk-list">
                    {shown.map((v) => (
                      <span key={v.id} className={v.status === "no_show" ? "is-ns" : ""}>
                        <b>{hm(v.start, tz)}</b> {v.clientName}
                        <small> · {v.services.map((s) => pick3(s.name, B.lang)).join(" + ")}</small>
                      </span>
                    ))}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
