import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { currentBusiness } from "@/lib/business";
import { loadCatalog } from "@/lib/catalog";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { COPY, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { BookingFlow } from "./booking-flow";

export default async function Page({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense fallback={<Shell locale={locale} text={COPY[locale].loading} />}>
      <Booking locale={locale} />
    </Suspense>
  );
}

/** Logo, languages and one line: while loading, or before there is a database. */
function Shell({ locale, text }: { locale: Locale; text: string }) {
  return (
    <main className="app gut">
      <header className="top">
        <Logo />
        <nav className="langs" aria-label="Language">
          {LOCALES.map((l) => (
            <a key={l} href={`/${l}`} aria-current={l === locale ? "true" : undefined}>
              {l.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>
      <p className="wait" role="status">
        {text}
      </p>
    </main>
  );
}

async function Booking({ locale }: { locale: Locale }) {
  // every request reads today's barbers and prices
  await connection();
  if (!dbConfigured()) return <Shell locale={locale} text={COPY[locale].noDb} />;
  const business = await currentBusiness();
  if (!business) return <Shell locale={locale} text={COPY[locale].noDb} />;
  const catalog = await loadCatalog(query, business.id);
  return (
    <BookingFlow
      locale={locale}
      catalog={catalog}
      tz={business.timezone}
      horizonDays={business.settings.horizon_days}
      cutoffHours={Math.round(business.settings.cancel_cutoff_min / 60)}
      demo={dbKind() === "pglite"}
    />
  );
}
