"use client";

/**
 * «Визиты» (dashboard/), as the tool's landing of «Отчёты» is laid out
 * (docs/altegio-pages.md, «D. Dashboards»): two panels side by side from
 * 1200px, one under the other below it.
 *
 *   «Визиты»   the switch «предстоящие (N)» / «прошедшие»; the visits by
 *              day, each a row of the timeline: a clock badge with the time
 *              and the length, then «Client / phone» (opens the visit), the
 *              services, the barber; «Подробнее» adds the next ones.
 *   «Лента активности по записям»
 *              «новые онлайн (N)», «Все», «Онлайн», «Офлайн»; the bookings
 *              something last happened to, by day: where it came from, the
 *              service (opens the visit), ✓ «Подтвердить запись» and the bin
 *              «Отменить запись», a line of date, barber, length and client,
 *              then its history, the latest first.
 *
 * A visit opens in the journal's own window (../visit-window.tsx), cut by
 * the server for this login. ✓ and the bin are the calendar's own actions:
 * the buttons only show where the login may, and the server asks again.
 * After any change both panels are asked again.
 */
import { useRef, useState } from "react";
// types only: the lib reads the database and stays on the server
import type { DashMay, DashVisit, DashVisits, DashWhen, Feed, FeedEntry, FeedFilter, FeedLog } from "@/lib/admin/dashboards";
import type { VisitForSheet } from "@/lib/admin/records";
import { cap } from "../../copy.shared";
import { BinIcon, PencilIcon, TickIcon } from "../../icons";
import { useA } from "../../lang";
import { cancelVisit, setVisitStatus } from "../actions";
import { useFrame } from "../frame";
import { Titled } from "../star";
import { VisitWindow } from "../visit-window";
import { feedAction, listVisitsAction, openVisitAction } from "./actions";

export type VisitsViewProps = {
  tz: string;
  may: DashMay;
  visits: DashVisits;
  feed: Feed;
  /** rows the left panel opens with, and how many «Подробнее» adds (the lib's VISITS_FIRST and VISITS_MORE) */
  first: number;
  more: number;
};

const CAME = new Set(["arrived", "done"]);
const WAITS = new Set(["pending", "booked"]);

export function VisitsView({ tz, may, visits: firstVisits, feed: firstFeed, first: VISITS_FIRST, more: VISITS_MORE }: VisitsViewProps) {
  const A = useA();
  const D = A.dash;
  const frame = useFrame();
  const [when, setWhen] = useState<DashWhen>("upcoming");
  const [visits, setVisits] = useState(firstVisits);
  const [vBusy, setVBusy] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [feed, setFeed] = useState(firstFeed);
  const [fBusy, setFBusy] = useState(false);
  const [win, setWin] = useState<VisitForSheet | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [asking, setAsking] = useState<FeedEntry | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  // when the page was opened: ✓ is for a visit still ahead (the server asks again)
  const [now] = useState(() => Date.now());
  // the answers that came after a newer question are dropped
  const seq = useRef({ v: 0, f: 0 });

  // the server sent the panels anew (a visit changed, the page was opened again):
  // they are the panels while they still show what the page opens with
  const [sent, setSent] = useState({ firstVisits, firstFeed });
  if (sent.firstVisits !== firstVisits || sent.firstFeed !== firstFeed) {
    setSent({ firstVisits, firstFeed });
    if (when === "upcoming" && visits.rows.length <= VISITS_FIRST) setVisits(firstVisits);
    if (filter === "all" && feed.entries.length <= firstFeed.entries.length) setFeed(firstFeed);
  }

  const loadVisits = async (w: DashWhen, offset: number, limit: number) => {
    const n = ++seq.current.v;
    setVBusy(true);
    try {
      const got = await listVisitsAction({ when: w, offset, limit });
      if (n !== seq.current.v) return;
      setVisits((cur) => (offset ? { ...got, rows: [...cur.rows, ...got.rows] } : got));
    } catch {
      if (n === seq.current.v) frame.say(D.failed, true);
    }
    if (n === seq.current.v) setVBusy(false);
  };
  const loadFeed = async (f: FeedFilter, offset: number) => {
    const n = ++seq.current.f;
    setFBusy(true);
    try {
      const got = await feedAction({ filter: f, offset });
      if (n !== seq.current.f) return;
      setFeed((cur) => (offset ? { ...got, entries: [...cur.entries, ...got.entries] } : got));
    } catch {
      if (n === seq.current.f) frame.say(D.failed, true);
    }
    if (n === seq.current.f) setFBusy(false);
  };
  /** Something changed: both panels again, as long as they are now. */
  const again = () => {
    void loadVisits(when, 0, Math.max(VISITS_FIRST, visits.rows.length));
    void loadFeed(filter, 0);
  };

  const open = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try {
      const got = await openVisitAction(id);
      if (got) setWin(got);
      else frame.say(A.error, true);
    } catch {
      frame.say(A.error, true);
    }
    setOpening(null);
  };

  const confirm = async (e: FeedEntry) => {
    setActing(e.id);
    try {
      if (await setVisitStatus(e.id, "booked", true)) {
        frame.say(D.confirmed);
        again();
      } else frame.say(A.error, true);
    } catch {
      frame.say(A.error, true);
    }
    setActing(null);
  };

  const wd = new Intl.DateTimeFormat(A.intl, { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const wdShort = new Intl.DateTimeFormat(A.intl, { timeZone: tz, weekday: "short", day: "numeric", month: "long" });
  const hm = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  /** «Пятница, 20 ноября» */
  const dayOf = (ms: number) => cap(wd.format(ms));
  /** «Пт, 20 ноября, 12:13» */
  const at = (ms: number) => `${cap(wdShort.format(ms))}, ${hm.format(ms)}`;
  const length = (v: DashVisit) => A.mins(Math.max(0, Math.round((v.end - v.start) / 60_000)));
  const services = (v: DashVisit) => v.services.map((s) => A.pick(s)).filter(Boolean).join(", ");
  const who = (v: DashVisit) => (v.clientPhone ? `${v.clientName} / ${v.clientPhone}` : v.clientName);
  const statusOf = (status: string, confirmed: boolean) =>
    status === "cancelled" ? A.visit.status.cancelled : WAITS.has(status) ? (confirmed ? A.records.statuses.confirmed : A.records.statuses.waiting) : (A.records.statuses[status] ?? A.visit.status[status] ?? status);

  /** Rows split by their day, in the order they come. */
  const byDay = <T,>(rows: T[], ms: (r: T) => number) => {
    const out: { key: string; first: number; rows: T[] }[] = [];
    for (const r of rows) {
      const key = dayKey.format(ms(r));
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(r);
      else out.push({ key, first: ms(r), rows: [r] });
    }
    return out;
  };

  const switchTo = (w: DashWhen) => {
    if (w === when) return;
    setWhen(w);
    void loadVisits(w, 0, VISITS_FIRST);
  };
  const filterTo = (f: FeedFilter) => {
    if (f === filter) return;
    setFilter(f);
    void loadFeed(f, 0);
  };

  const filterWord = (f: FeedFilter) => (f === "fresh" ? D.freshN(feed.fresh) : D.feedFilters[f]);
  const mayCancel = (v: DashVisit) => v.status !== "cancelled" && (CAME.has(v.status) ? may.cancelCame : may.cancel);
  const mayConfirm = (v: DashVisit) => may.confirm && WAITS.has(v.status) && !v.confirmed && v.start > now;

  return (
    <div className="dsv">
      <div className="adm-page-head dsv-head">
        <div className="cb-titles">
          <Titled page="visits">
            <h1 className="adm-h1">{D.visitsTitle}</h1>
          </Titled>
          <p className="cb-crumb only-wide">{D.crumb}</p>
        </div>
      </div>

      <div className="dsv-cols">
        <section className={`dsv-panel dsv-left${vBusy ? " is-busy" : ""}`} aria-labelledby="dsv-visits" aria-busy={vBusy}>
          <div className="dsv-bar">
            <h2 id="dsv-visits">{D.visitsTitle}</h2>
            <div className="dsv-switch" role="group" aria-label={D.visitsTitle}>
              <button type="button" aria-pressed={when === "upcoming"} onClick={() => switchTo("upcoming")}>
                {D.upcoming(visits.upcoming)}
              </button>
              <button type="button" aria-pressed={when === "past"} onClick={() => switchTo("past")}>
                {D.past}
              </button>
            </div>
          </div>
          <div className="dsv-body">
            {visits.rows.length === 0 ? (
              <p className="adm-meta">{when === "upcoming" ? D.noUpcoming : D.noPast}</p>
            ) : (
              byDay(visits.rows, (v) => v.start).map((day) => (
                <div key={day.key} className="dsv-day">
                  <h3>{dayOf(day.first)}</h3>
                  <ul className="dsv-rows">
                    {day.rows.map((v) => (
                      <li key={v.id}>
                        <div className="dsv-time">
                          <span className="dsv-clock" aria-hidden="true">
                            <ClockIcon />
                          </span>
                          <b className="num">{hm.format(v.start)}</b>
                          <small>{length(v)}</small>
                        </div>
                        <div className="dsv-what">
                          <button type="button" className="dsv-link" disabled={opening === v.id} aria-label={D.openVisit(v.clientName, at(v.start))} onClick={() => void open(v.id)}>
                            {who(v)}
                          </button>
                          {services(v) && <span>{services(v)}</span>}
                          <small>{v.staffName}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {visits.more && (
              <button type="button" className="dsv-more" disabled={vBusy} onClick={() => void loadVisits(when, visits.rows.length, VISITS_MORE)}>
                {D.more}
              </button>
            )}
          </div>
        </section>

        <section className={`dsv-panel dsv-feed${fBusy ? " is-busy" : ""}`} aria-labelledby="dsv-feed" aria-busy={fBusy}>
          <div className="dsv-bar">
            <h2 id="dsv-feed">{D.feedTitle}</h2>
            <div className="dsv-switch" role="group" aria-label={D.feedTitle}>
              {(["fresh", "all", "online", "offline"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => filterTo(f)}>
                  {filterWord(f)}
                </button>
              ))}
            </div>
          </div>
          <div className="dsv-body">
            {feed.entries.length === 0 ? (
              <p className="adm-meta">{D.feedNone}</p>
            ) : (
              byDay(feed.entries, (e) => e.lastAt).map((day) => (
                <div key={day.key} className="dsv-day">
                  <h3>{dayOf(day.first)}</h3>
                  {day.rows.map((e) => (
                    <article key={e.id} className="dsv-entry" aria-label={`${e.clientName}, ${at(e.start)}`}>
                      <div className="dsv-entry-top">
                        <span className="dsv-tag">{A.records.sources[e.source] ?? e.source}</span>
                        <div className="dsv-tools">
                          {mayConfirm(e) && (
                            <button type="button" className="dsv-ibtn" title={D.confirm} aria-label={`${D.confirm}: ${e.clientName}, ${at(e.start)}`} disabled={acting === e.id} onClick={() => void confirm(e)}>
                              <TickIcon size={16} />
                            </button>
                          )}
                          {mayCancel(e) && (
                            <button type="button" className="dsv-ibtn" title={D.cancel} aria-label={`${D.cancel}: ${e.clientName}, ${at(e.start)}`} disabled={acting === e.id} onClick={() => setAsking(e)}>
                              <BinIcon size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      <button type="button" className="dsv-link dsv-svc" disabled={opening === e.id} onClick={() => void open(e.id)}>
                        {services(e) || D.booking}
                      </button>
                      <p className="dsv-meta">
                        <span>
                          <CalIcon />
                          {at(e.start)}
                        </span>
                        <span>
                          <PersonIcon />
                          {e.staffName}
                        </span>
                        <span>
                          <ClockIcon />
                          {length(e)}
                        </span>
                        <span>
                          <ClientIcon />
                          {who(e)}
                        </span>
                        <span className={`dsv-status is-${e.status}`}>{statusOf(e.status, e.confirmed)}</span>
                      </p>
                      {e.comment && <p className="dsv-comment">{D.comment(e.comment)}</p>}
                      {e.log.length > 0 && (
                        <ol className="dsv-log">
                          {e.log.map((l, i) => (
                            <LogRow key={`${l.at}:${i}`} l={l} at={at} statusOf={statusOf} />
                          ))}
                        </ol>
                      )}
                    </article>
                  ))}
                </div>
              ))
            )}
            {feed.more && (
              <button type="button" className="dsv-more" disabled={fBusy} onClick={() => void loadFeed(filter, feed.entries.length)}>
                {D.more}
              </button>
            )}
          </div>
        </section>
      </div>

      {win && (
        <VisitWindow
          key={win.data.visits[0].id}
          v={win.data.visits[0]}
          data={win.data}
          may={win.may}
          onClose={() => setWin(null)}
          onDone={(text) => {
            setWin(null);
            frame.say(text);
            again();
          }}
          onChanged={again}
        />
      )}
      {asking && (
        <CancelAsk
          entry={asking}
          when={at(asking.start)}
          onClose={() => setAsking(null)}
          onDone={(text) => {
            setAsking(null);
            frame.say(text);
            again();
          }}
        />
      )}
    </div>
  );
}

/* ---------- a row of a booking's history ---------- */

function LogRow({ l, at, statusOf }: { l: FeedLog; at: (ms: number) => string; statusOf: (status: string, confirmed: boolean) => string }) {
  const A = useA();
  const D = A.dash;
  const by = l.by.kind === "client" ? A.records.madeByClient : l.by.kind === "user" ? l.by.name : l.by.kind === "import" ? A.records.madeByImport : A.records.madeBySalon;
  const lines: [React.ReactNode, string][] = [];
  if (l.action === "move") {
    if (l.fromStart !== null) lines.push([<CalIcon key="i" />, D.was([at(l.fromStart), l.fromStaffName].filter(Boolean).join(", "))]);
    if (l.start !== null) lines.push([<CalIcon key="i" />, D.now([at(l.start), l.staffName].filter(Boolean).join(", "))]);
  } else {
    if (l.start !== null) lines.push([<CalIcon key="i" />, at(l.start)]);
    if (l.staffName) lines.push([<PersonIcon key="i" />, l.staffName]);
  }
  if (l.status) lines.push([<TickIcon key="i" size={12} />, D.statusIs(statusOf(l.status, l.confirmed))]);
  lines.push([<ClientIcon key="i" />, D.by(by)]);
  return (
    <li>
      <p>
        <span className="dsv-log-icon" aria-hidden="true">
          {l.action === "create" ? <TickIcon size={12} /> : <PencilIcon size={12} />}
        </span>
        {" — "}
        <b>{D.log[l.action] ?? l.action}</b>
        {" — "}
        <time dateTime={new Date(l.at).toISOString()}>{at(l.at)}</time>:
      </p>
      <ul>
        {lines.map(([icon, text], i) => (
          <li key={i}>
            {icon}
            {text}
          </li>
        ))}
      </ul>
    </li>
  );
}

/* ---------- the bin: the calendar's own cancel, after a question ---------- */

function CancelAsk({ entry, when, onClose, onDone }: { entry: FeedEntry; when: string; onClose: () => void; onDone: (text: string) => void }) {
  const A = useA();
  const D = A.dash;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await cancelVisit(entry.id);
      if (r === "cancelled") return onDone(D.cancelledOne);
      if (r === "already") return onDone(D.already);
      setErr(r === "forbidden" ? A.rights.refused : A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };
  return (
    <div className="cc-ask-wrap" onClick={() => !busy && onClose()} onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}>
      <div className="cc-ask cb-dialog" role="alertdialog" aria-modal="true" aria-label={D.cancelAsk} onClick={(e) => e.stopPropagation()}>
        <h2>{D.cancelAsk}</h2>
        <p>{`${entry.clientName}, ${when}`}</p>
        <p>{D.cancelLead}</p>
        {err && (
          <p className="adm-err" role="alert">
            {err}
          </p>
        )}
        <div className="cc-ask-btns">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className="cc-btn" autoFocus disabled={busy} onClick={onClose}>
            {A.visit.keep}
          </button>
          <button type="button" className="cc-btn cc-btn-main" disabled={busy} onClick={() => void run()}>
            {A.visit.cancelYes}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- the meta line's small icons ---------- */

const ip = { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;

function ClockIcon() {
  return (
    <svg {...ip}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
function CalIcon() {
  return (
    <svg {...ip}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg {...ip}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </svg>
  );
}
function ClientIcon() {
  return (
    <svg {...ip}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="10.5" r="2.2" />
      <path d="M5 16.5c.4-1.8 1.8-2.8 3.5-2.8s3.1 1 3.5 2.8M14.5 9.5h4M14.5 13.5h4" />
    </svg>
  );
}
