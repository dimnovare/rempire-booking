"use client";

/**
 * A barber's hours from the journal, written as one dated day through the
 * schedule's own function (saveCellsAction → saveDays, src/lib/admin/
 * schedule.ts), with its rights and its refusals: «Редактирование графика
 * работы» and the barber's column; a day with visits that would lose their
 * time is not changed, and the answer names them.
 *
 *   HeadMenu       from 900px, a click on a barber's head (board Journal-
 *                  Head): his name and hours that day, «Изменить часы на
 *                  сегодня», «Сделать выходным», «Открыть график работы».
 *   DayOff         a day nobody works (board Journal-DayOff): what it is,
 *                  the schedule, and «Добавить сотрудников в день».
 *   AddStaffDialog «Добавить сотрудника в расписание»: barbers to tick, the
 *                  hours with breaks, «Добавить».
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { CalStaff } from "@/lib/admin/calendar";
import type { Applied } from "@/lib/admin/schedule";
import { daySpans, keepBreaks, localSpans, panelOf, type Span } from "@/lib/admin/schedule-plan";
import type { Interval } from "@/lib/slots";
import { Ava } from "../icons";
import { useA } from "../lang";
import { saveCellsAction } from "./schedule/actions";

/** What the login may do with hours: change a day («Редактирование графика работы»), open «График работы». */
export type HoursMay = { edit: boolean; page: boolean };

const DEFAULT: { from: string; to: string } = { from: "10:00", to: "19:00" };
/** The times a select offers: every quarter of an hour, and the end of the day. */
const TIMES = Array.from({ length: 97 }, (_, i) => (i === 96 ? "24:00" : `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`));

export const scheduleHref = (date: string) => `/admin/schedule?d=${date}`;

/** «10:00–18:00», or «13:00–14:00, 15:00–19:00» for a day with a gap. */
export function hoursText(windows: Interval[], date: string, tz: string): string {
  return localSpans(windows, date, tz)
    .map(([a, b]) => `${a}–${b}`)
    .join(", ");
}

function TimeSelect({ value, onChange, label, end = false }: { value: string; onChange: (v: string) => void; label: string; end?: boolean }) {
  // a time between the quarters (from the schedule) is offered as it is
  const list = TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <select className="jr-time" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {list
        .filter((t) => (end ? t !== "00:00" : t !== "24:00"))
        .map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
    </select>
  );
}

/** The schedule's answer as words, or null when it was written. */
function useAnswer() {
  const A = useA();
  return (r: Applied, names: (id: string) => string, dayText: (date: string) => string): string | null => {
    if (r.ok) return null;
    if (r.code === "forbidden") return A.rights.refused;
    if (r.code === "visits") return A.schedule.refused(r.refused.map((x) => A.schedule.dayVisits(names(x.staffId), dayText(x.date), x.visits)).join("; "));
    return A.schedule.bad[r.field as keyof typeof A.schedule.bad] ?? A.schedule.bad.spans;
  };
}

/** The menu behind a barber's head, from 900px. */
export function HeadMenu({
  staff,
  date,
  today,
  tz,
  work,
  dayText,
  may,
  onSaid,
  children,
}: {
  staff: CalStaff;
  date: string;
  today: string;
  tz: string;
  /** his working windows that day */
  work: Interval[];
  /** «22 ноября» */
  dayText: string;
  may: HoursMay;
  onSaid: (text: string) => void;
  /** the head's own content */
  children: React.ReactNode;
}) {
  const A = useA();
  const C = A.cal;
  const answer = useAnswer();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const panel = panelOf(localSpans(work, date, tz));
  const isToday = date === today;

  const close = () => {
    setOpen(false);
    setEdit(null);
    setProblem(null);
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const write = async (kind: "work" | "off", from = "", to = "") => {
    setBusy(true);
    setProblem(null);
    try {
      const breaks = kind === "work" ? keepBreaks(panel?.breaks ?? [], from, to) : [];
      if (kind === "work" && !daySpans(from, to, breaks)) return setProblem(A.schedule.bad.spans);
      const r = await saveCellsAction({ cells: [{ staffId: staff.id, date }], kind, from, to, breaks });
      const bad = answer(r, () => staff.name, () => dayText);
      if (bad) return setProblem(bad);
      close();
      onSaid(kind === "off" ? C.offSaved : C.hoursSaved);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const hours = work.length ? hoursText(work, date, tz) : C.closed;
  return (
    <div className={`jr-head-wrap${open ? " is-open" : ""}`} ref={box}>
      <button ref={btn} type="button" className="jr-head-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={C.headMenu(staff.name)} onClick={() => (open ? close() : setOpen(true))}>
        {children}
      </button>
      {open && (
        <div className="jr-head-menu" id={id} role="menu" aria-label={C.headMenu(staff.name)}>
          <div className="jr-head-top">
            <b>{staff.name}</b>
            <small>{C.headDay(isToday ? C.headToday : dayText, hours)}</small>
          </div>
          {edit ? (
            <div className="jr-head-edit" role="group" aria-label={C.changeHours(isToday)}>
              <div className="jr-time-row">
                <span>{C.timeFrom}</span>
                <TimeSelect label={`${C.workTime}: ${C.timeFrom}`} value={edit.from} onChange={(from) => setEdit({ ...edit, from })} />
                <span>{C.timeTo}</span>
                <TimeSelect end label={`${C.workTime}: ${C.timeTo}`} value={edit.to} onChange={(to) => setEdit({ ...edit, to })} />
              </div>
              {problem && (
                <p className="jr-hours-err" role="alert">
                  {problem}
                </p>
              )}
              <div className="jr-head-acts">
                <button type="button" className="jr-xbtn" onClick={() => setEdit(null)}>
                  {A.cancel}
                </button>
                <button type="button" className="jr-xbtn is-main" disabled={busy} onClick={() => void write("work", edit.from, edit.to)}>
                  {A.save}
                </button>
              </div>
            </div>
          ) : (
            <>
              {may.edit && (
                <button type="button" role="menuitem" className="jr-head-item" onClick={() => setEdit(panel ? { from: panel.from, to: panel.to } : DEFAULT)}>
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5v4.8l3 1.8" />
                  </svg>
                  <span>{C.changeHours(isToday)}</span>
                </button>
              )}
              {may.edit && work.length > 0 && (
                <button type="button" role="menuitem" className="jr-head-item" disabled={busy} onClick={() => void write("off")}>
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <rect x="4" y="5.5" width="16" height="14" rx="2" />
                    <path d="M4 10h16M8 3.5v4M16 3.5v4M10 13.5l4 4M14 13.5l-4 4" />
                  </svg>
                  <span>{C.makeOff}</span>
                </button>
              )}
              {may.page && (
                <Link role="menuitem" className="jr-head-item" href={scheduleHref(date)} prefetch={false}>
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <rect x="4" y="5.5" width="16" height="14" rx="2" />
                    <path d="M4 10h16M8 3.5v4M16 3.5v4" />
                  </svg>
                  <span>{C.openSchedule}</span>
                </Link>
              )}
              {problem && (
                <p className="jr-hours-err" role="alert">
                  {problem}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A day nobody works and nobody is booked on. */
export function DayOff({ staff, date, dayText, longDay, may, onSaid }: { staff: CalStaff[]; date: string; dayText: string; longDay: string; may: HoursMay; onSaid: (text: string) => void }) {
  const A = useA();
  const C = A.cal;
  const [adding, setAdding] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <div className="jr-empty">
      <span className="jr-empty-disc" aria-hidden="true">
        <svg viewBox="0 0 24 24" width={40} height={40} fill="none" stroke="currentColor" strokeWidth={1.4}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4M10 13l4 4M14 13l-4 4" />
        </svg>
      </span>
      <h2>{C.noSchedule}</h2>
      <p>{C.noScheduleLine(dayText)}</p>
      {may.page && (
        <Link className="jr-empty-btn is-main" href={scheduleHref(date)} prefetch={false}>
          {C.setHours}
        </Link>
      )}
      {may.edit && staff.some((s) => s.active) && (
        <button ref={opener} type="button" className="jr-empty-btn" onClick={() => setAdding(true)}>
          {C.addStaff}
        </button>
      )}
      {adding && (
        <AddStaffDialog
          staff={staff.filter((s) => s.active)}
          date={date}
          dayText={dayText}
          longDay={longDay}
          onClose={() => {
            setAdding(false);
            opener.current?.focus();
          }}
          onDone={(n) => {
            setAdding(false);
            onSaid(C.addedN(n));
          }}
        />
      )}
    </div>
  );
}

/** «Добавить сотрудника в расписание»: the ticked barbers work that day, those hours, those breaks. */
export function AddStaffDialog({ staff, date, dayText, longDay, onClose, onDone }: { staff: CalStaff[]; date: string; dayText: string; longDay: string; onClose: () => void; onDone: (n: number) => void }) {
  const A = useA();
  const C = A.cal;
  const answer = useAnswer();
  const [picked, setPicked] = useState<string[]>([]);
  const [from, setFrom] = useState(DEFAULT.from);
  const [to, setTo] = useState(DEFAULT.to);
  const [breaks, setBreaks] = useState<Span[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const title = useId();

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // the keyboard starts in the dialog; Escape closes it
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input, button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const all = picked.length === staff.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const add = async () => {
    setProblem(null);
    if (!picked.length) return setProblem(C.pickSomeone);
    if (!daySpans(from, to, breaks)) return setProblem(A.schedule.bad.spans);
    setBusy(true);
    try {
      const r = await saveCellsAction({ cells: picked.map((staffId) => ({ staffId, date })), kind: "work", from, to, breaks });
      const bad = answer(r, (id) => staff.find((s) => s.id === id)?.name ?? "", () => dayText);
      if (bad) return setProblem(bad);
      onDone(picked.length);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jr-dlg-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="jr-dlg" role="dialog" aria-modal="true" aria-labelledby={title} ref={box}>
        <h2 id={title}>{C.addStaffTitle}</h2>
        <p className="jr-dlg-sub">{longDay}</p>
        <div className="jr-dlg-row">
          <h3>{C.addStaffWho}</h3>
          <button type="button" className="jr-dlg-all" onClick={() => setPicked(all ? [] : staff.map((s) => s.id))}>
            {C.pickAll}
          </button>
        </div>
        <ul className="jr-dlg-list">
          {staff.map((s) => (
            <li key={s.id}>
              <label>
                <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                <Ava src={s.photoUrl} name={s.name} className="jr-dlg-ava" />
                <span>
                  <b>{s.name}</b>
                  <small>{A.pick(s.role)}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <h3>{C.workTime}</h3>
        <div className="jr-time-row">
          <span>{C.timeFrom}</span>
          <TimeSelect label={`${C.workTime}: ${C.timeFrom}`} value={from} onChange={setFrom} />
          <span>{C.timeTo}</span>
          <TimeSelect end label={`${C.workTime}: ${C.timeTo}`} value={to} onChange={setTo} />
        </div>
        {breaks.map(([a, b], i) => (
          <div key={i} className="jr-time-row is-break">
            <span>{C.timeFrom}</span>
            <TimeSelect label={A.schedule.breakFrom} value={a} onChange={(x) => setBreaks(breaks.map((y, j) => (j === i ? [x, y[1]] : y)))} />
            <span>{C.timeTo}</span>
            <TimeSelect end label={A.schedule.breakTo} value={b} onChange={(x) => setBreaks(breaks.map((y, j) => (j === i ? [y[0], x] : y)))} />
            <button type="button" className="jr-dlg-x" aria-label={A.schedule.removeBreak} onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        {breaks.length < 5 && (
          <button type="button" className="jr-dlg-break" onClick={() => setBreaks([...breaks, ["13:00", "14:00"]])}>
            + {A.schedule.addBreak}
          </button>
        )}
        {problem && (
          <p className="jr-hours-err" role="alert">
            {problem}
          </p>
        )}
        <div className="jr-dlg-acts">
          <button type="button" className="jr-xbtn" onClick={onClose}>
            {A.cancel}
          </button>
          <button type="button" className="jr-xbtn is-main" disabled={busy} onClick={() => void add()}>
            {C.addStaffGo}
          </button>
        </div>
      </div>
    </div>
  );
}
