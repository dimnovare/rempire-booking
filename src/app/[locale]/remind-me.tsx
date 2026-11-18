"use client";

/**
 * «Напомнить уведомлением» (docs/apps.md, step 4): the reminder before a
 * visit as a notification on this phone. On the confirmation screen and on
 * the visit page, and only when the salon offers it (keys set, the switch
 * not on «SMS only»: the page passes the key, or nothing).
 *
 * One tap asks the phone's permission, starts the client app's worker
 * (public/sw.js) and turns this phone on for this one visit, by the visit's
 * own link (/api/visit/<token>/push). A phone that is on already is added
 * to this visit without asking again, so a regular client taps once. An iPhone gets
 * notifications only in the installed app, so in Safari one line says so.
 */
import { useEffect, useState } from "react";
import { detectPlatform, isStandalone } from "@/app/b/use-install";
import type { Copy } from "@/lib/i18n";

const SW = "/sw.js";

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

export function RemindMe({ token, publicKey, c }: { token: string; publicKey: string; c: Copy["remind"] }) {
  const [env, setEnv] = useState<"checking" | "none" | "ios" | "ok">("checking");
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const api = `/api/visit/${token}/push`;

  useEffect(() => {
    let gone = false;
    (async () => {
      if (detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios" && !isStandalone()) return setEnv("ios");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEnv("none");
      // a phone that is on already: it is reminded of this visit too
      const reg = Notification.permission === "granted" ? await navigator.serviceWorker.getRegistration("/") : undefined;
      const sub = await reg?.pushManager.getSubscription();
      const ok = sub
        ? await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }) })
            .then((r) => r.ok)
            .catch(() => false)
        : false;
      if (!gone) {
        setOn(ok);
        setEnv("ok");
      }
    })().catch(() => !gone && setEnv("none"));
    return () => {
      gone = true;
    };
  }, [api]);

  if (env === "checking" || env === "none") return null;
  if (env === "ios") {
    return (
      <section className="remind">
        <p>{c.iosFirst}</p>
      </section>
    );
  }

  const enable = async () => {
    setBusy(true);
    setNote("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setNote(c.denied);
      await navigator.serviceWorker.register(SW, { scope: "/", updateViaCache: "none" });
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.ready);
      // the worker must be running before the phone can subscribe
      if (!reg.active) await new Promise<void>((done) => {
        const w = reg.installing ?? reg.waiting;
        if (!w) return done();
        w.addEventListener("statechange", () => w.state === "activated" && done());
        setTimeout(done, 5000);
      });
      const key = keyBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      // made with other keys (they were replaced): start again
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }) });
      if (r.ok) setOn(true);
      else setNote(c.failed);
    } catch {
      setNote(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote("");
    try {
      const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      if (sub) {
        await fetch(api, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setOn(false);
    } catch {
      setNote(c.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="remind" aria-label={c.title}>
      {on ? (
        <>
          <p className="remind-on">{c.on}</p>
          <button type="button" className="install-later" disabled={busy} onClick={disable}>
            {c.off}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-line" disabled={busy} onClick={enable}>
            {c.ask}
          </button>
          <p>{c.lead}</p>
        </>
      )}
      {note && (
        <p className="remind-err" role="alert">
          {note}
        </p>
      )}
    </section>
  );
}
