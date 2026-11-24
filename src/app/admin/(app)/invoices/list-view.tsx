"use client";

/**
 * «Счета», the list, to its design board: the bar with «+ Новый счёт»,
 * «Сводка по выбранным счетам» and «Инструменты»; the toolbar (search,
 * status, period and dates); the count; one table whose every column sorts
 * and whose rows open the invoice; the foot with the rows a page.
 *
 * The rows come whole with the page; filtering, sorting and paging are
 * src/lib/billing/list.ts, here in the browser. «Сводка» sums the rows that
 * the filters leave, and the export asks the server for the same question.
 * A receiver's own page shows the same list of his invoices (`embedded`).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { filterRows, nextSort, pageOf, PAGE_SIZES, sortRows, STATUS_FILTERS, summaryOf, type ListQuery, type ListRow, type SortKey, type StatusFilter, type Sum } from "@/lib/billing/list";
import { euroText } from "@/lib/money";
import { NextIcon, PlusIcon, PrevIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { dmy, INV_ROOT, SortArrow, StatusTag, ToolIcon } from "./common";
import { Dialog, downloadPost, Field, IvTop, MenuButton, Period, type PeriodValue } from "./ui";

// «Референц-номер» after the number, as Isolta's list has «Референц-номер для оплаты»
const COLS: { key: SortKey; num?: boolean }[] = [{ key: "status" }, { key: "receiver" }, { key: "number", num: true }, { key: "reference", num: true }, { key: "date" }, { key: "due" }, { key: "net", num: true }, { key: "gross", num: true }];

export function InvoiceList({ rows, today, initial, canNew = true, embedded = false }: { rows: ListRow[]; today: string; initial: ListQuery; canNew?: boolean; embedded?: boolean }) {
  const A = useA();
  const router = useRouter();
  const frame = useFrame();
  const [q, setQ] = useState(initial.q);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [period, setPeriod] = useState<PeriodValue>({ gran: "month", from: initial.from, to: initial.to });
  const [sort, setSort] = useState(initial.sort);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [summing, setSumming] = useState(false);
  const [busy, setBusy] = useState(false);

  const asked = useMemo(() => ({ q, status, from: period.from, to: period.to, sort }), [q, status, period.from, period.to, sort]);
  const found = useMemo(() => sortRows(filterRows(rows, asked, today), asked.sort, today), [rows, asked, today]);
  const pg = pageOf(found, page, size);
  const C = A.inv.lcols;
  const first = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const save = async () => {
    setBusy(true);
    try {
      frame.say(A.inv.exported(await downloadPost(`${INV_ROOT}/export`, asked, "rempire-invoices.xlsx")));
    } catch {
      frame.say(A.error, true);
    }
    setBusy(false);
  };

  const body = (
    <>
      <div className="iv-tools">
        <Field label={A.inv.search} className="f-search">
          <input type="search" autoComplete="off" maxLength={120} aria-label={A.inv.search} value={q} onChange={(e) => first(setQ)(e.target.value)} />
        </Field>
        <Field label={A.inv.statusLabel} className="f-sel">
          <select value={status} onChange={(e) => first(setStatus)(e.target.value as StatusFilter)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {A.inv.filters[s]}
              </option>
            ))}
          </select>
        </Field>
        <Period value={period} today={today} onChange={first(setPeriod)} />
      </div>

      <p className="iv-count" role="status">
        {A.inv.countLine(pg.from, pg.to, found.length)}
      </p>

      {rows.length === 0 ? (
        <p className="iv-empty">{A.inv.none}</p>
      ) : found.length === 0 ? (
        <p className="iv-empty">{A.inv.nothingFound}</p>
      ) : (
        <>
          <div className="iv-tablewrap only-wide">
            <table className="iv-table inv-table">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} scope="col" className={c.num ? "n" : undefined} style={c.key === "status" ? { width: 120 } : undefined} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                      <button type="button" className="iv-sort" onClick={() => first(setSort)(nextSort(sort, c.key))}>
                        {C[c.key]}
                        <SortArrow />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((r) => (
                  <tr key={r.id} className="is-link" onClick={() => router.push(`${INV_ROOT}/${r.id}`)}>
                    <td>
                      <StatusTag A={A} status={r.status} />
                    </td>
                    <td className="b">
                      <Link href={`${INV_ROOT}/${r.id}`} prefetch={false} onClick={(e) => e.stopPropagation()}>
                        {r.receiver}
                      </Link>
                    </td>
                    <td className="n">{r.number}</td>
                    <td className="n">{r.reference}</td>
                    <td>{dmy(r.date)}</td>
                    <td>{dmy(r.due)}</td>
                    <td className="n">{euroText(r.netCents)}</td>
                    <td className="n">{euroText(r.grossCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager pg={pg} total={found.length} size={size} setSize={first(setSize)} setPage={setPage} />
          </div>
          <div className="only-narrow">
            <ul className="iv-list">
              {pg.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`${INV_ROOT}/${r.id}`} prefetch={false}>
                    <span className="txt">
                      <b>{r.receiver}</b>
                      <small>{[r.number, dmy(r.date), r.sub].filter(Boolean).join(", ")}</small>
                      <span className="tags">
                        <StatusTag A={A} status={r.status} />
                      </span>
                    </span>
                    <span className="end">{euroText(r.grossCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager pg={pg} total={found.length} size={size} setSize={first(setSize)} setPage={setPage} />
          </div>
        </>
      )}
      {summing && <Summary rows={found} onClose={() => setSumming(false)} />}
    </>
  );

  if (embedded) return body;
  return (
    <>
      <IvTop title={A.inv.title} star>
        <button type="button" className="iv-btn is-main" disabled={!canNew} onClick={() => router.push(`${INV_ROOT}/new`)}>
          <PlusIcon />
          {A.inv.newInvoice}
        </button>
        <button type="button" className="iv-btn is-long" onClick={() => setSumming(true)}>
          {A.inv.summary}
        </button>
        <MenuButton label={A.inv.tools}>
          {(close) => (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                close();
                void save();
              }}
            >
              <ToolIcon name="sheet" />
              <span>
                {A.inv.exportXlsx}
                <small>{A.inv.exportHint}</small>
              </span>
            </button>
          )}
        </MenuButton>
      </IvTop>
      <div className="iv-body">
        {!canNew && (
          <p className="iv-warn">
            <Link className="iv-link" href={`${INV_ROOT}/settings`}>
              {A.inv.noIssuer}
            </Link>
          </p>
        )}
        {body}
      </div>
    </>
  );
}

export function Pager({ pg, total, size, setSize, setPage }: { pg: { page: number; pages: number; from: number; to: number }; total: number; size: number; setSize: (n: number) => void; setPage: (n: number) => void }) {
  const A = useA();
  return (
    <div className="iv-tfoot">
      <label>
        {A.inv.perPage}
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <span>{A.inv.pageOf(pg.from, pg.to, total)}</span>
      <span>
        <button type="button" className="iv-ibtn" aria-label={A.inv.pagePrev} disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)}>
          <PrevIcon />
        </button>
        <button type="button" className="iv-ibtn" aria-label={A.inv.pageNext} disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)}>
          <NextIcon />
        </button>
      </span>
    </div>
  );
}

/** «Сводка по выбранным счетам»: counts and sums of the rows the filters leave. */
function Summary({ rows, onClose }: { rows: ListRow[]; onClose: () => void }) {
  const A = useA();
  const S = A.inv.sum;
  const s = summaryOf(rows);
  const line = (key: string, label: string, v: Sum, strong = false, count = true) => (
    <tr key={key} data-row={key} className={strong ? "is-total" : undefined}>
      <td>{label}</td>
      <td>{count ? v.count : ""}</td>
      <td>{euroText(v.netCents)}</td>
      <td>{euroText(v.grossCents)}</td>
    </tr>
  );
  return (
    <Dialog
      title={A.inv.summary}
      onClose={onClose}
      foot={
        <button type="button" className="iv-btn" onClick={onClose}>
          {A.close}
        </button>
      }
    >
      <p className="iv-mute">{S.hint}</p>
      <table className="iv-sum">
        <thead>
          <tr>
            <th />
            <th scope="col">{S.count}</th>
            <th scope="col">{A.inv.lcols.net}</th>
            <th scope="col">{A.inv.lcols.gross}</th>
          </tr>
        </thead>
        <tbody>
          {line("issued", S.issued, s.issued)}
          {line("credits", S.credits, s.credits)}
          {line("turnover", S.turnover, s.turnover, true, false)}
          {line("unpaid", S.unpaid, s.unpaid)}
          {line("overdue", S.overdue, s.overdue)}
          {line("drafts", S.drafts, s.drafts)}
        </tbody>
      </table>
    </Dialog>
  );
}
