"use client";

/**
 * Renat's calendar. Fewer taps than Altegio:
 *   new visit  tap an empty time → pick the service → phone → «Записать»;
 *   move       drag it (mouse), or tap it → «Перенести» → tap the new time;
 *   cancel     tap it → «Отменить запись» → «Да»;
 *   arrived    tap it → «Пришёл».
 * Outside the hours or over a block it asks once more; over another visit it
 * refuses. New online bookings appear by themselves (a refresh a minute).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CalBlock, CalendarData, CalService, CalVisit } from "@/lib/admin/calendar";
import { gridBounds, hhmm, minutesInDay, momentAt, snap } from "@/lib/admin/grid";
import type { AdminOutcome } from "@/lib/admin/visits";
import { addDays } from "@/lib/tz";
import { A, eur, mins, ru } from "../copy";
import { addBlock, cancelVisit, createVisit, deleteBlock, findClients, setVisitStatus, updateVisit } from "./actions";

const PX = 1.2; // pixels per minute: an hour is 72 px
const fmt = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...o });
const timeOf = (tz: string, ms: number) => fmt(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const noon = (date: string) => Date.parse(`${date}T12:00:00Z`);

type Col = { key: string; staffId: string; date: string };
type Sheet = { kind: "new"; staffId: string; date: string; min: number } | { kind: "visit"; id: string } | { kind: "block"; id: string } | null;
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
  demo: boolean;
};

export function Calendar({ data, view, date, today, staffId, now: serverNow, step, demo }: CalendarProps) {
  const router = useRouter();
  const tz = data.tz;
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [moving, setMoving] = useState<CalVisit | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [now, setNow] = useState(serverNow);
  const [ghost, setGhost] = useState<{ col: string; min: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const cols: Col[] = useMemo(
    () =>
      view === "week"
        ? staffId
          ? data.dates.map((d) => ({ key: `${staffId}:${d}`, staffId, date: d }))
          : []
        : data.staff.map((s) => ({ key: `${s.id}:${date}`, staffId: s.id, date })),
    [view, staffId, data.dates, data.staff, date],
  );

  const [lo, hi] = useMemo(() => {
    const spans: { from: number; to: number }[] = [];
    for (const c of cols) for (const [a, b] of data.work[c.staffId]?.[c.date] ?? []) spans.push({ from: a, to: b });
    for (const v of data.visits) spans.push({ from: v.start, to: v.blockedUntil });
    for (const s of data.special) spans.push({ from: s.from, to: s.to });
    return gridBounds(view === "week" ? data.dates : [date], tz, spans);
  }, [cols, data, view, date, tz]);
  const height = (hi - lo) * PX;
  const yOf = useCallback((ms: number, d: string) => (minutesInDay(ms, d, tz) - lo) * PX, [tz, lo]);

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
    if (!el) return;
    const firstWork = Math.min(...cols.flatMap((c) => (data.work[c.staffId]?.[c.date] ?? []).map(([a]) => minutesInDay(a, c.date, tz))), Infinity);
    const target = cols.some((c) => c.date === today) ? minutesInDay(serverNow, today, tz) - 60 : Number.isFinite(firstWork) ? firstWork - 30 : 9 * 60;
    el.scrollTop = Math.max(0, (target - lo) * PX);
    // only on the first render of this day or week
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const problemText = (r: Extract<AdminOutcome, { ok: false }>) =>
    r.code === "overlap" ? A.visit.overlap : r.code === "not_offered" ? A.visit.notOffered : r.code === "invalid" ? A.visit.invalid(r.field) : A.error;

  /** Move a visit; asks once more outside the hours or over a block. */
  const moveTo = (v: CalVisit, sid: string, start: number) => {
    const run = async (force: boolean) => {
      const r = await updateVisit(v.id, { staffId: sid, start, force });
      if (r.ok) {
        setMoving(null);
        setToast({ text: `${A.cal.moved}: ${timeOf(tz, r.start)}` });
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

  const minuteAt = (el: HTMLElement, clientY: number) => lo + (clientY - el.getBoundingClientRect().top) / PX;

  const onColumnClick = (c: Col, e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.justDropped) return;
    const m = snap(minuteAt(e.currentTarget, e.clientY), step);
    if (m < lo || m >= hi) return;
    if (moving) {
      moveTo(moving, c.staffId, momentAt(c.date, m, tz));
      return;
    }
    setSheet({ kind: "new", staffId: c.staffId, date: c.date, min: m });
  };

  // drag with a mouse (desktop); fingers use «Перенести»
  const dragRef = useRef<{ v: CalVisit | null; x: number; y: number; offset: number; on: boolean; justDropped: boolean }>({ v: null, x: 0, y: 0, offset: 0, on: false, justDropped: false });
  const colAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-col]");
    return el ? { el, col: cols.find((c) => c.key === el.dataset.col) ?? null } : null;
  };
  const onVisitPointerDown = (v: CalVisit, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const colEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-col]");
    if (!colEl) return;
    dragRef.current = { v, x: e.clientX, y: e.clientY, offset: minuteAt(colEl, e.clientY) - minutesInDay(v.start, colEl.dataset.date!, tz), on: false, justDropped: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.v) return;
      if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.on = true;
      const hit = colAt(e.clientX, e.clientY);
      if (!hit?.col) return setGhost(null);
      setGhost({ col: hit.col.key, min: snap(minuteAt(hit.el, e.clientY) - d.offset + step / 2, step) });
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
      const m = snap(minuteAt(hit.el, e.clientY) - d.offset + step / 2, step);
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

  const title =
    view === "week"
      ? `${fmt(tz, { day: "numeric", month: "short", timeZone: "UTC" }).format(noon(data.dates[0]))} – ${fmt(tz, { day: "numeric", month: "short", timeZone: "UTC" }).format(noon(data.dates[6]))}`
      : cap(fmt(tz, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(noon(date)));

  return (
    <div className={`cal${pending ? " is-pending" : ""}`}>
      {demo && <p className="adm-demo">{A.demo}</p>}
      <div className="cal-bar">
        <div className="cal-nav">
          <button type="button" className="adm-icon" aria-label={A.cal.prev} onClick={() => go(addDays(date, view === "week" ? -7 : -1))}>
            ‹
          </button>
          <label className="cal-title">
            <span>{title}</span>
            <input type="date" value={date} aria-label={A.cal.pickDate} onChange={(e) => e.target.value && go(e.target.value)} />
          </label>
          <button type="button" className="adm-icon" aria-label={A.cal.next} onClick={() => go(addDays(date, view === "week" ? 7 : 1))}>
            ›
          </button>
        </div>
        <div className="cal-tools">
          {!cols.some((c) => c.date === today) && (
            <button type="button" className="adm-chip" onClick={() => go(today)}>
              {A.cal.today}
            </button>
          )}
          <div className="adm-seg" role="group">
            <button type="button" aria-pressed={view === "day"} onClick={() => go(date, "day")}>
              {A.cal.day}
            </button>
            <button type="button" aria-pressed={view === "week"} onClick={() => go(date, "week")}>
              {A.cal.week}
            </button>
          </div>
        </div>
      </div>
      {view === "week" && (
        <div className="cal-who" role="group">
          {data.staff.map((s) => (
            <button key={s.id} type="button" className="adm-chip" aria-pressed={s.id === staffId} onClick={() => go(date, "week", s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {moving && (
        <div className="cal-moving" role="status">
          <span>{A.cal.moving(moving.clientName)}</span>
          <button type="button" className="adm-chip" onClick={() => setMoving(null)}>
            {A.cancel}
          </button>
        </div>
      )}

      {!cols.length ? (
        <p className="adm-wait">{A.cal.noStaff}</p>
      ) : (
        <div className="cal-scroll" ref={scroller}>
          <div className="cal-grid" style={{ gridTemplateColumns: `44px repeat(${cols.length}, minmax(${view === "week" ? 92 : 108}px, 1fr))` }}>
            <div className="cal-corner" />
            {cols.map((c) => {
              const s = staffById(c.staffId);
              const mine = data.visits.filter((v) => v.staffId === c.staffId && minutesInDay(v.start, c.date, tz) >= 0 && minutesInDay(v.start, c.date, tz) < 1440);
              const sum = mine.reduce((n, v) => n + v.totalCents, 0);
              const closed = !(data.work[c.staffId]?.[c.date] ?? []).length;
              return (
                <div key={c.key} className={`cal-head${c.date === today && view === "week" ? " is-today" : ""}`}>
                  {view === "week" ? (
                    <b>{cap(fmt(tz, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(noon(c.date)))}</b>
                  ) : (
                    <>
                      <span className="cal-ava">{s?.photoUrl ? <img src={s.photoUrl} alt="" /> : (s?.name ?? "?").charAt(0)}</span>
                      <b>{s?.name}</b>
                    </>
                  )}
                  <small>{closed && !mine.length ? A.cal.closed : mine.length ? `${A.cal.visits(mine.length)} · ${eur(sum)}` : "—"}</small>
                </div>
              );
            })}

            <div className="cal-gutter" style={{ height }}>
              {Array.from({ length: (hi - lo) / 60 }, (_, i) => (
                <span key={i} style={{ top: i * 60 * PX }}>
                  {hhmm(lo + i * 60)}
                </span>
              ))}
            </div>
            {cols.map((c) => (
              <div
                key={c.key}
                className={`cal-col${moving ? " is-target" : ""}`}
                style={{ height }}
                data-col={c.key}
                data-date={c.date}
                onClick={(e) => onColumnClick(c, e)}
              >
                {(data.work[c.staffId]?.[c.date] ?? []).map(([a, b], i) => (
                  <div key={`w${i}`} className="cal-work" style={{ top: yOf(a, c.date), height: (b - a) / 60_000 * PX }} />
                ))}
                {data.special
                  .filter((x) => x.staffId === c.staffId)
                  .map((x) => {
                    const top = Math.max(0, yOf(x.from, c.date));
                    const bottom = Math.min(height, yOf(x.to, c.date));
                    if (bottom <= 0 || top >= height) return null;
                    return (
                      <div key={x.id} className="cal-sp" style={{ top, height: bottom - top }}>
                        <span>+{eur(x.extraCents)}</span>
                      </div>
                    );
                  })}
                {data.blocks
                  .filter((b) => b.staffId === c.staffId)
                  .map((b) => {
                    const top = Math.max(0, yOf(b.from, c.date));
                    const bottom = Math.min(height, yOf(b.to, c.date));
                    if (bottom <= 0 || top >= height) return null;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        data-item
                        className={`cal-off k-${b.kind}`}
                        style={{ top, height: bottom - top }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!moving) setSheet({ kind: "block", id: b.id });
                        }}
                      >
                        <span>
                          {A.block.kinds[b.kind] ?? b.kind}
                          {b.note ? ` · ${b.note}` : ""}
                        </span>
                      </button>
                    );
                  })}
                {data.visits
                  .filter((v) => v.staffId === c.staffId)
                  .map((v) => {
                    const top = yOf(v.start, c.date);
                    const h = (v.end - v.start) / 60_000 * PX;
                    const buf = (v.blockedUntil - v.end) / 60_000 * PX;
                    if (top + h <= 0 || top >= height) return null;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        data-item
                        className={`cal-v st-${v.status} src-${v.source}${v.extraCents ? " is-sp" : ""}${moving?.id === v.id ? " is-moving" : ""}${h < 40 ? " is-short" : ""}`}
                        style={{ top, height: Math.max(h, 18) }}
                        onPointerDown={(e) => onVisitPointerDown(v, e)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (dragRef.current.justDropped) return;
                          if (moving) {
                            if (moving.id !== v.id) setToast({ text: A.visit.overlap, bad: true });
                            return;
                          }
                          setSheet({ kind: "visit", id: v.id });
                        }}
                      >
                        <span className="t">
                          {timeOf(tz, v.start)}–{timeOf(tz, v.end)}
                          {v.source === "online" && <i className="dot" title={A.visit.source.online} />}
                        </span>
                        <b>{v.clientName}</b>
                        <span className="s">{v.services.map((s) => ru(s.name)).join(", ")}</span>
                        {buf > 0 && <span className="buf" style={{ height: buf }} />}
                      </button>
                    );
                  })}
                {ghost?.col === c.key && dragRef.current.v && (
                  <div className="cal-ghost" style={{ top: (ghost.min - lo) * PX, height: (dragRef.current.v.end - dragRef.current.v.start) / 60_000 * PX }}>
                    {hhmm(ghost.min)}
                  </div>
                )}
                {c.date === today && minutesInDay(now, c.date, tz) >= lo && minutesInDay(now, c.date, tz) <= hi && <div className="cal-now" style={{ top: yOf(now, c.date) }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {sheet?.kind === "new" && (
        <NewSheet
          data={data}
          staffId={sheet.staffId}
          date={sheet.date}
          min={sheet.min}
          onClose={() => setSheet(null)}
          onDone={(text) => {
            setSheet(null);
            setToast({ text });
          }}
        />
      )}
      {visitOpen && (
        <VisitSheet
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
        <div className="adm-sheet-wrap" onClick={() => setAsk(null)}>
          <div className="adm-sheet adm-ask" role="alertdialog" onClick={(e) => e.stopPropagation()}>
            <p>{ask.text}</p>
            <button
              type="button"
              className="adm-btn adm-btn-lime"
              onClick={() => {
                const run = ask.run;
                setAsk(null);
                run();
              }}
            >
              {ask.yes}
            </button>
            <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setAsk(null)}>
              {A.cancel}
            </button>
          </div>
        </div>
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

function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="adm-sheet-wrap" onClick={onClose}>
      <div className="adm-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="adm-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="adm-icon" aria-label={A.close} onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const offered = (services: CalService[], staffId: string) => services.filter((s) => s.active && s.offers[staffId]);

function ServicePicker({ services, staffId, picked, onChange }: { services: CalService[]; staffId: string; picked: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="adm-svcs">
      {offered(services, staffId).map((s) => {
        const on = picked.includes(s.id);
        const [price, minutes] = s.offers[staffId];
        return (
          <button key={s.id} type="button" aria-pressed={on} onClick={() => onChange(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])}>
            <span>{ru(s.name)}</span>
            <small>
              {mins(minutes)} · {eur(price)}
            </small>
          </button>
        );
      })}
    </div>
  );
}

function sumOf(services: CalService[], staffId: string, ids: string[]) {
  let m = 0;
  let c = 0;
  for (const id of ids) {
    const o = services.find((s) => s.id === id)?.offers[staffId];
    if (o) {
      c += o[0];
      m += o[1];
    }
  }
  return { minutes: m, cents: c };
}

function NewSheet({ data, staffId, date, min, onClose, onDone }: { data: CalendarData; staffId: string; date: string; min: number; onClose: () => void; onDone: (t: string) => void }) {
  const tz = data.tz;
  const [tab, setTab] = useState<"visit" | "block">("visit");
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
  const lookFor = client ? "" : phone.replace(/\D/g, "").length >= 3 ? phone : name.trim().length >= 2 ? name : "";
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

  const book = async (force: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await createVisit({
        staffId: sid,
        start: momentAt(day, startMin, tz),
        serviceIds: picked,
        clientId: client?.id ?? null,
        name: client ? client.name : name,
        phone: client ? (client.phone ?? "") : phone,
        comment: "",
        staffNote: note,
        smsReminder: sms,
        idempotencyKey: key.current,
        force,
      });
      if (r.ok) return onDone(`${A.cal.booked}: ${timeOf(tz, r.start)}`);
      if (r.code === "outside_hours" || r.code === "time_off") setWarn(r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours);
      else setProblem(r.code === "overlap" ? A.visit.overlap : r.code === "not_offered" ? A.visit.notOffered : r.code === "invalid" ? A.visit.invalid(r.field) : A.error);
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

  return (
    <SheetFrame title={tab === "visit" ? A.visit.new : A.block.save} onClose={onClose}>
      <div className="adm-seg adm-seg-wide" role="group">
        <button type="button" aria-pressed={tab === "visit"} onClick={() => setTab("visit")}>
          {A.visit.tabVisit}
        </button>
        <button type="button" aria-pressed={tab === "block"} onClick={() => setTab("block")}>
          {A.visit.tabBlock}
        </button>
      </div>

      <div className="adm-who">
        {data.staff
          .filter((s) => s.active)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              className="adm-chip"
              aria-pressed={s.id === sid}
              onClick={() => {
                setSid(s.id);
                setPicked((p) => p.filter((id) => data.services.find((x) => x.id === id)?.offers[s.id]));
              }}
            >
              {s.name}
            </button>
          ))}
      </div>

      {tab === "visit" ? (
        <div className="adm-form">
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
          <div className="adm-field">
            <span>{A.visit.services}</span>
            <ServicePicker services={data.services} staffId={sid} picked={picked} onChange={setPicked} />
          </div>

          <div className="adm-field">
            <span>{A.visit.client}</span>
            {client ? (
              <div className="adm-client">
                <b>{client.name}</b>
                <small>{client.phone ?? A.visit.walkIn}</small>
                <button type="button" className="adm-link" onClick={() => setClient(null)}>
                  {A.visit.pickAnother}
                </button>
              </div>
            ) : (
              <>
                <div className="adm-row">
                  <input type="tel" inputMode="tel" autoComplete="off" placeholder={A.visit.phone} value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <input autoComplete="off" placeholder={A.visit.name} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                {hits.length > 0 && (
                  <ul className="adm-hits">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => setClient({ id: h.id, name: h.name, phone: h.phone })}>
                          <b>{h.name}</b>
                          <small>
                            {h.phone ?? A.visit.walkIn} · {A.visit.visitsN(h.visits)}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <label className="adm-field">
            <span>{A.visit.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
          <label className="adm-check">
            <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
            <span>{A.visit.sms}</span>
          </label>

          {picked.length > 0 && (
            <p className="adm-sum">
              {A.visit.total}: <b>{eur(total.cents)}</b> · {mins(total.minutes)} · {A.visit.ends(hhmm(startMin + total.minutes))}
            </p>
          )}
          {problem && (
            <p className="adm-err" role="alert">
              {problem}
            </p>
          )}
          {warn ? (
            <div className="adm-warn" role="alert">
              <p>{warn}</p>
              <button type="button" className="adm-btn adm-btn-lime" disabled={busy} onClick={() => void book(true)}>
                {A.visit.anyway}
              </button>
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setWarn(null)}>
                {A.cancel}
              </button>
            </div>
          ) : (
            <button type="button" className="adm-btn adm-btn-lime" disabled={busy || !picked.length || (!client && !phone.trim() && !name.trim())} onClick={() => void book(false)}>
              {picked.length ? A.visit.book : A.visit.pickServices}
            </button>
          )}
        </div>
      ) : (
        <div className="adm-form">
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
          {problem && (
            <p className="adm-err" role="alert">
              {problem}
            </p>
          )}
          <button type="button" className="adm-btn adm-btn-lime" disabled={busy} onClick={() => void block()}>
            {A.block.save}
          </button>
        </div>
      )}
    </SheetFrame>
  );
}

function VisitSheet({ v, data, onClose, onMove, onDone }: { v: CalVisit; data: CalendarData; onClose: () => void; onMove: () => void; onDone: (t: string) => void }) {
  const tz = data.tz;
  const [mode, setMode] = useState<"view" | "edit" | "cancel">("view");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const staff = data.staff.find((s) => s.id === v.staffId);
  const date = fmt(tz, { weekday: "short", day: "numeric", month: "long" }).format(v.start);

  // edit
  const [sid, setSid] = useState(v.staffId);
  const [day, setDay] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(v.start));
  const [time, setTime] = useState(timeOf(tz, v.start));
  const [picked, setPicked] = useState(v.services.map((s) => s.serviceId));
  const [note, setNote] = useState(v.staffNote);

  const status = async (s: string) => {
    setBusy(true);
    try {
      if (await setVisitStatus(v.id, s)) onDone(A.visit.status[s]);
      else setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const save = async (force: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const m = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      const r = await updateVisit(v.id, { staffId: sid, start: momentAt(day, m, tz), serviceIds: picked, staffNote: note, force });
      if (r.ok) return onDone(A.saved);
      if (r.code === "outside_hours" || r.code === "time_off") setWarn(r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours);
      else setProblem(r.code === "overlap" ? A.visit.overlap : r.code === "not_offered" ? A.visit.notOffered : r.code === "invalid" ? A.visit.invalid(r.field) : A.error);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await cancelVisit(v.id);
      onDone(A.cal.cancelled);
    } catch {
      setProblem(A.error);
      setBusy(false);
    }
  };

  return (
    <SheetFrame title={v.clientName} onClose={onClose}>
      {mode !== "edit" ? (
        <>
          <div className="adm-kv">
            <span>
              {cap(date)}, {timeOf(tz, v.start)}–{timeOf(tz, v.end)}
            </span>
            <span>{staff?.name}</span>
          </div>
          {v.clientPhone && (
            <a className="adm-phone" href={`tel:${v.clientPhone}`}>
              {v.clientPhone} · {A.visit.call}
            </a>
          )}
          {v.clientNote && <p className="adm-note">{v.clientNote}</p>}
          <ul className="adm-lines">
            {v.services.map((s, i) => (
              <li key={i}>
                <span>{ru(s.name)}</span>
                <span>{eur(s.priceCents)}</span>
              </li>
            ))}
            {v.extraCents > 0 && (
              <li className="is-sp">
                <span>{A.visit.special}</span>
                <span>+{eur(v.extraCents)}</span>
              </li>
            )}
            <li className="tot">
              <span>{A.visit.total}</span>
              <span>{eur(v.totalCents)}</span>
            </li>
          </ul>
          {v.comment && <p className="adm-note">«{v.comment}»</p>}
          {v.staffNote && <p className="adm-note">{v.staffNote}</p>}
          <p className="adm-meta">
            {A.visit.source[v.source] ?? v.source}
            {v.anyStaff ? ` · ${A.visit.anyStaff}` : ""}
            {v.reminder ? ` · ${A.visit.sms}` : ""}
          </p>

          <div className="adm-seg adm-seg-wide" role="group">
            {(["arrived", "done", "no_show"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={v.status === s} disabled={busy} onClick={() => void status(v.status === s ? "booked" : s)}>
                {A.visit.status[s]}
              </button>
            ))}
          </div>
          {problem && (
            <p className="adm-err" role="alert">
              {problem}
            </p>
          )}
          {mode === "cancel" ? (
            <div className="adm-warn" role="alert">
              <p>{A.visit.cancelSure}</p>
              <button type="button" className="adm-btn adm-btn-warn" disabled={busy} onClick={() => void cancel()}>
                {A.visit.cancelYes}
              </button>
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setMode("view")}>
                {A.visit.keep}
              </button>
            </div>
          ) : (
            <div className="adm-btns">
              <button type="button" className="adm-btn adm-btn-line" onClick={onMove}>
                {A.visit.move}
              </button>
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setMode("edit")}>
                {A.visit.edit}
              </button>
              <button type="button" className="adm-btn adm-btn-ghost adm-danger" onClick={() => setMode("cancel")}>
                {A.visit.cancelVisit}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="adm-form">
          <div className="adm-who">
            {data.staff
              .filter((s) => s.active)
              .map((s) => (
                <button key={s.id} type="button" className="adm-chip" aria-pressed={s.id === sid} onClick={() => setSid(s.id)}>
                  {s.name}
                </button>
              ))}
          </div>
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
          <div className="adm-field">
            <span>{A.visit.services}</span>
            <ServicePicker services={data.services} staffId={sid} picked={picked} onChange={setPicked} />
          </div>
          <label className="adm-field">
            <span>{A.visit.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
          {problem && (
            <p className="adm-err" role="alert">
              {problem}
            </p>
          )}
          {warn ? (
            <div className="adm-warn" role="alert">
              <p>{warn}</p>
              <button type="button" className="adm-btn adm-btn-lime" disabled={busy} onClick={() => void save(true)}>
                {A.visit.anywayMove}
              </button>
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setWarn(null)}>
                {A.cancel}
              </button>
            </div>
          ) : (
            <div className="adm-btns">
              <button type="button" className="adm-btn adm-btn-lime" disabled={busy || !picked.length} onClick={() => void save(false)}>
                {A.visit.saveChanges}
              </button>
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setMode("view")}>
                {A.back}
              </button>
            </div>
          )}
        </div>
      )}
    </SheetFrame>
  );
}

function BlockSheet({ b, tz, staffName, onClose, onDone }: { b: CalBlock; tz: string; staffName: string; onClose: () => void; onDone: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const f = fmt(tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <SheetFrame title={A.block.kinds[b.kind] ?? b.kind} onClose={onClose}>
      <div className="adm-kv">
        <span>
          {f.format(b.from)} – {f.format(b.to)}
        </span>
        <span>{staffName}</span>
      </div>
      {b.note && <p className="adm-note">{b.note}</p>}
      <button
        type="button"
        className="adm-btn adm-btn-ghost adm-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          if (await deleteBlock(b.id)) onDone(A.cal.unblocked);
          else setBusy(false);
        }}
      >
        {A.block.remove}
      </button>
    </SheetFrame>
  );
}
