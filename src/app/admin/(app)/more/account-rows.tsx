"use client";

/**
 * The rows of «Мой вход» on a phone's «Ещё» that do something right here,
 * and the way out under them: «Пуш на этом телефоне» says whether this
 * phone gets pushes, «Язык» opens the three languages in a sheet, «Выйти на
 * этом телефоне» ends this device's session (apart, in red: design
 * artifact 53PfD3DxCRkbDyjwLVvBHB, 25.11.2026).
 */
import { useEffect, useState, useTransition } from "react";
import { LangSwitch, useA } from "../../lang";
import { OutIcon } from "../../icons";
import { logoutDevice, setMyLang } from "../account/actions";
import { Sheet } from "../sheet";

/** «Язык · Русский»: the login's own language, on every device it signs in on. */
export function LangRow({ current }: { current: string }) {
  const A = useA();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="mo-row" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="tx">
          <b>{A.more.language}</b>
        </span>
        <small className="mo-val">{current}</small>
      </button>
      {open && (
        <Sheet title={A.more.language} onClose={() => setOpen(false)}>
          <LangSwitch
            pick={async (lang) => {
              await setMyLang(lang);
              setOpen(false);
            }}
          />
        </Sheet>
      )}
    </>
  );
}

/**
 * «Пуш на этом телефоне»: this device's pushes and the install guide live in
 * the barber app's half (/b/more). The line under it says what this
 * browser allows, once the page runs here.
 */
export function PushRow() {
  const M = useA().more;
  const [state, setState] = useState<string>(M.notifyHint);
  useEffect(() => {
    let on = true;
    (async () => {
      if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return setState(M.pushNone);
      if (Notification.permission === "denied") return setState(M.pushBlocked);
      try {
        const sub = await (await navigator.serviceWorker.getRegistration("/b"))?.pushManager?.getSubscription();
        if (on) setState(sub && Notification.permission === "granted" ? M.pushOn : M.pushOff);
      } catch {
        if (on) setState(M.pushOff);
      }
    })();
    return () => {
      on = false;
    };
  }, [M]);
  return (
    <a className="mo-row" href="/b/more">
      <span className="tx">
        <b>{M.notify}</b>
        <small>{state}</small>
      </span>
    </a>
  );
}

/**
 * «Выйти на этом телефоне»: ends this device's session, turns off its push
 * (no client's name reaches a phone that left the app) and forgets the
 * pages the app kept for offline use, as «Выйти» in the barber app does
 * (src/app/b/(app)/more/controls.tsx).
 */
export function LogoutButton() {
  const A = useA();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="mo-out"
      disabled={busy}
      onClick={() =>
        start(async () => {
          let endpoint: string | null = null;
          try {
            // the barber app's worker, if this device has it (scope /b): never registered from here
            const sub = await (await navigator.serviceWorker?.getRegistration("/b"))?.pushManager?.getSubscription();
            endpoint = sub?.endpoint ?? null;
            await sub?.unsubscribe();
          } catch {
            /* no push in this browser */
          }
          try {
            navigator.serviceWorker?.controller?.postMessage({ type: "rb:forget" });
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.startsWith("rb-pages")).map((k) => caches.delete(k)));
          } catch {
            /* no caches in this browser */
          }
          await logoutDevice(endpoint);
        })
      }
    >
      <OutIcon size={18} />
      {A.more.logout}
    </button>
  );
}
