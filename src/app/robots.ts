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
  // the admin and the API stay out even on rempire.ee
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] } };
}
