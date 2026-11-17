import type { Metadata } from "next";
import { indexingAllowed } from "@/lib/indexing";
import "./globals.css";

const indexable = indexingAllowed();

export const metadata: Metadata = {
  title: "REMPIRE Booking",
  description: "Online booking for REMPIRE, Mardi 1, Tallinn.",
  robots: {
    index: indexable,
    follow: indexable,
    nocache: !indexable,
    googleBot: { index: indexable, follow: indexable },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
