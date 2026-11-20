"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ServiceListRow } from "@/lib/admin/services";
import { euroText } from "@/lib/money";
import { useA } from "../../../lang";
import { findProductsAction, type FrameProduct } from "../../frame-actions";
import { Thumb } from "../../sale-drawer";
import { Field, IvTop } from "../ui";

/** After the last keystroke, before the shop is asked. */
const DELAY = 300;
/** The most the shop link gives for one search. */
const MOST = 20;

type Tab = "products" | "services";
type Look = "idle" | "looking" | "nothing" | "shop_down" | "not_configured";

/** «30,00–45,00 €», or one price. */
const priceRange = (from: number, to: number) => (to > from ? `${euroText(from).replace(" €", "")}–${euroText(to)}` : euroText(from));

export function ItemsView({ demo: demoAtFirst, services }: { demo: boolean; services: ServiceListRow[] | null }) {
  const A = useA();
  const I = A.inv.items;
  const C = A.catalogue;
  const [tab, setTab] = useState<Tab>("products");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<FrameProduct[]>([]);
  const [look, setLook] = useState<Look>("idle");
  const [demo, setDemo] = useState(demoAtFirst);
  const seq = useRef(0);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) return;
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      setLook("looking");
      const r = await findProductsAction(s, MOST).catch(() => ({ ok: false, code: "shop_down" }) as const);
      if (n !== seq.current) return;
      if (!r.ok) {
        setItems([]);
        return setLook(r.code);
      }
      setDemo(r.demo);
      setItems(r.items);
      setLook(r.items.length ? "idle" : "nothing");
    }, DELAY);
    return () => window.clearTimeout(t);
  }, [q]);

  const type = (v: string) => {
    setQ(v);
    if (v.trim().length < 2) {
      seq.current++;
      setItems([]);
      setLook("idle");
    }
  };
  const time = (from: number, to: number) => (to > from ? `${A.mins(from)} – ${A.mins(to)}` : A.mins(from));

  return (
    <>
      <IvTop title={A.inv.menu.items} />
      <div className="iv-body">
        <p className="iv-note">
          {I.lead} {I.whereProducts} {I.whereServices}{" "}
          <Link className="iv-link" href="/admin/services" prefetch={false}>
            {I.openServices}
          </Link>
        </p>
        <section className="iv-card">
          <div className="iv-tabs" role="tablist">
            {(["products", "services"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {I.tabs[t]}
              </button>
            ))}
          </div>

          {tab === "products" ? (
            <>
              {demo && <p className="iv-warn">{C.demo}</p>}
              <div className="iv-tools">
                <Field label={C.search} className="f-search">
                  <input type="search" enterKeyHint="search" autoComplete="off" maxLength={80} aria-label={C.search} value={q} onChange={(e) => type(e.target.value)} />
                </Field>
              </div>
              <p className={look === "shop_down" || look === "not_configured" ? "iv-err" : "iv-mute"} role="status">
                {look === "looking"
                  ? A.sale.looking
                  : look === "nothing"
                    ? C.nothing
                    : look === "shop_down"
                      ? C.shopDown
                      : look === "not_configured"
                        ? C.notConfigured
                        : items.length
                          ? `${C.found(items.length)}${items.length >= MOST ? `. ${C.capped(MOST)}` : ""}`
                          : C.hint}
              </p>
              {items.length > 0 && (
                <div className="iv-tablewrap">
                  <table className="iv-table">
                    <thead>
                      <tr>
                        <th scope="col" colSpan={2}>
                          {C.cols.name}
                        </th>
                        <th scope="col" className="n">
                          {C.cols.price}
                        </th>
                        <th scope="col" className="n">
                          {C.cols.stock}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((p) => (
                        <tr key={`${p.productId}:${p.variant}`}>
                          <td className="ico">
                            <Thumb src={p.photo} />
                          </td>
                          <td>{p.title}</td>
                          <td className="n">{euroText(p.priceCents)}</td>
                          <td className="n">{p.stock == null ? "—" : p.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : services === null ? (
            <p className="iv-mute">{I.noRight}</p>
          ) : services.length === 0 ? (
            <p className="iv-mute">{I.noServices}</p>
          ) : (
            <div className="iv-tablewrap">
              <table className="iv-table">
                <thead>
                  <tr>
                    <th scope="col">{I.svcName}</th>
                    <th scope="col">{I.svcTime}</th>
                    <th scope="col" className="n">
                      {I.svcPrice}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id}>
                      <td>{A.pick(s.name)}</td>
                      <td>{time(s.minFrom, s.minTo)}</td>
                      <td className="n">{priceRange(s.priceFromCents, s.priceToCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
