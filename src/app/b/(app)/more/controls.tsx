"use client";

import { useTransition } from "react";
import { LOCALES, type Locale } from "@/lib/i18n";
import { OutIcon } from "../../../admin/icons";
import { LANG_NAMES } from "../../copy";
import { useB } from "../../lang";
import { swRegistration } from "../../sw-register";
import { logout, setLanguage } from "../actions";

/** Русский · Eesti · English, each under its own name. */
export function LangSwitch({ current }: { current: Locale }) {
  const B = useB();
  const [busy, start] = useTransition();
  return (
    <div className="adm-seg adm-seg-wide" role="group" aria-label={B.more.language}>
      {LOCALES.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={current === l} disabled={busy} onClick={() => current !== l && start(() => setLanguage(l))}>
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}

/**
 * «Выйти»: ends this phone's session, turns off its push (no client's name
 * reaches a phone that left the app) and forgets the pages the app kept for
 * offline use.
 */
export function LogoutButton() {
  const B = useB();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="adm-btn adm-btn-ghost"
      disabled={busy}
      onClick={() =>
        start(async () => {
          let endpoint: string | null = null;
          try {
            const sub = await (await swRegistration())?.pushManager?.getSubscription();
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
          await logout(endpoint);
        })
      }
    >
      <OutIcon />
      {B.more.logout}
    </button>
  );
}
