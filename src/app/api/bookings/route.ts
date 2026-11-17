/**
 * POST /api/bookings   (Idempotency-Key: <uuid>)
 * { serviceIds, staffId|null, startsAt, extraCents?, name, phone, email?, comment?, locale, smsReminder }
 * extraCents: the special-time extra the client was shown; a different one is slot_taken.
 *
 * 201 { visit, manageUrl }    booked (or the same tap again: manageUrl null)
 * 409 { error: "slot_taken", alternatives: [[startMs, staffId, extraCents], …] }
 * 422 { error: "invalid", field }
 */
import { loadAvailability } from "@/lib/availability";
import { book, type BookingInput } from "@/lib/booking";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { localParts } from "@/lib/tz";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 8_000;

export async function POST(request: Request) {
  if (!dbConfigured()) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413, headers: NO_STORE });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid", field: "body" }, { status: 400, headers: NO_STORE });
  }
  const business = await currentBusiness();
  if (!business) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });

  // Copied field by field: nothing else from the body reaches the booking.
  const locale = isLocale(body.locale) ? body.locale : "ru";
  const input: BookingInput = {
    serviceIds: Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : [],
    staffId: body.staffId == null || body.staffId === "any" ? null : String(body.staffId),
    startsAt: String(body.startsAt ?? ""),
    extraCents: typeof body.extraCents === "number" ? body.extraCents : body.extraCents == null ? null : NaN,
    name: String(body.name ?? ""),
    phone: String(body.phone ?? ""),
    email: body.email == null ? null : String(body.email),
    comment: body.comment == null ? null : String(body.comment),
    locale,
    smsReminder: body.smsReminder !== false,
    idempotencyKey: request.headers.get("idempotency-key") || "",
  };
  const r = await book(query, business, input, { source: "online" });

  if (r.ok) {
    return Response.json(
      { visit: r.visit, replay: r.replay, manageUrl: r.manageToken ? `/${locale}/visit/${r.manageToken}` : null },
      { status: r.replay ? 200 : 201, headers: NO_STORE },
    );
  }
  if (r.code === "slot_taken") {
    // the three nearest free times that day, same barber choice
    const start = Date.parse(input.startsAt);
    const date = localParts(start, business.timezone).date;
    const look = await loadAvailability(query, { business, serviceIds: input.serviceIds, staffId: input.staffId, from: date, days: 1 });
    const alternatives = (look.days[0]?.slots ?? [])
      .sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start))
      .slice(0, 3)
      .sort((a, b) => a.start - b.start)
      .map((s) => [s.start, s.staffIds[0], s.extraCents]);
    return Response.json({ error: "slot_taken", alternatives }, { status: 409, headers: NO_STORE });
  }
  return Response.json({ error: r.code, field: r.field }, { status: r.code === "not_offered" ? 409 : 422, headers: NO_STORE });
}
