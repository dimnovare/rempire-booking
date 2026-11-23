"use client";

/**
 * The staff app's error page (admin and barber app, src/app/admin/error.tsx,
 * src/app/b/error.tsx): plain words and «try again», in the login's language
 * as the layout set it on <html lang>. Inline styles: it must draw even when
 * the page around it did not load. No error text: it can carry server
 * details; the digest matches the server log.
 */
import { useEffect, useState } from "react";

type Lang = "ru" | "et" | "en";

const COPY: Record<Lang, { title: string; lead: string; retry: string; home: string }> = {
  ru: {
    title: "Страница не открылась",
    lead: "Обычно помогает «Попробовать ещё раз». Если нет — подождите минуту: мы уже получили сигнал.",
    retry: "Попробовать ещё раз",
    home: "На главную",
  },
  et: {
    title: "Leht ei avanenud",
    lead: "Tavaliselt aitab «Proovi uuesti». Kui ei, oota minut: teade on meil juba olemas.",
    retry: "Proovi uuesti",
    home: "Avalehele",
  },
  en: {
    title: "The page didn’t open",
    lead: "«Try again» usually helps. If not, give it a minute: we already have the alert.",
    retry: "Try again",
    home: "Home",
  },
};

export function StaffError({ error, retry, home }: { error: unknown; retry: () => void; home: string }) {
  const [lang, setLang] = useState<Lang>("ru");
  useEffect(() => {
    const l = document.documentElement.lang;
    if (l === "et" || l === "en") setLang(l);
    console.error("staff app error", error instanceof Error ? (error as Error & { digest?: string }).digest ?? error.message : error);
  }, [error]);
  const c = COPY[lang];
  const btn = { minHeight: 44, padding: "0 16px", borderRadius: 8, font: "500 15px/20px var(--font-body, Inter, system-ui, sans-serif)", cursor: "pointer" } as const;
  return (
    <main role="alert" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, background: "#f7f9fc", color: "#2b3134", fontFamily: "var(--font-body, Inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 420, width: "100%", background: "#fff", border: "1px solid #e0e3eb", borderRadius: 12, padding: 20, display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0, fontWeight: 600, fontSize: 20, lineHeight: "26px" }}>{c.title}</h1>
        <p style={{ margin: 0, color: "#676a6c", fontSize: 15, lineHeight: "22px" }}>{c.lead}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => retry()} style={{ ...btn, border: 0, background: "#ffcb00", color: "#2b3134" }}>
            {c.retry}
          </button>
          <a href={home} style={{ ...btn, display: "inline-flex", alignItems: "center", border: "1px solid #e0e3eb", background: "#fff", color: "#2b3134", textDecoration: "none" }}>
            {c.home}
          </a>
        </div>
      </div>
    </main>
  );
}
