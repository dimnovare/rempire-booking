"use client";

/** «Продажа товара» on a phone's «Ещё»: the row opens the same form the sidebar's tile opens on a wide screen. */
import { useA } from "../../lang";
import { useFrame } from "../frame";

export function SaleRow() {
  const A = useA();
  const frame = useFrame();
  return (
    <button type="button" className="adm-item mo-row" aria-haspopup="dialog" onClick={() => frame.open("sale")}>
      <span className="tx">
        <b>{A.sale.title}</b>
      </span>
    </button>
  );
}
