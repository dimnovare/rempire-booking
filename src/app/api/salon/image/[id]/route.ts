/**
 * GET /api/salon/image/<id> → the salon's uploaded logo or one of its
 * gallery photos (db/migrations/031_location_images.sql; uploaded in the
 * admin, «Настройки → Бренд» and «Галерея»). Public, like the photos in
 * /public: clients see them on the salon's page. Every upload has a new id,
 * so a file never changes under its address and can be cached for good; a
 * removed one is gone (404).
 */
import { connection } from "next/server";
import { locationImage } from "@/lib/admin/location";
import { dbConfigured, query } from "@/lib/db";

export async function GET(_request: Request, ctx: RouteContext<"/api/salon/image/[id]">) {
  // a request-time answer from the database, never one made at build time
  await connection();
  const { id } = await ctx.params;
  const image = dbConfigured() ? await locationImage(query, id) : null;
  if (!image) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  return new Response(image.bytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      // an image and nothing else, whatever its bytes claim
      "X-Content-Type-Options": "nosniff",
      // the salon's pictures are for its page, not for an image search
      "X-Robots-Tag": "noindex",
    },
  });
}
