"use client";

/**
 * One screen: iPhone (Share → «На экран „Домой“») and Android (the browser's
 * own «Install» prompt when it offers one, else the menu). The phone's own
 * system comes first; an installed app says so and offers to go in.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useB, useTitle } from "../lang";
import { useInstall } from "../use-install";

export function InstallGuide() {
  const B = useB();
  const I = B.install;
  useTitle(I.title);
  const { platform, standalone, prompt, install } = useInstall();
  const [first, setFirst] = useState<"ios" | "android">("ios");
  useEffect(() => {
    if (platform === "android") setFirst("android");
  }, [platform]);

  const ios = (
    <section className="bx-steps" key="ios">
      <h2 className="adm-h2">{I.iphone}</h2>
      <ol>
        {I.iphoneSteps.map((s, i) => (
          <li key={i}>
            {i === 1 && <ShareIcon />}
            {s}
          </li>
        ))}
      </ol>
      <p className="adm-note">{I.iphoneNote}</p>
    </section>
  );
  const android = (
    <section className="bx-steps" key="android">
      <h2 className="adm-h2">{I.android}</h2>
      <ol>
        {I.androidSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {prompt && (
        <button type="button" className="adm-btn adm-btn-lime" onClick={install}>
          {I.installNow}
        </button>
      )}
    </section>
  );

  return (
    <>
      <div className="bx-login-head">
        <h1 className="adm-h1">{I.title}</h1>
        <p className="adm-meta">{I.lead}</p>
      </div>
      {standalone ? (
        <p className="adm-ok">{I.done}</p>
      ) : first === "android" ? (
        [android, ios]
      ) : (
        [ios, android]
      )}
      <Link href="/b" className="adm-btn adm-btn-ghost" prefetch={false}>
        {I.toApp}
      </Link>
    </>
  );
}

/** iOS's Share mark: a square with an arrow up. */
export function ShareIcon() {
  return (
    <svg className="bx-share" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
      <path d="M8 10H5v11h14V10h-3" />
    </svg>
  );
}
