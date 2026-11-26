"use client";

/**
 * A client address that leads nowhere: /{locale}/<anything we do not have>
 * ([...missing]/page.tsx), /<anything>, which the proxy sends to
 * /ru/<anything>, or a notFound() in a client page. The booking's head and
 * one way on, to the booking, in the address's language. A client
 * component only to read that language: not-found gets no params.
 */
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand";
import { COPY as I18N, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { SALON_FALLBACK } from "@/lib/salon-fallback";

const COPY: Record<Locale, { title: string; lead: string; book: string; lang: string }> = {
  ru: { title: "Такой страницы нет", lead: "Возможно, ссылка устарела или в ней опечатка.", book: "Записаться", lang: "Язык" },
  et: { title: "Sellist lehte pole", lead: "Võib-olla on link vananenud või selles on trükiviga.", book: "Broneeri aeg", lang: "Keel" },
  en: { title: "There is no such page", lead: "The link may be old or mistyped.", book: "Book a visit", lang: "Language" },
};
// a client component can't read «Настройки → Контакты»: the salon's main number from salon-fallback.ts
const TEL = SALON_FALLBACK.tel;

export default function NotFound() {
  const first = usePathname()?.split("/")[1] ?? "";
  const locale: Locale = isLocale(first) ? first : "ru";
  const c = COPY[locale];
  return (
    <main className="app ground">
      <title>{`${c.title} · REMPIRE`}</title>
      <header className="hd plain">
        <span className="hd-gap" />
        <LogoMark />
        <a className="hd-co" href={`/${locale}`}>
          <b>REMPIRE</b>
        </a>
        <nav className="langs" aria-label={c.lang}>
          {LOCALES.map((l) => (
            <a key={l} className="rbtn" href={`/${l}`} aria-current={l === locale ? "true" : undefined}>
              {l.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>
      <div className="blk top">
        <h1 className="h1">{c.title}</h1>
        <p className="lead">{c.lead}</p>
        <a className="btn btn-primary" href={`/${locale}`}>
          {c.book}
        </a>
        <a className="btn btn-soft" href={`tel:${TEL}`}>
          {I18N[locale].callSalon}
        </a>
      </div>
    </main>
  );
}
