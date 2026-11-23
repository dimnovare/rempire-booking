/**
 * The letters' icons (src/lib/letter-kit.ts) as PNG files in public/mail/.
 *
 * Mail clients drop inline SVG (Gmail, Outlook), so each icon of the design
 * canvas is drawn here once, in the one colour it is used in, at three times
 * its size for sharp phones, and committed. Run it again only when an icon
 * changes:
 *
 *   node tools/mail-icons.mjs
 *
 * sharp comes with Next.js; nothing here is loaded by the app.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(import.meta.dirname, "..", "public", "mail");
const SCALE = 3;

const ARROWS = '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>';
const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
const CROSS = '<path d="M7 7l10 10M17 7L7 17"/>';
const BELL = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>';
const STAR = '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.4 9.8l6-.8z"/>';
const GIFT = '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9C10.5 5 7 5 7 7s3 2 5 2c2 0 5 0 5-2s-3.5-2-5 2"/>';
const CAL = '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>';
const CAL_PLUS = '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4"/>';
const CLOCK = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';
const PIN = '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>';
const PHONE = '<path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>';
const GLOBE = '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>';
const CHEVRON = '<path d="M9 5l7 7-7 7"/>';
const INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>';
const KEY = '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>';

/** name: [the shape, its colour, the size it is shown at, its stroke] */
const ICONS = {
  // the status pills (16 px)
  "pill-ok": [CHECK, "#1a6b33", 16, 2.4],
  "pill-moved": [ARROWS, "#1d4a8a", 16, 2.2],
  "pill-off": [CROSS, "#a3211a", 16, 2.4],
  "pill-bell": [BELL, "#7a5200", 16, 2],
  "pill-star": [STAR, "#7a5200", 16, 2],
  "pill-gift": [GIFT, "#7a5200", 16, 2],
  "pill-cal": [CAL, "#262626", 16, 2],
  "pill-key": [KEY, "#262626", 16, 2],
  // the buttons (18 px)
  "btn-cancel": ['<path d="M6 6l12 12M18 6L6 18"/>', "#b3261e", 18, 2.2],
  "btn-move": [ARROWS, "#262626", 18, 2],
  "btn-cal": [CAL_PLUS, "#ffffff", 18, 2],
  // the rows (20 px in a 44 px disc), the chevron and the note
  clock: [CLOCK, "#262626", 20, 1.8],
  pin: [PIN, "#262626", 20, 1.8],
  phone: [PHONE, "#262626", 19, 1.8],
  globe: [GLOBE, "#262626", 19, 1.8],
  chevron: [CHEVRON, "#8a8a8a", 18, 2],
  info: [INFO, "#6b6b6b", 18, 1.8],
};

/** The rating row of the review request: five filled stars, 32 px. */
const FILLED = { "star-fill": [STAR, "#f8bc3a", 32] };

mkdirSync(OUT, { recursive: true });
const svg = (inner, color, px, stroke, fill = "none") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${px * SCALE}" height="${px * SCALE}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

for (const [name, [inner, color, px, stroke]] of Object.entries(ICONS)) {
  const png = await sharp(Buffer.from(svg(inner, color, px, stroke))).png({ compressionLevel: 9, palette: true }).toBuffer();
  writeFileSync(path.join(OUT, `${name}.png`), png);
}
for (const [name, [inner, color, px]] of Object.entries(FILLED)) {
  const png = await sharp(Buffer.from(svg(inner, color, px, 1.2, color))).png({ compressionLevel: 9, palette: true }).toBuffer();
  writeFileSync(path.join(OUT, `${name}.png`), png);
}
console.log(`${Object.keys(ICONS).length + Object.keys(FILLED).length} icons in ${path.relative(process.cwd(), OUT)}`);
