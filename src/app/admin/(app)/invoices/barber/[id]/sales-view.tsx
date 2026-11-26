"use client";

/**
 * A barber's sales in the month, by day (page.tsx). A wrong one is taken
 * back by a minus row («Сторно»), never deleted. Dim, 26.11.2026: as
 * «Удалить вход» in «Доступ» (account/access.tsx, delete-login.tsx), it is
 * in the row's «⋯», last and in red, and it asks first. From 900px the «⋯»
 * opens a menu under itself; on a phone a sheet from the bottom. A minus
 * row, a sale already taken back and an undone one have no «⋯».
 *
 * No «Открыть заказ в магазине»: the shop has no address for one order
 * that booking knows (product_sales.shop_order_ref is the order's number).
 */
import { Fragment, useState } from "react";
import { DotsIcon } from "../../../../icons";
import { useA } from "../../../../lang";
import { Pop } from "../../../pop";
import { Sheet } from "../../../sheet";
import { reverseSaleAction } from "../../actions";
import { Confirm, Field } from "../../ui";

export type SaleRow = {
  id: string;
  /** «Grooming Co Matte Paste 100 мл × 1» */
  what: string;
  /** «клиенту · барберу 3,41 €», the client and the note when there are */
  sub: string;
  total: string;
  /** undone in its window: crossed out */
  off: boolean;
  /** only what is not the usual: waiting for the shop, failed, a test, «сторно», «отменена» */
  tags: { text: string; warn?: boolean }[];
  /** «Сторно» may be asked for: a sale that stands, not a minus row, not taken back yet */
  reversible: boolean;
};

export type SaleDayRows = { date: string; head: string; sum: string; rows: SaleRow[] };

export function SalesList({ days }: { days: SaleDayRows[] }) {
  const A = useA();
  const M = A.inv.bm;
  const [acts, setActs] = useState<SaleRow | null>(null);
  const [asking, setAsking] = useState<SaleRow | null>(null);
  const [note, setNote] = useState("");
  const ask = (r: SaleRow) => {
    setNote("");
    setAsking(r);
  };
  return (
    <>
      <ul className="iv-bm-list">
        {days.map((d) => (
          <Fragment key={d.date}>
            <li className="iv-bm-dayh">
              <b>{d.head}</b>
              <span>{d.sum}</span>
            </li>
            {d.rows.map((r) => (
              <li key={r.id} className={`iv-bm-sale${r.off ? " is-off" : ""}`}>
                <span className="txt">
                  <span className="what">{r.what}</span>
                  {r.sub && <small>{r.sub}</small>}
                  {r.tags.length > 0 && (
                    <span className="tags">
                      {r.tags.map((t) => (
                        <span key={t.text} className={`adm-tag${t.warn ? " warn" : ""}`}>
                          {t.text}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="end">{r.total}</span>
                <span className="iv-bm-acts">
                  {r.reversible && (
                    <>
                      {/* from 900px: a menu under «⋯» */}
                      <Pop kind="menu" name={M.acts(r.what)} label={M.acts(r.what)} icon button={<DotsIcon size={18} />}>
                        {(close) => (
                          <button
                            type="button"
                            role="menuitem"
                            className="jr-item is-red"
                            onClick={() => {
                              close();
                              ask(r);
                            }}
                          >
                            <span>{M.reverseItem}</span>
                          </button>
                        )}
                      </Pop>
                      {/* on a phone: a sheet from the bottom with the same */}
                      <button type="button" className="adm-ibtn iv-bm-more" aria-label={M.acts(r.what)} aria-haspopup="dialog" onClick={() => setActs(r)}>
                        <DotsIcon size={20} />
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
      {acts && (
        <Sheet title={acts.what} onClose={() => setActs(null)}>
          <div role="menu" aria-label={M.acts(acts.what)} className="ac-sheet-menu">
            <button
              type="button"
              role="menuitem"
              className="ac-sheet-item is-red"
              onClick={() => {
                setActs(null);
                ask(acts);
              }}
            >
              <span>{M.reverseItem}</span>
            </button>
          </div>
          <button type="button" className="adm-btn adm-btn-line ac-sheet-cancel" onClick={() => setActs(null)}>
            {A.cancel}
          </button>
        </Sheet>
      )}
      {asking && (
        <Confirm
          title={A.inv.reverse}
          ask={A.inv.reverseAsk}
          yes={A.inv.reverse}
          danger
          onClose={() => setAsking(null)}
          onYes={async () => {
            const x = await reverseSaleAction(asking.id, note);
            if (!x.ok) return x.code === "already" ? A.inv.alreadyReversed : A.error;
          }}
        >
          <p className="iv-bm-ask">
            {asking.what} · {asking.total}
          </p>
          <Field label={A.inv.reverseNote}>
            <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Confirm>
      )}
    </>
  );
}
