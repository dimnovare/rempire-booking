/**
 * GET /b/manifest.webmanifest: the staff app's web app manifest (B1, then
 * docs/apps.md): one install for the barber app (/b) and the admin
 * (/admin), linked from both.
 *
 *   - start_url /b/start: a barber's day, or the side Renat had open last.
 *   - scope "/": the two sides share no narrower address, and inside one
 *     scope the switch between them stays in the app. The client pages do
 *     not link this manifest, so they never install as the staff app.
 *   - Every address in it is a path, so it is the app of the host it was
 *     fetched from: on the staff address (STAFF_URL, src/lib/hosts.ts) the
 *     whole host is the staff app, and the client address sends /admin and
 *     /b there; a host that serves both halves (today's staging) installs
 *     it as before.
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
    // the start-up screen: all white, the same white as the icon's square (Dim, 20.11: #f7f9fc
    // showed the square's edge); once the page is up, its theme-color (#22222e, layout.tsx) takes over
    background_color: "#ffffff",
    theme_color: "#ffffff",
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
