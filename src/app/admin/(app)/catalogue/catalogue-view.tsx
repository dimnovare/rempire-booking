"use client";

/**
 * «Каталог товаров»: the shop's whole list, a page at a time (design board
 * «Catalogue», Dim 26.11.2026). A search by a name, a brand or a barcode, a
 * brand, «Все / Есть на складе / Нет на складе», and the products: one
 * table from 900px, a row per product on a phone. A row opens the
 * product's card (CatalogueItem): a drawer from the right, the whole screen
 * on a phone. Nothing here can be changed and nothing links out: names,
 * prices and stock are the shop's.
 *
 * A shop without the list call yet (not_supported) leaves today's page: the
 * search alone, with its hint.
 */
import { useEffect, useRef, useState } from "react";
import type { BarberSold, CatalogueFound, CatalogueList, CatAnswer, CatFail, CatItem, CatStock } from "@/lib/admin/catalogue";
import { bpText, commissionFor, euroText, type Basis } from "@/lib/money";
import { Ava, NextIcon, PrevIcon } from "../../icons";
import { useA } from "../../lang";
import { Pager } from "../clients/base-actions";
import { Drawer } from "../drawer";
import { Titled } from "../star";
import { catalogueFindAction, catalogueListAction, productMonthAction } from "./actions";

/** After the last keystroke, before the shop is asked. */
const DELAY = 300;

type Filter = { brand: string; stock: CatStock };
type Look = "idle" | "looking" | "nothing" | "shop_down" | "not_configured";
type Share = { bp: number; basis: Basis };

const ALL: Filter = { brand: "", stock: "" };
const keyOf = (p: Pick<CatItem, "productId" | "variant">) => `${p.productId}:${p.variant}`;
const filterKey = (f: Filter) => `${f.brand}\u0000${f.stock}`;
/** «Matte Paste 100 ml»: the brand goes under it. */
const nameOf = (p: CatItem) => [p.name, p.variantLabel].filter(Boolean).join(" ");
const down = <T,>(): CatAnswer<T> => ({ ok: false, code: "shop_down" });

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** A box: a product with no photo in the shop. */
function BoxIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
      <path d="M4 8l8 4 8-4M12 12v8" />
    </svg>
  );
}

function Pic({ src }: { src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="cat-thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : (
    <span className="cat-thumb" aria-hidden="true">
      <BoxIcon size={18} />
    </span>
  );
}

/** The stock as a number; none left is a red «нет»; no number from the shop is «—». */
function Stock({ n, pcs = false }: { n: number | null; pcs?: boolean }) {
  const C = useA().catalogue;
  if (n == null) return <>—</>;
  if (n <= 0) return <span className="cat-out">{C.out}</span>;
  return <>{pcs ? C.pcs(n) : n}</>;
}

export function CatalogueView({ demo, first, share }: { demo: boolean; first: CatAnswer<CatalogueList>; share: Share }) {
  const A = useA();
  const C = A.catalogue;
  const [list, setList] = useState<CatalogueList | null>(first.ok ? first.data : null);
  const [listFail, setListFail] = useState<CatFail | null>(first.ok ? null : first.code);
  /** the shop has no list call yet: the search alone, as before */
  const [only, setOnly] = useState(!first.ok && first.code === "not_supported");
  const [filter, setFilter] = useState<Filter>(ALL);
  /** the filter the list on screen was asked with */
  const [listedFor, setListedFor] = useState(filterKey(ALL));
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CatalogueFound | null>(null);
  const [look, setLook] = useState<Look>("idle");
  const [open, setOpen] = useState<CatItem | null>(null);
  const listSeq = useRef(0);
  const findSeq = useRef(0);
  const top = useRef<HTMLDivElement>(null);
  const searching = q.trim().length >= 2;

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) return;
    const n = ++findSeq.current;
    const t = window.setTimeout(async () => {
      setLook("looking");
      const r = await catalogueFindAction(s, filter).catch(down<CatalogueFound>);
      if (n !== findSeq.current) return;
      if (!r.ok) {
        setFound(null);
        return setLook(r.code === "not_configured" ? "not_configured" : "shop_down");
      }
      setFound(r.data);
      setLook(r.data.items.length ? "idle" : "nothing");
    }, DELAY);
    return () => window.clearTimeout(t);
  }, [q, filter]);

  /** Another page or filter of the list; an answer that comes after the next question is dropped. */
  const ask = async (page: number, f: Filter) => {
    const n = ++listSeq.current;
    setBusy(true);
    const r = await catalogueListAction(page, f).catch(down<CatalogueList>);
    if (n !== listSeq.current) return false;
    setBusy(false);
    if (!r.ok) {
      setListFail(r.code);
      if (r.code === "not_supported") setOnly(true);
      return false;
    }
    setList(r.data);
    setListFail(null);
    setListedFor(filterKey(f));
    return true;
  };

  /** A new brand or stock: the list from its first page, or the search over again (its effect). */
  const refilter = (f: Filter) => {
    setFilter(f);
    if (!searching && !only) void ask(1, f);
  };

  const type = (v: string) => {
    setQ(v);
    if (v.trim().length < 2) {
      findSeq.current++;
      setFound(null);
      setLook("idle");
      // the filter changed while searching: the list is asked for it now
      if (!only && listedFor !== filterKey(filter)) void ask(1, filter);
    }
  };

  const turn = (page: number) => {
    void ask(page, filter).then((ok) => {
      const el = top.current;
      if (ok && el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    });
  };

  const rows: CatItem[] = searching ? (found?.items ?? []) : only ? [] : (list?.items ?? []);
  const brands = list?.brands ?? [];
  const soldTotal = found?.soldTotal ?? list?.soldTotal ?? null;
  const filtered = !!(filter.brand || filter.stock);

  // the line under the filters: what is happening, or why nothing is shown; empty, it is not shown
  let status = "";
  let bad = false;
  if (searching) {
    if (look === "looking") status = A.sale.looking;
    else if (look === "nothing") status = C.nothing;
    else if (look === "shop_down" || look === "not_configured") [status, bad] = [look === "shop_down" ? C.shopDown : C.notConfigured, true];
    else if (found) status = `${C.found(found.items.length)}${found.capped ? `. ${C.capped(found.most)}` : ""}`;
  } else if (only) status = C.hint;
  else if (listFail === "shop_down" || listFail === "not_configured") [status, bad] = [listFail === "shop_down" ? C.shopDown : C.notConfigured, true];
  else if (list && !busy && !list.items.length) status = filtered ? C.noneFiltered : C.empty;

  const paged = !searching && !only && list && list.total > 0 && list.items.length > 0 ? list : null;
  const from = paged ? (paged.page - 1) * paged.size + 1 : 0;
  const shown = paged ? C.shown(from, from + paged.items.length - 1, paged.total) : "";

  return (
    <>
      <div className="cat-head">
        <div className="adm-page-head">
          <Titled page="catalogue">
            <h1 className="adm-h1">{C.title}</h1>
          </Titled>
        </div>
        <p className="adm-meta">{C.lead}</p>
      </div>
      {demo && <p className="adm-note">{C.demo}</p>}
      <form className="cl-filters cat-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="cl-search">
          <SearchIcon />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={80}
            placeholder={only ? C.search : C.searchAll}
            aria-label={only ? C.search : C.searchAll}
            value={q}
            onChange={(e) => type(e.target.value)}
          />
        </label>
        {!only && brands.length > 0 && (
          <select className="cat-brand" aria-label={C.brand} value={filter.brand} onChange={(e) => refilter({ ...filter, brand: e.target.value })}>
            <option value="">{C.brandAll}</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
        {!only && (
          <div className="cat-chips" role="group" aria-label={C.stockLabel}>
            {(["", "in", "out"] as const).map((s) => (
              <button key={s || "all"} type="button" className="cat-chip" aria-pressed={filter.stock === s} onClick={() => filter.stock !== s && refilter({ ...filter, stock: s })}>
                {s === "in" ? C.stockIn : s === "out" ? C.stockOut : C.stockAll}
              </button>
            ))}
          </div>
        )}
        {soldTotal != null && <span className="cat-sold-total">{C.soldTotal(soldTotal)}</span>}
      </form>
      <p className={`cat-status ${bad ? "adm-err" : "adm-meta"}`} role="status">
        {status}
      </p>
      {rows.length > 0 && (
        <div ref={top} className={`cat-rows${busy ? " is-busy" : ""}`}>
          <div className="cl-card only-wide">
            <table className="cl-table cat-table">
              <thead>
                <tr>
                  <th scope="col" colSpan={2}>
                    {C.cols.name}
                  </th>
                  <th scope="col">{C.cols.barcode}</th>
                  <th scope="col" className="n">
                    {C.cols.price}
                  </th>
                  <th scope="col" className="n">
                    {C.cols.stock}
                  </th>
                  <th scope="col" className="n">
                    {C.cols.sold}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  // the whole row opens the card; its button is the way in for the keyboard (a click on it lands here too)
                  <tr key={keyOf(p)} className={open && keyOf(open) === keyOf(p) ? "is-open" : undefined} onClick={() => setOpen(p)}>
                    <td className="cat-pic">
                      <Pic src={p.photo} />
                    </td>
                    <td className="c-name">
                      <button type="button" className="cat-open">
                        <span>{nameOf(p)}</span>
                        {p.brand && <small>{p.brand}</small>}
                      </button>
                    </td>
                    <td className="cat-code">{p.barcode ?? "—"}</td>
                    <td className="n">{euroText(p.priceCents)}</td>
                    <td className="n">
                      <Stock n={p.stock} />
                    </td>
                    <td className="n">{p.sold > 0 ? C.pcs(p.sold) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="adm-list only-narrow cat-list">
            {rows.map((p) => (
              <li key={keyOf(p)}>
                <button type="button" className="adm-item cat-item" onClick={() => setOpen(p)}>
                  <Pic src={p.photo} />
                  <span className="txt">
                    <span className="plain">{nameOf(p)}</span>
                    {p.brand && <small>{p.brand}</small>}
                    <small>
                      {C.cols.stock}: <Stock n={p.stock} />
                      {p.sold > 0 ? ` · ${C.soldShort}: ${C.pcs(p.sold)}` : ""}
                    </small>
                  </span>
                  <span className="end price">{euroText(p.priceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {paged && (
        <>
          <div className="cat-pager only-wide">
            <span>{shown}</span>
            {paged.pages > 1 && <Pager page={paged.page} pages={paged.pages} busy={busy} onTurn={turn} />}
          </div>
          {paged.pages > 1 ? (
            <nav className="cl-pages only-narrow" aria-label={A.clients.pages}>
              <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={paged.page <= 1 || busy} onClick={() => turn(paged.page - 1)}>
                <PrevIcon size={16} />
                {A.clients.prev}
              </button>
              <span>{shown}</span>
              <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={paged.page >= paged.pages || busy} onClick={() => turn(paged.page + 1)}>
                {A.clients.next}
                <NextIcon size={16} />
              </button>
            </nav>
          ) : (
            <p className="adm-meta only-narrow">{shown}</p>
          )}
        </>
      )}
      {open && <ProductCard key={keyOf(open)} p={open} share={share} onClose={() => setOpen(null)} />}
    </>
  );
}

type Month = { month: string; rows: BarberSold[] };

/** The product's card: its photo, price, stock, barcode, the barber's share of a sale, and who sold it this month. */
function ProductCard({ p, share, onClose }: { p: CatItem; share: Share; onClose: () => void }) {
  const A = useA();
  const C = A.catalogue;
  const [month, setMonth] = useState<Month | "failed" | null>(null);
  useEffect(() => {
    let live = true;
    productMonthAction(p.productId, p.variant).then(
      (r) => live && setMonth(r.ok ? { month: r.month, rows: r.rows } : "failed"),
      () => live && setMonth("failed"),
    );
    return () => {
      live = false;
    };
  }, [p.productId, p.variant]);
  // what the barber earns on one sold at the shop's price: the salon's own rate and basis (settings)
  const cut = commissionFor({ qty: 1, unitCents: p.priceCents, listCents: p.priceCents, vatBp: p.vatBp, basis: share.basis, bp: share.bp });

  return (
    <Drawer title={C.card} size="narrow" head onClose={onClose}>
      <div className="cat-card">
        <div className="cat-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.photo ? <img src={p.photo} alt="" referrerPolicy="no-referrer" /> : <BoxIcon size={48} />}
        </div>
        <div className="cat-card-name">
          {p.brand && <small>{p.brand}</small>}
          <b>{nameOf(p)}</b>
        </div>
        <dl className="cat-dl">
          <dt>{C.cols.price}</dt>
          <dd>{euroText(p.priceCents)}</dd>
          <dt>{C.cols.stock}</dt>
          <dd>
            <Stock n={p.stock} pcs />
          </dd>
          <dt>{C.cols.barcode}</dt>
          <dd>{p.barcode ?? "—"}</dd>
          <dt>{C.share}</dt>
          <dd>{`${euroText(cut)} (${bpText(share.bp)})`}</dd>
        </dl>
        <section className="cat-month">
          {month === null ? (
            <p className="adm-meta" role="status">
              {A.loading}
            </p>
          ) : month === "failed" ? (
            <p className="adm-err" role="status">
              {A.error}
            </p>
          ) : (
            <>
              <h3>{C.soldIn(Number(month.month.slice(5, 7)) - 1)}</h3>
              {month.rows.length ? (
                <ul className="cat-sold">
                  {month.rows.map((r) => (
                    <li key={r.staffId}>
                      <Ava src={r.photo} name={r.name} />
                      <span className="txt">{r.name}</span>
                      <span className="n">{C.pcs(r.qty)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="adm-meta">{C.soldNone}</p>
              )}
            </>
          )}
        </section>
      </div>
    </Drawer>
  );
}
