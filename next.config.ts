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
    if (indexingAllowed()) return [sw];
    return [
      sw,
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: NOINDEX_HEADER }],
      },
    ];
  },
};

export default nextConfig;
