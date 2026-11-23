import type { NextConfig } from "next";
import { indexingAllowed, NOINDEX_HEADER } from "./src/lib/indexing";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // PGlite (in-memory Postgres, DB_DRIVER=pglite|auto) loads its own .wasm
  // and data files at run time: keep it out of the bundle, trace it whole.
  serverExternalPackages: ["@electric-sql/pglite"],
  // the SQL files the in-memory database migrates itself from, and PGlite's
  // engine files (.wasm, .data, the btree_gist extension) it loads by URL
  outputFileTracingIncludes: {
    "/*": [
      "./db/migrations/*.sql",
      "./node_modules/@electric-sql/pglite/dist/*.{js,cjs,wasm,data}",
      "./node_modules/@electric-sql/pglite/dist/btree_gist.tar.gz",
      "./node_modules/@electric-sql/pglite/dist/contrib/btree_gist.*",
      // the link-preview card's font and logo (src/lib/og.tsx)
      "./src/app/fonts/akrobat-extrabold.woff",
      "./public/brand/rempire-logo-white.png",
      // the invoice PDF's faces and the tower (src/lib/billing/pdf.ts)
      "./src/app/fonts/*.ttf",
      "./public/brand/rempire-tower.svg",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // «Счета» got its own frame and pages (19.11.2026): the two old tab
  // addresses lead to where their content went; so does «Уведомления». A query (?m=2026-10) is
  // carried over by itself.
  async redirects() {
    return [
      { source: "/admin/invoices/month", destination: "/admin/invoices/reports", permanent: false },
      { source: "/admin/invoices/company", destination: "/admin/invoices/settings", permanent: false },
      // «Уведомления» left «Настройки» (Dim, round 13): a section of its own, as in the admin we follow
      { source: "/admin/settings/notifications/:path*", destination: "/admin/notifications/:path*", permanent: false },
    ];
  },
  // X-Robots-Tag on every path, files in /public included (headers are
  // checked before the filesystem). See src/lib/indexing.ts.
  async headers() {
    // The barber app's service worker sits in /b/ but runs the app at /b
    // (public/b/sw.js), and every start must see a new one at once.
    const sw = {
      source: "/b/sw.js",
      headers: [
        { key: "Service-Worker-Allowed", value: "/b" },
        { key: "Cache-Control", value: "no-cache" },
      ],
    };
    // The client app's worker (public/sw.js, push only): the same rule.
    const clientSw = { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] };
    if (indexingAllowed()) return [sw, clientSw];
    return [
      sw,
      clientSw,
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: NOINDEX_HEADER }],
      },
    ];
  },
};

export default nextConfig;
