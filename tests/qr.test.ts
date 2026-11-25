/**
 * The plaque's QR code (src/lib/qr.ts) read back by a real decoder: ZXing,
 * the library the barber app's scanner already uses. Drawn from the path
 * the page prints, not from the encoder's own matrix, so a slip in the path
 * shows here.
 */
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { describe, expect, it } from "vitest";
import { QR_QUIET, qrOf } from "@/lib/qr";

/** The path as pixels: `scale` pixels a module, white round it. */
function paint(size: number, d: string, scale = 4): { pixels: Uint8ClampedArray; side: number } {
  const side = size * scale;
  const grid = new Uint8Array(size * size);
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let i = 0; i < w; i++) grid[y * size + x + i] = 1;
  }
  const pixels = new Uint8ClampedArray(side * side).fill(255);
  for (let py = 0; py < side; py++)
    for (let px = 0; px < side; px++) if (grid[Math.floor(py / scale) * size + Math.floor(px / scale)]) pixels[py * side + px] = 0;
  return { pixels, side };
}

function decode(text: string): string {
  const { size, d } = qrOf(text);
  const { pixels, side } = paint(size, d);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, side, side)));
  return new QRCodeReader().decode(bitmap).getText();
}

describe("the plaque's QR code", () => {
  it.each(["https://rempire-booking.diipsolutions.eu/", "https://book.rempire.ee/", "https://book.rempire.ee/ru?b=renat"])("reads back as %s", (url) => {
    expect(decode(url)).toBe(url);
  });

  it("keeps the four-module quiet zone inside its box, and the path covers exactly the dark modules", () => {
    const qr = qrOf("https://book.rempire.ee/");
    for (let i = 0; i < qr.size; i++)
      for (let q = 0; q < QR_QUIET; q++) {
        expect(qr.dark(q, i) || qr.dark(i, q) || qr.dark(qr.size - 1 - q, i) || qr.dark(i, qr.size - 1 - q)).toBe(false);
      }
    let fromPath = 0;
    for (const m of qr.d.matchAll(/h(\d+)v1/g)) fromPath += Number(m[1]);
    let dark = 0;
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.dark(r, c)) dark++;
    expect(fromPath).toBe(dark);
  });
});
