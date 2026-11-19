/**
 * GET /admin/clients/<id>/photo?v=<version>: the client's photo
 * (client_photo, 018). Unlike a barber's portrait it is never public: only
 * a login of this business gets it, and no cache keeps it.
 */
import { connection } from "next/server";
import { clientPhoto } from "@/lib/admin/client-card";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, ctx: RouteContext<"/admin/clients/[id]/photo">) {
  // at request time, always: an answer that came before the login was read would be kept for everyone
  await connection();
  if (!dbConfigured()) return new Response("Not found", { status: 404, headers: NO_STORE });
  const { business } = await requireAdmin();
  const { id } = await ctx.params;
  const photo = await clientPhoto(query, business.id, id);
  if (!photo) return new Response("Not found", { status: 404, headers: NO_STORE });
  return new Response(photo.bytes.buffer as ArrayBuffer, {
    headers: {
      ...NO_STORE,
      "Content-Type": photo.mime,
      "Content-Length": String(photo.bytes.byteLength),
      // an image and nothing else, whatever its bytes claim
      "X-Content-Type-Options": "nosniff",
    },
  });
}
