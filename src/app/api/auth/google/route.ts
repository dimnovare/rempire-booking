/**
 * Google login: not built yet. The OAuth client's owner is an open question
 * (src/lib/auth/google.ts has the plan). The login page shows no Google
 * button until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET exist.
 */
export function GET() {
  return Response.json({ error: "not_configured" }, { status: 501, headers: { "Cache-Control": "no-store" } });
}
