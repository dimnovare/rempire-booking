import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Questrial } from "next/font/google";
import { notFound } from "next/navigation";
import { isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { robotsMeta } from "@/lib/indexing";
import { OG_CARDS, OG_SIZE } from "@/lib/og-cards";
import { siteUrl } from "@/lib/site";
import "../globals.css";

// rempire.ee's faces: Akrobat ExtraBold for headings, Questrial for text.
// Both are served from this app's own domain (docs/brand.md).
const display = localFont({
  src: "../fonts/akrobat-extrabold.woff",
  weight: "800",
  display: "swap",
  variable: "--font-display",
  fallback: ["Arial Narrow", "sans-serif"],
});
const body = Questrial({ weight: "400", subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-body" });

// Title, description and the link-preview card (/api/og/<locale>) per language.
const META: Record<Locale, { title: string; description: string; og: string }> = {
  ru: { title: "REMPIRE · Онлайн-запись", description: "Барбершоп REMPIRE, Mardi 1, Таллин. Выберите барбера, услугу и время.", og: "ru_RU" },
  et: { title: "REMPIRE · Broneeri aeg", description: "REMPIRE barbershop, Mardi 1, Tallinn. Vali barber, teenus ja aeg.", og: "et_EE" },
  en: { title: "REMPIRE · Book a visit", description: "REMPIRE barbershop, Mardi 1, Tallinn. Pick a barber, a service and a time.", og: "en_GB" },
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ru";
  const m = META[locale];
  return {
    metadataBase: siteUrl(),
    title: m.title,
    description: m.description,
    robots: robotsMeta(),
    openGraph: {
      title: m.title,
      description: m.description,
      siteName: "REMPIRE",
      locale: m.og,
      type: "website",
      url: `/${locale}`,
      images: [{ url: `/api/og/${locale}`, ...OG_SIZE, alt: OG_CARDS[locale].alt, type: "image/png" }],
    },
    twitter: { card: "summary_large_image", images: [`/api/og/${locale}`] },
  };
}

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
