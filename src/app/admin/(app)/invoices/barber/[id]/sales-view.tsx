"use client";

import { useState } from "react";
import { useA } from "../../../../lang";
import { reverseSaleAction } from "../../actions";
import { AskButton } from "../../ask";

type Row = { id: string; name: string; qty: number; mode: string; total: string; commission: string; at: string; status: string; sync: string; reversal: boolean; reversed: boolean; note: string };

/** A barber's sales in the month; a wrong one gets a minus row («Сторно»), never a delete. */
export function SalesList({ rows }: { rows: Row[] }) {
  const A = useA();
  const [note, setNote] = useState("");
  return (
    <ul className="adm-list adm-inv-sales">
      {rows.map((r) => (
        <li key={r.id} className={r.status === "undone" ? "is-off" : undefined}>
          <span className="txt">
            <span className="plain">
              {r.name} × {r.qty}
            </span>
            <small>
              {r.at} · {A.inv.mode[r.mode] ?? r.mode}
              {r.commission ? ` · ${A.inv.cols.commission} ${r.commission}` : ""}
              {r.note ? ` · ${r.note}` : ""}
            </small>
            <span className="tags">
              {r.status === "undone" && <span className="adm-tag">{A.inv.undone}</span>}
              {(r.reversal || r.reversed) && <span className="adm-tag warn">{A.inv.reversal}</span>}
              {A.inv.sync[r.sync] && <span className={`adm-tag${r.sync === "failed" ? " warn" : r.sync === "synced" ? " lime" : ""}`}>{A.inv.sync[r.sync]}</span>}
            </span>
          </span>
          <span className="end">{r.total}</span>
          {r.status === "done" && !r.reversal && !r.reversed && (
            <AskButton
              label={A.inv.reverse}
              ask={A.inv.reverseAsk}
              className="adm-btn adm-btn-ghost adm-btn-sm"
              onYes={async () => {
                const x = await reverseSaleAction(r.id, note);
                setNote("");
                if (!x.ok) return x.code === "already" ? A.inv.alreadyReversed : A.error;
              }}
            >
              <label className="adm-field">
                <span>{A.inv.reverseNote}</span>
                <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </AskButton>
          )}
        </li>
      ))}
    </ul>
  );
}
