import type { MetadataRoute } from "next";
import { indexingAllowed } from "@/lib/indexing";

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return { rules: { userAgent: "*", allow: "/" } };
}
