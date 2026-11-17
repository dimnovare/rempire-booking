"use client";

/**
 * The barber app's language on the client: the layout reads it once per
 * request (lang-server.ts) and hands it down; every client component takes
 * its words with useB().
 */
import { createContext, useContext, useEffect } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { COPY, type Copy } from "./copy";

const Lang = createContext<Locale>(DEFAULT_LOCALE);

export function LangProvider({ lang, children }: { lang: Locale; children: React.ReactNode }) {
  // <html lang> is in the static shell; the real language is known a moment later
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Lang.Provider value={lang}>{children}</Lang.Provider>;
}

export function useB(): Copy {
  return COPY[useContext(Lang)];
}

export function useLang(): Locale {
  return useContext(Lang);
}

/** The browser tab's title, in the app's language. */
export function useTitle(title: string) {
  useEffect(() => {
    if (title) document.title = `${title} · REMPIRE`;
  }, [title]);
}
