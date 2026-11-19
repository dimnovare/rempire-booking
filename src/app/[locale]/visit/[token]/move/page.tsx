/**
 * /{locale}/visit/{token}/move: the client moves his own visit to another
 * time, as REMPIRE's Altegio lets him («Разрешить клиентам переносить записи
 * онлайн», no time limit). It is the booking flow's day and time step alone:
 * the barber and the services stay as booked (docs/client-flow.md).
 *
 * The token is the key, as on the visit page. A visit that is unknown, over
 * or cancelled goes back to its page, which says what can still be done.
 */
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { currentBusiness } from "@/lib/business";
import { loadCatalog } from "@/lib/catalog";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { canChange, findVisit } from "@/lib/visits";
import { BookingFlow } from "../../../booking-flow";

export const metadata = { title: "REMPIRE · Visit", referrer: "no-referrer" as const };

// The token is known only at request time, so nothing here awaits params
// outside the Suspense boundary.
export default function MovePage({ params }: PageProps<"/[locale]/visit/[token]/move">) {
  return (
    <Suspense
      fallback={
        <main className="app">
          <p className="wait" />
        </main>
      }
    >
      <Move params={params} />
    </Suspense>
  );
}

async function Move({ params }: { params: PageProps<"/[locale]/visit/[token]/move">["params"] }) {
  await connection();
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const url = `/${locale}/visit/${encodeURIComponent(token)}`;
  const business = dbConfigured() ? await currentBusiness() : null;
  if (!business) redirect(url);
  const [v, catalog] = await Promise.all([findVisit(query, business.id, token), loadCatalog(query, business.id)]);
  // his barber must still be bookable online, or there is no time to offer
  if (!v || !canChange(v, business) || !catalog.staff.some((s) => s.id === v.staffId)) redirect(url);
  return (
    <BookingFlow
      locale={locale}
      catalog={catalog}
      tz={business.timezone}
      horizonDays={business.settings.horizon_days}
      cutoffHours={Math.round(business.settings.cancel_cutoff_min / 60)}
      reminderMin={business.settings.reminder_min}
      demo={dbKind() === "pglite"}
      pushKey=""
      initialBarber={null}
      moving={{ token, staffId: v.staffId, services: v.services.map((s) => s.serviceId), start: Date.parse(v.startsAt), url }}
    />
  );
}
