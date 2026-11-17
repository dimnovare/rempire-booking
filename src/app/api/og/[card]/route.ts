/** GET /api/og/ru|et|en|qa → the link-preview picture (src/lib/og.tsx). */
import { ogImage } from "@/lib/og";
import { isOgCard, OG_CARDS } from "@/lib/og-cards";

export function generateStaticParams() {
  return Object.keys(OG_CARDS).map((card) => ({ card }));
}

export async function GET(_request: Request, ctx: RouteContext<"/api/og/[card]">) {
  const { card } = await ctx.params;
  if (!isOgCard(card)) return new Response("Not found", { status: 404 });
  return ogImage(card);
}
