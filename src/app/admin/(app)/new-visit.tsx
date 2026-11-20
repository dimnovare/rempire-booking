"use client";

/**
 * «Новая запись» from 900px: what a tap on a free time of the journal, or
 * the bar's «Запись», opens (calendar.tsx). The design board «Новая запись»
 * (docs/reference-looks.md, «The visit window: built»), in the visit
 * window's own frame, chips, tiles and cards (visit-parts.tsx):
 *   left    «Специалист», «Дата», «Время и длительность записи» (the start;
 *           the end and the length follow from the services at this
 *           barber's own length), «Закреплённые поля» → «Комментарий к
 *           записи» (the staff note), and the tiles «Расширенные поля» (the
 *           staff note) and «Уведомления о визите» (the SMS reminder);
 *   centre  the four chips (the one chosen is written once the visit is
 *           there, with the status action the visit window uses), the
 *           services chosen with ×, «Итого», the search, the cards of the
 *           services he does, «Все услуги»;
 *   right   the client: his name, the phone with its country code, a new
 *           client's e-mail, the clients found under the field being typed;
 *           or the one picked, with «Выбрать другого»; «SMS-напоминание»;
 *   foot    «Новая запись» and «Перерыв» (time off: the calendar's own
 *           form), the sum and «Создать запись», and the «anyway» question.
 * The rules are the phone sheet's (calendar.tsx, NewSheet): a picked client
 * is sent by his id alone (his phone here may be masked), one key per
 * window so a double press books once, and the server asks every right
 * again. A phone keeps the bottom sheet.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { CalendarData } from "@/lib/admin/calendar";
import { hhmm, momentAt } from "@/lib/admin/grid";
import { Ava, XIcon } from "../icons";
import { useA } from "../lang";
import { createVisit, findClients, setVisitStatus } from "./actions";
import { euro } from "./journal-bar";
import { BarNote, Cards, CHIP, Chips, initials, minutesOf, Slide, sumOf, Tiles, timeOf, useMay, VwFrame, type Chip, type Tile } from "./visit-parts";

/** The country codes of the phone field, Estonia's first: the clients the salon has. */
const CODES = ["+372", "+358", "+371", "+370", "+7", "+380", "+375", "+48", "+49", "+44", "+1"];
const TILES = ["fields", "notify"] as const satisfies readonly Tile[];
type Hit = Awaited<ReturnType<typeof findClients>>[number];

export function NewVisitDrawer({
  data,
  staffId,
  date,
  min,
  onClose,
  onDone,
  onTimeOff,
}: {
  data: CalendarData;
  staffId: string;
  date: string;
  min: number;
  onClose: () => void;
  onDone: (text: string) => void;
  /** «Перерыв»: the calendar's time-off form instead; null without the right to block time */
  onTimeOff: (() => void) | null;
}) {
  const A = useA();
  const W = A.win;
  const N = A.newVisit;
  const may = useMay();
  const tz = data.tz;
  const timeId = useId();
  const phoneId = useId();

  // the visit: barber, day, start, services, the staff note, the reminder, the chip
  const [sid, setSid] = useState(staffId);
  const [day, setDay] = useState(date);
  const [time, setTime] = useState(hhmm(min));
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sms, setSms] = useState(true);
  const [chip, setChip] = useState<Chip>("booked");
  const [tile, setTile] = useState<Tile | null>(null);
  const [find, setFind] = useState("");
  // the client: one picked from the search, or a name, a phone and an e-mail for a new one
  const [name, setName] = useState("");
  const [code, setCode] = useState(CODES[0]);
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [client, setClient] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  // one key for this window: a second press, or a press after «Всё равно записать», books once
  const key = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  // the phone as the server takes it: the code and the number, or the number as typed with its own «+» or «00»
  const digits = number.replace(/\D/g, "");
  const phone = !number.trim() ? "" : /^\s*(\+|00)/.test(number) ? number.trim() : `${code} ${number.trim()}`;
  // the clients are looked up as the name or the number is typed, and shown under that field
  const by = client || !may.pickClient ? null : digits.length >= 3 ? "phone" : name.trim().length >= 2 ? "name" : null;
  const lookFor = by === "phone" ? phone : by === "name" ? name : "";
  useEffect(() => {
    if (!lookFor) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      findClients(lookFor).then(
        (r) => live && setHits(r),
        () => live && setHits([]),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [lookFor]);

  const staff = data.staff.find((s) => s.id === sid);
  const total = sumOf(data.services, sid, picked);
  const startMin = Number.isFinite(minutesOf(time)) ? minutesOf(time) : min;
  const endText = picked.length ? hhmm(startMin + total.minutes) : "—";
  const hasClient = !!client || !!digits || !!name.trim();
  const ready = picked.length > 0 && hasClient && (!!client || may.newClient);
  // what the reminder can do: it goes only to a phone
  const reachable = client ? !!client.phone : !!digits;
  const smsLine = !sms ? N.smsOff : reachable ? N.smsWill : N.smsNoPhone;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickStaff = (id: string) => {
    setSid(id);
    // only the services the new barber does stay
    setPicked((p) => p.filter((x) => data.services.find((s) => s.id === x)?.offers[id]));
  };

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
        email: client || !may.newClient ? "" : email,
        comment: "",
        staffNote: note,
        smsReminder: sms,
        idempotencyKey: key.current,
        force,
      });
      if (!r.ok) {
        if (r.code === "outside_hours" || r.code === "time_off") setWarn(r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours);
        else setProblem(r.code === "overlap" ? A.visit.overlap : r.code === "not_offered" ? A.visit.notOffered : r.code === "invalid" ? A.visit.invalid(r.field) : r.code === "forbidden" ? A.rights.refused : A.error);
        return;
      }
      setWarn(null);
      // the chip chosen, on the visit that is there now; pressed again, the same key finds the same visit
      if (chip !== "booked") {
        const [status, confirmed] = CHIP[chip];
        if (!(await setVisitStatus(r.id, status, confirmed).catch(() => false))) return setProblem(N.statusNotSet);
      }
      onDone(`${A.cal.booked}: ${timeOf(tz, r.start)}`);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const hitList = (
    <ul className="vw-hits" aria-label={N.found}>
      {hits.map((h) => (
        <li key={h.id}>
          <button type="button" onClick={() => setClient({ id: h.id, name: h.name, phone: h.phone })}>
            <span className="vw-ini is-sm" aria-hidden="true">
              {initials(h.name)}
            </span>
            <span className="txt">
              <b>{h.name}</b>
              <small>
                {h.phone ?? A.visit.walkIn} · {A.visit.visitsN(h.visits)}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const smsSwitch = (
    <label className="vw-switch">
      <span>{A.visit.sms}</span>
      <input type="checkbox" role="switch" className="adm-sw" checked={sms} onChange={(e) => setSms(e.target.checked)} />
    </label>
  );

  const noteField = (rows: number) => (
    <label className="vw-field">
      <span>{W.staffNote}</span>
      <textarea rows={rows} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
    </label>
  );

  const acts = warn ? (
    <>
      <BarNote problem={null} warn={warn} />
      <button type="button" className="vw-btn" onClick={() => setWarn(null)}>
        {A.cancel}
      </button>
      <button type="button" className="vw-btn vw-btn-main" disabled={busy} onClick={() => void book(true)}>
        {A.visit.anyway}
      </button>
    </>
  ) : (
    <>
      <BarNote problem={problem} warn={null} />
      <span className="vw-sum">
        {picked.length ? (
          <>
            <b>{euro(total.cents)}</b>
            <small>
              {A.mins(total.minutes)} · {hhmm(startMin)}–{endText}
            </small>
          </>
        ) : (
          <small>{A.visit.pickServices}</small>
        )}
      </span>
      <button type="button" className="vw-btn vw-btn-main" disabled={busy || !ready} onClick={() => void book(false)}>
        {N.create}
      </button>
    </>
  );

  const lead = onTimeOff && (
    <button type="button" className="vw-txt" onClick={onTimeOff}>
      {N.timeOff}
    </button>
  );

  return (
    <VwFrame label={A.visit.new} title={A.visit.new} lead={lead} acts={acts} onClose={onClose}>
      {/* ---------------- left: the barber, the day, the time ---------------- */}
      <section className="vw-col vw-left" aria-label={W.cols.visit}>
        <div className="vw-main" inert={tile !== null}>
          <label className="vw-field">
            <span>{N.specialist}</span>
            <span className="vw-sel">
              <Ava src={staff?.photoUrl} name={staff?.name ?? "?"} />
              <select value={sid} onChange={(e) => pickStaff(e.target.value)}>
                {data.staff
                  .filter((s) => s.active || s.id === staffId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </span>
          </label>
          <label className="vw-field">
            <span>{A.visit.date}</span>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          {/* the start is his; the end and the length are the services' own, at this barber's length */}
          <div className="vw-field" role="group" aria-labelledby={timeId}>
            <span id={timeId}>{N.timeLength}</span>
            <div className="vw-span">
              <input type="time" aria-label={N.starts} value={time} step={300} onChange={(e) => setTime(e.target.value)} />
              <span aria-hidden="true">—</span>
              <output className="vw-out" aria-label={N.ends}>
                {endText}
              </output>
            </div>
            <output className="vw-out" aria-label={N.length}>
              {picked.length ? A.mins(total.minutes) : "—"}
            </output>
          </div>

          <p className="vw-dim vw-pinned">{W.pinned}</p>
          {noteField(4)}

          <Tiles tiles={TILES} open={tile} onOpen={setTile} />
        </div>

        {tile && (
          <Slide tile={tile} onHide={() => setTile(null)}>
            {tile === "fields" ? (
              noteField(6)
            ) : (
              <>
                {smsSwitch}
                <p className="vw-dim">{smsLine}</p>
              </>
            )}
          </Slide>
        )}
      </section>

      {/* ---------------- centre: the status, the services ---------------- */}
      <section className="vw-col vw-mid" aria-label={N.services}>
        {/* the chip is written once the visit is there; any but «Ожидание» is a change of the visit, its own right */}
        <Chips current={chip} disabled={(c) => busy || (c !== "booked" && !may.edit)} onPick={setChip} />

        {picked.length > 0 && (
          <ul className="vw-lines">
            {picked.map((id) => {
              const s = data.services.find((x) => x.id === id);
              const label = A.pick(s?.name);
              return (
                <li key={id}>
                  <div>
                    <span className="n">{label}</span>
                    <span className="p">
                      {euro(s?.offers[sid]?.[0] ?? 0)}
                      <button type="button" className="vw-x" aria-label={`${W.removeService}: ${label}`} onClick={() => toggle(id)}>
                        <XIcon size={14} />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="vw-pay">
          <span className="vw-dim">{A.visit.total}</span>
          <b>{euro(total.cents)}</b>
          <span className="vw-dim">{picked.length ? A.mins(total.minutes) : A.visit.pickServices}</span>
        </div>

        <Cards data={data} sid={sid} picked={picked} find={find} onFind={setFind} disabled={false} onToggle={toggle} />
      </section>

      {/* ---------------- right: the client ---------------- */}
      <section className="vw-col vw-right" aria-label={W.cols.client}>
        {client ? (
          <div className="vw-who">
            <span className="vw-ini" aria-hidden="true">
              {initials(client.name)}
            </span>
            <span className="txt">
              <b>{client.name}</b>
              <small>{client.phone ?? A.visit.walkIn}</small>
            </span>
            <button type="button" className="vw-txt" onClick={() => setClient(null)}>
              {N.pickOther}
            </button>
          </div>
        ) : (
          <>
            {/* with no right to add a client, the fields only look one up */}
            {!may.newClient && <p className="vw-dim">{A.rights.pickOnly}</p>}
            <label className="vw-field">
              <span>{N.clientName}</span>
              <input autoComplete="off" maxLength={120} placeholder={N.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {by === "name" && hits.length > 0 && hitList}
            <div className="vw-field" role="group" aria-labelledby={phoneId}>
              <span id={phoneId}>{A.visit.phone}</span>
              <div className="vw-tel">
                <select aria-label={N.code} value={code} onChange={(e) => setCode(e.target.value)}>
                  {CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input type="tel" inputMode="tel" autoComplete="off" maxLength={40} aria-label={N.number} value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
            </div>
            {by === "phone" && hits.length > 0 && hitList}
            {/* an e-mail goes on a new client only (src/lib/admin/visits.ts) */}
            {may.newClient && (
              <label className="vw-field">
                <span>{N.email}</span>
                <input type="email" autoComplete="off" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            )}
          </>
        )}
        {smsSwitch}
      </section>
    </VwFrame>
  );
}
