/**
 * /b/week: the barber's week (B2), Monday to Sunday: each day's hours, its
 * visits in one line each, the day's and the week's money. A day opens
 * in «День».
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

  return (
    <main className="adm-page bx-week">
      <Title text={B.nav.week} />
      <nav className="bx-wnav" aria-label={B.week.title}>
        <Link href={`/b/week?d=${addDays(from, -7)}`} className="adm-ibtn" aria-label={B.day.prevWeek} prefetch={false} replace>
          <PrevIcon />
        </Link>
        <div>
          <h1 className="adm-h1">{B.week.title}</h1>
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
