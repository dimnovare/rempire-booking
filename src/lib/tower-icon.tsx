/**
 * The tower as a square app icon (the shop's mark, recoloured only:
 * docs/brand.md). Two apps use it (docs/apps.md), so a phone that has both
 * tells them apart at a glance:
 *
 *   the staff app    dark tower on white   src/app/b/icons
 *   the client app   white tower on black  src/app/icons, src/app/[locale]/apple-icon.tsx
 */
import { ImageResponse } from "next/og";
import { TOWER_PATH } from "@/components/brand";

// the tower's own box (public/brand/rempire-tower.svg)
const TOWER_BOX = { x: 292.24, y: 171.22, w: 265.18, h: 409.8 };

export type TowerIcon = { size: number; /** null: nothing behind the tower */ bg: string | null; fg: string; /** tower height as a share of the square */ fill: number };

export function towerIcon(icon: TowerIcon): ImageResponse {
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
