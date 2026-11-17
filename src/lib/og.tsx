/**
 * Link previews (WhatsApp, Telegram, Messenger…): one 1200×630 card per
 * language for booking, and one for Renat's questions. Served by
 * /api/og/<card>, built once at build time. Akrobat and the white logo are
 * rempire.ee's own (docs/brand.md).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OG_CARDS, OG_SIZE, type OgCard } from "@/lib/og-cards";

// next.config.ts traces both files into the server bundle.
const font = readFile(join(process.cwd(), "src/app/fonts/akrobat-extrabold.woff"));
const logo = readFile(join(process.cwd(), "public/brand/rempire-logo-white.png"), "base64");

export async function ogImage(card: OgCard): Promise<ImageResponse> {
  const c = OG_CARDS[card];
  const long = c.lines.some((l) => l.length > 10);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000", color: "#fff", fontFamily: "Akrobat" }}>
        <div style={{ display: "flex", padding: "64px 80px 0" }}>
          {/* 436×105 */}
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={`data:image/png;base64,${await logo}`} width={266} height={64} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px" }}>
          {c.lines.map((l) => (
            <div key={l} style={{ fontSize: long ? 118 : 164, lineHeight: 0.92, textTransform: "uppercase", letterSpacing: "0.01em" }}>
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", height: 112, padding: "0 80px", background: "#e9fc53", color: "#000", fontSize: 46, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {c.band}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Akrobat", data: await font, weight: 800, style: "normal" }] },
  );
}
