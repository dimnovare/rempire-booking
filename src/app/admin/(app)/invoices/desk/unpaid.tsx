"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useA } from "../../../lang";
import { INV_ROOT } from "../common";

export type UnpaidLine = { id: string; receiver: string; due: string; total: string };

/**
 * «Неоплаченные счета» on the desk: the grid of the invoicing tool's own
 * dashboard card (Получатель, Срок оплаты, Итого; the footer with the sum and
 * the way to the list). A row opens its invoice, as a row of the list does.
 */
export function UnpaidTable({ rows, sum, allHref }: { rows: UnpaidLine[]; sum: string; allHref: string }) {
  const A = useA();
  const D = A.inv.desk;
  const router = useRouter();
  return (
    <div className="iv-due">
      <table>
        <thead>
          <tr>
            <th scope="col">{A.inv.lcols.receiver}</th>
            <th scope="col" className="c-due" title={A.inv.lcols.due}>
              {A.inv.lcols.due}
            </th>
            <th scope="col" className="c-sum n">
              {D.total}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="is-empty" colSpan={3}>
                {D.noLines}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="is-link" onClick={() => router.push(`${INV_ROOT}/${r.id}`)}>
                <td>
                  <Link href={`${INV_ROOT}/${r.id}`} prefetch={false} onClick={(e) => e.stopPropagation()}>
                    {r.receiver}
                  </Link>
                </td>
                <td>{r.due}</td>
                <td className="n">{r.total}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="iv-due-foot">
        <span>{D.sumLine(sum)}</span>
        <Link className="iv-txt" href={allHref} prefetch={false}>
          {D.all}
        </Link>
      </div>
    </div>
  );
}
