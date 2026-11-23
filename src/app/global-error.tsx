"use client";

/**
 * The last net: an error in a root layout itself (the client booking, the
 * admin or the barber app). It draws its own document, so its styles are
 * inline. The language is read from the address (/ru, /et, /en); the staff
 * pages and anything else get all three lines. The salon's phone is fixed
 * here (src/lib/salon-fallback.ts): the live one is in the database.
 */
import { useEffect, useState } from "react";
import { SALON_FALLBACK } from "@/lib/salon-fallback";

type Lang = "ru" | "et" | "en";

const COPY: Record<Lang, { title: string; lead: string; call: string; retry: string }> = {
  ru: { title: "Страница сейчас не открывается", lead: "Мы уже знаем и чиним. Записаться можно по телефону.", call: "Позвонить", retry: "Попробовать ещё раз" },
  et: { title: "Leht ei avane praegu", lead: "Teame sellest ja parandame. Aja saab broneerida telefoni teel.", call: "Helista", retry: "Proovi uuesti" },
  en: { title: "This page isn’t opening right now", lead: "We know and are fixing it. You can book by phone.", call: "Call", retry: "Try again" },
};

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const [langs, setLangs] = useState<Lang[]>(["ru", "et", "en"]);
  useEffect(() => {
    const first = window.location.pathname.split("/")[1];
    if (first === "ru" || first === "et" || first === "en") setLangs([first]);
    console.error("global error", error instanceof Error ? (error as Error & { digest?: string }).digest ?? error.message : error);
  }, [error]);
  const one = COPY[langs[0]];
  return (
    <html lang={langs.length === 1 ? langs[0] : "ru"}>
      <body style={{ margin: 0, background: "#f2f2f2", color: "#262626", fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <title>REMPIRE</title>
        <main role="alert" style={{ maxWidth: 600, margin: "0 auto", minHeight: "100dvh", background: "#fff", padding: "32px 16px", boxSizing: "border-box", display: "grid", alignContent: "start", gap: 16 }}>
          <strong style={{ fontSize: 18, letterSpacing: "0.08em" }}>{SALON_FALLBACK.name}</strong>
          {langs.map((l) => (
            <section key={l} lang={l} style={{ display: "grid", gap: 6 }}>
              <h1 style={{ margin: 0, fontWeight: 700, fontSize: 22, lineHeight: "28px" }}>{COPY[l].title}</h1>
              <p style={{ margin: 0, color: "#525252", lineHeight: "22px" }}>{COPY[l].lead}</p>
            </section>
          ))}
          <a
            href={`tel:${SALON_FALLBACK.tel}`}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 50, borderRadius: 16, background: "#060f07", color: "#fff", textDecoration: "none", fontSize: 16 }}
          >
            {one.call} {SALON_FALLBACK.phone}
          </a>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 50, borderRadius: 16, border: 0, background: "rgba(6,15,7,.07)", color: "#262626", fontSize: 16, cursor: "pointer" }}
          >
            {one.retry}
          </button>
          <p style={{ margin: 0, color: "#525252" }}>{SALON_FALLBACK.address}</p>
        </main>
      </body>
    </html>
  );
}
