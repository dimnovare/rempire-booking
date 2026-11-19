import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { robotsMeta } from "@/lib/indexing";
import { OG_CARDS, OG_SIZE } from "@/lib/og-cards";
import { siteUrl } from "@/lib/site";
import { ClientTestBanner } from "@/components/test-banner";
import "../globals.css";

// Inter, the face of the booking widget Renat's clients know (docs/brand.md,
// «Booking look»). Served from this app's own domain, Cyrillic included.
const body = Inter({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", variable: "--font-body" });

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
    // the client app (docs/apps.md): the booking site on the home screen
    manifest: `/${locale}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "REMPIRE", statusBarStyle: "default" },
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
  themeColor: "#f2f2f2",
  colorScheme: "light",
  viewportFit: "cover",
};

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={body.variable}>
      <body>
        <ClientTestBanner locale={locale} />
        {children}
      </body>
    </html>
  );
}
