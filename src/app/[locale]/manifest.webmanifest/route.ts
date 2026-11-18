/**
 * GET /<locale>/manifest.webmanifest: the client app's web app manifest
 * (docs/apps.md). The booking site, added to the home screen: it opens on
 * the booking page in the language it was added in, where the device
 * already remembers the client's visit, name and last choice.
 *
 *   - One app whatever the language: the id is "/" in all three.
 *   - scope "/": the three languages share no narrower address.
 *   - Its own icons (white tower on black), so it is never mistaken for
 *     the staff app (/b/manifest.webmanifest, dark tower on white).
 *
 * Linked from every client page (src/app/[locale]/layout.tsx); built once.
 */
import { isLocale, LOCALES, type Locale } from "@/lib/i18n";

const NAME: Record<Locale, { name: string; description: string }> = {
  ru: { name: "REMPIRE · Онлайн-запись", description: "Запись в барбершоп REMPIRE, Mardi 1, Таллин" },
  et: { name: "REMPIRE · Broneeri aeg", description: "REMPIRE barbershopi broneerimine, Mardi 1, Tallinn" },
  en: { name: "REMPIRE · Book a visit", description: "Book a visit at REMPIRE barbershop, Mardi 1, Tallinn" },
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_request: Request, ctx: RouteContext<"/[locale]/manifest.webmanifest">) {
  const { locale } = await ctx.params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  const manifest = {
    id: "/",
    name: NAME[locale].name,
    short_name: "REMPIRE",
    description: NAME[locale].description,
    lang: locale,
    start_url: `/${locale}`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
