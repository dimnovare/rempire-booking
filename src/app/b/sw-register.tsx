"use client";

/**
 * Registers the barber app's service worker (public/b/sw.js), scope /b.
 * The worker is served with «Service-Worker-Allowed: /b» (next.config.ts),
 * so it controls /b itself and not only what is under /b/.
 * updateViaCache: "none" makes the browser check the worker file on every
 * start, so a fix reaches every phone on its next open.
 */
import { useEffect } from "react";

// in `next dev` the worker caches nothing (public/b/sw.js)
export const SW_URL = process.env.NODE_ENV === "production" ? "/b/sw.js" : "/b/sw.js?dev=1";
export const SW_SCOPE = "/b";

export function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" }).catch(() => null);
}

export function SwRegister() {
  useEffect(() => {
    void swRegistration();
  }, []);
  return null;
}
