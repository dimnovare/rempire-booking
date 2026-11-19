import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LogoMark } from "@/components/brand";
import { currentBusiness } from "@/lib/business";
import { loadCatalog } from "@/lib/catalog";
import { clientPushOffered } from "@/lib/client-push";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { COPY, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { pushPublicKey } from "@/lib/push";
import { BookingFlow } from "./booking-flow";

export default async function Page({ params, searchParams }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense fallback={<Shell locale={locale} text={COPY[locale].loading} />}>
      <Booking locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

/** The mark, the languages and one line: while loading, or before there is a database. */
function Shell({ locale, text }: { locale: Locale; text: string }) {
  return (
    <main className="app">
      <header className="hd plain">
        <span className="hd-gap" />
        <LogoMark />
        <span className="hd-co">
          <b>REMPIRE</b>
        </span>
        <nav className="langs" aria-label="Language">
          {LOCALES.map((l) => (
            <a key={l} className="rbtn" href={`/${l}`} aria-current={l === locale ? "true" : undefined}>
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

async function Booking({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]">["searchParams"] }) {
  // every request reads today's barbers and prices
  await connection();
  if (!dbConfigured()) return <Shell locale={locale} text={COPY[locale].noDb} />;
  const business = await currentBusiness();
  if (!business) return <Shell locale={locale} text={COPY[locale].noDb} />;
  const [catalog, sp] = await Promise.all([loadCatalog(query, business.id), searchParams]);
  return (
    <BookingFlow
      locale={locale}
      catalog={catalog}
      tz={business.timezone}
      horizonDays={business.settings.horizon_days}
      cutoffHours={Math.round(business.settings.cancel_cutoff_min / 60)}
      reminderMin={business.settings.reminder_min}
      demo={dbKind() === "pglite"}
      pushKey={clientPushOffered(business.settings) ? pushPublicKey() : ""}
      // ?b=<slug>: a «book now» button under one barber's photo opens with him picked
      initialBarber={typeof sp.b === "string" ? sp.b : null}
    />
  );
}
