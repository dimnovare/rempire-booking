/**
 * The one business this app serves today. BUSINESS_SLUG picks it
 * (default "rempire", as in the demo seed and the Altegio import).
 */
import { getBusiness, type Business } from "./availability";
import { query } from "./db";

export async function currentBusiness(): Promise<Business | null> {
  return getBusiness(query, process.env.BUSINESS_SLUG || "rempire");
}
