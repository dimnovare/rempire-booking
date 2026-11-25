"use client";

/**
 * «Моё время» on the barber's phone (B4; the design board «Моё время»,
 * 25.11): on top, what applies at once and what after approval (the
 * login's rights); four buttons for a break, a vacation, sick days and
 * special time; what is ahead, his own entries removable and his waiting
 * requests withdrawable, each after a question; his weekly hours; his
 * prices; and one button for his requests of the last 30 days.
 */
import { useEffect, useId, useState } from "react";
import type { ChangeCode, ChangeResult, MyPrice, MyTime } from "@/lib/barber/requests";
import { MAX_OFF_DAYS, MAX_SPANS, MAX_WEEKS, requestWords, weekGroups, type OffKind, type WeekHours } from "@/lib/barber/request-words";
import { cleanExtra, extraText, hasExtra } from "@/lib/slots";
import { addDays, localParts } from "@/lib/tz";
import { PlusIcon, XIcon } from "../../../admin/icons";
import { cap, dateWords, ddmm, eur, minsText, pick3 } from "../../copy.shared";
import { useB } from "../../lang";
import { Ic, type IconName } from "../sell/icons";
import { BSheet } from "../sheet";
import { addOff, addSpecial, removeOff, removeSpecial, setHours, setPrice, withdraw } from "./actions";

type B = ReturnType<typeof useB>;
type T = B["time"];
type Open = { kind: OffKind } | { kind: "special" } | { kind: "hours" } | { kind: "price"; p: MyPrice } | { kind: "history" } | null;
type Toast = { text: string; bad?: boolean };
type Job = () => Promise<{ ok: true } | { ok: false; code: ChangeCode } | boolean>;

const DAY = 86_400_000;
// a Monday: weekday names come from the dates after it
const MONDAY = "2026-11-30";
const REPEATS = [1, 2, 4, 8, MAX_WEEKS];
/** «Впереди» shows this many, then «show all». */
const FOLD = 6;
const ADD: { k: OffKind | "special"; icon: IconName }[] = [
  { k: "block", icon: "time" },
  { k: "vacation", icon: "cal" },
  { k: "sick", icon: "plus" },
  { k: "special", icon: "star" },
];
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

/** One line of «Впереди»: a break, days off or special time, set or still waiting. */
type Item = {
  key: string;
  from: number;
  title: string;
  when: string;
  note: string;
  extra: string;
  weeks: number;
  /** waiting for an answer: withdrawn, not removed */
  waiting: boolean;
  /** set by the salon: removed only there */
  mine: boolean;
  remove?: Job;
  withdraw?: Job;
};

export function TimeView({ data, tz, today, viewing }: { data: MyTime; tz: string; today: string; viewing: boolean }) {
  const B = useB();
  const T = B.time;
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const subId = useId();
  // by the login's rights (src/lib/barber/requests.ts, whoOf): at once, or a request
  const timeMode = data.modes.time === "now" ? "now" : "ask";
  const priceMode = data.modes.price === "now" ? "now" : "ask";

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

  const run = async (job: Job, ok: string) => {
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

  const waitingReqs = data.requests.filter((r) => r.status === "requested");
  const ahead: Item[] = [
    ...data.off.map((o) => {
      const waiting = o.status === "requested";
      // a waiting day off goes with its request: removing it withdraws the request (barberRemoveTimeOff)
      const job: Job = () => removeOff(o.id);
      return {
        key: `off:${o.id}`,
        from: o.from,
        title: T.add[o.kind] ?? o.kind,
        when: o.kind === "block" ? spanText(o.from, o.to, tz, B) : daysText(o.from, o.to, tz, B),
        note: o.note,
        extra: "",
        weeks: 1,
        waiting,
        mine: o.mine || viewing,
        ...(waiting ? { withdraw: job } : { remove: job }),
      };
    }),
    ...data.special.map((x) => ({
      key: `sp:${x.id}`,
      from: x.from,
      title: T.add.special,
      when: spanText(x.from, x.to, tz, B),
      note: "",
      // the window as he set it: «+20 €» or «+50 %»
      extra: hasExtra(x) ? extraText(x) : "",
      weeks: 1,
      waiting: false,
      mine: x.mine || viewing,
      remove: () => removeSpecial(x.id),
    })),
    // special time he asked for is not in the calendar until the salon says yes: shown here as waiting
    ...waitingReqs.flatMap((r) =>
      r.what.kind === "special" && r.what.action === "add"
        ? [
            {
              key: `rq:${r.id}`,
              from: r.what.from,
              title: T.add.special,
              when: spanText(r.what.from, r.what.to, tz, B),
              note: r.note,
              extra: extraText(r.what),
              weeks: r.what.weeks ?? 1,
              waiting: true,
              mine: true,
              withdraw: () => withdraw(r.id),
            },
          ]
        : [],
    ),
  ].sort((a, b) => a.from - b.from);
  const hoursWait = waitingReqs.find((r) => r.what.kind === "hours");

  return (
    <main className="adm-page bx-time">
      <h1 className="adm-h1">{T.title}</h1>

      <div className="adm-card bx-rules">
        <Rule mode={timeMode} text={`${T.applies.time}: ${T.when[timeMode]}`} />
        <Rule mode={priceMode} text={`${T.applies.price}: ${T.when[priceMode]}`} />
      </div>

      <div className="bx-time-add" role="group" aria-label={T.title}>
        {ADD.map(({ k, icon }) => (
          <button
            key={k}
            type="button"
            className="adm-btn adm-btn-ghost bx-act"
            aria-label={T.add[k]}
            aria-describedby={`${subId}-${k}`}
            onClick={() => setOpen({ kind: k })}
          >
            <span>
              <Ic name={icon} size={18} />
              {T.add[k]}
            </span>
            <small id={`${subId}-${k}`}>{T.addSub[k]}</small>
          </button>
        ))}
      </div>

      <section className="bx-sec">
        <h2 className="bx-ch">{T.ahead}</h2>
        {ahead.length === 0 ? (
          <p className="adm-meta">{T.nothingAhead}</p>
        ) : (
          <ul className="bx-box bx-rows">
            {(all ? ahead : ahead.slice(0, FOLD)).map((a) => (
              <li key={a.key}>
                <div className="bx-row bx-item">
                  <span className="txt">
                    <span className="tags">
                      <b>{a.title}</b>{" "}
                      {a.extra && <span className="bx-tag y">{T.extraTag(a.extra)}</span>}
                      {a.waiting && <span className="bx-tag amb">{T.waiting}</span>}
                      {!a.mine && <span className="bx-tag">{T.bySalon}</span>}
                    </span>
                    <span className="plain">{a.when}</span>
                    {a.weeks > 1 && (
                      <small>
                        {T.repeat}: {T.weeks(a.weeks)}
                      </small>
                    )}
                    {(a.note || (a.withdraw && confirm !== a.key)) && (
                      <small className="bx-note">
                        {a.note}
                        {a.note && a.withdraw && confirm !== a.key && " · "}
                        {a.withdraw && confirm !== a.key && (
                          <button type="button" className="bx-lnk sm" onClick={() => setConfirm(a.key)}>
                            {T.withdraw}
                          </button>
                        )}
                      </small>
                    )}
                  </span>
                  {a.remove && a.mine && confirm !== a.key && (
                    <button type="button" className="adm-ibtn bx-x" aria-label={`${T.remove}: ${a.title}, ${a.when}`} onClick={() => setConfirm(a.key)}>
                      <XIcon />
                    </button>
                  )}
                </div>
                {confirm === a.key && a.remove && (
                  <Confirm q={T.removeQ} yes={T.removeYes} busy={busy} onYes={() => void run(a.remove!, T.removed)} onNo={() => setConfirm(null)} />
                )}
                {confirm === a.key && a.withdraw && (
                  <Confirm q={T.withdrawQ} yes={T.withdrawYes} busy={busy} onYes={() => void run(a.withdraw!, T.withdrawn)} onNo={() => setConfirm(null)} />
                )}
              </li>
            ))}
          </ul>
        )}
        {!all && ahead.length > FOLD && (
          <button type="button" className="bx-lnk" onClick={() => setAll(true)}>
            {T.showAll(ahead.length)}
          </button>
        )}
      </section>

      <section className="bx-sec">
        <h2 className="bx-ch">{T.hours}</h2>
        <div className="adm-card bx-hours-card">
          <dl className="bx-hours">
            {weekGroups(data.hours, B.lang).map((g) => (
              <div key={g.days}>
                <dt>{g.days}</dt>
                <dd className={g.hours === T.dayOff ? "is-off" : undefined}>{g.hours}</dd>
              </div>
            ))}
          </dl>
          {hoursWait && (
            <div className="bx-hours-wait">
              <span className="bx-tag amb">{T.waiting}</span>
              {confirm !== `rq:${hoursWait.id}` && (
                <button type="button" className="bx-lnk sm" onClick={() => setConfirm(`rq:${hoursWait.id}`)}>
                  {T.withdraw}
                </button>
              )}
            </div>
          )}
          {hoursWait && confirm === `rq:${hoursWait.id}` && (
            <Confirm q={T.withdrawQ} yes={T.withdrawYes} busy={busy} onYes={() => void run(() => withdraw(hoursWait.id), T.withdrawn)} onNo={() => setConfirm(null)} />
          )}
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setOpen({ kind: "hours" })}>
            {T.hoursEdit}
          </button>
          <p className="bx-tip">{T.hoursHint}</p>
        </div>
      </section>

      <section className="bx-sec">
        <h2 className="bx-ch">{T.prices}</h2>
        {data.prices.length === 0 ? (
          <p className="adm-meta">{T.noPrices}</p>
        ) : (
          <ul className="bx-box bx-rows">
            {data.prices.map((p) => (
              <li key={p.serviceId}>
                <button type="button" className="bx-row" onClick={() => setOpen({ kind: "price", p })}>
                  <span className="txt">
                    <span className="plain">{pick3(p.name, B.lang)}</span>
                    <small className="tags">
                      {minsText(p.min, B.h, B.min)}
                      {p.waiting && <span className="bx-tag amb">{T.waitingFor(`${eur(p.waiting.cents)} · ${minsText(p.waiting.min, B.h, B.min)}`)}</span>}
                    </small>
                  </span>
                  <span className="end price">{eur(p.cents)}</span>
                  <span className="bx-chev">
                    <Ic name="right" size={18} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="adm-btn adm-btn-line bx-hist" onClick={() => setOpen({ kind: "history" })}>
        <span>{T.history}</span>{" "}
        {waitingReqs.length > 0 && <span className="bx-tag amb">{T.waitingN(waitingReqs.length)}</span>}
        <Ic name="right" size={16} />
      </button>

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
      {open?.kind === "history" && (
        <BSheet title={T.requests} onClose={() => setOpen(null)}>
          {data.requests.length === 0 ? (
            <p className="adm-meta">{T.noRequests}</p>
          ) : (
            <ul className="bx-box bx-rows">
              {data.requests.map((r) => {
                const key = `h:${r.id}`;
                return (
                  <li key={r.id}>
                    <div className="bx-row">
                      <span className="txt">
                        <span className="plain">{requestWords(r.what, tz, B.lang)}</span>
                        <span className="tags">
                          <span className={`bx-tag${r.status === "requested" ? " amb" : r.status === "approved" || r.status === "applied" ? " ok" : ""}`}>{T.status[r.status]}</span>
                          <small>{ddmm(localParts(r.createdAt, tz).date)}</small>
                        </span>
                        {r.answerNote && <small className="bx-note">{T.answer(r.answerNote)}</small>}
                      </span>
                      {r.status === "requested" && confirm !== key && (
                        <button type="button" className="bx-lnk sm" onClick={() => setConfirm(key)}>
                          {T.withdraw}
                        </button>
                      )}
                    </div>
                    {confirm === key && (
                      <Confirm q={T.withdrawQ} yes={T.withdrawYes} busy={busy} onYes={() => void run(() => withdraw(r.id), T.withdrawn)} onNo={() => setConfirm(null)} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </BSheet>
      )}
    </main>
  );
}

/** «Перерывы, отпуск и часы: сразу» with a tick, or «…: после согласования» with a clock. */
function Rule({ mode, text }: { mode: "now" | "ask"; text: string }) {
  return (
    <p className={`bx-rule is-${mode}`}>
      <Ic name={mode === "now" ? "check" : "clock"} size={16} />
      <span>{text}</span>
    </p>
  );
}

/** The question under a line before it goes: «Убрать это?» or «Отозвать этот запрос?». */
function Confirm({ q, yes, busy, onYes, onNo }: { q: string; yes: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  const T = useB().time;
  return (
    <div className="bx-confirm">
      <span>{q}</span>
      <div className="adm-btns">
        <button type="button" className="adm-btn adm-btn-sm adm-btn-warn adm-btn-auto" disabled={busy} onClick={onYes}>
          {yes}
        </button>
        <button type="button" className="adm-btn adm-btn-sm adm-btn-ghost adm-btn-auto" onClick={onNo}>
          {T.keep}
        </button>
      </div>
    </div>
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
      {ask && <p className="adm-meta">{T.askNote.time}</p>}
    </BSheet>
  );
}

function SpecialSheet({ today, ask, onClose, onDone }: SheetProps & { today: string }) {
  const B = useB();
  const T = B.time;
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  // the extra is an amount or a percent of the visit's price; each way keeps
  // its own number, so «10 €» never turns into «10 %» by a tap
  const [unit, setUnit] = useState<"eur" | "pct">("eur");
  const [extra, setExtra] = useState({ eur: "10", pct: "50" });
  const [weeks, setWeeks] = useState(1);
  const [note, setNote] = useState("");
  const sent: { extraCents?: number; extraPct?: number } = unit === "pct" ? { extraPct: Number(extra.pct.replace(",", ".").trim()) } : { extraCents: euros(extra.eur) };
  // the server's own rule: one of the two, a whole number above zero and in range
  const ok = isTime(start) && isTime(end) && toMin(end) > toMin(start) && cleanExtra(sent.extraCents, sent.extraPct) !== null;
  const { busy, problem, send } = useSend(() => addSpecial({ date, start, end, ...sent, weeks, note }), onDone);
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
      <div className="adm-field">
        <span>{T.extra}</span>
        <div className="adm-row">
          <input inputMode={unit === "pct" ? "numeric" : "decimal"} aria-label={T.extra} value={extra[unit]} onChange={(e) => setExtra({ ...extra, [unit]: e.target.value })} />
          <div className="adm-seg adm-seg-wide" role="group" aria-label={T.extraUnit} style={{ flex: "0 0 112px" }}>
            <button type="button" aria-pressed={unit === "eur"} onClick={() => setUnit("eur")}>
              €
            </button>
            <button type="button" aria-pressed={unit === "pct"} onClick={() => setUnit("pct")}>
              %
            </button>
          </div>
        </div>
        <small className="adm-meta">{unit === "pct" ? T.extraHintPct : T.extraHint}</small>
      </div>
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
      {ask && <p className="adm-meta">{T.askNote.price}</p>}
    </BSheet>
  );
}
