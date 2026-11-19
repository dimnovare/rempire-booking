"use client";

/** «Продажа товара» on a phone's «Ещё»: the row opens the same form the sidebar's tile opens on a wide screen. */
import { NextIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { SectionIcon } from "../sections";

export function SaleRow() {
  const A = useA();
  const frame = useFrame();
  return (
    <button type="button" className="adm-item" onClick={() => frame.open("sale")}>
      <span className="adm-more-ico">
        <SectionIcon name="bag" />
      </span>
      <span className="txt">
        <b>{A.sale.title}</b>
      </span>
      <span className="adm-chev">
        <NextIcon />
      </span>
    </button>
  );
}
