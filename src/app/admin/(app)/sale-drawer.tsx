"use client";

/**
 * «Продажа товара»: the front desk writes down a product a barber sold
 * (docs/one-place.md). The day and time (now), who sold, the product found
 * in the shop's catalogue by name or barcode, how many, and the client if
 * he is named. «Сохранить» makes the barber's own sale (frame-actions.ts →
 * src/lib/admin/sale.ts): the shop's price, the same 17 % to the barber.
 *
 * The sale's `ref` is made here before the first send, so the button
 * pressed twice, or pressed again after a lost answer, is one sale.
 */
import { useEffect, useRef, useState } from "react";
import type { ClientHit } from "@/lib/admin/calendar";
import { euroText } from "@/lib/money";
import { localParts, zonedToUtc } from "@/lib/tz";
import { XIcon } from "../icons";
import { useA } from "../lang";
import { findClients } from "./actions";
import { Drawer } from "./drawer";
import { findProductsAction, saleFormAction, sellAction, type FrameProduct, type SaleForm } from "./frame-actions";

/** After the last keystroke, before the shop or the client list is asked. */
const DELAY = 300;

/** «s_» + 16 base64url characters, as the server's own refs. */
function newRef(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return `s_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function SaleDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: (what: string) => void }) {
  const A = useA();
  const S = A.sale;
  const [form, setForm] = useState<SaleForm | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    saleFormAction().then(
      (f) => live && setForm(f),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  return form ? (
    <SaleFields form={form} onClose={onClose} onSaved={onSaved} />
  ) : (
    <Drawer title={S.title} onClose={onClose}>
      <p className={failed ? "adm-err" : "adm-meta"} role="status">
        {failed ? A.error : A.loading}
      </p>
    </Drawer>
  );
}

type Look = "idle" | "looking" | "nothing" | "shop_down" | "not_configured";

function SaleFields({ form, onClose, onSaved }: { form: SaleForm; onClose: () => void; onSaved: (what: string) => void }) {
  const A = useA();
  const S = A.sale;
  const opened = localParts(form.now, form.tz);
  const [day, setDay] = useState(opened.date);
  const [time, setTime] = useState(opened.time);
  // left as it opened: the sale is dated the moment it is saved
  const [dated, setDated] = useState(false);
  const [seller, setSeller] = useState(form.me ?? (form.barbers.length === 1 ? form.barbers[0].id : ""));
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FrameProduct[]>([]);
  const [look, setLook] = useState<Look>("idle");
  const [demo, setDemo] = useState(form.demo);
  const [pick, setPick] = useState<FrameProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [who, setWho] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [client, setClient] = useState<ClientHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef({ product: 0, client: 0 });
  // one ref per sale: kept while the same sale is sent again, new once anything in it changes
  const ref = useRef<string | null>(null);
  const changed = () => {
    ref.current = null;
    setErr("");
  };

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) return;
    const n = ++seq.current.product;
    const t = window.setTimeout(async () => {
      setLook("looking");
      const r = await findProductsAction(s).catch(() => ({ ok: false, code: "shop_down" }) as const);
      if (n !== seq.current.product) return;
      if (!r.ok) {
        setFound([]);
        return setLook(r.code);
      }
      setDemo(r.demo);
      setFound(r.items);
      setLook(r.items.length ? "idle" : "nothing");
    }, DELAY);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const s = who.trim();
    if (s.length < 2) return;
    const n = ++seq.current.client;
    const t = window.setTimeout(async () => {
      const list = await findClients(s).catch(() => [] as ClientHit[]);
      if (n === seq.current.client) setHits(list);
    }, DELAY);
    return () => window.clearTimeout(t);
  }, [who]);

  const total = pick ? pick.priceCents * qty : 0;
  const share = pick ? Math.round(qty * pick.shareCents) : 0;

  const save = async () => {
    if (busy) return;
    if (!seller) return setErr(S.needSeller);
    if (!pick) return setErr(S.needProduct);
    let at: number | null = null;
    if (dated) {
      try {
        at = zonedToUtc(day, time, form.tz);
      } catch {
        return setErr(S.badTime(form.backDays));
      }
    }
    setBusy(true);
    setErr("");
    ref.current ??= newRef();
    const r = await sellAction({ ref: ref.current, staffId: seller, productId: pick.productId, variant: pick.variant, qty, expectCents: pick.priceCents, clientId: client?.id ?? null, at }).catch(() => null);
    setBusy(false);
    // no answer: the same ref goes again with the next press
    if (!r) return setErr(A.error);
    if (r.ok) {
      onSaved(`${pick.title} × ${qty}`);
      return onClose();
    }
    ref.current = null;
    if (r.code === "price_changed") {
      // the new price is shown first; the next press sells at it
      setPick({ ...pick, priceCents: r.unitCents, shareCents: pick.priceCents ? (pick.shareCents * r.unitCents) / pick.priceCents : pick.shareCents });
      return setErr(S.priceChanged(euroText(r.unitCents)));
    }
    if (r.code === "invalid") return setErr(r.field === "at" ? S.badTime(form.backDays) : r.field === "staff" ? S.needSeller : A.error);
    setErr(r.code === "not_found" ? S.notFound : S.shopDown);
  };

  return (
    <Drawer
      title={S.title}
      onClose={onClose}
      foot={
        <button type="button" className="dw-btn dw-btn-main" disabled={busy} onClick={() => void save()}>
          {A.save}
        </button>
      }
    >
      <section className="dw-col dw-col-side" aria-label={S.when}>
        <div className="dw-pair">
          <label className="dw-field">
            <span>{S.day}</span>
            <input
              type="date"
              value={day}
              max={opened.date}
              onChange={(e) => {
                setDay(e.target.value);
                setDated(true);
                changed();
              }}
            />
          </label>
          <label className="dw-field">
            <span>{S.time}</span>
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setDated(true);
                changed();
              }}
            />
          </label>
        </div>
        <label className="dw-field">
          <span>{S.seller}</span>
          <select
            value={seller}
            onChange={(e) => {
              setSeller(e.target.value);
              changed();
            }}
          >
            <option value="">{S.pickSeller}</option>
            {form.barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {client ? (
          <div className="dw-field">
            <span>{S.client}</span>
            <div className="dw-chosen">
              <span className="txt">
                <b>{client.name}</b>
                {client.phone && <small>{client.phone}</small>}
              </span>
              <button
                type="button"
                className="dw-x"
                aria-label={S.clientRemove}
                onClick={() => {
                  setClient(null);
                  changed();
                }}
              >
                <XIcon size={16} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="dw-field">
              <span>{S.client}</span>
              <input
                type="search"
                autoComplete="off"
                maxLength={60}
                placeholder={A.visit.searchHint}
                value={who}
                onChange={(e) => {
                  setWho(e.target.value);
                  if (e.target.value.trim().length < 2) {
                    seq.current.client++;
                    setHits([]);
                  }
                }}
              />
              <small>{S.clientHint}</small>
            </label>
            {hits.length > 0 && (
              <ul className="dw-hits" aria-label={S.client}>
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setClient(h);
                        setWho("");
                        setHits([]);
                        changed();
                      }}
                    >
                      <b>{h.name}</b>
                      {h.phone && <small>{h.phone}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="dw-col dw-col-main" aria-label={S.product}>
        {(demo || form.test) && <p className="dw-note">{demo ? S.demo : S.test}</p>}
        {pick ? (
          <>
            <div className="dw-product">
              <Thumb src={pick.photo} />
              <span className="txt">
                <b>{pick.title}</b>
                <small>
                  {euroText(pick.priceCents)}
                  {pick.stock == null ? "" : ` · ${S.stock(pick.stock)}`}
                </small>
              </span>
              <button
                type="button"
                className="dw-btn"
                onClick={() => {
                  setPick(null);
                  changed();
                }}
              >
                {S.change}
              </button>
            </div>
            <div className="dw-qty" role="group" aria-label={S.qty}>
              <span>{S.qty}</span>
              <button
                type="button"
                className="dw-step"
                aria-label={S.less}
                disabled={qty <= 1}
                onClick={() => {
                  setQty(qty - 1);
                  changed();
                }}
              >
                −
              </button>
              <b aria-live="polite">{qty}</b>
              <button
                type="button"
                className="dw-step"
                aria-label={S.more}
                disabled={qty >= form.maxQty}
                onClick={() => {
                  setQty(qty + 1);
                  changed();
                }}
              >
                +
              </button>
            </div>
            <div className="dw-total">
              <span>{S.total}</span>
              <b>{euroText(total)}</b>
              <small>{S.share(form.pct, euroText(share))}</small>
            </div>
          </>
        ) : (
          <>
            <label className="dw-field">
              <span>{S.product}</span>
              <input
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                maxLength={80}
                placeholder={S.search}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (e.target.value.trim().length < 2) {
                    seq.current.product++;
                    setFound([]);
                    setLook("idle");
                  }
                }}
              />
            </label>
            {look !== "idle" && (
              <p className={look === "looking" || look === "nothing" ? "adm-meta" : "adm-err"} role="status">
                {look === "looking" ? S.looking : look === "nothing" ? S.nothing : look === "not_configured" ? S.notConfigured : S.shopDown}
              </p>
            )}
            {found.length > 0 && (
              <ul className="dw-products" aria-label={S.product}>
                {found.map((p) => (
                  <li key={`${p.productId}:${p.variant}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setPick(p);
                        setQty(1);
                        changed();
                      }}
                    >
                      <Thumb src={p.photo} />
                      <span className="txt">
                        <b>{p.title}</b>
                        <small>{p.stock == null ? "" : S.stock(p.stock)}</small>
                      </span>
                      <span className="end">{euroText(p.priceCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {err && (
          <p className="adm-err" role="alert">
            {err}
          </p>
        )}
      </section>
    </Drawer>
  );
}

/** The shop's own picture (https only, checked in src/lib/shop.ts); none in the demo shop. */
export function Thumb({ src }: { src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="dw-thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="dw-thumb" aria-hidden="true" />;
}
