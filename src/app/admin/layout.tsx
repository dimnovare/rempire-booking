/**
 * The admin: its own root layout, outside the client languages, with its
 * own styles (admin.css), so it never touches the client flow. Never
 * indexed, even after the move to rempire.ee. Its language is the login's
 * own (Russian, Estonian or English): read once here, handed to every
 * component below.
 *
 * The admin is the «Салон» side of the staff app (docs/apps.md), so it
 * carries the same manifest and home-screen tags as the barber app: added
 * to the home screen from here, it is the same one app.
 */
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Questrial } from "next/font/google";
import { Suspense } from "react";
import { LangProvider } from "./lang";
import { adminLang } from "./lang-server";
import "./admin.css";

const display = localFont({
  src: "../fonts/akrobat-extrabold.woff",
  weight: "800",
  display: "swap",
  variable: "--font-display",
  fallback: ["Arial Narrow", "sans-serif"],
});
// Questrial has no Cyrillic: Russian text falls back to the system face, as in the client flow.
const body = Questrial({ weight: "400", subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-body" });

// no title here: each section renders its own <title> in the login's language (lang.tsx, Title)
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "same-origin",
  manifest: "/b/manifest.webmanifest",
  appleWebApp: { capable: true, title: "REMPIRE Team", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function AdminRoot({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable}`}>
      <body className="adm">
        {/* the language needs the request (the login or a cookie), so everything below waits for it */}
        <Suspense fallback={null}>
          <WithLang>{children}</WithLang>
        </Suspense>
      </body>
    </html>
  );
}

async function WithLang({ children }: { children: React.ReactNode }) {
  return <LangProvider lang={await adminLang()}>{children}</LangProvider>;
}
