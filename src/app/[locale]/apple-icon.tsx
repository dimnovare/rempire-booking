/**
 * The client app's home-screen icon on an iPhone: the tower, white on
 * black (src/lib/tower-icon.tsx). The staff app keeps src/app/apple-icon.png.
 */
import { towerIcon } from "@/lib/tower-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return towerIcon({ size: 180, bg: "#000000", fg: "#ffffff", fill: 0.7 });
}
