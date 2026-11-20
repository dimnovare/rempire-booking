"use client";

/**
 * A visit's window: what opens on a tap on a visit in the journal
 * (calendar.tsx) and on the pencil of «Записи» (records/).
 *
 * **From 900px** it is the visit window of the product we follow, as the
 * design board «Окно визита» draws it (docs/reference-looks.md, «The visit
 * window: built»): a drawer from the right over the dimmed page, a round
 * «›» on its seam, 1200px of content on #f7f9fc in three columns and a
 * white 64px foot. Escape, the seam and the dark side close it without
 * asking, as there.
 *   left    the barber, the bin (cancel), the day and time, «Изменить»
 *           (barber, date, time in place), «Комментарий к записи» (the staff
 *           note), and three tiles that slide a panel over the column:
 *           «Расширенные поля», «Уведомления о визите», «История изменений»;
 *   centre  the status chips (they write at once), the visit's services,
 *           «К оплате», and «Услуги» / «Товары»: the service cards add and
 *           take away a service, a product is sold to this client;
 *   right   the client: «Написать:», his card's tiles, «Не посещал N
 *           дней», «Примечание о клиенте», his comments and a new one,
 *           «Статистика», «Данные записи»;
 *   foot    «Запись», and «Сохранить изменения» once something changed,
 *           with the «anyway» question above it.
 * What the columns show beside the visit is read when it opens
 * (visitWindowAction → src/lib/admin/visit-window.ts). The frame, the chips,
 * the tiles and the service cards are visit-parts.tsx's: «Новая запись»
 * (new-visit.tsx) is the same window.
 *
 * **On a phone** it is the one visit sheet the barber's day has too
 * (visit-sheet.tsx; Dim, decision round 11): the phone and the card, the
 * notes, the four chips, the lines with «+ Добавить услугу», «Итого», the
 * payment drawn but not working yet, «Перенести» and the cancel.
 *
 * What the login may do comes as `may` (calendar.ts, CalMay): a control it
 * has no right to is not drawn, and the actions ask the same rights again.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CalendarData, CalMay, CalVisit } from "@/lib/admin/calendar";
import { momentAt } from "@/lib/admin/grid";
import type { RecordMaker } from "@/lib/admin/records";
import type { VisitExtras, WindowLog } from "@/lib/admin/visit-window";
import { euroText } from "@/lib/money";
import { Ava, BinIcon, CaretIcon, PencilIcon, PlusIcon } from "../icons";
import { useA } from "../lang";
import { cancelVisit, setVisitStatus, updateVisit, visitWindowAction } from "./actions";
import { addCommentAction } from "./clients/actions";
import { useFrame } from "./frame";
import { findProductsAction, sellAction, type FrameProduct } from "./frame-actions";
import { euro } from "./journal-bar";
import { newRef } from "./sale-drawer";
import { Sheet } from "./sheet";
import { useWide } from "./tab-state";
import { VisitSheetView } from "./visit-sheet";
import {
  BarNote,
  CAME,
  Cards,
  CHIP,
  chipOf,
  Chips,
  dayOf,
  fmt,
  initials,
  MayProvider,
  MIN,
  minutesOf,
  offered,
  Slide,
  StaffPicker,
  svg,
  Tiles,
  timeOf,
  useMay,
  VwFrame,
  type Chip,
  type Tile,
} from "./visit-parts";

type PanelProps = {
  v: CalVisit;
  data: CalendarData;
  onClose: () => void;
  /** «Перенести»: the journal's grid takes the new time. Not offered where there is no grid («Записи») */
  onMove?: () => void;
  /** saved or cancelled: the window closes and says so */
  onDone: (text: string) => void;
  /** a status, a sale or a comment was written while the window stays open */
  onChanged?: () => void;
};

/**
 * The visit's window on its own, for a page that is not the calendar: the
 * pencil of «Записи» (records/) opens the very same window. `data` holds the
 * one visit with the barbers and services its form picks from
 * (src/lib/admin/calendar.ts, loadVisitData). There is no grid to tap a new
 * time on here, so «Перенести» is not offered: «Изменить» moves it.
 */
export function VisitWindow({ may, ...props }: Omit<PanelProps, "onMove"> & { may: CalMay }) {
  return (
    <MayProvider value={may}>
      <VisitPanel {...props} />
    </MayProvider>
  );
}

/** The wide window from 900px, the bottom sheet below it. */
export function VisitPanel(props: PanelProps) {
  return useWide() ? <VisitDrawer {...props} /> : <VisitSheet {...props} />;
}

/* ---------- the window from 900px ---------- */

type Look = "idle" | "looking" | "nothing" | "shop_down" | "not_configured";
const DELAY = 300;


function VisitDrawer({ v, data, onClose, onMove, onDone, onChanged }: PanelProps) {
  const A = useA();
  const W = A.win;
  const may = useMay();
  const frame = useFrame();
  const tz = data.tz;

  // the status as it is now: written here at once, and taken anew when the journal's data comes again
  const [st, setSt] = useState({ status: v.status, confirmed: v.confirmed });
  const [seen, setSeen] = useState({ status: v.status, confirmed: v.confirmed });
  if (seen.status !== v.status || seen.confirmed !== v.confirmed) {
    setSeen({ status: v.status, confirmed: v.confirmed });
    setSt({ status: v.status, confirmed: v.confirmed });
  }
  // a cancelled visit («Записи» opens one) is only shown: nothing about it can change
  const gone = st.status === "cancelled";
  // a visit the client has come to has rights of its own
  const came = CAME.has(st.status);
  const canEdit = !gone && may.edit && (!came || may.editCame);
  const canMove = !gone && !!onMove && may.move && (!came || may.editCame);
  const canCancel = !gone && (came ? may.cancelCame : may.cancel);
  const staffById = (id: string) => data.staff.find((s) => s.id === id);

  // the form: barber, day, time; services; the staff note
  const [sid, setSid] = useState(v.staffId);
  const [day, setDay] = useState(() => dayOf(tz, v.start));
  const [time, setTime] = useState(() => timeOf(tz, v.start));
  const [picked, setPicked] = useState(() => v.services.map((s) => s.serviceId));
  const [note, setNote] = useState(v.staffNote);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [tile, setTile] = useState<Tile | null>(null);
  const [tab, setTab] = useState<"services" | "goods">("services");
  const [find, setFind] = useState("");
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  // what the columns show beside the visit, read when the window opens and again after a change here
  const [extras, setExtras] = useState<VisitExtras | "failed" | null>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    visitWindowAction(v.id).then(
      (r) => live && setExtras(r ?? "failed"),
      () => live && setExtras("failed"),
    );
    return () => {
      live = false;
    };
  }, [v.id, again]);
  const x = extras && extras !== "failed" ? extras : null;
  const client = x?.client ?? null;
  const changed = () => {
    setAgain((n) => n + 1);
    onChanged?.();
  };

  // Escape closes a menu first, then the whole window, without asking (as the tool we follow: VwFrame)
  const escape = () => {
    if (!menu) return false;
    setMenu(false);
    return true;
  };

  /* ---- the visit as the form has it ---- */
  const bookedIds = v.services.map((s) => s.serviceId);
  const lineOf = (id: string) => {
    const booked = sid === v.staffId ? v.services.find((s) => s.serviceId === id) : undefined;
    if (booked) return { id, name: booked.name, cents: booked.priceCents, minutes: booked.durationMin };
    const s = data.services.find((o) => o.id === id);
    const o = s?.offers[sid];
    return { id, name: s?.name ?? {}, cents: o?.[0] ?? s?.priceCents ?? 0, minutes: o?.[1] ?? s?.durationMin ?? 0 };
  };
  const lines = picked.map(lineOf);
  const sameLines = sid === v.staffId && picked.join() === bookedIds.join();
  const length = sameLines ? Math.round((v.end - v.start) / MIN) : lines.reduce((n, l) => n + l.minutes, 0);
  const startMin = minutesOf(time);
  const start = Number.isFinite(startMin) ? momentAt(day, startMin, tz) : v.start;
  const toPay = lines.reduce((n, l) => n + l.cents, 0) + v.extraCents;

  const dirty =
    canEdit && ((may.moveWindow && (sid !== v.staffId || day !== dayOf(tz, v.start) || time !== timeOf(tz, v.start))) || (may.services && picked.join() !== bookedIds.join()) || (may.note && note !== v.staffNote));
  const svcEdit = canEdit && may.services;
  const toggle = (id: string) => {
    if (!svcEdit) return;
    setPicked((p) => (p.includes(id) ? (p.length > 1 ? p.filter((x) => x !== id) : p) : [...p, id]));
  };

  /* ---- what it writes ---- */
  const problemText = (code: string, field?: string) =>
    code === "overlap" ? A.visit.overlap : code === "not_offered" ? A.visit.notOffered : code === "invalid" ? A.visit.invalid(field) : code === "forbidden" ? A.rights.refused : A.error;

  const chip = async (c: Chip) => {
    if (c === chipOf(st.status, st.confirmed)) return;
    const [status, confirmed] = CHIP[c];
    setBusy(true);
    setProblem(null);
    try {
      if (await setVisitStatus(v.id, status, confirmed)) {
        setSt({ status, confirmed });
        frame.say(W.chips[c]);
        changed();
      } else setProblem(A.error);
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  // exactly the phone's save: only what this login may change is sent, and the «anyway» question in the foot
  const save = async (force: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await updateVisit(v.id, { ...(may.moveWindow ? { staffId: sid, start } : {}), ...(may.services ? { serviceIds: picked } : {}), ...(may.note ? { staffNote: note } : {}), force });
      if (r.ok) return onDone(A.saved);
      if (r.code === "outside_hours" || r.code === "time_off") setWarn(r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours);
      else setProblem(problemText(r.code, r.field));
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const r = await cancelVisit(v.id);
      if (r === "cancelled" || r === "already") return onDone(A.cal.cancelled);
      setProblem(r === "forbidden" ? A.rights.refused : A.error);
    } catch {
      setProblem(A.error);
    }
    setBusy(false);
  };

  /* ---- the formats ---- */
  const dayText = fmt(A.intl, tz, { day: "numeric", month: "long" }).format(start);
  const thisYear = new Date().getFullYear();
  /** «16.11 08:51»; another year's with its year */
  const stamp = (ms: number) => {
    const year = Number(fmt("en-GB", tz, { year: "numeric" }).format(ms));
    return `${fmt(A.intl, tz, { day: "2-digit", month: "2-digit", ...(year !== thisYear ? { year: "numeric" } : {}) }).format(ms)} ${timeOf(tz, ms)}`;
  };
  const maker = (by: RecordMaker) => (by.kind === "client" ? A.records.madeByClient : by.kind === "user" ? by.name : by.kind === "import" ? A.records.madeByImport : A.records.madeBySalon);
  const logText = (r: WindowLog) => {
    if (r.action !== "status") return W.log[r.action] ?? r.action;
    const s = r.status ?? "";
    return `${W.log.status}: ${s === "done" ? A.visit.status.done : s === "booked" || s === "pending" ? W.chips[r.confirmed ? "confirmed" : "booked"] : s in CHIP ? W.chips[s as Chip] : (A.visit.status[s] ?? s)}`;
  };

  const staff = staffById(sid) ?? staffById(v.staffId);
  const phone = v.clientPhone;
  const digits = phone && may.call && !phone.includes("•") ? phone.replace(/\D/g, "") : "";
  const cardHref = `/admin/clients/${v.clientId}`;
  const current = chipOf(st.status, st.confirmed);
  const K = A.clients.card;

  const acts = warn ? (
    <>
      <BarNote problem={problem} warn={warn} />
      <button type="button" className="vw-btn" onClick={() => setWarn(null)}>
        {A.cancel}
      </button>
      <button type="button" className="vw-btn vw-btn-main" disabled={busy} onClick={() => void save(true)}>
        {A.visit.anywayMove}
      </button>
    </>
  ) : (
    <>
      <BarNote problem={problem} warn={null} />
      {!gone && canMove && (
        <button type="button" className="vw-btn" onClick={onMove}>
          {A.visit.move}
        </button>
      )}
      {!gone && canEdit && (
        <button type="button" className="vw-btn vw-btn-main" disabled={busy || !dirty || !picked.length} onClick={() => void save(false)}>
          {A.visit.saveChanges}
        </button>
      )}
    </>
  );

  return (
    <VwFrame label={v.clientName} title={W.title} acts={acts} onClose={onClose} onEscape={escape}>
      {/* ---------------- left: the barber and the time ---------------- */}
      <section className="vw-col vw-left" aria-label={W.cols.visit}>
        <div className="vw-main" inert={tile !== null}>
          <div className="vw-who">
            <Ava src={staff?.photoUrl} name={staff?.name ?? "?"} />
            <span className="txt">
              <b>{staff?.name}</b>
              <small>{A.pick(staff?.role)}</small>
            </span>
            {canCancel && (
              <button type="button" className="vw-ibtn" aria-label={A.visit.cancelVisit} aria-expanded={asking} onClick={() => setAsking(!asking)}>
                <BinIcon />
              </button>
            )}
          </div>
          {asking && (
            <div className="vw-ask" role="alert">
              <p>{A.visit.cancelSure}</p>
              <button type="button" className="vw-btn vw-btn-warn" disabled={busy} onClick={() => void cancel()}>
                {A.visit.cancelYes}
              </button>
              <button type="button" className="vw-btn" onClick={() => setAsking(false)}>
                {A.visit.keep}
              </button>
            </div>
          )}
          <div className="vw-when">
            <svg {...svg(18)} className="ic">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M4 10h16M9 3v4M15 3v4" />
            </svg>
            <span className="txt">
              <b>{dayText}</b>
              <small>
                {timeOf(tz, start)}–{timeOf(tz, start + length * MIN)} · {A.mins(length)}
              </small>
            </span>
          </div>
          {canEdit && may.moveWindow &&
            (editing ? (
              <div className="vw-move">
                <label className="vw-field">
                  <span>{W.barber}</span>
                  <select value={sid} onChange={(e) => setSid(e.target.value)}>
                    {data.staff
                      .filter((s) => s.active || s.id === v.staffId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="vw-field">
                  <span>{A.visit.date}</span>
                  <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
                </label>
                <label className="vw-field">
                  <span>{A.visit.time}</span>
                  <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
                </label>
              </div>
            ) : (
              <button type="button" className="vw-btn vw-wide" onClick={() => setEditing(true)}>
                <PencilIcon size={14} />
                {W.edit}
              </button>
            ))}

          <p className="vw-dim vw-pinned">{W.pinned}</p>
          <label className="vw-field">
            <span>{W.staffNote}</span>
            <textarea rows={4} value={note} maxLength={2000} readOnly={!canEdit || !may.note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <Tiles tiles={TILES} open={tile} onOpen={setTile} />
        </div>

        {tile && (
          <Slide tile={tile} onHide={() => setTile(null)}>
            {tile === "fields" && (
              <>
                <div className="vw-pair">
                  <span className="vw-dim">{W.clientComment}</span>
                  <p>{v.comment || W.none}</p>
                </div>
                <label className="vw-field">
                  <span>{W.staffNote}</span>
                  <textarea rows={6} value={note} maxLength={2000} readOnly={!canEdit || !may.note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </>
            )}
            {tile === "notify" && (
              <>
                <p>{v.reminder ? W.reminderOn : W.reminderOff}</p>
                {!x ? (
                  <p className="vw-dim">{extras === "failed" ? A.error : A.loading}</p>
                ) : x.messages.length ? (
                  <ul className="vw-list">
                    {x.messages.map((m) => (
                      <li key={m.id}>
                        <b>{K.kinds[m.kind] ?? m.kind}</b>
                        <small>
                          {K.channels[m.channel] ?? m.channel} · {K.statuses[m.status] ?? m.status} · {stamp(m.at)}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="vw-dim">{W.noMessages}</p>
                )}
              </>
            )}
            {tile === "log" &&
              (!x ? (
                <p className="vw-dim">{extras === "failed" ? A.error : A.loading}</p>
              ) : x.log.length ? (
                <ul className="vw-list">
                  {x.log.map((r, i) => (
                    <li key={i}>
                      <b>{logText(r)}</b>
                      <small>
                        {stamp(r.at)} · {maker(r.by)}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="vw-dim">{W.noLog}</p>
              ))}
          </Slide>
        )}
      </section>

      {/* ---------------- centre: the status, the services, the products ---------------- */}
      <section className="vw-col vw-mid" aria-label={W.cols.services}>
        {gone ? (
          <p className="vw-gone">
            <span className="adm-tag warn">{A.visit.status.cancelled}</span>
          </p>
        ) : (
          <Chips current={current} disabled={() => busy || !canEdit} onPick={(c) => void chip(c)} />
        )}

        <ul className="vw-lines">
          {lines.map((l) => (
            <li key={l.id} className={openLine === l.id ? "is-open" : undefined}>
              <button type="button" aria-expanded={openLine === l.id} aria-label={W.serviceOf(A.pick(l.name))} onClick={() => setOpenLine(openLine === l.id ? null : l.id)}>
                <span className="n">{A.pick(l.name)}</span>
                <span className="p">
                  {euro(l.cents)}
                  <CaretIcon />
                </span>
              </button>
              {openLine === l.id && (
                <div className="vw-line-more">
                  <span className="vw-dim">
                    {A.mins(l.minutes)} · {staff?.name}
                  </span>
                  {svcEdit && picked.length > 1 && (
                    <button type="button" className="vw-btn" onClick={() => toggle(l.id)}>
                      {W.removeService}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
          {v.extraCents > 0 && (
            <li className="is-sp">
              <div>
                <span className="n">{A.visit.special}</span>
                <span className="p">+{euro(v.extraCents)}</span>
              </div>
            </li>
          )}
        </ul>

        {/* «Оплатить» and the «Платёжная политика» banner are not drawn: payments wait for Renat's answer on finance */}
        <div className="vw-pay">
          <span className="vw-dim">{W.toPay}</span>
          <b>{euro(toPay)}</b>
        </div>

        {!gone && may.sell && (
          <div className="vw-tabs" role="group" aria-label={W.tabs}>
            <button type="button" aria-pressed={tab === "services"} onClick={() => setTab("services")}>
              {W.tabServices}
            </button>
            <button type="button" aria-pressed={tab === "goods"} onClick={() => setTab("goods")}>
              {W.tabGoods}
            </button>
          </div>
        )}
        {tab === "goods" && !gone && may.sell ? (
          <Goods v={v} onSold={changed} />
        ) : (
          <Cards
            data={data}
            sid={sid}
            picked={picked}
            last={client?.lastServiceIds ?? []}
            find={find}
            onFind={setFind}
            disabled={!svcEdit}
            onToggle={toggle}
          />
        )}
      </section>

      {/* ---------------- right: the client ---------------- */}
      <section className="vw-col vw-right" aria-label={W.cols.client}>
        <div className="vw-who">
          <span className="vw-ini" aria-hidden="true">
            {initials(v.clientName)}
          </span>
          <span className="txt">
            <b>{v.clientName}</b>
            {phone && <small>{phone}</small>}
          </span>
          {client?.card && (
            <Link className="vw-txt" href={cardHref} prefetch={false} aria-label={W.editClient}>
              <PencilIcon size={14} />
              {W.edit}
            </Link>
          )}
        </div>

        {digits && (
          <div className="vw-write">
            <span className="vw-dim">{W.write}</span>
            <a className="vw-round wa" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" aria-label={W.whatsapp}>
              <svg {...svg(14)} strokeWidth={2}>
                <path d="M4 20l1.5-4A8 8 0 1112 20a8 8 0 01-4-1z" />
              </svg>
            </a>
            <a className="vw-round tg" href={`https://t.me/+${digits}`} target="_blank" rel="noopener noreferrer" aria-label={W.telegram}>
              <svg {...svg(14)} strokeWidth={2}>
                <path d="M21 4L3 11l6 2 2 6 3-4 4 3z" />
              </svg>
            </a>
          </div>
        )}

        {client?.card && (
          <div className="vw-cards3">
            <Link className="vw-tile" href={cardHref} prefetch={false}>
              {W.profile}
            </Link>
            {client.card.history && (
              <Link className="vw-tile" href={`${cardHref}?tab=history`} prefetch={false}>
                {W.history}
              </Link>
            )}
            <div className="vw-menu-wrap">
              <button type="button" className="vw-tile" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                {W.more}
              </button>
              {menu && (
                <div className="vw-menu" role="menu" aria-label={W.more}>
                  <Link role="menuitem" href={`${cardHref}?tab=messages`} prefetch={false}>
                    {K.tabs.messages}
                  </Link>
                  {client.card.notify && (
                    <Link role="menuitem" href={`${cardHref}?tab=notify`} prefetch={false}>
                      {K.tabs.notify}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {client?.awayDays != null && <span className="vw-tag">{W.away(client.awayDays)}</span>}

        <div className="vw-pair">
          <span className="vw-dim">{W.clientNote}</span>
          <p>{v.clientNote || W.none}</p>
        </div>

        {client && (client.comments.length > 0 || client.commentAdd) && (
          <>
            <h3 className="vw-h">{W.extra}</h3>
            {client.comments.length > 0 && (
              <ul className="vw-list">
                {client.comments.map((c) => (
                  <li key={c.id}>
                    <p>{c.text}</p>
                    <small>
                      {stamp(c.at)}
                      {c.author ? ` · ${c.author}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
            {client.commentAdd && <AddNote clientId={v.clientId} onAdded={changed} />}
          </>
        )}

        {client?.stats && (
          <>
            <h3 className="vw-h">{W.stats}</h3>
            <dl className="vw-grid">
              <div>
                <dt>{W.statLast}</dt>
                <dd>{client.stats.lastVisit == null ? W.none : stamp(client.stats.lastVisit)}</dd>
              </div>
              <div>
                <dt>{W.statVisits}</dt>
                <dd>{client.stats.visits}</dd>
              </div>
              <div>
                <dt>{W.statNoShow}</dt>
                <dd>{client.stats.noShows}</dd>
              </div>
              <div>
                <dt>{W.statSold}</dt>
                <dd>{euro(client.stats.soldCents)}</dd>
              </div>
            </dl>
          </>
        )}

        <h3 className="vw-h">{W.data}</h3>
        {x ? (
          <dl className="vw-grid">
            <div>
              <dt>{W.created}</dt>
              <dd>{stamp(x.createdAt)}</dd>
            </div>
            <div>
              <dt>{W.source}</dt>
              <dd>{A.records.sources[x.source] ?? x.source}</dd>
            </div>
            <div>
              <dt>{W.by}</dt>
              <dd>{maker(x.by)}</dd>
            </div>
          </dl>
        ) : (
          <p className="vw-dim" role="status">
            {extras === "failed" ? A.error : A.loading}
          </p>
        )}
      </section>
    </VwFrame>
  );
}

/** The visit's tiles: its extra fields, its messages, its history. */
const TILES = ["fields", "notify", "log"] as const satisfies readonly Tile[];

/**
 * «Товары»: the shop's products by a name or a barcode, through the shop
 * link (the same search as «Продажа товара»: one list of products, the
 * shop's). A product picked is sold to this client by the visit's barber
 * with the same action as «Продажа товара» (frame-actions.ts, sellAction),
 * after one more press that says the price.
 */
function Goods({ v, onSold }: { v: CalVisit; onSold: () => void }) {
  const A = useA();
  const W = A.win;
  const S = A.sale;
  const frame = useFrame();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FrameProduct[]>([]);
  const [look, setLook] = useState<Look>("idle");
  const [demo, setDemo] = useState(false);
  const [pick, setPick] = useState<FrameProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  // one ref per sale: kept while the same sale is sent again
  const ref = useRef<string | null>(null);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) return;
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      setLook("looking");
      const r = await findProductsAction(s).catch(() => ({ ok: false, code: "shop_down" }) as const);
      if (n !== seq.current) return;
      if (!r.ok) {
        setFound([]);
        return setLook(r.code);
      }
      setDemo(r.demo);
      setFound(r.items);
      setLook(r.items.length ? "idle" : "nothing");
    }, DELAY);
    return () => window.clearTimeout(t);
  }, [q]);

  const sell = async () => {
    if (!pick || busy) return;
    setBusy(true);
    setErr("");
    ref.current ??= newRef();
    const r = await sellAction({ ref: ref.current, staffId: v.staffId, productId: pick.productId, variant: pick.variant, qty: 1, expectCents: pick.priceCents, clientId: v.clientId, at: null }).catch(() => null);
    setBusy(false);
    if (!r) return setErr(A.error);
    if (r.ok) {
      frame.say(W.sold(pick.title));
      ref.current = null;
      setPick(null);
      return onSold();
    }
    ref.current = null;
    if (r.code === "price_changed") {
      setPick({ ...pick, priceCents: r.unitCents });
      return setErr(S.priceChanged(euroText(r.unitCents)));
    }
    if (r.code === "invalid") return setErr(r.field === "forbidden" ? A.rights.refused : r.field === "staff" ? S.needSeller : A.error);
    setErr(r.code === "not_found" ? S.notFound : S.shopDown);
  };

  return (
    <>
      <label className="vw-search">
        <span className="sr">{W.searchGoods}</span>
        <input
          type="search"
          placeholder={S.search}
          autoComplete="off"
          maxLength={80}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 2) {
              seq.current++;
              setFound([]);
              setLook("idle");
            }
          }}
        />
      </label>
      {demo && <p className="vw-dim">{S.demo}</p>}
      {pick ? (
        <div className="vw-sell">
          <span className="txt">
            <b>{pick.title}</b>
            <small>{pick.stock == null ? euroText(pick.priceCents) : `${euroText(pick.priceCents)} · ${S.stock(pick.stock)}`}</small>
          </span>
          <button
            type="button"
            className="vw-btn"
            onClick={() => {
              ref.current = null;
              setPick(null);
              setErr("");
            }}
          >
            {A.cancel}
          </button>
          <button type="button" className="vw-btn vw-btn-main" disabled={busy} onClick={() => void sell()}>
            {W.sellFor(euroText(pick.priceCents))}
          </button>
        </div>
      ) : look === "looking" ? (
        <p className="vw-dim" role="status">
          {S.looking}
        </p>
      ) : look === "nothing" || look === "shop_down" || look === "not_configured" ? (
        <p className="vw-dim" role="status">
          {look === "nothing" ? S.nothing : look === "shop_down" ? S.shopDown : S.notConfigured}
        </p>
      ) : (
        found.length > 0 && (
          <ul className="vw-goods" aria-label={S.product}>
            {found.map((p) => (
              <li key={`${p.productId}:${p.variant}`}>
                <button
                  type="button"
                  onClick={() => {
                    ref.current = null;
                    setErr("");
                    setPick(p);
                  }}
                >
                  <span className="txt">
                    <b>{p.title}</b>
                    {p.stock != null && <small>{S.stock(p.stock)}</small>}
                  </span>
                  <span className="end">{euroText(p.priceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      {err && (
        <p className="adm-err" role="alert">
          {err}
        </p>
      )}
    </>
  );
}

/** «+ Добавить примечание о клиенте»: a comment on his card, through the card's own action. */
function AddNote({ clientId, onAdded }: { clientId: string; onAdded: () => void }) {
  const A = useA();
  const W = A.win;
  const frame = useFrame();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!open)
    return (
      <button type="button" className="vw-txt vw-add" onClick={() => setOpen(true)}>
        <PlusIcon size={14} />
        {W.addNote}
      </button>
    );
  const add = async () => {
    setBusy(true);
    setErr("");
    const r = await addCommentAction(clientId, text).catch(() => null);
    setBusy(false);
    if (!r) return setErr(A.error);
    if (!r.ok) return setErr(r.field === "forbidden" ? A.rights.refused : A.visit.invalid(r.field));
    frame.say(W.noteAdded);
    setText("");
    setOpen(false);
    onAdded();
  };
  return (
    <div className="vw-note">
      <label className="vw-field">
        <span>{W.noteText}</span>
        <textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {err && (
        <p className="adm-err" role="alert">
          {err}
        </p>
      )}
      <div className="vw-row">
        <button type="button" className="vw-btn" onClick={() => setOpen(false)}>
          {A.cancel}
        </button>
        <button type="button" className="vw-btn vw-btn-main" disabled={busy || !text.trim()} onClick={() => void add()}>
          {A.save}
        </button>
      </div>
    </div>
  );
}

/* ---------- a phone: the one visit sheet (visit-sheet.tsx) ---------- */

/**
 * Renat's phone: the visit sheet the barber's day has too (visit-sheet.tsx),
 * with the calendar's data and the admin's actions. The chips, a service
 * added or taken away and the visit's note are written at once, and the
 * sheet stays open; a cancel or a move closes it. «Перенести» takes the
 * journal's grid; where there is none («Записи», «Визиты») it is a form of
 * the barber, the day and the time, as before.
 */
function VisitSheet({ v, data, onClose, onMove, onDone, onChanged }: PanelProps) {
  const A = useA();
  const may = useMay();
  const frame = useFrame();
  const tz = data.tz;

  // the visit as written here; taken anew when the journal's data comes again
  const fresh = () => ({ status: v.status, confirmed: v.confirmed, ids: v.services.map((s) => s.serviceId), totalCents: v.totalCents, extraCents: v.extraCents, end: v.end, staffNote: v.staffNote });
  const [st, setSt] = useState(fresh);
  const key = `${v.status}|${v.confirmed}|${v.services.map((s) => s.serviceId).join()}|${v.totalCents}|${v.end}|${v.staffNote}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setSt(fresh());
  }
  const [moving, setMoving] = useState(false);

  // «Карточка клиента» and his visits: the window's own read
  const [extras, setExtras] = useState<VisitExtras | null>(null);
  useEffect(() => {
    let live = true;
    visitWindowAction(v.id).then(
      (r) => live && setExtras(r),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [v.id]);

  // a cancelled visit («Записи» opens one) is only shown; a visit the client has come to has rights of its own
  const gone = st.status === "cancelled";
  const came = CAME.has(st.status);
  const canEdit = !gone && may.edit && (!came || may.editCame);
  const canGrid = !gone && !!onMove && may.move && (!came || may.editCame);
  const canForm = !gone && !onMove && canEdit && may.moveWindow;
  const canCancel = !gone && (came ? may.cancelCame : may.cancel);
  const staff = data.staff.find((s) => s.id === v.staffId);
  const phone = v.clientPhone;

  const offers = canEdit && may.services
    ? offered(data.services, v.staffId).map((s) => ({ id: s.id, name: A.pick(s.name), cents: s.offers[v.staffId][0], minutes: s.offers[v.staffId][1] }))
    : null;
  // a line as booked keeps its price; one added here is the barber's own
  const lineOf = (id: string) => {
    const booked = v.services.find((s) => s.serviceId === id);
    if (booked) return { id, name: A.pick(booked.name), cents: booked.priceCents, minutes: booked.durationMin };
    const s = data.services.find((o) => o.id === id);
    const o = s?.offers[v.staffId];
    return { id, name: A.pick(s?.name), cents: o?.[0] ?? s?.priceCents ?? 0, minutes: o?.[1] ?? s?.durationMin ?? 0 };
  };
  const problemText = (code: string, field?: string) =>
    code === "overlap" ? A.visit.overlap : code === "not_offered" ? A.visit.notOffered : code === "invalid" ? A.visit.invalid(field) : code === "forbidden" ? A.rights.refused : A.error;

  if (moving) return <MoveForm v={v} data={data} onBack={() => setMoving(false)} onClose={onClose} onDone={onDone} problemText={problemText} />;

  const client = extras?.client ?? null;
  return (
    <VisitSheetView
      w={A.vs}
      intl={A.intl}
      tz={tz}
      clientName={v.clientName}
      start={v.start}
      end={st.end}
      staffName={staff?.name}
      phone={phone}
      callable={!!phone && may.call && !phone.includes("•")}
      card={client?.card ? { href: `/admin/clients/${v.clientId}`, visits: client.stats?.visits ?? null } : null}
      clientNote={v.clientNote}
      comment={v.comment}
      staffNote={st.staffNote}
      saveStaffNote={
        canEdit && may.note
          ? async (text) => {
              const r = await updateVisit(v.id, { staffNote: text });
              if (!r.ok) return false;
              setSt((x) => ({ ...x, staffNote: text.trim() }));
              onChanged?.();
              return true;
            }
          : undefined
      }
      gone={gone}
      chip={chipOf(st.status, st.confirmed)}
      onChip={
        canEdit
          ? async (c) => {
              const [status, confirmed] = CHIP[c];
              if (!(await setVisitStatus(v.id, status, confirmed))) return false;
              setSt((x) => ({ ...x, status, confirmed }));
              onChanged?.();
              return true;
            }
          : undefined
      }
      lines={st.ids.map(lineOf)}
      extraCents={st.extraCents}
      totalCents={st.totalCents}
      offers={offers}
      onServices={async (ids, force) => {
        const r = await updateVisit(v.id, { serviceIds: ids, force });
        if (r.ok) {
          setSt((x) => ({ ...x, ids, totalCents: r.totalCents, extraCents: r.extraCents, end: r.end }));
          onChanged?.();
          return { ok: true };
        }
        if (r.code === "outside_hours" || r.code === "time_off") return { ok: false, warn: r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours };
        return { ok: false, problem: problemText(r.code, r.field) };
      }}
      onMove={canGrid ? onMove : canForm ? () => setMoving(true) : undefined}
      onCancelYes={
        canCancel
          ? async () => {
              try {
                const r = await cancelVisit(v.id);
                if (r === "cancelled" || r === "already") return onDone(A.cal.cancelled);
                frame.say(r === "forbidden" ? A.rights.refused : A.error, true);
              } catch {
                frame.say(A.error, true);
              }
            }
          : undefined
      }
      meta={`${A.visit.source[v.source] ?? v.source}${v.anyStaff ? ` · ${A.visit.anyStaff}` : ""}${v.reminder ? ` · ${A.visit.sms}` : ""}`}
      onClose={onClose}
      say={frame.say}
    />
  );
}

/** «Перенести» without the journal's grid: the barber, the day, the time; the «anyway» question above the button. */
function MoveForm({
  v,
  data,
  onBack,
  onClose,
  onDone,
  problemText,
}: {
  v: CalVisit;
  data: CalendarData;
  onBack: () => void;
  onClose: () => void;
  onDone: (text: string) => void;
  problemText: (code: string, field?: string) => string;
}) {
  const A = useA();
  const tz = data.tz;
  const [sid, setSid] = useState(v.staffId);
  const [day, setDay] = useState(() => dayOf(tz, v.start));
  const [time, setTime] = useState(() => timeOf(tz, v.start));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const save = async (force: boolean) => {
    const m = minutesOf(time);
    if (!Number.isFinite(m)) return setProblem(A.visit.invalid("start"));
    setBusy(true);
    setProblem(null);
    try {
      const r = await updateVisit(v.id, { staffId: sid, start: momentAt(day, m, tz), force });
      if (r.ok) return onDone(A.saved);
      if (r.code === "outside_hours" || r.code === "time_off") setWarn(r.code === "time_off" ? A.visit.overBlock : A.visit.outsideHours);
      else setProblem(problemText(r.code, r.field));
    } catch {
      setProblem(A.error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={v.clientName}
      onClose={onClose}
      bar={
        <>
          <BarNote problem={problem} warn={warn} />
          <div className="adm-bar-row">
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={warn ? () => setWarn(null) : onBack}>
              {warn ? A.cancel : A.back}
            </button>
            <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void save(!!warn)}>
              {warn ? A.visit.anywayMove : A.visit.saveChanges}
            </button>
          </div>
        </>
      }
    >
      <StaffPicker data={data} value={sid} onChange={setSid} />
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
    </Sheet>
  );
}
