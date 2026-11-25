"use client";

/**
 * «Продать», in as few taps as a till (the design board «Продать», 25.11):
 * scan first (or type the name, or take a photo), then the product's card
 * with «Клиенту | Себе» next to the price it changes, his share before he
 * sells, and the one big button.
 *
 * A sale never goes twice and is never lost on a bad connection: its `ref`
 * is made here first and kept on this phone until the server has it, and
 * the server treats the same ref as the same sale. A sale that could not be
 * sent waits here («уйдёт, когда будет интернет») and goes when the phone is
 * back online.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { euroText } from "@/lib/money";
import { hm } from "../../copy.shared";
import { useB } from "../../lang";
import { barcodeAction, photoAction, searchAction, sellAction, undoAction, type Found, type SellProduct } from "./actions";
import { Ic } from "./icons";
import { Scanner, shrinkPhoto } from "./scanner";

type Mode = "client" | "self";
type Today = { ref: string; name: string; qty: number; mode: string; totalCents: number; commissionCents: number; status: string; sync: string; noPurchase: boolean; at: string; reversal: boolean };
/** `shareCents`: his share as the card showed it (the server counts the real one); none in a sale kept before 25.11. */
type Pending = { ref: string; productId: string; variant: string; mode: Mode; qty: number; expectCents: number; name: string; totalCents: number; at: number; shareCents?: number };
type Look = "idle" | "looking" | "photo" | "shop_down" | "empty" | "photo_none" | "not_found" | "photo_pick";
type Msg = { kind: "ok" | "bad" | "wait"; text: string };

const keyOf = (staffId: string) => `rempire.sell.pending.${staffId}`;
/** How often the undo buttons look at the clock: one goes within seconds of its end. */
const TICK = 5_000;

function readPending(staffId: string): Pending[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(keyOf(staffId)) ?? "[]");
    return Array.isArray(v) ? v.filter((p) => p && typeof p.ref === "string") : [];
  } catch {
    return [];
  }
}

function writePending(staffId: string, list: Pending[]) {
  try {
    if (list.length) window.localStorage.setItem(keyOf(staffId), JSON.stringify(list));
    else window.localStorage.removeItem(keyOf(staffId));
  } catch {
    /* private mode: the sale still goes now, it just cannot wait for later */
  }
}

/** «s_» + 16 base64url characters, as the server's own refs. */
function newRef(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return `s_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

const unitOf = (p: SellProduct, mode: Mode) => (mode === "client" ? p.clientCents : p.selfCents);

export function SellView({
  staffId,
  now,
  tz,
  pct,
  undoMin,
  maxQty,
  demo,
  today,
}: {
  staffId: string;
  now: number;
  tz: string;
  pct: string;
  undoMin: number;
  maxQty: number;
  demo: boolean;
  today: Today[];
}) {
  const B = useB();
  const S = B.sell;
  const [mode, setMode] = useState<Mode>("client");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SellProduct[]>([]);
  const [look, setLook] = useState<Look>("idle");
  const [pick, setPick] = useState<SellProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [scan, setScan] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [clock, setClock] = useState(now);
  const seq = useRef(0);
  const file = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const flying = useRef(new Set<string>());

  /* ---------- the phone's waiting sales ---------- */

  const drop = useCallback(
    (ref: string) => {
      const left = readPending(staffId).filter((p) => p.ref !== ref);
      writePending(staffId, left);
      setPending(left);
    },
    [staffId],
  );

  /** "ok" when the server has it, "keep" to try again later, or what went wrong (the sale is dropped). */
  const send = useCallback(
    async (p: Pending): Promise<"ok" | "keep" | { text: string; unitCents?: number }> => {
      if (flying.current.has(p.ref)) return "keep";
      flying.current.add(p.ref);
      try {
        const r = await sellAction({ ref: p.ref, productId: p.productId, variant: p.variant, mode: p.mode, qty: p.qty, expectCents: p.expectCents });
        if (r.ok) {
          drop(p.ref);
          return "ok";
        }
        if (r.code === "shop_down") return "keep";
        drop(p.ref);
        if (r.code === "price_changed") return { text: S.priceChanged(euroText(r.unitCents)), unitCents: r.unitCents };
        if (r.code === "no_purchase_price") return { text: S.noPurchaseHint };
        if (r.code === "not_found") return { text: S.notFound };
        return { text: B.error };
      } catch {
        // no answer: offline, or the server is restarting; the ref keeps it one sale
        return "keep";
      } finally {
        flying.current.delete(p.ref);
      }
    },
    [B.error, S, drop],
  );

  const flush = useCallback(async () => {
    for (const p of readPending(staffId)) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      await send(p);
    }
  }, [send, staffId]);

  useEffect(() => {
    // what this phone could not send last time goes first
    setPending(readPending(staffId));
    void flush();
    const online = () => void flush();
    window.addEventListener("online", online);
    const t = window.setInterval(() => {
      if (readPending(staffId).length) void flush();
    }, 15_000);
    return () => {
      window.removeEventListener("online", online);
      window.clearInterval(t);
    };
  }, [flush, staffId]);

  /* ---------- finding the product ---------- */

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) return;
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      setLook("looking");
      const r: Found = await searchAction(s).catch(() => ({ ok: false, code: "shop_down" }) as const);
      if (n !== seq.current) return;
      if (!r.ok) {
        setFound([]);
        return setLook("shop_down");
      }
      setFound(r.items);
      setLook(r.items.length ? "idle" : "empty");
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const choose = (p: SellProduct) => {
    setPick(p);
    setQty(1);
    setMsg(null);
  };

  const onCode = async (code: string) => {
    setScan(false);
    setQ("");
    const n = ++seq.current;
    setLook("looking");
    const r: Found = await barcodeAction(code).catch(() => ({ ok: false, code: "shop_down" }) as const);
    if (n !== seq.current) return;
    if (!r.ok) return setLook("shop_down");
    if (!r.items.length) {
      setFound([]);
      return setLook("not_found");
    }
    setFound(r.items);
    setLook("idle");
    choose(r.items[0]);
  };

  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    setQ("");
    setPick(null);
    const n = ++seq.current;
    setLook("photo");
    try {
      const r: Found = await photoAction(await shrinkPhoto(f));
      if (n !== seq.current) return;
      if (!r.ok) return setLook("shop_down");
      setFound(r.items);
      setLook(r.items.length ? "photo_pick" : "photo_none");
    } catch {
      if (n === seq.current) setLook("photo_none");
    }
  };

  /* ---------- the sale ---------- */

  const unit = pick ? unitOf(pick, mode) : null;
  const share = pick && mode === "client" ? Math.round(qty * pick.shareCents) : 0;

  const sell = async () => {
    if (!pick || unit == null) return;
    const p: Pending = { ref: newRef(), productId: pick.productId, variant: pick.variant, mode, qty, expectCents: unit, name: pick.title, totalCents: unit * qty, at: Date.now(), shareCents: share };
    const list = [...readPending(staffId), p];
    writePending(staffId, list);
    setPending(list);
    setBusy(true);
    setMsg(null);
    const r = await send(p);
    setBusy(false);
    if (r === "ok") {
      setMsg({ kind: "ok", text: `${mode === "client" ? S.sold : S.taken}: ${pick.title} × ${qty}` });
      setPick(null);
      return;
    }
    if (r === "keep") {
      // not an error: it is kept here and goes by itself
      setMsg({ kind: "wait", text: `${pick.title} × ${qty}: ${S.waiting}` });
      setPick(null);
      return;
    }
    setMsg({ kind: "bad", text: r.text });
    // a new price: the card shows it, and the next tap is a new sale at that price
    if (r.unitCents != null) setPick({ ...pick, ...(mode === "client" ? { clientCents: r.unitCents } : { selfCents: r.unitCents }) });
  };

  const undo = async (ref: string) => {
    const r = await undoAction(ref).catch(() => null);
    if (!r) return setMsg({ kind: "bad", text: B.error });
    if (!r.ok) setMsg({ kind: "bad", text: r.code === "too_late" ? S.tooLate : B.error });
  };

  /* ---------- today ---------- */

  const waiting = pending.filter((p) => !today.some((t) => t.ref === p.ref));
  const undoEnd = (t: Today) => Date.parse(t.at) + undoMin * 60_000;
  const canUndo = (t: Today) => t.status === "done" && !t.reversal && (t.sync === "queued" || t.sync === "test") && undoEnd(t) > clock;
  const anyUndo = today.some(canUndo);
  // the undo buttons go when their window ends, not at the next reload
  useEffect(() => {
    if (!anyUndo) return;
    const t = window.setInterval(() => setClock(Date.now()), TICK);
    return () => window.clearInterval(t);
  }, [anyUndo]);
  const done = today.filter((t) => t.status === "done");
  const dayCount = waiting.length + done.filter((t) => !t.reversal).length;
  const dayShare = waiting.reduce((n, p) => n + (p.shareCents ?? 0), 0) + done.reduce((n, t) => n + t.commissionCents, 0);

  return (
    <main className="adm-page bx-sell">
      <div className="adm-page-head">
        <h1 className="adm-h1">{S.title}</h1>
        {demo && <span className="adm-tag lime">{S.demoShop}</span>}
      </div>

      {msg && (
        <p className={msg.kind === "ok" ? "adm-ok bx-sell-msg" : msg.kind === "wait" ? "bx-sell-msg is-wait" : "adm-err bx-sell-msg"} role="status">
          {msg.text}
        </p>
      )}

      {pick ? (
        <section className="bx-sec">
          <button type="button" className="bx-lnk" style={{ alignSelf: "flex-start" }} onClick={() => setPick(null)}>
            <Ic name="left" size={16} />
            {S.change}
          </button>
          <div className="adm-card bx-pick">
            <div className="bx-pick-head">
              <Thumb src={pick.photo} />
              <div className="txt">
                <b>{pick.title}</b>
                {pick.stock != null && <span className={`bx-tag${pick.stock > 0 ? " ok" : ""}`}>{S.stock(pick.stock)}</span>}
              </div>
            </div>
            {/* «Клиенту | Себе» next to the price it changes */}
            <div className="adm-field">
              <span>{S.to}</span>
              <div className="bx-seg" role="group" aria-label={S.to}>
                <button type="button" aria-pressed={mode === "client"} onClick={() => setMode("client")}>
                  {S.client}
                </button>
                <button type="button" aria-pressed={mode === "self"} onClick={() => setMode("self")}>
                  {S.self}
                </button>
              </div>
            </div>
            {unit == null ? (
              <p className="adm-err">{S.noPurchaseHint}</p>
            ) : (
              <>
                {mode === "self" && pick.selfNoPurchase && <p className="adm-err">{S.noPurchaseZero}</p>}
                <div className="bx-qty">
                  <span>{S.qty}</span>
                  <div className="bx-stepper" role="group" aria-label={S.qty}>
                    <button type="button" aria-label={S.less} disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
                      <Ic name="minus" size={20} />
                    </button>
                    <output aria-live="polite">{qty}</output>
                    <button type="button" aria-label={S.more} disabled={qty >= maxQty} onClick={() => setQty(qty + 1)}>
                      <Ic name="plus" size={20} />
                    </button>
                  </div>
                </div>
                <dl className="bx-pay">
                  <dt>{mode === "client" ? S.clientPays(qty, euroText(unit)) : S.selfPays(qty, euroText(unit))}</dt>
                  <dd>{euroText(unit * qty)}</dd>
                  {mode === "client" && (
                    <>
                      <dt>{S.share(pct)}</dt>
                      <dd className="is-ok">{euroText(share)}</dd>
                    </>
                  )}
                </dl>
              </>
            )}
          </div>
          <p className="bx-tip">{S.selfHint(pct)}</p>
        </section>
      ) : (
        <section className="bx-sell-find">
          <button type="button" className="adm-btn adm-btn-lime bx-big" onClick={() => setScan(true)}>
            <Ic name="scan" size={22} />
            {S.scan}
          </button>
          <div className="bx-sell-q">
            <label className="bx-srch">
              <span className="sr">{S.search}</span>
              <Ic name="search" size={16} />
              <input
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder={S.searchHint}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (e.target.value.trim().length < 2) {
                    seq.current++;
                    setFound([]);
                    setLook("idle");
                  }
                }}
              />
            </label>
            <button type="button" className="adm-btn adm-btn-line" onClick={() => file.current?.click()}>
              <Ic name="cam" size={18} />
              {S.photo}
            </button>
          </div>
          {/* capture: the phone opens its back camera at once, not the gallery (Dim, 18.11) */}
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          <p className="bx-tip bx-sell-tip">
            <span>{S.photoHint}</span>
            {/* a picture taken before, or a screenshot of the product */}
            <button type="button" className="bx-lnk sm" onClick={() => gallery.current?.click()}>
              {S.gallery}
            </button>
          </p>
          <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          {look !== "idle" && (
            <p className={look === "shop_down" || look === "not_found" || look === "photo_none" ? "adm-err" : "adm-meta"} role="status">
              {look === "looking" && S.looking}
              {look === "photo" && S.photoLooking}
              {look === "photo_pick" && S.photoPick}
              {look === "empty" && S.nothing}
              {look === "not_found" && S.notFound}
              {look === "photo_none" && S.photoNone}
              {look === "shop_down" && S.shopDown}
            </p>
          )}
          {found.length > 0 && (
            <ul className="bx-box bx-rows">
              {found.map((p) => {
                const u = unitOf(p, mode);
                return (
                  <li key={`${p.productId}:${p.variant}`}>
                    <button type="button" className="bx-row" onClick={() => choose(p)}>
                      <Thumb src={p.photo} />
                      <span className="txt">
                        <span className="plain">{p.title}</span>
                        <small>{u == null ? S.noPurchase : mode === "self" && p.selfNoPurchase ? S.noPurchaseZero : p.stock == null ? "" : S.stock(p.stock)}</small>
                      </span>
                      <span className="end price">{u == null ? "—" : euroText(u)}</span>
                      <span className="bx-chev">
                        <Ic name="right" size={18} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="bx-sec">
        <div className="bx-sec-head">
          <h2 className="bx-ch">{S.today}</h2>
          <Link href="/b/money" className="bx-lnk" prefetch={false}>
            {S.toMoney}
            <Ic name="right" size={16} />
          </Link>
        </div>
        {today.length === 0 && waiting.length === 0 ? (
          <p className="adm-meta">{S.noneToday}</p>
        ) : (
          <ul className="bx-box">
            {waiting.map((p) => (
              <li key={p.ref} className="bx-sale">
                <span className="txt">
                  <span className="plain">
                    {p.name} × {p.qty}
                  </span>
                  <small>
                    {B.money.mode[p.mode]}
                    {p.mode === "client" && p.shareCents ? ` · ${S.yours(pct, euroText(p.shareCents))}` : p.mode === "self" ? ` · ${S.selfAt}` : ""}
                  </small>
                  {/* kept on this phone, not lost: amber, not red */}
                  <span className="bx-tag amb">
                    <Ic name="clock" size={12} />
                    {S.waiting}
                  </span>
                </span>
                <span className="end">{euroText(p.totalCents)}</span>
              </li>
            ))}
            {today.map((t) => {
              const can = canUndo(t);
              return (
                <li key={t.ref} className={`bx-sale${t.status === "undone" ? " is-off" : ""}`}>
                  <span className="txt">
                    <span className="plain">
                      {t.name} × {t.qty}
                    </span>
                    <small>
                      {B.money.mode[t.mode] ?? t.mode}
                      {t.commissionCents ? ` · ${S.yours(pct, euroText(t.commissionCents))}` : t.mode === "self" ? ` · ${S.selfAt}` : ""}
                      {t.noPurchase ? ` · ${S.noPurchaseZero}` : ""}
                      {t.sync === "test" ? ` · ${S.testSale}` : ""}
                      {t.status === "undone" ? ` · ${S.undone}` : ""}
                    </small>
                    {can && (
                      <span className="bx-undo">
                        <button type="button" className="adm-btn adm-btn-ghost bx-xs" onClick={() => void undo(t.ref)}>
                          {S.undo}
                        </button>
                        {/* the end of the window on the salon's clock: true however long the page stays open */}
                        <span>{S.undoTill(hm(undoEnd(t), tz))}</span>
                      </span>
                    )}
                  </span>
                  <span className="end">{euroText(t.totalCents)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {dayCount > 0 && (
          <div className="bx-sell-foot">
            <span>{S.count(dayCount)}</span>
            <span>
              {S.dayShare(pct)}: <b>{euroText(dayShare)}</b>
            </span>
          </div>
        )}
      </section>

      {pick && unit != null && (
        <div className="bx-sell-bar">
          <button type="button" className="adm-btn adm-btn-lime bx-big" disabled={busy} onClick={() => void sell()}>
            {mode === "client" ? S.sellFor(euroText(unit * qty)) : S.takeFor(euroText(unit * qty))}
          </button>
        </div>
      )}

      {scan && <Scanner onCode={(c) => void onCode(c)} onClose={() => setScan(false)} />}
    </main>
  );
}

function Thumb({ src }: { src: string | null }) {
  // the shop's own picture (https only, checked in src/lib/shop.ts); none in the fake shop
  return src ? (
    <img className="bx-thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="bx-thumb bx-thumb-none" aria-hidden="true">
      <Ic name="bag" size={20} />
    </span>
  );
}
