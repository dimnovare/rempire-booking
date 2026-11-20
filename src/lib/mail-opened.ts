/**
 * «Открыт.»: when a letter was first opened (025_mail_opened.sql), from
 * Resend's webhook (https://resend.com/docs/dashboard/webhooks/introduction).
 *
 * Resend signs each webhook the Svix way: headers `svix-id`,
 * `svix-timestamp` (Unix seconds) and `svix-signature` (space-separated
 * «v1,<base64>»), each signature an HMAC-SHA256 of «id.timestamp.body»
 * keyed with the base64 part of the endpoint's secret («whsec_…», env
 * RESEND_WEBHOOK_SECRET). A request older or newer than five minutes is
 * refused, so a captured one cannot be replayed later.
 *
 * Opens are known only when open tracking is on for the sending domain in
 * Resend; mail apps that block images never report one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Querier } from "./db";

const TOLERANCE_S = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

/** True when `body` was signed with `secret` within the last five minutes of `nowMs`. */
export function verifySvix(secret: string, h: SvixHeaders, body: string, nowMs: number): boolean {
  if (!h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const want = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${body}`).digest();
  for (const part of h.signature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === want.length && timingSafeEqual(got, want)) return true;
  }
  return false;
}

/** The webhook's event, if it is an open we can match: Resend's letter id and when. */
export function openedEvent(payload: unknown): { emailId: string; at: Date } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  if (p.type !== "email.opened") return null;
  const id = p.data?.email_id;
  if (typeof id !== "string" || id.length === 0 || id.length > 200) return null;
  const at = typeof p.created_at === "string" ? new Date(p.created_at) : new Date(NaN);
  return { emailId: id, at: Number.isNaN(at.getTime()) ? new Date() : at };
}

/** Mark the letter Resend calls `emailId` opened, first open only. Returns whether a letter matched. */
export async function recordOpen(query: Querier, emailId: string, at: Date): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update notifications set opened_at = least(coalesce(opened_at, $2), $2)
      where provider = 'resend' and provider_ref = $1 and channel = 'email'
      returning id`,
    [emailId, at],
  );
  return rows.length > 0;
}
