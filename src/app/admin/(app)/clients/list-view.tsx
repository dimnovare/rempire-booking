"use client";

/**
 * «Клиенты»: the list. A search field (name, phone or e-mail), one category
 * as a filter, «Добавить клиента»; a table from 900px, a row per client on
 * a phone; 25 a page.
 *
 * The first page comes from the server with the page. Everything after it
 * (a search, a category, another page) is asked for by an action and kept
 * here: what is typed is a client's name or phone, and those stay out of
 * the address. Coming back from a client's card, the same search is still
 * there and is asked for again, so the row shows what was just changed.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ClientList } from "@/lib/admin/clients";
import { eur } from "../../copy";
import { NextIcon, PlusIcon, PrevIcon } from "../../icons";
import { useA } from "../../lang";
import { Sheet } from "../sheet";
import { Titled } from "../star";
import { listClientsAction, saveClientAction, type ClientQuery } from "./actions";

/** After the last keystroke, before the list is asked for. */
const DELAY = 300;
const ALL: ClientQuery = { q: "", label: "", page: 1 };
const isAll = (f: ClientQuery) => !f.q && !f.label && f.page === 1;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function ClientsView({ initial, tz }: { initial: ClientList; tz: string }) {
  const A = useA();
  const C = A.clients;
  // what is in the field, and what the list was last asked for (a moment behind the typing)
  const [text, setText] = useState("");
  const [f, setF] = useState<ClientQuery>(ALL);
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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

  const ask = (next: (cur: ClientQuery) => ClientQuery) => {
    window.clearTimeout(r.current.timer);
    setF(next);
  };
  const type = (v: string) => {
    setText(v);
    window.clearTimeout(r.current.timer);
    const q = v.trim();
    r.current.timer = window.setTimeout(() => setF((cur) => (cur.q === q ? cur : { ...cur, q, page: 1 })), DELAY);
  };
  const turn = (page: number) => {
    ask((cur) => ({ ...cur, page }));
    window.scrollTo({ top: 0 });
  };
  const reset = () => {
    setText("");
    ask(() => ALL);
  };

  const day = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
  const date = (at: number | null) => (at == null ? "—" : day.format(at));
  const filtered = !!(f.q || f.label);
  const K = C.cols;
  // a category that is picked but no client carries any more still shows as picked
  const labels = f.label && !data.labels.includes(f.label) ? [...data.labels, f.label] : data.labels;

  return (
    <>
      <div className="adm-page-head cl-top">
        <Titled page="clients">
          <h1 className="adm-h1">{C.title}</h1>
        </Titled>
        <AddClient />
      </div>
      {data.total === 0 && !filtered && !busy ? (
        <p className="adm-note">{failed ? A.error : C.none}</p>
      ) : (
        <>
          <form
            className="cl-filters"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              ask((cur) => (cur.q === text.trim() ? cur : { ...cur, q: text.trim(), page: 1 }));
            }}
          >
            <label className="cl-search">
              <SearchIcon />
              <input type="search" enterKeyHint="search" autoComplete="off" maxLength={60} placeholder={C.search} aria-label={C.search} value={text} onChange={(e) => type(e.target.value)} />
            </label>
            {labels.length > 0 && (
              <select aria-label={C.label} value={f.label} onChange={(e) => ask((cur) => ({ ...cur, label: e.target.value, page: 1 }))}>
                <option value="">{C.allLabels}</option>
                {labels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </form>
          <p className={failed ? "adm-err" : "adm-meta"} role="status">
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
              <div className="cl-card only-wide">
                <table className="cl-table">
                  <thead>
                    <tr>
                      <th>{K.name}</th>
                      <th>{K.phone}</th>
                      <th className="c-mail">{K.email}</th>
                      <th className="n">{K.visits}</th>
                      <th className="n">{K.last}</th>
                      <th className="n c-first">{K.first}</th>
                      <th className="n">{K.sold}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((c) => (
                      <tr key={c.id}>
                        <td className="c-name">
                          <Link href={`/admin/clients/${c.id}`} prefetch={false}>
                            {c.name}
                          </Link>
                          {c.labels.length > 0 && (
                            <span className="cl-tags">
                              {c.labels.map((l) => (
                                <span key={l} className="adm-tag">
                                  {l}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td>{c.phone ?? "—"}</td>
                        <td className="c-mail">{c.email ?? "—"}</td>
                        <td className="n">{c.visits}</td>
                        <td className="n">{date(c.lastVisit)}</td>
                        <td className="n c-first">{date(c.firstVisit)}</td>
                        <td className="n">{eur(c.soldCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            <nav className="cl-pages" aria-label={C.pages}>
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
        </>
      )}
    </>
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
