"use client";

/**
 * The admin's language on the client: the root layout reads it once per
 * request (lang-server.ts) and hands it down here; every client component
 * takes its words with useA().
 */
import { createContext, useContext, useEffect, useTransition } from "react";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";
import { COPY, LANG_NAMES, type Copy } from "./copy";

const Lang = createContext<Locale>(DEFAULT_LOCALE);

export function LangProvider({ lang, children }: { lang: Locale; children: React.ReactNode }) {
  // <html lang> is in the static shell; the real language is known a moment later
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Lang.Provider value={lang}>{children}</Lang.Provider>;
}

export function useA(): Copy {
  return COPY[useContext(Lang)];
}

/** «Загрузка…» for a Suspense fallback in a server page. */
export function Wait() {
  return <p className="adm-wait">{useA().loading}</p>;
}

/**
 * The browser tab's title: the section, in the admin's language. A real
 * <title> (React puts it in <head>), not document.title in an effect: Next
 * redraws the head after every server action and an effect's title was lost.
 * The layout sets no title of its own, so this is the only one.
 */
export function Title({ text }: { text: string }) {
  return text ? <title>{`${text} · REMPIRE`}</title> : null;
}

/**
 * Русский · Eesti · English: each under its own name, so a barber who cannot
 * read the current language still finds theirs. `pick` is a server action
 * that keeps the choice and redraws the page.
 */
export function LangSwitch({ pick }: { pick: (lang: Locale) => Promise<void> }) {
  const A = useA();
  const [busy, start] = useTransition();
  return (
    <div className="adm-seg adm-seg-wide adm-lang" role="group" aria-label={A.langLabel}>
      {LOCALES.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={A.lang === l} disabled={busy} onClick={() => A.lang !== l && start(() => pick(l))}>
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
