/**
 * GET /api/health/cron: 200 when the message job (/api/cron/outbox) ran in
 * the last 15 minutes and finished, 503 otherwise (src/lib/health.ts). Its
 * own monitor: booking works without the cron, but reminders and pushes
 * stop. HEAD answers the same status without a body.
 */
import { connection } from "next/server";
import { query } from "@/lib/db";
import { cronHealth } from "@/lib/health";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

async function answer(body: boolean): Promise<Response> {
  await connection();
  const h = await cronHealth(query);
  const status = h.ok ? 200 : 503;
  return body ? Response.json(h, { status, headers: HEADERS }) : new Response(null, { status, headers: HEADERS });
}

export function GET() {
  return answer(true);
}

export function HEAD() {
  return answer(false);
}
