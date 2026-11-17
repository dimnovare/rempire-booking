/**
 * Renat's questions, in Russian whatever the language in the address:
 * /ru/q/<token>. The token is the key; the page never links anywhere that
 * would pass it on.
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { OG_CARDS, OG_SIZE } from "@/lib/og-cards";
import { findForm, loadAnswers } from "@/lib/owner-qa";
import { QaForm } from "./qa-form";

export const metadata: Metadata = {
  title: "REMPIRE · Вопросы по новой системе",
  description: "6 коротких вопросов для новой системы записи REMPIRE. Ответы сохраняются сами.",
  referrer: "no-referrer",
  openGraph: {
    title: "Вопросы по новой системе записи",
    description: "6 коротких вопросов. Ответы сохраняются сами, можно вернуться и дописать.",
    siteName: "REMPIRE",
    locale: "ru_RU",
    type: "website",
    images: [{ url: "/api/og/qa", ...OG_SIZE, alt: OG_CARDS.qa.alt, type: "image/png" }],
  },
  twitter: { card: "summary_large_image", images: ["/api/og/qa"] },
};

export default function QaPage({ params }: PageProps<"/[locale]/q/[token]">) {
  return (
    <main className="app gut qa-app" lang="ru">
      <header className="top">
        <Logo />
      </header>
      <Suspense fallback={<p className="wait" />}>
        <Qa params={params} />
      </Suspense>
    </main>
  );
}

async function Qa({ params }: { params: PageProps<"/[locale]/q/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const form = dbConfigured() ? await findForm(query, token) : null;
  if (!form) {
    return (
      <div className="stack">
        <h1 className="h1">Ссылка не работает</h1>
        <p className="lead">Проверь, что ссылка скопирована целиком, или попроси у Димы новую.</p>
      </div>
    );
  }
  const answers = await loadAnswers(query, form.id);
  return (
    <>
      {dbKind() === "pglite" && <p className="demo">Пробная база в памяти: ответы пропадут при перезапуске.</p>}
      <QaForm token={token} initial={answers} />
    </>
  );
}
