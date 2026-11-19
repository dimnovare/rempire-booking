/**
 * POST /admin/clients/<id>/files: keep one file on a client (client_files,
 * 018). A form with one «file» field; the card sends its files one request
 * each. A route, not an action: an action carries 1 MB at most, a file may
 * be 5.
 *
 *   201 { ok: true, id }
 *   4xx { ok: false, code }   type · size · empty · full · not_found
 *
 * Only a login of this business with «Загружать файлы» that sees this
 * client, and only from our own pages: the request must name our own host
 * as its origin. The file's kind, size and number
 * are checked by src/lib/admin/client-card.ts.
 *
 * Where the app runs behind a platform that caps a request's size (Vercel:
 * 4.5 MB), a file above that cap never gets here; the card says «too
 * large» for the platform's 413 as for ours.
 */
import { addFile, FILE_MAX_BYTES } from "@/lib/admin/client-card";
import { clientSeen } from "@/lib/admin/client-scope";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
/** What a form adds around the file itself: boundaries and the part's header. */
const FORM_ROOM = 64 * 1024;
const STATUS: Record<string, number> = { type: 415, size: 413, empty: 400, full: 409, not_found: 404 };

const no = (code: string) => Response.json({ ok: false, code }, { status: STATUS[code] ?? 400, headers: NO_STORE });

/** The page that sent this is one of ours: its origin is the host the request came to. */
function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request, ctx: RouteContext<"/admin/clients/[id]/files">) {
  if (!dbConfigured()) return no("not_found");
  if (!sameSite(request)) return Response.json({ ok: false, code: "forbidden" }, { status: 403, headers: NO_STORE });
  const { user, business } = await requireAdmin();
  const { id } = await ctx.params;
  if (!can(user, "clients.files.upload")) return Response.json({ ok: false, code: "forbidden" }, { status: 403, headers: NO_STORE });
  if (!(await clientSeen(query, business.id, user, id))) return no("not_found");
  // by what the request says of itself first, so 5 MB too many are not read at all
  if (Number(request.headers.get("content-length") ?? 0) > FILE_MAX_BYTES + FORM_ROOM) return no("size");
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return no("empty");
  }
  if (!(file instanceof File)) return no("empty");
  if (file.size > FILE_MAX_BYTES) return no("size");
  const r = await addFile(business, id, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, { id: user.id, name: user.name || user.email });
  return r.ok ? Response.json(r, { status: 201, headers: NO_STORE }) : no(r.code);
}
