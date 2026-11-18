/**
 * GET /icons/<name>: the client app's icons (docs/apps.md): the tower,
 * white on black, as the booking pages are. The staff app's are the other
 * way round (src/app/b/icons). Built once at build time.
 *
 *   app-192.png, app-512.png   the app icon
 *   app-maskable-512.png       Android's shaped icon: the tower inside the
 *                              middle 80 %, so a circle never cuts it
 */
import { towerIcon, type TowerIcon } from "@/lib/tower-icon";

const ICONS: Record<string, TowerIcon> = {
  "app-192.png": { size: 192, bg: "#000000", fg: "#ffffff", fill: 0.76 },
  "app-512.png": { size: 512, bg: "#000000", fg: "#ffffff", fill: 0.76 },
  "app-maskable-512.png": { size: 512, bg: "#000000", fg: "#ffffff", fill: 0.56 },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_request: Request, ctx: RouteContext<"/icons/[name]">) {
  const { name } = await ctx.params;
  const icon = ICONS[name];
  if (!icon) return new Response("Not found", { status: 404 });
  return towerIcon(icon);
}
