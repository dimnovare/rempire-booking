/**
 * The letters' look: the light design canvas Dim approved in round 13
 * («REMPIRE booking e-mails», «Build it as drawn»), after the booking pages
 * (docs/brand.md, «Booking look») and the order of REMPIRE's letters today:
 * a grey ground, one white block with 24 px corners, the thin REMPIRE on a
 * dark disc, a coloured pill for what happened, a bold title, the dark
 * button for the one thing to do, then who, when, what and where.
 *
 * Written for mail clients, not browsers:
 *   - tables and inline styles only; the one <style> carries the phone sizes
 *     (Gmail and Apple Mail read it, the rest get the 600 px column);
 *   - no SVG and no web font: the icons are PNG files the app serves
 *     (public/mail, drawn by tools/mail-icons.mjs), the text Inter where
 *     installed, else the system font;
 *   - Outlook for Windows gets a fixed 600 px column, square corners and the
 *     buttons' height from mso-padding-alt; nothing breaks without them.
 *
 * Pure (no database, no Node), so the admin's preview can redraw the
 * salon's own text (extraBlock) in the browser as it is typed. Every value
 * that is not ours goes through esc().
 */

/** The booking's tokens (src/app/globals.css), as mail clients need them: plain hex. */
export const C = {
  ink: "#262626",
  ink2: "#6b6b6b",
  ground: "#f2f2f2",
  surface: "#ffffff",
  primary: "#060f07",
  fill: "#efefef",
  line: "#e3e3e3",
  edge: "#d9d9d9",
  dash: "#cfcfcf",
  avatar: "#3a3a3a",
} as const;

export const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Font, size, line, weight and colour written out: Outlook misreads the `font` shorthand. */
export const text = (size: number, line: number, color: string = C.ink, weight = 400, family = FONT) =>
  `font-family:${family};font-size:${size}px;line-height:${line}px;font-weight:${weight};color:${color};`;

/** Every layout table: no spacing of its own, read past by screen readers. */
const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const WIDE = `${T} width="100%"`;

/** The gap between the blocks of the white column (24 px on a phone). */
const GAP = 28;

/* ---------- icons ---------- */

export type IconName =
  | "pill-ok"
  | "pill-moved"
  | "pill-off"
  | "pill-bell"
  | "pill-star"
  | "pill-gift"
  | "pill-cal"
  | "pill-key"
  | "btn-cancel"
  | "btn-move"
  | "btn-cal"
  | "clock"
  | "pin"
  | "phone"
  | "globe"
  | "chevron"
  | "info"
  | "star-fill";

/** An icon from public/mail: decorative, so its alt text is empty. */
export function icon(origin: string, name: IconName, px: number, inline = false): string {
  const shape = inline ? `display:inline-block;vertical-align:middle;margin-right:8px;` : "display:block;";
  return `<img src="${esc(`${origin}/mail/${name}.png`)}" width="${px}" height="${px}" alt="" style="${shape}width:${px}px;height:${px}px;border:0;outline:none;">`;
}

/* ---------- the column ---------- */

/** One block of the white column, below the one before. */
export const block = (inner: string, gap = GAP) => `<tr><td class="g" style="padding-top:${gap}px;">${inner}</td></tr>`;

export const space = (px: number) => `<table ${WIDE}><tr><td height="${px}" style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</td></tr></table>`;

export const divider = () => `<table ${WIDE}><tr><td height="1" bgcolor="${C.line}" style="height:1px;line-height:1px;font-size:0;background-color:${C.line};">&nbsp;</td></tr></table>`;

/** The salon on its dark disc: the thin REMPIRE, the name, the address. */
function header(origin: string, name: string, address: string): string {
  const logo = `${origin}/brand/rempire-logo-white.png`;
  return `<table ${T}><tr><td width="48" height="48" align="center" valign="middle" bgcolor="${C.primary}" style="width:48px;height:48px;border-radius:24px;background-color:${C.primary};"><img src="${esc(logo)}" width="36" height="9" alt="${esc(name)}" style="display:block;margin:0 auto;width:36px;height:auto;border:0;outline:none;${text(8, 9, C.surface, 700)}"></td><td valign="middle" style="padding-left:12px;"><div style="${text(16, 24, C.ink, 700)}">${esc(name)}</div>${address ? `<div style="${text(14, 20, C.ink2)}">${esc(address)}</div>` : ""}</td></tr></table>`;
}

/** What happened, in one coloured pill. */
export type Tone = "ok" | "moved" | "off" | "bell" | "star" | "gift" | "cal" | "key";

const TONES: Record<Tone, [bg: string, fg: string]> = {
  ok: ["#e7f4ea", "#1a6b33"],
  moved: ["#e8effa", "#1d4a8a"],
  off: ["#fbe9e7", "#a3211a"],
  bell: ["#fdf3dc", "#7a5200"],
  star: ["#fdf3dc", "#7a5200"],
  gift: ["#fdf3dc", "#7a5200"],
  cal: [C.fill, C.ink],
  key: [C.fill, C.ink],
};

function pill(origin: string, tone: Tone, label: string): string {
  const [bg, fg] = TONES[tone];
  return `<table ${T} style="border-collapse:separate;"><tr><td bgcolor="${bg}" style="background-color:${bg};border-radius:999px;padding:4px 10px 4px 8px;"><table ${T}><tr><td valign="middle" style="padding-right:6px;">${icon(origin, `pill-${tone}`, 16)}</td><td valign="middle" style="${text(13, 20, fg, 500)}white-space:nowrap;">${esc(label)}</td></tr></table></td></tr></table>`;
}

/**
 * The top of a letter: the pill, the title, the lead (HTML, already
 * escaped) and any line under it.
 */
export function intro(o: { origin: string; pill?: [Tone, string]; title: string; lead?: string; after?: string }): string {
  const parts = [
    o.pill ? pill(o.origin, o.pill[0], o.pill[1]) : "",
    `<h1 class="h1" style="margin:${o.pill ? 12 : 0}px 0 0;${text(26, 32, C.ink, 700)}">${esc(o.title)}</h1>`,
    o.lead ? `<p style="margin:12px 0 0;${text(16, 24, C.ink2)}">${o.lead}</p>` : "",
    o.after ? `<p style="margin:8px 0 0;${text(14, 20, C.ink2)}">${o.after}</p>` : "",
  ];
  return block(parts.join(""));
}

/* ---------- buttons ---------- */

/** A 50 px button with 16 px corners: dark for the one thing to do, outlined for the others. */
export function button(o: { origin: string; href: string; label: string; dark?: boolean; icon?: IconName }): string {
  const dark = o.dark === true;
  const color = dark ? C.surface : C.ink;
  // 50 px: 22 px of text and 14 px above and below (13 inside the outline)
  const pad = dark ? "14px 12px" : "13px 12px";
  const cell = dark
    ? `bgcolor="${C.primary}" style="background-color:${C.primary};border-radius:16px;mso-padding-alt:${pad};"`
    : `style="border:1px solid ${C.edge};border-radius:16px;mso-padding-alt:${pad};"`;
  const label = `${o.icon ? icon(o.origin, o.icon, 18, true) : ""}<span style="vertical-align:middle;">${esc(o.label)}</span>`;
  return `<table ${WIDE} style="border-collapse:separate;"><tr><td align="center" ${cell}><a href="${esc(o.href)}" style="display:block;padding:${pad};${text(15, 22, color, 500)}text-align:center;text-decoration:none;">${label}</a></td></tr></table>`;
}

/** Two outlined buttons side by side, 8 px apart, as on a phone too. */
export const buttonPair = (a: string, b: string) =>
  `<table ${WIDE}><tr><td width="50%" valign="top" style="padding-right:4px;">${a}</td><td width="50%" valign="top" style="padding-left:4px;">${b}</td></tr></table>`;

/* ---------- rows ---------- */

export const h2 = (s: string, bottom = 0) => `<h2 style="margin:0 0 ${bottom}px;${text(20, 24, C.ink, 700)}">${esc(s)}</h2>`;

/**
 * A 44 px disc and two lines beside it: the barber with his initial, the
 * time with its clock, the address with its pin. `title` and `sub` are
 * HTML; with `href` the lines are a link and a chevron points on.
 */
export function discRow(o: {
  origin: string;
  disc: { icon: IconName; px?: number } | { initial: string };
  title: string;
  sub?: string;
  href?: string;
  /** a chevron after a link (the map); off for the phone */
  chevron?: boolean;
  bold?: boolean;
}): string {
  const isIcon = "icon" in o.disc;
  const bg = isIcon ? C.fill : C.avatar;
  const inner = "icon" in o.disc ? icon(o.origin, o.disc.icon, o.disc.px ?? 20).replace("display:block;", "display:block;margin:0 auto;") : `<span style="${text(17, 20, C.surface, 500)}">${esc(o.disc.initial)}</span>`;
  const lines = `<div style="${text(16, 24, C.ink, o.bold === false ? 400 : 500)}">${o.title}</div>${o.sub ? `<div style="${text(14, 20, C.ink2)}">${o.sub}</div>` : ""}`;
  const body = o.href ? `<a href="${esc(o.href)}" style="display:block;text-decoration:none;color:${C.ink};">${lines}</a>` : lines;
  const chevron = o.href && o.chevron !== false ? `<td width="18" valign="middle" style="padding-left:12px;"><a href="${esc(o.href)}" style="text-decoration:none;">${icon(o.origin, "chevron", 18)}</a></td>` : "";
  return `<table ${WIDE}><tr><td width="44" valign="middle" style="width:44px;">${disc(bg, inner)}</td><td valign="middle" style="padding-left:12px;">${body}</td>${chevron}</tr></table>`;
}

/** A 44 px round disc in a table of its own, so a row of two lines or more never stretches it. */
const disc = (bg: string, inner: string) =>
  `<table ${T} width="44" style="border-collapse:separate;"><tr><td width="44" height="44" align="center" valign="middle" bgcolor="${bg}" style="width:44px;height:44px;border-radius:22px;background-color:${bg};">${inner}</td></tr></table>`;

/** Rows one under another, `gap` px apart. */
export const stack = (rows: string[], gap: number) => rows.filter(Boolean).join(space(gap));

/** The services with their prices and the total under a rule. Names and prices are plain text. */
export function prices(lines: [name: string, price: string][], total: [label: string, value: string], pad = 10): string {
  const rows = lines
    .map(
      ([n, p]) =>
        `<tr><td valign="top" style="padding:${pad}px 16px ${pad}px 0;${text(16, 24)}">${esc(n)}</td><td valign="top" align="right" style="padding:${pad}px 0;${text(16, 24, C.ink, 500)}white-space:nowrap;">${esc(p)}</td></tr>`,
    )
    .join("");
  const sum = `<tr><td style="padding:12px 16px 0 0;border-top:1px solid ${C.line};${text(17, 24, C.ink, 700)}">${esc(total[0])}</td><td align="right" style="padding:12px 0 0;border-top:1px solid ${C.line};${text(17, 24, C.ink, 700)}white-space:nowrap;">${esc(total[1])}</td></tr>`;
  return `<table ${WIDE}>${rows}<tr><td colspan="2" height="4" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>${sum}</table>`;
}

/** A grey note with its «i». */
export const note = (origin: string, s: string) =>
  `<table ${WIDE} style="border-collapse:separate;"><tr><td bgcolor="${C.ground}" style="background-color:${C.ground};border-radius:12px;padding:12px 14px;"><table ${T}><tr><td valign="top" style="padding:1px 10px 0 0;">${icon(origin, "info", 18)}</td><td valign="top" style="${text(13, 19, C.ink2)}">${esc(s)}</td></tr></table></td></tr></table>`;

/** The reminder's time on grey, the barber beside it (under it on a phone). */
export function timeBox(o: { origin: string; day: string; time: string; person: string; role: string }): string {
  const who = `<table ${T}><tr><td width="44" valign="middle" style="width:44px;">${disc(C.avatar, `<span style="${text(17, 20, C.surface, 500)}">${esc(initial(o.person))}</span>`)}</td><td valign="middle" style="padding-left:10px;text-align:left;"><div style="${text(16, 22, C.ink, 500)}">${esc(o.person)}</div><div style="${text(13, 18, C.ink2)}">${esc(o.role)}</div></td></tr></table>`;
  return `<table ${WIDE} style="border-collapse:separate;"><tr><td bgcolor="${C.ground}" style="background-color:${C.ground};border-radius:16px;padding:18px 20px;"><table ${WIDE}><tr><td class="stack" valign="middle" style="${text(14, 20, C.ink2)}">${esc(o.day)}<br><span style="${text(34, 42, C.ink, 700)}letter-spacing:-0.5px;white-space:nowrap;">${esc(o.time)}</span></td><td class="stack stack-gap" valign="middle" align="right" style="padding-left:16px;">${who}</td></tr></table></td></tr></table>`;
}

/** What was booked, struck through in a dashed frame (a cancelled visit). */
export const struck = (top: string, bottom: string) =>
  `<table ${WIDE} style="border-collapse:separate;"><tr><td style="border:1px dashed ${C.dash};border-radius:16px;padding:16px 20px;"><div style="${text(14, 20, C.ink2)}text-decoration:line-through;">${esc(top)}</div><div style="${text(16, 24, C.ink2)}text-decoration:line-through;">${esc(bottom)}</div></td></tr></table>`;

/** A big code on grey (the login code). */
export const codeBox = (code: string) =>
  `<table ${WIDE} style="border-collapse:separate;"><tr><td bgcolor="${C.ground}" align="center" style="background-color:${C.ground};border-radius:16px;padding:18px 20px;${text(40, 48, C.ink, 700, MONO)}letter-spacing:10px;">${esc(code)}</td></tr></table>`;

/** Label and value per row, a thin rule between (the invoice). Values are HTML. */
export function facts(rows: [label: string, valueHtml: string][]): string {
  const cells = rows
    .map(
      ([k, v], i) =>
        `<tr><td valign="top" style="padding:12px 16px 12px 0;${i ? `border-top:1px solid ${C.line};` : ""}${text(15, 22, C.ink2)}">${esc(k)}</td><td valign="top" align="right" style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ""}${text(15, 22, C.ink, 500)}">${v}</td></tr>`,
    )
    .join("");
  return `<table ${WIDE}>${cells}</table>`;
}

/** Five stars in a row, each a link to the review form. */
export function stars(origin: string, href: string, label: string): string {
  const one = `<td style="padding-right:8px;"><a href="${esc(href)}" style="text-decoration:none;"><img src="${esc(`${origin}/mail/star-fill.png`)}" width="32" height="32" alt="★" style="display:block;width:32px;height:32px;border:0;outline:none;${text(28, 32, "#f8bc3a")}"></a></td>`;
  return `<table ${T} aria-label="${esc(label)}"><tr>${one.repeat(5)}</tr></table>`;
}

export const small = (html: string) => `<p style="margin:0;${text(14, 20, C.ink2)}">${html}</p>`;
export const para = (html: string) => `<p style="margin:0;${text(16, 24, C.ink)}">${html}</p>`;

export const initial = (name: string) => (name.trim().charAt(0) || "R").toUpperCase();

/* ---------- the salon's own text (Настройки → Уведомления) ---------- */

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Plain text as HTML: escaped, its addresses links, its blank lines paragraphs. */
export function richText(s: string): string {
  const paras = s
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras
    .map((p, n) => {
      const html = p
        .split(URL_RE)
        .map((part, i) => {
          if (i % 2 === 0) return esc(part);
          // a full stop or a bracket after an address is the sentence's, not the address's
          const url = part.replace(/[.,;:!?)\]]+$/, "");
          const rest = part.slice(url.length);
          return `<a href="${esc(url)}" style="color:${C.ink};text-decoration:underline;word-break:break-all;">${esc(url)}</a>${esc(rest)}`;
        })
        .join("")
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 ${n === paras.length - 1 ? 0 : 12}px;${text(16, 24, C.ink)}">${html}</p>`;
    })
    .join("");
}

/**
 * «Дополнительная информация в Email»: the salon's own text for this kind
 * of letter, under a rule, as it was written. Empty: nothing at all. The
 * admin's preview swaps this block for the one being typed (EXTRA_MARK).
 */
export function extraBlock(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  return block(divider()) + block(richText(t));
}

/** What the previews are drawn with in place of the salon's text, so the page can put its draft there. */
export const EXTRA_MARK = "⁣{extra}⁣";

/* ---------- the page ---------- */

export function layout(o: { lang: string; title: string; preheader: string; origin: string; salon: string; address: string; body: string[]; footer: string[] }): string {
  // the preheader is followed by invisible padding so the inbox preview shows nothing else
  const pad = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<!doctype html>
<html lang="${esc(o.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(o.title)}</title>
<style>
:root { color-scheme: light only; supported-color-schemes: light only; }
body { margin: 0; padding: 0; }
a { color: ${C.ink}; }
@media (max-width: 600px) {
  .pad { padding: 16px 12px 24px !important; }
  .card { padding: 24px 20px !important; }
  .g { padding-top: 24px !important; }
  .h1 { font-size: 24px !important; line-height: 30px !important; }
  .stack { display: block !important; width: 100% !important; text-align: left !important; padding-left: 0 !important; }
  .stack-gap { padding-top: 12px !important; }
}
</style>
<!--[if mso]><style>table, td, div, p, a, span, h1, h2 { font-family: Arial, sans-serif !important; }</style><![endif]-->
</head>
<body bgcolor="${C.ground}" style="margin:0;padding:0;background-color:${C.ground};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.ground};">${esc(o.preheader)}${pad}</div>
<table ${WIDE} bgcolor="${C.ground}" style="background-color:${C.ground};">
<tr><td class="pad" align="center" style="padding:40px 16px;">
<!--[if mso]><table ${T} width="600" align="center"><tr><td><![endif]-->
<table ${WIDE} style="max-width:600px;margin:0 auto;">
<tr><td class="card" bgcolor="${C.surface}" style="background-color:${C.surface};border-radius:24px;padding:32px;text-align:left;">
<table ${WIDE}>
<tr><td>${header(o.origin, o.salon, o.address)}</td></tr>
${o.body.join("")}
</table>
</td></tr>
${o.footer.map((f, i) => `<tr><td align="center" style="padding:${i ? 6 : 24}px 24px 0;${text(13, 19, C.ink2)}text-align:center;">${f}</td></tr>`).join("\n")}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/** «REMPIRE · Mardi 1, Tallinn · rempire.ee»: the salon, its address, its site as a link. Escaped here. */
export function footLine(name: string, address: string | undefined, website: string | undefined): string {
  const site = (website ?? "").trim();
  const href = /^https?:\/\//i.test(site) ? site : site ? `https://${site}` : "";
  const shown = site.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const head = esc([name, address].filter(Boolean).join(" · "));
  return href ? `${head} · <a href="${esc(href)}" style="color:${C.ink2};">${esc(shown)}</a>` : head;
}
