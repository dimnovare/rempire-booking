/**
 * GET /b/manifest.webmanifest: the barber app's web app manifest (B1).
 * Its own scope and start, /b, so the client booking pages never open as
 * the app. Public (a phone fetches it without the login cookie); built once.
 * Not app/manifest.ts: that one is for the whole site.
 */
export function GET() {
  const manifest = {
    id: "/b",
    name: "REMPIRE · Barber",
    short_name: "REMPIRE",
    description: "REMPIRE barber app",
    lang: "ru",
    start_url: "/b",
    scope: "/b",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
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
