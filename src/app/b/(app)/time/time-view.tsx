"use client";

/**
 * «Моё время» on the barber's phone (B4): four buttons for a break, a
 * vacation, sick days and special time; what is ahead, with his own entries
 * removable; his weekly hours; his prices; and his requests to Renat. What
 * waits for Renat and what applies at once is Renat's switch, said on top.
 */
import { useEffect, useState } from "react";
import type { ChangeCode, ChangeResult, MyPrice, MyTime } from "@/lib/barber/requests";
import { MAX_OFF_DAYS, MAX_SPANS, MAX_WEEKS, requestWords, weekGroups, type OffKind, type WeekHours } from "@/lib/barber/request-words";
import { addDays, localParts } from "@/lib/tz";
import { PlusIcon, XIcon } from "../../../admin/icons";
import { cap, dateWords, ddmm, eur, minsText, pick3 } from "../../copy.shared";
import { useB } from "../../lang";
import { BSheet } from "../sheet";
import { addOff, addSpecial, removeOff, removeSpecial, setHours, setPrice, withdraw } from "./actions";

type B = ReturnType<typeof useB>;
type T = B["time"];
type Open = { kind: OffKind } | { kind: "special" } | { kind: "hours" } | { kind: "price"; p: MyPrice } | null;
type Toast = { text: string; bad?: boolean };

const DAY = 86_400_000;
// a Monday: weekday names come from the dates after it
const MONDAY = "2026-11-30";
const REPEATS = [1, 2, 4, 8, MAX_WEEKS];
/** «Впереди» shows this many, then «show all». */
const FOLD = 6;
const isTime = (t: string) => /^\d{2}:\d{2}$/.test(t);
const toMin = (t: string) => (t === "24:00" ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const euros = (s: string) => Math.round(Number(s.replace(",", ".").trim()) * 100);

function codeText(T: T, code: ChangeCode): string {
  if (code === "past") return T.past;
  if (code === "too_long") return T.tooLong;
  if (code === "same") return T.same;
  if (code === "not_yours") return T.notYours;
  if (code === "not_found") return T.gone;
  return T.invalid;
}

/** «Вт, 1 декабря, 13:00–14:00» */
function spanText(from: number, to: number, tz: string, B: B): string {
  const a = localParts(from, tz);
  const b = localParts(to, tz);
  const day = cap(dateWords(a.date, B.lang));
  if (a.date === b.date || (b.time === "00:00" && to - from <= DAY)) return `${day}, ${a.time}–${b.time === "00:00" ? "24:00" : b.time}`;
  return `${day}, ${a.time} – ${cap(dateWords(b.date, B.lang))}, ${b.time}`;
}

/** «Вт, 1 декабря» or «1 дек. – 7 дек.» */
function daysText(from: number, to: number, tz: string, B: B): string {
  const first = localParts(from, tz).date;
  const last = localParts(to - 1, tz).date;
  if (first === last) return cap(dateWords(first, B.lang));
  const o = { day: "numeric", month: "short" } as const;
  return `${dateWords(first, B.lang, o)} – ${dateWords(last, B.lang, o)}`;
}

/** The next whole hour on the salon's clock, as a break's default start. */
function nextHour(tz: string): number {
  const m = localParts(Date.now(), tz).minutes;
  return Math.min(22 * 60, (Math.floor(m / 60) + 1) * 60);
}

export function TimeView({ data, tz, today, viewing }: { data: MyTime; tz: string; today: string; viewing: boolean }) {
  const B = useB();
  const T = B.time;
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const timeMode = viewing ? "now" : data.modes.barber_self_time;
  const priceMode = viewing ? "now" : data.modes.barber_self_price;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.text.length > 40 ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const done = (r: Extract<ChangeResult, { ok: true }>) => {
    setOpen(null);
    const head = r.status === "requested" ? T.sent : T.saved;
    setToast({ text: r.visitsInside ? `${head}. ${T.inside(r.visitsInside)}` : head });
  };

  const run = async (job: () => Promise<{ ok: true } | { ok: false; code: ChangeCode } | boolean>, ok: string) => {
    setBusy(true);
    try {
      const r = await job();
      setConfirm(null);
      if (r === true || (typeof r === "object" && r.ok)) setToast({ text: ok });
      else setToast({ text: typeof r === "object" && !r.ok ? codeText(T, r.code) : T.gone, bad: true });
    } catch {
      setToast({ text: B.error, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const ahead = [
    ...data.off.map((o) => ({
      id: o.id,
      type: "off" as const,
      from: o.from,
      title: T.add[o.kind] ?? o.kind,
      when: o.kind === "block" ? spanText(o.from, o.to, tz, B) : daysText(o.from, o.to, tz, B),
      note: o.note,
      waiting: o.status === "requested",
      extra: 0,
      mine: o.mine || viewing,
    })),
    ...data.special.map((x) => ({
      id: x.id,
      type: "special" as const,
      from: x.from,
      title: T.add.special,
      when: spanText(x.from, x.to, tz, B),
      note: "",
      waiting: false,
      extra: x.extraCents,
      mine: x.mine || viewing,
    })),
  ].sort((a, b) => a.from - b.from);

  return (
    <main className="adm-page bx-time">
      <h1 className="adm-h1">{T.title}</h1>
      <p className="adm-meta">
        {T.modeTime[timeMode]} {T.modePrice[priceMode]}
      </p>

      <div className="bx-time-add" role="group" aria-label={T.title}>
        {(["block", "vacation", "sick"] as const).map((k) => (
          <button key={k} type="button" className="adm-btn adm-btn-ghost" onClick={() => setOpen({ kind: k })}>
            <PlusIcon size={18} />
            {T.add[k]}
          </button>
        ))}
        <button type="button" className="adm-btn adm-btn-line" onClick={() => setOpen({ kind: "special" })}>
          <PlusIcon size={18} />
          {T.add.special}
        </button>
      </div>

      <section className="adm-card">
        <h2 className="adm-h2">{T.ahead}</h2>
        {ahead.length === 0 ? (
          <p className="adm-meta">{T.nothingAhead}</p>
        ) : (
          <ul className="adm-list bx-rows">
            {(all ? ahead : ahead.slice(0, FOLD)).map((a) => (
              <li key={a.id}>
                <div className="bx-row">
                  <span className="txt">
                    <b>
                      {a.title}
                      {a.extra > 0 && <span className="bx-plus"> +{eur(a.extra)}</span>}
                    </b>
                    <small>{a.when}</small>
                    {a.note && <small className="bx-note">{a.note}</small>}
                    {(a.waiting || !a.mine) && (
                      <span className="tags">
                        {a.waiting && <span className="adm-tag warn">{T.waiting}</span>}
                        {!a.mine && <span className="adm-tag">{T.byRenat}</span>}
                      </span>
                    )}
                  </span>
                  {a.mine && confirm !== a.id && (
                    <button type="button" className="adm-ibtn bx-x" aria-label={`${T.remove}: ${a.title}, ${a.when}`} onClick={() => setConfirm(a.id)}>
                      <XIcon />
                    </button>
                  )}
                </div>
                {confirm === a.id && (
                  <div className="bx-confirm">
                    <span>{T.removeQ}</span>
                    <div className="adm-btns">
                      <button
                        type="button"
                        className="adm-btn adm-btn-sm adm-btn-warn adm-btn-auto"
                        disabled={busy}
                        onClick={() => void run(() => (a.type === "off" ? removeOff(a.id) : removeSpecial(a.id)), T.removed)}
                      >
                        {T.removeYes}
                      </button>
                      <button type="button" className="adm-btn adm-btn-sm adm-btn-ghost adm-btn-auto" onClick={() => setConfirm(null)}>
                        {T.keep}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!all && ahead.length > FOLD && (
          <button type="button" className="adm-txt lime" onClick={() => setAll(true)}>
            {T.showAll(ahead.length)}
          </button>
        )}
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">{T.hours}</h2>
        <dl className="bx-week">
          {weekGroups(data.hours, B.lang).map((g) => (
            <div key={g.days}>
              <dt>{g.days}</dt>
              <dd className={g.hours === T.dayOff ? "is-off" : undefined}>{g.hours}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setOpen({ kind: "hours" })}>
          {T.hoursEdit}
        </button>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">{T.prices}</h2>
        {data.prices.length === 0 ? (
          <p className="adm-meta">{T.noPrices}</p>
        ) : (
          <ul className="adm-list bx-rows">
            {data.prices.map((p) => (
              <li key={p.serviceId}>
                <button type="button" className="bx-row" onClick={() => setOpen({ kind: "price", p })}>
                  <span className="txt">
                    <span className="plain">{pick3(p.name, B.lang)}</span>
                    <small>{minsText(p.min, B.h, B.min)}</small>
                    {p.waiting && (
                      <span className="tags">
                        <span className="adm-tag warn">{T.waitingFor(`${eur(p.waiting.cents)} · ${minsText(p.waiting.min, B.h, B.min)}`)}</span>
                      </span>
                    )}
                  </span>
                  <span className="end price">{eur(p.cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">{T.requests}</h2>
        {data.requests.length === 0 ? (
          <p className="adm-meta">{T.noRequests}</p>
        ) : (
          <ul className="adm-list bx-rows">
            {data.requests.map((r) => (
              <li key={r.id}>
                <div className="bx-row">
                  <span className="txt">
                    <span className="plain">{requestWords(r.what, tz, B.lang)}</span>
                    <span className="tags">
                      <span className={`adm-tag${r.status === "requested" ? " warn" : r.status === "approved" || r.status === "applied" ? " lime" : ""}`}>{T.status[r.status]}</span>
                      <small>{ddmm(localParts(r.createdAt, tz).date)}</small>
                    </span>
                    {r.answerNote && <small className="bx-note">{T.answer(r.answerNote)}</small>}
                  </span>
                  {r.status === "requested" && (
                    <button type="button" className="adm-txt lime" disabled={busy} onClick={() => void run(() => withdraw(r.id), T.withdrawn)}>
                      {T.withdraw}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <p className={`adm-toast${toast.bad ? " is-bad" : ""}`} role="status">
          {toast.text}
        </p>
      )}

      {open && (open.kind === "block" || open.kind === "vacation" || open.kind === "sick") && (
        <OffSheet kind={open.kind} tz={tz} today={today} ask={timeMode === "ask"} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === "special" && <SpecialSheet today={today} ask={timeMode === "ask"} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === "hours" && <HoursSheet hours={data.hours} ask={timeMode === "ask"} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === "price" && <PriceSheet p={open.p} ask={priceMode === "ask"} onClose={() => setOpen(null)} onDone={done} />}
    </main>
  );
}

type SheetProps = { ask: boolean; onClose: () => void; onDone: (r: Extract<ChangeResult, { ok: true }>) => void };

/** Send and the problem line under the sheet. */
function useSend(job: () => Promise<ChangeResult>, onDone: SheetProps["onDone"]) {
  const B = useB();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await job();
      if (r.ok) onDone(r);
      else setProblem(codeText(B.time, r.code));
    } catch {
      setProblem(B.error);
    } finally {
      setBusy(false);
    }
  };
  return { busy, problem, send };
}

function Bar({ ask, ok, busy, problem, onSend }: { ask: boolean; ok: boolean; busy: boolean; problem: string | null; onSend: () => void }) {
  const T = useB().time;
  return (
    <>
      {problem && (
        <p className="adm-err" role="alert">
          {problem}
        </p>
      )}
      <button type="button" className="adm-btn adm-btn-lime" disabled={busy || !ok} onClick={onSend}>
        {ask ? T.send : T.save}
      </button>
    </>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const T = useB().time;
  return (
    <label className="adm-field">
      <span>{T.note}</span>
      <input value={value} maxLength={300} placeholder={T.notePh} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function OffSheet({ kind, tz, today, ask, onClose, onDone }: SheetProps & { kind: OffKind; tz: string; today: string }) {
  const B = useB();
  const T = B.time;
  const block = kind === "block";
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(() => fromMin(nextHour(tz)));
  const [end, setEnd] = useState(() => fromMin(nextHour(tz) + 60));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const last = addDays(from, MAX_OFF_DAYS - 1);
  const ok = block ? isTime(start) && isTime(end) && toMin(end) > toMin(start) : from <= to && to <= last;
  const { busy, problem, send } = useSend(
    () => addOff(block ? { offKind: kind, date, start, end, note } : { offKind: kind, fromDate: from, toDate: to, note }),
    onDone,
  );
  return (
    <BSheet title={T.add[kind]} onClose={onClose} bar={<Bar ask={ask} ok={ok} busy={busy} problem={problem} onSend={() => void send()} />}>
      {block ? (
        <>
          <label className="adm-field">
            <span>{T.day}</span>
            <input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value < today ? today : e.target.value)} />
          </label>
          <div className="adm-grid2">
            <label className="adm-field">
              <span>{T.start}</span>
              <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="adm-field">
              <span>{T.end}</span>
              <input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        </>
      ) : (
        <div className="adm-grid2">
          <label className="adm-field">
            <span>{T.from}</span>
            <input
              type="date"
              value={from}
              min={today}
              onChange={(e) => {
                const v = e.target.value < today ? today : e.target.value;
                if (!v) return;
                setFrom(v);
                if (to < v) setTo(v);
              }}
            />
          </label>
          <label className="adm-field">
            <span>{T.to}</span>
            <input type="date" value={to} min={from} max={last} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>
        </div>
      )}
      {!block && <p className="adm-meta">{daysText(Date.parse(`${from}T12:00:00Z`), Date.parse(`${to}T12:00:00Z`) + 1, "UTC", B)}</p>}
      <NoteField value={note} onChange={setNote} />
      {ask && <p className="adm-meta">{T.modeTime.ask}</p>}
    </BSheet>
  );
}

function SpecialSheet({ today, ask, onClose, onDone }: SheetProps & { today: string }) {
  const B = useB();
  const T = B.time;
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  const [extra, setExtra] = useState("10");
  const [weeks, setWeeks] = useState(1);
  const [note, setNote] = useState("");
  const cents = euros(extra);
  const ok = isTime(start) && isTime(end) && toMin(end) > toMin(start) && Number.isInteger(cents) && cents >= 0 && cents <= 100_000;
  const { busy, problem, send } = useSend(() => addSpecial({ date, start, end, extraCents: cents, weeks, note }), onDone);
  const wd = cap(dateWords(date, B.lang, { weekday: "long" }));
  return (
    <BSheet title={T.add.special} onClose={onClose} bar={<Bar ask={ask} ok={ok} busy={busy} problem={problem} onSend={() => void send()} />}>
      <label className="adm-field">
        <span>{T.day}</span>
        <input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value < today ? today : e.target.value)} />
      </label>
      <div className="adm-grid2">
        <label className="adm-field">
          <span>{T.start}</span>
          <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>{T.end}</span>
          <input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="adm-field">
        <span>{T.extra}</span>
        <input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
        <small className="adm-meta">{T.extraHint}</small>
      </label>
      <div className="adm-field">
        <span>
          {T.repeat} · {wd}
        </span>
        <div className="bx-reasons bx-repeat" role="group" aria-label={T.repeat}>
          {REPEATS.map((n) => (
            <button key={n} type="button" aria-pressed={weeks === n} onClick={() => setWeeks(n)}>
              {T.weeks(n)}
            </button>
          ))}
        </div>
      </div>
      <NoteField value={note} onChange={setNote} />
    </BSheet>
  );
}

/** One day's spans are fine: whole times, each end after its start, in order, no overlaps. */
function dayOk(spans: [string, string][]): boolean {
  for (let i = 0; i < spans.length; i++) {
    const [a, b] = spans[i];
    if (!isTime(a) || !isTime(b) || toMin(b) <= toMin(a)) return false;
    if (i > 0 && toMin(a) < toMin(spans[i - 1][1])) return false;
  }
  return true;
}

function HoursSheet({ hours, ask, onClose, onDone }: SheetProps & { hours: WeekHours }) {
  const B = useB();
  const T = B.time;
  // a time input has no 24:00: it shows as 23:59 and goes back as 24:00
  const [week, setWeek] = useState<WeekHours>(() =>
    Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((wd) => [String(wd), (hours[String(wd)] ?? []).map(([a, b]) => [a, b === "24:00" ? "23:59" : b] as [string, string])])),
  );
  const set = (wd: number, spans: [string, string][]) => setWeek((w) => ({ ...w, [String(wd)]: spans }));
  const ok = [1, 2, 3, 4, 5, 6, 7].every((wd) => dayOk(week[String(wd)] ?? []));
  const { busy, problem, send } = useSend(
    () => setHours(Object.fromEntries(Object.entries(week).map(([wd, spans]) => [wd, spans.map(([a, b]) => [a, b === "23:59" ? "24:00" : b] as [string, string])]))),
    onDone,
  );
  return (
    <BSheet title={T.hours} onClose={onClose} bar={<Bar ask={ask} ok={ok} busy={busy} problem={problem} onSend={() => void send()} />}>
      <p className="adm-meta">{T.hoursHint}</p>
      {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
        const spans = week[String(wd)] ?? [];
        const name = cap(dateWords(addDays(MONDAY, wd - 1), B.lang, { weekday: "long" }));
        const lastEnd = spans.length ? toMin(spans[spans.length - 1][1]) : 0;
        return (
          <fieldset key={wd} className={`bx-wday${dayOk(spans) ? "" : " is-bad"}`}>
            <legend className="adm-check">
              <input type="checkbox" className="adm-sw" checked={spans.length > 0} aria-label={`${name}: ${T.works}`} onChange={(e) => set(wd, e.target.checked ? [["10:00", "20:00"]] : [])} />
              <b>{name}</b>
              {!spans.length && <small>{T.dayOff}</small>}
            </legend>
            {spans.map(([a, b], i) => (
              <div key={i} className="bx-span">
                <input type="time" step={300} value={a} aria-label={`${name}: ${T.start}`} onChange={(e) => set(wd, spans.map((s, j) => (j === i ? [e.target.value, s[1]] : s)))} />
                <span aria-hidden="true">–</span>
                <input type="time" step={300} value={b} aria-label={`${name}: ${T.end}`} onChange={(e) => set(wd, spans.map((s, j) => (j === i ? [s[0], e.target.value] : s)))} />
                <button type="button" className="adm-ibtn bx-x" aria-label={`${name}: ${T.removeSpan}`} onClick={() => set(wd, spans.filter((_, j) => j !== i))}>
                  <XIcon />
                </button>
              </div>
            ))}
            {spans.length > 0 && spans.length < MAX_SPANS && lastEnd <= 22 * 60 && (
              <button type="button" className="adm-txt lime" onClick={() => set(wd, [...spans, [fromMin(lastEnd + 60), fromMin(Math.min(lastEnd + 120, 23 * 60 + 59))]])}>
                <PlusIcon size={16} />
                {T.addSpan}
              </button>
            )}
          </fieldset>
        );
      })}
      {!ok && <p className="adm-err">{T.invalid}</p>}
    </BSheet>
  );
}

function PriceSheet({ p, ask, onClose, onDone }: SheetProps & { p: MyPrice }) {
  const B = useB();
  const T = B.time;
  const startCents = p.waiting?.cents ?? p.cents;
  const [price, setPriceText] = useState(String(startCents / 100));
  const [min, setMin] = useState(p.waiting?.min ?? p.min);
  const cents = euros(price);
  const ok = Number.isInteger(cents) && cents >= 0 && cents <= 1_000_000 && (cents !== p.cents || min !== p.min);
  const { busy, problem, send } = useSend(() => setPrice({ serviceId: p.serviceId, priceCents: cents, durationMin: min }), onDone);
  return (
    <BSheet title={T.priceTitle} onClose={onClose} bar={<Bar ask={ask} ok={ok} busy={busy} problem={problem} onSend={() => void send()} />}>
      <p className="adm-time">
        <b>{pick3(p.name, B.lang)}</b>
        <span>
          {eur(p.cents)} · {minsText(p.min, B.h, B.min)}
        </span>
      </p>
      <label className="adm-field">
        <span>{T.price}</span>
        <input inputMode="decimal" value={price} onChange={(e) => setPriceText(e.target.value)} />
      </label>
      <div className="adm-field">
        <span>{T.minutes}</span>
        <div className="bx-step">
          <button type="button" className="adm-ibtn" aria-label="−5" disabled={min <= 5} onClick={() => setMin((m) => Math.max(5, m - 5))}>
            −
          </button>
          <b aria-live="polite">{minsText(min, B.h, B.min)}</b>
          <button type="button" className="adm-ibtn" aria-label="+5" disabled={min >= 720} onClick={() => setMin((m) => Math.min(720, m + 5))}>
            +
          </button>
        </div>
      </div>
      {ask && <p className="adm-meta">{T.modePrice.ask}</p>}
    </BSheet>
  );
}
