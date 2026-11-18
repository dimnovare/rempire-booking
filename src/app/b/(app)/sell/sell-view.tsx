"use client";

/**
 * «Продать», in as few taps as a till: pick «Клиенту» or «Себе», scan (or
 * type, or take a photo), check the price and the 17 %, tap the one button.
 *
 * A sale never goes twice and is never lost on a bad connection: its `ref`
 * is made here first and kept on this phone until the server has it, and
 * the server treats the same ref as the same sale. A sale that could not be
 * sent waits here («ждёт интернета») and goes when the phone is back online.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { euroText } from "@/lib/money";
import { useB } from "../../lang";
import { barcodeAction, photoAction, searchAction, sellAction, undoAction, type Found, type SellProduct } from "./actions";
import { Scanner, shrinkPhoto } from "./scanner";

type Mode = "client" | "self";
type Today = { ref: string; name: string; qty: number; mode: string; totalCents: number; commissionCents: number; status: string; sync: string; noPurchase: boolean; at: string; reversal: boolean };
type Pending = { ref: string; productId: string; variant: string; mode: Mode; qty: number; expectCents: number; name: string; totalCents: number; at: number };
type Look = "idle" | "looking" | "photo" | "shop_down" | "empty" | "photo_none" | "not_found" | "photo_pick";

const keyOf = (staffId: string) => `rempire.sell.pending.${staffId}`;

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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scan, setScan] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [clock, setClock] = useState(now);
  const seq = useRef(0);
  const file = useRef<HTMLInputElement>(null);
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
      setClock(Date.now());
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

  const sell = async () => {
    if (!pick) return;
    const unit = unitOf(pick, mode);
    if (unit == null) return;
    const p: Pending = { ref: newRef(), productId: pick.productId, variant: pick.variant, mode, qty, expectCents: unit, name: pick.title, totalCents: unit * qty, at: Date.now() };
    const list = [...readPending(staffId), p];
    writePending(staffId, list);
    setPending(list);
    setBusy(true);
    setMsg(null);
    const r = await send(p);
    setBusy(false);
    if (r === "ok") {
      setMsg({ ok: true, text: `${mode === "client" ? S.sold : S.taken}: ${pick.title} × ${qty}` });
      setPick(null);
      return;
    }
    if (r === "keep") {
      setMsg({ ok: false, text: `${pick.title} × ${qty}: ${S.waiting}` });
      setPick(null);
      return;
    }
    setMsg({ ok: false, text: r.text });
    // a new price: the sheet shows it, and the next tap is a new sale at that price
    if (r.unitCents != null) setPick({ ...pick, ...(mode === "client" ? { clientCents: r.unitCents } : { selfCents: r.unitCents }) });
  };

  const undo = async (ref: string) => {
    const r = await undoAction(ref).catch(() => null);
    if (!r) return setMsg({ ok: false, text: B.error });
    if (!r.ok) setMsg({ ok: false, text: r.code === "too_late" ? S.tooLate : B.error });
  };

  const unit = pick ? unitOf(pick, mode) : null;
  const share = pick && mode === "client" ? Math.round(qty * pick.shareCents) : 0;
  const waiting = pending.filter((p) => !today.some((t) => t.ref === p.ref));

  return (
    <main className="adm-page bx-sell">
      <div className="adm-page-head">
        <h1 className="adm-h1">{S.title}</h1>
        {demo && <span className="adm-tag lime">{S.demoShop}</span>}
      </div>

      <div className="adm-seg adm-seg-wide" role="group" aria-label={S.title}>
        <button type="button" aria-pressed={mode === "client"} onClick={() => setMode("client")}>
          {S.client}
        </button>
        <button type="button" aria-pressed={mode === "self"} onClick={() => setMode("self")}>
          {S.self}
        </button>
      </div>

      {msg && (
        <p className={msg.ok ? "adm-ok bx-sell-msg" : "adm-err bx-sell-msg"} role="status">
          {msg.text}
        </p>
      )}

      {pick ? (
        <section className="adm-card bx-pick">
          <div className="bx-pick-head">
            <Thumb src={pick.photo} />
            <div className="txt">
              <b>{pick.title}</b>
              <small>{pick.stock == null ? "" : S.stock(pick.stock)}</small>
            </div>
          </div>
          {unit == null ? (
            <p className="adm-err">{S.noPurchaseHint}</p>
          ) : (
            <>
              {mode === "self" && pick.selfNoPurchase && <p className="adm-err">{S.noPurchaseZero}</p>}
              <div className="bx-step" role="group" aria-label={S.qty}>
                <button type="button" className="adm-ibtn" aria-label="−" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
                  −
                </button>
                <b>{qty}</b>
                <button type="button" className="adm-ibtn" aria-label="+" disabled={qty >= maxQty} onClick={() => setQty(qty + 1)}>
                  +
                </button>
              </div>
              <p className="adm-meta">
                {qty} × {euroText(unit)}
                {mode === "client" ? ` · ${S.yours(pct, euroText(share))}` : ` · ${S.selfHint}`}
              </p>
              <button type="button" className="adm-btn adm-btn-lime bx-sell-go" disabled={busy} onClick={() => void sell()}>
                {mode === "client" ? S.sellFor(euroText(unit * qty)) : S.takeFor(euroText(unit * qty))}
              </button>
            </>
          )}
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setPick(null)}>
            {S.change}
          </button>
        </section>
      ) : (
        <section className="bx-sell-find">
          <div className="adm-btns">
            <button type="button" className="adm-btn adm-btn-line adm-btn-auto" onClick={() => setScan(true)}>
              {S.scan}
            </button>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={() => file.current?.click()}>
              {S.photo}
            </button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          </div>
          <label className="adm-field">
            <span>{S.search}</span>
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
            <ul className="adm-list bx-rows">
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="adm-card">
        <div className="adm-page-head">
          <h2 className="adm-h2">{S.today}</h2>
          <Link href="/b/money" className="adm-btn adm-btn-ghost adm-btn-sm" prefetch={false}>
            {S.toMoney}
          </Link>
        </div>
        {waiting.length > 0 && <p className="adm-err">{S.pendingN(waiting.length)}</p>}
        {today.length === 0 && waiting.length === 0 ? (
          <p className="adm-meta">{S.noneToday}</p>
        ) : (
          <ul className="adm-list bx-rows">
            {waiting.map((p) => (
              <li key={p.ref} className="bx-sale">
                <span className="txt">
                  <span className="plain">
                    {p.name} × {p.qty}
                  </span>
                  <small>
                    {B.money.mode[p.mode]} · {S.waiting}
                  </small>
                </span>
                <span className="end">{euroText(p.totalCents)}</span>
              </li>
            ))}
            {today.map((t) => {
              // the page clock can be older than a sale just made: never more than the window
              const left = Math.min(undoMin, Math.ceil((Date.parse(t.at) + undoMin * 60_000 - clock) / 60_000));
              const canUndo = t.status === "done" && !t.reversal && (t.sync === "queued" || t.sync === "test") && left > 0;
              return (
                <li key={t.ref} className={`bx-sale${t.status === "undone" ? " is-off" : ""}`}>
                  <span className="txt">
                    <span className="plain">
                      {t.name} × {t.qty}
                    </span>
                    <small>
                      {B.money.mode[t.mode] ?? t.mode}
                      {t.commissionCents ? ` · ${S.yours(pct, euroText(t.commissionCents))}` : ""}
                      {t.noPurchase ? ` · ${S.noPurchaseZero}` : ""}
                      {t.sync === "test" ? ` · ${S.testSale}` : ""}
                      {t.status === "undone" ? ` · ${S.undone}` : canUndo ? ` · ${S.undoLeft(left)}` : ""}
                    </small>
                  </span>
                  <span className="end">{euroText(t.totalCents)}</span>
                  {canUndo && (
                    <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => void undo(t.ref)}>
                      {S.undo}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {scan && <Scanner onCode={(c) => void onCode(c)} onClose={() => setScan(false)} />}
    </main>
  );
}

function Thumb({ src }: { src: string | null }) {
  // the shop's own picture (https only, checked in src/lib/shop.ts); none in the fake shop
  return src ? <img className="bx-thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="bx-thumb" aria-hidden="true" />;
}
