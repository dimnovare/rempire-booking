"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrevIcon } from "../../../icons";
import { useA } from "../../../lang";
import { newInvoiceAction } from "../actions";
import { INV_ROOT } from "../common";
import { MetaTable, ReceiverPicker, SenderBlock, type PickReceiver } from "../sheet-parts";
import { IvTop } from "../ui";

/** The sheet before it is anybody's: the sender, the field that finds the receiver, an empty table on the right. */
export function NewInvoiceView({ issuer, receivers }: { issuer: { name: string; address: string } | null; receivers: PickReceiver[] }) {
  const A = useA();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const later = <i>{A.inv.atIssue}</i>;

  const pick = async (id: string) => {
    setErr(null);
    try {
      const r = await newInvoiceAction(id);
      if (r.ok) return router.push(`${INV_ROOT}/${r.id}`);
      setErr(A.inv.fail[r.code] ?? A.error);
    } catch {
      setErr(A.error);
    }
  };

  return (
    <>
      <IvTop title={A.inv.newInvoice} />
      <div className="iv-body is-doc">
        <div className="iv-bar2">
          <Link className="iv-btn is-sm" href={INV_ROOT} prefetch={false}>
            <PrevIcon size={14} />
            {A.inv.toList}
          </Link>
        </div>
        <section className="inv-sheet">
          {!issuer ? (
            <p className="iv-warn">
              <Link className="iv-link" href={`${INV_ROOT}/settings`}>
                {A.inv.noIssuer}
              </Link>
            </p>
          ) : (
            <div className="inv-parties">
              <div className="inv-who">
                <SenderBlock name={issuer.name} address={issuer.address} />
                <ReceiverPicker receivers={receivers} onPick={pick} err={err} />
              </div>
              <div className="inv-side">
                <MetaTable
                  rows={[
                    [A.inv.number, later],
                    [A.inv.issuedOn, later],
                    [A.inv.dueOn, later],
                  ]}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
