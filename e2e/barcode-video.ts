import fs from "node:fs";
import path from "node:path";

/**
 * A camera for Chromium's fake capture device (--use-file-for-fake-video-capture):
 * a Y4M video of one EAN-13 barcode, black bars on white, drawn from the
 * specification (95 modules; L/G/R codes, the left half's parity set by the
 * first digit). The scanner sees it as a phone camera pointed at a label.
 */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code)) throw new Error(`not an EAN-13: ${code}`);
  const d = [...code].map(Number);
  const left = d
    .slice(1, 7)
    .map((x, i) => (PARITY[d[0]][i] === "L" ? L[x] : G[x]))
    .join("");
  const right = d
    .slice(7)
    .map((x) => R[x])
    .join("");
  return `101${left}01010${right}101`;
}

/** Writes the video (a few identical frames; Chromium loops it) and answers its path. */
export function barcodeVideo(dir: string, code: string, w = 640, h = 480, module = 3): string {
  const bars = ean13Modules(code);
  const y = Buffer.alloc(w * h, 235);
  const x0 = Math.round((w - bars.length * module) / 2);
  const top = Math.round(h * 0.3);
  const bottom = Math.round(h * 0.7);
  for (let row = top; row < bottom; row++)
    for (let i = 0; i < bars.length; i++)
      if (bars[i] === "1") y.fill(16, row * w + x0 + i * module, row * w + x0 + (i + 1) * module);
  const chroma = Buffer.alloc((w / 2) * (h / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma]);
  const file = path.join(dir, `barcode-${code}.y4m`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame]));
  return file;
}
