/**
 * REMPIRE's old invoices from Isolta (Finago Isolta), kept as history (Dim,
 * 20.11.2026: «Import the issued ones as history»). The command is
 * scripts/import-isolta-invoices.ts; the columns are 027_invoice_import.sql.
 *
 * Isolta's export (a zip, or the folder it unpacks to):
 *   invoices.csv                  one row per invoice, drafts too: id,
 *                                 modificationState, number, reference, date,
 *                                 dueDate, paymentDate, recipient, the three
 *                                 totals (dot decimals), currency, memo;
 *   contacts.csv                  the contacts: contactType 1 company, 2
 *                                 person; businessId, e-mail, address, language;
 *   finvoices/invoice-<id>.xml    each sent invoice as Finvoice 3.0 (ISO-8859-15,
 *                                 comma decimals, CCYYMMDD dates): both
 *                                 parties, the rows and the totals;
 *   invoices/invoice-<id>.pdf     the originals: never read here.
 *
 * What is imported: an invoice with a number that is not a draft (Isolta
 * numbers an invoice when it is sent; a modification in progress is a
 * second row «Draft» with the same number) and has its Finvoice file. The
 * file is the invoice as it was sent, so its parties, rows and totals are
 * what we keep; the CSV says what state it is in and when it was paid.
 *
 * How it lands (027): status 'issued' (the list shows «просрочен» past the
 * due day: nothing is recorded as paid unless Isolta had a payment date),
 * free, its period its own day, staff_id null, source 'isolta' with Isolta's
 * id. A credit invoice (INV02 / 381) is imported as ours are, linked to the
 * invoice it credits, which turns 'credited'. The receiver is ours when the
 * registry code, or else the name, matches; otherwise one is made, switched
 * off. The issuer is ours with the seller's registry code, else the default.
 * The number series (invoice_counters) is never touched.
 *
 * Two steps, so a dry run writes nothing at all: planIsoltaImport() only
 * reads, applyIsoltaImport() writes the plan in the caller's transaction.
 * The report (isoltaReport) names no client and prints no bank data.
 */
import type { Querier } from "../db";
import { amountText, splitGross } from "../money";
import { todayIn, zonedToUtc } from "../tz";
import type { Party } from "./invoices";
import type { ReceiverKind } from "./parties";

/* ---------- CSV ---------- */

/**
 * RFC 4180: a field in double quotes may hold the delimiter, line breaks and
 * doubled quotes. CRLF, LF or CR end a row; a BOM is dropped; blank lines
 * are skipped. A quote inside an unquoted field is kept as it is.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (s[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      started = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
      started = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
    } else {
      field += c;
      started = true;
    }
  }
  if (started || field) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** The rows under the header as records; `bad` holds the 1-based row numbers whose field count is not the header's. */
export function csvRecords(text: string, delimiter = ","): { header: string[]; records: Record<string, string>[]; bad: number[] } {
  const [head = [], ...rows] = parseCsv(text, delimiter);
  const header = head.map((h) => h.trim());
  const records: Record<string, string>[] = [];
  const bad: number[] = [];
  rows.forEach((r, i) => {
    if (r.length !== header.length) bad.push(i + 1);
    records.push(Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])));
  });
  return { header, records, bad };
}

/* ---------- numbers and days ---------- */

/**
 * An amount → integer cents, half away from zero: «1234.5600» (Isolta's
 * CSV), «1 234,56» (Finvoice), «-12,5». With both «.» and «,» the last one
 * is the decimal mark. Null for anything else.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  let t = String(raw ?? "").replace(/[\s  €]/g, "");
  if (!t) return null;
  let neg = false;
  if (t[0] === "-" || t[0] === "−") {
    neg = true;
    t = t.slice(1);
  } else if (t[0] === "+") t = t.slice(1);
  const dec = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  const int = dec >= 0 ? t.slice(0, dec).replace(/[.,]/g, "") : t;
  const frac = dec >= 0 ? t.slice(dec + 1) : "";
  if (!/^\d*$/.test(int) || !/^\d*$/.test(frac) || (!int && !frac)) return null;
  let cents = Number(int || "0") * 100 + Number(`${frac}00`.slice(0, 2));
  if (Number(frac[2] ?? "0") >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return neg && cents ? -cents : cents;
}

/** A decimal such as a quantity («1,0000», «2.5») → a number; null for anything else. */
export function parseDecimal(raw: string | null | undefined): number | null {
  const t = String(raw ?? "").replace(/[\s  ]/g, "").replace(/^−/, "-");
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null;
  return Number(t.replace(",", "."));
}

const isRealDay = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2999 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** «2026-11-01», «20261101» (Finvoice CCYYMMDD) or «01.11.2026» → «2026-11-01»; null for anything else. */
export function parseDay(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  const iso = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(t);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (!iso && !dotted) return null;
  const [y, mo, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(dotted![3]), Number(dotted![2]), Number(dotted![1])];
  if (!isRealDay(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/* ---------- XML ---------- */

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function unescapeXml(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (whole, e: string) => {
    if (e[0] !== "#") return ENTITIES[e] ?? whole;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}

/** The «>» that ends the tag opened at `lt`, outside quoted attribute values. */
function tagEnd(src: string, lt: number): number {
  let q = "";
  for (let i = lt + 1; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === q) q = "";
    } else if (c === '"' || c === "'") q = c;
    else if (c === ">") return i;
  }
  throw new Error("xml: a tag is not closed");
}

/**
 * A small XML reader for Finvoice: elements, attributes, text, the five
 * entities and numeric references, CDATA, comments and the declaration. A
 * DOCTYPE with an internal subset is refused: nothing is ever expanded.
 * Returns the root element; throws on a document that is not well formed.
 */
export function parseXml(src: string): XmlNode {
  const doc: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [doc];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const end = lt < 0 ? src.length : lt;
    if (end > i && stack.length > 1) top().text += unescapeXml(src.slice(i, end));
    if (lt < 0) break;
    const closeAt = (mark: string, from: number) => {
      const e = src.indexOf(mark, from);
      if (e < 0) throw new Error("xml: a comment, CDATA or declaration is not closed");
      return e + mark.length;
    };
    if (src.startsWith("<!--", lt)) i = closeAt("-->", lt + 4);
    else if (src.startsWith("<![CDATA[", lt)) {
      const e = closeAt("]]>", lt + 9);
      if (stack.length > 1) top().text += src.slice(lt + 9, e - 3);
      i = e;
    } else if (src.startsWith("<?", lt)) i = closeAt("?>", lt + 2);
    else if (src.startsWith("<!", lt)) {
      const e = tagEnd(src, lt);
      if (src.slice(lt, e).includes("[")) throw new Error("xml: a DOCTYPE with an internal subset is not read");
      i = e + 1;
    } else {
      const gt = tagEnd(src, lt);
      if (src[lt + 1] === "/") {
        const name = src.slice(lt + 2, gt).trim();
        const open = stack.pop();
        if (!open || open === doc || open.name !== name) throw new Error(`xml: </${name}> closes <${open?.name ?? ""}>`);
      } else {
        let body = src.slice(lt + 1, gt);
        const selfClosing = body.endsWith("/");
        if (selfClosing) body = body.slice(0, -1);
        const name = /^[^\s/>]+/.exec(body)?.[0];
        if (!name) throw new Error("xml: a tag with no name");
        if (stack.length === 1 && doc.children.length) throw new Error("xml: more than one root element");
        const node: XmlNode = { name, attrs: {}, children: [], text: "" };
        const attrs = body.slice(name.length);
        const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        for (let a = re.exec(attrs); a; a = re.exec(attrs)) node.attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? "");
        top().children.push(node);
        if (!selfClosing) stack.push(node);
      }
      i = gt + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`xml: <${top().name}> is not closed`);
  const root = doc.children[0];
  if (!root) throw new Error("xml: no root element");
  return root;
}

const localName = (n: string) => n.slice(n.indexOf(":") + 1);

/** The first element down a path of local names («InvoiceDetails/InvoiceNumber»). */
export function xmlFind(node: XmlNode | undefined, path: string): XmlNode | undefined {
  let cur = node;
  for (const part of path.split("/")) cur = cur?.children.find((c) => localName(c.name) === part);
  return cur;
}

export const xmlAll = (node: XmlNode | undefined, name: string): XmlNode[] => node?.children.filter((c) => localName(c.name) === name) ?? [];

const clean = (s: string | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();
const xtext = (node: XmlNode | undefined, path: string) => clean(xmlFind(node, path)?.text);
/** Every element of that name under the path's parent, joined: Finvoice repeats a name or a street up to three times. */
const xjoin = (node: XmlNode | undefined, path: string, sep = " ") => {
  const parts = path.split("/");
  const last = parts.pop()!;
  const parent = parts.length ? xmlFind(node, parts.join("/")) : node;
  return xmlAll(parent, last)
    .map((n) => clean(n.text))
    .filter(Boolean)
    .join(sep);
};

/**
 * The bytes of an XML file → text, in the encoding its declaration names
 * (Isolta writes ISO-8859-15, whose «€» is 0xA4); a BOM wins; UTF-8 if
 * nothing is said or the name is unknown.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 256));
  const label = /^<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/.exec(head)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(label.toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/* ---------- Finvoice ---------- */

export type FinvoiceParty = {
  name: string;
  regCode: string;
  vatNumber: string;
  street: string;
  postcode: string;
  town: string;
  country: string;
  countryName: string;
  email: string;
  phone: string;
  /** a department or contact person */
  contact: string;
};

export type FinvoiceRow = {
  articleId: string;
  articleName: string;
  freeText: string;
  qty: number | null;
  /** per unit as written (VAT not inside, in Finvoice) and with VAT inside if given */
  unitCents: number | null;
  unitVatIncludedCents: number | null;
  vatBp: number;
  vatCents: number | null;
  netCents: number | null;
  /** RowAmount: the row's total, VAT inside */
  grossCents: number | null;
};

export type Finvoice = {
  number: string;
  date: string | null;
  dueDate: string | null;
  typeCode: string;
  typeCodeUN: string;
  credit: boolean;
  /** a credit invoice: the number it credits, when the file says */
  originalNumber: string;
  currency: string;
  language: string;
  reference: string;
  freeText: string;
  seller: FinvoiceParty & { iban: string; bankName: string };
  buyer: FinvoiceParty;
  rows: FinvoiceRow[];
  netCents: number | null;
  vatCents: number | null;
  grossCents: number | null;
};

function partyOf(root: XmlNode, who: "Seller" | "Buyer"): FinvoiceParty {
  const d = xmlFind(root, `${who}PartyDetails`);
  const a = xmlFind(d, `${who}PostalAddressDetails`);
  return {
    name: xjoin(d, `${who}OrganisationName`),
    regCode: xtext(d, `${who}PartyIdentifier`),
    vatNumber: xtext(d, `${who}OrganisationTaxCode`),
    street: xjoin(a, `${who}StreetName`, ", "),
    postcode: xtext(a, `${who}PostCodeIdentifier`),
    town: xtext(a, `${who}TownName`),
    country: xtext(a, "CountryCode").toUpperCase(),
    countryName: xtext(a, "CountryName"),
    email: xtext(root, `${who}CommunicationDetails/${who}EmailaddressIdentifier`),
    phone: xtext(root, `${who}CommunicationDetails/${who}PhoneNumberIdentifier`),
    contact: xjoin(d, `${who}OrganisationDepartment`) || xtext(root, `${who}ContactPersonName`),
  };
}

const bpOf = (pct: string): number => {
  const v = parseDecimal(pct);
  return v == null ? 0 : Math.round(v * 100);
};

/** One Finvoice document. Throws with a plain reason when it is not one. */
export function parseFinvoice(xml: string): Finvoice {
  const root = parseXml(xml);
  if (localName(root.name) !== "Finvoice") throw new Error(`not a Finvoice file (root <${root.name}>)`);
  const d = xmlFind(root, "InvoiceDetails");
  if (!d) throw new Error("no InvoiceDetails");
  const typeCode = xtext(d, "InvoiceTypeCode").toUpperCase();
  const typeCodeUN = xtext(d, "InvoiceTypeCodeUN");
  const seller = partyOf(root, "Seller");
  const info = xmlFind(root, "SellerInformationDetails");
  const rows = xmlAll(root, "InvoiceRow").map(
    (r): FinvoiceRow => ({
      articleId: xtext(r, "ArticleIdentifier"),
      articleName: xjoin(r, "ArticleName"),
      freeText: xjoin(r, "RowFreeText"),
      qty: parseDecimal(xtext(r, "InvoicedQuantity") || xtext(r, "DeliveredQuantity")),
      unitCents: parseAmount(xtext(r, "UnitPriceAmount")),
      unitVatIncludedCents: parseAmount(xtext(r, "UnitPriceVatIncludedAmount")),
      vatBp: bpOf(xtext(r, "RowVatRatePercent")),
      vatCents: parseAmount(xtext(r, "RowVatAmount")),
      netCents: parseAmount(xtext(r, "RowVatExcludedAmount")),
      grossCents: parseAmount(xtext(r, "RowAmount")),
    }),
  );
  return {
    number: xtext(d, "InvoiceNumber"),
    date: parseDay(xtext(d, "InvoiceDate")),
    dueDate: parseDay(xtext(d, "PaymentTermsDetails/InvoiceDueDate")),
    typeCode,
    typeCodeUN,
    credit: typeCode === "INV02" || typeCodeUN === "381",
    originalNumber: xtext(d, "OriginalInvoiceNumber") || xtext(d, "OriginalInvoiceReference/InvoiceNumber"),
    currency: (xmlFind(d, "InvoiceTotalVatIncludedAmount")?.attrs.AmountCurrencyIdentifier ?? "").toUpperCase(),
    language: xtext(root, "InvoiceRecipientLanguageCode").toLowerCase(),
    reference: xtext(root, "EpiDetails/EpiPaymentInstructionDetails/EpiRemittanceInfoIdentifier"),
    freeText: xjoin(d, "InvoiceFreeText"),
    seller: {
      ...seller,
      email: seller.email || xtext(info, "SellerCommonEmailaddressIdentifier"),
      phone: seller.phone || xtext(info, "SellerPhoneNumber"),
      iban: xtext(info, "SellerAccountDetails/SellerAccountID") || xtext(root, "EpiDetails/EpiPartyDetails/EpiBeneficiaryPartyDetails/EpiAccountID"),
      bankName: xtext(root, "EpiDetails/EpiPartyDetails/EpiBfiPartyDetails/EpiBfiName"),
    },
    buyer: partyOf(root, "Buyer"),
    rows,
    netCents: parseAmount(xtext(d, "InvoiceTotalVatExcludedAmount")),
    vatCents: parseAmount(xtext(d, "InvoiceTotalVatAmount")),
    grossCents: parseAmount(xtext(d, "InvoiceTotalVatIncludedAmount")),
  };
}

/* ---------- the export ---------- */

export type IsoltaRow = {
  /** Isolta's own id: the Finvoice file's name, and source_ref */
  id: string;
  state: string;
  number: string;
  date: string | null;
  dueDate: string | null;
  paymentDate: string | null;
  recipient: string;
  netCents: number | null;
  vatCents: number | null;
  grossCents: number | null;
  currency: string;
  /** the row's place in invoices.csv, 1-based, for the report */
  line: number;
};

export type IsoltaContact = { id: string; name: string; person: boolean; regCode: string; vatNumber: string; email: string; address: string; locale: string };

export type IsoltaExport = {
  rows: IsoltaRow[];
  contacts: IsoltaContact[];
  /** Finvoice bytes by Isolta's invoice id */
  finvoices: Map<string, Uint8Array>;
  /** what could not be read at all */
  problems: string[];
};

const INVOICE_COLUMNS = ["id", "modificationState", "number", "date", "dueDate", "vatInclusiveTotal"];

const addressOf = (street: string, postcode: string, town: string, country = "", countryName = "") =>
  [street, [postcode, town].filter(Boolean).join(" "), country && country !== "EE" ? countryName || country : ""].filter(Boolean).join(", ");

/**
 * The export's files by their path inside it («invoices.csv»,
 * «finvoices/invoice-123.xml»; a folder around them is fine). PDFs are not
 * needed and may be left out.
 */
export function readIsoltaExport(files: Map<string, Uint8Array>): IsoltaExport {
  const problems: string[] = [];
  const named = (base: string) => [...files.entries()].find(([p]) => p.replace(/\\/g, "/").split("/").pop()?.toLowerCase() === base)?.[1];
  const utf8 = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

  const inv = named("invoices.csv");
  const rows: IsoltaRow[] = [];
  if (!inv) problems.push("invoices.csv is missing");
  else {
    const { header, records, bad } = csvRecords(utf8(inv));
    const missing = INVOICE_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) problems.push(`invoices.csv: no column ${missing.join(", ")}`);
    for (const n of bad) problems.push(`invoices.csv row ${n}: the number of fields is not the header's`);
    records.forEach((r, i) => {
      if (bad.includes(i + 1)) return;
      rows.push({
        id: clean(r.id),
        state: clean(r.modificationState),
        number: clean(r.number),
        date: parseDay(r.date),
        dueDate: parseDay(r.dueDate),
        paymentDate: parseDay(r.paymentDate),
        recipient: clean(r.recipient),
        netCents: parseAmount(r.vatExclusiveTotal),
        vatCents: parseAmount(r.vatTotal),
        grossCents: parseAmount(r.vatInclusiveTotal),
        currency: clean(r.currency).toUpperCase(),
        line: i + 1,
      });
    });
  }

  const con = named("contacts.csv");
  const contacts: IsoltaContact[] = [];
  if (con) {
    const { records } = csvRecords(utf8(con));
    for (const r of records) {
      const billing = addressOf(clean(r["billingAddress.streetAddress"]), clean(r["billingAddress.zipCode"]), clean(r["billingAddress.city"]), clean(r["billingAddress.countryCode"]).toUpperCase());
      contacts.push({
        id: clean(r.id),
        name: clean(r.name),
        person: clean(r.contactType) === "2",
        regCode: clean(r.businessId),
        vatNumber: clean(r.vatNumber),
        email: clean(r.email),
        address: billing || addressOf(clean(r["addresses.0.streetAddress"]), clean(r["addresses.0.zipCode"]), clean(r["addresses.0.city"]), clean(r["addresses.0.countryCode"]).toUpperCase()),
        locale: clean(r.languageCode).toLowerCase(),
      });
    }
  }

  const finvoices = new Map<string, Uint8Array>();
  for (const [p, bytes] of files) {
    const m = /(?:^|\/)finvoices\/invoice-([^/]+)\.xml$/i.exec(p.replace(/\\/g, "/"));
    if (m) finvoices.set(m[1], bytes);
  }
  return { rows, contacts, finvoices, problems };
}

/* ---------- matching ---------- */

/** A name to compare: case, quotes, punctuation and «OU»/«OÜ» do not count. */
export function nameKey(s: string): string {
  return s
    .normalize("NFKC")
    .toLocaleLowerCase("et")
    .replace(/[«»"'“”„`´’]/g, "")
    .replace(/[.,;:()[\]/\\_-]+/g, " ")
    .replace(/(^|\s)ou(?=\s|$)/g, "$1oü")
    .replace(/\s+/g, " ")
    .trim();
}

/** A registry code to compare: its digits. */
export const regKey = (s: string) => String(s ?? "").replace(/\D/g, "");

const COMPANY = /(^|[\s,])(oü|ou|as|mtü|sa|uü|tü)(?=[\s,.]|$)/iu;
const FIE = /(^|[\s,])fie(?=[\s,.]|$)/iu;

/** What kind of receiver a buyer is, for one the import has to make. */
export function receiverKindOf(name: string, regCode: string, person: boolean | null): ReceiverKind {
  if (person) return "person";
  if (FIE.test(name)) return "fie";
  if (COMPANY.test(name)) return "ou";
  if (person === false || regKey(regCode)) return "fie";
  return "person";
}

/* ---------- the plan ---------- */

export type PlanLine = { text: string; qty: number; unitCents: number; discountCents: number; vatBp: number; grossCents: number; netCents: number; vatCents: number };

export type PlannedInvoice = {
  ref: string;
  number: string;
  state: string;
  issuerId: string;
  receiverKey: string;
  kind: "invoice" | "credit";
  /** a credit invoice: the one it credits, in this plan (by ref) or in the database already (by id) */
  creditOfRef: string | null;
  creditOfId: string | null;
  issuedOn: string;
  dueOn: string;
  paidOn: string | null;
  seller: Party;
  buyer: Party;
  locale: "ru" | "et" | "en";
  netCents: number;
  vatCents: number;
  grossCents: number;
  note: string;
  lines: PlanLine[];
};

export type PlannedReceiver = {
  key: string;
  /** reg: our receiver with the registry code; name: with the name; new: one to make, switched off */
  how: "reg" | "name" | "new";
  id: string | null;
  invoices: number;
  numbers: string[];
  create: { kind: ReceiverKind; legalName: string; regCode: string; vatNumber: string; address: string; email: string; vatMode: "vat" | "none"; termsDays: number; locale: "ru" | "et" | "en" } | null;
};

export type SkipWhy =
  | "draft"
  | "no_number"
  | "no_finvoice"
  | "bad_finvoice"
  | "number_mismatch"
  | "currency"
  | "no_date"
  | "no_receiver"
  | "duplicate_number"
  | "number_taken"
  | "credit_unlinked"
  | "credit_twice";

export type WarnWhy = "csv_totals" | "line_totals" | "no_rows" | "no_text" | "text_cut" | "fractional_qty" | "unknown_state" | "ambiguous_name" | "issuer_default";

export type IsoltaPlan = {
  businessId: string;
  timezone: string;
  today: string;
  read: { rows: number; finvoices: number; contacts: number };
  insert: PlannedInvoice[];
  existing: { ref: string; number: string }[];
  skipped: { ref: string; number: string; why: SkipWhy; detail?: string }[];
  warnings: { ref: string; number: string; why: WarnWhy; detail?: string }[];
  receivers: PlannedReceiver[];
  issuers: { id: string; isDefault: boolean; byReg: number; byDefault: number; counterLast: number | null; maxNumber: number | null }[];
  problems: string[];
};

type OurIssuer = { id: string; reg_code: string; is_default: boolean; active: boolean; yearly: boolean; legal_name: string; vat_number: string; address: string; email: string; phone: string; iban: string; bank_name: string; note: string };
type OurReceiver = { id: string; legal_name: string; reg_code: string; active: boolean; staff_id: string | null };

const KNOWN_STATES = new Set(["NotModified", "IsModified", "Open"]);
const LOCALES = ["ru", "et", "en"] as const;
const localeOf = (s: string): "ru" | "et" | "en" => LOCALES.find((l) => l === s.toLowerCase()) ?? "et";
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const numeric = (n: string) => (/^\d{1,9}$/.test(n) ? Number(n) : null);

/** One Finvoice row → our line, its amounts as Isolta printed them. */
function lineOf(r: FinvoiceRow): { line: PlanLine; warn: WarnWhy[] } {
  const warn: WarnWhy[] = [];
  const gross = r.grossCents ?? (r.netCents != null ? r.netCents + (r.vatCents ?? 0) : null) ?? (r.qty != null && r.unitCents != null ? Math.round(r.qty * r.unitCents) : 0);
  const split = r.netCents != null ? { net: r.netCents, vat: gross - r.netCents } : r.vatCents != null ? { net: gross - r.vatCents, vat: r.vatCents } : splitGross(gross, r.vatBp);
  let text = r.articleName && r.articleId ? `${r.articleName} (${r.articleId})` : r.articleName || r.articleId || r.freeText;
  if (!text) {
    text = "—";
    warn.push("no_text");
  } else if (text.length > 200) {
    text = cut(text, 200);
    warn.push("text_cut");
  }
  let qty = r.qty ?? 1;
  let unit: number;
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 999) {
    if (r.qty != null) warn.push("fractional_qty");
    qty = 1;
    unit = gross;
  } else {
    unit = r.unitVatIncludedCents ?? (r.unitCents != null ? (r.vatBp ? Math.round((r.unitCents * (10000 + r.vatBp)) / 10000) : r.unitCents) : Math.round(gross / qty));
  }
  if (Math.abs(unit) > 10_000_000) {
    qty = 1;
    unit = gross;
  }
  return { line: { text, qty, unitCents: unit, discountCents: qty * unit - gross, vatBp: r.vatBp, grossCents: gross, netCents: split.net, vatCents: split.vat }, warn };
}

const hasAmount = (r: FinvoiceRow) => r.grossCents != null || r.netCents != null || r.unitCents != null || r.unitVatIncludedCents != null;

/**
 * What an import of `exp` into the business would do, from what is in the
 * database now. Reads only. Throws «no_issuer» when the business has no
 * invoice issuer yet (set REMPIRE's company in «Счета» → «Настройки» first).
 */
export async function planIsoltaImport(q: Querier, business: { id: string; timezone: string }, exp: IsoltaExport, now = Date.now()): Promise<IsoltaPlan> {
  const today = todayIn(business.timezone, now);
  const issuers = await q<OurIssuer>(
    `select id, reg_code, is_default, active, yearly, legal_name, vat_number, address, email, phone, iban, bank_name, note
       from invoice_issuers where business_id = $1 order by is_default desc, active desc, created_at`,
    [business.id],
  );
  if (!issuers.length) throw new Error("no_issuer");
  const fallback = issuers.find((i) => i.is_default) ?? issuers.find((i) => i.active) ?? issuers[0];
  const ours = await q<OurReceiver>("select id, legal_name, reg_code, active, staff_id from invoice_receivers where business_id = $1 order by active desc, staff_id is null, created_at", [business.id]);
  const imported = await q<{ id: string; ref: string; number: string; issuer_id: string; status: string; credited: boolean }>(
    `select i.id, i.source_ref as ref, i.number, i.issuer_id, i.status, exists (select 1 from invoices c where c.credit_of = i.id) as credited
       from invoices i where i.business_id = $1 and i.source = 'isolta'`,
    [business.id],
  );
  const taken = await q<{ issuer_id: string; number: string }>("select issuer_id, number from invoices where business_id = $1 and source = 'ours' and number is not null", [business.id]);

  const plan: IsoltaPlan = {
    businessId: business.id,
    timezone: business.timezone,
    today,
    read: { rows: exp.rows.length, finvoices: exp.finvoices.size, contacts: exp.contacts.length },
    insert: [],
    existing: [],
    skipped: [],
    warnings: [],
    receivers: [],
    issuers: [],
    problems: [...exp.problems],
  };
  const skip = (r: IsoltaRow, why: SkipWhy, detail?: string) => plan.skipped.push({ ref: r.id, number: r.number, why, ...(detail ? { detail } : {}) });
  const warn = (ref: string, number: string, why: WarnWhy, detail?: string) => plan.warnings.push({ ref, number, why, ...(detail ? { detail } : {}) });

  const importedByRef = new Map(imported.map((i) => [i.ref, i]));
  const takenSet = new Set(taken.map((t) => `${t.issuer_id}\u0000${t.number}`));
  const usedNumbers = new Map<string, string>(imported.map((i) => [`${i.issuer_id}\u0000${i.number}`, i.ref]));
  const issuerUse = new Map<string, { byReg: number; byDefault: number }>();
  const groups = new Map<string, { regDigits: string; names: Set<string>; docs: { inv: PlannedInvoice; doc: Finvoice }[] }>();
  /** a credit invoice: the number it says it credits */
  const originalOf = new Map<PlannedInvoice, string>();

  // the oldest first, so of two rows with one number the first one wins
  const order = [...exp.rows].sort((a, b) => (numeric(a.number) ?? 1e12) - (numeric(b.number) ?? 1e12) || a.id.localeCompare(b.id, "en", { numeric: true }));
  for (const r of order) {
    if (!r.id) continue;
    if (r.state === "Draft") {
      skip(r, "draft");
      continue;
    }
    if (!r.number) {
      skip(r, "no_number");
      continue;
    }
    if (importedByRef.has(r.id)) {
      plan.existing.push({ ref: r.id, number: r.number });
      continue;
    }
    const bytes = exp.finvoices.get(r.id);
    if (!bytes) {
      skip(r, "no_finvoice");
      continue;
    }
    let doc: Finvoice;
    try {
      doc = parseFinvoice(decodeXmlBytes(bytes));
    } catch (err) {
      skip(r, "bad_finvoice", err instanceof Error ? err.message : String(err));
      continue;
    }
    if (doc.number && doc.number !== r.number) {
      skip(r, "number_mismatch");
      continue;
    }
    const currency = doc.currency || r.currency;
    if (currency && currency !== "EUR") {
      skip(r, "currency", currency);
      continue;
    }
    const issuedOn = doc.date ?? r.date;
    if (!issuedOn) {
      skip(r, "no_date");
      continue;
    }
    const buyerName = doc.buyer.name || r.recipient;
    if (!buyerName) {
      skip(r, "no_receiver");
      continue;
    }
    if (!KNOWN_STATES.has(r.state)) warn(r.id, r.number, "unknown_state", r.state);

    const sellerReg = regKey(doc.seller.regCode);
    const byReg = sellerReg ? issuers.find((i) => regKey(i.reg_code) === sellerReg) : undefined;
    const issuer = byReg ?? fallback;
    if (!byReg) warn(r.id, r.number, "issuer_default");
    const numberKey = `${issuer.id}\u0000${r.number}`;
    if (takenSet.has(numberKey)) {
      skip(r, "number_taken");
      continue;
    }
    if (usedNumbers.has(numberKey)) {
      skip(r, "duplicate_number", usedNumbers.get(numberKey));
      continue;
    }

    const priced = doc.rows.filter(hasAmount);
    const notes = doc.rows.filter((x) => !hasAmount(x)).map((x) => x.articleName || x.freeText || x.articleId);
    const lines: PlanLine[] = [];
    for (const row of priced) {
      const l = lineOf(row);
      lines.push(l.line);
      for (const w of l.warn) warn(r.id, r.number, w);
    }
    const gross = doc.grossCents ?? r.grossCents ?? lines.reduce((s, l) => s + l.grossCents, 0);
    const vat = doc.vatCents ?? r.vatCents ?? lines.reduce((s, l) => s + l.vatCents, 0);
    const net = doc.netCents ?? r.netCents ?? gross - vat;
    if (!lines.length) {
      warn(r.id, r.number, "no_rows");
      lines.push({ text: cut(notes.join("; ") || doc.freeText || "—", 200), qty: 1, unitCents: gross, discountCents: 0, vatBp: 0, grossCents: gross, netCents: net, vatCents: vat });
    } else if (lines.reduce((s, l) => s + l.grossCents, 0) !== gross) warn(r.id, r.number, "line_totals");
    if ((r.grossCents != null && r.grossCents !== gross) || (r.netCents != null && r.netCents !== net)) warn(r.id, r.number, "csv_totals");

    const dueOn = doc.dueDate ?? r.dueDate ?? issuedOn;
    const s = doc.seller;
    const b = doc.buyer;
    const inv: PlannedInvoice = {
      ref: r.id,
      number: r.number,
      state: r.state,
      issuerId: issuer.id,
      receiverKey: "",
      kind: doc.credit ? "credit" : "invoice",
      creditOfRef: null,
      creditOfId: null,
      issuedOn,
      dueOn: dueOn < issuedOn ? issuedOn : dueOn,
      paidOn: r.paymentDate,
      seller: {
        name: cut(s.name || issuer.legal_name, 160),
        regCode: s.regCode || issuer.reg_code,
        vatNumber: s.vatNumber,
        address: addressOf(s.street, s.postcode, s.town, s.country, s.countryName) || issuer.address,
        email: s.email || issuer.email,
        phone: s.phone || issuer.phone,
        iban: s.iban || issuer.iban,
        bankName: s.bankName || issuer.bank_name,
        note: "",
      },
      buyer: { name: cut(buyerName, 160), regCode: b.regCode, vatNumber: b.vatNumber, address: cut(addressOf(b.street, b.postcode, b.town, b.country, b.countryName), 300), email: b.email },
      locale: localeOf(doc.language),
      netCents: net,
      vatCents: vat,
      grossCents: gross,
      note: cut([doc.freeText, ...(lines.length && priced.length ? notes : [])].filter(Boolean).join(" "), 300),
      lines,
    };
    if (doc.credit) originalOf.set(inv, doc.originalNumber);
    usedNumbers.set(numberKey, r.id);
    const use = issuerUse.get(issuer.id) ?? { byReg: 0, byDefault: 0 };
    if (byReg) use.byReg++;
    else use.byDefault++;
    issuerUse.set(issuer.id, use);

    const regDigits = regKey(b.regCode);
    const key = regDigits ? `reg:${regDigits}` : `name:${nameKey(buyerName)}`;
    const g = groups.get(key) ?? { regDigits, names: new Set<string>(), docs: [] };
    g.names.add(nameKey(buyerName));
    g.docs.push({ inv, doc });
    groups.set(key, g);
    plan.insert.push(inv);
  }

  // credits: the invoice they take back, in this plan or imported before
  const plannedByNumber = new Map(plan.insert.filter((i) => i.kind === "invoice").map((i) => [`${i.issuerId}\u0000${i.number}`, i]));
  const creditTaken = new Set<string>(imported.filter((i) => i.credited).map((i) => i.ref));
  for (const inv of [...plan.insert]) {
    if (inv.kind !== "credit") continue;
    const original = originalOf.get(inv) ?? "";
    const k = `${inv.issuerId}\u0000${original}`;
    const inPlan = original ? plannedByNumber.get(k) : undefined;
    const before = original && !inPlan ? imported.find((i) => i.issuer_id === inv.issuerId && i.number === original && i.status !== "discarded") : undefined;
    const target = inPlan?.ref ?? before?.ref;
    const why: SkipWhy | null = !target ? "credit_unlinked" : creditTaken.has(target) ? "credit_twice" : null;
    if (why) {
      plan.insert = plan.insert.filter((x) => x !== inv);
      plan.skipped.push({ ref: inv.ref, number: inv.number, why, ...(original ? { detail: original } : {}) });
      for (const g of groups.values()) g.docs = g.docs.filter((d) => d.inv !== inv);
      continue;
    }
    creditTaken.add(target!);
    inv.creditOfRef = inPlan ? inPlan.ref : null;
    inv.creditOfId = before ? before.id : null;
  }

  // a buyer once written without his registry code is the one with it, when the name says so
  const regByName = new Map<string, Set<string>>();
  for (const [key, g] of groups) if (g.regDigits) for (const n of g.names) regByName.set(n, (regByName.get(n) ?? new Set()).add(key));
  for (const [key, g] of [...groups]) {
    if (g.regDigits) continue;
    const to = [...(regByName.get([...g.names][0]) ?? [])];
    if (to.length !== 1) continue;
    const target = groups.get(to[0])!;
    target.docs.push(...g.docs);
    groups.delete(key);
  }

  const contactByReg = new Map<string, IsoltaContact>();
  const contactByName = new Map<string, IsoltaContact>();
  for (const c of exp.contacts) {
    if (regKey(c.regCode)) contactByReg.set(regKey(c.regCode), c);
    contactByName.set(nameKey(c.name), c);
  }

  for (const [key, g] of groups) {
    if (!g.docs.length) continue;
    const docs = [...g.docs].sort((a, b) => a.inv.issuedOn.localeCompare(b.inv.issuedOn) || (numeric(a.inv.number) ?? 0) - (numeric(b.inv.number) ?? 0));
    for (const d of docs) d.inv.receiverKey = key;
    const numbers = docs.map((d) => d.inv.number);
    const names = new Set(docs.map((d) => nameKey(d.inv.buyer.name)));
    let match = g.regDigits ? ours.find((o) => regKey(o.reg_code) === g.regDigits) : undefined;
    let how: PlannedReceiver["how"] = match ? "reg" : "new";
    if (!match) {
      const byName = ours.filter((o) => names.has(nameKey(o.legal_name)) && (!g.regDigits || !regKey(o.reg_code) || regKey(o.reg_code) === g.regDigits));
      const active = byName.filter((o) => o.active);
      const one = byName.length === 1 ? byName[0] : active.length === 1 ? active[0] : undefined;
      if (one) {
        match = one;
        how = "name";
      } else if (byName.length > 1) warn(docs[0].inv.ref, docs[0].inv.number, "ambiguous_name");
    }
    if (match) {
      plan.receivers.push({ key, how, id: match.id, invoices: docs.length, numbers, create: null });
      continue;
    }
    const last = docs[docs.length - 1];
    const contact = contactByReg.get(g.regDigits) ?? [...names].map((n) => contactByName.get(n)).find(Boolean);
    const lb = last.inv.buyer;
    plan.receivers.push({
      key,
      how: "new",
      id: null,
      invoices: docs.length,
      numbers,
      create: {
        kind: receiverKindOf(lb.name, lb.regCode, contact ? contact.person : null),
        legalName: cut(lb.name, 160),
        regCode: lb.regCode.slice(0, 20),
        vatNumber: (lb.vatNumber || contact?.vatNumber || "").replace(/\s/g, "").toUpperCase().slice(0, 20),
        address: cut(lb.address || contact?.address || "", 300),
        email: (lb.email || contact?.email || "").toLowerCase().slice(0, 254),
        vatMode: docs.every((d) => d.inv.vatCents === 0) ? "none" : "vat",
        termsDays: Math.min(120, Math.max(0, daysBetween(last.inv.issuedOn, last.inv.dueOn))),
        locale: localeOf(last.doc.language || contact?.locale || "et"),
      },
    });
  }

  // the number series: what Renat set as Isolta's last number, against the highest one imported
  const year = Number(today.slice(0, 4));
  for (const issuer of issuers) {
    const use = issuerUse.get(issuer.id);
    const nums = [...plan.insert.filter((i) => i.issuerId === issuer.id), ...imported.filter((i) => i.issuer_id === issuer.id)].map((i) => numeric(i.number)).filter((n): n is number => n != null);
    if (!use && !nums.length) continue;
    const [c] = await q<{ last: number }>("select last from invoice_counters where issuer_id = $1 and year = $2 and not test", [issuer.id, issuer.yearly ? year : 0]);
    plan.issuers.push({ id: issuer.id, isDefault: issuer.is_default, byReg: use?.byReg ?? 0, byDefault: use?.byDefault ?? 0, counterLast: c ? c.last : null, maxNumber: nums.length ? Math.max(...nums) : null });
  }
  return plan;
}

/* ---------- writing ---------- */

export type IsoltaResult = { receiversCreated: number; invoices: number; credits: number; lines: number; raced: number };

const ACTOR = "isolta-import";

/**
 * Write a plan in the caller's transaction: the receivers to make, then the
 * invoices (credits after what they credit), their lines and one audit row
 * each («import»: the invoice's «Импортирован из Isolta»). A row that is
 * there already (another run at the same time) is left alone.
 */
export async function applyIsoltaImport(tx: Querier, plan: IsoltaPlan, actor = ACTOR): Promise<IsoltaResult> {
  const out: IsoltaResult = { receiversCreated: 0, invoices: 0, credits: 0, lines: 0, raced: 0 };
  const receiverId = new Map<string, string>();
  for (const r of plan.receivers) {
    if (r.id) {
      receiverId.set(r.key, r.id);
      continue;
    }
    const c = r.create!;
    const [row] = await tx<{ id: string }>(
      `insert into invoice_receivers (business_id, kind, legal_name, reg_code, vat_number, address, email, vat_mode, terms_days, locale, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false) returning id`,
      [plan.businessId, c.kind, c.legalName, c.regCode, c.vatNumber, c.address, c.email, c.vatMode, c.termsDays, c.locale],
    );
    receiverId.set(r.key, row.id);
    out.receiversCreated++;
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice_receiver', $2, 'create', $3::jsonb)`, [actor, row.id, JSON.stringify({ source: "isolta", kind: c.kind, active: false, invoices: r.invoices })]);
  }

  const idByRef = new Map<string, string>();
  const ordered = [...plan.insert.filter((i) => i.kind === "invoice"), ...plan.insert.filter((i) => i.kind === "credit")];
  for (const inv of ordered) {
    const rid = receiverId.get(inv.receiverKey);
    if (!rid) throw new Error(`isolta import: no receiver for invoice ${inv.number}`);
    const creditOf = inv.kind === "credit" ? (inv.creditOfRef ? idByRef.get(inv.creditOfRef) : inv.creditOfId) : null;
    if (inv.kind === "credit" && !creditOf) throw new Error(`isolta import: credit invoice ${inv.number} lost its original`);
    const paidAt = inv.paidOn ? new Date(zonedToUtc(inv.paidOn, "12:00", plan.timezone)) : null;
    const [row] = await tx<{ id: string }>(
      `insert into invoices (business_id, issuer_id, receiver_id, staff_id, kind, credit_of, status, number, period_from, period_to, issued_on, due_on,
                             seller, buyer, locale, net_cents, vat_cents, gross_cents, note, paid_at, free, source, source_ref)
       values ($1, $2, $3, null, $4, $5, $6, $7, $8::date, $8::date, $8::date, $9::date, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, true, 'isolta', $18)
       on conflict (business_id, source, source_ref) where source_ref is not null do nothing
       returning id`,
      [
        plan.businessId,
        inv.issuerId,
        rid,
        inv.kind,
        creditOf ?? null,
        inv.kind === "invoice" && paidAt ? "paid" : "issued",
        inv.number,
        inv.issuedOn,
        inv.kind === "credit" ? inv.issuedOn : inv.dueOn,
        JSON.stringify(inv.seller),
        JSON.stringify(inv.buyer),
        inv.locale,
        inv.netCents,
        inv.vatCents,
        inv.grossCents,
        inv.note,
        paidAt,
        inv.ref,
      ],
    );
    if (!row) {
      out.raced++;
      continue;
    }
    idByRef.set(inv.ref, row.id);
    for (const [i, l] of inv.lines.entries()) {
      await tx(
        `insert into invoice_lines (invoice_id, position, kind, text, qty, unit_cents, discount_cents, vat_bp, gross_cents, net_cents, vat_cents)
         values ($1, $2, 'other', $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, i, l.text, l.qty, l.unitCents, l.discountCents, l.vatBp, l.grossCents, l.netCents, l.vatCents],
      );
      out.lines++;
    }
    if (creditOf) {
      await tx("update invoices set status = 'credited', updated_at = now() where id = $1 and status in ('issued', 'paid')", [creditOf]);
      out.credits++;
    }
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice', $2, 'import', $3::jsonb)`, [actor, row.id, JSON.stringify({ source: "isolta", ref: inv.ref, number: inv.number })]);
    out.invoices++;
  }
  return out;
}

/* ---------- the report ---------- */

const SKIP_WORDS: Record<SkipWhy, string> = {
  draft: "a draft (modificationState «Draft»)",
  no_number: "never numbered: a draft",
  no_finvoice: "no Finvoice file in the export",
  bad_finvoice: "the Finvoice file could not be read",
  number_mismatch: "the Finvoice number is not the CSV's",
  currency: "not in euros",
  no_date: "no invoice date",
  no_receiver: "no receiver's name",
  duplicate_number: "the same number as another Isolta invoice",
  number_taken: "the number is one of our own invoices already",
  credit_unlinked: "a credit invoice whose original is not found",
  credit_twice: "a second credit invoice for the same original",
};

const WARN_WORDS: Record<WarnWhy, string> = {
  csv_totals: "the CSV's totals differ from the Finvoice file's (the file's are kept)",
  line_totals: "the rows do not add up to the invoice's total (both kept as Isolta printed them)",
  no_rows: "no priced row: one line with the invoice's total",
  no_text: "a row with no text: stored as «—»",
  text_cut: "a row's text was longer than 200 characters: cut",
  fractional_qty: "a quantity that is not a whole number: stored as 1 × the row's sum",
  unknown_state: "an unknown modificationState: imported as issued",
  ambiguous_name: "several of our receivers have this name: a new one is made",
  issuer_default: "the seller's registry code is none of our issuers': the default issuer",
};

const euros = (cents: number) => `${amountText(cents).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
const invoices = (n: number) => `${n} ${n === 1 ? "invoice" : "invoices"}`;

/** «1–5, 7, 9–12»: Isolta numbers, never names. */
export function numberRanges(numbers: string[]): string {
  const nums = [...new Set(numbers.map(numeric).filter((n): n is number => n != null))].sort((a, b) => a - b);
  const other = numbers.filter((n) => numeric(n) == null);
  const parts: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
    i = j;
  }
  return [...parts, ...other].join(", ");
}

/** The lines to print: counts, years, sums and Isolta numbers; never a client's name, a code, an address or an account. */
export function isoltaReport(plan: IsoltaPlan, result: IsoltaResult | null): string[] {
  const out: string[] = [];
  out.push(result ? "ISOLTA IMPORT: written." : "ISOLTA IMPORT, DRY RUN: nothing was written.");
  out.push(`Read: invoices.csv ${plan.read.rows} rows, ${plan.read.finvoices} Finvoice files, contacts.csv ${plan.read.contacts} contacts.`);
  for (const p of plan.problems) out.push(`  problem: ${p}`);

  const drafts = plan.skipped.filter((s) => s.why === "draft" || s.why === "no_number");
  out.push(`Drafts, not imported: ${drafts.length} (${plan.skipped.filter((s) => s.why === "no_number").length} never numbered, ${plan.skipped.filter((s) => s.why === "draft").length} marked «Draft»).`);
  out.push(`Already in the database (same Isolta id), left as they are: ${plan.existing.length}.`);

  const credits = plan.insert.filter((i) => i.kind === "credit");
  const total = plan.insert.reduce((s, i) => s + i.grossCents, 0);
  out.push(`${result ? "Imported" : "To import"}: ${invoices(plan.insert.length)} (${credits.length} of them credit invoices), ${euros(total)} with VAT, ${euros(plan.insert.reduce((s, i) => s + i.vatCents, 0))} of it VAT.`);
  const years = new Map<string, { n: number; gross: number }>();
  for (const i of plan.insert) {
    const y = years.get(i.issuedOn.slice(0, 4)) ?? { n: 0, gross: 0 };
    y.n++;
    y.gross += i.grossCents;
    years.set(i.issuedOn.slice(0, 4), y);
  }
  for (const [y, v] of [...years].sort()) out.push(`  ${y}: ${invoices(v.n)}, ${euros(v.gross)}`);
  if (plan.insert.length) out.push(`  Isolta numbers: ${numberRanges(plan.insert.map((i) => i.number))}`);
  const states = new Map<string, number>();
  for (const i of plan.insert) states.set(i.state, (states.get(i.state) ?? 0) + 1);
  if (states.size) out.push(`  by Isolta's state: ${[...states].map(([s, n]) => `${s} ${n}`).join(", ")}`);
  const credited = plan.insert.filter((i) => plan.insert.some((c) => c.creditOfRef === i.ref)).length;
  const paid = plan.insert.filter((i) => i.kind === "invoice" && i.paidOn && !plan.insert.some((c) => c.creditOfRef === i.ref)).length;
  const overdue = plan.insert.filter((i) => i.kind === "invoice" && !i.paidOn && i.dueOn < plan.today && !plan.insert.some((c) => c.creditOfRef === i.ref)).length;
  const notDue = plan.insert.length - credits.length - credited - paid - overdue;
  out.push(`  in our list: ${overdue} «просрочен» (issued, past due, no payment in Isolta), ${notDue} not due yet, ${paid} paid, ${credited} credited, ${credits.length} credit invoices.`);

  const by = (how: PlannedReceiver["how"]) => plan.receivers.filter((r) => r.how === how);
  out.push(`Receivers: ${plan.receivers.length}; ${by("reg").length} ours by registry code, ${by("name").length} ours by name, ${by("new").length} ${result ? "made" : "to make"} (switched off).`);
  for (const r of plan.receivers) {
    const kind = r.create ? { person: "private person", fie: "FIE", ou: "company" }[r.create.kind] : "";
    const what = r.create ? `new ${kind}${r.create.regCode ? " with a registry code" : ", no registry code"}` : `ours, by ${r.how === "reg" ? "registry code" : "name"}`;
    out.push(`  ${what}: ${invoices(r.invoices)}, Isolta numbers ${numberRanges(r.numbers)}`);
  }

  plan.issuers.forEach((i, n) => {
    out.push(`Issuer ${n + 1}${i.isDefault ? " (default)" : ""}: ${invoices(i.byReg)} by the seller's registry code, ${i.byDefault} as the default.`);
    const last = i.counterLast ?? 0;
    if (i.maxNumber == null) out.push("  no numeric Isolta number to compare with the series.");
    else if (last === i.maxNumber) out.push(`  «Последний номер Isolta» is ${last}, the highest imported number is ${i.maxNumber}: they agree. Our next number is ${last + 1}.`);
    else
      out.push(
        `  «Последний номер Isolta» is ${i.counterLast == null ? "not set" : last}, the highest imported number is ${i.maxNumber}: they DISAGREE. The import does not change it; ${last < i.maxNumber ? `set it to ${i.maxNumber} in «Счета» → «Настройки», or our next number repeats an Isolta one` : "our series is past Isolta's already"}.`,
      );
  });

  const warnCount = new Map<WarnWhy, string[]>();
  for (const w of plan.warnings) warnCount.set(w.why, [...(warnCount.get(w.why) ?? []), w.number]);
  if (warnCount.size) out.push("Warnings (imported):");
  for (const [why, nums] of warnCount) out.push(`  ${WARN_WORDS[why]}: ${nums.length} (Isolta numbers ${numberRanges(nums)})`);

  const problems = plan.skipped.filter((s) => s.why !== "draft" && s.why !== "no_number");
  if (problems.length) out.push("Not imported:");
  for (const s of problems) out.push(`  Isolta id ${s.ref}, number ${s.number || "none"}: ${SKIP_WORDS[s.why]}${s.why === "bad_finvoice" && s.detail ? ` (${s.detail})` : s.why.startsWith("credit") && s.detail ? ` (original ${s.detail})` : ""}`);

  if (result) out.push(`Written: ${result.invoices} invoices (${result.credits} credits linked), ${result.lines} lines, ${result.receiversCreated} receivers made${result.raced ? `, ${result.raced} already there from a run at the same time` : ""}.`);
  return out;
}
