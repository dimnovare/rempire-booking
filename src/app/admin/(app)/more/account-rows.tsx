"use client";

/**
 * Two rows of «Аккаунт» on a phone's «Ещё» that do something right here:
 * «Язык» opens the three languages in a sheet, «Выйти» ends this device's
 * session. Until 19.11.2026 «Выйти» sat in the top bar.
 */
import { useState, useTransition } from "react";
import { LangSwitch, useA } from "../../lang";
import { logoutDevice, setMyLang } from "../account/actions";
import { Sheet } from "../sheet";

/** «Язык · Русский»: the login's own language, on every device it signs in on. */
export function LangRow({ current }: { current: string }) {
  const A = useA();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="mo-row" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <b>{A.more.language}</b>
        <small>{current}</small>
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
 * «Выйти»: ends this device's session, turns off its push (no client's name
 * reaches a phone that left the app) and forgets the pages the app kept for
 * offline use, as «Выйти» in the barber app does
 * (src/app/b/(app)/more/controls.tsx).
 */
export function LogoutRow() {
  const A = useA();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="mo-row"
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
      <b>{A.more.logout}</b>
    </button>
  );
}
