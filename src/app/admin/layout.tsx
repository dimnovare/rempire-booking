/**
 * Renat's admin: its own root layout, in Russian, outside the client
 * languages, with its own styles (admin.css), so it never touches the
 * client flow. Never indexed, even after the move to rempire.ee.
 */
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Questrial } from "next/font/google";
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

export const metadata: Metadata = {
  title: { default: "REMPIRE · Админ", template: "%s · REMPIRE" },
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
      <body className="adm">{children}</body>
    </html>
  );
}
