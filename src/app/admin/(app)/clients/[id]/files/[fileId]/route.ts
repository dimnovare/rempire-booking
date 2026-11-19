/**
 * GET /admin/clients/<id>/files/<file id>: one of a client's files
 * (client_files, 018), as a download. Never public: only a login of this
 * business with «Просматривать и скачивать файлы» that sees this client
 * gets it, and only the file of that client.
 *
 * Always «attachment» and «nosniff»: the browser saves it under its name
 * and never opens or runs it inside our pages, whatever the file holds.
 */
import { connection } from "next/server";
import { clientFile } from "@/lib/admin/client-card";
import { clientSeen } from "@/lib/admin/client-scope";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const NOT_ASCII = /[^\x20-\x7e]|["\\]/g;

/** The name twice: plain for old browsers, and in full (RFC 5987) for the rest. */
const disposition = (name: string) => `attachment; filename="${name.replace(NOT_ASCII, "_")}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;

export async function GET(_request: Request, ctx: RouteContext<"/admin/clients/[id]/files/[fileId]">) {
  // at request time, always: an answer that came before the login was read would be kept for everyone
  await connection();
  if (!dbConfigured()) return new Response("Not found", { status: 404, headers: NO_STORE });
  const { user, business } = await requireAdmin();
  const { id, fileId } = await ctx.params;
  const file = can(user, "clients.files") && (await clientSeen(query, business.id, user, id)) ? await clientFile(query, business.id, id, fileId) : null;
  if (!file) return new Response("Not found", { status: 404, headers: NO_STORE });
  return new Response(file.bytes.buffer as ArrayBuffer, {
    headers: {
      ...NO_STORE,
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": disposition(file.name),
      "X-Content-Type-Options": "nosniff",
      // and if a browser shows it all the same: no scripts, no requests of its own
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
