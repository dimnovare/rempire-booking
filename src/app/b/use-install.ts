"use client";

/**
 * Where the app runs: iPhone or Android, in the browser or installed
 * (display-mode standalone), and Chrome's own install prompt when it offers
 * one (beforeinstallprompt, Android). Safari has no prompt: the guide shows
 * the Share steps instead.
 */
import { useCallback, useEffect, useState } from "react";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export type Platform = "ios" | "android" | "other";

// Chrome fires the event once, early, maybe before this page's code runs: keep it
let saved: Prompt | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    saved = e as Prompt;
  });
}

export function detectPlatform(ua: string, touchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS says «Macintosh» but has touch
  if (/Macintosh/.test(ua) && touchPoints > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function useInstall() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [standalone, setStandalone] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setStandalone(isStandalone());
    setPrompt(saved);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      saved = e as Prompt;
      setPrompt(saved);
    };
    const onInstalled = () => {
      saved = null;
      setPrompt(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = useCallback(async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    saved = null;
    setPrompt(null);
  }, [prompt]);
  return { platform, standalone, prompt, install };
}
