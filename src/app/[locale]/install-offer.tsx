"use client";

/**
 * The install offer on the confirmation screen (docs/apps.md). Only after a
 * booking is made, only on a phone, never inside the installed app, and
 * never again once the client said «Не сейчас».
 *
 * Android: Chrome's own prompt behind one button, when Chrome offers it;
 * else one line about the browser's menu. iPhone: Safari has no prompt, so
 * the two Share steps. The prompt is caught as soon as the page's code
 * loads (use-install.ts), which also keeps Chrome's own banner away until
 * this screen.
 */
import { useEffect, useState } from "react";
import { useInstall } from "@/app/b/use-install";
import type { Copy } from "@/lib/i18n";

const KEY = "rempire-booking:install-hidden";

export function InstallOffer({ c }: { c: Copy["install"] }) {
  const { platform, standalone, prompt, install } = useInstall();
  // hidden until this device's own answer is known
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false); // private mode: offer it
    }
  }, []);
  if (hidden || standalone || platform === "other") return null;
  const later = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* fine */
    }
    setHidden(true);
  };
  return (
    <section className="install" aria-label={c.title}>
      <h2 className="label">{c.title}</h2>
      <p>{c.lead}</p>
      {prompt ? (
        <button type="button" className="btn btn-line" onClick={install}>
          {c.add}
        </button>
      ) : platform === "ios" ? (
        <ol>
          {c.ios.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : (
        <p>{c.android}</p>
      )}
      <button type="button" className="install-later" onClick={later}>
        {c.later}
      </button>
    </section>
  );
}
