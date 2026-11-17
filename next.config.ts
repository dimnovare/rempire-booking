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
    if (indexingAllowed()) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: NOINDEX_HEADER }],
      },
    ];
  },
};

export default nextConfig;
