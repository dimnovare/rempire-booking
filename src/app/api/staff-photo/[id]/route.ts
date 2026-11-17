/**
 * GET /api/staff-photo/<staff id>?v=<version> → the barber's uploaded portrait.
 * Public, like the photos in /public: clients see it when they book. The link
 * in staff.photo_url changes with every upload (`v`), so the file itself can
 * be cached for good.
 */
import { staffPhoto } from "@/lib/admin/staff";
import { dbConfigured, query } from "@/lib/db";

export async function GET(_request: Request, ctx: RouteContext<"/api/staff-photo/[id]">) {
  const { id } = await ctx.params;
  const photo = dbConfigured() ? await staffPhoto(query, id) : null;
  if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(photo.bytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(photo.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      // an image and nothing else, whatever its bytes claim
      "X-Content-Type-Options": "nosniff",
    },
  });
}
