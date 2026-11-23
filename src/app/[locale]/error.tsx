"use client";

/**
 * When the booking can't load (the database or a service is down): the
 * client is never left with a bare error. He gets the salon's phone, to
 * book by a call, and a button to try again (docs/launch.md, B7). The
 * numbers are fixed here (src/lib/salon-fallback.ts): the live ones are in
 * the database that just failed.
 */
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { LogoMark } from "@/components/brand";
import { isLocale, type Locale } from "@/lib/i18n";
import { SALON_FALLBACK } from "@/lib/salon-fallback";

const COPY: Record<Locale, { title: string; lead: string; call: string; retry: string; where: string }> = {
  ru: {
    title: "Онлайн-запись сейчас не открывается",
    lead: "Мы уже знаем и чиним. Позвоните нам: запишем по телефону.",
    call: "Позвонить",
    retry: "Попробовать ещё раз",
    where: "Барбершоп REMPIRE",
  },
  et: {
    title: "Veebibroneering ei avane praegu",
    lead: "Teame sellest ja parandame. Helista meile, broneerime aja telefoni teel.",
    call: "Helista",
    retry: "Proovi uuesti",
    where: "REMPIRE barbershop",
  },
  en: {
    title: "Online booking isn’t opening right now",
    lead: "We know and are fixing it. Call us and we’ll book you by phone.",
    call: "Call",
    retry: "Try again",
    where: "REMPIRE barbershop",
  },
};

export default function BookingError({ error, retry }: { error: unknown; retry: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = params?.locale && isLocale(params.locale) ? params.locale : "ru";
  const c = COPY[locale];
  useEffect(() => {
    // the digest matches the server's log line; nothing else leaves the server
    console.error("booking error", error instanceof Error ? (error as Error & { digest?: string }).digest ?? error.message : error);
  }, [error]);
  return (
    <main className="app" role="alert">
      <header className="hd plain">
        <span className="hd-gap" />
        <LogoMark />
      </header>
      <div className="stack">
        <h1 className="h1">{c.title}</h1>
        <p className="lead">{c.lead}</p>
        <div className="btns">
          <a className="btn btn-primary" href={`tel:${SALON_FALLBACK.tel}`}>
            {c.call} {SALON_FALLBACK.phone}
          </a>
          <button type="button" className="btn btn-soft" onClick={() => retry()}>
            {c.retry}
          </button>
        </div>
        <p className="lead">
          {c.where}, {SALON_FALLBACK.address}
        </p>
      </div>
    </main>
  );
}
