"use client";

/**
 * Booking from the barber's phone (B3), in his own column: a new visit (a
 * walk-in, or the client's next visit), a move, an emergency cancel. The
 * free times come from the server for the chosen services and day; «Другое
 * время» takes any time, and outside his hours or over his break the server
 * asks for a second «yes», as in the admin.
 */
import { useEffect, useRef, useState } from "react";
import type { AdminOutcome } from "@/lib/admin/visits";
import { momentAt } from "@/lib/admin/grid";
import type { Offer } from "@/lib/barber/book";
import type { BVisit } from "@/lib/barber/day";
import type { FreeStart } from "@/lib/barber/gaps";
import { addDays, localParts } from "@/lib/tz";
import { NextIcon, PrevIcon, TickIcon } from "../../admin/icons";
import { cap, dateWords, eur, hm, minsText, pick3 } from "../copy.shared";
import { useB } from "../lang";
import { BSheet } from "./sheet";
import { bookVisit, cancelVisit, findMyClients, freeStarts, moveVisit } from "./visit-actions";

const MIN = 60_000;
const newKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`);
const isTime = (t: string) => /^\d{2}:\d{2}$/.test(t);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export type Picked = { id: string; name: string; phone: string | null };
export type NewPrefill = { date: string; start?: number; client?: Picked; serviceIds?: string[] };

type B = ReturnType<typeof useB>;

/** The words for a refused booking or move: an error line, or the «anyway» question. */
function problemOf(B: B, r: Extract<AdminOutcome, { ok: false }>): { warn?: string; problem?: string } {
  if (r.code === "outside_hours") return { warn: B.book.outsideHours };
  if (r.code === "time_off") return { warn: B.book.overBlock };
  if (r.code === "overlap") return { problem: B.book.overlap };
  if (r.code === "not_offered") return { problem: B.book.notOffered };
  if (r.code === "not_found" || r.code === "cancelled") return { problem: B.book.gone };
  if (r.field === "phone") return { problem: B.book.badPhone };
  if (r.field === "name" || r.field === "client") return { problem: B.book.needClient };
  return { problem: B.book.invalid };
}

/** The day picker: one day back, the date, one day on. */
function DayPick({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  const B = useB();
  return (
    <div className="adm-field">
      <span>{B.book.day}</span>
      <div className="bx-daypick">
        <button type="button" className="adm-ibtn" aria-label={B.book.prevDay} disabled={date <= today} onClick={() => onChange(addDays(date, -1))}>
          <PrevIcon />
        </button>
        <label>
          <b>{cap(dateWords(date, B.lang, { weekday: "short", day: "numeric", month: "long" }))}</b>
          <input type="date" value={date} min={today} aria-label={B.book.day} onChange={(e) => e.target.value && onChange(e.target.value < today ? today : e.target.value)} />
        </label>
        <button type="button" className="adm-ibtn" aria-label={B.book.nextDay} onClick={() => onChange(addDays(date, 1))}>
          <NextIcon />
        </button>
      </div>
    </div>
  );
}

/**
 * The free times as buttons, and «another time» for anything else. Returns
 * the chosen moment through onChange (null: nothing chosen).
 */
function TimePick({
  date,
  tz,
  starts,
  value,
  current,
  onChange,
}: {
  date: string;
  tz: string;
  starts: FreeStart[] | null;
  value: number | null;
  current?: number;
  onChange: (start: number | null, typed: boolean) => void;
}) {
  const B = useB();
  const [other, setOther] = useState(false);
  const [time, setTime] = useState("");
  const pickOther = (t: string) => {
    setTime(t);
    onChange(isTime(t) ? momentAt(date, toMin(t), tz) : null, true);
  };
  return (
    <div className="adm-field">
      <span>{B.book.time}</span>
      {starts === null ? (
        <p className="adm-meta">{B.book.looking}</p>
      ) : starts.length === 0 ? (
        <p className="adm-meta">{B.book.noTimes}</p>
      ) : (
        <div className="bx-times" role="group" aria-label={B.book.time}>
          {starts.map((s) => (
            <button
              key={s.start}
              type="button"
              aria-pressed={!other && value === s.start}
              className={s.extraCents ? "is-sp" : undefined}
              disabled={s.start === current}
              onClick={() => {
                setOther(false);
                onChange(s.start, false);
              }}
            >
              <b>{hm(s.start, tz)}</b>
              {s.start === current ? <small>{B.book.current}</small> : s.extraCents > 0 && <small>+{eur(s.extraCents)}</small>}
            </button>
          ))}
        </div>
      )}
      {other ? (
        <input type="time" step={300} value={time} aria-label={B.book.otherTime} autoFocus onChange={(e) => pickOther(e.target.value)} />
      ) : (
        <button
          type="button"
          className="adm-txt lime bx-other"
          onClick={() => {
            setOther(true);
            onChange(isTime(time) ? momentAt(date, toMin(time), tz) : null, true);
          }}
        >
          {B.book.otherTime}
        </button>
      )}
    </div>
  );
}

/** Ask the server for the free times; null while asking. */
function useStarts(date: string, what: { serviceIds: string[] } | { visitId: string } | null): FreeStart[] | null {
  const [got, setGot] = useState<{ key: string; starts: FreeStart[] } | null>(null);
  const key = what ? `${date}|${"visitId" in what ? what.visitId : what.serviceIds.join(",")}` : "";
  useEffect(() => {
    if (!what) return;
    let live = true;
    freeStarts(date, what).then(
      (r) => live && setGot({ key, starts: r.ok ? r.starts : [] }),
      () => live && setGot({ key, starts: [] }),
    );
    return () => {
      live = false;
    };
    // the key says everything `what` does
  }, [key]);
  return got && got.key === key ? got.starts : null;
}

export function NewVisitSheet({
  offers,
  tz,
  today,
  prefill,
  onClose,
  onDone,
}: {
  offers: Offer[];
  tz: string;
  today: string;
  prefill: NewPrefill;
  onClose: () => void;
  onDone: (text: string, date: string) => void;
}) {
  const B = useB();
  const [day, setDay] = useState(prefill.date < today ? today : prefill.date);
  const [picked, setPicked] = useState<string[]>(() => (prefill.serviceIds ?? []).filter((id) => offers.some((o) => o.id === id)));
  const [pick, setPick] = useState<{ at: number; typed: boolean } | null>(prefill.start != null ? { at: prefill.start, typed: false } : null);
  const [client, setClient] = useState<Picked | null>(prefill.client ?? null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof findMyClients>>>([]);
  const [note, setNote] = useState("");
  const [sms, setSms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const key = useRef(newKey());

  const starts = useStarts(day, picked.length ? { serviceIds: picked } : null);
  // a time from the list counts while it is still in the list (the services may change); a typed one always
  const chosen = pick && (pick.typed || !!starts?.some((s) => s.start === pick.at)) ? pick.at : null;
  const extra = starts?.find((s) => s.start === chosen)?.extraCents ?? 0;

  // look up his clients as he types (a phone or a name)
  const lookFor = client ? "" : phone.replace(/\D/g, "").length >= 3 ? phone : name.trim().length >= 2 ? name : "";
  useEffect(() => {
    if (!lookFor) return;
    let live = true;
    const t = setTimeout(() => {
      findMyClients(lookFor).then(
        (r) => live && setHits(r),
        () => live && setHits([]),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [lookFor]);
  const shown = lookFor ? hits : [];

  const lines = picked.map((id) => offers.find((o) => o.id === id)).filter((o): o is Offer => !!o);
  const minutes = lines.reduce((n, o) => n + o.durationMin, 0);
  const cents = lines.reduce((n, o) => n + o.priceCents, 0) + extra;
  const hasClient = !!client || !!phone.trim() || !!name.trim();

  const changeDay = (d: string) => {
    setDay(d);
    setPick(null);
    setWarn(null);
    setProblem(null);
  };

  const book = async (force: boolean) => {
    if (chosen === null) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await bookVisit({
        start: chosen,
        serviceIds: picked,
        clientId: client?.id ?? null,
        name: client ? "" : name,
        phone: client ? "" : phone,
        note,
        sms,
        key: key.current,
        force,
      });
      if (r.ok) return onDone(B.book.booked(`${dateWords(day, B.lang, { weekday: "short", day: "numeric", month: "short" })}, ${hm(r.start, tz)}`), day);
      const p = problemOf(B, r);
      setWarn(p.warn ?? null);
      setProblem(p.problem ?? null);
    } catch {
      setProblem(B.error);
    } finally {
      setBusy(false);
    }
  };

  const bar = (
    <>
      {(warn || problem) && (
        <p className="adm-err" role="alert">
          {warn ?? problem}
        </p>
      )}
      {warn ? (
        <div className="adm-bar-row">
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={() => setWarn(null)}>
            {B.cancel}
          </button>
          <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void book(true)}>
            {B.book.anyway}
          </button>
        </div>
      ) : (
        <div className="adm-bar-row">
          <div className="sum">
            {lines.length ? (
              <>
                <b>{eur(cents)}</b>
                <small>
                  {minsText(minutes, B.h, B.min)}
                  {chosen !== null && ` · ${hm(chosen, tz)}–${hm(chosen + minutes * MIN, tz)}`}
                </small>
              </>
            ) : (
              <small>{B.book.pickServices}</small>
            )}
          </div>
          <button type="button" className="adm-btn adm-btn-lime" disabled={busy || !lines.length || chosen === null || !hasClient} onClick={() => void book(false)}>
            {B.book.book}
          </button>
        </div>
      )}
    </>
  );

  return (
    <BSheet title={B.book.new} onClose={onClose} bar={bar}>
      <div className="adm-field">
        <span>{B.book.services}</span>
        <div className="adm-svcs" role="group" aria-label={B.book.services}>
          {offers.map((o) => {
            const on = picked.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPicked(on ? picked.filter((x) => x !== o.id) : [...picked, o.id]);
                  setWarn(null);
                }}
              >
                <span className="bx-tick">
                  <TickIcon />
                </span>
                <span className="n">{pick3(o.name, B.lang)}</span>
                <small>
                  {minsText(o.durationMin, B.h, B.min)} · {eur(o.priceCents)}
                </small>
              </button>
            );
          })}
        </div>
      </div>

      <DayPick date={day} today={today} onChange={changeDay} />
      {picked.length > 0 && (
        <TimePick
          key={day}
          date={day}
          tz={tz}
          starts={starts}
          value={chosen}
          onChange={(at, typed) => {
            setPick(at === null ? null : { at, typed });
            setWarn(null);
          }}
        />
      )}

      {client ? (
        <div className="adm-field">
          <span>{B.book.client}</span>
          <div className="adm-client">
            <span className="n">
              <b>{client.name}</b>
              <small>{client.phone ?? B.book.walkIn}</small>
            </span>
            <button type="button" className="adm-txt lime" onClick={() => setClient(null)}>
              {B.book.pickAnother}
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="adm-field">
            <span>{B.book.phone}</span>
            <input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          {shown.length > 0 && (
            <ul className="adm-hits">
              {shown.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => setClient({ id: h.id, name: h.name, phone: h.phone })}>
                    <span className="n">
                      <b>{h.name}</b>
                      <small>
                        {h.phone ?? B.book.walkIn} · {B.book.visitsN(h.visits)}
                      </small>
                    </span>
                    <TickIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="adm-field">
            <span>{shown.length ? B.book.newClientName : B.book.name}</span>
            <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
        </>
      )}

      <label className="adm-field">
        <span>{B.book.note}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <label className="adm-toggle">
        <span>{B.book.sms}</span>
        <input type="checkbox" role="switch" className="adm-sw" checked={sms} onChange={(e) => setSms(e.target.checked)} />
      </label>
    </BSheet>
  );
}

export function MoveSheet({ v, tz, today, onClose, onDone }: { v: BVisit; tz: string; today: string; onClose: () => void; onDone: (text: string, date: string) => void }) {
  const B = useB();
  const from = localParts(v.start, tz).date;
  const [day, setDay] = useState(from < today ? today : from);
  const [start, setStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const starts = useStarts(day, { visitId: v.id });
  const minutes = Math.round((v.end - v.start) / MIN);

  const move = async (force: boolean) => {
    if (start === null) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await moveVisit(v.id, start, force);
      if (r.ok) return onDone(B.book.moved(`${dateWords(day, B.lang, { weekday: "short", day: "numeric", month: "short" })}, ${hm(r.start, tz)}`), day);
      const p = problemOf(B, r);
      setWarn(p.warn ?? null);
      setProblem(p.problem ?? null);
    } catch {
      setProblem(B.error);
    } finally {
      setBusy(false);
    }
  };

  const bar = (
    <>
      {(warn || problem) && (
        <p className="adm-err" role="alert">
          {warn ?? problem}
        </p>
      )}
      {warn ? (
        <div className="adm-bar-row">
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={() => setWarn(null)}>
            {B.cancel}
          </button>
          <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void move(true)}>
            {B.book.anyway}
          </button>
        </div>
      ) : (
        <button type="button" className="adm-btn adm-btn-lime" disabled={busy || start === null || start === v.start} onClick={() => void move(false)}>
          {start === null ? B.book.pickTime : B.book.moveTo(`${hm(start, tz)}–${hm(start + minutes * MIN, tz)}`)}
        </button>
      )}
    </>
  );

  return (
    <BSheet title={B.book.moveTitle} onClose={onClose} bar={bar}>
      <p className="adm-time">
        <b>
          {hm(v.start, tz)}–{hm(v.end, tz)}
        </b>
        <span>
          {v.clientName} · {cap(dateWords(from, B.lang))}
        </span>
      </p>
      <DayPick
        date={day}
        today={today}
        onChange={(d) => {
          setDay(d);
          setStart(null);
          setWarn(null);
          setProblem(null);
        }}
      />
      <TimePick
        key={day}
        date={day}
        tz={tz}
        starts={starts}
        value={start}
        current={day === from ? v.start : undefined}
        onChange={(s) => {
          setStart(s);
          setWarn(null);
        }}
      />
      <p className="adm-meta">{B.book.letterHint}</p>
    </BSheet>
  );
}

export function CancelSheet({ v, tz, onClose, onDone }: { v: BVisit; tz: string; onClose: () => void; onDone: (text: string) => void }) {
  const B = useB();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ok = reason.trim().length >= 3;

  const cancel = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await cancelVisit(v.id, reason);
      if (r === "cancelled" || r === "already") return onDone(B.book.cancelled);
      setProblem(r === "reason" ? B.book.needReason : B.book.gone);
    } catch {
      setProblem(B.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BSheet
      title={B.book.cancelTitle}
      onClose={onClose}
      bar={
        <>
          {problem && (
            <p className="adm-err" role="alert">
              {problem}
            </p>
          )}
          <button type="button" className="adm-btn adm-btn-warnfill" disabled={busy || !ok} onClick={() => void cancel()}>
            {B.book.cancelGo}
          </button>
        </>
      }
    >
      <p className="adm-time">
        <b>
          {hm(v.start, tz)}–{hm(v.end, tz)}
        </b>
        <span>
          {v.clientName} · {cap(dateWords(localParts(v.start, tz).date, B.lang))}
        </span>
      </p>
      <div className="adm-field">
        <span>{B.book.reason}</span>
        <div className="bx-reasons" role="group" aria-label={B.book.reason}>
          {B.book.reasons.map((r) => (
            <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <textarea rows={2} maxLength={300} value={reason} aria-label={B.book.reason} onChange={(e) => setReason(e.target.value)} />
        <small className="adm-meta">{B.book.reasonHint}</small>
      </div>
      <p className="adm-meta">{B.book.letterHint}</p>
    </BSheet>
  );
}
