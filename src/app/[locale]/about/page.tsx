/**
 * /{locale}/about: the salon's own page, as the address the booking page
 * gives it when «REMPIRE ▾» opens it (booking-flow.tsx). Opened by this
 * address (a reload, a shared link), the booking start is under it.
 */
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { BookingPage } from "../booking-page";

export default async function Page({ params, searchParams }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BookingPage locale={locale} searchParams={searchParams} about />;
}
