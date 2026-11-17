import type { MetadataRoute } from "next";
import { indexingAllowed, PREVIEW_BOTS } from "@/lib/indexing";

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return {
      rules: [
        { userAgent: "*", disallow: "/" },
        { userAgent: PREVIEW_BOTS, allow: "/" },
      ],
    };
  }
  return { rules: { userAgent: "*", allow: "/" } };
}
