import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { BookingPage } from "./booking-page";

export default async function Page({ params, searchParams }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BookingPage locale={locale} searchParams={searchParams} />;
}
