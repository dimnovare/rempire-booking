/**
 * C5: the invoice as a PDF, one A4 page (more when it is long). Built after
 * the shop's invoice (rempire-web src/lib/invoice-pdf.ts): the same pdf-lib +
 * fontkit pair, the same three faces (Oswald, Golos Text, PT Mono; SIL Open
 * Font License 1.1), the tower, Estonian headings with an English line and,
 * on a Russian receiver's invoice, a quieter Russian third line.
 *
 * What is printed is the legal minimum of an Estonian invoice (VAT Act §37):
 * the seller with address, registry code and KMKR number; the buyer with
 * address (and VAT number when given); the serial number, issue and due
 * dates; the period; each line with quantity, unit price, discount, net,
 * VAT rate and total; the totals with VAT per rate; and how to pay, with
 * the reference number (src/lib/billing/reference.ts) beside the IBAN, as
 * Isolta fills it.
 *
 * The invoice's own note is not printed: it is internal, as Isolta's
 * «Заметка (не будет видна на инвойсе)» (Dim, 24.11.2026). The issuer's
 * foot text («Текст внизу счёта») is.
 *
 * Pure: renderInvoicePdf() prints only what it is handed (the invoice's own
 * frozen parties and lines), so the same issued invoice always prints the
 * same, and a test can read it without a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { amountText } from "../money";
import { TEST_NUMBER_PREFIX, testRun } from "../test-run";
import type { Party } from "./invoices";
import { referenceNumber } from "./reference";

export type PdfLang = "ru" | "et" | "en";

export type PdfLine = { text: string; qty: number; unitCents: number; discountCents: number; vatBp: number; netCents: number; vatCents: number; grossCents: number };

export type InvoicePdfData = {
  kind: "invoice" | "credit";
  number: string;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate: string;
  periodFrom: string;
  periodTo: string;
  creditOfNumber: string | null;
  lang: PdfLang;
  seller: Party;
  buyer: Party;
  lines: PdfLine[];
  netCents: number;
  vatCents: number;
  grossCents: number;
  /** staging (src/lib/test-run.ts): the «ТЕСТ / NÄIDIS» stamp on every page; a TEST- number gets it too */
  test?: boolean;
  /**
   * A draft looked at before it is sent («Посмотреть и отправить счёт»): it
   * has no number yet, so none is printed, and every page carries the
   * «ЧЕРНОВИК / MUSTAND» stamp. Never sent to anyone.
   */
  draft?: boolean;
};

export function invoicePdfFilename(number: string): string {
  return `rempire-arve-${String(number || "arve").replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`;
}

type Tri = { et: string; en: string; ru: string };

const W = {
  title: { et: "ARVE", en: "Invoice", ru: "Счёт" },
  credit: { et: "KREEDITARVE", en: "Credit note", ru: "Кредит-счёт" },
  number: { et: "Arve nr", en: "Invoice no", ru: "№ счёта" },
  date: { et: "Kuupäev", en: "Date", ru: "Дата" },
  due: { et: "Maksetähtaeg", en: "Due date", ru: "Срок оплаты" },
  period: { et: "Periood", en: "Period", ru: "Период" },
  creditOf: { et: "Krediteeritav arve", en: "Credits invoice", ru: "К счёту" },
  seller: { et: "Müüja", en: "Seller", ru: "Продавец" },
  buyer: { et: "Ostja", en: "Buyer", ru: "Покупатель" },
  regCode: { et: "Registrikood", en: "Reg. code", ru: "Рег. код" },
  vatNo: { et: "KMKR nr", en: "VAT no", ru: "Номер НДС" },
  desc: { et: "Kirjeldus", en: "Description", ru: "Наименование" },
  qty: { et: "Kogus", en: "Qty", ru: "Кол-во" },
  unit: { et: "Hind km-ga", en: "Unit incl. VAT", ru: "Цена с НДС" },
  discount: { et: "Allahindlus", en: "Discount", ru: "Скидка" },
  net: { et: "Summa km-ta", en: "Net", ru: "Без НДС" },
  vatRate: { et: "KM %", en: "VAT %", ru: "НДС %" },
  total: { et: "Kokku", en: "Total", ru: "Итого" },
  netTotal: { et: "Summa ilma käibemaksuta", en: "Subtotal excl. VAT", ru: "Сумма без НДС" },
  vatTotal: { et: "Käibemaks {r} %", en: "VAT {r} %", ru: "НДС {r} %" },
  noVat: { et: "Käibemaksuta", en: "No VAT", ru: "Без НДС" },
  dueTotal: { et: "Kokku tasuda", en: "Total due", ru: "Итого к оплате" },
  refund: { et: "Tagastatav summa", en: "Amount credited", ru: "Сумма к возврату" },
  payment: { et: "Maksmine", en: "Payment", ru: "Оплата" },
  beneficiary: { et: "Saaja", en: "Beneficiary", ru: "Получатель" },
  bank: { et: "Pank", en: "Bank", ru: "Банк" },
  viite: { et: "Viitenumber", en: "Reference no", ru: "Референц-номер" },
  reference: { et: "Selgitus", en: "Payment details", ru: "Пояснение платежа" },
  amount: { et: "Summa", en: "Amount", ru: "Сумма" },
  page: { et: "lk", en: "page", ru: "стр." },
  draftNo: { et: "mustand", en: "draft", ru: "черновик" },
} satisfies Record<string, Tri>;

const lab = (w: Tri, lang: PdfLang, r?: string) => {
  const f = (s: string) => (r == null ? s : s.replace("{r}", r));
  return [f(w.et), f(w.en), ...(lang === "ru" ? [f(w.ru)] : [])].join(" / ");
};
const lines3 = (w: Tri, lang: PdfLang) => [w.et, w.en, ...(lang === "ru" ? [w.ru] : [])];

/* ---------- the faces and the mark ---------- */

let faces: { display: Buffer; body: Buffer; mono: Buffer } | null = null;
let tower: { d: string; box: [number, number, number, number] } | null | undefined;

function fontFiles() {
  if (!faces) {
    const dir = join(process.cwd(), "src/app/fonts");
    faces = {
      display: readFileSync(join(dir, "Oswald-Medium.ttf")),
      body: readFileSync(join(dir, "GolosText-Regular.ttf")),
      mono: readFileSync(join(dir, "PTMono-Regular.ttf")),
    };
  }
  return faces;
}

/** The tower's one path and its viewBox (never redrawn; docs/brand.md). No mark is a cosmetic loss, never a failed invoice. */
function towerPath() {
  if (tower !== undefined) return tower;
  tower = null;
  try {
    const svg = readFileSync(join(process.cwd(), "public/brand/rempire-tower.svg"), "utf8");
    const d = /\sd="([^"]+)"/.exec(svg)?.[1];
    const nums = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? "").trim().split(/[\s,]+/).map(Number);
    if (d && nums.length === 4 && nums.every(Number.isFinite)) tower = { d, box: [nums[0], nums[1], nums[2], nums[3]] };
  } catch {
    /* printed without the mark */
  }
  return tower;
}

/* ---------- drawing ---------- */

const A4_W = 595.28;
const A4_H = 841.89;
const M = 44;
const INK = rgb(0x1c / 255, 0x1a / 255, 0);
const PAPER = rgb(1, 1, 1);
const MUTED = rgb(0.42, 0.41, 0.35);
const RULE = rgb(0.82, 0.81, 0.76);

/* the right edge of every numeric column */
const COL = { desc: M, descW: 186, qty: 262, unit: 320, disc: 378, net: 436, rate: 472, total: A4_W - M };

export const humanDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "");
};

const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const euro = (c: number) => `${amountText(c)} €`;
const rateText = (bp: number) => {
  const p = bp / 100;
  return Number.isInteger(p) ? String(p) : String(p).replace(".", ",");
};

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 4): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else {
      out.push(line);
      line = word;
      if (out.length === maxLines) break;
    }
  }
  if (line && out.length < maxLines) out.push(line);
  return out;
}

function right(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function drawTower(page: PDFPage, left: number, top: number, height: number) {
  const t = towerPath();
  if (!t) return;
  const [minX, minY, , boxH] = t.box;
  const scale = height / boxH;
  page.drawSvgPath(t.d, { x: left - minX * scale, y: top + minY * scale, scale, color: INK, borderWidth: 0 });
}

function wordmark(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, tracking: number) {
  let cx = x;
  for (const ch of text) {
    page.drawText(ch, { x: cx, y, size, font, color: INK });
    cx += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

/** The invoice, as bytes. */
/** Across the middle of the page, so no test invoice passes for a real one. */
function testStamp(page: PDFPage, font: PDFFont) {
  const text = "ТЕСТ / NÄIDIS";
  const size = 72;
  const a = (35 * Math.PI) / 180;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: A4_W / 2 - (w / 2) * Math.cos(a) + (size / 3) * Math.sin(a),
    y: A4_H / 2 - (w / 2) * Math.sin(a) - (size / 3) * Math.cos(a),
    size,
    font,
    color: rgb(0.8, 0.1, 0.1),
    opacity: 0.22,
    rotate: degrees(35),
  });
}

/** Higher on the page than the test stamp, so a draft on staging shows both, and the preview shows this one first. */
function draftStamp(page: PDFPage, font: PDFFont) {
  const text = "ЧЕРНОВИК / MUSTAND";
  const size = 54;
  const a = (35 * Math.PI) / 180;
  const w = font.widthOfTextAtSize(text, size);
  const cy = A4_H * 0.72;
  page.drawText(text, {
    x: A4_W / 2 - (w / 2) * Math.cos(a) + (size / 3) * Math.sin(a),
    y: cy - (w / 2) * Math.sin(a) - (size / 3) * Math.cos(a),
    size,
    font,
    color: rgb(0x31 / 255, 0x2e / 255, 0x6b / 255),
    opacity: 0.2,
    rotate: degrees(35),
  });
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const L = data.lang;
  // a draft has no number: «mustand / draft» stands where it will be
  const number = data.draft ? lab(W.draftNo, L) : clean(data.number, 40);
  if (!number) throw new Error("bad_invoice_number");
  const files = fontFiles();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = {
    display: await doc.embedFont(files.display, { subset: true }),
    body: await doc.embedFont(files.body, { subset: true }),
    mono: await doc.embedFont(files.mono, { subset: true }),
  };
  const credit = data.kind === "credit";
  const T = credit ? W.credit : W.title;
  doc.setTitle(`${lab(T, L)} ${number}`);
  doc.setProducer("REMPIRE booking");
  doc.setCreator("REMPIRE booking");

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = doc.addPage([A4_W, A4_H]);
    p.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: PAPER });
    pages.push(p);
    return p;
  };
  let page = newPage();
  let y = A4_H - M;

  /* ---- the mark and the title ---- */
  drawTower(page, M, y + 4, 40);
  wordmark(page, "REMPIRE", M + 36, y - 22, F.display, 20, 3);
  right(page, T.et, A4_W - M, y - 18, F.display, credit ? 20 : 26);
  right(page, T.en, A4_W - M, y - 34, F.body, 10, MUTED);
  if (L === "ru") right(page, T.ru, A4_W - M, y - 47, F.body, 10, MUTED);
  y -= L === "ru" ? 70 : 58;

  /* ---- number, dates, period: right; seller, then buyer: left ---- */
  const metaTop = y;
  const meta: [string, string, PDFFont][] = [
    [lab(W.number, L), number, F.mono],
    [lab(W.date, L), humanDate(data.issueDate), F.body],
    ...(credit ? [] : ([[lab(W.due, L), humanDate(data.dueDate), F.body]] as [string, string, PDFFont][])),
    // a free invoice is of one day, which the date above says already
    ...(data.periodFrom === data.periodTo ? [] : ([[lab(W.period, L), `${humanDate(data.periodFrom)}–${humanDate(data.periodTo)}`, F.body]] as [string, string, PDFFont][])),
    ...(data.creditOfNumber ? ([[lab(W.creditOf, L), clean(data.creditOfNumber, 40), F.mono]] as [string, string, PDFFont][]) : []),
  ];
  let my = metaTop;
  for (const [label, value, font] of meta) {
    right(page, value, A4_W - M, my, font, 10);
    right(page, label, A4_W - M - font.widthOfTextAtSize(value, 10) - 10, my, F.body, 8, MUTED);
    my -= 15;
  }

  const party = (title: string, rows: string[], x: number, top: number, width: number) => {
    let py = top;
    page.drawText(title.toUpperCase(), { x, y: py, size: 7.5, font: F.body, color: MUTED });
    py -= 14;
    rows.filter(Boolean).forEach((row, i) => {
      for (const line of wrapText(row, F.body, i === 0 ? 10.5 : 9, width, 2)) {
        page.drawText(line, { x, y: py, size: i === 0 ? 10.5 : 9, font: F.body, color: INK });
        py -= i === 0 ? 14 : 12;
      }
    });
    return py;
  };
  const s = data.seller;
  const b = data.buyer;
  const sellerBottom = party(
    lab(W.seller, L),
    [clean(s.name, 120), clean(s.address, 200), s.regCode ? `${lab(W.regCode, L)}: ${clean(s.regCode, 20)}` : "", s.vatNumber ? `${lab(W.vatNo, L)}: ${clean(s.vatNumber, 20)}` : "", [clean(s.email, 100), clean(s.phone, 30)].filter(Boolean).join(" · ")],
    M,
    metaTop,
    250,
  );
  const buyerBottom = party(
    lab(W.buyer, L),
    [clean(b.name, 120), clean(b.address, 300), b.regCode ? `${lab(W.regCode, L)}: ${clean(b.regCode, 20)}` : "", b.vatNumber ? `${lab(W.vatNo, L)}: ${clean(b.vatNumber, 20)}` : "", clean(b.email, 100)],
    M,
    Math.min(my, sellerBottom) - 8,
    300,
  );
  y = buyerBottom - 14;

  /* ---- the table ---- */
  const headLines = L === "ru" ? 3 : 2;
  const tableHead = () => {
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: A4_W - M, y: y + 2 }, thickness: 1, color: INK });
    const cols: [Tri, "l" | "r", number][] = [
      [W.desc, "l", COL.desc],
      [W.qty, "r", COL.qty],
      [W.unit, "r", COL.unit],
      [W.discount, "r", COL.disc],
      [W.net, "r", COL.net],
      [W.vatRate, "r", COL.rate],
      [W.total, "r", COL.total],
    ];
    for (const [w, align, x] of cols) {
      lines3(w, L).forEach((line, i) => {
        const size = i === 2 ? 6.5 : 7;
        const ly = y - 9 - i * 9;
        const color = i === 2 ? MUTED : INK;
        if (align === "l") page.drawText(line, { x, y: ly, size, font: F.body, color });
        else right(page, line, x, ly, F.body, size, color);
      });
    }
    y -= 10 + headLines * 9;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4_W - M, y: y + 4 }, thickness: 0.6, color: RULE });
    y -= 12;
  };
  const footer = () => {
    page.drawText(clean([s.name, s.address, s.email].filter(Boolean).join(" · "), 200), { x: M, y: 20, size: 7.5, font: F.body, color: MUTED });
  };
  const nextPage = () => {
    footer();
    page = newPage();
    y = A4_H - M;
    page.drawText(`${lab(W.number, L)}: ${number}`, { x: M, y, size: 9, font: F.body, color: MUTED });
    y -= 22;
  };

  tableHead();
  for (const line of data.lines) {
    const desc = wrapText(clean(line.text, 200), F.body, 9, COL.descW, 3);
    // 12 pt per text line, and room for the rule between the last line's descenders and the next row's capitals
    const rowH = Math.max(1, desc.length) * 12 + 8;
    if (y - rowH < 90) {
      nextPage();
      tableHead();
    }
    desc.forEach((t, i) => page.drawText(t, { x: COL.desc, y: y - i * 12, size: 9, font: F.body, color: INK }));
    right(page, String(line.qty), COL.qty, y, F.body, 9);
    right(page, amountText(line.unitCents), COL.unit, y, F.body, 9);
    right(page, line.discountCents ? amountText(-line.discountCents) : "", COL.disc, y, F.body, 9);
    right(page, amountText(line.netCents), COL.net, y, F.body, 9);
    right(page, rateText(line.vatBp), COL.rate, y, F.body, 9);
    right(page, amountText(line.grossCents), COL.total, y, F.body, 9);
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 13 }, end: { x: A4_W - M, y: y + 13 }, thickness: 0.4, color: RULE });
  }

  /* ---- totals: VAT per rate ---- */
  const perRate = new Map<number, number>();
  for (const l of data.lines) perRate.set(l.vatBp, (perRate.get(l.vatBp) ?? 0) + l.vatCents);
  const totals: [string, string, boolean][] = [[lab(W.netTotal, L), euro(data.netCents), false]];
  for (const [bp, v] of [...perRate.entries()].sort((a, c) => c[0] - a[0])) totals.push([bp ? lab(W.vatTotal, L, rateText(bp)) : lab(W.noVat, L), euro(v), false]);
  totals.push([`${lab(credit ? W.refund : W.dueTotal, L)} (EUR)`, euro(data.grossCents), true]);

  const pay = !credit && data.grossCents > 0;
  // the payer quotes the invoice's reference and number: a draft has neither yet
  const ref = data.draft ? "" : referenceNumber(number);
  const payRows: [string, string, PDFFont][] = pay
    ? [
        [lab(W.beneficiary, L), clean(s.name, 120), F.body],
        ["IBAN", clean(s.iban, 42) || "—", F.mono],
        ...(ref ? ([[lab(W.viite, L), ref, F.mono]] as [string, string, PDFFont][]) : []),
        ...(s.bankName ? ([[lab(W.bank, L), clean(s.bankName, 60), F.body]] as [string, string, PDFFont][]) : []),
        ...(data.draft ? [] : ([[lab(W.reference, L), `${lab(W.number, "et").split(" / ")[0]} ${number}`, F.mono]] as [string, string, PDFFont][])),
        [lab(W.amount, L), euro(data.grossCents), F.body],
        [lab(W.due, L), humanDate(data.dueDate), F.body],
      ]
    : [];
  const labelW = payRows.length ? Math.max(...payRows.map(([l]) => F.body.widthOfTextAtSize(l, 8))) : 0;
  const valueX = M + 14 + labelW + 12;
  const boxW = Math.min(A4_W - 2 * M, valueX - M + Math.max(180, ...payRows.map(([, v, f]) => f.widthOfTextAtSize(v, 9.5))) + 14);
  const boxH = payRows.length ? 24 + payRows.length * 14 + 10 : 0;

  if (y < 120 + boxH + totals.length * 16) nextPage();
  y -= 6;
  for (const [label, value, strong] of totals) {
    if (strong) {
      page.drawLine({ start: { x: COL.net - 60, y: y + 12 }, end: { x: A4_W - M, y: y + 12 }, thickness: 1, color: INK });
      y -= 4;
    }
    right(page, value, COL.total, y, strong ? F.display : F.body, strong ? 13 : 10);
    right(page, label, COL.total - (strong ? 90 : 80), y, F.body, strong ? 9 : 8.5, strong ? INK : MUTED);
    y -= strong ? 22 : 16;
  }

  /* ---- how to pay ---- */
  if (pay) {
    y -= 6;
    const top = y;
    page.drawRectangle({ x: M, y: top - boxH, width: boxW, height: boxH, borderColor: INK, borderWidth: 1, color: PAPER });
    let by = top - 16;
    page.drawText(lab(W.payment, L).toUpperCase(), { x: M + 14, y: by, size: 7.5, font: F.body, color: MUTED });
    by -= 16;
    for (const [label, value, font] of payRows) {
      page.drawText(label, { x: M + 14, y: by, size: 8, font: F.body, color: MUTED });
      page.drawText(value, { x: valueX, y: by, size: 9.5, font, color: INK });
      by -= 14;
    }
    y = top - boxH - 14;
  }
  // the issuer's foot text only: the invoice's note is internal and never printed
  const notes = [clean(s.note, 300)].filter(Boolean);
  for (const n of notes) {
    for (const line of wrapText(n, F.body, 8.5, A4_W - 2 * M, 3)) {
      page.drawText(line, { x: M, y, size: 8.5, font: F.body, color: MUTED });
      y -= 12;
    }
  }
  footer();
  if (data.test || number.startsWith(TEST_NUMBER_PREFIX)) for (const p of pages) testStamp(p, F.display);
  if (data.draft) for (const p of pages) draftStamp(p, F.display);
  if (pages.length > 1) pages.forEach((p, i) => right(p, `${lab(W.page, L)} ${i + 1} / ${pages.length}`, A4_W - M, 20, F.body, 7.5, MUTED));
  return doc.save();
}

/** An issued invoice from the database, as printed. */
export function pdfDataOf(
  inv: { kind: "invoice" | "credit"; number: string | null; issuedOn: string | null; dueOn: string | null; periodFrom: string; periodTo: string; creditOfNumber: string | null; locale: string; seller: Party | null; buyer: Party | null; netCents: number; vatCents: number; grossCents: number },
  lines: PdfLine[],
): InvoicePdfData {
  if (!inv.number || !inv.issuedOn || !inv.seller || !inv.buyer) throw new Error("not_issued");
  return {
    kind: inv.kind,
    number: inv.number,
    issueDate: inv.issuedOn,
    dueDate: inv.dueOn ?? inv.issuedOn,
    periodFrom: inv.periodFrom,
    periodTo: inv.periodTo,
    creditOfNumber: inv.creditOfNumber,
    lang: inv.locale === "ru" ? "ru" : inv.locale === "en" ? "en" : "et",
    seller: inv.seller,
    buyer: inv.buyer,
    lines,
    netCents: inv.netCents,
    vatCents: inv.vatCents,
    grossCents: inv.grossCents,
    test: testRun(),
  };
}
