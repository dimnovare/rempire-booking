"use client";

/**
 * A visit on a phone (Dim, decision round 11; the design boards «Visit
 * sheet» and «Visit sheet: add»): ONE bottom sheet for Renat's phone
 * journal (visit-window.tsx, VisitPanel below 900px) and for the barber's
 * day (src/app/b/(app)/visit-sheet.tsx), drawn as the phone app we follow:
 *
 *   head      the client, «10:00–11:30 · Вт, 24 ноября», the barber;
 *   phone     «Позвонить», then «Карточка клиента» with his visits;
 *   notes     «Заметка о клиенте» (yellow edge), the client's comment;
 *   chips     Ожидание · Пришёл · Не пришёл · Подтвердил: a tap writes at
 *             once. A visit marked «done» before is «Пришёл»;
 *   services  the visit's lines (a tap on one: «Убрать услугу») and the
 *             yellow «+ Добавить услугу», which opens a second sheet with
 *             the barber's own services, prices and times;
 *   «Итого»   the sum and the length;
 *   payment   «Наличные» and «Карта», greyed: payments wait for Renat's
 *             answer on finance;
 *   foot      «Перенести», «Отменить запись», «Записать снова».
 *
 * It reads and writes nothing itself: each side hands it the visit as it
 * has it, its own words and handlers, and a handler left out is a control
 * not drawn (a chip without one cannot be pressed). What the login may do
 * is the side's to decide; the server asks the same rights again.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { eur, minsText } from "../copy.shared";
import { XIcon } from "../icons";
import { cap, CHIPS, fmt, MIN, timeOf, type Chip } from "./visit-kit";
import "./visit-sheet.css";

/** A service of the visit, or one the barber does: its name in the login's language. */
export type SheetLine = { id: string; name: string; minutes: number; cents: number };
/** What a change of the services came to: done, the «anyway» question, or a problem to say. */
export type SheetAnswer = { ok: true } | { ok: false; warn: string } | { ok: false; problem: string };

/** The sheet's words: the same shape in the admin's copy and the barber app's (`vs`). */
export type SheetWords = {
  phone: string;
  call: string;
  noPhone: string;
  card: string;
  visits: (n: number) => string;
  clientNote: string;
  clientNoteHint: string;
  comment: string;
  staffNote: string;
  addNote: string;
  editNote: string;
  noteSaved: string;
  save: string;
  cancel: string;
  status: string;
  chips: Record<Chip, string>;
  cancelled: string;
  services: string;
  add: string;
  remove: string;
  lineOf: (name: string) => string;
  special: string;
  total: string;
  cash: string;
  payCard: string;
  payLater: string;
  move: string;
  cancelVisit: string;
  cancelSure: string;
  cancelYes: string;
  keep: string;
  again: string;
  close: string;
  addTitle: string;
  addLead: (staff: string) => string;
  find: string;
  inVisit: string;
  addGo: string;
  sum: (money: string, length: string) => string;
  plus: (money: string, length: string, till: string) => string;
  noneFound: string;
  added: string;
  removed: string;
  anyway: string;
  error: string;
  h: string;
  min: string;
};

export type VisitSheetViewProps = {
  w: SheetWords;
  /** for the day's words: «ru-RU» */
  intl: string;
  tz: string;
  clientName: string;
  start: number;
  end: number;
  /** the visit's barber; left out where it is always the login's own (the barber's day) */
  staffName?: string | null;
  phone: string | null;
  /** the number is whole and the login may call it: a «tel:» link */
  callable: boolean;
  /** «Без телефона» when there is none (only for a login that sees the client's data) */
  showNoPhone?: boolean;
  /** «Карточка клиента»: a page to go to, or a sheet to open; `visits`: his count, null while not known */
  card?: { href?: string; open?: () => void; visits: number | null } | null;
  clientNote: string;
  saveClientNote?: (text: string) => Promise<boolean>;
  comment: string;
  staffNote: string;
  saveStaffNote?: (text: string) => Promise<boolean>;
  /** a cancelled visit («Записи» opens one): only shown */
  gone: boolean;
  chip: Chip;
  /** a chip pressed: true once written */
  onChip?: (c: Chip) => Promise<boolean>;
  lines: SheetLine[];
  extraCents: number;
  totalCents: number;
  /** the services «+» adds from (the visit's barber's); null: the login may not change the services */
  offers: SheetLine[] | null;
  onServices?: (ids: string[], force: boolean) => Promise<SheetAnswer>;
  onMove?: () => void;
  /** «Отменить запись» asked here, «Да, отменить» runs this (the admin) … */
  onCancelYes?: () => Promise<void>;
  /** … or a sheet of its own opens (the barber's, with a reason) */
  onCancelOpen?: () => void;
  onAgain?: () => void;
  /** the small line at the end: where the visit came from, the reminder */
  meta?: string;
  onClose: () => void;
  /** a toast: the side's own */
  say: (text: string, bad?: boolean) => void;
};

const svg = (size: number, stroke = "currentColor", width = 1.8) =>
  ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }) as const;

/** The chips' marks, as the board's. */
function ChipMark({ c, on }: { c: Chip; on: boolean }) {
  if (c === "booked")
    return (
      <svg {...svg(18, on ? "#fff" : "#8a8f9c", 2)}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  if (c === "arrived")
    return (
      <svg {...svg(18, on ? "#fff" : "#1cb58e", 2)}>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  if (c === "no_show")
    return (
      <svg {...svg(18, on ? "#fff" : "#e5484d", 2)}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
    );
  return (
    <svg {...svg(18, on ? "#fff" : "#3b82f6", 2)}>
      <path d="M2 12.5l4.5 4.5L16 7.5M11.5 16l1 1L22 7.5" />
    </svg>
  );
}

export function VisitSheetView(p: VisitSheetViewProps) {
  const { w, tz } = p;
  const mins = (n: number) => minsText(n, w.h, w.min);
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState(false);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // the chip as it is now: written here at once, and taken anew when the visit comes again
  const [cur, setCur] = useState(p.chip);
  const [seen, setSeen] = useState(p.chip);
  if (seen !== p.chip) {
    setSeen(p.chip);
    setCur(p.chip);
  }

  // Escape closes the sheet on top; the page under the sheets stays put
  const { onClose } = p;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (adding) setAdding(false);
      else onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [adding, onClose]);
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);

  const chip = async (c: Chip) => {
    if (!p.onChip || c === cur || busy) return;
    setBusy(true);
    try {
      if (await p.onChip(c)) {
        setCur(c);
        p.say(w.chips[c]);
      } else p.say(w.error, true);
    } catch {
      p.say(w.error, true);
    } finally {
      setBusy(false);
    }
  };

  const services = async (ids: string[], force: boolean, said: string): Promise<SheetAnswer> => {
    if (!p.onServices) return { ok: false, problem: w.error };
    setBusy(true);
    try {
      const r = await p.onServices(ids, force);
      if (r.ok) {
        setOpenLine(null);
        p.say(said);
      } else if ("problem" in r) p.say(r.problem, true);
      return r;
    } catch {
      p.say(w.error, true);
      return { ok: false, problem: w.error };
    } finally {
      setBusy(false);
    }
  };
  // a shorter visit takes no new time: the «anyway» question (hours, a break) was answered when it was booked
  const remove = (id: string) =>
    void services(
      p.lines.map((l) => l.id).filter((x) => x !== id),
      true,
      w.removed,
    );

  const cancelYes = async () => {
    if (!p.onCancelYes) return;
    setBusy(true);
    try {
      await p.onCancelYes();
    } finally {
      setBusy(false);
    }
  };

  const length = Math.round((p.end - p.start) / MIN);
  const day = cap(fmt(p.intl, tz, { weekday: "short", day: "numeric", month: "long" }).format(p.start));
  const canChange = !p.gone && p.offers !== null && !!p.onServices;
  const canCancel = !p.gone && (!!p.onCancelYes || !!p.onCancelOpen);
  const canMove = !p.gone && !!p.onMove;

  return (
    <>
      <div className="vs-wrap" onClick={p.onClose}>
        <div className="vs-sheet" role="dialog" aria-label={p.clientName} onClick={(e) => e.stopPropagation()}>
          <header className="vs-head">
            <div className="vs-grab" aria-hidden="true" />
            <div className="vs-title">
              <h2>{p.clientName}</h2>
              <button type="button" className="vs-x" aria-label={w.close} onClick={p.onClose}>
                <XIcon />
              </button>
            </div>
            <div className="vs-when">
              <b className="vs-time">
                {timeOf(tz, p.start)}–{timeOf(tz, p.end)} · {day}
              </b>
              {p.staffName && (
                <span className="vs-staff">
                  <i aria-hidden="true">{p.staffName.trim().charAt(0).toUpperCase()}</i>
                  {p.staffName}
                </span>
              )}
            </div>
          </header>

          <div className="vs-body">
            {(p.phone || p.showNoPhone || p.card) && (
              <div className="vs-box vs-client">
                {(p.phone || p.showNoPhone) && (
                  <div className="vs-phone">
                    <span className="txt">
                      <small>{w.phone}</small>
                      <b>{p.phone ?? w.noPhone}</b>
                    </span>
                    {p.phone && p.callable && (
                      <a className="vs-call" href={`tel:${p.phone}`}>
                        <svg {...svg(18, "#1cb58e", 2)}>
                          <path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a2 2 0 0 1-2 2C10.3 21 3 13.7 3 6a2 2 0 0 1 2-2z" />
                        </svg>
                        {w.call}
                      </a>
                    )}
                  </div>
                )}
                {p.card && <CardRow w={w} card={p.card} />}
              </div>
            )}

            <Note w={w} kind="client" label={w.clientNote} hint={w.clientNoteHint} text={p.clientNote} save={p.saveClientNote} say={p.say} />
            {p.comment && (
              <div className="vs-note is-comment">
                <span className="vs-label">{w.comment}</span>
                <p className="vs-note-text">«{p.comment}»</p>
              </div>
            )}

            {p.gone ? (
              <p className="vs-gone">{w.cancelled}</p>
            ) : (
              <div className="vs-chips" role="group" aria-label={w.status}>
                {CHIPS.map((c) => (
                  <button key={c} type="button" className={`c-${c}`} aria-pressed={cur === c} disabled={!p.onChip || busy} onClick={() => void chip(c)}>
                    <ChipMark c={c} on={cur === c} />
                    {w.chips[c]}
                  </button>
                ))}
              </div>
            )}

            <div className="vs-box vs-lines" role="group" aria-label={w.services}>
              {p.lines.map((l) => {
                const body = (
                  <>
                    <span className="txt">
                      <b>{l.name}</b>
                      <small>{mins(l.minutes)}</small>
                    </span>
                    <span className="sum">{eur(l.cents)}</span>
                  </>
                );
                const removable = canChange && p.lines.length > 1;
                return (
                  <div key={l.id} className={`vs-line${openLine === l.id ? " is-open" : ""}`}>
                    {removable ? (
                      <button type="button" className="vs-line-main" aria-expanded={openLine === l.id} aria-label={w.lineOf(l.name)} onClick={() => setOpenLine(openLine === l.id ? null : l.id)}>
                        {body}
                      </button>
                    ) : (
                      <div className="vs-line-main">{body}</div>
                    )}
                    {removable && openLine === l.id && (
                      <div className="vs-line-more">
                        <button type="button" className="vs-btn vs-btn-warn" disabled={busy} onClick={() => remove(l.id)}>
                          {w.remove}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {p.extraCents > 0 && (
                <div className="vs-line is-sp">
                  <div className="vs-line-main">
                    <span className="txt">
                      <b>{w.special}</b>
                    </span>
                    <span className="sum">+{eur(p.extraCents)}</span>
                  </div>
                </div>
              )}
              {canChange && (
                <button type="button" className="vs-add" disabled={busy} onClick={() => setAdding(true)}>
                  <span className="plus" aria-hidden="true">
                    <svg {...svg(18, "currentColor", 2.4)}>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  {w.add}
                </button>
              )}
            </div>

            <div className="vs-total">
              <span>
                {w.total} <small>· {mins(length)}</small>
              </span>
              <b>{eur(p.totalCents)}</b>
            </div>

            <Note w={w} kind="visit" label={w.staffNote} text={p.staffNote} save={p.saveStaffNote} say={p.say} />

            {!p.gone && (
              <div className="vs-pay">
                <div className="vs-pay-row">
                  <button type="button" disabled>
                    <svg {...svg(20)}>
                      <rect x="2.5" y="6" width="19" height="12" rx="2" />
                      <circle cx="12" cy="12" r="2.5" />
                      <path d="M6 9.5v5M18 9.5v5" />
                    </svg>
                    {w.cash}
                  </button>
                  <button type="button" disabled>
                    <svg {...svg(20)}>
                      <rect x="2.5" y="5" width="19" height="14" rx="2" />
                      <path d="M2.5 10h19M6.5 15h4" />
                    </svg>
                    {w.payCard}
                  </button>
                </div>
                <p>{w.payLater}</p>
              </div>
            )}

            {asking ? (
              <div className="vs-ask" role="alert">
                <p>{w.cancelSure}</p>
                <div className="vs-foot">
                  <button type="button" className="vs-btn vs-btn-warnfill" disabled={busy} onClick={() => void cancelYes()}>
                    {w.cancelYes}
                  </button>
                  <button type="button" className="vs-btn" disabled={busy} onClick={() => setAsking(false)}>
                    {w.keep}
                  </button>
                </div>
              </div>
            ) : (
              (canMove || canCancel) && (
                <div className={`vs-foot${canMove && canCancel ? "" : " is-one"}`}>
                  {canMove && (
                    <button type="button" className="vs-btn" onClick={p.onMove}>
                      <svg {...svg(18)}>
                        <path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" />
                        <path d="M9 15h6M13 13l2 2-2 2" />
                      </svg>
                      {w.move}
                    </button>
                  )}
                  {canCancel && (
                    <button type="button" className="vs-btn vs-btn-warn" onClick={() => (p.onCancelYes ? setAsking(true) : p.onCancelOpen?.())}>
                      <svg {...svg(18)}>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M5.6 5.6l12.8 12.8" />
                      </svg>
                      {w.cancelVisit}
                    </button>
                  )}
                </div>
              )
            )}
            {p.onAgain && (
              <button type="button" className="vs-btn vs-again" onClick={p.onAgain}>
                {w.again}
              </button>
            )}
            {p.meta && <p className="vs-meta">{p.meta}</p>}
          </div>
        </div>
      </div>

      {adding && p.offers && (
        <AddSheet
          w={w}
          mins={mins}
          tz={tz}
          offers={p.offers}
          have={p.lines.map((l) => l.id)}
          staffName={p.staffName ?? null}
          totalCents={p.totalCents}
          minutes={length}
          end={p.end}
          onClose={() => setAdding(false)}
          onAdd={async (ids, force) => {
            const r = await services([...p.lines.map((l) => l.id), ...ids], force, w.added);
            if (r.ok) setAdding(false);
            return r;
          }}
        />
      )}
    </>
  );
}

function CardRow({ w, card }: { w: SheetWords; card: NonNullable<VisitSheetViewProps["card"]> }) {
  const inner = (
    <>
      <svg {...svg(20, "#5f6475")}>
        <path d="M3 5h18v14H3zM7 10h4M7 14h3M14 9h4M14 13h4" />
      </svg>
      <span className="n">{w.card}</span>
      {card.visits != null && <small>{w.visits(card.visits)}</small>}
      <svg {...svg(18, "#8a8f9c", 2)}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </>
  );
  return card.href ? (
    <Link className="vs-card" href={card.href} prefetch={false}>
      {inner}
    </Link>
  ) : (
    <button type="button" className="vs-card" onClick={card.open}>
      {inner}
    </button>
  );
}

/** A note: shown, and with `save` changed in place. Nothing at all when there is none and it cannot be written. */
function Note({ w, kind, label, hint, text, save, say }: { w: SheetWords; kind: "client" | "visit"; label: string; hint?: string; text: string; save?: (t: string) => Promise<boolean>; say: (t: string, bad?: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  if (!save && !text) return null;
  const store = async () => {
    if (!save) return;
    setBusy(true);
    try {
      if (await save(draft)) {
        setEditing(false);
        say(w.noteSaved);
      } else say(w.error, true);
    } catch {
      say(w.error, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`vs-note is-${kind}`}>
      <div className="vs-note-head">
        <span className="vs-label">{label}</span>
        {save && !editing && (
          <button
            type="button"
            className="vs-link"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            {text ? w.editNote : w.addNote}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea rows={3} maxLength={2000} value={draft} autoFocus aria-label={label} onChange={(e) => setDraft(e.target.value)} />
          {hint && <small className="vs-hint">{hint}</small>}
          <div className="vs-note-btns">
            <button type="button" className="vs-btn vs-btn-main" disabled={busy} onClick={() => void store()}>
              {w.save}
            </button>
            <button type="button" className="vs-btn" disabled={busy} onClick={() => setEditing(false)}>
              {w.cancel}
            </button>
          </div>
        </>
      ) : (
        text && <p className="vs-note-text">{text}</p>
      )}
    </div>
  );
}

/** «Добавить услугу»: the barber's own services, his prices and times, over the visit's sheet. */
function AddSheet({
  w,
  mins,
  tz,
  offers,
  have,
  staffName,
  totalCents,
  minutes,
  end,
  onClose,
  onAdd,
}: {
  w: SheetWords;
  mins: (n: number) => string;
  tz: string;
  offers: SheetLine[];
  have: string[];
  staffName: string | null;
  totalCents: number;
  minutes: number;
  end: number;
  onClose: () => void;
  onAdd: (ids: string[], force: boolean) => Promise<SheetAnswer>;
}) {
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = find.trim().toLocaleLowerCase();
  const list = q ? offers.filter((o) => o.name.toLocaleLowerCase().includes(q)) : offers;
  const extra = picked.map((id) => offers.find((o) => o.id === id)).filter((o): o is SheetLine => !!o);
  const addCents = extra.reduce((n, o) => n + o.cents, 0);
  const addMin = extra.reduce((n, o) => n + o.minutes, 0);
  const toggle = (id: string) => {
    setWarn(null);
    setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  };
  const go = async (force: boolean) => {
    setBusy(true);
    try {
      const r = await onAdd(picked, force);
      if (!r.ok && "warn" in r) setWarn(r.warn);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vs-wrap vs-wrap-add" onClick={onClose}>
      <div className="vs-sheet vs-add-sheet" role="dialog" aria-label={w.addTitle} onClick={(e) => e.stopPropagation()}>
        <header className="vs-head">
          <div className="vs-grab" aria-hidden="true" />
          <div className="vs-title">
            <h2>{w.addTitle}</h2>
            <button type="button" className="vs-x" aria-label={w.close} onClick={onClose}>
              <XIcon />
            </button>
          </div>
          <p className="vs-lead">{w.addLead(staffName ?? "")}</p>
          <label className="vs-find">
            <svg {...svg(18, "currentColor", 2)}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input type="search" value={find} placeholder={w.find} aria-label={w.find} onChange={(e) => setFind(e.target.value)} />
          </label>
        </header>
        <div className="vs-body vs-add-body">
          {list.length ? (
            <div className="vs-box vs-offers" role="group" aria-label={w.services}>
              {list.map((o) => {
                const there = have.includes(o.id);
                const on = picked.includes(o.id);
                return (
                  <button key={o.id} type="button" className={`vs-offer${on ? " is-on" : ""}${there ? " is-there" : ""}`} aria-pressed={on || there} disabled={there || busy} onClick={() => toggle(o.id)}>
                    <span className="txt">
                      <b>{o.name}</b>
                      <small>
                        {mins(o.minutes)}
                        {there && <em>{w.inVisit}</em>}
                      </small>
                    </span>
                    <span className="sum">{eur(o.cents)}</span>
                    <span className="mark" aria-hidden="true">
                      {on || there ? (
                        <svg {...svg(18, "currentColor", 2.6)}>
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      ) : (
                        <svg {...svg(16, "currentColor", 2.2)}>
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="vs-meta">{w.noneFound}</p>
          )}
        </div>
        <div className="vs-add-foot">
          {warn && (
            <p className="vs-warn" role="alert">
              {warn}
            </p>
          )}
          <div className="vs-add-row">
            <span className="txt">
              <b>{w.sum(eur(totalCents + addCents), mins(minutes + addMin))}</b>
              {picked.length > 0 && <small>{w.plus(eur(addCents), mins(addMin), timeOf(tz, end + addMin * MIN))}</small>}
            </span>
            <button type="button" className="vs-btn vs-btn-main vs-add-go" disabled={busy || !picked.length} onClick={() => void go(!!warn)}>
              {warn ? w.anyway : w.addGo}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
