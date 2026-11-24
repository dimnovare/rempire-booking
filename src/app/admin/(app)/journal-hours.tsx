"use client";

/**
 * A barber's hours from the journal, written through the schedule's own
 * functions (src/lib/admin/schedule.ts) with their rights and their
 * refusals: «Редактирование графика работы» and the barber's column; a day
 * with visits that would lose their time is not changed, and the answer
 * names it.
 *
 *   HeadMenu        from 900px, a click on a barber's head (board Journal-
 *                   Head): his name, his hours that day and his online
 *                   hours if they are set, then the six items of the
 *                   admin we follow (Dim, rounds 13 and 15): «Изменить
 *                   рабочее время», «Отменить рабочий день», «Добавить
 *                   рабочие дни», «Убрать рабочие дни», «Настроить график
 *                   работы», «Изменить время для онлайн-записи».
 *   DayOff          a day nobody works (board Journal-DayOff): what it is,
 *                   the schedule, and «Добавить сотрудников в день».
 *   AddStaffButton  the bar's person-plus, on any day, as in the admin we
 *                   follow: «Добавить сотрудника в расписание».
 *   AddStaffDialog  its window (docs/altegio-pages.md, «Добавить сотрудника
 *                   в расписание»): «Сотрудники», a select of the barbers
 *                   who do not work that day; «Рабочее время» and «+
 *                   Добавить перерыв»; «Отмена», «Сохранить». It writes
 *                   that one day as the grid's marked cell does
 *                   (saveCellsAction → saveDays).
 *   DaysDialog      «Добавить рабочие дни» / «Убрать рабочие дни»: days
 *                   picked in a small month, and for working days the
 *                   hours (markDaysAction → markDays). A day whose visits
 *                   the change would cut is left as it was, and the window
 *                   says which and why.
 *   OnlineDialog    «Изменить время для онлайн-записи»: one or more spans
 *                   inside his hours that day; none is all of them
 *                   (onlineHoursAction → saveOnlineHours). Only the
 *                   client's online booking is held to them.
 *
 * The windows lie over the dimmed page, outside the grid (a portal), so
 * nothing of the grid's sticky heads can cover them.
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CalStaff } from "@/lib/admin/calendar";
import { cleanOnline, MARK_DAYS_MAX, ONLINE_SPANS_MAX, spansText } from "@/lib/admin/journal";
import type { Applied, Refused } from "@/lib/admin/schedule";
import { BREAKS_MAX, daySpans, keepBreaks, localSpans, monthDays, monthStart, panelOf, type Span } from "@/lib/admin/schedule-plan";
import type { Interval } from "@/lib/slots";
import { isoWeekday } from "@/lib/tz";
import { cap } from "../copy.shared";
import { Ava, NextIcon, PrevIcon } from "../icons";
import { useA } from "../lang";
import { markDaysAction, onlineHoursAction } from "./journal-actions";
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

/** «25 ноября» (or other parts of a local date) in the login's language. */
function useDayWords() {
  const A = useA();
  return (date: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) => new Intl.DateTimeFormat(A.intl, { ...o, timeZone: "UTC" }).format(Date.parse(`${date}T12:00:00Z`));
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

/**
 * A window over the dimmed page: its title, an × in the corner, the
 * keyboard in its first field; Escape, the ×, or a click beside it closes it.
 */
function Dialog({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const A = useA();
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return createPortal(
    <div className="jr-dlg-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="jr-dlg" role="dialog" aria-modal="true" aria-labelledby={id} ref={box}>
        <h2 id={id}>{title}</h2>
        {sub && <p className="jr-dlg-sub">{sub}</p>}
        {children}
        {/* last in the order, first in the corner: the keyboard starts in the form */}
        <button type="button" className="jr-dlg-x jr-dlg-close" aria-label={A.close} onClick={onClose}>
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** «Рабочее время» from … to …, its breaks, and «+ Добавить перерыв». */
function HoursFields({ from, to, breaks, onFrom, onTo, onBreaks }: { from: string; to: string; breaks: Span[]; onFrom: (v: string) => void; onTo: (v: string) => void; onBreaks: (b: Span[]) => void }) {
  const A = useA();
  const C = A.cal;
  return (
    <>
      <h3>{C.workTime}</h3>
      <div className="jr-time-row">
        <span>{C.timeFrom}</span>
        <TimeSelect label={`${C.workTime}: ${C.timeFrom}`} value={from} onChange={onFrom} />
        <span>{C.timeTo}</span>
        <TimeSelect end label={`${C.workTime}: ${C.timeTo}`} value={to} onChange={onTo} />
      </div>
      {breaks.map(([a, b], i) => (
        <div key={i} className="jr-time-row is-break">
          <span>{C.timeFrom}</span>
          <TimeSelect label={A.schedule.breakFrom} value={a} onChange={(x) => onBreaks(breaks.map((y, j) => (j === i ? [x, y[1]] : y)))} />
          <span>{C.timeTo}</span>
          <TimeSelect end label={A.schedule.breakTo} value={b} onChange={(x) => onBreaks(breaks.map((y, j) => (j === i ? [y[0], x] : y)))} />
          <button type="button" className="jr-dlg-x" aria-label={A.schedule.removeBreak} onClick={() => onBreaks(breaks.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {breaks.length < BREAKS_MAX && (
        <button type="button" className="jr-dlg-break" onClick={() => onBreaks([...breaks, ["13:00", "14:00"]])}>
          + {A.schedule.addBreak}
        </button>
      )}
    </>
  );
}

/** The line under a window's form: what went wrong, or what was done and what was not. */
function Problem({ text }: { text: string | null }) {
  return text ? (
    <p className="jr-hours-err" role="alert">
      {text}
    </p>
  ) : null;
}

const CalPlus = ({ minus = false }: { minus?: boolean }) => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <rect x="4" y="5.5" width="16" height="14" rx="2" />
    <path d={`M4 10h16M8 3.5v4M16 3.5v4M9.5 14.5h5${minus ? "" : "M12 12v5"}`} />
  </svg>
);

/** The menu behind a barber's head, from 900px. */
export function HeadMenu({
  staff,
  date,
  today,
  tz,
  work,
  online,
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
  /** the hours clients may book him online that day, if they are set; null: all his hours */
  online: Span[] | null;
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
  const [dialog, setDialog] = useState<"add" | "remove" | "online" | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const spans = localSpans(work, date, tz);
  const panel = panelOf(spans);
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
  /** One of the three windows: the menu goes, the window comes. */
  const openDialog = (d: "add" | "remove" | "online") => {
    close();
    setDialog(d);
  };
  const shut = () => {
    setDialog(null);
    btn.current?.focus();
  };
  const said = (text: string) => {
    setDialog(null);
    onSaid(text);
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
            {online && online.length > 0 && <span className="jr-head-online">{C.onlineNow(spansText(online))}</span>}
          </div>
          {edit ? (
            <div className="jr-head-edit" role="group" aria-label={C.changeHours}>
              <div className="jr-time-row">
                <span>{C.timeFrom}</span>
                <TimeSelect label={`${C.workTime}: ${C.timeFrom}`} value={edit.from} onChange={(from) => setEdit({ ...edit, from })} />
                <span>{C.timeTo}</span>
                <TimeSelect end label={`${C.workTime}: ${C.timeTo}`} value={edit.to} onChange={(to) => setEdit({ ...edit, to })} />
              </div>
              <Problem text={problem} />
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
                  <span>{C.changeHours}</span>
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
              {may.edit && (
                <button type="button" role="menuitem" className="jr-head-item" onClick={() => openDialog("add")}>
                  <CalPlus />
                  <span>{C.addDays}</span>
                </button>
              )}
              {may.edit && (
                <button type="button" role="menuitem" className="jr-head-item" onClick={() => openDialog("remove")}>
                  <CalPlus minus />
                  <span>{C.removeDays}</span>
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
              {/* (a day he does not work has no hours to book online in) */}
              {may.edit && work.length > 0 && (
                <button type="button" role="menuitem" className="jr-head-item" onClick={() => openDialog("online")}>
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z" />
                  </svg>
                  <span>{C.onlineTime}</span>
                </button>
              )}
              <Problem text={problem} />
            </>
          )}
        </div>
      )}
      {(dialog === "add" || dialog === "remove") && <DaysDialog staff={staff} kind={dialog === "add" ? "work" : "off"} date={date} today={today} panel={panel} onClose={shut} onSaid={said} />}
      {dialog === "online" && <OnlineDialog staff={staff} dayText={dayText} date={date} work={spans} online={online} onClose={shut} onSaid={said} />}
    </div>
  );
}

/** A day nobody works and nobody is booked on. `staff`: the barbers who may be added to it. */
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
      {may.edit && staff.length > 0 && (
        <button ref={opener} type="button" className="jr-empty-btn" onClick={() => setAdding(true)}>
          {C.addStaff}
        </button>
      )}
      {adding && (
        <AddStaffDialog
          staff={staff}
          date={date}
          longDay={longDay}
          onClose={() => {
            setAdding(false);
            opener.current?.focus();
          }}
          onDone={() => {
            setAdding(false);
            onSaid(C.addedN(1));
          }}
        />
      )}
    </div>
  );
}

/** The bar's person-plus (from 900px, on any day): «Добавить сотрудника в расписание». */
export function AddStaffButton({ staff, date, longDay, onSaid }: { staff: CalStaff[]; date: string; longDay: string; onSaid: (text: string) => void }) {
  const C = useA().cal;
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="jr-btn jr-ibtn" aria-label={C.addStaffTitle} title={C.addStaffTitle} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <circle cx="10" cy="8.5" r="3.5" />
          <path d="M3.5 19.5c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M18.5 6.5v6M15.5 9.5h6" />
        </svg>
      </button>
      {open && (
        <AddStaffDialog
          staff={staff}
          date={date}
          longDay={longDay}
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
          onDone={() => {
            setOpen(false);
            onSaid(C.addedN(1));
          }}
        />
      )}
    </>
  );
}

/** «Добавить сотрудника в расписание»: the barber picked works that day, those hours, those breaks. */
export function AddStaffDialog({ staff, date, longDay, onClose, onDone }: { staff: CalStaff[]; date: string; longDay: string; onClose: () => void; onDone: () => void }) {
  const A = useA();
  const C = A.cal;
  const answer = useAnswer();
  const words = useDayWords();
  const [who, setWho] = useState("");
  const [from, setFrom] = useState(DEFAULT.from);
  const [to, setTo] = useState(DEFAULT.to);
  const [breaks, setBreaks] = useState<Span[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setProblem(null);
    if (!who) return setProblem(A.schedule.bad.staff);
    if (!daySpans(from, to, breaks)) return setProblem(A.schedule.bad.spans);
    setBusy(true);
    try {
      const r = await saveCellsAction({ cells: [{ staffId: who, date }], kind: "work", from, to, breaks });
      const bad = answer(r, (id) => staff.find((s) => s.id === id)?.name ?? "", words);
      if (bad) return setProblem(bad);
      onDone();
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const picked = staff.find((s) => s.id === who);
  return (
    <Dialog title={C.addStaffTitle} sub={longDay} onClose={onClose}>
      <h3>{C.addStaffWho}</h3>
      <div className="jr-dlg-who">
        {picked && <Ava src={picked.photoUrl} name={picked.name} className="jr-dlg-ava" />}
        <select className="jr-sel" value={who} aria-label={C.addStaffWho} disabled={!staff.length} onChange={(e) => setWho(e.target.value)}>
          <option value="">{C.addStaffPick}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {!staff.length && <p className="jr-dlg-note">{C.addStaffNone}</p>}
      <HoursFields from={from} to={to} breaks={breaks} onFrom={setFrom} onTo={setTo} onBreaks={setBreaks} />
      <Problem text={problem} />
      <div className="jr-dlg-acts">
        <button type="button" className="jr-xbtn" onClick={onClose}>
          {A.cancel}
        </button>
        <button type="button" className="jr-xbtn is-main" disabled={busy || !staff.length} onClick={() => void save()}>
          {A.save}
        </button>
      </div>
    </Dialog>
  );
}

/** A small month to pick days in: ‹ the month ›, Monday first; a picked day is yellow. */
function DaysPicker({ month, onMonth, picked, today, onToggle }: { month: string; onMonth: (m: string) => void; picked: readonly string[]; today: string; onToggle: (date: string) => void }) {
  const A = useA();
  const words = useDayWords();
  const days = monthDays(month);
  const lead = isoWeekday(days[0]) - 1;
  const title = cap(words(days[0], { month: "long", year: "numeric" }));
  return (
    <div className="jr-month" role="group" aria-label={title}>
      <div className="jr-month-head">
        <button type="button" className="jr-dlg-x" aria-label={A.schedule.prevMonth} onClick={() => onMonth(monthStart(days[0], -1).slice(0, 7))}>
          <PrevIcon size={14} />
        </button>
        <b aria-live="polite">{title}</b>
        <button type="button" className="jr-dlg-x" aria-label={A.schedule.nextMonth} onClick={() => onMonth(monthStart(days[0], 1).slice(0, 7))}>
          <NextIcon size={14} />
        </button>
      </div>
      <div className="jr-month-grid">
        {A.staff.weekdays.map((w) => (
          <span key={w} className="jr-month-wd" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => (
          <button
            key={d}
            type="button"
            className="jr-month-day"
            aria-pressed={picked.includes(d)}
            aria-current={d === today ? "date" : undefined}
            aria-label={cap(words(d, { weekday: "long", day: "numeric", month: "long" }))}
            onClick={() => onToggle(d)}
          >
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * «Добавить рабочие дни» (kind "work": the days become working days with
 * these hours and breaks) or «Убрать рабочие дни» (kind "off": days off).
 * The days that went are written; the ones whose visits the change would
 * cut stay as they were, and the window stays open to say which.
 */
export function DaysDialog({
  staff,
  kind,
  date,
  today,
  panel,
  onClose,
  onSaid,
}: {
  staff: CalStaff;
  kind: "work" | "off";
  /** the day the journal shows: the month opens on it */
  date: string;
  today: string;
  /** his hours that day, the hours a working day starts with */
  panel: { from: string; to: string; breaks: Span[] } | null;
  onClose: () => void;
  onSaid: (text: string) => void;
}) {
  const A = useA();
  const C = A.cal;
  const S = A.schedule;
  const answer = useAnswer();
  const words = useDayWords();
  const [month, setMonth] = useState(date.slice(0, 7));
  const [picked, setPicked] = useState<string[]>([]);
  const [from, setFrom] = useState(panel?.from ?? DEFAULT.from);
  const [to, setTo] = useState(panel?.to ?? DEFAULT.to);
  const [breaks, setBreaks] = useState<Span[]>(panel?.breaks ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const list = (r: Refused[]) => r.map((x) => S.dayVisits(staff.name, words(x.date), x.visits)).join("; ");

  const toggle = (d: string) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const save = async () => {
    setProblem(null);
    setNote(null);
    if (!picked.length) return setProblem(S.bad.days);
    if (picked.length > MARK_DAYS_MAX) return setProblem(C.daysTooMany(MARK_DAYS_MAX));
    if (kind === "work" && !daySpans(from, to, breaks)) return setProblem(S.bad.spans);
    setBusy(true);
    try {
      const r = await markDaysAction({ staffId: staff.id, dates: [...picked].sort(), kind, from, to, breaks });
      const bad = answer(r, () => staff.name, words);
      if (bad || !r.ok) return setProblem(bad ?? A.error);
      if (!r.skipped.length) return onSaid(S.saved(r.written));
      // the days that went are done; the window stays to say which did not, and why
      setNote(`${S.saved(r.written)} ${S.skipped(list(r.skipped))}`);
      setPicked([]);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={kind === "work" ? C.addDays : C.removeDays} sub={C.daysFor(staff.name)} onClose={onClose}>
      <p className="jr-dlg-hint">{kind === "work" ? C.daysWorkHint : C.daysOffHint}</p>
      <DaysPicker month={month} onMonth={setMonth} picked={picked} today={today} onToggle={toggle} />
      <p className="jr-dlg-count" aria-live="polite">
        {C.daysPicked(picked.length)}
      </p>
      {kind === "work" && <HoursFields from={from} to={to} breaks={breaks} onFrom={setFrom} onTo={setTo} onBreaks={setBreaks} />}
      <Problem text={problem} />
      {note && (
        <p className="jr-dlg-note" role="status">
          {note}
        </p>
      )}
      <div className="jr-dlg-acts">
        <button type="button" className="jr-xbtn" onClick={onClose}>
          {note ? A.close : A.cancel}
        </button>
        <button type="button" className="jr-xbtn is-main" disabled={busy} onClick={() => void save()}>
          {A.save}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * «Изменить время для онлайн-записи»: the spans of his day in which clients
 * may book him online. None is all his working hours, the usual; «Всё
 * рабочее время» goes back to that.
 */
export function OnlineDialog({
  staff,
  date,
  dayText,
  work,
  online,
  onClose,
  onSaid,
}: {
  staff: CalStaff;
  date: string;
  dayText: string;
  /** his working hours that day, by the wall clock */
  work: Span[];
  online: Span[] | null;
  onClose: () => void;
  onSaid: (text: string) => void;
}) {
  const A = useA();
  const C = A.cal;
  const [spans, setSpans] = useState<Span[]>(online ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const day = panelOf(work) ?? { ...DEFAULT, breaks: [] };

  // a new span: the rest of the day after the last one, or the whole day
  const more = () => {
    const last = spans[spans.length - 1];
    setSpans([...spans, last && last[1] < day.to ? [last[1], day.to] : [day.from, day.to]]);
  };
  const save = async () => {
    setProblem(null);
    const clean = cleanOnline(spans, work);
    if (!clean) return setProblem(C.onlineBad);
    setBusy(true);
    try {
      const r = await onlineHoursAction({ staffId: staff.id, date, spans: clean });
      if (r.ok) return onSaid(r.spans.length ? C.onlineSaved : C.onlineCleared);
      setProblem(r.code === "forbidden" ? A.rights.refused : r.field === "closed" ? C.onlineClosed : r.field === "spans" ? C.onlineBad : A.error);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={C.onlineTime} sub={`${staff.name}, ${dayText} · ${C.workDay(spansText(work))}`} onClose={onClose}>
      <p className="jr-dlg-hint">{C.onlineHint}</p>
      {!spans.length && <p className="jr-dlg-note">{C.onlineAll}</p>}
      {spans.map(([a, b], i) => (
        <div key={i} className="jr-time-row">
          <span>{C.timeFrom}</span>
          <TimeSelect label={C.onlineFrom} value={a} onChange={(x) => setSpans(spans.map((y, j) => (j === i ? [x, y[1]] : y)))} />
          <span>{C.timeTo}</span>
          <TimeSelect end label={C.onlineTo} value={b} onChange={(x) => setSpans(spans.map((y, j) => (j === i ? [y[0], x] : y)))} />
          <button type="button" className="jr-dlg-x" aria-label={C.onlineRemove} onClick={() => setSpans(spans.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <div className="jr-dlg-row">
        {spans.length < ONLINE_SPANS_MAX && (
          <button type="button" className="jr-dlg-break" onClick={more}>
            + {C.onlineAdd}
          </button>
        )}
        {spans.length > 0 && (
          <button type="button" className="jr-dlg-all" onClick={() => setSpans([])}>
            {C.onlineReset}
          </button>
        )}
      </div>
      <Problem text={problem} />
      <div className="jr-dlg-acts">
        <button type="button" className="jr-xbtn" onClick={onClose}>
          {A.cancel}
        </button>
        <button type="button" className="jr-xbtn is-main" disabled={busy} onClick={() => void save()}>
          {A.save}
        </button>
      </div>
    </Dialog>
  );
}
