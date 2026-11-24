"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { pageOf, PAGE_SIZES } from "@/lib/billing/list";
import { PlusIcon } from "../../../icons";
import { useA } from "../../../lang";
import { INV_ROOT, PartyIcon } from "../common";
import { Pager } from "../list-view";
import { Field, IvTop } from "../ui";
import { ReceiverDialog, type Opt } from "./receiver-dialog";

export type ReceiverRow = { id: string; name: string; contact: string; phone: string; person: boolean; active: boolean; street: string; postcode: string; town: string; invoices: number };

const has = (text: string, q: string) => text.toLocaleLowerCase().includes(q);
/** «5123 4567» finds «+372 5123 4567»: the digits only, from three on. */
const digits = (s: string) => s.replace(/\D/g, "");
const hasPhone = (phone: string, q: string) => digits(q).length >= 3 && digits(phone).includes(digits(q));

/** «Получатели»: a search, the count, one table sorted by name; a row opens the receiver. */
export function ReceiversList({ rows, staff, issuers, defaultStaff, without, startNew }: { rows: ReceiverRow[]; staff: (Opt & { active: boolean })[]; issuers: Opt[]; defaultStaff: string; without: string[]; startNew: boolean }) {
  const A = useA();
  const R = A.inv.rcv;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [adding, setAdding] = useState(startNew);
  const found = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    const by = new Intl.Collator(["ru", "et", "en"], { sensitivity: "base", numeric: true });
    return rows.filter((r) => !needle || has(r.name, needle) || has(r.contact, needle) || has(`${r.street} ${r.postcode} ${r.town}`, needle) || hasPhone(r.phone, needle)).sort((a, b) => Number(b.active) - Number(a.active) || by.compare(a.name, b.name));
  }, [rows, q]);
  const pg = pageOf(found, page, size);
  const open = (id: string) => router.push(`${INV_ROOT}/receivers/${id}`);
  const first = (n: number) => {
    setSize(n);
    setPage(1);
  };

  return (
    <>
      <IvTop title={A.inv.receivers}>
        <button type="button" className="iv-btn is-main" onClick={() => setAdding(true)}>
          <PlusIcon />
          {A.inv.newReceiver}
        </button>
      </IvTop>
      <div className="iv-body">
        <p className="iv-mute">{A.inv.receiversHint}</p>
        <div className="iv-tools">
          <Field label={R.search} className="f-search">
            <input
              type="search"
              autoComplete="off"
              maxLength={120}
              aria-label={R.search}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>
        <p className="iv-count" role="status">
          {R.countLine(pg.from, pg.to, found.length)}
        </p>
        {rows.length === 0 ? (
          <p className="iv-empty">{R.none}</p>
        ) : found.length === 0 ? (
          <p className="iv-empty">{A.inv.nothingFound}</p>
        ) : (
          <>
            <div className="iv-tablewrap only-wide">
              <table className="iv-table">
                <thead>
                  <tr>
                    <th scope="col" aria-label={R.kind} />
                    <th scope="col">{R.cols.name}</th>
                    <th scope="col">{R.cols.address}</th>
                    <th scope="col">{R.cols.postcode}</th>
                    <th scope="col">{R.cols.town}</th>
                    <th scope="col" className="n">
                      {R.cols.invoices}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pg.rows.map((r) => (
                    <tr key={r.id} className={`is-link${r.active ? "" : " is-off"}`} onClick={() => open(r.id)}>
                      <td className="ico">
                        <span className="iv-tile-ico is-round" aria-hidden="true">
                          <PartyIcon person={r.person} size={20} />
                        </span>
                      </td>
                      <td className="b">
                        <Link href={`${INV_ROOT}/receivers/${r.id}`} prefetch={false} onClick={(e) => e.stopPropagation()}>
                          {r.name}
                        </Link>
                        {(r.contact || r.phone || !r.active) && <small>{[r.contact, r.phone, r.active ? "" : A.inv.off].filter(Boolean).join(", ")}</small>}
                      </td>
                      <td>{r.street}</td>
                      <td>{r.postcode}</td>
                      <td>{r.town}</td>
                      <td className="n">{r.invoices}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager pg={pg} total={found.length} size={size} setSize={first} setPage={setPage} />
            </div>
            <div className="only-narrow">
              <ul className="iv-list">
                {pg.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`${INV_ROOT}/receivers/${r.id}`} prefetch={false}>
                      <span className="iv-tile-ico is-round" aria-hidden="true">
                        <PartyIcon person={r.person} size={20} />
                      </span>
                      <span className="txt">
                        <b>{r.name}</b>
                        <small>{[r.contact, r.phone, r.street, r.postcode, r.town, r.active ? "" : A.inv.off].filter(Boolean).join(", ")}</small>
                      </span>
                      <span className="end">{r.invoices}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pager pg={pg} total={found.length} size={size} setSize={first} setPage={setPage} />
            </div>
          </>
        )}
        {without.length > 0 && (
          <p className="iv-mute">
            {A.inv.noReceiver}: {without.join(", ")}
          </p>
        )}
      </div>
      {adding && (
        <ReceiverDialog
          defaultStaff={defaultStaff}
          staff={staff}
          issuers={issuers}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            open(id);
          }}
        />
      )}
    </>
  );
}
