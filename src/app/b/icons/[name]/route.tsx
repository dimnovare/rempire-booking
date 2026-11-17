/**
 * GET /b/icons/<name>: the barber app's icons (B1), drawn from the same
 * tower and colours as the favicon set (src/app/icon.svg): the shop's tower,
 * dark on white. Built once at build time.
 *
 *   icon-192.png, icon-512.png   the app icon
 *   maskable-512.png             Android's shaped icon: the tower inside the
 *                                middle 80 %, so a circle never cuts it
 *   badge-96.png                 Android's status-bar mark: white tower on
 *                                nothing (only the alpha channel is used)
 */
import { ImageResponse } from "next/og";
import { TOWER_PATH } from "@/components/brand";

// the tower's own box (public/brand/rempire-tower.svg)
const TOWER_BOX = { x: 292.24, y: 171.22, w: 265.18, h: 409.8 };
const INK = "#1c1a00";

type Icon = { size: number; bg: string | null; fg: string; /** tower height as a share of the square */ fill: number };

const ICONS: Record<string, Icon> = {
  "icon-192.png": { size: 192, bg: "#ffffff", fg: INK, fill: 0.76 },
  "icon-512.png": { size: 512, bg: "#ffffff", fg: INK, fill: 0.76 },
  "maskable-512.png": { size: 512, bg: "#ffffff", fg: INK, fill: 0.56 },
  "badge-96.png": { size: 96, bg: null, fg: "#ffffff", fill: 0.84 },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_request: Request, ctx: RouteContext<"/b/icons/[name]">) {
  const { name } = await ctx.params;
  const icon = ICONS[name];
  if (!icon) return new Response("Not found", { status: 404 });
  const h = Math.round(icon.size * icon.fill);
  const w = Math.round((h * TOWER_BOX.w) / TOWER_BOX.h);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: icon.bg ?? "transparent" }}>
        <svg width={w} height={h} viewBox={`${TOWER_BOX.x} ${TOWER_BOX.y} ${TOWER_BOX.w} ${TOWER_BOX.h}`}>
          <path fill={icon.fg} d={TOWER_PATH} />
        </svg>
      </div>
    ),
    { width: icon.size, height: icon.size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
