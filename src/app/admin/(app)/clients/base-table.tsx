"use client";

/**
 * The client base's table, from 900px (the design board «Клиенты, список»;
 * docs/reference-looks.md, «Клиенты»): a tick per row and one for the whole
 * page, the name as the way into the card, then the columns the login keeps
 * (Телефон, Email, Продано, Визиты, Скидка, Последний визит, Первый визит),
 * and a round cog at the head's right end that picks them. A click on the
 * head of the name, the visits, the sum or a visit's date sorts by it;
 * again, the other way round. Rows are 50px.
 *
 * On a screen too narrow for the chosen columns the table scrolls sideways
 * inside its sheet, never the page; the cog keeps its place at the sheet's
 * right end.
 */
import Link from "next/link";
import type { ClientColumn } from "@/lib/admin/client-columns";
import type { ClientSort, SortDir } from "@/lib/admin/client-filter";
import type { ClientRow } from "@/lib/admin/clients";
import { eur } from "../../copy";
import { CaretIcon } from "../../icons";
import { useA } from "../../lang";
import { ColumnsMenu } from "./base-actions";

/** The columns a click on the head sorts by («name» is always there). */
const SORT_OF: Partial<Record<"name" | ClientColumn, ClientSort>> = { name: "name", sold: "sold", visits: "visits", last: "last", first: "first" };

export function BaseTable({
  rows,
  open,
  tz,
  columns,
  onColumns,
  sort,
  dir,
  onSort,
  ticks,
  onTicks,
}: {
  rows: ClientRow[];
  /** the client whose card is open over the list, if any */
  open: string | undefined;
  tz: string;
  columns: readonly ClientColumn[];
  onColumns: (next: ClientColumn[]) => void;
  sort: string;
  dir: string;
  onSort: (sort: ClientSort) => void;
  ticks: ReadonlySet<string>;
  onTicks: (next: ReadonlySet<string>) => void;
}) {
  const A = useA();
  const B = A.clients.base;
  const long = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "numeric", month: "long", year: "numeric" });
  const clock = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  /** «31 октября 2026 г. в 12:30» */
  const moment = (at: number | null) => (at == null ? "" : B.at(long.format(at), clock.format(at)));
  const cell = (c: ClientRow, col: ClientColumn) =>
    col === "phone" ? (c.phone ?? "") : col === "email" ? (c.email ?? "") : col === "sold" ? eur(c.soldCents) : col === "visits" ? c.visits : col === "discount" ? `${c.discountPct} %` : moment(col === "last" ? c.lastVisit : c.firstVisit);
  const shown: ("name" | ClientColumn)[] = ["name", ...columns];
  const all = rows.length > 0 && rows.every((c) => ticks.has(c.id));
  const tick = (id: string, on: boolean) => {
    const next = new Set(ticks);
    if (on) next.add(id);
    else next.delete(id);
    onTicks(next);
  };

  return (
    <div className="cb-sheetwrap only-wide">
      <div className="cl-card cb-sheet">
        <table className="cl-table cb-table">
          <thead>
            <tr>
              <th className="cb-tick">
                <input
                  type="checkbox"
                  aria-label={B.tickAll}
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = !all && rows.some((c) => ticks.has(c.id));
                  }}
                  onChange={(e) => onTicks(e.target.checked ? new Set(rows.map((c) => c.id)) : new Set())}
                />
              </th>
              {shown.map((col) => {
                const by = SORT_OF[col];
                const on = !!by && sort === by;
                return (
                  <th key={col} scope="col" data-col={col} aria-sort={on ? (dir === "desc" ? "descending" : "ascending") : undefined}>
                    {by ? (
                      <button type="button" className={`cb-sort${on ? ` is-${dir === "desc" ? "desc" : "asc"}` : ""}`} onClick={() => onSort(by)}>
                        <span>{B.cols[col]}</span>
                        <CaretIcon size={10} />
                      </button>
                    ) : (
                      B.cols[col]
                    )}
                  </th>
                );
              })}
              {/* the cog's own place: it lies over this cell (below), outside the sheet, which may scroll */}
              <th className="cb-cogcell" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={[c.id === open ? "is-open" : "", ticks.has(c.id) ? "is-ticked" : ""].filter(Boolean).join(" ") || undefined}>
                <td className="cb-tick">
                  <input type="checkbox" aria-label={B.tick(c.name)} checked={ticks.has(c.id)} onChange={(e) => tick(c.id, e.target.checked)} />
                </td>
                <td className="c-name" data-col="name">
                  <Link href={`/admin/clients/${c.id}`} prefetch={false} aria-current={c.id === open ? "true" : undefined}>
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
                {columns.map((col) => (
                  <td key={col} data-col={col}>
                    {cell(c, col)}
                  </td>
                ))}
                <td className="cb-cogcell" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cb-cogpos">
        <ColumnsMenu columns={columns} onChange={onColumns} />
      </div>
    </div>
  );
}
