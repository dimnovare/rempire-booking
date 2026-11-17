/**
 * The admin: its own root layout, outside the client languages, with its
 * own styles (admin.css), so it never touches the client flow. Never
 * indexed, even after the move to rempire.ee. Its language is the login's
 * own (Russian, Estonian or English): read once here, handed to every
 * component below.
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

// the section's name is added in the browser, in the login's language (lang.tsx, useTitle)
export const metadata: Metadata = {
  title: "REMPIRE",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "same-origin",
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
