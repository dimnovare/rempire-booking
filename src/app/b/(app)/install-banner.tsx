"use client";

/** In the browser (not installed): one quiet line that leads to the install guide. Hidden for good once closed. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { XIcon } from "../../admin/icons";
import { useB } from "../lang";
import { detectPlatform, isStandalone } from "../use-install";

const KEY = "rb_install_hidden";

export function InstallBanner() {
  const B = useB();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let hidden = false;
    try {
      hidden = localStorage.getItem(KEY) === "1";
    } catch {
      /* private mode: show it */
    }
    // only on phones, where the app is meant to live
    const phone = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) !== "other";
    setShow(phone && !hidden && !isStandalone());
  }, []);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* fine */
    }
    setShow(false);
  };
  return (
    <div className="bx-banner">
      <Link href="/b/install" prefetch={false}>
        {B.install.banner}
      </Link>
      <button type="button" className="adm-ibtn" aria-label={B.close} onClick={close}>
        <XIcon size={16} />
      </button>
    </div>
  );
}
