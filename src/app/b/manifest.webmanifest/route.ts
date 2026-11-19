/**
 * GET /b/manifest.webmanifest: the staff app's web app manifest (B1, then
 * docs/apps.md): one install for the barber app (/b) and the admin
 * (/admin), linked from both.
 *
 *   - start_url /b/start: a barber's day, or the side Renat had open last.
 *   - scope "/": the two sides share no narrower address, and inside one
 *     scope the switch between them stays in the app. The client pages do
 *     not link this manifest, so they never install as the staff app. The
 *     final addresses are open (docs/apps.md); the scope follows them.
 *   - id stays "/b": the phones that installed the barber app keep theirs.
 *
 * Public (a phone fetches it without the login cookie); built once.
 * Not app/manifest.ts: that one is for the whole site.
 */
import { START_PATH } from "@/lib/auth/cookie";

export function GET() {
  const manifest = {
    id: "/b",
    name: "REMPIRE · Team",
    // the client app is «REMPIRE» (src/app/[locale]/manifest.webmanifest)
    short_name: "REMPIRE Team",
    description: "REMPIRE staff app",
    lang: "ru",
    start_url: START_PATH,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f9fc",
    theme_color: "#22222e",
    icons: [
      { src: "/b/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/b/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/b/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
