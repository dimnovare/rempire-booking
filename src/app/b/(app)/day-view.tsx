"use client";

/**
 * The barber's day on his phone (B2): the week strip, his hours and the
 * day's money, the next client with «call» and one tap for «arrived» or
 * «done», then the whole day in order: visits, free time, breaks.
 * Pull down (or come back to the app) to refresh.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { BBlock, BDay, BVisit } from "@/lib/barber/day";
import { coversDay, freeGaps, hoursText, nextVisit, type Gap } from "@/lib/barber/gaps";
import { addDays, startOfDay } from "@/lib/tz";
import { NextIcon, PrevIcon } from "../../admin/icons";
import { cap, dateWords, eur, hm, minsText, pick3 } from "../copy.shared";
import { useB, useTitle } from "../lang";
import { BSheet } from "./sheet";
import { setVisitStatus } from "./visit-actions";

const MIN = 60_000;
/** how far to pull (px, after the drag is halved) before letting go refreshes */
const PULL = 64;

type Props = { days: BDay[]; date: string; today: string; now: number; tz: string; step: number };

export function DayView({ days, date, today, now: serverNow, tz, step }: Props) {
  const B = useB();
  useTitle(B.nav.day);
  const router = useRouter();
  const [sel, setSel] = useState(days.some((d) => d.date === date) ? date : days[0].date);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const now = useNow(serverNow);
  const online = useOnline();
  const [refreshing, startRefresh] = useTransition();
  const reload = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const pulled = usePullRefresh(reload, openId === null);
  useAutoRefresh(reload);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const choose = (d: string) => {
    setSel(d);
    setOpenId(null);
    // the address follows the strip: a reload, «back» or the refresh land on this day
    window.history.replaceState(null, "", d === today ? "/b" : `/b?d=${d}`);
  };

  const status = async (v: BVisit, s: string) => {
    setBusy(true);
    try {
      const ok = await setVisitStatus(v.id, s);
      setToast(ok ? { text: B.visit.status[s] ?? s } : { text: B.error, bad: true });
    } catch {
      setToast({ text: B.error, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const day = days.find((d) => d.date === sel) ?? days[0];
  const open = openId ? (days.flatMap((d) => d.visits).find((v) => v.id === openId) ?? null) : null;
  const rel = sel === today ? B.day.today : sel === addDays(today, 1) ? B.day.tomorrow : sel === addDays(today, -1) ? B.day.yesterday : null;
  const words = cap(dateWords(sel, B.lang));
  const wholeDay = day.blocks.find((b) => coversDay(b, sel, tz));
  const hours = hoursText(day.windows, tz);
  const next = sel === today ? nextVisit(day.visits, now) : null;
  const thisWeek = days.some((d) => d.date === today);

  return (
    <main className="adm-page bx-day">
      <div className="bx-pull" style={{ height: pulled }} aria-hidden={pulled === 0}>
        {pulled > 0 && <span>{pulled >= PULL ? B.day.release : B.day.pull}</span>}
      </div>
      {(refreshing || !online) && (
        <p className={`bx-state${online ? "" : " is-off"}`} role="status">
          {online ? B.day.refresh + "…" : B.offline}
        </p>
      )}

      <nav className="bx-strip" aria-label={B.day.days}>
        <Link href={`/b?d=${addDays(sel, -7)}`} className="adm-ibtn" aria-label={B.day.prevWeek} prefetch={false} replace>
          <PrevIcon />
        </Link>
        <div className="bx-strip-days">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              aria-pressed={d.date === sel}
              aria-label={`${dateWords(d.date, B.lang)}${d.count ? `, ${B.day.visits(d.count)}` : ""}`}
              className={`${d.date === today ? "is-today" : ""}${d.windows.length ? "" : " is-off"}`}
              onClick={() => choose(d.date)}
            >
              <small>{dateWords(d.date, B.lang, { weekday: "short" })}</small>
              <b>{Number(d.date.slice(8))}</b>
              <i>{d.count || ""}</i>
            </button>
          ))}
        </div>
        <Link href={`/b?d=${addDays(sel, 7)}`} className="adm-ibtn" aria-label={B.day.nextWeek} prefetch={false} replace>
          <NextIcon />
        </Link>
      </nav>

      <header className="bx-head">
        <div className="bx-head-row">
          <h1 className="adm-h1">{rel ?? words}</h1>
          {!thisWeek || sel !== today ? (
            thisWeek ? (
              <button type="button" className="adm-txt" onClick={() => choose(today)}>
                {B.day.toToday}
              </button>
            ) : (
              <Link href="/b" className="adm-txt" prefetch={false} replace>
                {B.day.toToday}
              </Link>
            )
          ) : null}
        </div>
        {rel && <p className="adm-meta">{words}</p>}
        <p className="bx-sum">
          <span>{wholeDay ? `${B.day.kinds[wholeDay.kind] ?? wholeDay.kind} · ${B.day.allDay}` : hours ? B.day.hours(hours) : B.day.off}</span>
          {day.count > 0 && (
            <span>
              {B.day.visits(day.count)} · <b>{eur(day.totalCents)}</b>
            </span>
          )}
        </p>
        {day.special.map((s) => (
          <p key={s.id} className="bx-sp">
            {B.day.special(`+${eur(s.extraCents)}`)} · {hm(s.from, tz)}–{hm(s.to, tz)}
          </p>
        ))}
      </header>

      {next && <NextCard v={next} now={now} tz={tz} busy={busy} onOpen={() => setOpenId(next.id)} onStatus={status} />}

      <Timeline day={day} now={now} tz={tz} step={step} onOpen={setOpenId} />

      {open && <VisitSheet v={open} tz={tz} busy={busy} onClose={() => setOpenId(null)} onStatus={status} />}
      {toast && (
        <p className={`adm-toast${toast.bad ? " is-bad" : ""}`} role="status">
          {toast.text}
        </p>
      )}
    </main>
  );
}

const services = (v: BVisit, lang: Parameters<typeof pick3>[1]) => v.services.map((s) => pick3(s.name, lang)).join(" + ");

function NextCard({ v, now, tz, busy, onOpen, onStatus }: { v: BVisit; now: number; tz: string; busy: boolean; onOpen: () => void; onStatus: (v: BVisit, s: string) => void }) {
  const B = useB();
  const inChair = v.status === "arrived" || v.start <= now;
  const wait = Math.max(1, Math.round((v.start - now) / MIN));
  // one tap for what comes next: «arrived» from half an hour before, then «done»
  const quick = v.status === "arrived" ? "done" : v.status === "booked" && v.start - now <= 30 * MIN ? "arrived" : null;
  return (
    <section className={`bx-next${inChair ? " is-now" : ""}`} aria-label={B.day.next}>
      <p className="bx-next-when">{inChair ? B.day.now : `${B.day.next} · ${B.day.inMin(wait)}`}</p>
      <button type="button" className="bx-next-main" onClick={onOpen}>
        <b>
          {hm(v.start, tz)}–{hm(v.end, tz)}
        </b>
        <span>{v.clientName}</span>
        <small>{services(v, B.lang)}</small>
      </button>
      {(v.clientPhone || quick) && (
        <div className="adm-bar-row">
          {v.clientPhone && (
            <a className="adm-btn adm-btn-line adm-btn-auto" href={`tel:${v.clientPhone}`}>
              {B.visit.call}
            </a>
          )}
          {quick && (
            <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => onStatus(v, quick)}>
              {B.day.quick[quick]}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

type Item = { at: number; order: number; key: string } & ({ kind: "visit"; v: BVisit } | { kind: "gap"; g: Gap } | { kind: "block"; b: BBlock });

function Timeline({ day, now, tz, step, onOpen }: { day: BDay; now: number; tz: string; step: number; onOpen: (id: string) => void }) {
  const B = useB();
  const d0 = startOfDay(day.date, tz);
  const d1 = startOfDay(addDays(day.date, 1), tz);
  const gaps = freeGaps(day, { now, stepMin: step });
  const items: Item[] = [
    ...day.visits.map((v) => ({ at: v.start, order: 1, key: v.id, kind: "visit" as const, v })),
    ...gaps.map((g) => ({ at: g.from, order: 2, key: `g${g.from}`, kind: "gap" as const, g })),
    ...day.blocks.filter((b) => !coversDay(b, day.date, tz)).map((b) => ({ at: Math.max(b.from, d0), order: 0, key: b.id, kind: "block" as const, b })),
  ].sort((x, y) => x.at - y.at || x.order - y.order);

  if (!items.length) return <p className="adm-meta bx-empty">{B.day.empty}</p>;
  return (
    <>
      {!day.visits.length && gaps.length > 0 && <p className="adm-meta bx-empty">{B.day.emptyFree}</p>}
      <ol className="bx-tl">
        {items.map((it) => {
          if (it.kind === "visit") {
            const v = it.v;
            const live = now >= v.start && now < v.end;
            return (
              <li key={it.key} className={`bx-v st-${v.status}${v.extraCents ? " is-sp" : ""}${live ? " is-now" : ""}`}>
                <button type="button" onClick={() => onOpen(v.id)}>
                  <span className="bx-t">
                    <b>{hm(v.start, tz)}</b>
                    <small>{hm(v.end, tz)}</small>
                  </span>
                  <span className="bx-v-main">
                    <b>{v.clientName}</b>
                    <small>{services(v, B.lang)}</small>
                  </span>
                  <span className="bx-v-side">
                    <b>{eur(v.totalCents)}</b>
                    {v.status !== "booked" && <small className={`adm-tag${v.status === "arrived" ? " lime" : v.status === "no_show" ? " warn" : ""}`}>{B.visit.status[v.status] ?? v.status}</small>}
                  </span>
                </button>
              </li>
            );
          }
          if (it.kind === "gap") {
            const g = it.g;
            return (
              <li key={it.key} className={`bx-gap${g.extraCents ? " is-sp" : ""}`}>
                <span className="bx-t">
                  <b>{hm(g.from, tz)}</b>
                  <small>{hm(g.to, tz)}</small>
                </span>
                <span className="bx-gap-main">
                  {B.day.gap(minsText(Math.round((g.to - g.from) / MIN), B.h, B.min))}
                  {g.extraCents > 0 && <small> · +{eur(g.extraCents)}</small>}
                </span>
              </li>
            );
          }
          const b = it.b;
          return (
            <li key={it.key} className={`bx-blk${b.status === "requested" ? " is-req" : ""}`}>
              <span className="bx-t">
                <b>{hm(Math.max(b.from, d0), tz)}</b>
                <small>{hm(Math.min(b.to, d1), tz)}</small>
              </span>
              <span className="bx-blk-main">
                <b>{B.day.kinds[b.kind] ?? b.kind}</b>
                {b.note && <small>{b.note}</small>}
                {b.status === "requested" && <small className="adm-tag">{B.day.requested}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function VisitSheet({ v, tz, busy, onClose, onStatus }: { v: BVisit; tz: string; busy: boolean; onClose: () => void; onStatus: (v: BVisit, s: string) => void }) {
  const B = useB();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(v.start);
  return (
    <BSheet title={v.clientName} onClose={onClose}>
      <p className="adm-time">
        <b>
          {hm(v.start, tz)}–{hm(v.end, tz)}
        </b>
        <span>{cap(dateWords(date, B.lang))}</span>
      </p>
      {v.clientPhone ? (
        <a className="adm-phone" href={`tel:${v.clientPhone}`}>
          {v.clientPhone} · {B.visit.call}
        </a>
      ) : (
        <p className="adm-meta">{B.visit.noPhone}</p>
      )}
      {v.clientNote && (
        <div className="bx-noteblk">
          <small>{B.visit.clientNote}</small>
          <p className="adm-note">{v.clientNote}</p>
        </div>
      )}
      <div className="adm-status" role="group" aria-label={B.visit.setStatus}>
        {(["arrived", "done", "no_show"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={v.status === s} disabled={busy} onClick={() => onStatus(v, v.status === s ? "booked" : s)}>
            {B.visit.status[s]}
          </button>
        ))}
      </div>
      <ul className="adm-lines">
        {v.services.map((s, i) => (
          <li key={i}>
            <span>
              {pick3(s.name, B.lang)} <small className="adm-meta">· {minsText(s.durationMin, B.h, B.min)}</small>
            </span>
            <span>{eur(s.priceCents)}</span>
          </li>
        ))}
        {v.extraCents > 0 && (
          <li className="is-sp">
            <span>{B.visit.extra}</span>
            <span>+{eur(v.extraCents)}</span>
          </li>
        )}
        <li className="tot">
          <span>{B.visit.total}</span>
          <span>{eur(v.totalCents)}</span>
        </li>
      </ul>
      {v.comment && (
        <div className="bx-noteblk">
          <small>{B.visit.comment}</small>
          <p className="adm-note">«{v.comment}»</p>
        </div>
      )}
      {v.staffNote && (
        <div className="bx-noteblk">
          <small>{B.visit.visitNote}</small>
          <p className="adm-note">{v.staffNote}</p>
        </div>
      )}
      <p className="adm-meta">
        {B.visit.source[v.source] ?? v.source}
        {v.reminder ? "" : ` · ${B.visit.reminderOff}`}
      </p>
    </BSheet>
  );
}

/** The clock, ticking every half minute (the next client's «in 25 min», the free time). */
function useNow(initial: number): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return now;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Fresh data when the barber comes back to the app, and every two minutes while it is open. */
function useAutoRefresh(reload: () => void) {
  useEffect(() => {
    const seen = () => {
      if (document.visibilityState === "visible" && navigator.onLine) reload();
    };
    document.addEventListener("visibilitychange", seen);
    const t = setInterval(seen, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", seen);
      clearInterval(t);
    };
  }, [reload]);
}

/**
 * Pull down at the top of the page to refresh: an installed app on an
 * iPhone has no pull-to-refresh of its own. Returns how far it is pulled.
 */
function usePullRefresh(onRefresh: () => void, enabled: boolean): number {
  const [dist, setDist] = useState(0);
  const on = useRef(enabled);
  useEffect(() => {
    on.current = enabled;
  }, [enabled]);
  useEffect(() => {
    let y0: number | null = null;
    let d = 0;
    const start = (e: TouchEvent) => {
      y0 = on.current && window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      d = 0;
    };
    const move = (e: TouchEvent) => {
      if (y0 === null) return;
      d = Math.max(0, Math.min(110, (e.touches[0].clientY - y0) / 2));
      setDist(d);
    };
    const end = () => {
      if (y0 !== null && d >= PULL) onRefresh();
      y0 = null;
      d = 0;
      setDist(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [onRefresh]);
  return dist;
}
