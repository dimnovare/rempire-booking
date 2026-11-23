/**
 * GET /api/health: 200 when the booking can take a visit, 503 when it
 * can't (src/lib/health.ts). For the uptime monitor, every minute
 * (docs/launch.md, B7). The booking page itself may answer 200 even when
 * the database is down (its content streams in after the status is sent),
 * so the monitor asks here. HEAD answers the same status without a body.
 */
import { connection } from "next/server";
import { query } from "@/lib/db";
import { bookingHealth } from "@/lib/health";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

async function answer(body: boolean): Promise<Response> {
  // a request-time answer, never one made at build time
  await connection();
  const h = await bookingHealth(query);
  const status = h.ok ? 200 : 503;
  return body ? Response.json(h, { status, headers: HEADERS }) : new Response(null, { status, headers: HEADERS });
}

export function GET() {
  return answer(true);
}

export function HEAD() {
  return answer(false);
}
