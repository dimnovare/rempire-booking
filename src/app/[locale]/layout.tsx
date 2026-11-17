import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Questrial } from "next/font/google";
import { notFound } from "next/navigation";
import { isLocale, LOCALES } from "@/lib/i18n";
import { robotsMeta } from "@/lib/indexing";
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

export const metadata: Metadata = {
  title: "REMPIRE · Booking",
  description: "Online booking for REMPIRE, Mardi 1, Tallinn.",
  robots: robotsMeta(),
};

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
