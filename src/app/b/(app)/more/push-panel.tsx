"use client";

/**
 * «Уведомления» in «Ещё» (B5): turn push on or off for this phone, send a
 * test, and choose which kinds come. The button is never lime when the
 * server has no VAPID keys: «on» must mean something can reach the phone.
 * An iPhone gets push only in the installed app (iOS 16.4+); in Safari the
 * panel says so and points to the install guide.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useB } from "../../lang";
import { swRegistration } from "../../sw-register";
import { detectPlatform, isStandalone } from "../../use-install";
import { setPushKind, subscribePush, testPush, unsubscribePush } from "./push-actions";

type Props = { configured: boolean; publicKey: string; endpoints: string[]; kinds: { kind: string; on: boolean }[]; owner: boolean };

/** The VAPID public key (base64url) as the bytes subscribe() wants. */
function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const p = detectPlatform(ua, navigator.maxTouchPoints);
  return p === "ios" ? (/iPad/.test(ua) ? "iPad" : "iPhone") : p === "android" ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
}

export function PushPanel({ configured, publicKey, endpoints, kinds, owner }: Props) {
  const B = useB();
  const P = B.push;
  const [env, setEnv] = useState<"checking" | "unsupported" | "ios" | "ok">("checking");
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [want, setWant] = useState(() => Object.fromEntries(kinds.map((k) => [k.kind, k.on])));

  useEffect(() => {
    let gone = false;
    (async () => {
      const ios = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios";
      if (ios && !isStandalone()) return setEnv("ios");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEnv("unsupported");
      const reg = await swRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!gone) {
        setMine(sub?.endpoint ?? null);
        setEnv(reg ? "ok" : "unsupported");
      }
    })().catch(() => !gone && setEnv("unsupported"));
    return () => {
      gone = true;
    };
  }, []);

  const on = !!mine && endpoints.includes(mine);

  const enable = async () => {
    setBusy(true);
    setNote(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setNote({ text: P.denied, bad: true });
      const reg = (await swRegistration()) ?? (await navigator.serviceWorker.ready);
      const key = keyBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      // made with other keys (they were replaced): start again
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r = await subscribePush(sub.toJSON(), deviceLabel());
      if (r.ok) setMine(sub.endpoint);
      else setNote({ text: r.code === "not_configured" ? P.notConfigured : P.failed, bad: true });
    } catch {
      setNote({ text: P.failed, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!mine) return;
    setBusy(true);
    setNote(null);
    try {
      await unsubscribePush(mine);
      const sub = await (await swRegistration())?.pushManager.getSubscription();
      await sub?.unsubscribe();
      setMine(null);
    } catch {
      setNote({ text: B.error, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await testPush();
      setNote(r.sent ? { text: P.testSent } : { text: P.testNone, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (kind: string, value: boolean) => {
    setWant((w) => ({ ...w, [kind]: value }));
    if (!(await setPushKind(kind, value).catch(() => false))) {
      setWant((w) => ({ ...w, [kind]: !value }));
      setNote({ text: B.error, bad: true });
    }
  };

  return (
    <section className="adm-card bx-push" aria-labelledby="bx-push-h">
      <h2 className="adm-h2" id="bx-push-h">
        {P.title}
      </h2>
      <p className="adm-meta">{owner ? P.leadOwner : P.lead}</p>

      {!configured && <p className="bx-hint">{P.notConfigured}</p>}
      {configured && env === "ios" && (
        <p className="bx-hint">
          {P.iosInstall}{" "}
          <Link href="/b/install" prefetch={false}>
            {B.more.install}
          </Link>
        </p>
      )}
      {configured && env === "unsupported" && <p className="bx-hint">{P.unsupported}</p>}

      {on ? (
        <>
          <p className="bx-on">✓ {P.on}</p>
          <div className="adm-bar-row">
            <button type="button" className="adm-btn adm-btn-line adm-btn-auto" disabled={busy} onClick={() => void test()}>
              {P.test}
            </button>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" disabled={busy} onClick={() => void disable()}>
              {P.disable}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className={`adm-btn ${configured && env === "ok" ? "adm-btn-lime" : "adm-btn-ghost"}`}
          disabled={!configured || env !== "ok" || busy}
          onClick={() => void enable()}
        >
          {P.enable}
        </button>
      )}
      {note && (
        <p className={note.bad ? "adm-err" : "bx-on"} role="status">
          {note.text}
        </p>
      )}
      {endpoints.length > 0 && <p className="adm-meta">{P.phones(endpoints.length)}</p>}

      <fieldset className="bx-kinds">
        <legend className="adm-h2">{P.kindsTitle}</legend>
        {kinds.map((k) => (
          <label key={k.kind} className="adm-check bx-kind">
            <span>{P.kinds[k.kind] ?? k.kind}</span>
            <input type="checkbox" role="switch" checked={!!want[k.kind]} onChange={(e) => void toggle(k.kind, e.target.checked)} />
          </label>
        ))}
      </fieldset>
    </section>
  );
}
