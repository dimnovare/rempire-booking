import type { NextConfig } from "next";
import { indexingAllowed, NOINDEX_HEADER } from "./src/lib/indexing";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
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
