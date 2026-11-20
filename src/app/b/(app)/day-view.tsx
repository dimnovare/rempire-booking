"use client";

/**
 * The barber's day on his phone (B2), as the salon's journal on a phone
 * (board MyDay-Grid): the dark bar with the day (a ▾ opens a date) and
 * «День | Неделя», a row with him, the day's visits and money and how busy
 * it is, then his one column of the journal's grid (journal-grid.tsx, the
 * admin's own): his hours white on grey, breaks and time off hatched,
 * special time with its extra, the visits in the journal's colours, the
 * clock line; the week floats at the bottom above the tabs. Pull down (or
 * come back to the app) to refresh.
 *
 * B3: a tap on free time books a visit in his column at the time tapped
 * (the bar «Новый сеанс» stays there while the sheet is open), so does
 * «+»; a visit's sheet moves it, cancels it (with a reason) or books the
 * client again.
 * B6: the visit's sheet edits the client's shared note and the visit's own
 * note, and opens the client's card (his visits with this client).
 *
 * `own`: the same day as «Мой день» of an owner or the front desk who cuts
 * too (docs/apps.md, «One app for Renat»), a tab of the one app.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { daySpan, minutesInDay, momentAt, snap } from "@/lib/admin/grid";
import type { Offer } from "@/lib/barber/book";
import type { BDay, BMay, BVisit } from "@/lib/barber/day";
import { COUNTED, coversDay, freeGaps, hoursText } from "@/lib/barber/gaps";
import { extraText } from "@/lib/slots";
import { addDays, localParts } from "@/lib/tz";
import { JournalGrid, minuteAt, PhoneBar, WeekStrip, type GridCol } from "../../admin/(app)/journal-grid";
import { Ava, PlusIcon, StatusMark } from "../../admin/icons";
import { cap, dateWords, eur, hm, minsText, pick3 } from "../copy.shared";
import { useB, useTitle } from "../lang";
import { CancelSheet, MoveSheet, NewVisitSheet, type NewPrefill } from "./book-sheets";
import { ClientSheet, NoteEditor } from "./client-sheet";
import { BSheet } from "./sheet";
import { MayProvider, useMay } from "./may";
import { OwnSeg } from "./own-head";
import "./day-grid.css";
import { saveClientNote, saveVisitNote, setVisitStatus } from "./visit-actions";

const MIN = 60_000;
/** how far to pull (px, after the drag is halved) before letting go refreshes */
const PULL = 64;

type Props = {
  days: BDay[];
  date: string;
  today: string;
  now: number;
  tz: string;
  step: number;
  offers: Offer[];
  may: BMay;
  own?: boolean;
  /** whose column it is: the row above the grid */
  me: { id: string; name: string; photoUrl: string | null };
};
/** «Мой день» is 76px an hour (board MyDay-Grid; day-grid.css, --ppm): a visit under 45 minutes is one line. */
const SHORT_MIN = 45;
const CAME = new Set(["arrived", "done"]);

/** What is open over the day: a visit, a new visit, or a visit being moved or cancelled. */
type Open = { kind: "visit" | "move" | "cancel" | "client"; id: string } | { kind: "new"; prefill: NewPrefill };

/** The barber's day, with what the login may do in it handed down to its sheets. */
export function DayView(props: Props) {
  return (
    <MayProvider value={props.may}>
      <Day {...props} />
    </MayProvider>
  );
}

function Day({ days, date, today, now: serverNow, tz, step, offers, may, own = false, me }: Props) {
  const B = useB();
  useTitle(own ? B.own.title : B.nav.day);
  const router = useRouter();
  const [sel, setSel] = useState(days.some((d) => d.date === date) ? date : days[0].date);
  const [sheet, setSheet] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const now = useNow(serverNow);
  // offline, or the copy the service worker kept (a weak connection says it is online)
  const onLine = useOnline();
  const cached = useCached(serverNow);
  const online = onLine && !cached;
  const [refreshing, startRefresh] = useTransition();
  const reload = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const pulled = usePullRefresh(reload, sheet === null);
  useAutoRefresh(reload);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const choose = (d: string) => {
    setSel(d);
    setSheet(null);
    // the address follows the strip: a reload, «back» or the refresh land on this day
    window.history.replaceState(null, "", d === today ? "/b" : `/b?d=${d}`);
  };
  /** Any day: one of this week at once, another week from the server. */
  const goTo = (d: string) => (days.some((x) => x.date === d) ? choose(d) : router.replace(d === today ? "/b" : `/b?d=${d}`));

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
  const visitOf = (id: string) => days.flatMap((d) => d.visits).find((v) => v.id === id) ?? null;
  const open = sheet && sheet.kind !== "new" ? visitOf(sheet.id) : null;
  const openVisit = (id: string) => setSheet({ kind: "visit", id });
  // the server lists a start only where the visit and its tidy-up fit (startsIn)
  const shortest = offers.length ? Math.min(...offers.map((o) => o.durationMin + o.bufferMin)) * MIN : Infinity;
  const book = (prefill: Partial<NewPrefill>) => setSheet({ kind: "new", prefill: { date: sel < today ? today : sel, ...prefill } });
  /** «Записать снова»: the usual four weeks on from that visit, the same client and services. */
  const again = (v: BVisit) => {
    const later = addDays(localParts(v.start, tz).date, 28);
    book({
      date: later < today ? today : later,
      client: { id: v.clientId, name: v.clientName, phone: v.clientPhone },
      serviceIds: v.services.map((x) => x.serviceId),
    });
  };

  /** After a booking or a move: say so, and show that day (a day of another week loads it). */
  const done = (text: string, date?: string) => {
    setSheet(null);
    setToast({ text });
    if (!date || date === sel) return;
    goTo(date);
  };
  const rel = sel === today ? B.day.today : sel === addDays(today, 1) ? B.day.tomorrow : sel === addDays(today, -1) ? B.day.yesterday : null;
  const words = cap(dateWords(sel, B.lang));
  const wholeDay = day.blocks.find((b) => coversDay(b, sel, tz));
  const hours = hoursText(day.windows, tz);
  const thisWeek = days.some((d) => d.date === today);
  // a new visit is offered only with the right to make one
  const canBook = offers.length > 0 && may.create;

  /* ---- the grid: his one column ---- */
  const col: GridCol = { key: sel, staffId: me.id, date: sel };
  const visits = useMemo(() => day.visits.map((v) => ({ ...v, staffId: me.id })), [day, me.id]);
  const blocks = useMemo(() => day.blocks.map((b) => ({ ...b, staffId: me.id })), [day, me.id]);
  const special = useMemo(() => day.special.map((x) => ({ ...x, staffId: me.id })), [day, me.id]);
  // the day runs over his hours, his visits, his special time, and time off of a part of the day (a break he
  // set after his hours shows); a whole day off does not stretch it to midnight
  const [lo, hi] = useMemo(
    () =>
      daySpan([sel], tz, [
        ...day.windows.map(([from, to]) => ({ from, to })),
        ...day.visits.map((v) => ({ from: v.start, to: v.end })),
        ...day.special.map((x) => ({ from: x.from, to: x.to })),
        ...day.blocks.filter((b) => !coversDay(b, sel, tz) && b.from >= momentAt(sel, 0, tz) && b.to <= momentAt(sel, 24 * 60, tz)),
      ]),
    [sel, tz, day],
  );
  // free time to book: a piece long enough for his shortest service
  const gaps = freeGaps(day, { now, stepMin: step }).filter((g) => canBook && g.to - g.from >= shortest);
  const workMin = day.windows.reduce((n, [a, b]) => n + (b - a) / MIN, 0);
  const busyMin = day.visits.filter((v) => COUNTED.has(v.status)).reduce((n, v) => n + (v.end - v.start) / MIN, 0);
  const load = workMin ? Math.min(100, Math.round((busyMin / workMin) * 100)) : 0;
  const marked = sheet?.kind === "new" && sheet.prefill.date === sel && sheet.prefill.start ? sheet.prefill.start : null;

  // open at the clock (today) or an hour before his day starts; the page scrolls, so pulling down at its top refreshes
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const colEl = gridRef.current?.querySelector<HTMLElement>("[data-col]");
    if (!colEl) return;
    const first = day.windows.length ? minutesInDay(day.windows[0][0], sel, tz) - 30 : lo;
    const target = sel === today ? minutesInDay(Date.now(), sel, tz) - 60 : first;
    const r = colEl.getBoundingClientRect();
    const bar = document.querySelector(".bx-cal .cal-bar")?.getBoundingClientRect().bottom ?? 0;
    const y = window.scrollY + r.top + ((Math.max(lo, target) - lo) / (hi - lo)) * r.height - bar - 72;
    window.scrollTo({ top: Math.max(0, y) });
    // a day chosen in the strip opens the same way; not on every refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  /** A tap on free time: the time under the finger on the step grid, inside the piece; the keyboard: its start. */
  const tapFree = (from: number, to: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const colEl = e.currentTarget.closest<HTMLElement>("[data-col]");
    let start = from;
    if (colEl && e.detail > 0) {
      const at = momentAt(sel, snap(minuteAt(colEl, e.clientY, lo, hi), step), tz);
      start = Math.max(from, Math.min(at, to - shortest));
    }
    book({ start });
  };

  const sp = (x: (typeof special)[number]) => {
    const free = !day.visits.some((v) => v.status !== "cancelled" && v.start < x.to && v.end > x.from);
    return (
      <>
        <i className="bx-cal-sp-i" aria-hidden="true">
          %
        </i>
        <span>
          <b>{B.day.spTitle(extraText(x))}</b>
          <small>
            {hm(x.from, tz)}–{hm(x.to, tz)}
            {free && ` · ${B.day.spFree}`}
          </small>
        </span>
      </>
    );
  };

  return (
    <main className={`bx-cal${own ? " is-own" : ""}`}>
      <PhoneBar
        title={cap(dateWords(sel, B.lang))}
        titleShort={cap(dateWords(sel, B.lang, { weekday: "short", day: "numeric", month: "short" }))}
        date={sel}
        pickLabel={B.day.pickDate}
        onPick={goTo}
        // «Сегодня» when today is not in the strip already
        today={thisWeek ? null : { label: B.day.today, go: () => router.replace("/b") }}
      >
        <OwnSeg view="day" date={sel} today={today} words={B.own} />
      </PhoneBar>
      <h1 className="bx-cal-h1">{own ? B.own.title : (rel ?? words)}</h1>
      <div className="bx-pull" style={{ height: pulled }} aria-hidden={pulled === 0}>
        {pulled > 0 && <span>{pulled >= PULL ? B.day.release : B.day.pull}</span>}
      </div>
      {(refreshing || !online) && (
        <p className={`bx-state${online ? "" : " is-off"}`} role="status">
          {online ? B.day.refresh + "…" : B.offline}
        </p>
      )}

      {/* him, the day's visits and money (the sum: «Показывать статистику»), and how full the day is */}
      <section className="bx-cal-sum" aria-label={words}>
        <Ava src={me.photoUrl} name={me.name} className="bx-cal-ava" />
        <div>
          <b>{me.name}</b>
          <p>
            {wholeDay ? `${B.day.kinds[wholeDay.kind] ?? wholeDay.kind} · ${B.day.allDay}` : !hours && !day.count ? B.day.off : [B.day.visits(day.count), may.stats ? eur(day.totalCents) : null, !hours ? B.day.off : null].filter(Boolean).join(" · ")}
          </p>
          {hours && !wholeDay && (
            <div className="bx-cal-load">
              <span aria-hidden="true">
                <i style={{ width: `${load}%` }} />
              </span>
              <small>{B.day.busy(load)}</small>
            </div>
          )}
        </div>
      </section>

      <div ref={gridRef}>
        <JournalGrid
          cols={[col]}
          lo={lo}
          hi={hi}
          tz={tz}
          today={today}
          now={now}
          work={() => day.windows}
          visits={visits}
          blocks={blocks}
          special={special}
          shortMin={SHORT_MIN}
          step={step}
          visitLabel={(v) => `${hm(v.start, tz)}–${hm(v.end, tz)}, ${v.clientName}, ${services(v, B.lang)}${v.status !== "booked" ? `, ${B.visit.status[v.status] ?? v.status}` : ""}`}
          visitBody={(v) => (
            <>
              <span className="t">
                <span>
                  {hm(v.start, tz)}–{hm(v.end, tz)}
                </span>
                <StatusMark status={v.status} size={12} />
              </span>
              <span className="bx-cv">
                <span className="bx-cv-txt">
                  <b>{v.clientName}</b>
                  <span className="s">{services(v, B.lang)}</span>
                </span>
                <span className="bx-cv-sum">{eur(v.totalCents)}</span>
              </span>
            </>
          )}
          blockBody={(b) => (
            <>
              <b>{B.day.kinds[b.kind] ?? b.kind}</b>
              <small>
                {b.note ? `${b.note} · ` : ""}
                {coversDay(b, sel, tz) ? B.day.allDay : `${hm(b.from, tz)}–${hm(b.to, tz)}`}
              </small>
              {b.status === "requested" && <small className="adm-tag">{B.day.requested}</small>}
            </>
          )}
          specialBody={sp}
          onVisit={(v) => openVisit(v.id)}
          colExtra={() =>
            gaps.map((g) => {
              const top = minutesInDay(g.from, sel, tz) - lo;
              const len = (g.to - g.from) / MIN;
              const free = B.day.gap(minsText(Math.round(len), B.h, B.min));
              return (
                <button
                  key={`g${g.from}`}
                  type="button"
                  className="cal-free"
                  style={{ "--t": top, "--m": len } as React.CSSProperties}
                  aria-label={`${B.book.addAt(hm(g.from, tz))}. ${free}`}
                  onClick={(e) => tapFree(g.from, g.to, e)}
                />
              );
            })
          }
          mark={
            marked
              ? {
                  col: col.key,
                  min: minutesInDay(marked, sel, tz),
                  body: (
                    <>
                      <PlusIcon size={14} />
                      <b>{hm(marked, tz)}</b>
                      <span>{B.day.newSlot}</span>
                    </>
                  ),
                }
              : null
          }
        />
      </div>

      <WeekStrip
        days={days.map((d) => d.date)}
        date={sel}
        today={today}
        label={B.day.days}
        dayName={(d) => cap(dateWords(d, B.lang, { weekday: "short" }))}
        dayLabel={(d) => `${cap(dateWords(d, B.lang, { weekday: "long", day: "numeric", month: "long" }))}${days.find((x) => x.date === d)?.count ? `, ${B.day.visits(days.find((x) => x.date === d)!.count)}` : ""}`}
        onPick={choose}
        onSwipe={(by) => router.replace(`/b?d=${addDays(sel, 7 * by)}`)}
      />
      {canBook && (
        <button type="button" className="cal-add" aria-label={B.book.new} onClick={() => book({})}>
          <PlusIcon size={24} />
        </button>
      )}

      {open && sheet?.kind === "visit" && (
        <VisitSheet
          v={open}
          tz={tz}
          busy={busy}
          canBook={canBook}
          onClose={() => setSheet(null)}
          onStatus={status}
          onMove={() => setSheet({ kind: "move", id: open.id })}
          onCancel={() => setSheet({ kind: "cancel", id: open.id })}
          onAgain={() => again(open)}
          onClient={() => setSheet({ kind: "client", id: open.id })}
          onSaved={(text) => setToast({ text })}
        />
      )}
      {open && sheet?.kind === "client" && (
        <ClientSheet
          clientId={open.clientId}
          name={open.clientName}
          tz={tz}
          canBook={canBook}
          onClose={() => setSheet(null)}
          onBack={() => openVisit(open.id)}
          onAgain={() => again(open)}
          onSaved={(text) => setToast({ text })}
        />
      )}
      {open && sheet?.kind === "move" && <MoveSheet v={open} tz={tz} today={today} onClose={() => openVisit(open.id)} onDone={done} />}
      {open && sheet?.kind === "cancel" && <CancelSheet v={open} tz={tz} onClose={() => openVisit(open.id)} onDone={(t) => done(t)} />}
      {sheet?.kind === "new" && <NewVisitSheet offers={offers} tz={tz} today={today} prefill={sheet.prefill} onClose={() => setSheet(null)} onDone={done} />}
      {toast && (
        <p className={`adm-toast${toast.bad ? " is-bad" : ""}`} role="status">
          {toast.text}
        </p>
      )}
    </main>
  );
}

const services = (v: BVisit, lang: Parameters<typeof pick3>[1]) => v.services.map((s) => pick3(s.name, lang)).join(" + ");

function VisitSheet({
  v,
  tz,
  busy,
  canBook,
  onClose,
  onStatus,
  onMove,
  onCancel,
  onAgain,
  onClient,
  onSaved,
}: {
  v: BVisit;
  tz: string;
  busy: boolean;
  canBook: boolean;
  onClose: () => void;
  onStatus: (v: BVisit, s: string) => void;
  onMove: () => void;
  onCancel: () => void;
  onAgain: () => void;
  onClient: () => void;
  onSaved: (text: string) => void;
}) {
  const B = useB();
  const may = useMay();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(v.start);
  // a visit still to come can be moved or cancelled (one that took place is history)
  const ahead = v.status === "booked" || v.status === "pending";
  // a visit the client has come to has a right of its own
  const canEdit = may.edit && (!CAME.has(v.status) || may.editCame);
  return (
    <BSheet title={v.clientName} onClose={onClose}>
      <p className="adm-time">
        <b>
          {hm(v.start, tz)}–{hm(v.end, tz)}
        </b>
        <span>{cap(dateWords(date, B.lang))}</span>
      </p>
      {v.clientPhone ? (
        may.call ? (
          <a className="adm-phone" href={`tel:${v.clientPhone}`}>
            {v.clientPhone} · {B.visit.call}
          </a>
        ) : (
          // a masked number: shown, never a link to call
          <span className="adm-phone">{v.clientPhone}</span>
        )
      ) : (
        may.card && <p className="adm-meta">{B.visit.noPhone}</p>
      )}
      {may.card && (
        <button type="button" className="adm-txt lime bx-card-link" onClick={onClient}>
          {B.client.card}
        </button>
      )}
      <NoteEditor
        key={`c-${v.clientId}`}
        label={B.visit.clientNote}
        hint={B.visit.clientNoteHint}
        value={v.clientNote}
        canEdit={may.card && may.clientNote}
        onSave={async (text) => {
          const ok = await saveClientNote(v.clientId, text);
          if (ok) onSaved(B.client.noteSaved);
          return ok;
        }}
      />
      <div className="adm-status" role="group" aria-label={B.visit.setStatus}>
        {(["arrived", "done", "no_show"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={v.status === s} disabled={busy || !canEdit} onClick={() => onStatus(v, v.status === s ? "booked" : s)}>
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
      <NoteEditor
        key={`v-${v.id}`}
        label={B.visit.visitNote}
        value={v.staffNote}
        canEdit={canEdit && may.note}
        onSave={async (text) => {
          const ok = await saveVisitNote(v.id, text);
          if (ok) onSaved(B.client.noteSaved);
          return ok;
        }}
      />
      <p className="adm-meta">
        {B.visit.source[v.source] ?? v.source}
        {v.reminder ? "" : ` · ${B.visit.reminderOff}`}
      </p>
      {((ahead && may.move) || canBook) && (
        <div className="adm-bar-row bx-visit-acts">
          {ahead && may.move && (
            <button type="button" className="adm-btn adm-btn-line adm-btn-auto" onClick={onMove}>
              {B.book.move}
            </button>
          )}
          {canBook && (
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={onAgain}>
              {B.book.again}
            </button>
          )}
        </div>
      )}
      {ahead && may.cancel && (
        <button type="button" className="adm-txt warn bx-cancel" onClick={onCancel}>
          {B.book.cancel}
        </button>
      )}
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

/**
 * The page is the service worker's kept copy (public/b/sw.js): the server
 * made it more than five minutes before it opened. A fresh page from the
 * server, after a refresh, clears it.
 */
const CACHED_MS = 5 * 60_000;
function useCached(serverNow: number): boolean {
  const [cached, setCached] = useState(false);
  useEffect(() => {
    setCached(Date.now() - serverNow > CACHED_MS);
  }, [serverNow]);
  return cached;
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
