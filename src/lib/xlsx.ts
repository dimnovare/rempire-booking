/**
 * One sheet as an .xlsx file, written and read here (the client base's
 * «Операции с Excel»; the owner, 19.11.2026).
 *
 * An .xlsx is a zip of a few small XML files. The zip is fflate's (MIT, no
 * dependencies of its own, the one package added for this); the XML is
 * written and read by this file, which is all a plain table needs:
 *
 *   writeXlsx   a bold head row that stays in view, then the rows: text,
 *               numbers, and moments as real dates («dd.mm.yyyy hh:mm»), so
 *               the sheet sorts and sums as a sheet should;
 *   readXlsx    the first sheet as rows of text and numbers. Not used by a
 *               page yet: it is for «Загрузить из Excel», and the tests
 *               open what writeXlsx made with it.
 *
 * A text is always written as a text cell, never as a formula: a name that
 * starts with «=» or «+» stays a name when the file is opened.
 *
 * No Next.js and no database in here.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { localParts } from "./tz";

/** A cell to write: text, a number, nothing, or a moment as the sheet's own day number (`excelSerial`). */
export type XCell = string | number | null | undefined | { dateTime: number };
export type XSheet = {
  /** the tab's name */
  name: string;
  header: string[];
  rows: XCell[][];
  /** each column's width in characters; 16 where none is given */
  widths?: number[];
};
/** A cell as it is read. A date comes as its day number: `serialToLocal` turns it back. */
export type XValue = string | number | boolean | null;
export type XRead = { name: string; rows: XValue[][] };

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** A cell holds at most this many characters. */
const CELL_MAX = 32_767;
/** What readXlsx takes: a part of the file larger than this is not unpacked, and a sheet beyond these is refused. */
const READ = { partBytes: 20 * 1024 * 1024, rows: 100_000, cols: 256 };

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/** The cell styles of styles.xml below, by their place in its list. */
const STYLE = { head: 1, dateTime: 2 };

// XML 1.0 has no place for these, escaped or not
const NOT_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const esc = (s: string) => s.replace(NOT_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 0 → «A», 26 → «AA». */
function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** «AA» → 26. */
function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function cellXml(ref: string, v: XCell, style = 0): string {
  const s = style ? ` s="${style}"` : "";
  if (v == null || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : "";
  if (typeof v === "object") return Number.isFinite(v.dateTime) ? `<c r="${ref}" s="${STYLE.dateTime}"><v>${Number(v.dateTime.toFixed(6))}</v></c>` : "";
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(v).slice(0, CELL_MAX))}</t></is></c>`;
}

/** A tab's name as a sheet allows it: 31 characters, none of : \ / ? * [ ]. */
function sheetName(raw: string): string {
  const s = raw
    .replace(/[:\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return s || "Sheet1";
}

/** The sheet as the bytes of an .xlsx file. */
export function writeXlsx(sheet: XSheet): Uint8Array {
  const cols = sheet.header.length;
  const widths = Array.from({ length: cols }, (_, i) => sheet.widths?.[i] ?? 16);
  const rows = [
    `<row r="1">${sheet.header.map((h, i) => cellXml(`${colName(i)}1`, h, STYLE.head)).join("")}</row>`,
    ...sheet.rows.map((r, n) => `<row r="${n + 2}">${r.slice(0, cols).map((v, i) => cellXml(`${colName(i)}${n + 2}`, v)).join("")}</row>`),
  ];
  const files: Record<string, string> = {
    "[Content_Types].xml":
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
    "_rels/.rels": `<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews>` + `<sheets><sheet name="${esc(sheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<Relationships xmlns="${PKG_REL}">` +
      `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    // three cell styles: plain, the bold head, a moment as «dd.mm.yyyy hh:mm»
    "xl/styles.xml":
      `<styleSheet xmlns="${MAIN}">` +
      `<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy\\ hh:mm"/></numFmts>` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="3">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `</cellXfs>` +
      `</styleSheet>`,
    "xl/worksheets/sheet1.xml":
      `<worksheet xmlns="${MAIN}">` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      (cols ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(255, Math.max(1, w))}" customWidth="1"/>`).join("")}</cols>` : "") +
      `<sheetData>${rows.join("")}</sheetData>` +
      `</worksheet>`,
  };
  const parts: Record<string, Uint8Array> = {};
  for (const [name, xml] of Object.entries(files)) parts[name] = strToU8(HEAD + xml);
  return zipSync(parts, { level: 6 });
}

/* ---------- moments ---------- */

const DAY_MS = 86_400_000;
/** The sheet's day 0 (30.12.1899) is this many days before 1.1.1970. */
const EPOCH_DAYS = 25_569;

/** A moment as a sheet's day number, by the clock of `tz`: what a date cell holds. */
export function excelSerial(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  const [y, m, d] = p.date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS + EPOCH_DAYS + p.minutes / 1440;
}

/** A sheet's day number back as a wall-clock day and time, to the minute. */
export function serialToLocal(serial: number): { date: string; time: string } {
  const at = new Date(Math.round(((serial - EPOCH_DAYS) * DAY_MS) / 60_000) * 60_000).toISOString();
  return { date: at.slice(0, 10), time: at.slice(11, 16) };
}

/* ---------- reading ---------- */

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unesc = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (all, e: string) => {
    if (e[0] !== "#") return ENTITY[e] ?? all;
    const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });

/** A tag's attributes, by name. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = unesc(m[2] ?? m[3] ?? "");
  return out;
}

/** Every <t> inside a piece of XML, joined: a text may come in several runs. */
function texts(xml: string): string {
  let s = "";
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += unesc(m[1]);
  return s;
}

/**
 * The first sheet of an .xlsx file as rows of cells, as they stand on the
 * sheet (an empty cell is null; a row's empty end is cut). Text comes as
 * text, a number as a number, a date as its day number. Throws when the
 * bytes are no .xlsx or the sheet is larger than a client list ever is.
 */
export function readXlsx(bytes: Uint8Array): XRead {
  const zip = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/i.test(f.name) && f.originalSize <= READ.partBytes });
  const part = (name: string) => (zip[name] ? strFromU8(zip[name]) : "");
  const book = part("xl/workbook.xml");
  if (!book) throw new Error("not an .xlsx file");
  const first = attrs(/<sheet\b[^>]*>/.exec(book)?.[0] ?? "");
  let target = "worksheets/sheet1.xml";
  for (const m of part("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Id === first["r:id"] && a.Target) target = a.Target;
  }
  const sheet = part(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  if (!sheet) throw new Error("the .xlsx file has no sheet");

  const shared: string[] = [];
  for (const m of part("xl/sharedStrings.xml").matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(texts(m[1] ?? ""));

  const rows: XValue[][] = [];
  for (const r of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const at = Number(attrs(r[1]).r) || rows.length + 1;
    if (at > READ.rows) throw new Error("the sheet has too many rows");
    while (rows.length < at) rows.push([]);
    const row = rows[at - 1];
    let next = 0;
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(c[1]);
      const col = a.r ? colIndex(a.r.replace(/\d+$/, "")) : next;
      if (col < 0 || col >= READ.cols) throw new Error("the sheet has too many columns");
      next = col + 1;
      const body = c[2] ?? "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: XValue = null;
      if (a.t === "inlineStr") value = texts(body);
      else if (v == null) value = null;
      else if (a.t === "s") value = shared[Number(v)] ?? "";
      else if (a.t === "str") value = unesc(v);
      else if (a.t === "b") value = v.trim() === "1";
      else if (a.t === "e") value = null;
      else value = Number.isFinite(Number(v)) && v.trim() !== "" ? Number(v) : unesc(v);
      while (row.length < col) row.push(null);
      row[col] = value;
    }
    while (row.length && row[row.length - 1] == null) row.pop();
  }
  return { name: first.name ?? "", rows };
}
