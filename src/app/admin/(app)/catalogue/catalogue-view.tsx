"use client";

/**
 * «Каталог товаров»: a search field and the shop's products that match it.
 * One table from 900px, a row per product on a phone. Nothing here can be
 * changed: names, prices and stock are the shop's.
 */
import { useEffect, useRef, useState } from "react";
import { euroText } from "@/lib/money";
import { useA } from "../../lang";
import { findProductsAction, type FrameProduct } from "../frame-actions";
import { Thumb } from "../sale-drawer";
import { Titled } from "../star";

/** After the last keystroke, before the shop is asked. */
const DELAY = 300;
/** The most the shop link gives for one search. */
const MOST = 20;

type Look = "idle" | "looking" | "nothing" | "shop_down" | "not_configured";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function CatalogueView({ demo: demoAtFirst }: { demo: boolean }) {
  const A = useA();
  const C = A.catalogue;
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
  const stock = (n: number | null) => (n == null ? "—" : String(n));

  return (
    <>
      <div className="adm-page-head">
        <Titled page="catalogue">
          <h1 className="adm-h1">{C.title}</h1>
        </Titled>
      </div>
      <p className="adm-meta">{C.lead}</p>
      {demo && <p className="adm-note">{C.demo}</p>}
      <form className="cl-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="cl-search">
          <SearchIcon />
          <input type="search" enterKeyHint="search" autoComplete="off" maxLength={80} placeholder={C.search} aria-label={C.search} value={q} onChange={(e) => type(e.target.value)} />
        </label>
      </form>
      <p className={look === "shop_down" || look === "not_configured" ? "adm-err" : "adm-meta"} role="status">
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
        <>
          <div className="cl-card only-wide">
            <table className="cl-table cat-table">
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
                    <td className="cat-pic">
                      <Thumb src={p.photo} />
                    </td>
                    <td className="c-name">{p.title}</td>
                    <td className="n">{euroText(p.priceCents)}</td>
                    <td className="n">{stock(p.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="adm-list only-narrow cat-list">
            {items.map((p) => (
              <li key={`${p.productId}:${p.variant}`} className="adm-item cat-item">
                <Thumb src={p.photo} />
                <span className="txt">
                  <span className="plain">{p.title}</span>
                  <small>
                    {C.cols.stock}: {stock(p.stock)}
                  </small>
                </span>
                <span className="end price">{euroText(p.priceCents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
