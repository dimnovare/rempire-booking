"use client";

/**
 * The barber's day on his phone (B2): the week strip, his hours and the
 * day's money, the next client with «call» and one tap for «arrived» or
 * «done», then the whole day in order: visits, free time, breaks.
 * Pull down (or come back to the app) to refresh.
 *
 * B3: «+» or a tap on free time books a visit in his column; a visit's sheet
 * moves it, cancels it (with a reason) or books the client again.
 * B6: the visit's sheet edits the client's shared note and the visit's own
 * note, and opens the client's card (his visits with this client).
 *
 * `own`: the same day as «Мой день» of an owner or the front desk who cuts
 * too (docs/apps.md, «One app for Renat»), a tab of the one app. The head
 * follows the design board: «Мой день», a line with the day, the count and
 * the sum, «День | Неделя», and «+ Запись»; a visit is a card in the
 * journal's colours. Everything it does is the barber's day.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { Offer } from "@/lib/barber/book";
import { visitLook } from "@/lib/admin/journal";
import type { BBlock, BDay, BMay, BVisit } from "@/lib/barber/day";
import { coversDay, freeGaps, hoursText, nextVisit, type Gap } from "@/lib/barber/gaps";
import { extraText, hasExtra } from "@/lib/slots";
import { addDays, localParts, startOfDay } from "@/lib/tz";
import { NextIcon, PlusIcon, PrevIcon } from "../../admin/icons";
import { cap, dateWords, eur, hm, minsText, pick3 } from "../copy.shared";
import { useB, useTitle } from "../lang";
import { CancelSheet, MoveSheet, NewVisitSheet, type NewPrefill } from "./book-sheets";
import { ClientSheet, NoteEditor } from "./client-sheet";
import { BSheet } from "./sheet";
import { MayProvider, useMay } from "./may";
import { OwnSeg } from "./own-head";
import { saveClientNote, saveVisitNote, setVisitStatus } from "./visit-actions";

const MIN = 60_000;
/** how far to pull (px, after the drag is halved) before letting go refreshes */
const PULL = 64;

type Props = { days: BDay[]; date: string; today: string; now: number; tz: string; step: number; offers: Offer[]; may: BMay; own?: boolean };
const CAME = new Set(["arrived", "done"]);

/** What is open over the day: a visit, a new visit, or a visit being moved or cancelled. */
type Open = { kind: "visit" | "move" | "cancel" | "client"; id: string } | { kind: "new"; prefill: NewPrefill };

/** The barber's day, with what the login may do in it handed down to its sheets. */
export function DayView(props: Props) {
  return (
    <MayProvider value={props.may}>
      <Day {...props} />
    </MayProvider>
  );
}

function Day({ days, date, today, now: serverNow, tz, step, offers, may, own = false }: Props) {
  const B = useB();
  useTitle(own ? B.own.title : B.nav.day);
  const router = useRouter();
  const [sel, setSel] = useState(days.some((d) => d.date === date) ? date : days[0].date);
  const [sheet, setSheet] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const now = useNow(serverNow);
  // offline, or the copy the service worker kept (a weak connection says it is online)
  const onLine = useOnline();
  const cached = useCached(serverNow);
  const online = onLine && !cached;
  const [refreshing, startRefresh] = useTransition();
  const reload = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const pulled = usePullRefresh(reload, sheet === null);
  useAutoRefresh(reload);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const choose = (d: string) => {
    setSel(d);
    setSheet(null);
    // the address follows the strip: a reload, «back» or the refresh land on this day
    window.history.replaceState(null, "", d === today ? "/b" : `/b?d=${d}`);
  };

  const status = async (v: BVisit, s: string) => {
    setBusy(true);
    try {
      const ok = await setVisitStatus(v.id, s);
      setToast(ok ? { text: B.visit.status[s] ?? s } : { text: B.error, bad: true });
    } catch {
      setToast({ text: B.error, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const day = days.find((d) => d.date === sel) ?? days[0];
  const visitOf = (id: string) => days.flatMap((d) => d.visits).find((v) => v.id === id) ?? null;
  const open = sheet && sheet.kind !== "new" ? visitOf(sheet.id) : null;
  const openVisit = (id: string) => setSheet({ kind: "visit", id });
  // the server lists a start only where the visit and its tidy-up fit (startsIn)
  const shortest = offers.length ? Math.min(...offers.map((o) => o.durationMin + o.bufferMin)) * MIN : Infinity;
  const book = (prefill: Partial<NewPrefill>) => setSheet({ kind: "new", prefill: { date: sel < today ? today : sel, ...prefill } });
  /** «Записать снова»: the usual four weeks on from that visit, the same client and services. */
  const again = (v: BVisit) => {
    const later = addDays(localParts(v.start, tz).date, 28);
    book({
      date: later < today ? today : later,
      client: { id: v.clientId, name: v.clientName, phone: v.clientPhone },
      serviceIds: v.services.map((x) => x.serviceId),
    });
  };

  /** After a booking or a move: say so, and show that day (a day of another week loads it). */
  const done = (text: string, date?: string) => {
    setSheet(null);
    setToast({ text });
    if (!date || date === sel) return;
    if (days.some((d) => d.date === date)) choose(date);
    else router.replace(date === today ? "/b" : `/b?d=${date}`);
  };
  const rel = sel === today ? B.day.today : sel === addDays(today, 1) ? B.day.tomorrow : sel === addDays(today, -1) ? B.day.yesterday : null;
  const words = cap(dateWords(sel, B.lang));
  const wholeDay = day.blocks.find((b) => coversDay(b, sel, tz));
  const hours = hoursText(day.windows, tz);
  const next = sel === today ? nextVisit(day.visits, now) : null;
  const thisWeek = days.some((d) => d.date === today);

  // a new visit is offered only with the right to make one
  const canBook = offers.length > 0 && may.create;
  const dayState = wholeDay ? `${B.day.kinds[wholeDay.kind] ?? wholeDay.kind} · ${B.day.allDay}` : hours ? B.day.hours(hours) : B.day.off;
  const toToday =
    !thisWeek || sel !== today ? (
      thisWeek ? (
        <button type="button" className="adm-txt" onClick={() => choose(today)}>
          {B.day.toToday}
        </button>
      ) : (
        <Link href="/b" className="adm-txt" prefetch={false} replace>
          {B.day.toToday}
        </Link>
      )
    ) : null;
  const specials = day.special.map((s) => (
    <p key={s.id} className="bx-sp">
      {B.day.special(extraText(s))} · {hm(s.from, tz)}–{hm(s.to, tz)}
    </p>
  ));
  return (
    <main className={`adm-page bx-day${own ? " is-own" : ""}`}>
      <div className="bx-pull" style={{ height: pulled }} aria-hidden={pulled === 0}>
        {pulled > 0 && <span>{pulled >= PULL ? B.day.release : B.day.pull}</span>}
      </div>
      {(refreshing || !online) && (
        <p className={`bx-state${online ? "" : " is-off"}`} role="status">
          {online ? B.day.refresh + "…" : B.offline}
        </p>
      )}

      {own && (
        // «Мой день»: the head of the design board
        <header className="bx-own-head">
          <div>
            <h1 className="adm-h1">{B.own.title}</h1>
            <p className="bx-own-line">
              {words}
              {day.count > 0 && ` · ${B.day.visits(day.count)}`}
              {/* the day's sum: «Показывать статистику» */}
              {day.count > 0 && may.stats && ` · ${eur(day.totalCents)}`}
            </p>
            {/* a day he is not at work says so */}
            {(wholeDay || !hours) && <p className="bx-own-line">{dayState}</p>}
          </div>
          <OwnSeg view="day" date={sel} today={today} words={B.own} />
        </header>
      )}

      <nav className="bx-strip" aria-label={B.day.days}>
        <Link href={`/b?d=${addDays(sel, -7)}`} className="adm-ibtn" aria-label={B.day.prevWeek} prefetch={false} replace>
          <PrevIcon />
        </Link>
        <div className="bx-strip-days">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              aria-pressed={d.date === sel}
              aria-label={`${dateWords(d.date, B.lang)}${d.count ? `, ${B.day.visits(d.count)}` : ""}`}
              className={`${d.date === today ? "is-today" : ""}${d.windows.length ? "" : " is-off"}`}
              onClick={() => choose(d.date)}
            >
              <small>{dateWords(d.date, B.lang, { weekday: "short" })}</small>
              <b>{Number(d.date.slice(8))}</b>
              <i>{d.count || ""}</i>
            </button>
          ))}
        </div>
        <Link href={`/b?d=${addDays(sel, 7)}`} className="adm-ibtn" aria-label={B.day.nextWeek} prefetch={false} replace>
          <NextIcon />
        </Link>
      </nav>

      {own ? (
        (toToday || specials.length > 0) && (
          <div className="bx-head">
            {toToday && <div className="bx-head-row bx-own-today">{toToday}</div>}
            {specials}
          </div>
        )
      ) : (
        <header className="bx-head">
          <div className="bx-head-row">
            <h1 className="adm-h1">{rel ?? words}</h1>
            {toToday}
          </div>
          {rel && <p className="adm-meta">{words}</p>}
          <p className="bx-sum">
            <span>{dayState}</span>
            {day.count > 0 && (
              <span>
                {B.day.visits(day.count)}
                {/* the day's sum: «Показывать статистику» */}
                {may.stats && (
                  <>
                    {" "}
                    · <b>{eur(day.totalCents)}</b>
                  </>
                )}
              </span>
            )}
          </p>
          {specials}
        </header>
      )}

      {next && <NextCard v={next} now={now} tz={tz} busy={busy} onOpen={() => openVisit(next.id)} onStatus={status} />}

      <Timeline day={day} now={now} tz={tz} step={step} shortest={may.create ? shortest : Infinity} own={own} onOpen={openVisit} onFree={(start) => book({ start })} />

      {canBook &&
        (own ? (
          // «+ Запись», as the design board's
          <button type="button" className="bx-fab bx-fab-pill" aria-label={B.book.new} onClick={() => book({})}>
            <PlusIcon size={14} />
            <span>{B.own.add}</span>
          </button>
        ) : (
          <button type="button" className="bx-fab" aria-label={B.book.new} onClick={() => book({})}>
            <PlusIcon size={26} />
          </button>
        ))}

      {open && sheet?.kind === "visit" && (
        <VisitSheet
          v={open}
          tz={tz}
          busy={busy}
          canBook={canBook}
          onClose={() => setSheet(null)}
          onStatus={status}
          onMove={() => setSheet({ kind: "move", id: open.id })}
          onCancel={() => setSheet({ kind: "cancel", id: open.id })}
          onAgain={() => again(open)}
          onClient={() => setSheet({ kind: "client", id: open.id })}
          onSaved={(text) => setToast({ text })}
        />
      )}
      {open && sheet?.kind === "client" && (
        <ClientSheet
          clientId={open.clientId}
          name={open.clientName}
          tz={tz}
          canBook={canBook}
          onClose={() => setSheet(null)}
          onBack={() => openVisit(open.id)}
          onAgain={() => again(open)}
          onSaved={(text) => setToast({ text })}
        />
      )}
      {open && sheet?.kind === "move" && <MoveSheet v={open} tz={tz} today={today} onClose={() => openVisit(open.id)} onDone={done} />}
      {open && sheet?.kind === "cancel" && <CancelSheet v={open} tz={tz} onClose={() => openVisit(open.id)} onDone={(t) => done(t)} />}
      {sheet?.kind === "new" && <NewVisitSheet offers={offers} tz={tz} today={today} prefill={sheet.prefill} onClose={() => setSheet(null)} onDone={done} />}
      {toast && (
        <p className={`adm-toast${toast.bad ? " is-bad" : ""}`} role="status">
          {toast.text}
        </p>
      )}
    </main>
  );
}

const services = (v: BVisit, lang: Parameters<typeof pick3>[1]) => v.services.map((s) => pick3(s.name, lang)).join(" + ");

function NextCard({ v, now, tz, busy, onOpen, onStatus }: { v: BVisit; now: number; tz: string; busy: boolean; onOpen: () => void; onStatus: (v: BVisit, s: string) => void }) {
  const B = useB();
  const may = useMay();
  const inChair = v.status === "arrived" || v.start <= now;
  const wait = Math.max(1, Math.round((v.start - now) / MIN));
  // one tap for what comes next: «arrived» from half an hour before, then «done»
  const next = v.status === "arrived" ? "done" : v.status === "booked" && v.start - now <= 30 * MIN ? "arrived" : null;
  const quick = next && may.edit && (!CAME.has(v.status) || may.editCame) ? next : null;
  const phone = may.call ? v.clientPhone : null;
  return (
    <section className={`bx-next${inChair ? " is-now" : ""}`} aria-label={B.day.next}>
      <p className="bx-next-when">{inChair ? B.day.now : `${B.day.next} · ${B.day.inMin(wait)}`}</p>
      <button type="button" className="bx-next-main" onClick={onOpen}>
        <b>
          {hm(v.start, tz)}–{hm(v.end, tz)}
        </b>
        <span>{v.clientName}</span>
        <small>{services(v, B.lang)}</small>
      </button>
      {(phone || quick) && (
        <div className="adm-bar-row">
          {phone && (
            <a className="adm-btn adm-btn-line adm-btn-auto" href={`tel:${phone}`}>
              {B.visit.call}
            </a>
          )}
          {quick && (
            <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => onStatus(v, quick)}>
              {B.day.quick[quick]}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

type Item = { at: number; order: number; key: string } & ({ kind: "visit"; v: BVisit } | { kind: "gap"; g: Gap } | { kind: "block"; b: BBlock });

function Timeline({
  day,
  now,
  tz,
  step,
  shortest,
  own,
  onOpen,
  onFree,
}: {
  day: BDay;
  now: number;
  tz: string;
  step: number;
  /** his shortest service with its tidy-up, in ms: a gap shorter than that books nothing */
  shortest: number;
  /** «Мой день»: a visit is a card in the journal's colours */
  own: boolean;
  onOpen: (id: string) => void;
  onFree: (start: number) => void;
}) {
  const B = useB();
  const d0 = startOfDay(day.date, tz);
  const d1 = startOfDay(addDays(day.date, 1), tz);
  const gaps = freeGaps(day, { now, stepMin: step });
  const items: Item[] = [
    ...day.visits.map((v) => ({ at: v.start, order: 1, key: v.id, kind: "visit" as const, v })),
    ...gaps.map((g) => ({ at: g.from, order: 2, key: `g${g.from}`, kind: "gap" as const, g })),
    ...day.blocks.filter((b) => !coversDay(b, day.date, tz)).map((b) => ({ at: Math.max(b.from, d0), order: 0, key: b.id, kind: "block" as const, b })),
  ].sort((x, y) => x.at - y.at || x.order - y.order);

  if (!items.length) return <p className="adm-meta bx-empty">{B.day.empty}</p>;
  return (
    <>
      {!day.visits.length && gaps.length > 0 && <p className="adm-meta bx-empty">{B.day.emptyFree}</p>}
      <ol className="bx-tl">
        {items.map((it) => {
          if (it.kind === "visit") {
            const v = it.v;
            const live = now >= v.start && now < v.end;
            // «Мой день»: the strip says who made it, the body its state (src/lib/admin/journal.ts)
            const look = own ? visitLook(v.status, v.source) : null;
            return (
              <li
                key={it.key}
                className={`bx-v st-${v.status}${v.extraCents ? " is-sp" : ""}${live ? " is-now" : ""}`}
                style={look ? ({ "--h": look.strip, "--b": look.body, "--n": look.name } as React.CSSProperties) : undefined}
              >
                <button type="button" onClick={() => onOpen(v.id)}>
                  <span className="bx-t">
                    <b>{hm(v.start, tz)}</b>
                    <small>{hm(v.end, tz)}</small>
                  </span>
                  <span className="bx-v-main">
                    <b>{v.clientName}</b>
                    <small>{services(v, B.lang)}</small>
                  </span>
                  <span className="bx-v-side">
                    <b>{eur(v.totalCents)}</b>
                    {v.status !== "booked" && <small className={`adm-tag${v.status === "arrived" ? " lime" : v.status === "no_show" ? " warn" : ""}`}>{B.visit.status[v.status] ?? v.status}</small>}
                  </span>
                </button>
              </li>
            );
          }
          if (it.kind === "gap") {
            const g = it.g;
            const free = B.day.gap(minsText(Math.round((g.to - g.from) / MIN), B.h, B.min));
            const inner = (
              <>
                <span className="bx-t">
                  <b>{hm(g.from, tz)}</b>
                  <small>{hm(g.to, tz)}</small>
                </span>
                <span className="bx-gap-main">
                  {free}
                  {/* free time has no visit yet: the window's own extra, «+20 €» or «+50 %» */}
                  {hasExtra(g) && <small> · {extraText(g)}</small>}
                </span>
              </>
            );
            return (
              <li key={it.key} className={`bx-gap${hasExtra(g) ? " is-sp" : ""}`}>
                {g.to - g.from >= shortest ? (
                  <button type="button" aria-label={`${B.book.addAt(hm(g.from, tz))}. ${free}`} onClick={() => onFree(g.from)}>
                    {inner}
                    <span className="bx-gap-add" aria-hidden="true">
                      <PlusIcon />
                    </span>
                  </button>
                ) : (
                  // too short for any of his services: free time to see, nothing to book
                  <div>{inner}</div>
                )}
              </li>
            );
          }
          const b = it.b;
          return (
            <li key={it.key} className={`bx-blk${b.status === "requested" ? " is-req" : ""}`}>
              <span className="bx-t">
                <b>{hm(Math.max(b.from, d0), tz)}</b>
                <small>{hm(Math.min(b.to, d1), tz)}</small>
              </span>
              <span className="bx-blk-main">
                <b>{B.day.kinds[b.kind] ?? b.kind}</b>
                {b.note && <small>{b.note}</small>}
                {b.status === "requested" && <small className="adm-tag">{B.day.requested}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function VisitSheet({
  v,
  tz,
  busy,
  canBook,
  onClose,
  onStatus,
  onMove,
  onCancel,
  onAgain,
  onClient,
  onSaved,
}: {
  v: BVisit;
  tz: string;
  busy: boolean;
  canBook: boolean;
  onClose: () => void;
  onStatus: (v: BVisit, s: string) => void;
  onMove: () => void;
  onCancel: () => void;
  onAgain: () => void;
  onClient: () => void;
  onSaved: (text: string) => void;
}) {
  const B = useB();
  const may = useMay();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(v.start);
  // a visit still to come can be moved or cancelled (one that took place is history)
  const ahead = v.status === "booked" || v.status === "pending";
  // a visit the client has come to has a right of its own
  const canEdit = may.edit && (!CAME.has(v.status) || may.editCame);
  return (
    <BSheet title={v.clientName} onClose={onClose}>
      <p className="adm-time">
        <b>
          {hm(v.start, tz)}–{hm(v.end, tz)}
        </b>
        <span>{cap(dateWords(date, B.lang))}</span>
      </p>
      {v.clientPhone ? (
        may.call ? (
          <a className="adm-phone" href={`tel:${v.clientPhone}`}>
            {v.clientPhone} · {B.visit.call}
          </a>
        ) : (
          // a masked number: shown, never a link to call
          <span className="adm-phone">{v.clientPhone}</span>
        )
      ) : (
        may.card && <p className="adm-meta">{B.visit.noPhone}</p>
      )}
      {may.card && (
        <button type="button" className="adm-txt lime bx-card-link" onClick={onClient}>
          {B.client.card}
        </button>
      )}
      <NoteEditor
        key={`c-${v.clientId}`}
        label={B.visit.clientNote}
        hint={B.visit.clientNoteHint}
        value={v.clientNote}
        canEdit={may.card && may.clientNote}
        onSave={async (text) => {
          const ok = await saveClientNote(v.clientId, text);
          if (ok) onSaved(B.client.noteSaved);
          return ok;
        }}
      />
      <div className="adm-status" role="group" aria-label={B.visit.setStatus}>
        {(["arrived", "done", "no_show"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={v.status === s} disabled={busy || !canEdit} onClick={() => onStatus(v, v.status === s ? "booked" : s)}>
            {B.visit.status[s]}
          </button>
        ))}
      </div>
      <ul className="adm-lines">
        {v.services.map((s, i) => (
          <li key={i}>
            <span>
              {pick3(s.name, B.lang)} <small className="adm-meta">· {minsText(s.durationMin, B.h, B.min)}</small>
            </span>
            <span>{eur(s.priceCents)}</span>
          </li>
        ))}
        {v.extraCents > 0 && (
          <li className="is-sp">
            <span>{B.visit.extra}</span>
            <span>+{eur(v.extraCents)}</span>
          </li>
        )}
        <li className="tot">
          <span>{B.visit.total}</span>
          <span>{eur(v.totalCents)}</span>
        </li>
      </ul>
      {v.comment && (
        <div className="bx-noteblk">
          <small>{B.visit.comment}</small>
          <p className="adm-note">«{v.comment}»</p>
        </div>
      )}
      <NoteEditor
        key={`v-${v.id}`}
        label={B.visit.visitNote}
        value={v.staffNote}
        canEdit={canEdit && may.note}
        onSave={async (text) => {
          const ok = await saveVisitNote(v.id, text);
          if (ok) onSaved(B.client.noteSaved);
          return ok;
        }}
      />
      <p className="adm-meta">
        {B.visit.source[v.source] ?? v.source}
        {v.reminder ? "" : ` · ${B.visit.reminderOff}`}
      </p>
      {((ahead && may.move) || canBook) && (
        <div className="adm-bar-row bx-visit-acts">
          {ahead && may.move && (
            <button type="button" className="adm-btn adm-btn-line adm-btn-auto" onClick={onMove}>
              {B.book.move}
            </button>
          )}
          {canBook && (
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={onAgain}>
              {B.book.again}
            </button>
          )}
        </div>
      )}
      {ahead && may.cancel && (
        <button type="button" className="adm-txt warn bx-cancel" onClick={onCancel}>
          {B.book.cancel}
        </button>
      )}
    </BSheet>
  );
}

/** The clock, ticking every half minute (the next client's «in 25 min», the free time). */
function useNow(initial: number): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return now;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The page is the service worker's kept copy (public/b/sw.js): the server
 * made it more than five minutes before it opened. A fresh page from the
 * server, after a refresh, clears it.
 */
const CACHED_MS = 5 * 60_000;
function useCached(serverNow: number): boolean {
  const [cached, setCached] = useState(false);
  useEffect(() => {
    setCached(Date.now() - serverNow > CACHED_MS);
  }, [serverNow]);
  return cached;
}

/** Fresh data when the barber comes back to the app, and every two minutes while it is open. */
function useAutoRefresh(reload: () => void) {
  useEffect(() => {
    const seen = () => {
      if (document.visibilityState === "visible" && navigator.onLine) reload();
    };
    document.addEventListener("visibilitychange", seen);
    const t = setInterval(seen, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", seen);
      clearInterval(t);
    };
  }, [reload]);
}

/**
 * Pull down at the top of the page to refresh: an installed app on an
 * iPhone has no pull-to-refresh of its own. Returns how far it is pulled.
 */
function usePullRefresh(onRefresh: () => void, enabled: boolean): number {
  const [dist, setDist] = useState(0);
  const on = useRef(enabled);
  useEffect(() => {
    on.current = enabled;
  }, [enabled]);
  useEffect(() => {
    let y0: number | null = null;
    let d = 0;
    const start = (e: TouchEvent) => {
      y0 = on.current && window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      d = 0;
    };
    const move = (e: TouchEvent) => {
      if (y0 === null) return;
      d = Math.max(0, Math.min(110, (e.touches[0].clientY - y0) / 2));
      setDist(d);
    };
    const end = () => {
      if (y0 !== null && d >= PULL) onRefresh();
      y0 = null;
      d = 0;
      setDist(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [onRefresh]);
  return dist;
}
