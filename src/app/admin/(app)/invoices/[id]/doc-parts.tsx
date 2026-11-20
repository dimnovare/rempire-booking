"use client";

/** What a draft's editor and an issued invoice's sheet share: the second bar and the head of the lines. */
import Link from "next/link";
import { NextIcon, PrevIcon } from "../../../icons";
import { useA } from "../../../lang";
import { INV_ROOT } from "../common";

/** «‹ Список счетов» at the left; the neighbours in the list at the right. */
export function DocBar({ prev, next }: { prev: string | null; next: string | null }) {
  const A = useA();
  const step = (id: string | null, label: string, icon: React.ReactNode, after = false) =>
    id ? (
      <Link className="iv-btn is-sm" href={`${INV_ROOT}/${id}`} prefetch={false}>
        {!after && icon}
        {label}
        {after && icon}
      </Link>
    ) : (
      <button type="button" className="iv-btn is-sm" disabled>
        {!after && icon}
        {label}
        {after && icon}
      </button>
    );
  return (
    <div className="iv-bar2">
      <Link className="iv-btn is-sm" href={INV_ROOT} prefetch={false}>
        <PrevIcon size={14} />
        {A.inv.toList}
      </Link>
      <span>
        {step(prev, A.inv.prevInvoice, <PrevIcon size={14} />)}
        {step(next, A.inv.nextInvoice, <NextIcon size={14} />, true)}
      </span>
    </div>
  );
}

/** «Строки счёта (2)» and the currency: every invoice is in euros. */
export function LinesHead({ count }: { count: number }) {
  const A = useA();
  return (
    <div className="inv-lines-head">
      <h2>
        {A.inv.linesTitle} <span>({count})</span>
      </h2>
      <span>
        {A.inv.currency} <b>EUR</b>
      </span>
    </div>
  );
}

/** The head row of the lines: the board's columns that we have something for. */
export function LinesHeadRow() {
  const A = useA();
  return (
    <div className="inv-row inv-row-head" aria-hidden="true">
      <span>{A.inv.itemNo}</span>
      <span>{A.inv.lineName}</span>
      <span className="n">{A.inv.unitLong}</span>
      <span className="n">{A.inv.qty}</span>
      <span>{A.inv.unitCol}</span>
      <span className="n">{A.inv.discount}</span>
      <span className="n">{A.inv.gross}</span>
      <span />
    </div>
  );
}
