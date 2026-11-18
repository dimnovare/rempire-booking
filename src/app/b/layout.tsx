/**
 * The barber app (Phase B, docs/phase-b.md): a PWA at /b on the booking
 * host, its own root layout. It wears the admin's look (admin.css, read
 * only: black, lime, square edges) plus its own barber.css. Installed to the
 * home screen it opens full screen with the tower icon (manifest, icons and
 * the service worker: ./manifest.webmanifest, ./icons, public/b/sw.js).
 * Never indexed, even after the move to rempire.ee.
 */
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Questrial } from "next/font/google";
import { Suspense } from "react";
import "../admin/admin.css";
import "./barber.css";
import { LangProvider } from "./lang";
import { barberLang } from "./lang-server";
import { SwRegister } from "./sw-register";

const display = localFont({
  src: "../fonts/akrobat-extrabold.woff",
  weight: "800",
  display: "swap",
  variable: "--font-display",
  fallback: ["Arial Narrow", "sans-serif"],
});
// Questrial has no Cyrillic: Russian text falls back to the system face, as in the client flow.
const body = Questrial({ weight: "400", subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-body" });

export const metadata: Metadata = {
  title: "REMPIRE",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "same-origin",
  manifest: "/b/manifest.webmanifest",
  // iPhone: full screen from the home screen, the status bar over the black top bar
  appleWebApp: { capable: true, title: "REMPIRE Team", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function BarberRoot({ children }: LayoutProps<"/b">) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable}`}>
      <body className="adm bx">
        {/* the language needs the request (the login), so everything below waits for it */}
        <Suspense fallback={null}>
          <WithLang>{children}</WithLang>
        </Suspense>
        <SwRegister />
      </body>
    </html>
  );
}

async function WithLang({ children }: { children: React.ReactNode }) {
  return <LangProvider lang={await barberLang()}>{children}</LangProvider>;
}
