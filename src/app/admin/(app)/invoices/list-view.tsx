"use client";

/**
 * «Счета»: the table of every invoice with a search and a status filter,
 * and «Новый счёт», which asks for the receiver and nothing else. Both as
 * in Isolta, which Renat used until now (docs/reference-looks.md).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { euroText } from "@/lib/money";
import { PlusIcon } from "../../icons";
import { useA } from "../../lang";
import { Sheet } from "../sheet";
import { newInvoiceAction } from "./actions";
import { StatusTag } from "./common";

export type ListRow = {
  id: string;
  /** draft, issued, overdue, paid, credited */
  status: string;
  credit: boolean;
  receiver: string;
  sub: string;
  number: string;
  date: string;
  due: string;
  netCents: number;
  grossCents: number;
};

const STATUSES = ["draft", "issued", "overdue", "paid", "credited"] as const;
const has = (text: string, q: string) => text.toLocaleLowerCase().includes(q);

export function InvoiceList({ rows }: { rows: ListRow[] }) {
  const A = useA();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return rows.filter((r) => (!status || r.status === status) && (!needle || has(r.receiver, needle) || has(r.number, needle) || has(r.sub, needle)));
  }, [rows, q, status]);
  const C = A.inv.lcols;
  const statusName = (s: string) => (s === "overdue" ? A.inv.overdue : (A.inv.status[s] ?? s));

  if (!rows.length) return <p className="adm-meta">{A.inv.none}</p>;
  return (
    <>
      <div className="inv-filters">
        <label className="inv-search">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input type="search" placeholder={A.inv.search} aria-label={A.inv.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label={C.status} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{A.inv.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusName(s)}
            </option>
          ))}
        </select>
      </div>
      <p className="adm-meta" role="status">
        {A.inv.count(shown.length, rows.length)}
      </p>
      {shown.length === 0 ? (
        <p className="adm-meta">{A.inv.nothingFound}</p>
      ) : (
        <>
          {/* a table on a wide screen, as Isolta's; a list on a phone */}
          <div className="inv-card only-wide">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>{C.status}</th>
                  <th>{C.receiver}</th>
                  <th className="n">{C.number}</th>
                  <th className="n">{C.date}</th>
                  <th className="n">{C.due}</th>
                  <th className="n">{C.net}</th>
                  <th className="n">{C.gross}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <StatusTag A={A} status={r.status} />
                    </td>
                    <td>
                      <Link href={`/admin/invoices/${r.id}`} prefetch={false}>
                        {r.receiver}
                      </Link>
                      {(r.sub || r.credit) && <small>{[r.credit ? A.inv.credit : "", r.sub].filter(Boolean).join(", ")}</small>}
                    </td>
                    <td className="n">{r.number}</td>
                    <td className="n">{r.date}</td>
                    <td className="n">{r.due}</td>
                    <td className="n">{euroText(r.netCents)}</td>
                    <td className="n">{euroText(r.grossCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="adm-list only-narrow">
            {shown.map((r) => (
              <li key={r.id}>
                <Link className="adm-item" href={`/admin/invoices/${r.id}`} prefetch={false}>
                  <span className="txt">
                    <b>{r.receiver}</b>
                    <small>{[r.number, r.date, r.sub].filter(Boolean).join(", ")}</small>
                    <span className="tags">
                      <StatusTag A={A} status={r.status} />
                      {r.credit && <span className="adm-tag">{A.inv.credit}</span>}
                    </span>
                  </span>
                  <span className="end price">{euroText(r.grossCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export type PickReceiver = { id: string; name: string; sub: string; person: boolean };

/** «Новый счёт»: one field to find the receiver, his name opens the draft. */
export function NewInvoice({ receivers }: { receivers: PickReceiver[] }) {
  const A = useA();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const needle = q.trim().toLocaleLowerCase();
  const shown = needle ? receivers.filter((r) => has(r.name, needle) || has(r.sub, needle)) : receivers;

  const pick = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      const r = await newInvoiceAction(id);
      if (r.ok) return router.push(`/admin/invoices/${r.id}`);
      setErr(A.inv.fail[r.code] ?? A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(null);
  };

  return (
    <>
      <button
        type="button"
        className="adm-btn adm-btn-lime adm-btn-sm"
        onClick={() => {
          setQ("");
          setErr(null);
          setOpen(true);
        }}
      >
        <PlusIcon />
        {A.inv.newInvoice}
      </button>
      {open && (
        <Sheet title={A.inv.pickReceiver} onClose={() => !busy && setOpen(false)}>
          {receivers.length === 0 ? (
            <p className="adm-meta">{A.inv.noReceivers}</p>
          ) : (
            <>
              <label className="inv-search">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16l4.5 4.5" />
                </svg>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input type="search" autoFocus placeholder={A.inv.searchReceiver} aria-label={A.inv.searchReceiver} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              {err && (
                <p className="adm-err" role="alert">
                  {err}
                </p>
              )}
              {shown.length === 0 ? (
                <p className="adm-meta">{A.inv.nothingFound}</p>
              ) : (
                <ul className="inv-pick">
                  {shown.map((r) => (
                    <li key={r.id}>
                      <button type="button" disabled={busy !== null} onClick={() => void pick(r.id)}>
                        <span className="inv-pick-ico" aria-hidden="true">
                          {r.person ? (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <circle cx="12" cy="8" r="4" />
                              <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 21V8l7-4v17M11 21h9V11l-9-3M7 10v.5M7 14v.5M7 18v.5M15 14v.5M15 18v.5" />
                            </svg>
                          )}
                        </span>
                        <span className="n">
                          <b>{r.name}</b>
                          {r.sub && <small>{r.sub}</small>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
