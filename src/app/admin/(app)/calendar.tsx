"use client";

/**
 * Renat's calendar. Fewer taps than Altegio:
 *   new visit  a tap on an empty time (from 900px the bar «Новый сеанс»
 *              under the mouse says which), or a phone's «Запись» →
 *              the client's phone → the service → «Записать»;
 *   move       drag it (mouse), or tap it → «Перенести» → tap the new time;
 *   cancel     tap it → «Отменить запись» → «Да, отменить»;
 *   arrived    tap it → «Пришёл».
 * Outside the hours or over a block it asks once more; over another visit it
 * refuses. New online bookings appear by themselves (a refresh a minute).
 *
 * A day shows a column for each barber who works it or has a visit on it
 * (src/lib/admin/journal.ts), from the earliest start to the latest end
 * among them; a day nobody works says so. A week shows one barber's seven
 * days.
 *
 * From 900px it is the journal of the product we follow, measured on the
 * design board (docs/reference-looks.md, «The journal: built»): a white bar
 * of 32px controls (journal-bar.tsx), a 95px band of heads, the time on
 * both sides, 1px a minute, and a visit as a card: the strip says who made
 * it, the body its state. A phone keeps its own bar, day strip and sizes
 * (3½ columns fit, swipe for the rest; a week all on one screen) and takes
 * only the visits' colours.
 *
 * From 900px a visit under the mouse (or the keyboard) shows its card
 * (journal-card.tsx): the client, his numbers, the status chips, the
 * services; a barber's head opens his day's hours (journal-hours.tsx), and
 * a day nobody works offers the schedule and «Добавить сотрудников в день».
 * A click, a drag and the bar snap to the line the scale shows: 15, 10 or 5
 * minutes (ZOOM_STEP); a phone to the salon's booking step.
 *
 * The grid itself is shared with the barber's «Мой день» (journal-grid.tsx).
 *
 * A tapped visit opens in its window (visit-window.tsx): from 900px the
 * three columns of the product we follow, over the dimmed journal; a phone
 * keeps its bottom sheet. So does a new visit (new-visit.tsx): from 900px
 * the same drawer, whose «Перерыв» opens the time-off form here.
 *
 * One markup for both: every place on the grid is given in minutes (--t,
 * --m) and the styles turn them into pixels (--ppm), so nothing here needs
 * to know how wide the screen is.
 *
 * What the login may do comes as `may` (src/lib/admin/calendar.ts): a
 * control it has no right to is not drawn. That is only tidiness: the
 * actions ask the same rights again.
 */
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CalBlock, CalendarData, CalMay, CalVisit } from "@/lib/admin/calendar";
import { daySpan, hhmm, minutesInDay, momentAt, snap, weekStart } from "@/lib/admin/grid";
import { dayNumbers, dayStaff, isVisitState, visitLook, type MineToday } from "@/lib/admin/journal";
import type { AdminOutcome } from "@/lib/admin/visits";
import { shownName } from "@/lib/client-anon";
import { extraText } from "@/lib/slots";
import { addDays } from "@/lib/tz";
import { eur } from "../copy";
import { useA } from "../lang";
import { Ava, CaretIcon, NextIcon, PlusIcon, PrevIcon, StatusMark, TickIcon } from "../icons";
import { addBlock, createVisit, deleteBlock, findClients, updateVisit } from "./actions";
import { isZoom, JournalBar, ZOOM_STEP, type Zoom } from "./journal-bar";
import { VisitCard, type CardCache } from "./journal-card";
import { JournalGrid, minuteAt, PhoneBar, WeekStrip, type GridCol } from "./journal-grid";
import { DayOff, HeadMenu, type HoursMay } from "./journal-hours";
import { JournalMine, type MineLinks } from "./journal-mine";
import { JournalSide } from "./journal-side";
import { Sheet } from "./sheet";
import { MINE_KEY, rememberMine, useTabState, useWide } from "./tab-state";
import { NewVisitDrawer } from "./new-visit";
import { BarNote, cap, fmt, MayProvider, ServicePicker, StaffPicker, sumOf, timeOf, useMay } from "./visit-parts";
import { VisitPanel } from "./visit-window";

// a phone's pixels a minute (admin.css, --ppm): an hour is 72px in a day, 48px in a week. Here only to
// know which visits are too short there for two lines; from 900px it is 1px a minute times the scale.
const PHONE_PX = { day: 1.2, week: 0.8 };
const noon = (date: string) => Date.parse(`${date}T12:00:00Z`);
const MIN = 60_000;

type Col = GridCol;
/** A new visit, or from 900px its time-off form instead («Перерыв»: `off`). */
type Open = { kind: "new"; staffId: string; date: string; min: number; off?: boolean } | { kind: "visit"; id: string } | { kind: "block"; id: string } | null;
type Toast = { text: string; bad?: boolean } | null;
type Ask = { text: string; yes: string; run: () => void } | null;

export type CalendarProps = {
  data: CalendarData;
  view: "day" | "week";
  date: string;
  today: string;
  staffId: string | null;
  now: number;
  step: number;
  /** what the day's product sales come to (a day only) */
  goodsCents: number | null;
  /** what the login may do here (its rights) */
  may: CalMay;
  /** what the login may do with a barber's hours from here: change a day, open «График работы» */
  hours?: HoursMay;
  /**
   * «Мой день | Весь салон» (docs/apps.md, «One app for Renat»): for a login
   * linked to a barber whose column it sees, his column's id, today in it
   * and the links of the panel «Моё»; `first`: the page opens on «Мой
   * день» (what this device chose last). null for everyone else.
   */
  mine?: { staffId: string; today: MineToday; links: MineLinks; first: boolean } | null;
};

/** The calendar, with what the login may do in it handed down to its sheets. */
export function Calendar(props: CalendarProps) {
  return (
    <MayProvider value={props.may}>
      <Journal {...props} />
    </MayProvider>
  );
}

const NO_HOURS: HoursMay = { edit: false, page: false };

function Journal({ data, view, date, today, staffId, now: serverNow, step: bookStep, goodsCents, may, hours = NO_HOURS, mine = null }: CalendarProps) {
  const A = useA();
  const router = useRouter();
  const tz = data.tz;
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState<Open>(null);
  const [moving, setMoving] = useState<CalVisit | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [now, setNow] = useState(serverNow);
  const [ghost, setGhost] = useState<{ col: string; min: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // the tab's own choices, kept from day to day (tab-state.ts). They work from 900px, where their
  // controls are: a phone's styles take no notice of them.
  const [hiddenRaw, setHiddenRaw] = useTabState("adm-jr-hide", "");
  const hidden = useMemo(() => hiddenRaw.split(",").filter(isVisitState), [hiddenRaw]);
  const [zoomRaw, setZoomRaw] = useTabState("adm-jr-zoom", "1");
  const zoom: Zoom = isZoom(zoomRaw) ? zoomRaw : "1";
  const [sideRaw, setSideRaw] = useTabState("adm-jr-side", "0");
  const side = sideRaw === "1";
  // «Мой день | Весь салон», for a login linked to a barber: the tab's choice, and in a new tab what this
  // device chose last (the server read it: MINE_COOKIE); the first time «Мой день». A week is his only
  // while it is his own week.
  const [mineRaw, setMineRaw] = useTabState(MINE_KEY, mine?.first === false ? "0" : "1");
  const mineId = mine?.staffId ?? null;
  const mineOn = !!mineId && mineRaw === "1" && (view === "day" || staffId === mineId);
  // (the width is the styles' business; here it only says which columns the grid works with)
  const wide = useWide();
  // a click and a drag snap to the line the grid shows: from 900px 15, 10 or 5 minutes by the scale
  // (each a 15px line), on a phone the salon's booking step
  const step = wide ? ZOOM_STEP[zoom] : bookStep;
  // what a visit's card read (his numbers), until the journal's data changes
  const cards: CardCache = useMemo(() => new Map(), [data]);

  const cols: Col[] = useMemo(() => {
    if (view === "week") return staffId ? data.dates.map((d) => ({ key: `${staffId}:${d}`, staffId, date: d })) : [];
    // «Мой день»: his column alone, also on a day he is off, so that he can still book himself
    if (mineOn && wide && mineId) return [{ key: `${mineId}:${date}`, staffId: mineId, date }];
    return dayStaff(data, date).map((id) => ({ key: `${id}:${date}`, staffId: id, date }));
  }, [view, staffId, data, date, mineOn, wide, mineId]);

  // from the earliest start to the latest end among the columns shown
  const [lo, hi] = useMemo(() => {
    const shown = new Set(cols.map((c) => c.staffId));
    const spans: { from: number; to: number }[] = [];
    for (const c of cols) for (const [a, b] of data.work[c.staffId]?.[c.date] ?? []) spans.push({ from: a, to: b });
    for (const v of data.visits) if (shown.has(v.staffId)) spans.push({ from: v.start, to: v.end });
    for (const s of data.special) if (shown.has(s.staffId)) spans.push({ from: s.from, to: s.to });
    return daySpan(view === "week" ? data.dates : [date], tz, spans);
  }, [cols, data, view, date, tz]);
  const total = hi - lo;

  // the clock line, and new online bookings, once a minute
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible" && !sheet && !moving && !ask) router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router, sheet, moving, ask]);

  // open at the current time (today) or the start of the working day
  useEffect(() => {
    const el = scroller.current;
    const col = el?.querySelector<HTMLElement>("[data-col]");
    if (!el || !col) return;
    const firstWork = Math.min(...cols.flatMap((c) => (data.work[c.staffId]?.[c.date] ?? []).map(([a]) => minutesInDay(a, c.date, tz))), Infinity);
    const target = cols.some((c) => c.date === today) ? minutesInDay(serverNow, today, tz) - 60 : Number.isFinite(firstWork) ? firstWork - 30 : lo;
    el.scrollTop = Math.max(0, ((target - lo) * col.getBoundingClientRect().height) / total);
    // only on the first render of this day or week, and when «Мой день» changes the hours shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOn && wide]);

  // another scale: the time that was at the top stays there
  const keepTop = useRef<number | null>(null);
  const setZoom = (z: Zoom) => {
    const el = scroller.current;
    keepTop.current = el && el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : null;
    setZoomRaw(z);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && keepTop.current != null) el.scrollTop = keepTop.current * el.scrollHeight;
    keepTop.current = null;
  }, [zoom]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (d: string, v = view, s = staffId) => {
    const p = new URLSearchParams({ d });
    if (v === "week") {
      p.set("v", "week");
      if (s) p.set("s", s);
    }
    startTransition(() => router.push(`/admin?${p}`));
  };
  /** «Мой день | Весь салон». In another barber's week, «Мой день» is his own week. */
  const pickMine = (on: boolean) => {
    setMineRaw(on ? "1" : "0");
    rememberMine(on);
    if (on && view === "week" && mineId && staffId !== mineId) go(date, "week", mineId);
  };

  const problemText = (r: Extract<AdminOutcome, { ok: false }>) =>
    r.code === "overlap" ? A.visit.overlap : r.code === "not_offered" ? A.visit.notOffered : r.code === "invalid" ? A.visit.invalid(r.field) : r.code === "forbidden" ? A.rights.refused : A.error;

  /** Move a visit; asks once more outside the hours or over a block. */
  const moveTo = (v: CalVisit, sid: string, start: number) => {
    const run = async (force: boolean) => {
      const r = await updateVisit(v.id, { staffId: sid, start, force });
      if (r.ok) {
        setMoving(null);
        setToast({ text: `${A.cal.moved}: ${data.staff.find((s) => s.id === sid)?.name ?? ""}, ${timeOf(tz, r.start)}` });
      } else if (r.code === "outside_hours" || r.code === "time_off") {
        setAsk({ text: r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours, yes: A.visit.anywayMove, run: () => void run(true) });
      } else setToast({ text: problemText(r), bad: true });
    };
    if (sid === v.staffId && start === v.start) {
      setMoving(null);
      return;
    }
    void run(false);
  };

  const onColumnClick = (c: Col, e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.justDropped) return;
    const m = snap(minuteAt(e.currentTarget, e.clientY, lo, hi), step);
    if (m < lo || m >= hi) return;
    if (moving) {
      moveTo(moving, c.staffId, momentAt(c.date, m, tz));
      return;
    }
    if (!may.create && !may.schedule) return;
    setSheet({ kind: "new", staffId: c.staffId, date: c.date, min: m });
  };

  /** «Запись»: the first free half hour from now (or from the morning), any barber in order. */
  const nextFree = (): { staffId: string; date: string; min: number } => {
    const active = cols.filter((c) => data.staff.find((s) => s.id === c.staffId)?.active !== false);
    const dates = [...new Set(active.map((c) => c.date))].filter((d) => d >= today || view === "day");
    const fromMin = (d: string) => (d === today ? Math.ceil(minutesInDay(now, d, tz) / bookStep) * bookStep : 0);
    for (const d of dates) {
      for (let m = fromMin(d); m <= 24 * 60 - 30; m += bookStep) {
        const t = momentAt(d, m, tz);
        const e = t + 30 * MIN;
        for (const c of active) {
          if (c.date !== d) continue;
          const open = (data.work[c.staffId]?.[d] ?? []).some(([a, b]) => a <= t && e <= b);
          if (!open) continue;
          const busy = data.visits.some((v) => v.staffId === c.staffId && v.start < e && v.blockedUntil > t) || data.blocks.some((b) => b.staffId === c.staffId && b.from < e && b.to > t);
          if (!busy) return { staffId: c.staffId, date: d, min: m };
        }
      }
    }
    // nothing free, or a day nobody works: the first barber, and the form asks before it books outside his hours
    const d = view === "week" ? (data.dates.includes(today) ? today : data.dates[0]) : date;
    const first = active[0]?.staffId ?? cols[0]?.staffId ?? data.staff.find((s) => s.active)?.id ?? data.staff[0]?.id ?? "";
    return { staffId: first, date: d, min: d === today ? Math.min(fromMin(d), 23 * 60) : 10 * 60 };
  };

  // drag with a mouse (desktop); fingers use «Перенести»
  const dragRef = useRef<{ v: CalVisit | null; x: number; y: number; offset: number; on: boolean; justDropped: boolean }>({ v: null, x: 0, y: 0, offset: 0, on: false, justDropped: false });
  const colAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-col]");
    return el ? { el, col: cols.find((c) => c.key === el.dataset.col) ?? null } : null;
  };
  const onVisitPointerDown = (v: CalVisit, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !may.move) return;
    const colEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-col]");
    if (!colEl) return;
    dragRef.current = { v, x: e.clientX, y: e.clientY, offset: minuteAt(colEl, e.clientY, lo, hi) - minutesInDay(v.start, colEl.dataset.date!, tz), on: false, justDropped: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.v) return;
      if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.on = true;
      const hit = colAt(e.clientX, e.clientY);
      if (!hit?.col) return setGhost(null);
      setGhost({ col: hit.col.key, min: snap(minuteAt(hit.el, e.clientY, lo, hi) - d.offset + step / 2, step) });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.v) return;
      const v = d.v;
      d.v = null;
      if (!d.on) return;
      d.justDropped = true;
      setTimeout(() => (dragRef.current.justDropped = false), 50);
      setGhost(null);
      const hit = colAt(e.clientX, e.clientY);
      if (!hit?.col) return;
      const m = snap(minuteAt(hit.el, e.clientY, lo, hi) - d.offset + step / 2, step);
      moveTo(v, hit.col.staffId, momentAt(hit.col.date, m, tz));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const staffById = (id: string) => data.staff.find((s) => s.id === id);
  const visitOpen = sheet?.kind === "visit" ? data.visits.find((v) => v.id === sheet.id) : undefined;
  const blockOpen = sheet?.kind === "block" ? data.blocks.find((b) => b.id === sheet.id) : undefined;
  // from 900px a new visit is the visit window's drawer (new-visit.tsx); its «Перерыв», and a login
  // that may only block time, have the sheet's time-off form
  const newOpen = sheet?.kind === "new" ? sheet : null;
  const newDrawer = !!newOpen && wide && may.create && !newOpen.off;
  // a sheet is the panel on the right from 900px, and the page gives it room; the visit window
  // (visit-window.tsx) and the new visit's lie over the dimmed page instead, the right panel and all
  const panel = !!((sheet && sheet.kind !== "visit" && !newDrawer) || ask);

  const dayFmt = (d: string, o: Intl.DateTimeFormatOptions) => fmt(A.intl, tz, { ...o, timeZone: "UTC" }).format(noon(d));
  const dayText = dayFmt(date, { day: "numeric", month: "long" });
  const title = view === "week" ? `${dayFmt(data.dates[0], { day: "numeric", month: "short" })} – ${dayFmt(data.dates[6], { day: "numeric", month: "short" })}` : cap(dayFmt(date, { weekday: "short", day: "numeric", month: "long" }));
  // the bar from 900px: «19 ноября, четверг», in the login's language
  const wideTitle = view === "week" ? title : `${dayText}, ${dayFmt(date, { weekday: "long" })}`;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const todayInView = cols.some((c) => c.date === today);
  // a phone's dark bar: «Пт, 20 ноября» for a day («Пт, 20 нояб.» on a narrow phone), «Ноябрь» for a week
  // (its days are in the strip below)
  const phoneTitle = view === "week" ? cap(dayFmt(date, { month: "long" })) : cap(dayFmt(date, { weekday: "short", day: "numeric", month: "long" }));
  const phoneTitleShort = view === "week" ? phoneTitle : cap(dayFmt(date, { weekday: "short", day: "numeric", month: "short" }));
  // «Сегодня» only when today is not one tap away already
  const todayNear = view === "day" ? strip.includes(today) : todayInView;
  // «Запись» (a phone's): it works on a day nobody is at work too, the form picks the barber
  const add = may.create && data.staff.length > 0 && (view === "day" || cols.length > 0) && !moving ? () => setSheet({ kind: "new", ...nextFree() }) : null;
  const say = (text: string, bad?: boolean) => setToast({ text, bad });
  const longDay = (d: string) => cap(dayFmt(d, { weekday: "long", day: "numeric", month: "long" }));

  /** A day's head: the barber, his day's visits and load (a phone), his label (from 900px), and from 900px his hours' menu. */
  const dayHead = (c: Col) => {
    const s = staffById(c.staffId);
    const mineV = data.visits.filter((v) => v.staffId === c.staffId && minutesInDay(v.start, c.date, tz) >= 0 && minutesInDay(v.start, c.date, tz) < 1440);
    const sum = mineV.reduce((n, v) => n + v.totalCents, 0);
    const work = data.work[c.staffId]?.[c.date] ?? [];
    const workMin = work.reduce((n, [a, b]) => n + (b - a) / MIN, 0);
    const busyMin = mineV.filter((v) => v.status !== "no_show").reduce((n, v) => n + (v.end - v.start) / MIN, 0);
    const load = workMin ? Math.min(100, Math.round((busyMin / workMin) * 100)) : 0;
    // (a barber with no hours has a column for a visit, or for special time: then he is not off)
    const line = mineV.length ? `${A.cal.visits(mineV.length)} · ${eur(sum)}` : work.length || data.special.some((x) => x.staffId === c.staffId) ? "—" : A.cal.closed;
    const own = c.staffId === mineId;
    // «Мой день»: his own head also says his hours, «Барбер · 10:00–19:00»
    const hoursLine = mineOn && own ? work.map(([a, b]) => `${timeOf(tz, a)}–${timeOf(tz, b)}`).join(", ") || A.cal.closed : "";
    const inner = (
      <>
        <Ava src={s?.photoUrl} name={s?.name ?? "?"} className="cal-ava" />
        <span className="cal-who2">
          <b>{s?.name}</b>
          {/* a phone: the day's visits and their sum; from 900px the label under the name, as the journal's heads */}
          <small className="only-narrow">{line}</small>
          <small className="jr-role only-wide">{[A.pick(s?.role), hoursLine].filter(Boolean).join(" · ")}</small>
          <span className="cal-load only-narrow" aria-hidden="true">
            <i style={{ width: `${load}%` }} />
          </span>
        </span>
      </>
    );
    return (
      <div key={c.key} className="cal-head" data-mine={own ? "" : undefined}>
        {wide && s ? (
          <HeadMenu staff={s} date={c.date} today={today} tz={tz} work={work} dayText={dayFmt(c.date, { day: "numeric", month: "long" })} may={hours} onSaid={say}>
            {inner}
            <CaretIcon size={10} />
          </HeadMenu>
        ) : (
          inner
        )}
      </div>
    );
  };
  const weekHead = (c: Col) => (
    <button key={c.key} type="button" className={`cal-head${c.date === today ? " is-today" : ""}`} onClick={() => go(c.date, "day")}>
      <b>{cap(dayFmt(c.date, { weekday: "short" }))}</b>
      <small className="only-narrow">{Number(c.date.slice(8))}</small>
      <small className="jr-role only-wide">{dayFmt(c.date, { day: "numeric", month: "long" })}</small>
    </button>
  );
  const dragged = dragRef.current.v;

  return (
    <div
      className={`cal${view === "week" ? " is-week" : ""}${pending ? " is-pending" : ""}${panel ? " has-panel" : ""}${mineOn ? " is-mine" : ""}${hidden.map((k) => ` hide-${k}`).join("")}`}
      style={{ "--zoom": zoom } as React.CSSProperties}
    >
      {/* A phone's bar, as Altegio's own phone app (Dim, 20.11.2026, option D): the date with a ▾
          in the dark bar on top, which it lies over, and «День | Неделя»; the week floats at the
          bottom above the tabs. From 900px the journal's own bar (journal-bar.tsx). */}
      <PhoneBar className="only-narrow" title={phoneTitle} titleShort={phoneTitleShort} date={date} pickLabel={A.cal.pickDate} onPick={(d) => go(d)} today={todayNear ? null : { label: A.cal.today, go: () => go(today) }}>
        <div className="adm-seg" role="group" aria-label={A.cal.view}>
          <button type="button" aria-pressed={view === "day"} onClick={() => view !== "day" && go(date, "day")}>
            {A.cal.day}
          </button>
          <button type="button" aria-pressed={view === "week"} onClick={() => view !== "week" && go(date, "week")}>
            {A.cal.week}
          </button>
        </div>
      </PhoneBar>
      {view === "week" && (
        <div className="adm-who cal-who only-narrow" role="group" aria-label={A.visit.barber}>
          {data.staff.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === staffId} onClick={() => s.id !== staffId && go(date, "week", s.id)}>
              <Ava src={s.photoUrl} name={s.name} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}
      {view === "day" ? (
        // the week of the day shown; a swipe sideways is the week before or after
        <WeekStrip
          className="only-narrow"
          days={strip}
          date={date}
          today={today}
          label={A.cal.days}
          dayName={(_, i) => A.staff.weekdays[i]}
          dayLabel={longDay}
          onPick={(d) => go(d, "day")}
          onSwipe={(by) => go(addDays(date, 7 * by), "day")}
        />
      ) : (
        <nav className="cal-strip is-weeks only-narrow" aria-label={A.cal.days}>
          <button type="button" aria-label={A.cal.prev} onClick={() => go(addDays(date, -7))}>
            <PrevIcon />
          </button>
          <b>{title}</b>
          <button type="button" aria-label={A.cal.next} onClick={() => go(addDays(date, 7))}>
            <NextIcon />
          </button>
        </nav>
      )}
      {add && (
        <button type="button" className="cal-add only-narrow" aria-label={A.visit.new} onClick={add}>
          <PlusIcon size={view === "week" ? 22 : 24} />
          <span>{A.cal.add}</span>
        </button>
      )}
      <JournalBar
        view={view}
        date={date}
        today={today}
        title={wideTitle}
        dayText={dayText}
        staff={data.staff}
        staffId={staffId}
        numbers={view === "day" && may.stats && goodsCents != null ? { ...dayNumbers(data.visits, date, tz), goodsCents } : null}
        sell={may.sell}
        hidden={hidden}
        onHidden={(next) => setHiddenRaw(next.join(","))}
        zoom={zoom}
        onZoom={setZoom}
        side={side}
        onSide={() => setSideRaw(side ? "0" : "1")}
        mine={mineId ? { on: mineOn, staffId: mineId, pick: pickMine } : null}
        go={go}
      />
      {moving && (
        <div className="cal-moving" role="status">
          <span>{A.cal.moving(shownName(moving.clientName, A.clients.anonName))}</span>
          <button type="button" onClick={() => setMoving(null)}>
            {A.cancel}
          </button>
        </div>
      )}

      <div className="cal-body">
        {!cols.length ? (
          data.staff.length > 0 && view === "day" ? (
            // nobody works this day and nobody is booked
            <DayOff staff={data.staff} date={date} dayText={dayText} longDay={longDay(date)} may={hours} onSaid={say} />
          ) : (
            <p className="adm-wait">{A.cal.noStaff}</p>
          )
        ) : (
          <JournalGrid
            scrollRef={scroller}
            cols={cols}
            lo={lo}
            hi={hi}
            tz={tz}
            today={today}
            now={now}
            work={(c) => data.work[c.staffId]?.[c.date] ?? []}
            visits={data.visits}
            blocks={data.blocks}
            special={data.special}
            shortMin={40 / PHONE_PX[view]}
            step={step}
            wideParts
            mineId={mineId}
            target={!!moving}
            head={view === "week" ? weekHead : dayHead}
            visitClass={(v) => `${moving?.id === v.id ? "is-moving" : ""}${visitOpen?.id === v.id ? " is-open" : ""}`}
            visitLabel={(v) => `${timeOf(tz, v.start)}–${timeOf(tz, v.end)}, ${shownName(v.clientName, A.clients.anonName)}, ${A.visit.status[v.status] ?? v.status}`}
            visitBody={(v) => (
              <>
                <span className="t">
                  <span>
                    {timeOf(tz, v.start)}—{timeOf(tz, v.end)}
                  </span>
                  {v.source === "online" && <i className="dot" title={A.visit.source.online} />}
                  <StatusMark status={v.status} confirmed={v.confirmed} />
                </span>
                <b>{shownName(v.clientName, A.clients.anonName)}</b>
                {/* the phone is on the card from 900px only, for the logins that already see it in the visit */}
                {v.clientPhone && <span className="p">{v.clientPhone}</span>}
                <span className="s">{v.services.map((x) => A.pick(x.name)).join(", ")}</span>
              </>
            )}
            blockBody={(b) => {
              const kind = A.block.kinds[b.kind] ?? b.kind;
              const note = b.note ? ` · ${b.note}` : "";
              return (
                <>
                  <span className="only-narrow">
                    {kind}
                    {note}
                  </span>
                  {/* from 900px a break says its times, as the journal's; a vacation or a sick day its name */}
                  <span className="only-wide">
                    {b.kind === "block" ? `${timeOf(tz, b.from)}—${timeOf(tz, b.to)}` : kind}
                    {note}
                  </span>
                </>
              );
            }}
            onBlock={(b) => !moving && setSheet({ kind: "block", id: b.id })}
            // the window as it was set, «+20 €» or «+50 %»; a visit in it shows its own money
            specialBody={(x) => <span>{extraText(x)}</span>}
            onColumn={onColumnClick}
            onVisitDown={onVisitPointerDown}
            onVisit={(v) => {
              if (dragRef.current.justDropped) return;
              if (moving) {
                if (moving.id !== v.id) setToast({ text: A.visit.overlap, bad: true });
                return;
              }
              setSheet({ kind: "visit", id: v.id });
            }}
            ghost={ghost && dragged ? { col: ghost.col, min: ghost.min, len: (dragged.end - dragged.start) / MIN } : null}
            // from 900px: the bar «12:00 Новый сеанс» under the mouse, and a visit's card on hover
            slotLabel={wide && !moving && !ghost && (may.create || may.schedule) ? A.cal.newSlot : null}
            card={
              wide && !moving && !ghost && !sheet
                ? (v) => <VisitCard v={v} tz={tz} staffName={staffById(v.staffId)?.name ?? ""} cache={cards} onOpen={() => setSheet({ kind: "visit", id: v.id })} onSay={say} />
                : null
            }
          />
        )}
        {/* «Мой день» has its own panel; the clients' one is back with «Весь салон» */}
        {mineOn && mine ? <JournalMine today={mine.today} links={mine.links} now={now} tz={tz} /> : side && <JournalSide tz={tz} />}
      </div>

      {newOpen &&
        (newDrawer ? (
          <NewVisitDrawer
            key={`${newOpen.staffId}:${newOpen.date}:${newOpen.min}`}
            data={data}
            staffId={newOpen.staffId}
            date={newOpen.date}
            min={newOpen.min}
            onClose={() => setSheet(null)}
            onDone={(text) => {
              setSheet(null);
              setToast({ text });
            }}
            onTimeOff={may.schedule ? () => setSheet({ ...newOpen, off: true }) : null}
          />
        ) : (
          <NewSheet
            key={`${newOpen.staffId}:${newOpen.date}:${newOpen.min}:${newOpen.off ? "off" : ""}`}
            data={data}
            staffId={newOpen.staffId}
            date={newOpen.date}
            min={newOpen.min}
            off={!!newOpen.off}
            // from 900px «Запись» is the drawer again
            onVisit={wide ? () => setSheet({ ...newOpen, off: false }) : null}
            onClose={() => setSheet(null)}
            onDone={(text) => {
              setSheet(null);
              setToast({ text });
            }}
          />
        ))}
      {visitOpen && (
        <VisitPanel
          key={visitOpen.id}
          v={visitOpen}
          data={data}
          onClose={() => setSheet(null)}
          onMove={() => {
            setMoving(visitOpen);
            setSheet(null);
          }}
          onDone={(text) => {
            setSheet(null);
            setToast({ text });
          }}
        />
      )}
      {blockOpen && (
        <BlockSheet
          key={blockOpen.id}
          b={blockOpen}
          tz={tz}
          staffName={staffById(blockOpen.staffId)?.name ?? ""}
          onClose={() => setSheet(null)}
          onDone={(text) => {
            setSheet(null);
            setToast({ text });
          }}
        />
      )}
      {ask && (
        <Sheet
          alert
          title={A.visit.move}
          onClose={() => setAsk(null)}
          bar={
            <div className="adm-bar-row">
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={() => setAsk(null)}>
                {A.cancel}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-lime adm-btn-auto"
                onClick={() => {
                  const run = ask.run;
                  setAsk(null);
                  run();
                }}
              >
                {ask.yes}
              </button>
            </div>
          }
        >
          <p>{ask.text}</p>
        </Sheet>
      )}
      {toast && (
        <p className={`adm-toast${toast.bad ? " is-bad" : ""}`} role="status">
          {toast.text}
        </p>
      )}
    </div>
  );
}

/* ---------- sheets ---------- */

/**
 * A new visit or blocked time: a phone's bottom sheet. From 900px the new
 * visit is the drawer (new-visit.tsx) and this sheet is only its time-off
 * form (`off`), where «Запись» goes back to the drawer (`onVisit`).
 */
function NewSheet({
  data,
  staffId,
  date,
  min,
  off = false,
  onVisit = null,
  onClose,
  onDone,
}: {
  data: CalendarData;
  staffId: string;
  date: string;
  min: number;
  off?: boolean;
  onVisit?: (() => void) | null;
  onClose: () => void;
  onDone: (t: string) => void;
}) {
  const A = useA();
  const may = useMay();
  const tz = data.tz;
  const [tab, setTabRaw] = useState<"visit" | "block">(may.create && !off ? "visit" : "block");
  const setTab = (t: "visit" | "block") => (t === "visit" && onVisit ? onVisit() : setTabRaw(t));
  const [sid, setSid] = useState(staffId);
  const [day, setDay] = useState(date);
  const [time, setTime] = useState(hhmm(min));
  const [picked, setPicked] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [hits, setHits] = useState<Awaited<ReturnType<typeof findClients>>>([]);
  const [note, setNote] = useState("");
  const [sms, setSms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const key = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  // block
  const [kind, setKind] = useState("block");
  const [bFrom, setBFrom] = useState(hhmm(min));
  const [bTo, setBTo] = useState(hhmm(Math.min(min + 60, 23 * 60 + 45)));
  const [bToDay, setBToDay] = useState(date);
  const [bNote, setBNote] = useState("");

  // look up clients as Renat types (a phone or a name)
  const lookFor = client || !may.pickClient ? "" : phone.replace(/\D/g, "").length >= 3 ? phone : name.trim().length >= 2 ? name : "";
  useEffect(() => {
    if (!lookFor) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      findClients(lookFor).then((r) => live && setHits(r), () => live && setHits([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [lookFor]);

  const total = sumOf(data.services, sid, picked);
  const startMin = /^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : min;
  const hasClient = !!client || !!phone.trim() || !!name.trim();

  const book = async (force: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await createVisit({
        staffId: sid,
        start: momentAt(day, startMin, tz),
        serviceIds: picked,
        clientId: client?.id ?? null,
        // a client that is picked is sent by his id alone (his phone here may be a masked one)
        name: client ? "" : name,
        phone: client ? "" : phone,
        comment: "",
        staffNote: note,
        smsReminder: sms,
        idempotencyKey: key.current,
        force,
      });
      if (r.ok) return onDone(`${A.cal.booked}: ${timeOf(tz, r.start)}`);
      if (r.code === "outside_hours" || r.code === "time_off") setWarn(r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours);
      else setProblem(r.code === "overlap" ? A.visit.overlap : r.code === "not_offered" ? A.visit.notOffered : r.code === "invalid" ? A.visit.invalid(r.field) : r.code === "forbidden" ? A.rights.refused : A.error);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const multi = kind !== "block";
      const from = multi ? momentAt(day, 0, tz) : momentAt(day, Number(bFrom.slice(0, 2)) * 60 + Number(bFrom.slice(3)), tz);
      const to = multi ? momentAt(addDays(bToDay < day ? day : bToDay, 1), 0, tz) : momentAt(day, Number(bTo.slice(0, 2)) * 60 + Number(bTo.slice(3)), tz);
      const r = await addBlock({ staffId: sid, from, to, kind, note: bNote });
      if (r.ok) return onDone(r.visitsInside ? A.block.visitsInside(r.visitsInside) : A.cal.blocked);
      setProblem(A.visit.invalid(r.field));
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const visitBar = (
    <>
      <BarNote problem={problem} warn={warn} />
      {warn ? (
        <div className="adm-bar-row">
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={() => setWarn(null)}>
            {A.cancel}
          </button>
          <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void book(true)}>
            {A.visit.anyway}
          </button>
        </div>
      ) : (
        <div className="adm-bar-row">
          <div className="sum">
            {picked.length ? (
              <>
                <b>{eur(total.cents)}</b>
                <small>
                  {A.mins(total.minutes)} · {hhmm(startMin)}–{hhmm(startMin + total.minutes)}
                </small>
              </>
            ) : (
              <small>{A.visit.pickServices}</small>
            )}
          </div>
          <button type="button" className="adm-btn adm-btn-lime" disabled={busy || !picked.length || !hasClient || (!client && !may.newClient)} onClick={() => void book(false)}>
            {A.visit.book}
          </button>
        </div>
      )}
    </>
  );

  const blockBar = (
    <>
      <BarNote problem={problem} warn={null} />
      <button type="button" className="adm-btn adm-btn-lime" disabled={busy} onClick={() => void block()}>
        {A.block.save}
      </button>
    </>
  );

  return (
    <Sheet title={tab === "visit" ? A.visit.new : A.block.save} onClose={onClose} bar={tab === "visit" ? visitBar : blockBar}>
      {may.create && may.schedule && (
        <div className="adm-seg adm-seg-wide" role="group">
          <button type="button" aria-pressed={tab === "visit"} onClick={() => setTab("visit")}>
            {A.visit.tabVisit}
          </button>
          <button type="button" aria-pressed={tab === "block"} onClick={() => setTab("block")}>
            {A.visit.tabBlock}
          </button>
        </div>
      )}

      <StaffPicker
        data={data}
        value={sid}
        onChange={(id) => {
          setSid(id);
          setPicked((p) => p.filter((x) => data.services.find((s) => s.id === x)?.offers[id]));
        }}
      />

      {tab === "visit" ? (
        <>
          <div className="adm-row">
            <label className="adm-field">
              <span>{A.visit.date}</span>
              <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </label>
            <label className="adm-field">
              <span>{A.visit.time}</span>
              <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>

          {client ? (
            <div className="adm-field">
              <span>{A.visit.client}</span>
              <div className="adm-client">
                <span className="n">
                  <b>{client.name}</b>
                  <small>{client.phone ?? A.visit.walkIn}</small>
                </span>
                <button type="button" className="adm-txt lime" onClick={() => setClient(null)}>
                  {A.visit.pickAnother}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* with no right to add a client, the two fields only look one up */}
              {!may.newClient && <p className="adm-meta">{A.rights.pickOnly}</p>}
              <label className="adm-field">
                <span>{A.visit.phone}</span>
                <input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              {hits.length > 0 && (
                <ul className="adm-hits">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button type="button" onClick={() => setClient({ id: h.id, name: h.name, phone: h.phone })}>
                        <span className="n">
                          <b>{h.name}</b>
                          <small>
                            {h.phone ?? A.visit.walkIn} · {A.visit.visitsN(h.visits)}
                          </small>
                        </span>
                        <TickIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="adm-field">
                <span>{hits.length ? `${A.visit.newClient}: ${A.visit.name.toLowerCase()}` : A.visit.name}</span>
                <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </>
          )}

          <div className="adm-field">
            <span>{A.visit.services}</span>
            <ServicePicker services={data.services} staffId={sid} picked={picked} onChange={setPicked} />
          </div>

          <label className="adm-field">
            <span>{A.visit.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
          <label className="adm-toggle">
            <span>{A.visit.sms}</span>
            <input type="checkbox" role="switch" className="adm-sw" checked={sms} onChange={(e) => setSms(e.target.checked)} />
          </label>
        </>
      ) : (
        <>
          <div className="adm-seg adm-seg-wide" role="group">
            {Object.entries(A.block.kinds).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          {kind === "block" ? (
            <div className="adm-row">
              <label className="adm-field">
                <span>{A.visit.date}</span>
                <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              </label>
              <label className="adm-field">
                <span>{A.block.from}</span>
                <input type="time" value={bFrom} step={300} onChange={(e) => setBFrom(e.target.value)} />
              </label>
              <label className="adm-field">
                <span>{A.block.to}</span>
                <input type="time" value={bTo} step={300} onChange={(e) => setBTo(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="adm-row">
              <label className="adm-field">
                <span>{A.block.from}</span>
                <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              </label>
              <label className="adm-field">
                <span>{A.block.to}</span>
                <input type="date" value={bToDay < day ? day : bToDay} min={day} onChange={(e) => e.target.value && setBToDay(e.target.value)} />
              </label>
            </div>
          )}
          <label className="adm-field">
            <span>{A.block.note}</span>
            <input value={bNote} onChange={(e) => setBNote(e.target.value)} maxLength={300} />
          </label>
        </>
      )}
    </Sheet>
  );
}

function BlockSheet({ b, tz, staffName, onClose, onDone }: { b: CalBlock; tz: string; staffName: string; onClose: () => void; onDone: (t: string) => void }) {
  const A = useA();
  const may = useMay();
  const [busy, setBusy] = useState(false);
  const f = fmt(A.intl, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <Sheet
      title={A.block.kinds[b.kind] ?? b.kind}
      onClose={onClose}
      bar={
        !may.schedule ? undefined : <button
          type="button"
          className="adm-btn adm-btn-warn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await deleteBlock(b.id)) onDone(A.cal.unblocked);
            else setBusy(false);
          }}
        >
          {A.block.remove}
        </button>
      }
    >
      <p className="adm-time">
        <b>
          {f.format(b.from)} – {f.format(b.to)}
        </b>
        <span>{staffName}</span>
      </p>
      {b.note && <p className="adm-note">{b.note}</p>}
    </Sheet>
  );
}
