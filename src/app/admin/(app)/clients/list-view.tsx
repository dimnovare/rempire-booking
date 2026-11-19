"use client";

/**
 * «Клиенты»: the list.
 *
 * **From 900px it is the client base in full** (the owner, 19.11.2026; laid
 * out as the design board «Клиенты, список», in the new-style controls of
 * the journal's bar): the title with its star and «Операции с Excel» and
 * «Добавить клиента» on the right; one search field; «Сегменты:»;
 * «Фильтры:» with their conditions and «Найти» (base-filters.tsx); the
 * table with a tick per row, a click on a head to sort and a cog for the
 * columns; and a bar that stays at the bottom: the page size, the pager,
 * «Показаны результаты с 1 до 25 из N» and «Действия» (base-actions.tsx).
 *
 * **A phone keeps its simple list:** the search, one category as a filter,
 * a row per client, 25 a page; of the above it takes only the segments.
 *
 * The first page comes from the server with the page. Everything after it
 * (a search, a condition, an order, another page) is asked for by an
 * action and kept here: what is typed is a client's name or phone, and
 * those stay out of the address.
 *
 * The search asks by itself a moment after the last keystroke; the
 * conditions are a draft until «Найти». The ticks are of the rows in view:
 * a new question takes them off.
 *
 * A client's card opens over the list (layout.tsx): from 900px the list
 * stays in view behind the drawer with the open client's row outlined in
 * yellow; on a phone the card is the page and the list is put away until
 * the card is closed. Either way the search is still there afterwards.
 * When the card changes, adds or deletes a client it says so
 * (CLIENTS_CHANGED), and the list asks for its page again.
 */
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ClientColumn } from "@/lib/admin/client-columns";
import { cleanCond, PAGE_SIZE, PAGE_SIZES, segmentConds, type ClientSort, type CondInput, type Join, type Segment } from "@/lib/admin/client-filter";
import type { ListMay } from "@/lib/admin/client-scope";
import type { ClientList } from "@/lib/admin/clients";
import { todayIn } from "@/lib/tz";
import { eur } from "../../copy";
import { NextIcon, PlusIcon, PrevIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { Sheet } from "../sheet";
import { Titled } from "../star";
import { listClientsAction, saveClientAction, setColumnsAction } from "./actions";
import { ActionDialog, ActionsMenu, ExcelMenu, Pager, type Started } from "./base-actions";
import { draftOf, FilterBar, inputOf, Segments, type CondOptions, type Draft } from "./base-filters";
import { BaseTable } from "./base-table";
import { CLIENTS_CHANGED } from "./card-fields";
import type { ClientQuery } from "./query";

/** After the last keystroke, before the list is asked for. */
const DELAY = 300;
/** What the list is asked: every part is there. */
type Asked = Required<ClientQuery>;
const ALL: Asked = { q: "", label: "", page: 1, size: PAGE_SIZE, sort: "name", dir: "asc", join: "and", conds: [] };
const isAll = (f: Asked) => !f.q && !f.label && f.page === 1 && f.size === PAGE_SIZE && f.sort === "name" && f.dir === "asc" && !f.conds.length;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export type ClientsViewProps = {
  initial: ClientList;
  tz: string;
  /** what the login may do with the list (its rights): the export, adding, a mass message, «Удалить из базы» */
  may: ListMay;
  /** the columns this login keeps in the table */
  columns: ClientColumn[];
  /** what the conditions pick from: the barbers and the services */
  staff: CondOptions["staff"];
  services: CondOptions["services"];
};

export function ClientsView({ initial, tz, may, columns, staff, services }: ClientsViewProps) {
  const A = useA();
  const C = A.clients;
  const B = C.base;
  const frame = useFrame();
  // the client whose card is open over the list (/admin/clients/<id>), if any
  const { id: open } = useParams<{ id?: string }>();
  // what is in the field, and what the list was last asked for (a moment behind the typing)
  const [text, setText] = useState("");
  const [f, setF] = useState<Asked>(ALL);
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // the conditions as they are being put together; they are asked with at «Найти»
  const [rows, setRows] = useState<Draft[]>([]);
  const [join, setJoin] = useState<Join>("and");
  const [bad, setBad] = useState<ReadonlySet<number>>(new Set());
  const [segment, setSegment] = useState<Segment | null>(null);
  const [ticks, setTicks] = useState<ReadonlySet<string>>(new Set());
  const [cols, setCols] = useState<readonly ClientColumn[]>(columns);
  // the action picked under «Действия», with the clients it is for
  const [started, setStarted] = useState<Started | null>(null);
  const r = useRef({ seq: 0, started: false, timer: 0 });

  // the server sent the first page anew (a client was added, the section was opened again):
  // that is the list as long as nothing is searched for
  const [sent, setSent] = useState(initial);
  if (sent !== initial) {
    setSent(initial);
    if (isAll(f)) setData(initial);
  }

  useEffect(() => {
    const s = r.current;
    // the first page came with the page itself. Every later run asks: a new search, or this
    // page shown again after a client's card (Next keeps it, hidden, and its effects start anew)
    if (!s.started) {
      s.started = true;
      return;
    }
    const n = ++s.seq;
    setBusy(true);
    listClientsAction(f).then(
      (list) => {
        if (n !== s.seq) return;
        setData(list);
        // a tick stays only on a row that is still in view
        setTicks((cur) => (cur.size ? new Set(list.rows.filter((c) => cur.has(c.id)).map((c) => c.id)) : cur));
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
  }, [f]);
  useEffect(() => {
    const s = r.current;
    return () => window.clearTimeout(s.timer);
  }, []);
  // a card saved, added or deleted a client: the same search, asked for again
  useEffect(() => {
    const again = () => setF((cur) => ({ ...cur }));
    window.addEventListener(CLIENTS_CHANGED, again);
    return () => window.removeEventListener(CLIENTS_CHANGED, again);
  }, []);

  /** A new question: the ticks were of the rows of the old one. */
  const ask = (next: (cur: Asked) => Asked) => {
    window.clearTimeout(r.current.timer);
    setTicks(new Set());
    setF(next);
  };
  // «Мои клиенты» in the journal's panel «Моё» (journal-mine.tsx): /admin/clients?barber=<id> opens the list
  // on the clients who came to that barber, as the condition «По визитам: сотрудник» would. A barber's id is
  // no client's data, so it may be in the address; what is typed in the search still never is.
  const preset = useSearchParams().get("barber");
  useEffect(() => {
    if (!preset || !staff.some((s) => s.id === preset)) return;
    const cond: CondInput = { kind: "barber", value: preset };
    setSegment(null);
    setRows([draftOf(cond)]);
    setJoin("and");
    setBad(new Set());
    ask((cur) => ({ ...cur, conds: [cond], join: "and", page: 1 }));
    // once, for the barber the address names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  const type = (v: string) => {
    setText(v);
    window.clearTimeout(r.current.timer);
    const q = v.trim();
    r.current.timer = window.setTimeout(() => {
      setTicks(new Set());
      setF((cur) => (cur.q === q ? cur : { ...cur, q, page: 1 }));
    }, DELAY);
  };
  const turn = (page: number) => {
    ask((cur) => ({ ...cur, page }));
    window.scrollTo({ top: 0 });
  };
  const reset = () => {
    setText("");
    setRows([]);
    setBad(new Set());
    setSegment(null);
    ask((cur) => ({ ...ALL, size: cur.size, sort: cur.sort, dir: cur.dir }));
  };
  /** «Найти»: the search and the conditions as they stand; a condition that is not whole is marked instead. */
  const find = () => {
    const wrong = rows.filter((d) => !cleanCond(inputOf(d))).map((d) => d.key);
    setBad(new Set(wrong));
    if (wrong.length) return;
    const conds = rows.map(inputOf);
    ask((cur) => ({ ...cur, q: text.trim(), conds, join, page: 1 }));
  };
  /** The bin: every condition off, and the list without them. */
  const clear = () => {
    setRows([]);
    setBad(new Set());
    setSegment(null);
    ask((cur) => (cur.conds.length ? { ...cur, conds: [], page: 1 } : cur));
  };
  /** A segment fills the conditions in for today and asks at once; picked again, it is taken off. */
  const pickSegment = (s: Segment | null) => {
    const conds: CondInput[] = s ? segmentConds(s, todayIn(tz)) : [];
    setSegment(s);
    setRows(conds.map(draftOf));
    setJoin("and");
    setBad(new Set());
    ask((cur) => ({ ...cur, conds, join: "and", page: 1 }));
  };
  const sortBy = (sort: ClientSort) => ask((cur) => ({ ...cur, sort, dir: cur.sort === sort ? (cur.dir === "asc" ? "desc" : "asc") : sort === "name" ? "asc" : "desc", page: 1 }));
  /** The columns are shown changed at once and kept for the login. */
  const pickColumns = (next: ClientColumn[]) => {
    const before = cols;
    setCols(next);
    setColumnsAction(next).then(
      (kept) => kept && setCols(kept),
      () => {
        setCols(before);
        frame.say(A.error, true);
      },
    );
  };

  const day = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
  const filtered = !!(f.q || f.label || f.conds.length);
  // a category that is picked but no client carries any more still shows as picked
  const labels = f.label && !data.labels.includes(f.label) ? [...data.labels, f.label] : data.labels;
  const from = (data.page - 1) * data.size + 1;

  return (
    <div className={`cl-listpart cb${open ? " is-behind" : ""}`}>
      <div className="adm-page-head cl-top">
        <div className="cb-titles">
          <Titled page="clients">
            <h1 className="adm-h1">
              <span className="only-narrow">{C.title}</span>
              <span className="only-wide">{B.title}</span>
            </h1>
          </Titled>
          <p className="cb-crumb only-wide">{C.title}</p>
        </div>
        <div className="cb-head-btns">
          <div className="only-wide">
            <ExcelMenu owner={may.export} question={f} />
          </div>
          {may.edit && <AddClient />}
        </div>
      </div>
      {data.total === 0 && !filtered && !busy ? (
        <p className="adm-note">{failed ? A.error : C.none}</p>
      ) : (
        <>
          <form
            className="cl-filters cb-searchrow"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              find();
            }}
          >
            <label className="cl-search">
              <SearchIcon />
              <input type="search" enterKeyHint="search" autoComplete="off" maxLength={60} placeholder={C.search} aria-label={C.search} value={text} onChange={(e) => type(e.target.value)} />
            </label>
            {labels.length > 0 && (
              <select className="only-narrow" aria-label={C.label} value={f.label} onChange={(e) => ask((cur) => ({ ...cur, label: e.target.value, page: 1 }))}>
                <option value="">{C.allLabels}</option>
                {labels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </form>
          <Segments value={segment} onPick={pickSegment} />
          <FilterBar
            rows={rows}
            join={join}
            bad={bad}
            options={{ staff, services, labels: data.labels }}
            onRows={(next) => {
              setRows(next);
              setSegment(null);
              if (bad.size) setBad(new Set());
            }}
            onJoin={(j) => {
              setJoin(j);
              setSegment(null);
            }}
            onClear={clear}
            onFind={find}
          />
          <p className={failed ? "adm-err" : "adm-meta only-narrow"} role="status">
            {failed ? A.error : C.count(data.total, filtered)}
          </p>
          {data.total === 0 ? (
            <div className="cl-empty">
              <p className="adm-meta">{C.nothing}</p>
              <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={reset}>
                {C.reset}
              </button>
            </div>
          ) : (
            <div className={`cl-list${busy ? " is-busy" : ""}`}>
              {/* a table on a wide screen; a row per client on a phone */}
              <BaseTable rows={data.rows} open={open} tz={tz} columns={cols} onColumns={pickColumns} sort={f.sort} dir={f.dir} onSort={sortBy} ticks={ticks} onTicks={setTicks} />
              <ul className="adm-list only-narrow">
                {data.rows.map((c) => (
                  <li key={c.id}>
                    <Link className="adm-item cl-item" href={`/admin/clients/${c.id}`} prefetch={false}>
                      <span className="txt">
                        <b>{c.name}</b>
                        {(c.phone || c.email) && <small>{[c.phone, c.email].filter(Boolean).join(" · ")}</small>}
                        <small>{c.visits ? [A.visit.visitsN(c.visits), c.lastVisit ? C.lastOn(day.format(c.lastVisit)) : ""].filter(Boolean).join(" · ") : C.noVisits}</small>
                        {c.labels.length > 0 && (
                          <span className="tags">
                            {c.labels.map((l) => (
                              <span key={l} className="adm-tag">
                                {l}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="end price">{eur(c.soldCents)}</span>
                      <span className="adm-chev">
                        <NextIcon />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.pages > 1 && (
            <nav className="cl-pages only-narrow" aria-label={C.pages}>
              <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={data.page <= 1 || busy} onClick={() => turn(data.page - 1)}>
                <PrevIcon size={16} />
                {C.prev}
              </button>
              <span>{C.page(data.page, data.pages)}</span>
              <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={data.page >= data.pages || busy} onClick={() => turn(data.page + 1)}>
                {C.next}
                <NextIcon size={16} />
              </button>
            </nav>
          )}
          {data.total > 0 && (
            <div className="cb-bar only-wide">
              <label className="cb-size">
                <select aria-label={B.perPageLabel} value={f.size} onChange={(e) => ask((cur) => ({ ...cur, size: Number(e.target.value), page: 1 }))}>
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span>{B.perPage}</span>
              </label>
              <Pager page={data.page} pages={data.pages} busy={busy} onTurn={turn} />
              <span className="cb-space" />
              <span className="cb-shown">{B.shown(from, from + data.rows.length - 1, data.total)}</span>
              <ActionsMenu ticked={data.rows.filter((c) => ticks.has(c.id)).map((c) => c.id)} total={data.total} question={f} may={may} onStart={setStarted} />
            </div>
          )}
        </>
      )}
      {/* beside the list, not in its bar: the window stays while the list behind it is asked for again */}
      {started && <ActionDialog started={started} labels={data.labels} onClose={() => setStarted(null)} onDone={() => ask((cur) => ({ ...cur }))} />}
    </div>
  );
}

type NewClient = { name: string; phone: string; email: string };
const EMPTY: NewClient = { name: "", phone: "", email: "" };

/** «Добавить клиента»: a name, and a phone and an e-mail if there are any; his card opens next. */
function AddClient() {
  const A = useA();
  const C = A.clients;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  // what to fix; with `other`, the client who has this phone already
  const [err, setErr] = useState<{ text: string; other?: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await saveClientAction(null, d);
      if (res.ok) {
        // closed before his card opens: this page is kept, and «back» must not find the sheet still open
        setOpen(false);
        setBusy(false);
        return router.push(`/admin/clients/${res.id}`);
      }
      setErr(res.field === "phoneTaken" ? { text: C.taken, other: res.clientId } : { text: A.visit.invalid(res.field) });
    } catch {
      setErr({ text: A.error });
    }
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        className="adm-btn adm-btn-lime adm-btn-sm"
        onClick={() => {
          setD(EMPTY);
          setErr(null);
          setOpen(true);
        }}
      >
        <PlusIcon />
        {C.add}
      </button>
      {open && (
        <Sheet
          title={A.visit.newClient}
          onClose={() => !busy && setOpen(false)}
          bar={
            <>
              {err && (
                <p className="adm-err" role="alert">
                  {err.text}
                  {err.other && (
                    <>
                      {" "}
                      <Link href={`/admin/clients/${err.other}`} prefetch={false}>
                        {C.openHim}
                      </Link>
                    </>
                  )}
                </p>
              )}
              <button type="submit" form="cl-new" className="adm-btn adm-btn-lime" disabled={busy}>
                {C.add}
              </button>
            </>
          }
        >
          <form
            id="cl-new"
            className="adm-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="adm-field">
              <span>{A.visit.name}</span>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input required autoFocus autoComplete="off" maxLength={120} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </label>
            <label className="adm-field">
              <span>{A.visit.phone}</span>
              <input type="tel" inputMode="tel" autoComplete="off" maxLength={40} placeholder="+372" aria-describedby="cl-new-phone" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
            </label>
            <p className="adm-meta cl-hint" id="cl-new-phone">
              {C.phoneHint}
            </p>
            <label className="adm-field">
              <span>{C.email}</span>
              <input type="email" inputMode="email" autoComplete="off" maxLength={254} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
            </label>
          </form>
        </Sheet>
      )}
    </>
  );
}
