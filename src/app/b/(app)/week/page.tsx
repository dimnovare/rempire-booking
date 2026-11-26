/**
 * /b/week: the barber's week (B2), Monday to Sunday: each day's hours, its
 * visits in one line each, the day's and the week's money. A day's card
 * opens that day.
 *
 * Option А of the board «День | Неделя на телефоне» (Dim, 26.11.2026): the
 * week has the day's own head, so «День | Неделя» never moves. The dark bar
 * with «23–29 ноября ▾» (a ▾ opens a date) and the switch; the row with him,
 * the week's visits and money and how full it is; the weeks before and after
 * float at the bottom above the tabs, where the day has its days.
 * /b/week?d=2026-11-17   the week of that day
 */
import Link from "next/link";
import { Suspense } from "react";
import { weekStart } from "@/lib/admin/grid";
import { requireStaff } from "@/lib/auth/current";
import { barberDaysFor, barberMay, loadBarberDays } from "@/lib/barber/day";
import { COUNTED, coversDay, hoursText } from "@/lib/barber/gaps";
import { dbConfigured, query } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { addDays, isLocalDate, todayIn } from "@/lib/tz";
import { Ava, NextIcon, PrevIcon } from "../../../admin/icons";
import { cap, dateWords, eur, hm, pick3 } from "../../copy.shared";
import { Wait } from "../../lang";
import { getB } from "../../lang-server";
import { NoRights } from "../may";
import { OwnSeg } from "../own-head";
import { Title } from "../title";
import { WeekBar } from "./week-bar";

const MIN = 60_000;

/** «23–29 ноября», or «30 нояб. – 6 дек.» across two months; `month: "short"` for a narrow bar */
function weekWords(from: string, lang: Locale, month: "long" | "short"): string {
  const to = addDays(from, 6);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}${lang === "et" ? "." : ""}–${dateWords(to, lang, { day: "numeric", month })}`;
  return `${dateWords(from, lang, { day: "numeric", month: "short" })} – ${dateWords(to, lang, { day: "numeric", month: "short" })}`;
}

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
  const range = weekWords(from, B.lang, "long");
  const isThis = days.some((d) => d.date === today);
  // how full the week is: its visits over its hours, as the day counts it
  const workMin = days.reduce((n, d) => n + d.windows.reduce((m, [a, b]) => m + (b - a) / MIN, 0), 0);
  const busyMin = days.reduce((n, d) => n + d.visits.filter((v) => COUNTED.has(v.status)).reduce((m, v) => m + (v.end - v.start) / MIN, 0), 0);
  const load = workMin ? Math.min(100, Math.round((busyMin / workMin) * 100)) : 0;
  // an owner or the front desk on his own column: «Мой день», a tab of the one app (docs/apps.md)
  const own = user.role !== "staff" && staff.id === user.staffId;
  const prev = addDays(from, -7);
  const next = addDays(from, 7);

  return (
    <main className={`bx-cal bx-wkv${own ? " is-own" : ""}`}>
      <Title text={own ? B.own.title : B.nav.week} />
      <WeekBar title={range} titleShort={weekWords(from, B.lang, "short")} date={isThis ? today : from} pickLabel={B.day.pickDate} todayLabel={isThis ? null : B.day.today}>
        <OwnSeg view="week" date={isThis ? today : from} today={today} words={B.own} />
      </WeekBar>
      <h1 className="bx-cal-h1">{own ? B.own.title : `${B.week.title}, ${range}`}</h1>

      {/* him, the week's visits and money (the sum: «Показывать статистику»), and how full it is */}
      <section className="bx-cal-sum" aria-label={B.week.title}>
        <Ava src={staff.photoUrl} name={staff.name} className="bx-cal-ava" />
        <div>
          <b>{staff.name}</b>
          <p>
            {B.week.total}: {B.day.visits(count)}
            {may.stats && ` · ${eur(total)}`}
          </p>
          {workMin > 0 && (
            <div className="bx-cal-load">
              <span aria-hidden="true">
                <i style={{ width: `${load}%` }} />
              </span>
              <small>{B.day.busy(load)}</small>
            </div>
          )}
        </div>
      </section>

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
                  {d.date === today && <span className="bx-wk-now">{B.day.today}</span>}
                  {d.count > 0 && may.stats && <span className="bx-wk-sum">{eur(d.totalCents)}</span>}
                  <NextIcon size={16} />
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

      {/* the weeks before and after, where the day has its days */}
      <nav className="cal-strip is-weeks" aria-label={B.week.weeks}>
        <Link href={`/b/week?d=${prev}`} aria-label={B.day.prevWeek} prefetch={false} replace>
          <PrevIcon size={22} />
        </Link>
        <b>
          {range}
          {isThis && <small>{B.week.thisWeek}</small>}
        </b>
        <Link href={`/b/week?d=${next}`} aria-label={B.day.nextWeek} prefetch={false} replace>
          <NextIcon size={22} />
        </Link>
      </nav>
    </main>
  );
}
