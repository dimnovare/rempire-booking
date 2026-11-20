"use client";

/**
 * «Записи»: every visit in one table (the owner, 19.11.2026; laid out as
 * the design board «Записи», in the new-style controls the client base
 * uses: 32px, 8px corners, a 1px #e0e3eb line, yellow for the main action).
 *
 * **From 900px:** the title with its star and the breadcrumb «Отчёты», and
 * on the right «Отменить выбранные» and «Операции с Excel»; the filters
 * (two rows of dates, the selects, the client and the services, the page
 * size and the yellow «Показать»); «Найдено N»; the table with a tick per
 * row and a pencil at its end; the pager at the bottom right.
 *
 * **A phone:** a row per visit, the filters in a sheet behind «Фильтры»,
 * no ticks, no file.
 *
 * The filters are a draft until «Показать». The first page comes from the
 * server with the page; every other question is asked by an action and
 * kept here: what is typed is a client's name or phone, and those stay out
 * of the address.
 *
 * The pencil opens the journal's own visit window (visit-window.tsx,
 * VisitWindow) with the visit as the server cut it for this login: from
 * 900px the drawer over the page, on a phone the bottom sheet. A
 * cancelled visit has an «i» in the pencil's place: its window only shows
 * it. «Отменить выбранные» asks first, then cancels each ticked visit
 * through the calendar's own cancel and says how many went and how many
 * did not and why.
 */
import { useEffect, useRef, useState } from "react";
import { RECORD_CANCELLED, RECORD_PAGE_SIZES, RECORD_SOURCES, RECORD_STATUSES, type RecordQuery } from "@/lib/admin/record-filter";
import type { RecordList, RecordRow, RecordsMay, VisitForSheet } from "@/lib/admin/records";
import { cap } from "../../copy.shared";
import { Ava, CaretIcon, FunnelIcon, InfoIcon, NextIcon, PencilIcon, PrevIcon, TickIcon, XIcon } from "../../icons";
import { useA } from "../../lang";
import { VisitWindow } from "../visit-window";
import { Pager } from "../clients/base-actions";
import { useFrame } from "../frame";
import { Pop } from "../pop";
import { Sheet } from "../sheet";
import { Titled } from "../star";
import { cancelRecordsAction, listRecordsAction, openVisitAction } from "./actions";

/** What the list is asked: every part is there. */
type Asked = Required<RecordQuery>;
type Option = { id: string; name: string };

export type RecordsViewProps = {
  initial: RecordList;
  /** the page's own first question: what `initial` answers */
  first: Asked;
  tz: string;
  /** what the login may do here (its rights) */
  may: RecordsMay;
  /** what the filters pick from: the barbers, the services, the logins */
  staff: Option[];
  services: Option[];
  makers: Option[];
};

const same = (a: Asked, b: Asked) => JSON.stringify(a) === JSON.stringify(b);

export function RecordsView({ initial, first, tz, may, staff, services, makers }: RecordsViewProps) {
  const A = useA();
  const R = A.records;
  const frame = useFrame();
  // the filters as they are being set, and what the list was last asked for
  const [draft, setDraft] = useState<Asked>(first);
  const [asked, setAsked] = useState<Asked>(first);
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ticks, setTicks] = useState<ReadonlySet<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  // the visit the pencil opened, and the one being fetched
  const [win, setWin] = useState<VisitForSheet | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // «Отменить выбранные»: the visits it was pressed for
  const [cancelling, setCancelling] = useState<string[] | null>(null);
  const r = useRef({ seq: 0, started: false });

  // the server sent the first page anew (a visit changed, the section was opened again):
  // that is the list as long as the question is still the page's own
  const [sent, setSent] = useState(initial);
  if (sent !== initial) {
    setSent(initial);
    if (same(asked, first)) setData(initial);
  }

  useEffect(() => {
    const s = r.current;
    // the first page came with the page itself. Every later run asks: a new question, or this page
    // shown again (Next keeps it, hidden, and its effects start anew)
    if (!s.started) {
      s.started = true;
      return;
    }
    const n = ++s.seq;
    setBusy(true);
    listRecordsAction(asked).then(
      (list) => {
        if (n !== s.seq) return;
        setData(list);
        // a tick stays only on a row that is still in view and can still be cancelled
        setTicks((cur) => (cur.size ? new Set(list.rows.filter((v) => cur.has(v.id) && v.status !== "cancelled").map((v) => v.id)) : cur));
        setBusy(false);
        setFailed(false);
      },
      () => {
        if (n !== s.seq) return;
        setBusy(false);
        setFailed(true);
      },
    );
    // an answer that comes after the next question, or after the page is left, is dropped
    return () => {
      s.seq++;
    };
  }, [asked]);

  /** A new question: the ticks were of the rows of the old one. */
  const ask = (next: Asked) => {
    setTicks(new Set());
    setAsked(next);
  };
  /** The same question again: a visit was changed or cancelled. */
  const again = () => setAsked((cur) => ({ ...cur }));
  /** «Показать»: the filters as they stand, from the first page. */
  const show = () => {
    setFiltersOpen(false);
    ask({ ...draft, q: draft.q.trim(), page: 1 });
  };
  const turn = (page: number) => {
    ask({ ...asked, page });
    window.scrollTo({ top: 0 });
  };
  const set = (patch: Partial<Asked>) => setDraft((cur) => ({ ...cur, ...patch }));

  const open = async (id: string) => {
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

  const wd = new Intl.DateTimeFormat(A.intl, { timeZone: tz, weekday: "short" });
  const dm = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit" });
  const hm = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  /** «Чт, 19.11, 18:15» */
  const when = (ms: number) => `${cap(wd.format(ms))}, ${dm.format(ms)}, ${hm.format(ms)}`;
  const madeBy = (v: RecordRow) => (v.by.kind === "client" ? R.madeByClient : v.by.kind === "user" ? v.by.name : v.by.kind === "import" ? R.madeByImport : R.madeBySalon);
  const statusOf = (v: RecordRow) => A.visit.status[v.status] ?? v.status;
  const sourceOf = (v: RecordRow) => R.sources[v.source] ?? v.source;
  const servicesOf = (v: RecordRow) => v.services.map((s) => A.pick(s)).join("; ");

  const live = data.rows.filter((v) => v.status !== "cancelled");
  const ticked = live.filter((v) => ticks.has(v.id)).map((v) => v.id);
  const all = live.length > 0 && live.every((v) => ticks.has(v.id));
  const tick = (id: string, on: boolean) => {
    const next = new Set(ticks);
    if (on) next.add(id);
    else next.delete(id);
    setTicks(next);
  };

  /* ---------- the filters' fields: one set, drawn for a wide screen's form and for a phone's sheet ---------- */

  const pick = (label: string, value: string, onChange: (v: string) => void, none: string, options: (readonly [string, string])[]) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
  const staffPick = pick(
    R.staff,
    draft.staffId,
    (staffId) => set({ staffId }),
    R.allStaff,
    staff.map((s) => [s.id, s.name] as const),
  );
  const byPick = pick(R.by, draft.by, (by) => set({ by }), R.byAll, [["client", R.byClient] as const, ...makers.map((m) => [m.id, m.name] as const)]);
  const cancelledPick = (
    <select aria-label={R.cancelled} value={draft.cancelled} onChange={(e) => set({ cancelled: e.target.value })}>
      {RECORD_CANCELLED.map((c) => (
        <option key={c} value={c}>
          {R.cancelledOf[c]}
        </option>
      ))}
    </select>
  );
  const statusPick = pick(
    R.status,
    draft.status,
    (status) => set({ status }),
    R.allStatuses,
    RECORD_STATUSES.map((s) => [s, R.statuses[s]] as const),
  );
  const sourcePick = pick(
    R.source,
    draft.source,
    (source) => set({ source }),
    R.allSources,
    RECORD_SOURCES.map((s) => [s, R.sources[s]] as const),
  );
  const toggleService = (id: string) => set({ serviceIds: draft.serviceIds.includes(id) ? draft.serviceIds.filter((x) => x !== id) : [...draft.serviceIds, id] });
  const dateField = (key: "createdFrom" | "createdTo" | "visitFrom" | "visitTo") => <input type="date" aria-label={R[key]} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} />;
  const clientField = <input type="search" enterKeyHint="search" autoComplete="off" maxLength={60} aria-label={R.client} placeholder={R.clientPh} value={draft.q} onChange={(e) => set({ q: e.target.value })} />;

  return (
    <div className="rc">
      <div className="adm-page-head rc-top">
        <div className="cb-titles">
          <Titled page="records">
            <h1 className="adm-h1">{R.title}</h1>
          </Titled>
          <p className="cb-crumb only-wide">{R.crumb}</p>
        </div>
        <div className="rc-head-btns only-wide">
          {may.cancel && (
            <button type="button" className="jr-btn rc-cancel" disabled={!ticked.length} onClick={() => setCancelling(ticked)}>
              <XIcon size={12} />
              <span>{R.cancelPicked}</span>
            </button>
          )}
          <ExcelMenu may={may.export} question={asked} />
        </div>
        <button type="button" className="adm-btn adm-btn-line adm-btn-sm only-narrow" onClick={() => setFiltersOpen(true)}>
          <FunnelIcon />
          {R.filters}
        </button>
      </div>

      <form
        className="rc-filters only-wide"
        role="search"
        aria-label={R.filters}
        onSubmit={(e) => {
          e.preventDefault();
          show();
        }}
      >
        <div className="rc-dates">
          <b>{R.created}</b>
          <label className="rc-date">
            <span>{R.from}</span>
            {dateField("createdFrom")}
          </label>
          <label className="rc-date">
            <span>{R.to}</span>
            {dateField("createdTo")}
          </label>
          <b>{R.visit}</b>
          <label className="rc-date">
            <span>{R.from}</span>
            {dateField("visitFrom")}
          </label>
          <label className="rc-date">
            <span>{R.to}</span>
            {dateField("visitTo")}
          </label>
        </div>
        <div className="rc-grid">
          {staffPick}
          {byPick}
          {cancelledPick}
          {statusPick}
          {sourcePick}
          <Pop
            kind="menu"
            name={R.services}
            place="left"
            className="rc-drop"
            button={
              <>
                <span>{draft.serviceIds.length ? R.servicesN(draft.serviceIds.length) : R.pickServices}</span>
                <CaretIcon size={10} />
              </>
            }
          >
            {() =>
              services.map((s) => {
                const on = draft.serviceIds.includes(s.id);
                return (
                  <button key={s.id} type="button" role="menuitemcheckbox" aria-checked={on} className="jr-item" onClick={() => toggleService(s.id)}>
                    <span className={`jr-box${on ? " is-on" : ""}`}>
                      <TickIcon size={10} />
                    </span>
                    <span>{s.name}</span>
                  </button>
                );
              })
            }
          </Pop>
          <div className="rc-client">{clientField}</div>
        </div>
        <div className="rc-run">
          <label className="rc-size">
            <select
              aria-label={R.perPageLabel}
              value={draft.size}
              onChange={(e) => {
                // how many a page is no filter: it applies at once, to the question as it was last asked
                const size = Number(e.target.value);
                set({ size });
                ask({ ...asked, size, page: 1 });
              }}
            >
              {RECORD_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>{R.perPage}</span>
          </label>
          <button type="submit" className="jr-btn jr-main rc-show">
            {R.show}
          </button>
        </div>
      </form>

      {filtersOpen && (
        <div className="only-narrow">
          <Sheet
            title={R.filters}
            onClose={() => setFiltersOpen(false)}
            bar={
              <button type="submit" form="rc-f" className="adm-btn adm-btn-lime">
                {R.show}
              </button>
            }
          >
            <form
              id="rc-f"
              className="adm-form"
              onSubmit={(e) => {
                e.preventDefault();
                show();
              }}
            >
              <div className="adm-row">
                <label className="adm-field">
                  <span>{R.visitFrom}</span>
                  {dateField("visitFrom")}
                </label>
                <label className="adm-field">
                  <span>{R.visitTo}</span>
                  {dateField("visitTo")}
                </label>
              </div>
              <div className="adm-row">
                <label className="adm-field">
                  <span>{R.createdFrom}</span>
                  {dateField("createdFrom")}
                </label>
                <label className="adm-field">
                  <span>{R.createdTo}</span>
                  {dateField("createdTo")}
                </label>
              </div>
              <label className="adm-field">
                <span>{R.client}</span>
                {clientField}
              </label>
              <label className="adm-field">
                <span>{R.staff}</span>
                {staffPick}
              </label>
              <label className="adm-field">
                <span>{R.by}</span>
                {byPick}
              </label>
              <label className="adm-field">
                <span>{R.cancelled}</span>
                {cancelledPick}
              </label>
              <label className="adm-field">
                <span>{R.status}</span>
                {statusPick}
              </label>
              <label className="adm-field">
                <span>{R.source}</span>
                {sourcePick}
              </label>
              <fieldset className="rc-svcs">
                <legend>{R.services}</legend>
                {services.map((s) => (
                  <label key={s.id} className="adm-check">
                    <input type="checkbox" checked={draft.serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </fieldset>
            </form>
          </Sheet>
        </div>
      )}

      <p className={`rc-found${failed ? " is-bad" : ""}`} role="status">
        {failed ? (
          A.error
        ) : (
          <>
            <span>{R.found}</span>
            <b>{data.total}</b>
          </>
        )}
      </p>

      {data.total === 0 ? (
        <p className="adm-meta rc-none">{R.none}</p>
      ) : (
        <div className={`rc-list${busy ? " is-busy" : ""}`}>
          <div className="cl-card rc-sheet only-wide">
            <table className="cl-table rc-table">
              <thead>
                <tr>
                  <th className="rc-tick">
                    {may.cancel && (
                      <input
                        type="checkbox"
                        aria-label={R.tickAll}
                        checked={all}
                        disabled={!live.length}
                        ref={(el) => {
                          if (el) el.indeterminate = !all && ticked.length > 0;
                        }}
                        onChange={(e) => setTicks(e.target.checked ? new Set(live.map((v) => v.id)) : new Set())}
                      />
                    )}
                  </th>
                  <th className="rc-ava" />
                  <th scope="col">{R.cols.staff}</th>
                  <th scope="col">{R.cols.services}</th>
                  <th scope="col">{R.cols.client}</th>
                  <th scope="col">{R.cols.visit}</th>
                  <th scope="col">{R.cols.by}</th>
                  <th scope="col">{R.cols.status}</th>
                  <th scope="col">{R.cols.source}</th>
                  <th className="rc-act" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((v) => {
                  const gone = v.status === "cancelled";
                  const at = when(v.start);
                  return (
                    <tr key={v.id} data-id={v.id} data-status={v.status} className={[gone ? "is-cancelled" : "", ticks.has(v.id) ? "is-ticked" : ""].filter(Boolean).join(" ") || undefined}>
                      <td className="rc-tick">{may.cancel && !gone && <input type="checkbox" aria-label={R.tick(v.clientName, at)} checked={ticks.has(v.id)} onChange={(e) => tick(v.id, e.target.checked)} />}</td>
                      <td className="rc-ava">
                        <Ava src={v.staffPhoto} name={v.staffName} className="rc-photo" />
                      </td>
                      <td data-col="staff">
                        <b>{v.staffName}</b>
                        <small>{A.pick(v.staffRole)}</small>
                      </td>
                      <td data-col="services" className="rc-wrap">
                        {servicesOf(v)}
                      </td>
                      <td data-col="client">
                        <span>{v.clientName}</span>
                        {v.clientPhone && <small>{v.clientPhone}</small>}
                      </td>
                      <td data-col="visit">{at}</td>
                      <td data-col="by">
                        <span>{madeBy(v)}</span>
                        <small>{when(v.createdAt)}</small>
                      </td>
                      <td data-col="status">{statusOf(v)}</td>
                      <td data-col="source">{sourceOf(v)}</td>
                      <td className="rc-act">
                        <button type="button" className="jr-btn jr-ibtn" aria-label={R.open(v.clientName, at)} title={R.open(v.clientName, at)} disabled={opening === v.id} onClick={() => void open(v.id)}>
                          {gone ? <InfoIcon /> : <PencilIcon />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* a phone: a row per visit; a tap opens it */}
          <ul className="adm-list rc-rows only-narrow">
            {data.rows.map((v) => (
              <li key={v.id}>
                <button type="button" className={`adm-item rc-item${v.status === "cancelled" ? " is-cancelled" : ""}`} data-id={v.id} data-status={v.status} disabled={opening === v.id} onClick={() => void open(v.id)}>
                  <span className="txt">
                    <b>
                      {when(v.start)} · {v.clientName}
                    </b>
                    <small>{[v.staffName, servicesOf(v)].filter(Boolean).join(" · ")}</small>
                    <small>{[statusOf(v), sourceOf(v), v.clientPhone].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="adm-chev">
                    <NextIcon />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.pages > 1 && (
        <>
          <div className="rc-pager only-wide">
            <Pager page={data.page} pages={data.pages} busy={busy} onTurn={turn} />
          </div>
          <nav className="cl-pages only-narrow" aria-label={A.clients.pages}>
            <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={data.page <= 1 || busy} onClick={() => turn(data.page - 1)}>
              <PrevIcon size={16} />
              {A.clients.prev}
            </button>
            <span>{A.clients.page(data.page, data.pages)}</span>
            <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={data.page >= data.pages || busy} onClick={() => turn(data.page + 1)}>
              {A.clients.next}
              <NextIcon size={16} />
            </button>
          </nav>
        </>
      )}

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
      {cancelling && <CancelDialog ids={cancelling} onClose={() => setCancelling(null)} onDone={again} />}
    </div>
  );
}

/* ---------- «Операции с Excel» ---------- */

function ExcelMenu({ may, question }: { may: boolean; question: RecordQuery }) {
  const A = useA();
  const R = A.records;
  const frame = useFrame();
  const [busy, setBusy] = useState(false);

  /** The file comes as the answer to a POST (the search stays out of the address), then is saved under its own name. */
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/admin/records/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(question) });
      if (!res.ok) throw new Error(String(res.status));
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "records.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      frame.say(R.exported(Number(res.headers.get("x-rows")) || 0));
    } catch {
      frame.say(A.error, true);
    }
    setBusy(false);
  };

  return (
    <Pop
      kind="menu"
      name={R.excel}
      button={
        <>
          <span>{R.excel}</span>
          <CaretIcon size={10} />
        </>
      }
    >
      {(close) => (
        <button
          type="button"
          role="menuitem"
          className="jr-item"
          disabled={!may || busy}
          onClick={() => {
            close();
            void save();
          }}
        >
          <span>{R.exportXlsx}</span>
          {!may && <small>{R.noRight}</small>}
        </button>
      )}
    </Pop>
  );
}

/* ---------- «Отменить выбранные» ---------- */

/** The question first; then how many were cancelled, and how many were not and why. */
function CancelDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const A = useA();
  const R = A.records;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ cancelled: number; refused: string } | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await cancelRecordsAction(ids);
      if (res.ok) {
        setDone({ cancelled: res.cancelled, refused: R.cancelRefused(res.refused) });
        onDone();
      } else setErr(res.code === "forbidden" ? A.rights.refused : A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  const title = R.cancelAsk(ids.length);
  return (
    <div className="cc-ask-wrap" onClick={() => !busy && onClose()}>
      <div className="cc-ask cb-dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {done ? (
          <p role="status">
            {R.cancelDone(done.cancelled)}
            {done.refused && ` ${done.refused}`}
          </p>
        ) : (
          <>
            <p>{R.cancelLead}</p>
            {err && (
              <p className="adm-err" role="alert">
                {err}
              </p>
            )}
          </>
        )}
        <div className="cc-ask-btns">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className="cc-btn" autoFocus disabled={busy} onClick={onClose}>
            {done ? A.close : A.visit.keep}
          </button>
          {!done && (
            <button type="button" className="cc-btn cc-btn-main" disabled={busy} onClick={() => void run()}>
              {R.cancelYes}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
