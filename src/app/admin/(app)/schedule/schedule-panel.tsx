"use client";

/**
 * «График работы»: the panel that changes the marked cells, and the window
 * of «Скопировать график» (schedule-view.tsx).
 *
 * The panel has three ways to fill:
 *   «Выбранные дни»   the marked cells get a kind: a working day (hours
 *                     from–to and the breaks inside), a day off, a
 *                     vacation or a sick day;
 *   «По дням недели»  the ticked weekdays of a period get the hours, for
 *                     the barbers who have a marked cell;
 *   «По сменам»       so many days on, so many off, over a period.
 * «Сохранить» (or «Заполнить») writes it; «Отмена» drops the marks. A day
 * with visits the change would cut is refused: the panel says which days
 * and how many visits (the rules: src/lib/admin/schedule.ts).
 *
 * From 900px it is the admin's panel on the right (sheet.tsx), open while
 * anything is marked, with the grid still in reach beside it; on a phone
 * the same sheet from the bottom.
 */
import { useEffect, useState } from "react";
import type { Applied, Refused, ScheduleData, ScheduleStaff } from "@/lib/admin/schedule";
import { BREAKS_MAX, COPY_DAYS, DAY_KINDS, daysBetween, daySpans, endOfNextMonth, panelOf, SHIFT_RUN_MAX, type DayKind, type Span } from "@/lib/admin/schedule-plan";
import { addDays, isoWeekday } from "@/lib/tz";
import { PlusIcon, XIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { Sheet } from "../sheet";
import { copyAction, saveCellsAction, templateAction } from "./actions";

/** A marked cell. */
export type Picked = { staffId: string; date: string };
type Mode = "cells" | "weekdays" | "shifts";
const MODES: readonly Mode[] = ["cells", "weekdays", "shifts"];
/** The days a refusal names, at most; the rest is «…». */
const NAMED = 8;

const noon = (date: string) => new Date(`${date}T12:00:00Z`);

/** «Valentin, 21.11 (2 записи); …»: the days a change left alone, by the barber's name. */
function useDayList(staff: readonly Pick<ScheduleStaff, "id" | "name">[]) {
  const A = useA();
  const fmt = new Intl.DateTimeFormat(A.intl, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return (list: Refused[]) =>
    list
      .slice(0, NAMED)
      .map((r) => A.schedule.dayVisits(staff.find((s) => s.id === r.staffId)?.name ?? "?", fmt.format(noon(r.date)), r.visits))
      .join("; ") + (list.length > NAMED ? "; …" : "");
}

export function EditPanel({ data, picked, onClose, onSaved }: { data: ScheduleData; picked: Picked[]; onClose: () => void; onSaved: (text: string) => void }) {
  const A = useA();
  const S = A.schedule;
  const dayList = useDayList(data.staff);
  // the form starts as the first marked cell is: its kind and its hours
  const [seed] = useState(() => {
    const first = picked[0];
    const cell = first ? data.staff.find((s) => s.id === first.staffId)?.cells[first.date] : undefined;
    const hours = cell?.kind === "work" ? panelOf(cell.spans) : null;
    const dates = picked.map((c) => c.date).sort();
    return {
      kind: (cell?.kind === "vacation" || cell?.kind === "sick" ? cell.kind : "work") as DayKind,
      from: hours?.from ?? "10:00",
      to: hours?.to ?? "19:00",
      breaks: hours?.breaks ?? [],
      dateFrom: dates[0] ?? data.dates[0],
      dateTo: data.dates[data.dates.length - 1],
    };
  });
  const [mode, setMode] = useState<Mode>("cells");
  const [kind, setKind] = useState<DayKind>(seed.kind);
  const [from, setFrom] = useState(seed.from);
  const [to, setTo] = useState(seed.to);
  const [breaks, setBreaks] = useState<Span[]>(seed.breaks);
  // a template: the weekdays start as those of the marked cells
  const [weekdays, setWeekdays] = useState<number[]>(() => [...new Set(picked.map((c) => isoWeekday(c.date)))].sort());
  const [dateFrom, setDateFrom] = useState(seed.dateFrom);
  const [dateTo, setDateTo] = useState(seed.dateTo);
  const [on, setOn] = useState("2");
  const [off, setOff] = useState("2");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const staffIds = [...new Set(picked.map((c) => c.staffId))];
  const names = data.staff
    .filter((s) => staffIds.includes(s.id))
    .map((s) => s.name)
    .join(", ");
  const hours = mode !== "cells" || kind === "work";

  const save = async () => {
    setProblem(null);
    setNote(null);
    // what can be told without asking: hours that are none
    if (hours && !daySpans(from, to, breaks)) return setProblem(S.bad.spans);
    if (mode !== "cells" && !daysBetween(dateFrom, dateTo)) return setProblem(S.bad.period);
    setBusy(true);
    try {
      const r: Applied =
        mode === "cells"
          ? await saveCellsAction({ cells: picked, kind, from, to, breaks })
          : await templateAction({ staffIds, mode, dateFrom, dateTo, weekdays, on: Number(on), off: Number(off), from, to, breaks });
      if (r.ok) {
        // a template that left days alone says which, and the panel stays to say it
        if (r.skipped.length) setNote(`${S.filled(r.written)} ${S.skipped(dayList(r.skipped))}`);
        else return onSaved(mode === "cells" ? S.saved(r.written) : S.filled(r.written));
      } else if (r.code === "visits") setProblem(S.refused(dayList(r.refused)));
      else if (r.code === "forbidden") setProblem(A.rights.refused);
      else setProblem(S.bad[r.field] ?? A.error);
    } catch {
      setProblem(A.error);
    }
    setBusy(false);
  };

  return (
    <Sheet
      title={S.panel}
      onClose={onClose}
      bar={
        <>
          {problem && (
            <p className="adm-err" role="alert">
              {problem}
            </p>
          )}
          {note && (
            <p className="adm-meta" role="status">
              {note}
            </p>
          )}
          <div className="adm-bar-row">
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={onClose}>
              {A.cancel}
            </button>
            <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void save()}>
              {mode === "cells" ? A.save : S.fill}
            </button>
          </div>
        </>
      }
    >
      <p className="adm-meta sc-picked">{S.picked(picked.length, staffIds.length)}</p>
      <div className="adm-seg adm-seg-wide sc-modes" role="group" aria-label={S.mode}>
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setProblem(null);
              setNote(null);
            }}
          >
            {S.modes[m]}
          </button>
        ))}
      </div>

      {mode === "cells" ? (
        <label className="adm-field">
          <span>{S.kind}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as DayKind)}>
            {DAY_KINDS.map((k) => (
              <option key={k} value={k}>
                {S.kinds[k]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <p className="adm-note">
            {S.forStaff(names)}
            <br />
            {S.templateHint[mode]}
          </p>
          {mode === "weekdays" ? (
            <div className="adm-field">
              <span>{S.weekdays}</span>
              <div className="sc-wd" role="group" aria-label={S.weekdays}>
                {A.staff.weekdays.map((w, i) => {
                  const day = i + 1;
                  const ticked = weekdays.includes(day);
                  return (
                    <button key={day} type="button" className="adm-chip" aria-pressed={ticked} onClick={() => setWeekdays(ticked ? weekdays.filter((x) => x !== day) : [...weekdays, day].sort())}>
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="adm-row">
              <label className="adm-field">
                <span>{S.on}</span>
                <input type="number" inputMode="numeric" min={1} max={SHIFT_RUN_MAX} value={on} onChange={(e) => setOn(e.target.value)} />
              </label>
              <label className="adm-field">
                <span>{S.off}</span>
                <input type="number" inputMode="numeric" min={1} max={SHIFT_RUN_MAX} value={off} onChange={(e) => setOff(e.target.value)} />
              </label>
            </div>
          )}
          <div className="adm-row">
            <label className="adm-field">
              <span>{S.dateFrom}</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="adm-field">
              <span>{S.dateTo}</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </>
      )}

      {hours && (
        <>
          <div className="adm-row">
            <label className="adm-field">
              <span>{S.from}</span>
              <input type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="adm-field">
              <span>{S.to}</span>
              <input type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="adm-field sc-breaks">
            <span>{S.breaks}</span>
            {breaks.map((b, i) => (
              <div key={i} className="sc-break">
                <input type="time" step={300} aria-label={S.breakFrom} value={b[0]} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
                <span aria-hidden="true">–</span>
                <input type="time" step={300} aria-label={S.breakTo} value={b[1]} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                <button type="button" className="adm-ibtn" aria-label={S.removeBreak} title={S.removeBreak} onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}>
                  <XIcon size={16} />
                </button>
              </div>
            ))}
            {breaks.length < BREAKS_MAX && (
              <button type="button" className="adm-btn adm-btn-line adm-btn-sm sc-addbreak" onClick={() => setBreaks([...breaks, ["13:00", "14:00"]])}>
                <PlusIcon size={14} />
                {S.addBreak}
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/**
 * «Скопировать график»: one barber's days onto others, for a period from
 * today on that ends by the last day of next month. It asks first: the
 * copy replaces their days and cannot be taken back.
 */
export function CopyDialog({ from, others, today, onClose }: { from: ScheduleStaff; others: ScheduleStaff[]; today: string; onClose: () => void }) {
  const A = useA();
  const S = A.schedule;
  const frame = useFrame();
  const dayList = useDayList(others);
  const until = endOfNextMonth(today);
  const [to, setTo] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(() => {
    const two = addDays(today, COPY_DAYS - 1);
    return two > until ? until : two;
  });
  const [breaks, setBreaks] = useState(true);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);

  const fmt = new Intl.DateTimeFormat(A.intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const next = () => {
    if (!to.length) return setErr(S.bad.to);
    const days = daysBetween(dateFrom, dateTo);
    if (!days || days[0] < today || days[days.length - 1] > until) return setErr(S.copyBadPeriod);
    setErr(null);
    setAsking(true);
  };
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await copyAction({ fromStaffId: from.id, toStaffIds: to, dateFrom, dateTo, breaks });
      if (r.ok) {
        const text = `${S.copied(r.written)}${r.skipped.length ? ` ${S.skipped(dayList(r.skipped))}` : ""}`;
        // with nothing skipped a line at the bottom is enough; else the window stays to say which days
        if (!r.skipped.length) {
          frame.say(text);
          return onClose();
        }
        setDone(text);
      } else setErr(r.code === "forbidden" ? A.rights.refused : r.code === "invalid" ? (r.field === "period" ? S.copyBadPeriod : (S.bad[r.field] ?? A.error)) : A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
    setAsking(false);
  };

  const title = S.copyTitle(from.name);
  const names = others
    .filter((s) => to.includes(s.id))
    .map((s) => s.name)
    .join(", ");
  return (
    <div className="cc-ask-wrap" onClick={() => !busy && onClose()}>
      <div className="cc-ask sc-copy" role={asking ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {done ? (
          <p role="status">{done}</p>
        ) : asking ? (
          <p>{S.copyAsk(from.name, names, fmt.format(noon(dateFrom)), fmt.format(noon(dateTo)))}</p>
        ) : (
          <>
            <fieldset className="cc-group">
              <legend>{S.copyTo}</legend>
              {others.map((s) => (
                <label key={s.id} className="cc-check">
                  <input type="checkbox" checked={to.includes(s.id)} onChange={(e) => setTo(e.target.checked ? [...to, s.id] : to.filter((x) => x !== s.id))} />
                  <span>{s.name}</span>
                </label>
              ))}
            </fieldset>
            <div className="sc-copy-dates">
              <label className="cc-field">
                <span>{S.dateFrom}</span>
                <input type="date" min={today} max={until} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="cc-field">
                <span>{S.dateTo}</span>
                <input type="date" min={today} max={until} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
            <p className="adm-meta">{S.copyHint(fmt.format(noon(until)))}</p>
            <label className="cc-check">
              <input type="checkbox" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} />
              <span>{S.copyBreaks}</span>
            </label>
          </>
        )}
        {err && (
          <p className="adm-err" role="alert">
            {err}
          </p>
        )}
        <div className="cc-ask-btns">
          <button type="button" className="cc-btn" disabled={busy} onClick={done ? onClose : asking ? () => setAsking(false) : onClose}>
            {done ? A.close : asking ? A.back : A.cancel}
          </button>
          {!done && (
            <button type="button" className="cc-btn cc-btn-main" disabled={busy} onClick={asking ? () => void run() : next}>
              {asking ? S.copyYes : S.copy}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
